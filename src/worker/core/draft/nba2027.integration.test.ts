import { afterEach, assert, beforeAll, test } from "vitest";
import { PHASE, REAL_PLAYERS_INFO } from "../../../common/index.ts";
import type {
	DraftLotteryResult,
	DraftPickWithoutKey,
} from "../../../common/types.ts";
import { mockIDBLeague, resetCache, resetG } from "../../../test/helpers.ts";
import getLeague from "../realRosters/getLeague.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { initializeNba2027 } from "./nba2027.ts";

const season = REAL_PLAYERS_INFO!.MAX_SEASON;
type RealLeague = Awaited<ReturnType<typeof getLeague>>;
let realLeague: RealLeague;

beforeAll(async () => {
	realLeague = await getLeague({
		includePlayers: false,
		phase: PHASE.PLAYOFFS,
		randomDebuts: false,
		randomDebutsKeepCurrent: false,
		realDraftRatings: "rookie",
		realStats: "none",
		season,
		type: "real",
	});
	assert(realLeague.draftPicks);
	assert(realLeague.draftLotteryResults);
});

afterEach(() => {
	// @ts-expect-error Test cleanup
	idb.league = undefined;
});

const loadCache = async ({
	draftLotteryResults = [],
	draftPicks = [],
	players = [],
}: {
	draftLotteryResults?: DraftLotteryResult[];
	draftPicks?: DraftPickWithoutKey[];
	players?: any[];
}) => {
	resetG();
	g.setWithoutSavingToDB("season", season);
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	g.setWithoutSavingToDB("nextPhase", undefined);
	idb.league = mockIDBLeague();
	await resetCache({
		players: helpers.deepCopy(players),
		teams: helpers.deepCopy(realLeague.teams),
	});
	for (const dp of draftPicks) {
		await idb.cache.draftPicks.add(helpers.deepCopy(dp));
	}
	for (const result of draftLotteryResults) {
		await idb.cache.draftLotteryResults.add(helpers.deepCopy(result));
	}
};

const dummyResult = (): DraftLotteryResult => ({
	draftType: "dummy",
	result: [],
	season,
});

const realizedTopFive = (
	targetSeason: number,
	originalTids = [0, 1, 2, 3, 4],
): DraftPickWithoutKey[] =>
	originalTids.map((originalTid, index) => ({
		originalTid,
		pick: index + 1,
		round: 1,
		season: targetSeason,
		tid: originalTid,
	}));

test("D51 real league cache initializes nba2027 restrictions from originalTid", async () => {
	await loadCache({
		draftLotteryResults: realLeague.draftLotteryResults,
		draftPicks: realLeague.draftPicks,
	});

	await initializeNba2027();

	const teams = await idb.cache.teams.getAll();
	const topFive = realLeague
		.draftPicks!.filter(
			(dp) =>
				dp.season === season && dp.round === 1 && dp.pick >= 1 && dp.pick <= 5,
		)
		.sort((a, b) => a.pick - b.pick);
	assert.strictEqual(topFive.length, 5);

	const first = teams.find((team) => team.tid === topFive[0]!.originalTid);
	assert.strictEqual(first?.draftLottery?.restricted1, true);
	for (const dp of topFive) {
		const originalTeam = teams.find((team) => team.tid === dp.originalTid);
		assert.strictEqual(originalTeam?.draftLottery?.restricted5, 1);
	}

	const tradedPick = topFive.find((dp) => dp.tid !== dp.originalTid);
	assert(tradedPick);
	assert.strictEqual(
		teams.find((team) => team.tid === tradedPick.originalTid)?.draftLottery
			?.restricted5,
		1,
	);
	assert.strictEqual(
		teams.find((team) => team.tid === tradedPick.tid)?.draftLottery,
		undefined,
	);

	// The empty D51 marker remains in cache, which is how the worker recognizes
	// that the real lottery is complete and avoids running it again.
	assert.deepStrictEqual(
		await idb.getCopy.draftLotteryResults({ season }),
		dummyResult(),
	);
}, 30_000);

