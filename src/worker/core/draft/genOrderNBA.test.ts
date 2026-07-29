import { afterAll, assert, beforeAll, test } from "vitest";
import { getDraftTids, loadTeamSeasons } from "./testHelpers.ts";
import { mockIDBLeague, resetG } from "../../../test/helpers.ts";
import { getDraftLotteryProbs } from "../../../common/draftLottery.ts";
import { PHASE } from "../../../common/index.ts";
import { draft } from "../index.ts";
import { idb } from "../../db/index.ts";
import { getLotteryInfo, getNba2027SecondRoundOrder } from "./genOrder.ts";
import { updateNba2027AfterLottery } from "./nba2027.ts";
import setGameAttributes from "../league/setGameAttributes.ts";
import { getNba2027PlayInTeams } from "./getTeamsByRound.ts";
import { genPlayoffSeriesFromTeams } from "../season/genPlayoffSeries.ts";
import { g, helpers } from "../../util/index.ts";

beforeAll(async () => {
	resetG();
	idb.league = mockIDBLeague();

	await loadTeamSeasons();
});
afterAll(() => {
	// @ts-expect-error
	idb.league = undefined;
});

test("schedule 60 draft picks", async () => {
	const draftTids = await getDraftTids();
	assert.strictEqual(draftTids.length, 60);
});

test("give the 3 teams with the lowest win percentage picks not lower than 6", async () => {
	const draftTids = await getDraftTids();
	const tids = [16, 28, 21]; // teams with lowest winp

	for (const [i, tid] of tids.entries()) {
		assert(draftTids.indexOf(tid) >= 0);
		assert(draftTids.indexOf(tid) <= i + 3);
		assert.strictEqual(draftTids.lastIndexOf(tid), 30 + i);
	}
});

test("give lottery team with better record than playoff teams a pick based on actual record for round 2", async () => {
	const draftTids = await getDraftTids();
	const pofteams = [23, 10, 18, 24, 14]; // good record lottery team

	assert(draftTids.indexOf(17) >= 0);
	assert(draftTids.indexOf(17) <= 13);
	assert.strictEqual(draftTids.lastIndexOf(17), 48); // bad record playoff team

	for (const tid of pofteams) {
		assert(draftTids.indexOf(tid) > draftTids.indexOf(17));
		assert(draftTids.lastIndexOf(tid) < draftTids.lastIndexOf(17));
	}
});

test("give reverse round 2 order for teams with the same record", async () => {
	const draftTids = await getDraftTids();
	const sameRec = [
		[3, 15, 25],
		[10, 18],
		[13, 26],
	];

	// First set of tids can fail because all 3 teams are in the lottery, although with low odds
	const lotteryTids = draftTids.slice(0, 3);
	for (const tid of sameRec[0]!) {
		if (lotteryTids.includes(tid)) {
			// Skip this test, it will fail otherwise
			sameRec.shift();
			break;
		}
	}

	for (const tids of sameRec) {
		const r1picks = draftTids.filter((tid, i) => tids.includes(tid) && i < 30);
		const r2picks = draftTids.filter((tid, i) => tids.includes(tid) && i >= 30);
		assert.deepStrictEqual(r1picks, r2picks.reverse());
	}
});

test("nba321 uses the expected 3-2-1 lottery chance tiers", async () => {
	const { draftLotteryResult } = await draft.genOrder(
		true,
		undefined,
		"nba321",
	);
	assert(draftLotteryResult);
	assert.strictEqual(draftLotteryResult.result.length, 16);
	assert.deepStrictEqual(
		draftLotteryResult.result.map((row) => row.chances),
		[2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1],
	);
});

test("nba321 keeps the three worst teams inside the top 12", async () => {
	const { draftPicks } = await draft.genOrder(true, undefined, "nba321");
	const firstRound = draftPicks
		.filter((dp) => dp.round === 1)
		.sort((a, b) => a.pick - b.pick);

	for (const tid of [16, 28, 21]) {
		const pick = firstRound.find((dp) => dp.originalTid === tid)?.pick;
		assert.strictEqual(typeof pick, "number");
		assert(pick! <= 12);
	}
});

