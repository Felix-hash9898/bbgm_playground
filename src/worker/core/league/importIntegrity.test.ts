import { describe, expect, test } from "vitest";
import {
	assertUniqueTeamSeasons,
	deleteGeneratedPrimaryKey,
	PRIMARY_KEYS_TO_DELETE,
} from "./importIntegrity.ts";

describe("league import integrity", () => {
	test("deletes only auto-generated unreferenced primary keys", () => {
		for (const [store, key] of Object.entries(PRIMARY_KEYS_TO_DELETE)) {
			const row = { [key]: 123, keep: true };
			expect(deleteGeneratedPrimaryKey(store, row)).toEqual({ keep: true });
		}

		expect(deleteGeneratedPrimaryKey("players", { pid: 3 })).toEqual({
			pid: 3,
		});
	});

	test("reports duplicate tid/season teamSeasons", () => {
		expect(() =>
			assertUniqueTeamSeasons([
				{ tid: 1, season: 2025 },
				{ tid: 2, season: 2025 },
				{ tid: 1, season: 2025 },
			] as any),
		).toThrow("1/2025");
	});
});
