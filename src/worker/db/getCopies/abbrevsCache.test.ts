import { beforeEach, describe, expect, test } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import { AbbrevsCache } from "./playersPlus.ts";

describe("AbbrevsCache", () => {
	beforeEach(() => {
		resetG();
	});

	test("falls back to current team info if data changes while loading", () => {
		const cache = new AbbrevsCache(false);
		cache.add(2025, 0);
		(cache as any).state = "loaded";

		expect(cache.get(2026, 1)).toBe(g.get("teamInfoCache")[1].abbrev);
		expect(cache.get(2026, 9999)).toBe("???");
	});
});