test("nba321 uses an exact precomputed probability matrix", async () => {
	const { draftLotteryResult } = await draft.genOrder(
		true,
		undefined,
		"nba321",
	);
	assert(draftLotteryResult);

	const { tooSlow, probs } = getDraftLotteryProbs(
		draftLotteryResult.result,
		"nba321",
		16,
	);

	assert.strictEqual(tooSlow, false);
	assert(probs);
	assert.strictEqual(probs[0]?.[11], 0.250649664389266);
	assert.strictEqual(probs[3]?.[0], 0.08108108108108109);
	assert.strictEqual(probs[14]?.[15], 0.2652305869491766);
});

test("nba2027 uses the new rule while legacy nba321 remains selectable", async () => {
	const modern = await draft.genOrder(true, undefined, "nba2027");
	assert(modern.draftLotteryResult);
	assert.strictEqual(modern.draftLotteryResult.draftType, "nba2027");
	assert.strictEqual(modern.draftLotteryResult.result.length, 16);
	assert.deepStrictEqual(
		modern.draftLotteryResult.result.slice(0, 3).map((row) => row.chances),
		[2, 2, 2],
	);
	const legacy = await draft.genOrder(true, undefined, "nba321");
	assert(legacy.draftLotteryResult);
	assert.strictEqual(legacy.draftLotteryResult.draftType, "nba321");
});

test("nba2027 chance vectors are dynamic and add play-in loser picks", () => {
	for (const teams of [6, 10, 14, 16, 17]) {
		const info = getLotteryInfo("nba2027", teams);
		assert.strictEqual(info.numToPick, Math.max(teams, 6));
		assert.strictEqual(info.chances.length, Math.max(teams, 6));
	}
	const playIn = getLotteryInfo("nba2027", 14, 4);
	assert.strictEqual(playIn.numToPick, 16);
	assert.deepStrictEqual(playIn.chances.slice(-2), [1, 1]);
});

test("nba2027 play-in ordering uses projected teams and completed 7/8 results", () => {
	const matchup = (home: number, away: number, awayWon = 0) => ({
		home: { tid: home, won: awayWon ? 0 : 0 },
		away: { tid: away, won: awayWon },
	});
	const playIns = [
		[matchup(0, 1, 1), matchup(2, 3)],
		[matchup(4, 5), matchup(6, 7)],
	] as any;
	const result = getNba2027PlayInTeams(playIns);
	assert(result);
	assert.deepStrictEqual(result.tidPlayIn910, [3, 7, 2, 6]);
	assert.deepStrictEqual(result.tidPlayIn78Loser, [0, 5]);
	assert.deepStrictEqual(result.tidPlayIn78Winner, [1, 4]);
	assert.strictEqual(getNba2027PlayInTeams([playIns[0]]), undefined);
});

test("nba2027 second round reverses only the lottery section", () => {
	assert.deepStrictEqual(
		getNba2027SecondRoundOrder([0, 1, 2, 3], [10, 11, 12, 13, 14], 4),
		[3, 2, 1, 0, 14],
	);
});

