import { PHASE, isSport } from "../../common/index.ts";
import { contractNegotiation, player, team } from "../core/index.ts";
import {
	getContractException,
	getMaxContractForPlayerAndTerm,
	clampContractAmountForPlayer,
	hasDesignatedVeteranContractRights,
} from "../core/contracts/contractLimits.ts";
import {
	canOfferTwoWay,
	canTeamAddTwoWay,
	makeTwoWayContract,
} from "../core/contracts/contractTwoWay.ts";
import {
	getMinimumSalaryCapHitForPlayer,
	getMinContractForPlayer,
	withContractCapHitForPlayer,
} from "../core/contracts/contractMinimum.ts";
import {
	getMidLevelExceptionAmount,
	isMidLevelExceptionAvailable,
} from "../core/contracts/contractMidLevel.ts";
import { getBasketballContractMarketDemand } from "../core/contracts/contractMarket/index.ts";
import {
	getBasketballContractTerm,
	getBasketballMechanismMaxContractLength,
	getContractYearsFromExpiration,
} from "../core/contracts/contractTerm.ts";
import {
	getTermAdjustedContractOffer,
	getIncumbentInjuredAsk,
} from "../core/contracts/contractMarket/injuryAdjustment.ts";
import {
	canContractHaveOption,
	getRealAmountForEffectiveOffer,
	isPlayerOptionInjuryHorizonSafe,
} from "../core/contracts/contractOption.ts";
import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import type {
	ViewInput,
	PlayerContract,
	UpdateEvents,
	Team,
	Player,
} from "../../common/types.ts";
import { range } from "../../common/utils.ts";

type ContractExceptionType =
	| NonNullable<ReturnType<typeof getContractException>["type"]>
	| "twoWay";

const getContractExceptionType = ({
	birdException,
	contract,
	p,
	payroll,
	team,
}: {
	birdException: boolean;
	contract: PlayerContract;
	p: Player;
	payroll: number;
	team: Pick<Team, "midLevelExceptionUsedSeason" | "tid"> | undefined;
}): ContractExceptionType | undefined => {
	if (contract.type === "twoWay") {
		return "twoWay";
	}

	const contractExceptionType = getContractException({
		birdException,
		contract: withContractCapHitForPlayer(p, contract),
		p,
		payroll,
		team,
	}).type;

	if (birdException && contractExceptionType === "midLevel") {
		return "bird";
	}

	return contractExceptionType;
};

