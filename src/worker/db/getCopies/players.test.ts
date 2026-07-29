import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import connectLeague from "../connectLeague.ts";
import { idb } from "../index.ts";
import { getNextRequestedPidIndex } from "./players.ts";

describe("getCopies.players pid cursor", () => {
	test("advances after a missing requested pid", () => {
		expect(getNextRequestedPidIndex([1, 2], 2, 0)).toBe(2);
		expect(getNextRequestedPidIndex([1, 3], 2, 0)).toBe(1);
		expect(getNextRequestedPidIndex([1, 2, 3, 10], 4, 0)).toBe(3);
	});
});

const season = 2026;
let lid: number;

const makePlayer = ({
	draftYear = season - 2,
	pid,
	retiredYear = Infinity,
	source,
	tid = 0,
}: {
	draftYear?: number;
	pid: number;
	retiredYear?: number;
	source?: string;
	tid?: number;
}) =>
	({
		draft: {
			year: draftYear,
		},
		firstName: "Test",
		lastName: source ?? String(pid),
		pid,
		retiredYear,
		statsTids: [],
		tid,
	}) as any;

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("season", season);
	await resetCache();
	lid = 910_000 + Math.floor(Math.random() * 10_000);
	idb.league = await connectLeague(lid);
});

afterEach(async () => {
	idb.league.close();
	await indexedDB.deleteDatabase(`league${lid}`);
});

describe("getCopies.players real IndexedDB integration", () => {
	test("skips missing PIDs, merges cache, preserves request order, and de-duplicates", async () => {
		await idb.league.put(
			"players",
			makePlayer({ pid: 1, source: "database 1" }),
		);
		await idb.league.put(
			"players",
			makePlayer({ pid: 3, source: "database stale" }),
		);
		await idb.league.put(
			"players",
			makePlayer({ pid: 5, source: "database 5" }),
		);
		await idb.cache.players.put(
			makePlayer({ pid: 3, source: "cache current" }),
		);

		await expect(
			idb.getCopies.players({ pids: [1, 2, 5] }),
		).resolves.toMatchObject([{ pid: 1 }, { pid: 5 }]);
		await expect(
			idb.getCopies.players({ pids: [2, 3] }),
		).resolves.toMatchObject([{ pid: 3, lastName: "cache current" }]);
		await expect(
			idb.getCopies.players({ pids: [1, 2, 4, 5] }),
		).resolves.toMatchObject([{ pid: 1 }, { pid: 5 }]);
		await expect(
			idb.getCopies.players({ pids: [5, 1, 5, 3, 3, 99] }),
		).resolves.toMatchObject([
			{ pid: 5 },
			{ pid: 1 },
			{ pid: 3, lastName: "cache current" },
		]);
	});
});
