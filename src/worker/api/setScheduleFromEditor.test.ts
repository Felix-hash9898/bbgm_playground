import { beforeEach, describe, expect, test } from "vitest";
import { PHASE } from "../../common/constants.ts";
import type { View } from "../../common/types.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { getScheduleAfterCSVImport } from "../../ui/views/ScheduleEditor/scheduleCSV.ts";
import { team } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import { setScheduleFromEditor } from "./index.ts";

type Team = View<"scheduleEditor">["teams"][number];

const teams = ["ATL", "BOS"].map(
	(abbrev, tid) =>
		({
			tid,
			seasonAttrs: { abbrev },
		}) as Team,
);

beforeEach(async () => {
	resetG();
	const defaultTeams = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		teams: defaultTeams.map(team.generate),
		teamSeasons: defaultTeams.map((t) => team.genSeasonRow(t)),
	});
});

describe("schedule CSV save integration", () => {
	test("does not write before Save and does not apply regenerated settings", async () => {
		const season = g.get("season");
		const rawSettings = {
			numGames: [
				{ start: season, value: 82 },
				{ start: season + 1, value: 76 },
			],
			divs: [
				{ start: season, value: [{ did: 0, cid: 0, name: "Old" }] },
				{ start: season + 1, value: [{ did: 1, cid: 0, name: "New" }] },
			],
			confs: [
				{ start: season, value: [{ cid: 0, name: "Old" }] },
				{ start: season + 1, value: [{ cid: 0, name: "New" }] },
			],
		};
		for (const [key, value] of Object.entries(rawSettings)) {
			g.setWithoutSavingToDB(key as "numGames", value as any);
		}

		await idb.cache.schedule.add({ awayTid: 0, day: 9, homeTid: 1 });

		const imported = getScheduleAfterCSVImport({
			context: {
				allStarGame: 0.7,
				allStarGameAlreadyHappened: false,
				maxDayAlreadyPlayed: 0,
				phase: PHASE.REGULAR_SEASON,
				tradeDeadline: 0.6,
			},
			csvText: "Day,ATL,BOS\n2,BOS,",
			schedule: [],
			teams,
		});

		expect(imported.regenerated).toBe(false);
		expect(await idb.cache.schedule.getAll()).toEqual([
			{ awayTid: 0, day: 9, gid: 0, homeTid: 1 },
		]);

		await setScheduleFromEditor({
			regenerated: imported.regenerated,
			schedule: imported.schedule,
		});

		expect(await idb.cache.schedule.getAll()).toEqual([
			expect.objectContaining({ awayTid: 1, day: 2, homeTid: 0 }),
		]);
		expect(g.getRaw("numGames")).toEqual(rawSettings.numGames);
		expect(g.getRaw("divs")).toEqual(rawSettings.divs);
		expect(g.getRaw("confs")).toEqual(rawSettings.confs);

		for (const key of ["numGames", "divs", "confs"] as const) {
			expect(await idb.cache.gameAttributes.get(key)).toBeUndefined();
		}
	});

	test("still preserves completed games in the UI state while omitting them from schedule DB writes", async () => {
		const completed = {
			type: "completed",
			day: 1,
			awayAbbrev: "BOS",
			awayTid: 1,
			homeAbbrev: "ATL",
			homeTid: 0,
			forceWin: undefined,
			winnerTid: undefined,
		} as const;
		const imported = getScheduleAfterCSVImport({
			context: {
				allStarGame: 0.7,
				allStarGameAlreadyHappened: false,
				maxDayAlreadyPlayed: 1,
				phase: PHASE.REGULAR_SEASON,
				tradeDeadline: 0.6,
			},
			csvText: "Day,ATL,BOS\n2,BOS,",
			schedule: [completed],
			teams,
		});

		expect(imported.schedule[0]).toEqual(completed);
		await setScheduleFromEditor(imported);
		expect(await idb.cache.schedule.getAll()).toEqual([
			expect.objectContaining({ awayTid: 1, day: 2, homeTid: 0 }),
		]);
	});
});
