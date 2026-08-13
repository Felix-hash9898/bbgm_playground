import { PLAYER, PHASE, bySport, isSport } from "../../../common/index.ts";
import type { Player, PlayerContract } from "../../../common/types.ts";
import type { CapturedSigningContext } from "../capturedContext.ts";
import { orderBy } from "../../../common/utils.ts";
import { g, helpers, random } from "../../util/index.ts";
import {
	getMaxContract,
	getMaxContractForPlayer,
	getMinContract,
} from "../contracts/contractLimits.ts";
import {
	clampContractDemandForPlayer,
	getMaxContractDemandForPlayer,
} from "../contracts/contractLowEnd.ts";
import {
	getMinContractForPlayer,
	withContractCapHitForPlayer,
} from "../contracts/contractMinimum.ts";
import { getAIContractWithOption } from "../contracts/contractOption.ts";
import { getContractValue } from "../contracts/contractValue.ts";
import { draft, player } from "../index.ts";
import { TOO_MANY_TEAMS_TOO_SLOW } from "../season/getInitialNumGamesConfDivSettings.ts";

const TEMP = 0.35;
const LEARNING_RATE = 0.5;
const DEFAULT_ROUNDS = 60;

export type ContractDemandType =
	| "newLeague"
	| "freeAgentsOnly"
	| "includeExpiringContracts"
	| "dummyExpiringContracts";

export type ContractDemandTeam = {
	disabled?: boolean;
	payroll: number;
	tid: number;
};

export type ContractDemandResult = {
	contract: PlayerContract;
	rookie?: true;
};

const getExpiration = (
	p: Player,
	randomizeExp: boolean,
	nextSeason?: boolean,
	context?: CapturedSigningContext,
) => {
	const { ovr, pot } = p.ratings.at(-1);

	// pot is predictable via age+ovr with R^2=0.94, so skip it b/c wasn't in data
	const season = context?.season ?? g.get("season");
	const age = season - p.born.year;
	let years =
		1 +
		0.001629 * (age * age) -
		0.003661 * (age * ovr) +
		0.002178 * (ovr * ovr) +
		0 * pot;
	years = Math.round(years);

	// Randomize expiration for contracts generated at beginning of new game
	if (randomizeExp) {
		years = random.randInt(1, years);
		years = helpers.bound(
			years,
			1,
			context?.maxContractLength ?? g.get("maxContractLength"),
		);
	} else {
		years = helpers.bound(
			years,
			context?.minContractLength ?? g.get("minContractLength"),
			context?.maxContractLength ?? g.get("maxContractLength"),
		);
	}

	let offset = (context?.phase ?? g.get("phase")) <= PHASE.PLAYOFFS ? -1 : 0;
	if (nextSeason) {
		// Otherwise the season+phase combo appears off when setting contract expiration in newPhasePreseason
		offset -= 1;
	}

	return season + years + offset;
};

const stableSoftmax = (values: number[], param: number) => {
	let maxValue = -Infinity;
	for (const value of values) {
		if (value > maxValue) {
			maxValue = value;
		}
	}

	const numerators = Array(values.length);
	let denominator = 0;
	for (const [i, value] of values.entries()) {
		// Divide rather than subtract, because sometimes maxX was so large that this was getting rounded to 0
		numerators[i] = Math.exp((param * value) / maxValue);
		denominator += numerators[i];
	}

	if (maxValue === 0 || denominator === 0) {
		return numerators.map(() => 1);
	}
	return numerators.map((numerator) => numerator / denominator);
};

