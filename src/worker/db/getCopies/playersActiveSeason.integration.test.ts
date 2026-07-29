import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, test } from "vitest";
import { PHASE } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import connectLeague from "../connectLeague.ts";
import { idb } from "../index.ts";

const season = 2026;
let lid: number;

const makePlayer = ({
	draftYear,
	pid,
	retiredYear = Infinity,
}: {
	draftYear: number;
	pid: number;
	retiredYear?: number;
}) =>
	({
		draft: {
			year: draftYear,
		},
		pid,
		retiredYear,
		statsTids: [],
		tid: 0,
	}) as any;

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("season", season);
	g.setWithoutSavingToDB("phase", PHASE.AFTER_DRAFT);
	await resetCache();
	lid = 920_000 + Math.floor(Math.random() * 10_000);
	idb.league = await connectLeague(lid);
});

afterEach(async () => {
	idb.league.close();
	await indexedDB.deleteDatabase(`league${lid}`);
});

test("applies active-season draft and retirement boundaries to DB and cache", async () => {
	for (const player of [
		makePlayer({ draftYear: season, pid: 10 }),
		makePlayer({ draftYear: season - 1, pid: 11 }),
		makePlayer({
			draftYear: season - 1,
			pid: 12,
			retiredYear: season,
		}),
		makePlayer({
			draftYear: season - 2,
			pid: 13,
			retiredYear: season - 1,
		}),
		makePlayer({ draftYear: season - 2, pid: 14 }),
	]) {
		await idb.league.put("players", player);
	}
	for (const player of [
		makePlayer({ draftYear: season, pid: 20 }),
		makePlayer({ draftYear: season - 1, pid: 21 }),
		makePlayer({
			draftYear: season - 1,
			pid: 22,
			retiredYear: season,
		}),
		makePlayer({
			draftYear: season - 2,
			pid: 23,
			retiredYear: season - 1,
		}),
	]) {
		await idb.cache.players.put(player);
	}

	const current = await idb.getCopies.players({ activeSeason: season });
	expect(current.map((p) => p.pid).sort((a, b) => a - b)).toEqual([
		11, 12, 14, 21, 22,
	]);

	const historical = await idb.getCopies.players({
		activeSeason: season - 1,
	});
	expect(historical.map((p) => p.pid).sort((a, b) => a - b)).toEqual([
		13, 14, 23,
	]);

	// Drafted players remain excluded after the draft until the next season
	// begins, but are included in that next season's query.
	const nextSeason = await idb.getCopies.players({
		activeSeason: season + 1,
	});
	expect(nextSeason.map((p) => p.pid)).toContain(10);
	expect(nextSeason.map((p) => p.pid)).toContain(20);
});
