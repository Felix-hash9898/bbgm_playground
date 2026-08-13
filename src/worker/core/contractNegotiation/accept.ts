import { player, team } from "../index.ts";
import cancel from "./cancel.ts";
import { idb } from "../../db/index.ts";
import {
	g,
	helpers,
	toUI,
	recomputeLocalUITeamOvrs,
} from "../../util/index.ts";
import type { PlayerContract } from "../../../common/types.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import {
	getContractException,
	getMaxContractForPlayer,
} from "../contracts/contractLimits.ts";
import {
	canOfferTwoWay,
	canTeamAddTwoWay,
	getTwoWayContractAmount,
	isStandardContract,
} from "../contracts/contractTwoWay.ts";
import {
	getMinContractForPlayer,
	withContractCapHitForPlayer,
} from "../contracts/contractMinimum.ts";
import {
	getMidLevelExceptionAmount,
	getMidLevelExceptionMaxContractLength,
} from "../contracts/contractMidLevel.ts";
import {
	canContractHaveOption,
	getEffectiveOfferAmount,
} from "../contracts/contractOption.ts";
import {
	captureSigningContext,
	isCapturedContextActive,
} from "../capturedContext.ts";
import { applySigningTransaction } from "../signingTransaction.ts";

/**
 * Accept the player's offer.
 *
 * If successful, then the team's current roster will be displayed.
 *
 * @memberOf core.contractNegotiation
 * @param {number} pid An integer that must correspond with the player ID of a player in an ongoing negotiation.
 * @return {Promise.<string=>} If an error occurs, resolves to a string error message.
 */
const accepting = new WeakMap<typeof idb.cache, Set<number>>();

