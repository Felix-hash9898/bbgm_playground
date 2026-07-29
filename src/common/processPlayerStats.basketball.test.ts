import { describe, expect, test } from "vitest";
import processPlayerStats from "./processPlayerStats.basketball.ts";

describe("basketball missing stats semantics", () => {
	test("does not convert unknown values in a partial historical row to zero", () => {
		const row = processPlayerStats(
			{ gp: 10, season: 1950 } as any,
			["gp", "pts", "ast"],
			"totals",
			undefined,
			true,
		);

		expect(row).toMatchObject({ gp: 10 });
		expect(row.pts).toBeUndefined();
		expect(row.ast).toBeUndefined();
	});

	test("fills zero for a metadata-only no-games row", () => {
		const row = processPlayerStats(
			{ jerseyNumber: "7", yearsWithTeam: 1 } as any,
			["gp", "pts", "jerseyNumber"],
			"totals",
			undefined,
			true,
		);

		expect(row).toMatchObject({
			gp: 0,
			pts: 0,
			jerseyNumber: "7",
		});
	});
});