test("nba2027 uses completed play-ins, one-ball losers, rigged picks, and lottery-only round-two reversal", async () => {
	// This is deliberately an end-to-end worker path: getTeamsByRound reads an
	// actual playoffSeries record, genOrder applies a rigged lottery, and the
	// resulting real draft-pick records are checked across both rounds.
	await loadTeamSeasons();
	g.setWithoutSavingToDB("draftType", "nba2027");
	g.setWithoutSavingToDB("phase", PHASE.DRAFT_LOTTERY);

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
	const projected = await genPlayoffSeriesFromTeams(allTeams);
	assert.strictEqual(projected.playIns?.length, 2);
	const playIns = helpers.deepCopy(projected.playIns!);
	// Make the lower seed win one 7/8 game and the higher seed win the other.
	// The production path must use these actual results, not projected seeds.
	playIns[0]![0].away.won = 1;
	playIns[1]![0].home.won = 1;
	const expectedPlayIn = getNba2027PlayInTeams(playIns)!;
	await idb.cache.playoffSeries.put({
		season: g.get("season"),
		currentRound: 0,
		byConf: projected.byConf,
		series: projected.series,
		playIns,
	});

	await idb.cache.draftPicks.clear();
	await draft.genPicks();
	const loserPicks = (await idb.cache.draftPicks.getAll())
		.filter(
			(dp) =>
				dp.round === 1 &&
				dp.season === g.get("season") &&
				expectedPlayIn.tidPlayIn78Loser.includes(dp.originalTid),
		)
		.sort(
			(a, b) =>
				expectedPlayIn.tidPlayIn78Loser.indexOf(a.originalTid) -
				expectedPlayIn.tidPlayIn78Loser.indexOf(b.originalTid),
		);
	assert.strictEqual(loserPicks.length, 2);
	// A traded pick still follows originalTid into the lottery and restrictions.
	loserPicks[0]!.tid = (loserPicks[0]!.originalTid + 1) % 30;
	await idb.cache.draftPicks.put(loserPicks[0]!);
	g.setWithoutSavingToDB("godMode", true);
	g.setWithoutSavingToDB(
		"riggedLottery",
		loserPicks.map((dp) => dp.dpid),
	);

	const modern = await draft.genOrder(true, undefined, "nba2027");
	assert(modern.draftLotteryResult);
	const lottery = modern.draftLotteryResult.result;
	assert.deepStrictEqual(
		lottery.slice(-6).map((row) => row.originalTid),
		[...expectedPlayIn.tidPlayIn910, ...expectedPlayIn.tidPlayIn78Loser],
	);
	assert.deepStrictEqual(
		lottery.slice(-6).map((row) => row.chances),
		[2, 2, 2, 2, 1, 1],
	);
	assert.deepStrictEqual(
		lottery
			.filter((row) =>
				expectedPlayIn.tidPlayIn78Loser.includes(row.originalTid),
			)
			.map((row) => row.pick)
			.sort((a, b) => (a ?? 0) - (b ?? 0)),
		[1, 2],
	);
	assert.strictEqual(
		lottery.find((row) => row.originalTid === loserPicks[0]!.originalTid)?.tid,
		loserPicks[0]!.tid,
	);

	const firstRound = modern.draftPicks
		.filter((dp) => dp.round === 1)
		.sort((a, b) => a.pick - b.pick);
	const secondRound = modern.draftPicks
		.filter((dp) => dp.round === 2)
		.sort((a, b) => a.pick - b.pick);
	assert.deepStrictEqual(
		secondRound.slice(0, 16).map((dp) => dp.originalTid),
		lottery.map((dp) => dp.originalTid).reverse(),
	);
	const lotteryTids = new Set(lottery.map((row) => row.originalTid));
	assert.deepStrictEqual(
		secondRound
			.slice(16)
			.map((dp) => dp.originalTid)
			.sort((a, b) => a - b),
		firstRound
			.filter((dp) => !lotteryTids.has(dp.originalTid))
			.map((dp) => dp.originalTid)
			.sort((a, b) => a - b),
	);

	g.setWithoutSavingToDB("godMode", false);
	g.setWithoutSavingToDB("riggedLottery", undefined);
	const legacy = await draft.genOrder(true, undefined, "nba321");
	assert.strictEqual(legacy.draftLotteryResult?.draftType, "nba321");
});

test("nba2027 repeated top-five appearances remain restricted for two seasons", async () => {
	await updateNba2027AfterLottery([0, 1, 2, 3, 4]);
	await updateNba2027AfterLottery([0, 1, 2, 3, 4]);
	const teams = await idb.cache.teams.getAll();
	assert.strictEqual(
		teams.find((team) => team.tid === 0)?.draftLottery?.restricted5,
		2,
	);
});

test("settings switch initializes and clears nba2027 restrictions immediately", async () => {
	await setGameAttributes({ draftType: "nba321" });
	await setGameAttributes({ draftType: "nba2027" });
	const switchedOn = await idb.cache.teams.getAll();
	assert(
		switchedOn.every(
			(team) =>
				team.draftLottery === undefined || team.draftLottery.type === "nba2027",
		),
	);
	await setGameAttributes({ draftType: "nba321" });
	const switchedOff = await idb.cache.teams.getAll();
	assert(switchedOff.every((team) => team.draftLottery === undefined));
});
