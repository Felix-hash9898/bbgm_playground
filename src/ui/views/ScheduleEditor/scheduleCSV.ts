import { csvFormatRows, csvParse } from "d3-dsv";
import type { View } from "../../../common/types.ts";
import { groupByUnique, orderBy } from "../../../common/utils.ts";

type Schedule = View<"scheduleEditor">["schedule"];
type Team = View<"scheduleEditor">["teams"][number];

export const ALL_STAR_GAME_LABEL = "All-Star Game";
export const TRADE_DEADLINE_LABEL = "Trade Deadline";

const findDuplicates = (values: string[]) => {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const value of values) {
		if (seen.has(value)) {
			duplicates.add(value);
		} else {
			seen.add(value);
		}
	}

	return duplicates;
};

export const validateAndParseScheduleCSV = (
	csvText: string,
	teams: Team[],
	maxDayAlreadyPlayed: number,
): Schedule => {
	const parsed = csvParse(csvText);
	const dayColumn = parsed.columns[0];
	if (dayColumn?.trim() !== "Day") {
		throw new Error('First column must be "Day"');
	}

	const teamsByAbbrev = groupByUnique(teams, (t) => t.seasonAttrs.abbrev);
	const teamColumns = parsed.columns.slice(1).map((raw) => ({
		abbrev: raw.trim(),
		raw,
	}));
	if (!teamColumns[0]?.abbrev) {
		throw new Error("No team columns found");
	}

	for (const { abbrev } of teamColumns) {
		if (!teamsByAbbrev[abbrev]) {
			throw new Error(
				`Unknown abbrev in header: "${abbrev}". Available teams: ${teams.map((t) => t.seasonAttrs.abbrev).join(", ")}`,
			);
		}
	}
	const duplicateAbbrevs = findDuplicates(
		teamColumns.map(({ abbrev }) => abbrev),
	);
	if (duplicateAbbrevs.size > 0) {
		throw new Error(
			`Duplicate abbrevs in header: ${Array.from(duplicateAbbrevs).join(", ")}`,
		);
	}

	const gamesByDay = new Map<number, { away: Team; home: Team }[]>();
	const teamsByDay = new Map<number, Set<number>>();
	const specials: Extract<
		Schedule[number],
		{ type: "allStarGame" | "tradeDeadline" }
	>[] = [];
	const specialTypes = new Set<"allStarGame" | "tradeDeadline">();

	for (const row of parsed) {
		const dayText = row[dayColumn]?.trim();
		if (!dayText) {
			continue;
		}
		if (!/^\d+$/.test(dayText)) {
			throw new Error(`Invalid day "${dayText}". Must be a whole number.`);
		}
		const day = Number(dayText);
		if (!Number.isSafeInteger(day)) {
			throw new Error(`Invalid day "${dayText}". Must be a safe integer.`);
		}
		if (day <= maxDayAlreadyPlayed) {
			throw new Error(
				`Day ${day} has already been played. Cannot upload schedules for days <= ${maxDayAlreadyPlayed}.`,
			);
		}

		const firstCell = row[teamColumns[0]!.raw]?.trim();
		if (
			firstCell === ALL_STAR_GAME_LABEL ||
			firstCell === TRADE_DEADLINE_LABEL
		) {
			if (
				teamColumns
					.slice(1)
					.some(({ raw }) => Boolean(row[raw]?.trim()))
			) {
				throw new Error(`${firstCell} must be the only entry on day ${day}`);
			}
			const type =
				firstCell === ALL_STAR_GAME_LABEL
					? "allStarGame"
					: "tradeDeadline";
			if (specialTypes.has(type)) {
				throw new Error(`Duplicate ${firstCell}`);
			}
			specialTypes.add(type);
			specials.push(
				type === "allStarGame"
					? { type, day, homeTid: -1, awayTid: -2 }
					: { type, day, homeTid: -3, awayTid: -3 },
			);
			continue;
		}

		let dayGames = gamesByDay.get(day);
		if (!dayGames) {
			dayGames = [];
			gamesByDay.set(day, dayGames);
		}
		let teamsOnDay = teamsByDay.get(day);
		if (!teamsOnDay) {
			teamsOnDay = new Set();
			teamsByDay.set(day, teamsOnDay);
		}

		for (const { abbrev: homeAbbrev, raw } of teamColumns) {
			const awayAbbrev = row[raw]?.trim();
			if (!awayAbbrev) {
				continue;
			}

			const home = teamsByAbbrev[homeAbbrev]!;
			const away = teamsByAbbrev[awayAbbrev];
			if (!away) {
				throw new Error(
					`Unknown opponent "${awayAbbrev}" for ${homeAbbrev} on day ${day}`,
				);
			}
			if (home.tid === away.tid) {
				throw new Error(`${homeAbbrev} cannot play itself on day ${day}`);
			}
			for (const t of [home, away]) {
				if (teamsOnDay.has(t.tid)) {
					throw new Error(
						`${t.seasonAttrs.abbrev} has multiple games on day ${day}`,
					);
				}
			}

			teamsOnDay.add(home.tid);
			teamsOnDay.add(away.tid);
			dayGames.push({ away, home });
		}
	}

	const newSchedule: Schedule = [...specials];
	for (const [day, games] of gamesByDay) {
		for (const { away, home } of games) {
			newSchedule.push({
				type: "game",
				day,
				awayTid: away.tid,
				awayAbbrev: away.seasonAttrs.abbrev,
				homeTid: home.tid,
				homeAbbrev: home.seasonAttrs.abbrev,
			});
		}
	}

	return orderBy(newSchedule, ["day"]);
};

export const getScheduleCSVText = (schedule: Schedule, teams: Team[]) => {
	const sortedTeams = orderBy(teams, (t) => t.seasonAttrs.abbrev);
	const abbrevs = sortedTeams.map((t) => t.seasonAttrs.abbrev);
	const abbrevToIndex = new Map(abbrevs.map((abbrev, i) => [abbrev, i]));
	const gamesByDay = new Map<number, Schedule[number][]>();

	for (const game of schedule) {
		if (game.type === "completed" || game.type === "placeholder") {
			continue;
		}
		const games = gamesByDay.get(game.day);
		if (games) {
			games.push(game);
		} else {
			gamesByDay.set(game.day, [game]);
		}
	}

	const rows: string[][] = [["Day", ...abbrevs]];
	for (const day of orderBy(Array.from(gamesByDay.keys()), (value) => value)) {
		const row = Array<string>(abbrevs.length + 1).fill("");
		row[0] = String(day);
		for (const game of gamesByDay.get(day)!) {
			if (game.type === "allStarGame") {
				row[1] = ALL_STAR_GAME_LABEL;
			} else if (game.type === "tradeDeadline") {
				row[1] = TRADE_DEADLINE_LABEL;
			} else if (game.type === "game") {
				const homeIndex = abbrevToIndex.get(game.homeAbbrev);
				if (homeIndex !== undefined) {
					row[homeIndex + 1] = game.awayAbbrev;
				}
			}
		}
		rows.push(row);
	}

	return csvFormatRows(rows);
};
