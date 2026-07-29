import genPicks from "./genPicks.ts";
import logLotteryChances from "./logLotteryChances.ts";
import logLotteryWinners from "./logLotteryWinners.ts";
import divideChancesOverTiedTeams from "./divideChancesOverTiedTeams.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, random } from "../../util/index.ts";
import type {
	Conditions,
	DraftLotteryResult,
	DraftType,
	DraftPickWithoutKey,
	DraftPick,
} from "../../../common/types.ts";
import genOrderGetPicks from "./genOrderGetPicks.ts";
import getTeamsByRound from "./getTeamsByRound.ts";
import { bySport, COLA_ALPHA, PHASE } from "../../../common/index.ts";
import { league } from "../index.ts";
import getNumPlayoffTeams from "../season/getNumPlayoffTeams.ts";
import { genPlayoffSeriesFromTeams } from "../season/genPlayoffSeries.ts";
import {
	getNumLotteryTeams,
	updateLotteryChancesAfterLottery,
} from "./cola.ts";
import {
	disableNba2027,
	initializeNba2027,
	updateNba2027AfterLottery,
} from "./nba2027.ts";

type ReturnVal = {
	draftLotteryResult:
		| (DraftLotteryResult & {
				draftType: Exclude<
					DraftType,
					"random" | "noLottery" | "noLotteryReverse" | "freeAgents"
				>;
		  })
		| undefined;
	draftPicks: DraftPick[];
};

const LOTTERY_DRAFT_TYPES = [
	"nba1994",
	"nba2019",
	"nba321",
	"nba2027",
	"coinFlip",
	"randomLottery",
	"randomLotteryFirst3",
	"nba1990",
	"nhl2017",
	"nhl2021",
	"mlb2022",
	"custom",
	"cola",
] as const;

const NBA_321_CHANCES = [2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1];
const NBA_321_PROTECTED_TEAM_COUNT = 3;
const NBA_321_PROTECTED_FLOOR_PICK = 12;

// chances does not have to be the perfect length. If chances is too long for numLotteryTeams, it will be truncated. If it's too short, the last entry will be repeated until it's long enough.
const getLotteryInfo = (draftType: DraftType, numLotteryTeams: number) => {
	if (draftType === "coinFlip") {
		return {
			numToPick: 2,
			chances: [1, 1, 0],
		};
	}

	if (draftType === "randomLottery") {
		return {
			numToPick: numLotteryTeams,
			chances: [1],
		};
	}

	if (draftType === "randomLotteryFirst3") {
		return {
			numToPick: 3,
			chances: [1],
		};
	}

	if (draftType === "nba1990") {
		const chances = [];
		for (let i = numLotteryTeams; i > 0; i--) {
			chances.push(i);
		}

		return {
			numToPick: 3,
			chances,
		};
	}

	if (draftType === "nba1994") {
		return {
			numToPick: 3,
			chances: [250, 199, 156, 119, 88, 63, 43, 28, 17, 11, 8, 7, 6, 5],
		};
	}

	if (draftType === "nba2019") {
		return {
			numToPick: 4,
			chances: [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5],
		};
	}

	if (draftType === "nba321") {
		return {
			numToPick: NBA_321_CHANCES.length,
			chances: [...NBA_321_CHANCES],
		};
	}

	if (draftType === "nba2027") {
		const numToPick = Math.max(numLotteryTeams, 6);
		const chances = Array.from({ length: numToPick }, (_, i) => {
			if (i < 3) {
				return 2;
			}
			if (numLotteryTeams >= 11 && i >= numLotteryTeams - 4) {
				return 2;
			}
			if (
				numLotteryTeams >= 9 &&
				numLotteryTeams < 11 &&
				i >= numLotteryTeams - 2
			) {
				return 2;
			}
			return 3;
		});
		return { numToPick, chances };
	}

	if (draftType === "nhl2017") {
		return {
			numToPick: 3,
			chances: [185, 135, 115, 95, 85, 75, 65, 60, 50, 35, 30, 25, 20, 15, 10],
		};
	}

	if (draftType === "nhl2021") {
		return {
			numToPick: 2,
			chances: [
				185, 135, 115, 95, 85, 75, 65, 60, 50, 35, 30, 25, 20, 15, 5, 5,
			],
		};
	}

	if (draftType === "mlb2022") {
		return {
			numToPick: 6,
			chances: [
				1650, 1650, 1650, 1325, 1000, 750, 550, 390, 270, 180, 140, 110, 90, 76,
				62, 48, 36, 23,
			],
		};
	}

	if (draftType === "custom") {
		return {
			numToPick: g.get("draftLotteryCustomNumPicks"),
			chances: [...g.get("draftLotteryCustomChances")],
		};
	}

	if (draftType === "cola") {
		return {
			numToPick: 4,
			chances: [1], // Placeholder, will be filled with real values later
		};
	}

	throw new Error(`Unsupported draft type "${draftType}"`);
};

