import { describe, expect, test } from "vitest";
import { PHASE } from "../../../common/constants.ts";
import type { View } from "../../../common/types.ts";
import {
	getScheduleCSVText,
	getScheduleAfterCSVImport,
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

const context = {
	allStarGame: 0.7,
	allStarGameAlreadyHappened: false,
	maxDayAlreadyPlayed: 0,
	phase: PHASE.REGULAR_SEASON,
	tradeDeadline: 0.6,
} as const;

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
		expect(
			validateAndParseScheduleCSV(csv, teams, {
				...context,
				maxDayAlreadyPlayed: 1,
			}),
		).toEqual([schedule[1], schedule[2]]);
	});

	test.each(["3x", "3.5", "-3", "0", "Infinity"])(
		"rejects a non-integer day: %s",
		(day) => {
			expect(() =>
				validateAndParseScheduleCSV(`Day,ATL,BOS\n${day},BOS,`, teams, context),
			).toThrow("positive whole number");
		},
	);

	test("rejects a blank day containing a schedule entry", () => {
		expect(() =>
			validateAndParseScheduleCSV("Day,ATL,BOS\n,BOS,", teams, context),
		).toThrow("blank day");
	});

	test("rejects a team playing twice on one day", () => {
		expect(() =>
			validateAndParseScheduleCSV(
				"Day,ATL,BOS,CHI,DEN\n2,BOS,,ATL,",
				teams,
				context,
			),
		).toThrow("multiple games");
	});

	test("rejects days that were already played", () => {
		expect(() =>
			validateAndParseScheduleCSV("Day,ATL,BOS\n2,BOS,", teams, {
				...context,
				maxDayAlreadyPlayed: 2,
			}),
		).toThrow("already been played");
	});

	test.each([
		["special first", "Day,ATL,BOS\n2,All-Star Game,\n2,BOS,", "All-Star Game"],
		[
			"normal game first",
			"Day,ATL,BOS\n2,BOS,\n2,All-Star Game,",
			"All-Star Game",
		],
		[
			"trade deadline first",
			"Day,ATL,BOS\n2,Trade Deadline,\n2,BOS,",
			"Trade Deadline",
		],
		[
			"normal game before trade deadline",
			"Day,ATL,BOS\n2,BOS,\n2,Trade Deadline,",
			"Trade Deadline",
		],
	])("rejects a special event sharing its day: %s", (_name, csv, label) => {
		expect(() => validateAndParseScheduleCSV(csv, teams, context)).toThrow(
			`${label} must be the only schedule entry`,
		);
	});

	test("rejects All-Star Game and Trade Deadline on the same day", () => {
		expect(() =>
			validateAndParseScheduleCSV(
				"Day,ATL,BOS\n2,All-Star Game,\n2,Trade Deadline,",
				teams,
				context,
			),
		).toThrow("Trade Deadline must be the only schedule entry");
	});

	test.each(["All-Star Game", "Trade Deadline"])(
		"rejects duplicate %s rows",
		(label) => {
			expect(() =>
				validateAndParseScheduleCSV(
					`Day,ATL,BOS\n2,${label},\n3,${label},`,
					teams,
					context,
				),
			).toThrow(`Duplicate ${label}`);
		},
	);

	test("allows different normal games on separate rows of the same day", () => {
		expect(
			validateAndParseScheduleCSV(
				"Day,ATL,BOS,CHI,DEN\n2,BOS,,,\n2,,,DEN,",
				teams,
				context,
			),
		).toEqual([
			{
				type: "game",
				day: 2,
				awayTid: 1,
				awayAbbrev: "BOS",
				homeTid: 0,
				homeAbbrev: "ATL",
			},
			{
				type: "game",
				day: 2,
				awayTid: 3,
				awayAbbrev: "DEN",
				homeTid: 2,
				homeAbbrev: "CHI",
			},
		]);
	});

	test.each([
		[
			"already happened",
			{ allStarGameAlreadyHappened: true },
			"already happened",
		],
		["disabled", { allStarGame: null }, "disabled"],
		["during playoffs", { allStarGame: -1 }, "during the playoffs"],
	] as const)(
		"rejects an All-Star Game that is %s",
		(_name, override, error) => {
			expect(() =>
				validateAndParseScheduleCSV("Day,ATL,BOS\n2,All-Star Game,", teams, {
					...context,
					...override,
				}),
			).toThrow(error);
		},
	);

	test.each([
		[
			"already happened",
			{ phase: PHASE.AFTER_TRADE_DEADLINE },
			"already happened",
		],
		["disabled", { tradeDeadline: 1 }, "disabled"],
	] as const)(
		"rejects a trade deadline that is %s",
		(_name, override, error) => {
			expect(() =>
				validateAndParseScheduleCSV("Day,ATL,BOS\n2,Trade Deadline,", teams, {
					...context,
					...override,
				}),
			).toThrow(error);
		},
	);

	test("preserves completed games and resets regenerated state", () => {
		const completed = {
			type: "completed",
			day: 1,
			awayTid: 1,
			awayAbbrev: "BOS",
			homeTid: 0,
			homeAbbrev: "ATL",
			forceWin: undefined,
			winnerTid: undefined,
		} as const;
		const imported = getScheduleAfterCSVImport({
			context: { ...context, maxDayAlreadyPlayed: 1 },
			csvText: "Day,ATL,BOS\n2,BOS,",
			schedule: [
				completed,
				{
					type: "game",
					day: 3,
					awayTid: 3,
					awayAbbrev: "DEN",
					homeTid: 2,
					homeAbbrev: "CHI",
				},
			],
			teams,
		});

		expect(imported.regenerated).toBe(false);
		expect(imported.schedule[0]).toEqual(completed);
		expect(imported.schedule).toHaveLength(2);
	});
});
