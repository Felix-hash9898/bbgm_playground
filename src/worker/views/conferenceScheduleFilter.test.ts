import { describe, expect, test } from "vitest";
import { isGameInConference } from "./conferenceScheduleFilter.ts";

describe("daily schedule conference filter", () => {
	const tids = new Set([1, 2]);

	test("keeps games involving the selected conference", () => {
		expect(isGameInConference({ awayTid: 1, homeTid: 9 }, tids)).toBe(true);
		expect(isGameInConference({ awayTid: 8, homeTid: 2 }, tids)).toBe(true);
		expect(isGameInConference({ awayTid: 8, homeTid: 9 }, tids)).toBe(false);
	});

	test("keeps league-wide special events", () => {
		expect(isGameInConference({ awayTid: -2, homeTid: -1 }, tids)).toBe(true);
		expect(isGameInConference({ awayTid: -3, homeTid: -3 }, tids)).toBe(true);
	});
});