test("ordinary and incomplete draft picks do not create partial restrictions", async () => {
	const invalidSets: DraftPickWithoutKey[][] = [
		realizedTopFive(season).map((dp) => ({ ...dp, pick: 0 })),
		realizedTopFive(season).slice(0, 4),
		realizedTopFive(season).map((dp, index) => ({
			...dp,
			pick: index === 4 ? 4 : dp.pick,
		})),
		realizedTopFive(season).map((dp, index) => ({
			...dp,
			pick: index === 4 ? 5.5 : dp.pick,
		})),
	];

	for (const draftPicks of invalidSets) {
		await loadCache({
			draftLotteryResults: [dummyResult()],
			draftPicks,
		});
		await initializeNba2027();
		assert(
			(await idb.cache.teams.getAll()).every(
				(team) => team.draftLottery === undefined,
			),
		);
	}
});

test("complete lottery results take priority over players and draft picks", async () => {
	const resultTids = [10, 11, 12, 13, 14, 15];
	const result: DraftLotteryResult = {
		draftType: "nba2027",
		result: resultTids.map((originalTid, index) => ({
			chances: 1,
			dpid: index,
			originalTid,
			pick: index + 1,
			tid: originalTid,
		})),
		season,
	};
	await loadCache({
		draftLotteryResults: [result],
		draftPicks: realizedTopFive(season),
		players: realizedTopFive(season, [5, 6, 7, 8, 9]).map((dp, index) => ({
			draft: {
				originalTid: dp.originalTid,
				pick: dp.pick,
				round: 1,
				year: season,
			},
			pid: index,
			retiredYear: Infinity,
			tid: 0,
		})),
	});

	await initializeNba2027();
	const teams = await idb.cache.teams.getAll();
	assert.strictEqual(
		teams.find((team) => team.tid === resultTids[0])?.draftLottery?.restricted1,
		true,
	);
	for (const tid of resultTids.slice(0, 5)) {
		assert.strictEqual(
			teams.find((team) => team.tid === tid)?.draftLottery?.restricted5,
			1,
		);
	}
	assert.strictEqual(
		teams.find((team) => team.tid === 0)?.draftLottery,
		undefined,
	);
});

test("drafted players remain the fallback ahead of realized draft picks", async () => {
	const playerTids = [5, 6, 7, 8, 9];
	await loadCache({
		draftLotteryResults: [dummyResult()],
		draftPicks: realizedTopFive(season),
		players: realizedTopFive(season, playerTids).map((dp, index) => ({
			draft: {
				originalTid: dp.originalTid,
				pick: dp.pick,
				round: 1,
				year: season,
			},
			pid: index,
			retiredYear: Infinity,
			tid: 0,
		})),
	});

	await initializeNba2027();
	const teams = await idb.cache.teams.getAll();
	assert.strictEqual(
		teams.find((team) => team.tid === playerTids[0])?.draftLottery?.restricted1,
		true,
	);
	for (const tid of playerTids) {
		assert.strictEqual(
			teams.find((team) => team.tid === tid)?.draftLottery?.restricted5,
			1,
		);
	}
	assert.strictEqual(
		teams.find((team) => team.tid === 0)?.draftLottery,
		undefined,
	);
});

test("realized top-five picks in consecutive seasons produce restricted5 2", async () => {
	await loadCache({
		draftLotteryResults: [dummyResult()],
		draftPicks: [...realizedTopFive(season), ...realizedTopFive(season - 1)],
	});

	await initializeNba2027();
	const teams = await idb.cache.teams.getAll();
	for (const tid of [0, 1, 2, 3, 4]) {
		assert.strictEqual(
			teams.find((team) => team.tid === tid)?.draftLottery?.restricted5,
			2,
		);
	}
});