const draftHasLottery = (
	draftType: any,
): draftType is (typeof LOTTERY_DRAFT_TYPES)[number] => {
	return LOTTERY_DRAFT_TYPES.includes(draftType);
};

export const getNumToPick = (
	draftType: DraftType | "dummy" | undefined,
	numLotteryTeams: number,
) => {
	if (draftHasLottery(draftType)) {
		return getLotteryInfo(draftType, numLotteryTeams).numToPick;
	}

	return 0;
};

const drawLotterySelections = ({
	chances,
	numToPick,
	riggedLotteryChances,
	protectedTeamCount,
	protectedFloorPick,
}: {
	chances: number[];
	numToPick: number;
	riggedLotteryChances?: (number | null)[];
	protectedTeamCount?: number;
	protectedFloorPick?: number;
}) => {
	let remaining = chances.map((chance, index) => ({
		chance,
		index,
	}));

	const picks: number[] = [];
	let iterations = 0;
	while (picks.length < numToPick) {
		if (riggedLotteryChances) {
			const index = riggedLotteryChances[picks.length];
			if (typeof index === "number") {
				picks.push(index);
				remaining = remaining.filter((team) => team.index !== index);
				continue;
			}
		}

		let candidates = remaining;
		if (
			protectedTeamCount !== undefined &&
			protectedFloorPick !== undefined &&
			protectedFloorPick > picks.length
		) {
			const protectedTeams = remaining.filter(
				(team) => team.index < protectedTeamCount,
			);
			const remainingSlotsBeforeFloor = protectedFloorPick - picks.length;
			if (protectedTeams.length >= remainingSlotsBeforeFloor) {
				candidates = protectedTeams;
			}
		}

		const totalChances = candidates.reduce((sum, team) => sum + team.chance, 0);
		if (totalChances <= 0) {
			break;
		}

		const draw = random.randInt(0, totalChances - 1);
		let runningTotal = 0;
		let selectedIndex: number | undefined;
		for (const team of candidates) {
			runningTotal += team.chance;
			if (draw < runningTotal) {
				selectedIndex = team.index;
				break;
			}
		}

		if (selectedIndex === undefined) {
			break;
		}

		picks.push(selectedIndex);
		remaining = remaining.filter((team) => team.index !== selectedIndex);

		iterations += 1;
		if (iterations > 100000) {
			break;
		}
	}

	return picks;
};

const TIEBREAKER_AFTER_FIRST_ROUND = bySport<"swap" | "rotate" | "same">({
	baseball: "swap", // MLB uses last year's record
	basketball: "swap",
	football: "rotate",
	hockey: "same",
});

const DIVIDE_CHANCES_OVER_TIED_TEAMS = bySport({
	baseball: false,
	basketball: true,
	football: false,
	hockey: false,
});

/**
 * Sets draft order and save it to the draftPicks object store.
 *
 * If mock is true, then nothing is actually saved to the database and no notifications are sent
 */
