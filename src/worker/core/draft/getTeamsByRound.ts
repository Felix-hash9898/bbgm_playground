import { bySport, PHASE } from "../../../common/index.ts";
import { idb } from "../../db/index.ts";
import { g, orderTeams } from "../../util/index.ts";
import { getDivisionRanks } from "../../util/orderTeams.ts";
import type {
	DraftPickWithoutKey,
	DraftType,
	PlayInTournament,
} from "../../../common/types.ts";
import { genPlayoffSeriesFromTeams } from "../season/genPlayoffSeries.ts";
import { actualPhase } from "../../util/actualPhase.ts";

/**
 * Differences across sports:
 *
 * Basketball
 * - lottery is for non-playoff teams only
 * - after lottery, order is based on record, not playoff results
 * - tied teams in lottery split the total chances (handled in divideChancesOverTiedTeams.ts)
 * - tiebreaker is random - but make it deterministic so it doesn't jump when doing the lottery
 * - 2nd round tiebreaker is opposite of 1st round
 * - 2nd round order is just based on record, no lottery section for non-playoff teams
 *
 * Football
 * - order is based on playoff results
 * - tiebreaker is different than for playoffs, but i could probably get away with using the same one
 * - tied teams rotate (like 123 -> 231 -> 312 -> 123) in later rounds
 * - besides tiebreakers, order is same in all rounds
 *
 * Hockey
 * - lottery is like basketball, but sort based on points rather than winp
 * - then: playoff teams that did not win their divisions and did not make the conference finals, sorted by points
 * - then: playoff teams that won their divisions and did not make the conference finals, sorted by points
 * - then: conference finals losers sorted by points are assigned picks 29 and 30
 * - then: finals loser
 * - then: finals winner
 * - 2nd+ round same as 1st round, but with lottery teams ordered by points
 * - tiebreaker is different than for playoffs, but i could probably get away with using the same one
 * - tiebreaker order is the same in every round
 */

const FIRST_ROUND_PLAYOFF_TEAMS_ORDER = bySport<
	"record" | "playoffs" | "playoffsHockey"
>({
	baseball: "playoffs",
	basketball: "record",
	football: "playoffs",
	hockey: "playoffsHockey",
});

const TIEBREAKER = bySport<"random" | "default">({
	baseball: "default",
	basketball: "random",
	football: "default",
	hockey: "default",
});

const ORDER_AFTER_FIRST_ROUND = bySport<"record" | "firstRound">({
	baseball: "firstRound",
	basketball: "record",
	football: "firstRound",
	hockey: "firstRound",
});

export const getNba2027PlayInTeams = (
	playIns: PlayInTournament[] | undefined,
) => {
	if (playIns?.length !== 2) {
		return undefined;
	}
	const playIn0 = playIns[0]!;
	const playIn1 = playIns[1]!;
	const result = {
		tidPlayIn910: [
			playIn0[1].away.tid,
			playIn1[1].away.tid,
			playIn0[1].home.tid,
			playIn1[1].home.tid,
		],
		tidPlayIn78Loser: [playIn0[0].away.tid, playIn1[0].away.tid],
		tidPlayIn78Winner: [playIn0[0].home.tid, playIn1[0].home.tid],
	};
	if (playIn0[0].away.won > 0) {
		result.tidPlayIn78Loser[0] = playIn0[0].home.tid;
		result.tidPlayIn78Winner[0] = playIn0[0].away.tid;
	}
	if (playIn1[0].away.won > 0) {
		result.tidPlayIn78Loser[1] = playIn1[0].home.tid;
		result.tidPlayIn78Winner[1] = playIn1[0].away.tid;
	}
	return result;
};

