import { beforeEach, expect, test, vi } from "vitest";
import { PHASE } from "../../common/index.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { player, season } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import { getActivePlayoffTids, getPlayers } from "./playerRatings.ts";
import updatePlayerStats from "./playerStats.ts";

const currentSeason = 2016;

const makePlayer = ({
	gp,
	pid,
	statsTid,
	tid,
}: {
	gp: number;
	pid: number;
	statsTid: number;
	tid: number;
}) => {
	const p = player.generate(tid, 25, currentSeason - 1, false, DEFAULT_LEVEL);
	p.pid = pid;
	p.tid = tid;
	p.ratings.at(-1)!.season = currentSeason;
	player.addStatsRow(p, currentSeason, true);
	const row = p.stats.at(-1)!;
	row.season = currentSeason;
	row.tid = statsTid;
	row.gp = gp;
	row.min = gp * 20;
	row.pts = gp * 10;
	p.statsTids = Array.from(new Set(p.stats.map((stats) => stats.tid)));
	return p;
};

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("season", currentSeason);
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	g.setWithoutSavingToDB("numGamesPlayoffSeries", [4]);
	await resetCache({
		players: [
			makePlayer({ gp: 5, pid: 1, statsTid: 0, tid: 0 }),
			makePlayer({ gp: 5, pid: 2, statsTid: 1, tid: 1 }),
			// Traded from the eliminated team to the active team.
			makePlayer({ gp: 5, pid: 3, statsTid: 0, tid: 1 }),
			makePlayer({ gp: 0, pid: 4, statsTid: 1, tid: 1 }),
		],
	});
	await idb.cache.playoffSeries.put({
		currentRound: 0,
		season: currentSeason,
		series: [
			[
				{
					away: { cid: 0, seed: 2, tid: 0, won: 1 },
					home: { cid: 0, seed: 1, tid: 1, won: 4 },
				},
			],
		],
	} as any);
});

test("Player Stats keeps active playoff rosters, including a traded player, and excludes 0 GP", async () => {
	const result = await updatePlayerStats(
		{
			abbrev: "playoffs",
			playoffs: "playoffs",
			season: currentSeason,
			statType: "totals",
		} as any,
		["firstRun"],
		{},
	);

	expect(result?.players.map((p) => p.pid).sort((a, b) => a - b)).toEqual([
		2, 3,
	]);
	expect(result?.players.find((p) => p.pid === 3)?.stats.tid).toBe(0);
});

test("Player Ratings keeps active-team players even when they have no stats", async () => {
	const players = await getPlayers(
		currentSeason,
		"playoffs",
		[],
		[],
		[],
		undefined,
	);

	expect(players.map((p) => p.pid).sort((a, b) => a - b)).toEqual([2, 3, 4]);
});

test("playoff team lookup handles phase transitions and a missing saved series", async () => {
	g.setWithoutSavingToDB("phase", PHASE.PRESEASON);
	await expect(getActivePlayoffTids()).resolves.toEqual(new Set());

	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	await idb.cache.playoffSeries.delete(currentSeason);
	vi.spyOn(season, "genPlayoffSeries").mockResolvedValueOnce({
		series: [
			[
				{
					away: { cid: 0, seed: 2, tid: 0, won: 0 },
					home: { cid: 0, seed: 1, tid: 1, won: 0 },
				},
			],
		],
	} as any);

	await expect(getActivePlayoffTids()).resolves.toEqual(new Set([0, 1]));
});
