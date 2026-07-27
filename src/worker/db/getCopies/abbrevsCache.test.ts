import "fake-indexeddb/auto";
import { beforeEach, describe, expect, test } from "vitest";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import connectLeague from "../connectLeague.ts";
import { idb } from "../index.ts";
import { AbbrevsCache } from "./playersPlus.ts";

describe("AbbrevsCache", () => {
	beforeEach(() => {
		resetG();
	});

	test("falls back to current team info if data changes while loading", () => {
		const cache = new AbbrevsCache(false);
		cache.add(2025, 0);
		(cache as any).state = "loaded";

		expect(cache.get(g.get("season"), 1)).toBe(
			g.get("teamInfoCache")[1]!.abbrev,
		);
		expect(cache.get(g.get("season") - 1, 1)).toBe("???");
		expect(cache.get(2026, 9999)).toBe("???");
	});

	test("loads a historical abbreviation from IndexedDB and never substitutes the current one", async () => {
		await resetCache();
		const lid = 900_000 + Math.floor(Math.random() * 10_000);
		const league = await connectLeague(lid);
		idb.league = league;
		await league.put("teamSeasons", {
			abbrev: "OLD",
			season: 2000,
			tid: 0,
		} as any);

		const cache = new AbbrevsCache(false);
		cache.add(2000, 0);
		cache.add(2000, 1);
		await cache.load();

		expect(cache.get(2000, 0)).toBe("OLD");
		expect(cache.get(2000, 1)).toBe("???");
		expect(cache.get(g.get("season"), 1)).toBe(
			g.get("teamInfoCache")[1]!.abbrev,
		);

		league.close();
		await indexedDB.deleteDatabase(`league${lid}`);
	});
});