export const getContractDemandResults = ({
	type,
	playersAll,
	teams,
	pids,
	nextSeason,
	context,
}: {
	type: ContractDemandType;
	playersAll: Player[];
	teams: ContractDemandTeam[];
	pids?: number[];
	nextSeason?: boolean;
	context?: CapturedSigningContext;
}) => {
	if (pids && pids.length === 0) {
		return new Map<number, ContractDemandResult>();
	}

	// Higher means more unequal salaries
	const PARAM = bySport({
		baseball: 1,
		basketball: 0.5 * (type === "newLeague" ? 5 : 15),
		football: 1,
		hockey: 2.5,
	});

	const maxContract = getMaxContract();
	const minContract = getMinContract();
	const salaryCap = context?.salaryCap ?? g.get("salaryCap");
	const season = context?.season ?? g.get("season");
	const salaryCapType = context?.salaryCapType ?? g.get("salaryCapType");
	const numActiveTeams = context?.numActiveTeams ?? g.get("numActiveTeams");
	const maxRosterSize = context?.maxRosterSize ?? g.get("maxRosterSize");
	const phase = context?.phase ?? g.get("phase");
	const draftPickAutoContract =
		context?.draftPickAutoContract ?? g.get("draftPickAutoContract");

	let numRounds = DEFAULT_ROUNDS;

	// 0 for FBGM because we don't actually do bidding there, it had too much variance. Instead, use the old genContract formula. Same if minContract and maxContract are the same, no point in doing auction.
	if (
		bySport({
			baseball: true,
			basketball: false,
			football: true,

			// For hockey, we want the fast method (numRounds 0) for any in-season free agents created by releasing players. For basketball (due to fewer players) this optimization is not needed.
			hockey: type === "dummyExpiringContracts" && pids !== undefined,
		}) ||
		minContract === maxContract ||
		numActiveTeams >= TOO_MANY_TEAMS_TOO_SLOW
	) {
		numRounds = 0;
	}

	// Lower number results in higher bids (more players being selected, and therefore having increases) but seems to be too much in hypothetical FAs (everything except freeAgentsOnly) because we don't know that all these players are actually going to be available
	const NUM_BIDS_BEFORE_REMOVED = 2;

	let players;
	if (type === "newLeague") {
		players = playersAll;
	} else if (type === "freeAgentsOnly") {
		players = playersAll.filter((p) => p.tid === PLAYER.FREE_AGENT);
	} else {
		players = playersAll.filter(
			(p) => p.tid === PLAYER.FREE_AGENT || p.contract.exp === season,
		);
	}

	// Store contracts here, so they can be edited without editing player object (for including dummy players in pool)
	const playerInfos = players.map((p) => {
		let dummy = false;
		if (pids) {
			dummy = !pids.includes(p.pid);
		} else if (
			type === "dummyExpiringContracts" &&
			p.tid !== PLAYER.FREE_AGENT
		) {
			dummy = true;
		}

		const marketValue = getContractValue(p);
		const valueExponent = isSport("basketball") ? 1.4 : 2;

		return {
			pid: p.pid,
			dummy,
			value:
				(marketValue < 0 ? -1 : 1) * Math.abs(marketValue) ** valueExponent,
			contractAmount: clampContractDemandForPlayer(p, p.contract.amount),
			p,
		};
	});

	let playerInfosCurrent: typeof playerInfos;
	if (type === "newLeague") {
		// For performance, especially for FBGM, just assume the bottom X% of the league will be min contracts
		const cutoff = Math.round(0.75 * playerInfos.length);
		const ordered = orderBy(playerInfos, "value", "desc");
		playerInfosCurrent = ordered.slice(0, cutoff);
	} else {
		playerInfosCurrent = playerInfos;
	}

	const activeTeams = teams.filter((t) => !t.disabled);

	//console.time("foo");
	const updatedPIDs = new Set<number>();
	const randTeams = [...activeTeams];
	for (let i = 0; i < numRounds; i++) {
		const OFFSET = LEARNING_RATE * (1 / (1 + i / numRounds) ** 4);
		const SCALE_UP = 1.0 + OFFSET;
		const SCALE_DOWN = 1.0 - OFFSET;

		const bids = new Map<number, number>();
		random.shuffle(randTeams);
		for (const t of randTeams) {
			let capSpace = salaryCap - t.payroll;
			if (type === "newLeague") {
				if (salaryCapType !== "hard") {
					// Simulating that teams could have gone over the cap to sign players with bird rights
					capSpace += salaryCap;
				} else {
					// Not sure why lol
					capSpace += 0.5 * salaryCap;
				}
			}

			const availablePlayers = new Set(
				playerInfosCurrent.filter(
					(p) =>
						p.contractAmount <= capSpace &&
						(bids.get(p.pid) ?? 0) < NUM_BIDS_BEFORE_REMOVED,
				),
			);
			while (capSpace > minContract && availablePlayers.size > 0) {
				const availablePlayersArray = Array.from(availablePlayers);
				const probs = stableSoftmax(
					availablePlayersArray.map((p) => p.value * TEMP),
					PARAM,
				);
				const p = random.choice(availablePlayersArray, probs);
				availablePlayers.delete(p);

				bids.set(p.pid, (bids.get(p.pid) ?? 0) + 1);
				capSpace -= p.contractAmount;
				if (capSpace > minContract) {
					for (const p of availablePlayers) {
						if (p.contractAmount > capSpace) {
							availablePlayers.delete(p);
						}
					}
				}
			}
		}

		// Players adjust expectations
		for (const p of playerInfosCurrent) {
			const playerMaxContract = getMaxContractDemandForPlayer(p.p);
			const playerBids = bids.get(p.pid);
			if (playerBids === undefined) {
				// Got 0 bids - decrease demands
				const playerMinimum = getMinContractForPlayer(p.p);
				if (p.contractAmount >= playerMinimum) {
					p.contractAmount = helpers.bound(
						p.contractAmount * SCALE_DOWN,
						playerMinimum,
						playerMaxContract,
					);
					updatedPIDs.add(p.pid);
				}
			} else if (playerBids > 1) {
				// Got multiple bids - increase demands
				if (p.contractAmount <= playerMaxContract) {
					p.contractAmount = helpers.bound(
						p.contractAmount * SCALE_UP,
						getMinContractForPlayer(p.p),
						playerMaxContract,
					);
					updatedPIDs.add(p.pid);
				}
			}
		}
	}
	//console.timeEnd("foo");

	// See selectPlayer.ts - for hard cap, players are not auto signed, so special logic here
	let rookieSalaries;
	if (draftPickAutoContract && salaryCapType === "hard") {
		rookieSalaries = draft.getRookieSalaries();
	}

	const playerInfosToUpdate = playerInfos.filter((info) => {
		return (
			(type === "freeAgentsOnly" ||
				type === "newLeague" ||
				numRounds === 0 ||
				updatedPIDs.has(info.pid)) &&
			!info.dummy
		);
	});

	// Set contract amounts to final values, especially for numRounds=0
	for (const info of playerInfosToUpdate) {
		const p = info.p;
		if (rookieSalaries && p.draft.year === season) {
			const pickIndex = (p.draft.round - 1) * numActiveTeams + p.draft.pick - 1;
			info.contractAmount = rookieSalaries[pickIndex] ?? rookieSalaries.at(-1)!;
		} else if (numRounds === 0) {
			info.contractAmount = player.genContract(p, type === "newLeague").amount;
		} else if (type === "newLeague") {
			info.contractAmount *= random.uniform(0.4, 1.1);
			info.contractAmount = clampContractDemandForPlayer(
				p,
				info.contractAmount,
			);
		}
	}
	if (
		isSport("football") &&
		numRounds === 0 &&
		type === "freeAgentsOnly" &&
		maxContract !== minContract
	) {
		let totalCapSpace = 0;
		for (const t of activeTeams) {
			totalCapSpace += helpers.bound(salaryCap - t.payroll, 0, Infinity);
		}

		if (totalCapSpace === 0) {
			// No cap space, min contracts for everyone
			for (const info of playerInfosToUpdate) {
				info.contractAmount = getMinContractForPlayer(info.p);
			}
		} else {
			const playerInfosToUpdateSorted = orderBy(
				playerInfosToUpdate,
				"value",
				"desc",
			);

			let numPlayersOnTeams = 0;
			for (const p of playersAll) {
				if (p.tid >= 0) {
					numPlayersOnTeams += 1;
				}
			}
			const numTotalRosterSpots = activeTeams.length * maxRosterSize;
			const numOpenRosterSpots = Math.max(
				0,
				numTotalRosterSpots - numPlayersOnTeams,
			);

			// For the top free agents (up to the available number of roster spots), adjust their contract demands up/down based on available cap space. Anyone beyond the available number of roster spots, set to a min contract
			let topPlayersAmountSum = 0;
			let topPlayersCount = 0; // In case there are fewer than roster spots, somehow
			for (const [i, info] of playerInfosToUpdateSorted.entries()) {
				const playerNum = i + 1;

				if (playerNum < numOpenRosterSpots) {
					topPlayersAmountSum += info.contractAmount;
					topPlayersCount += 1;
				} else {
					info.contractAmount = getMinContractForPlayer(info.p);
				}
			}

			// Adjust contracts of top players - bound is so it's not too crazy, especially in a new league
			const fraction = helpers.bound(
				totalCapSpace / topPlayersAmountSum,
				0.6,
				1.4,
			);
			for (const info of playerInfosToUpdateSorted.slice(0, topPlayersCount)) {
				const playerMinimum = getMinContractForPlayer(info.p);
				info.contractAmount =
					playerMinimum +
					(info.contractAmount - playerMinimum) *
						fraction *
						random.uniform(0.75, 1);
				// console.log(`${info.p.firstName} ${info.p.lastName} ${prev} -> ${info.contractAmount}`)
			}
		}
	}

	let offset = phase <= PHASE.PLAYOFFS ? -1 : 0;
	if (nextSeason) {
		// Otherwise the season+phase combo appears off when setting contract expiration in newPhasePreseason
		offset -= 1;
	}
	const minNewContractExp =
		season +
		(context?.minContractLength ?? g.get("minContractLength")) +
		offset;

	const results = new Map<number, ContractDemandResult>();
	for (const info of playerInfosToUpdate) {
		const p = info.p;

		const exp =
			rookieSalaries && p.draft.year === season
				? season + draft.getRookieContractLength(p.draft.round)
				: getExpiration(p, type === "newLeague", nextSeason, context);

		let amount = info.contractAmount;

		// HACK - assume within first 3 years it is a rookie contract. Only need to check players with draftPickAutoContract disabled, because otherwise there is other code handling rookie contracts.
		let labelAsRookieContract = rookieSalaries && p.draft.year === season;
		if (type === "newLeague" && p.draft.round > 0 && !draftPickAutoContract) {
			if (season <= p.draft.year + 3) {
				labelAsRookieContract = true;

				// Decrease salary by 50%, like in newPhaseResignPlayers
				amount /= 2;
			}
		}

		// During regular season, should only look for short contracts that teams will actually sign
		if (type === "dummyExpiringContracts") {
			const playerMaxContract = getMaxContractForPlayer(p);
			if (info.contractAmount >= playerMaxContract / 4) {
				info.contractAmount = (info.contractAmount + playerMaxContract / 4) / 2;
			}
		}

		amount = clampContractDemandForPlayer(p, helpers.roundContract(amount));

		let contract: PlayerContract = {
			amount,
			exp:
				p.tid === PLAYER.FREE_AGENT && exp < minNewContractExp
					? minNewContractExp
					: exp,
		};
		if (type !== "newLeague") {
			contract = getAIContractWithOption(p, contract);
		}
		contract = withContractCapHitForPlayer(p, contract);

		results.set(p.pid, {
			contract,
			rookie: labelAsRookieContract ? true : undefined,
		});
	}

	return results;
};