const generateContractOptions = async (
	pid: number,
	contract: PlayerContract,
	ovr: number,
	p: Player,
	playerMinimum: number,
	payroll: number,
	userTeam: Pick<Team, "midLevelExceptionUsedSeason" | "tid"> | undefined,
	birdException: boolean,
	resigning: boolean,
) => {
	let growthFactor = 0.15;

	// Modulate contract amounts based on last digit of ovr (add some deterministic noise)
	growthFactor += (ovr % 10) * 0.01 - 0.05;
	let exp = g.get("season");

	if (g.get("phase") <= PHASE.AFTER_TRADE_DEADLINE) {
		exp -= 1;
	}
	let found: number | undefined;

	const allowedLengths = range(
		g.get("minContractLength"),
		g.get("maxContractLength") + 1,
	);

	const contractOptions: {
		exp: number;
		years: number;
		amount: number;
		smallestAmount: boolean;
		type?: PlayerContract["type"];
		option?: PlayerContract["option"];
		contractExceptionType?: ContractExceptionType;
		disabledReason?: string;
		healthyAmount?: number;
	}[] = allowedLengths.map((contractLength, i) => {
		const contractOption = {
			exp: exp + contractLength,
			years: contractLength,
			amount: 0,
			healthyAmount: undefined as number | undefined,
			smallestAmount: false,
		};

		if (contractOption.exp === contract.exp) {
			contractOption.amount = contract.amount;
			contractOption.smallestAmount = true;
			found = i;
		}

		return contractOption;
	});

	if (found === undefined) {
		contractOptions[0]!.amount = contract.amount;
		contractOptions[0]!.smallestAmount = true;
		found = 0;
	}

	// From the desired contract, ask for more money for less or more years
	const referenceTermYears = contractOptions[found]!.years;
	const referenceRawAmount = isSport("basketball")
		? getBasketballContractMarketDemand(p, referenceTermYears, userTeam?.tid)
				.rawAmount
		: 0;
	const rawAmountByYears = new Map<number, number>([
		[referenceTermYears, referenceRawAmount],
	]);
	for (const [i, contractOption] of contractOptions.entries()) {
		const factor = 1 + Math.abs(found - i) * growthFactor;
		if (isSport("basketball")) {
			let offeredRawAmount = rawAmountByYears.get(contractOption.years);
			if (offeredRawAmount === undefined) {
				offeredRawAmount = getBasketballContractMarketDemand(
					p,
					contractOption.years,
					userTeam?.tid,
				).rawAmount;
				rawAmountByYears.set(contractOption.years, offeredRawAmount);
			}
			if (resigning) {
				// Price the term-specific healthy V4 anchor with the user's existing
				// mood logic before PO/TO economics and the row-specific injury adjustment.
				const rowV4PointAmount = getBasketballContractMarketDemand(
					p,
					contractOption.years,
					userTeam?.tid,
				).pointAmount;
				const rowHealthyV4 = clampContractAmountForPlayer(
					p,
					helpers.roundContract(
						Math.max(playerMinimum, rowV4PointAmount * factor),
					),
					userTeam?.tid,
					contractOption.years,
				);
				const rowMood = await player.moodInfo(p, g.get("userTid"), {
					contractAmount: rowHealthyV4,
					contractYears: contractOption.years,
				});
				const rowHealthyH = rowMood.contractAmount;
				contractOption.healthyAmount = rowHealthyH;
				contractOption.amount =
					getIncumbentInjuredAsk({
						p,
						healthyH: rowHealthyH,
						contractYears: contractOption.years,
					}) / 1000;
			} else if (!resigning) {
				contractOption.amount =
					getTermAdjustedContractOffer({
						baseOfferAmount: contractOptions[found]!.amount * 1000,
						referenceRawAmount,
						offeredRawAmount,
						factor,
						minimumAmount: playerMinimum,
					}) / 1000;
				if (
					g.get("salaryCapType") === "soft" &&
					contractOption.years === 5 &&
					hasDesignatedVeteranContractRights(
						p,
						userTeam?.tid ?? g.get("userTid"),
					)
				) {
					contractOption.amount =
						clampContractAmountForPlayer(
							p,
							contractOption.amount * 1000,
							userTeam?.tid ?? g.get("userTid"),
							contractOption.years,
						) / 1000;
				}
			}
		} else {
			contractOption.amount = contractOptions[found]!.amount * factor;
			contractOption.amount =
				helpers.roundContract(contractOption.amount * 1000) / 1000;
		}
	}

	const possible = contractOptions.filter((contractOption) => {
		if (contractOption.smallestAmount) {
			return true;
		}

		if (
			g.get("challengeNoFreeAgents") &&
			g.get("phase") !== PHASE.RESIGN_PLAYERS &&
			contractOption.amount * 1000 > playerMinimum
		) {
			return false;
		}

		return (
			contractOption.amount * 1000 <=
			(isSport("basketball")
				? getMaxContractForPlayerAndTerm(
						p,
						userTeam?.tid ?? g.get("userTid"),
						contractOption.years,
					)
				: g.get("maxContract"))
		);
	});

	const possibleWithOptions = [];
	for (const contractOption of possible) {
		possibleWithOptions.push(contractOption);

		const contractForOption = {
			amount: Math.round(contractOption.amount * 1000),
			exp: contractOption.exp,
			rookie: contract.rookie,
		};
		if (canContractHaveOption(contractForOption)) {
			for (const option of ["player", "team"] as const) {
				if (
					option === "player" &&
					!isPlayerOptionInjuryHorizonSafe(p, contractForOption)
				) {
					continue;
				}

				let finalAmountOption;
				if (
					isSport("basketball") &&
					resigning &&
					contractOption.healthyAmount !== undefined
				) {
					const healthyHOption = getRealAmountForEffectiveOffer(
						contractOption.healthyAmount,
						option,
					);
					finalAmountOption = getIncumbentInjuredAsk({
						p,
						healthyH: healthyHOption,
						contractYears: contractOption.years,
					});
				} else {
					finalAmountOption = getRealAmountForEffectiveOffer(
						contractForOption.amount,
						option,
					);
				}

				if (
					isSport("basketball") &&
					finalAmountOption >
						getMaxContractForPlayerAndTerm(
							p,
							userTeam?.tid ?? g.get("userTid"),
							contractOption.years,
							option,
						)
				) {
					continue;
				}
				possibleWithOptions.push({
					...contractOption,
					amount: finalAmountOption / 1000,
					option,
					smallestAmount: false,
				});
			}
		}
	}
	for (const row of possibleWithOptions) {
		const disabledReason = await contractNegotiation.accept({
			pid,
			amount: Math.round(row.amount * 1000),
			exp: row.exp,
			type: row.type,
			option: row.option,
			dryRun: true,
		});
		if (disabledReason !== undefined) {
			row.disabledReason = disabledReason;
		} else {
			row.contractExceptionType = getContractExceptionType({
				birdException,
				contract: {
					amount: Math.round(row.amount * 1000),
					exp: row.exp,
					type: row.type,
					option: row.option,
				},
				p,
				payroll,
				team: userTeam,
			});
		}
	}

	return possibleWithOptions;
};