const getTeamsByRound = async (
	draftType: DraftType | undefined,
	draftPicksIndexed: DraftPickWithoutKey[][],
) => {
	const allTeams = await idb.getCopies.teamsPlus({
		attrs: ["tid", "cola", "colaOptOut"],
		seasonAttrs: [
			"playoffRoundsWon",
			"cid",
			"did",
			"won",
			"lost",
			"tied",
			"otl",
			"winp",
			"pts",
			"wonDiv",
			"lostDiv",
			"tiedDiv",
			"otlDiv",
			"wonConf",
			"lostConf",
			"tiedConf",
			"otlConf",
		],
		stats: ["pts", "oppPts", "gp"],
		season: g.get("season"),
		addDummySeason: true,
		active: true,
	});

	// If the playoffs haven't started yet, need to project who would be in the playoffs.
	let tidPlayoffs: number[] = [];
	let nba2027Stuff:
		| {
				tidPlayIn910: number[];
				tidPlayIn78Loser: number[];
				tidPlayIn78Winner: number[];
		  }
		| undefined;
	const setNba2027Stuff = (playIns: PlayInTournament[] | undefined) => {
		nba2027Stuff = getNba2027PlayInTeams(playIns);
	};
	const phase = actualPhase();
	if (phase < PHASE.PLAYOFFS) {
		const projected = await genPlayoffSeriesFromTeams(allTeams);
		tidPlayoffs = projected.tidPlayoffs;
		if (draftType === "nba2027") {
			setNba2027Stuff(projected.playIns);
		}
	} else if (draftType === "nba2027") {
		const playoffSeries = await idb.cache.playoffSeries.get(g.get("season"));
		if (playoffSeries) {
			setNba2027Stuff(playoffSeries.playIns);
		} else {
			const projected = await genPlayoffSeriesFromTeams(allTeams);
			tidPlayoffs = projected.tidPlayoffs;
			setNba2027Stuff(projected.playIns);
		}
	}

	// Handle teams without draft picks (for challengeNoDraftPicks)
	const teams = allTeams.filter((t) => !!draftPicksIndexed[t.tid]);

	// Expansion teams and re-activated teams who did not play this season
	for (const t of teams) {
		if (
			t.seasonAttrs.won === 0 &&
			t.seasonAttrs.lost === 0 &&
			t.seasonAttrs.tied === 0
		) {
			t.seasonAttrs.winp = 0.5;
		}
	}

	type MyTeam = (typeof teams)[number];

	const usePts = g.get("pointsFormula", "current") !== "";

	const orderTeamsSettings: Parameters<typeof orderTeams>[2] =
		TIEBREAKER === "random"
			? {
					tiebreakersOverride: ["coinFlip"],
				}
			: undefined;

	////
	// Many special cases in first round
	////

	const ties: Record<
		string,
		{
			// Some ties might not appear until the 2nd round, due to 1st round sorting factoring in playoffs
			rounds: number[];
			teams: MyTeam[];
		}
	> = {};

	const addTie = (tiedTeams: MyTeam[], round: number) => {
		const key = JSON.stringify(
			tiedTeams.map((t) => t.tid).sort((a, b) => a - b),
		);

		if (!ties[key]) {
			ties[key] = {
				rounds: [round],
				teams: tiedTeams,
			};
		} else {
			ties[key].rounds.push(round);
		}
	};

	const checkForTies = (teamsToCheck: MyTeam[], round: number) => {
		let tiedValue;
		let tiedTeams: MyTeam[] = [];
		for (const t of teamsToCheck) {
			const newTiedValue = usePts ? t.seasonAttrs.pts : t.seasonAttrs.winp;
			if (newTiedValue === tiedValue) {
				tiedTeams.push(t);
			} else {
				if (tiedTeams.length > 0) {
					addTie(tiedTeams, round);
				}

				tiedValue = newTiedValue;
				tiedTeams = [t];
			}
		}

		if (tiedTeams.length > 0) {
			addTie(tiedTeams, round);
		}
	};

	const firstRound: MyTeam[] = [];

	const nonPlayoffTeams = teams.filter(
		(t) =>
			t.seasonAttrs.playoffRoundsWon < 0 &&
			!tidPlayoffs.includes(t.tid) &&
			!nba2027Stuff?.tidPlayIn910.includes(t.tid) &&
			!nba2027Stuff?.tidPlayIn78Loser.includes(t.tid) &&
			!nba2027Stuff?.tidPlayIn78Winner.includes(t.tid),
	);
	const nonPlayoffTeamsOrdered = (
		await orderTeams(nonPlayoffTeams, allTeams, {
			...orderTeamsSettings,

			// If division leaders matter for playoff seeding, then they should not matter here. But for expansion teams, that can cause a problem, if a new division is added at the same time, they will appear as the only member because they have no entry there
			skipDivisionLeaders: true,
		})
	).reverse();
	checkForTies(nonPlayoffTeamsOrdered, 1);
	firstRound.push(...nonPlayoffTeamsOrdered);
	if (nba2027Stuff) {
		const teamsByTid = new Map(teams.map((t) => [t.tid, t]));
		for (const tid of [
			...nba2027Stuff.tidPlayIn910,
			...nba2027Stuff.tidPlayIn78Loser,
		]) {
			const t = teamsByTid.get(tid);
			if (t) {
				firstRound.push(t);
			}
		}
	}

	const playoffTeams = teams.filter(
		(t) =>
			(t.seasonAttrs.playoffRoundsWon >= 0 ||
				tidPlayoffs.includes(t.tid) ||
				nba2027Stuff?.tidPlayIn78Winner.includes(t.tid)) &&
			!nba2027Stuff?.tidPlayIn78Loser.includes(t.tid) &&
			!nba2027Stuff?.tidPlayIn910.includes(t.tid),
	);
	if (playoffTeams.length > 0) {
		// For COLA, since first round losers get to be in the draft lottery, we need to sort by playoff performance regardless of the sport's default behavior
		const firstRoundPlayoffTeamsOrder =
			draftType === "cola" ? "playoffs" : FIRST_ROUND_PLAYOFF_TEAMS_ORDER;
		if (firstRoundPlayoffTeamsOrder === "record") {
			const playoffTeamsOrdered = (
				await orderTeams(playoffTeams, allTeams, orderTeamsSettings)
			).reverse();
			checkForTies(playoffTeamsOrdered, 1);
			firstRound.push(...playoffTeamsOrdered);
		} else if (firstRoundPlayoffTeamsOrder === "playoffs") {
			let minPlayoffRoundsWon = Infinity;
			let maxPlayoffRoundsWon = -Infinity;
			for (const t of playoffTeams) {
				if (t.seasonAttrs.playoffRoundsWon < minPlayoffRoundsWon) {
					minPlayoffRoundsWon = t.seasonAttrs.playoffRoundsWon;
				}
				if (t.seasonAttrs.playoffRoundsWon > maxPlayoffRoundsWon) {
					maxPlayoffRoundsWon = t.seasonAttrs.playoffRoundsWon;
				}
			}

			for (
				let playoffRoundsWon = minPlayoffRoundsWon;
				playoffRoundsWon <= maxPlayoffRoundsWon;
				playoffRoundsWon++
			) {
				const playoffRoundTeams = playoffTeams.filter(
					(t) => t.seasonAttrs.playoffRoundsWon === playoffRoundsWon,
				);
				const playoffRoundTeamsOrdered = (
					await orderTeams(playoffRoundTeams, allTeams, orderTeamsSettings)
				).reverse();
				checkForTies(playoffRoundTeamsOrdered, 1);
				firstRound.push(...playoffRoundTeamsOrdered);
			}
		} else {
			// playoffsHockey
			const divisionRanks = await getDivisionRanks(
				// Pass allTeams rather than teams because there is currently a bug in getDivisionLeaders where only teams in the first arg can be selected. This works around that bug, and also will continue to work after the bug is fixed.
				allTeams,
				allTeams,
			);
			const divisionWinners = new Set<number>();
			for (const [tid, rank] of divisionRanks) {
				if (rank === 1) {
					divisionWinners.add(tid);
				}
			}

			const numPlayoffRounds = g.get("numGamesPlayoffSeries", "current").length;

			// group 0: playoff teams that did not win their divisions and did not make the conference finals, sorted by points
			// group 1: playoff teams that won their divisions and did not make the conference finals, sorted by points
			// group 2: conference finals losers sorted by points are assigned picks 29 and 30
			// group 3: finals loser
			// group 4: finals winner
			const groups: [MyTeam[], MyTeam[], MyTeam[], MyTeam[], MyTeam[]] = [
				[],
				[],
				[],
				[],
				[],
			];

			for (const t of playoffTeams) {
				const playoffRoundsWon = t.seasonAttrs.playoffRoundsWon;
				if (playoffRoundsWon === numPlayoffRounds) {
					groups[4].push(t);
				} else if (playoffRoundsWon === numPlayoffRounds - 1) {
					groups[3].push(t);
				} else if (playoffRoundsWon === numPlayoffRounds - 2) {
					groups[2].push(t);
				} else if (divisionWinners.has(t.tid)) {
					groups[1].push(t);
				} else {
					groups[0].push(t);
				}
			}

			for (const group of groups) {
				const groupOrdered = (
					await orderTeams(group, allTeams, orderTeamsSettings)
				).reverse();
				checkForTies(group, 1);
				firstRound.push(...groupOrdered);
			}
		}
	}

	const nba2027NumLotteryTeams =
		draftType === "nba2027" ? teams.length - playoffTeams.length : undefined;

	// Keep lottery and non-lottery sections separate for NBA 2027 second-round order.
	const nthRound =
		ORDER_AFTER_FIRST_ROUND === "firstRound" || draftType === "nba2027"
			? firstRound
			: (await orderTeams(teams, allTeams, orderTeamsSettings)).reverse();

	const teamsByRound: MyTeam[][] = [];
	const numDraftRounds = g.get("numDraftRounds");
	for (let i = 0; i < numDraftRounds; i++) {
		if (i === 0) {
			teamsByRound.push([...firstRound]);
		} else {
			if (nba2027NumLotteryTeams !== undefined) {
				checkForTies(nthRound.slice(0, nba2027NumLotteryTeams), i + 1);
				checkForTies(nthRound.slice(nba2027NumLotteryTeams), i + 1);
			} else {
				checkForTies(nthRound, i + 1);
			}
			teamsByRound.push([...nthRound]);
		}
	}

	return {
		nba2027NumLotteryTeams,
		teamsByRound,
		ties,
	};
};

export default getTeamsByRound;
