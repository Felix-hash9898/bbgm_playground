import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PHASE, PLAYER } from "../../common/index.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { player } from "../core/index.ts";
import connectLeague from "../db/connectLeague.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import updateHistory from "./history.ts";

const season = 2026;
let lid: number;

const makeRetiredPlayer = (pid: number, ws: Array<number | undefined>) => {
	const p = player.generate(0, 30, season - 10, false, DEFAULT_LEVEL);
	p.pid = pid;
	p.tid = PLAYER.RETIRED;
	p.retiredYear = season;
	p.ratings.at(-1)!.season = season;
	p.stats = [];
	p.statsTids = [];
	p.tid = 0;
	for (const [index, value] of ws.entries()) {
		player.addStatsRow(p, season - ws.length + index, false);
		const row = p.stats.at(-1)!;
		row.gp = 20;
		if (value === undefined) {
			delete (row as any).dws;
			delete (row as any).ows;
		} else {
			row.dws = value / 2;
			row.ows = value / 2;
		}
	}
	p.tid = PLAYER.RETIRED;
	return p;
};

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("season", season);
	g.setWithoutSavingToDB("phase", PHASE.PRESEASON);
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB("numGamesPlayoffSeries", [4, 4, 4, 4]);
	g.setWithoutSavingToDB("confs", [] as any);
	lid = 940_000 + Math.floor(Math.random() * 10_000);
	idb.league = await connectLeague(lid);
	await resetCache({
		players: [
			makeRetiredPlayer(1, [undefined, undefined]),
			makeRetiredPlayer(2, [0, 2.5, undefined]),
			makeRetiredPlayer(3, [1, 3]),
		],
		teams: [{ tid: 0 }],
		teamSeasons: [
			{
				abbrev: "ATL",
				expenses: {},
				name: "Gold",
				playoffRoundsWon: -1,
				region: "Atlanta",
				revenues: {},
				season,
				tid: 0,
			},
		],
	});
	await idb.cache.awards.put({
		bestRecordConfs: [],
		season,
	} as any);
});

afterEach(async () => {
	idb.league.close();
	await indexedDB.deleteDatabase(`league${lid}`);
});

test("History sums only known WS rows and leaves fully unknown careers undefined", async () => {
	const result = await updateHistory({ season } as any, ["firstRun"], {});
	if (!result || result.invalidSeason) {
		throw new Error("Expected valid History result");
	}

	expect(
		result.retiredPlayers
			.map((p) => ({ pid: p.pid, ws: p.ws }))
			.sort((a, b) => a.pid - b.pid),
	).toEqual([
		{ pid: 1, ws: undefined },
		{ pid: 2, ws: 2.5 },
		{ pid: 3, ws: 4 },
	]);
});
