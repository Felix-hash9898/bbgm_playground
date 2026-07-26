import { describe, expect, test } from "vitest";
import type { View } from "../../../common/types.ts";
import {
	getScheduleCSVText,
	validateAndParseScheduleCSV,
} from "./scheduleCSV.ts";

type Team = View<"scheduleEditor">["teams"][number];

const teams = ["ATL", "BOS", "CHI", "DEN"].map(
	(abbrev, tid) =>
		({
			tid,
			seasonAttrs: { abbrev },
		}) as Team,
);

describe("schedule CSV", () => {
	test("exports and imports future games and special days", () => {
		const schedule = [
			{
				type: "completed",
				day: 1,
				awayTid: 1,
				awayAbbrev: "BOS",
				homeTid: 0,
				homeAbbrev: "ATL",
			},
			{
				type: "game",
				day: 2,
				awayTid: 2,
				awayAbbrev: "CHI",
				homeTid: 3,
				homeAbbrev: "DEN",
			},
			{ type: "allStarGame", day: 3, awayTid: -2, homeTid: -1 },
			{ type: "placeholder", day: 4 },
		] as View<"scheduleEditor">["schedule"];

		const csv = getScheduleCSVText(schedule, teams);
		expect(csv).toContain("Day,ATL,BOS,CHI,DEN");
		expect(csv).not.toContain("BOS,ATL");
		expect(validateAndParseScheduleCSV(csv, teams, 1)).toEqual([
			schedule[1],
			schedule[2],
		]);
	});

	test.each(["3x", "3.5", "-3", "Infinity"])(
		"rejects a non-integer day: %s",
		(day) => {
			expect(() =>
				validateAndParseScheduleCSV(`Day,ATL,BOS\n${day},BOS,`, teams, 0),
			).toThrow("whole number");
		},
	);

	test("rejects a team playing twice on one day", () => {
		expect(() =>
			validateAndParseScheduleCSV(
				"Day,ATL,BOS,CHI,DEN\n2,BOS,,ATL,",
				teams,
				0,
			),
		).toThrow("multiple games");
	});

	test("rejects days that were already played", () => {
		expect(() =>
			validateAndParseScheduleCSV("Day,ATL,BOS\n2,BOS,", teams, 2),
		).toThrow("already been played");
	});
});