const updateNegotiation = async (
	inputs: ViewInput<"negotiation">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		!state.p ||
		(state.p && inputs.pid !== state.p.pid) ||
		updateEvents.includes("gameSim") ||
		updateEvents.includes("newPhase")
	) {
		const userTid = g.get("userTid");

		const negotiations = await idb.cache.negotiations.getAll();
		let negotiation;

		if (inputs.pid === undefined) {
			negotiation = negotiations[0];
		} else {
			negotiation = negotiations.find((neg) => neg.pid === inputs.pid);
		}

		if (!negotiation) {
			// https://stackoverflow.com/a/59923262/786644
			const returnValue = {
				errorMessage: "No negotiation with player in progress.",
			};
			return returnValue;
		}

		const p2 = await idb.cache.players.get(negotiation.pid);
		let p;
		if (p2) {
			p = await idb.getCopy.playersPlus(p2, {
				attrs: ["pid", "name", "age", "contract", "face", "imgURL", "watch"],
				ratings: ["ovr", "pot"],
				season: g.get("season"),
				showNoStats: true,
				showRookies: true,
				fuzz: true,
			});
		}

		// This can happen if a negotiation is somehow started with a retired player, or a player was deleted
		if (!p || !p2) {
			contractNegotiation.cancel(negotiation.pid);
			// https://stackoverflow.com/a/59923262/786644
			const returnValue = {
				errorMessage: "Invalid negotiation. Please try again.",
			};
			return returnValue;
		}

		p.mood = await player.moodInfos(p2);
		const payroll = await team.getPayroll(userTid);
		const userTeam = await idb.cache.teams.get(userTid);
		const birdException =
			g.get("salaryCapType") === "soft" &&
			(negotiation.resigning ||
				hasDesignatedVeteranContractRights(p2, userTid));
		const demandMechanism = birdException ? "bird" : "capSpace";
		const cachedYears = getContractYearsFromExpiration({
			expiration: p.contract.exp,
		});
		const demandExpiration =
			isSport("basketball") &&
			g.get("salaryCapType") !== "none" &&
			!negotiation.resigning &&
			cachedYears > getBasketballMechanismMaxContractLength(demandMechanism)
				? (getBasketballContractTerm(p2, {
						teamTid: userTid,
						mechanism: demandMechanism,
					})?.expiration ?? p.contract.exp)
				: p.contract.exp;

		const contractOptions = await generateContractOptions(
			negotiation.pid,
			{
				amount: p.mood.user.contractAmount / 1000,
				exp: demandExpiration,
			},
			p.ratings.ovr,
			p2,
			getMinContractForPlayer(p2),
			payroll,
			userTeam,
			birdException,
			negotiation.resigning,
		);
		if (!negotiation.resigning && canOfferTwoWay(p2)) {
			const players = await idb.cache.players.indexGetAll(
				"playersByTid",
				userTid,
			);
			const twoWayContract = makeTwoWayContract();
			const twoWayOption = {
				exp: twoWayContract.exp,
				years: 1,
				amount: twoWayContract.amount / 1000,
				smallestAmount: false,
				type: twoWayContract.type,
				contractExceptionType: "twoWay" as const,
				disabledReason: canTeamAddTwoWay(players, userTid)
					? undefined
					: "Your team already has the maximum number of two-way contracts.",
			};
			contractOptions.unshift(twoWayOption);
		}
		if (
			contractOptions.length === 0 &&
			g.get("phase") === PHASE.RESIGN_PLAYERS
		) {
			const t = await idb.cache.teams.get(userTid);
			if (
				t &&
				t.firstSeasonAfterExpansion !== undefined &&
				t.firstSeasonAfterExpansion - 1 === g.get("season")
			) {
				contractOptions.push({
					exp: g.get("season") + 1,
					years: 1,
					amount: p.mood.user.contractAmount / 1000,
					smallestAmount: true,
					contractExceptionType: getContractExceptionType({
						birdException,
						contract: {
							amount: p.mood.user.contractAmount,
							exp: g.get("season") + 1,
						},
						p: p2,
						payroll,
						team: userTeam,
					}),
				});
			}
		}

		const playerMinimum = getMinContractForPlayer(p2) / 1000;
		const minimumCapHit =
			getMinimumSalaryCapHitForPlayer(p2, {
				exp:
					g.get("phase") <= PHASE.PLAYOFFS
						? g.get("season")
						: g.get("season") + 1,
			}) / 1000;
		const midLevelExceptionInfo =
			!negotiation.resigning &&
			isSport("basketball") &&
			g.get("salaryCapType") === "soft"
				? {
						midLevelExceptionAmount: getMidLevelExceptionAmount() / 1000,
						midLevelExceptionAvailable: isMidLevelExceptionAvailable(
							await idb.cache.teams.get(userTid),
						),
					}
				: undefined;
		const maxStructures = contractOptions.filter(
			(row) => row.type !== "twoWay",
		);
		const playerMaxAmount = Math.max(
			...(maxStructures.length > 0
				? maxStructures.map((row) =>
						getMaxContractForPlayerAndTerm(p2, userTid, row.years, row.option),
					)
				: [
						getMaxContractForPlayerAndTerm(
							p2,
							userTid,
							getContractYearsFromExpiration({ expiration: p.contract.exp }),
							p.contract.option,
						),
					]),
		);
		const maxSalaryInfo = isSport("basketball")
			? {
					minimumCapHit,
					maxSalaryTier:
						Math.round((playerMaxAmount / g.get("salaryCap")) * 10000) / 100,
					...midLevelExceptionInfo,
					playerMinimum,
					playerMaxContract: playerMaxAmount / 1000,
				}
			: undefined;

		const t = await idb.getCopy.teamsPlus({
			tid: g.get("userTid"),
			attrs: ["colors", "jersey"],
		});
		if (!t) {
			throw new Error("Should never happen");
		}

		return {
			capSpace: (g.get("salaryCap") - payroll) / 1000,
			challengeNoRatings: g.get("challengeNoRatings"),
			contractOptions,
			salaryCapType: g.get("salaryCapType"),
			payroll: payroll / 1000,
			p,
			phase: g.get("phase"),
			...maxSalaryInfo,
			resigning: negotiation.resigning,
			salaryCap: g.get("salaryCap") / 1000,
			t,
		};
	}
};

export default updateNegotiation;
