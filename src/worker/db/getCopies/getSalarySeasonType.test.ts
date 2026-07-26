import { assert, describe, test } from "vitest";
import { PHASE } from "../../../common/index.ts";
import { getSalarySeasonType } from "./getSalarySeasonType.ts";

describe("getSalarySeasonType", () => {
	test("classifies preseason and regular-season salaries", () => {
		assert.equal(getSalarySeasonType(2025, 2026, PHASE.PRESEASON), "past");
		assert.equal(getSalarySeasonType(2026, 2026, PHASE.PRESEASON), "current");
		assert.equal(
			getSalarySeasonType(2027, 2026, PHASE.REGULAR_SEASON),
			"future",
		);
	});

	test("rolls the current salary forward after the playoffs", () => {
		for (const phase of [PHASE.RESIGN_PLAYERS, PHASE.FREE_AGENCY]) {
			assert.equal(getSalarySeasonType(2026, 2026, phase), "past");
			assert.equal(getSalarySeasonType(2027, 2026, phase), "current");
			assert.equal(getSalarySeasonType(2028, 2026, phase), "future");
		}
	});
});
