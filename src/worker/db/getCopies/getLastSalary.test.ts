import { assert, describe, test } from "vitest";
import { getLastSalary } from "./getLastSalary.ts";

describe("getLastSalary", () => {
	test.each([
		["contract option", [{ amount: 12_000, season: 2027 }], 12],
		["two-way contract", [{ amount: 600, season: 2027 }], 0.6],
		["minimum contract", [{ amount: 1200, season: 2027 }], 1.2],
		[
			"midseason release and re-sign",
			[
				{ amount: 8000, season: 2027 },
				{ amount: 1500, season: 2027 },
			],
			1.5,
		],
	] as const)("returns the last salary for %s", (_name, salaries, expected) => {
		assert.equal(getLastSalary([...salaries]), expected);
	});

	test("skips an invalid trailing row and handles an empty history", () => {
		assert.equal(
			getLastSalary([
				{ amount: 2000, season: 2026 },
				{ amount: Number.NaN, season: 2027 },
			]),
			2,
		);
		assert.isUndefined(getLastSalary([]));
	});
});