const genOrder = async (
	mock: boolean = false,
	conditions?: Conditions,
	draftTypeOverride?: DraftType,
): Promise<ReturnVal> => {
	// Sometimes picks just fail to generate or get lost. For example, if numSeasonsFutureDraftPicks is 0.
	await genPicks();

	const draftPicks = await genOrderGetPicks(mock);
	const draftPicksIndexed: DraftPickWithoutKey[][] = [];
	for (const dp of draftPicks) {
		const tid = dp.originalTid;

		// Initialize to an array
		if (draftPicksIndexed[tid] === undefined) {
			draftPicksIndexed[tid] = [];
		}

		draftPicksIndexed[tid][dp.round] = dp;
	}

	const { teamsByRound, ties } = await getTeamsByRound(draftPicksIndexed);
	const firstRoundTeams = teamsByRound[0] ?? [];

	const draftType = draftTypeOverride ?? g.get("draftType");
	if (!mock) {
		if (draftType === "nba2027") {
			await initializeNba2027();
		} else {
			await disableNba2027();
		}
	}
	const riggedLottery = g.get("godMode") ? g.get("riggedLottery") : undefined;

	// Draft lottery
	const firstN: number[] = [];
	let numLotteryTeams = 0;
	let chances: number[] = [];
	let lotteryTeams = firstRoundTeams;
	if (draftHasLottery(draftType)) {
		const numPlayoffTeams = (await getNumPlayoffTeams(g.get("season")))
			.numPlayoffTeams;

		const info = getLotteryInfo(
			draftType,
			firstRoundTeams.length - numPlayoffTeams,
		);
		const numToPick = info.numToPick;

		if (firstRoundTeams.length < numToPick) {
			const error = new Error(
				`Number of teams with draft picks (${firstRoundTeams.length}) is less than the minimum required for draft type "${draftType}"`,
			);
			(error as any).notEnoughTeams = true;
			throw error;
		}

		if (draftType === "cola") {
			numLotteryTeams = await getNumLotteryTeams();
		} else {
			numLotteryTeams = helpers.bound(
				firstRoundTeams.length - numPlayoffTeams,
				numToPick,
				draftType === "coinFlip" ? numToPick : firstRoundTeams.length,
			);
		}

		if (draftType === "nba321" || draftType === "nba2027") {
			const fallbackLotteryTeams = firstRoundTeams.slice(
				0,
				NBA_321_CHANCES.length,
			);

			const getProjectedOrActualPlayIns = async () => {
				if (!g.get("playIn")) {
					return undefined;
				}

				if (g.get("phase") < PHASE.PLAYOFFS) {
					return (await genPlayoffSeriesFromTeams(firstRoundTeams)).playIns;
				}

				return (
					await idb.getCopy.playoffSeries(
						{
							season: g.get("season"),
						},
						"noCopyCache",
					)
				)?.playIns;
			};

			const playIns = await getProjectedOrActualPlayIns();
			if (playIns && playIns.length === 2) {
				const indexByTid = new Map(
					firstRoundTeams.map((team, index) => [team.tid, index]),
				);
				const teamByTid = new Map(
					firstRoundTeams.map((team) => [team.tid, team]),
				);
				const playInParticipantTids = new Set<number>();
				const playIn910Tids: number[] = [];
				const loser78Tids: number[] = [];

				for (const playIn of playIns) {
					const game78 = playIn[0];
					const game910 = playIn[1];

					playInParticipantTids.add(game78.home.tid);
					playInParticipantTids.add(game78.away.tid);
					playInParticipantTids.add(game910.home.tid);
					playInParticipantTids.add(game910.away.tid);
					playIn910Tids.push(game910.home.tid, game910.away.tid);

					if (game78.home.won === 1) {
						loser78Tids.push(game78.away.tid);
					} else if (game78.away.won === 1) {
						loser78Tids.push(game78.home.tid);
					} else if (game78.home.seed > game78.away.seed) {
						loser78Tids.push(game78.home.tid);
					} else {
						loser78Tids.push(game78.away.tid);
					}
				}

				const getTeamsInFirstRoundOrder = (tids: number[]) =>
					[...new Set(tids)]
						.map((tid) => teamByTid.get(tid))
						.filter((team) => team !== undefined)
						.sort(
							(a, b) =>
								(indexByTid.get(a.tid) ?? Infinity) -
								(indexByTid.get(b.tid) ?? Infinity),
						);

				const nonPlayInTeams = firstRoundTeams
					.filter((team) => !playInParticipantTids.has(team.tid))
					.slice(0, 10);
				const lotteryTeamsTemp = [
					...nonPlayInTeams.slice(0, 3),
					...nonPlayInTeams.slice(3),
					...getTeamsInFirstRoundOrder(playIn910Tids),
					...getTeamsInFirstRoundOrder(loser78Tids),
				];

				if (
					nonPlayInTeams.length === 10 &&
					playInParticipantTids.size === 8 &&
					new Set(playIn910Tids).size === 4 &&
					new Set(loser78Tids).size === 2 &&
					lotteryTeamsTemp.length === NBA_321_CHANCES.length &&
					new Set(lotteryTeamsTemp.map((team) => team.tid)).size ===
						NBA_321_CHANCES.length
				) {
					lotteryTeams = lotteryTeamsTemp;
				} else {
					lotteryTeams = fallbackLotteryTeams;
				}
			} else {
				lotteryTeams = fallbackLotteryTeams;
			}

			numLotteryTeams = lotteryTeams.length;
			chances = [...NBA_321_CHANCES].slice(0, numLotteryTeams);
		} else if (draftType === "cola") {
			lotteryTeams = firstRoundTeams.slice(0, numLotteryTeams);
			// If the playoffs aren't over yet, then we haven't yet added COLA_ALPHA to all the lottery teams
			const addAlpha = g.get("phase") <= PHASE.PLAYOFFS ? COLA_ALPHA : 0;

			chances = lotteryTeams.map((t) => {
				// Traded picks are not eligible for the lottery
				const currentTid = draftPicksIndexed[t.tid]?.[1]?.tid;
				if (currentTid !== t.tid) {
					return 0;
				}

				if (t.colaOptOut) {
					return 0;
				}

				return (t.cola ?? 0) + addAlpha;
			});
		} else {
			lotteryTeams = firstRoundTeams.slice(0, numLotteryTeams);
			chances = info.chances;
		}

		if (numLotteryTeams < chances.length) {
			chances = chances.slice(0, numLotteryTeams);
		} else {
			while (numLotteryTeams > chances.length) {
				chances.push(chances.at(-1)!);
			}
		}
		if (draftType === "nba2027") {
			const teams = await idb.cache.teams.getAll();
			const restricted1 = new Set(
				teams
					.filter((team) => team.draftLottery?.restricted1)
					.map((team) => team.tid),
			);
			const restricted5 = new Set(
				teams
					.filter((team) => team.draftLottery?.restricted5)
					.map((team) => team.tid),
			);
			chances = chances.map((chance, index) => {
				const tid = lotteryTeams[index]?.tid;
				return tid !== undefined &&
					(restricted1.has(tid) || restricted5.has(tid))
					? 0
					: chance;
			});
		}

		if (
			DIVIDE_CHANCES_OVER_TIED_TEAMS &&
			draftType !== "cola" &&
			draftType !== "nba321" &&
			draftType !== "nba2027"
		) {
			divideChancesOverTiedTeams(chances, lotteryTeams, true);
		}

		const chanceTotal = chances.reduce((a, b) => a + b, 0);
		const chancePct = chances.map((c) => (c / chanceTotal) * 100);

		// Identify lottery indexes protected by riggedLottery.
		const riggedLotteryChances = riggedLottery
			? riggedLottery.map((dpid) => {
					if (typeof dpid === "number") {
						const originalTid = draftPicks.find((dp) => {
							return dp.dpid === dpid;
						})?.originalTid;
						if (originalTid !== undefined) {
							const index = lotteryTeams.findIndex(
								({ tid }) => tid === originalTid,
							);
							if (index >= 0) {
								return index;
							}
						}
					}

					return null;
				})
			: undefined;
		firstN.push(
			...drawLotterySelections({
				chances,
				numToPick,
				riggedLotteryChances,
				protectedTeamCount:
					draftType === "nba321" || draftType === "nba2027"
						? NBA_321_PROTECTED_TEAM_COUNT
						: undefined,
				protectedFloorPick:
					draftType === "nba321" || draftType === "nba2027"
						? NBA_321_PROTECTED_FLOOR_PICK
						: undefined,
			}),
		);

		if (!mock) {
			logLotteryChances(chancePct, lotteryTeams, draftPicksIndexed, conditions);
		}
	} else {
		for (const roundTeams of teamsByRound) {
			if (draftType === "random") {
				random.shuffle(roundTeams);
			} else if (draftType === "noLotteryReverse") {
				roundTeams.reverse();
			}
		}
	}

	const firstRoundOrderAfterLottery = [];

	// First round - lottery winners
	let pick = 1;
	for (let i = 0; i < firstN.length; i++) {
		const t = lotteryTeams[firstN[i]!]!;
		const dp = draftPicksIndexed[t.tid]![1];

		if (dp !== undefined) {
			dp.pick = pick;
			firstRoundOrderAfterLottery.push(t);

			if (!mock) {
				logLotteryWinners(
					lotteryTeams,
					dp.tid,
					lotteryTeams[firstN[i]!]!.tid,
					pick,
					conditions,
				);
			}

			pick += 1;
		}
	}

	if (!mock && draftType === "cola") {
		const tids = firstRoundOrderAfterLottery.map((t) => t.tid);
		await updateLotteryChancesAfterLottery(tids);
	}

	// First round - everyone else
	const remainingFirstRoundTeams =
		draftType === "nba321" || draftType === "nba2027"
			? [
					...lotteryTeams.filter((_team, index) => !firstN.includes(index)),
					...firstRoundTeams.filter(
						(team) =>
							!lotteryTeams.some((lotteryTeam) => lotteryTeam.tid === team.tid),
					),
				]
			: firstRoundTeams.filter((_team, index) => !firstN.includes(index));
	for (const t of remainingFirstRoundTeams) {
		const dp = draftPicksIndexed[t.tid]?.[1];

		if (dp) {
			dp.pick = pick;
			firstRoundOrderAfterLottery.push(t);

			if (pick <= numLotteryTeams && !mock) {
				logLotteryWinners(lotteryTeams, dp.tid, t.tid, pick, conditions);
			}

			pick += 1;
		}
	}
	if (!mock && draftType === "nba2027") {
		await updateNba2027AfterLottery(
			firstRoundOrderAfterLottery.slice(0, 5).map((team) => team.tid),
		);
	}

	let draftLotteryResult: ReturnVal["draftLotteryResult"];
	if (draftHasLottery(draftType)) {
		// Save draft lottery results separately
		draftLotteryResult = {
			season: g.get("season"),
			draftType,
			rigged: riggedLottery,
			result: lotteryTeams // Start with teams in lottery order
				.map(({ tid }) => {
					return draftPicks.find((dp) => {
						// Keep only lottery picks
						return (
							dp.originalTid === tid &&
							dp.round === 1 &&
							dp.pick > 0 &&
							dp.pick <= chances.length
						);
					});
				})
				.filter((dp) => dp !== undefined) // Keep only lottery picks
				.map((dp) => {
					if (dp === undefined) {
						throw new Error("Should never happen");
					}

					// For the original team
					const i = lotteryTeams.findIndex((t2) => t2.tid === dp.originalTid);

					return {
						tid: dp.tid,
						originalTid: dp.originalTid,
						chances: chances[i]!,
						pick: dp.pick,
						dpid: dp.dpid,
					};
				}),
		};

		if (!mock) {
			await idb.cache.draftLotteryResults.put(draftLotteryResult);
			await league.setGameAttributes({
				riggedLottery: undefined,
			});
		}
	}

	for (let roundIndex = 1; roundIndex < teamsByRound.length; roundIndex++) {
		const roundTeams = teamsByRound[roundIndex]!;
		const round = roundIndex + 1;

		// Handle tiebreakers for the 2nd+ round (1st is already done by getTeamsByRound, but 2nd can't be done until now because it depends on lottery results for basketball/football)
		// Skip random drafts because this code assumes teams appear in the same order every round, which is not true there!
		if (draftType !== "random" && TIEBREAKER_AFTER_FIRST_ROUND !== "same") {
			for (const { rounds, teams } of Object.values(ties)) {
				if (rounds.includes(round)) {
					// From getTeamsByRound, teams is guaranteed to be a continuous section of roundTeams, so we can just figure out the correct order for them and then replace them in roundTeam
					const start = roundTeams.findIndex((t) => teams.includes(t));
					const length = teams.length;

					const firstRoundOrder = firstRoundOrderAfterLottery.filter((t) =>
						teams.includes(t),
					);

					// Handle case where a team did not appear in the 1st round but does now, which probably never happens
					for (const t of teams) {
						if (!firstRoundOrder.includes(t)) {
							firstRoundOrder.push(t);
						}
					}

					// Based on roundIndex and TIEBREAKER_AFTER_FIRST_ROUND, do some permutation of firstRoundOrder
					const newOrder = firstRoundOrder;
					if (TIEBREAKER_AFTER_FIRST_ROUND === "swap") {
						if (roundIndex % 2 === 1) {
							newOrder.reverse();
						}
					} else if (TIEBREAKER_AFTER_FIRST_ROUND === "rotate") {
						for (let i = 0; i < roundIndex; i++) {
							// Move 1st team to the end of the list
							newOrder.push((newOrder as unknown as any).shift());
						}
					}
					roundTeams.splice(start, length, ...newOrder);
				}
			}
		}

		let pick = 1;
		for (const t of roundTeams) {
			const dp = draftPicksIndexed[t.tid]?.[roundIndex + 1];

			if (dp !== undefined) {
				dp.pick = pick;
				pick += 1;
			}
		}
	}

	if (!mock) {
		for (const dp of draftPicks) {
			await idb.cache.draftPicks.put(dp);
		}

		await league.setGameAttributes({
			numDraftPicksCurrent: draftPicks.length,
		});
	}

	return { draftLotteryResult, draftPicks };
};

export default genOrder;
