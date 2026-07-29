import { describe, expect, test } from "vitest";
import { getSeasonsWithStatsForIteration } from "./leaders.ts";

const player = (seasons: number[]) =>
	({
		stats: seasons.map((season) => ({ season })),
	}) as any;

describe("leaders player iteration", () => {
	test("only returns seasons with stats", () => {
		expect(getSeasonsWithStatsForIteration(player([]), 2025)).toEqual([]);
		expect(getSeasonsWithStatsForIteration(player([2024]), 2025)).toEqual([]);
		expect(getSeasonsWithStatsForIteration(player([2025]), 2025)).toEqual([
			2025,
		]);
		expect(getSeasonsWithStatsForIteration(player([]), "career")).toEqual([]);
		expect(getSeasonsWithStatsForIteration(player([2024]), "career")).toEqual([
			"career",
		]);
		expect(
			getSeasonsWithStatsForIteration(player([2023, 2024]), "all"),
		).toEqual([2023, 2024]);
	});
});
