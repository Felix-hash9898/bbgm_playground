import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PHASE } from "../../common/index.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { idb } from "../db/index.ts";
import connectLeague from "../db/connectLeague.ts";
import { g } from "../util/index.ts";
import { iterateAllPlayersWithStats } from "./leaders.ts";

const currentSeason = 2026;
let lid: number;

const makePlayer = (
	pid: number,
	seasons: { gp: number; season: number }[],
	retiredYear = Infinity,
) =>
	({
		draft: { year: 2010 },
		pid,
		ratings: [{ season: 2010 }],
		retiredYear,
		stats: seasons.map((row) => ({ ...row, playoffs: false, tid: 0 })),
		statsTids: [0],
		tid: 0,
	}) as any;

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("season", currentSeason);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	await resetCache();
	lid = 930_000 + Math.floor(Math.random() * 10_000);
	idb.league = await connectLeague(lid);
});

afterEach(async () => {
	idb.league.close();
	await indexedDB.deleteDatabase(`league${lid}`);
});

test("real leaders iteration skips missing seasons but preserves 0 GP metadata", async () => {
	for (const p of [
		makePlayer(1, []),
		makePlayer(2, [{ gp: 0, season: currentSeason }]),
		makePlayer(3, [{ gp: 1, season: currentSeason }]),
		makePlayer(4, [{ gp: 20, season: currentSeason - 1 }]),
	]) {
		await idb.cache.players.put(p);
	}

	const seen: { gp: number; pid: number }[] = [];
	await iterateAllPlayersWithStats(currentSeason, async (p, season) => {
		const row = p.stats.find((stats) => stats.season === season)!;
		seen.push({ gp: row.gp, pid: p.pid });
	});

	expect(seen).toEqual([
		{ gp: 0, pid: 2 },
		{ gp: 1, pid: 3 },
	]);
});

test("career and all-seasons iteration use persistent rows and current cache copies", async () => {
	const persisted = makePlayer(10, [
		{ gp: 0, season: 2020 },
		{ gp: 30, season: 2021 },
	]);
	await idb.league.put("players", persisted);

	const updated = makePlayer(10, [
		{ gp: 0, season: 2020 },
		{ gp: 30, season: 2021 },
		{ gp: 40, season: 2022 },
	]);
	await idb.cache.players.put(updated);
	await idb.league.put("players", makePlayer(11, []));

	const career: number[] = [];
	await iterateAllPlayersWithStats("career", async (p) => {
		career.push(p.pid);
	});
	expect(career).toEqual([10]);

	const all: [number, number][] = [];
	await iterateAllPlayersWithStats("all", async (p, season) => {
		all.push([p.pid, season as number]);
	});
	expect(all).toEqual([
		[10, 2020],
		[10, 2021],
		[10, 2022],
	]);
});
