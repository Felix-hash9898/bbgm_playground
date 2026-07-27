import { describe, expect, test } from "vitest";
import shouldHighlightScheduleAction from "./scheduleActionHighlight.ts";

describe("schedule action highlighting", () => {
	test("highlights every controlled team only when viewing another team", () => {
		const userTids = [0, 2];

		expect(shouldHighlightScheduleAction(5, [0, 5], userTids)).toBe(true);
		expect(shouldHighlightScheduleAction(5, [2, 5], userTids)).toBe(true);
		expect(shouldHighlightScheduleAction(5, [3, 5], userTids)).toBe(false);
		expect(shouldHighlightScheduleAction(0, [0, 5], userTids)).toBe(false);
		expect(shouldHighlightScheduleAction(2, [0, 2], userTids)).toBe(false);
	});

	test("does not highlight league-wide special events", () => {
		expect(shouldHighlightScheduleAction(5, [-1, -2], [0, 2])).toBe(false);
		expect(shouldHighlightScheduleAction(5, [-3, -3], [0, 2])).toBe(false);
	});
});