const acceptUnsafe = async ({
	pid,
	amount,
	exp,
	type,
	option,
	dryRun,
}: {
	pid: number;
	amount: number;
	exp: number;
	type?: PlayerContract["type"];
	option?: PlayerContract["option"];
	dryRun?: boolean;
}) => {
	const context = captureSigningContext();
	const negotiation = await context.cache.negotiations.get(pid);

	if (!negotiation) {
		return `No negotiation with player ${pid} found.`;
	}

	const p = await context.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}

	const contractType = type ?? "standard";
	const isTwoWay = contractType === "twoWay";
	const amountActual = isTwoWay ? getTwoWayContractAmount() : amount;
	const maxContract = getMaxContractForPlayer(p);
	// This error is for sanity checking in multi team mode. Need to check for existence of negotiation.tid because it
	// wasn't there originally and I didn't write upgrade code. Can safely get rid of it later.
	if (negotiation.tid !== undefined && negotiation.tid !== context.userTid) {
		return `This negotiation was started by the ${
			g.get("teamInfoCache")[negotiation.tid]?.region
		} ${g.get("teamInfoCache")[negotiation.tid]?.name} but you are the ${
			g.get("teamInfoCache")[g.get("userTid")]?.region
		} ${
			g.get("teamInfoCache")[g.get("userTid")]?.name
		}. Either switch teams or cancel this negotiation.`;
	}

	if (isTwoWay) {
		const players = await context.cache.players.indexGetAll(
			"playersByTid",
			context.userTid,
		);
		if (!canOfferTwoWay(p)) {
			return "This player is not eligible for a two-way contract.";
		}
		if (!canTeamAddTwoWay(players, g.get("userTid"))) {
			return "Your team already has the maximum number of two-way contracts.";
		}
	} else if (amountActual > maxContract) {
		return "You cannot offer this player a contract higher than their maximum salary.";
	} else if (amountActual < getMinContractForPlayer(p)) {
		return "You cannot offer this player a contract lower than their minimum salary.";
	}

	const salaryCapType = context.salaryCapType;
	const contract: PlayerContract = {
		amount: amountActual,
		exp,
	};
	if (isTwoWay) {
		contract.type = "twoWay";
	}
	if (option !== undefined) {
		contract.option = option;
		if (
			!canContractHaveOption({
				...contract,
				rookie: p.contract.rookie,
			})
		) {
			return "This contract is not eligible for a player or team option.";
		}
	}
	const contractWithCapHit = withContractCapHitForPlayer(p, contract);
	const userTeam = await context.cache.teams.get(context.userTid);
	let expectedContractException:
		| "capSpace"
		| "bird"
		| "minimum"
		| "midLevel"
		| undefined;

	if (salaryCapType !== "none" && !isTwoWay) {
		const payroll = await team.getPayroll(
			context.userTid,
			undefined,
			context.cache,
		);
		const birdException = negotiation.resigning && salaryCapType === "soft";
		const contractException = getContractException({
			birdException,
			contract: contractWithCapHit,
			p,
			payroll,
			team: userTeam,
		});

		if (contractException.type === undefined) {
			if (contractException.midLevelFailureReason === "amount") {
				return `You cannot go over the salary cap to sign free agents to contracts higher than the Mid-Level Exception (${helpers.formatCurrency(
					getMidLevelExceptionAmount() / 1000,
					"M",
				)}).`;
			}
			if (contractException.midLevelFailureReason === "length") {
				return `You cannot use the Mid-Level Exception on a contract longer than ${getMidLevelExceptionMaxContractLength()} years.`;
			}
			if (contractException.midLevelFailureReason === "used") {
				return "You have already used your Mid-Level Exception this season.";
			}

			return `You cannot go over the salary cap to sign ${
				salaryCapType === "hard" ? "players" : "free agents"
			} to contracts higher than the minimum salary.`;
		}
		expectedContractException = contractException.type;

		if (contractException.type === "midLevel") {
			contractWithCapHit.exception = "midLevel";
		}
	}

	// Make sure the user didn't do something in another tab to change the willingness to negotiate, such as trading away players
	const mood = await player.moodInfo(p, context.userTid);
	if (!mood.willing) {
		return "Player is no longer willing to negotiate.";
	}
	if (
		!isTwoWay &&
		getEffectiveOfferAmount(amountActual, option) + 1 < mood.contractAmount
	) {
		return "Player will not accept this contract.";
	}

	if (p.contract.rookie && context.phase === PHASE.RESIGN_PLAYERS) {
		// Not sure if the phase condition is necessary. The purpose of this is for hard cap rookies with rookie contract scale.
		contractWithCapHit.rookie = true;
	}

	if (!dryRun) {
		if (!isCapturedContextActive(context)) {
			throw new Error("Signing league context changed during validation");
		}

		const teamForTransaction = userTeam
			? helpers.deepCopy(userTeam)
			: undefined;
		if (contractWithCapHit.exception === "midLevel" && teamForTransaction) {
			teamForTransaction.midLevelExceptionUsedSeason = context.mleSeason;
		}

		const { player: signedPlayer, coreSigningSucceeded } =
			await applySigningTransaction({
				context,
				player: p,
				tid: context.userTid,
				contract: contractWithCapHit,
				phase: context.phase,
				team:
					contractWithCapHit.exception === "midLevel"
						? teamForTransaction
						: undefined,
				negotiation,
				durability: "immediate",
				exceptionValidator:
					expectedContractException === undefined
						? undefined
						: {
								expected: expectedContractException,
								validate: async ({
									player: currentPlayer,
									negotiation: currentNegotiation,
								}) => {
									const currentTeam = await context.cache.teams.get(
										context.userTid,
									);
									const payroll = await team.getPayroll(
										context.userTid,
										undefined,
										context.cache,
									);
									return getContractException({
										birdException:
											currentNegotiation?.resigning === true &&
											context.salaryCapType === "soft",
										contract: withContractCapHitForPlayer(
											currentPlayer,
											contract,
										),
										p: currentPlayer,
										payroll,
										team: currentTeam,
									}).type;
								},
							},
				revalidate: async ({
					player: currentPlayer,
					negotiation: currentNegotiation,
				}) => {
					if (!currentNegotiation) {
						throw new Error("Contract negotiation is no longer available");
					}
					const currentTeam = await context.cache.teams.get(context.userTid);
					if (!currentTeam) {
						throw new Error("Signing team is no longer available");
					}
					const currentRoster = await context.cache.players.indexGetAll(
						"playersByTid",
						context.userTid,
					);
					if (isTwoWay) {
						if (
							!canOfferTwoWay(currentPlayer) ||
							!canTeamAddTwoWay(currentRoster, context.userTid)
						) {
							throw new Error("Two-way roster slot is no longer available");
						}
					} else if (
						!currentNegotiation.resigning &&
						(currentPlayer.tid === PLAYER.FREE_AGENT ||
							currentPlayer.tid === PLAYER.UNDRAFTED)
					) {
						const standardRosterSize = currentRoster.filter((rosterPlayer) =>
							isStandardContract(rosterPlayer.contract),
						).length;
						if (standardRosterSize >= context.maxRosterSize) {
							throw new Error("Team roster limit is no longer available");
						}
					}
				},
			});
		if (!coreSigningSucceeded) {
			throw new Error("Signing transaction did not report durable success");
		}

		// The core transaction is durable at this point. Roster sorting and UI
		// refresh are derived work and must not make the signing look like a
		// failure if they reject.
		try {
			await cancel(pid, context, true);

			// Use the player returned by the transaction. The pre-signing p still has
			// the old tid, which is wrong for new-player/keepRosterSorted decisions.
			const t = await context.cache.teams.get(signedPlayer.tid);
			const onlyNewPlayers = t ? !t.keepRosterSorted : false;
			await team.rosterAutoSort(
				signedPlayer.tid,
				onlyNewPlayers,
				undefined,
				context,
			);
			await context.cache.flush(["players", "teams"], {
				league: context.leagueDB,
				updateLastPlayed: false,
				records: {
					players: [signedPlayer.pid],
					teams: [signedPlayer.tid],
				},
			});

			if (isCapturedContextActive(context)) {
				await toUI("realtimeUpdate", [["playerMovement"]]);
				await recomputeLocalUITeamOvrs();
			}
		} catch (error) {
			console.warn(
				"Core signing succeeded; post-signing roster/UI refresh failed",
				error,
			);
		}
	}
};

const accept = async (params: Parameters<typeof acceptUnsafe>[0]) => {
	if (params.dryRun) {
		return acceptUnsafe(params);
	}

	const cache = idb.cache;
	let acceptingForCache = accepting.get(cache);
	if (!acceptingForCache) {
		acceptingForCache = new Set();
		accepting.set(cache, acceptingForCache);
	}
	if (acceptingForCache.has(params.pid)) {
		return `Contract negotiation for player ${params.pid} is already being processed.`;
	}

	acceptingForCache.add(params.pid);
	try {
		return await acceptUnsafe(params);
	} finally {
		acceptingForCache.delete(params.pid);
	}
};

export default accept;
