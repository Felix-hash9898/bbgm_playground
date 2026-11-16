import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PHASE } from "../../common/index.ts";
import type { Game } from "../../common/types.ts";
import { resetG } from "../../test/helpers.ts";
import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import { aggregatePlayerGames } from "./playerGameLogSeries.basketball.ts";
import statsVisualization from "./statsVisualization.ts";

const makeGame = (gid: number, good: boolean): Game => {
	const player = {
		pid: 1,
		pos: "SG",
		gp: 1,
		gs: 1,
		min: 34,
		fg: good ? 10 : 3,
		fga: good ? 17 : 13,
		tp: good ? 4 : 1,
		tpa: good ? 8 : 6,
		ft: good ? 5 : 2,
		fta: good ? 6 : 3,
		orb: 1,
		drb: good ? 7 : 3,
		ast: good ? 8 : 2,
		tov: good ? 2 : 4,
		stl: good ? 2 : 0,
		blk: 1,
		ba: 0,
		pf: 2,
		pm: good ? 9 : -11,
		pts: good ? 29 : 9,
	};
	const teammate = {
		...player,
		pid: 3,
		pos: "C",
		min: 30,
		fg: 6,
		fga: 11,
		tp: 0,
		tpa: 1,
		ft: 2,
		fta: 4,
		pts: 14,
		pm: good ? 4 : -6,
	};
	const opponent = { ...player, pid: 2, pos: "PG", min: 36, pm: good ? -9 : 11 };
	const home = {
		tid: 0,
		players: [player, teammate],
		min: 240,
		fg: 41,
		fga: 86,
		tp: 12,
		tpa: 33,
		ft: 17,
		fta: 22,
		orb: 10,
		drb: 33,
		ast: 26,
		tov: 13,
		stl: 8,
		blk: 5,
		pf: 18,
		pts: good ? 111 : 95,
	};
	const away = {
		tid: 1,
		players: [opponent],
		min: 240,
		fg: 39,
		fga: 84,
		tp: 11,
		tpa: 30,
		ft: 15,
		fta: 20,
		orb: 9,
		drb: 31,
		ast: 23,
		tov: 14,
		stl: 7,
		blk: 4,
		pf: 20,
		pts: good ? 102 : 106,
	};
	return {
		gid,
		season: 2024,
		playoffs: false,
		numPeriods: 4,
		teams: [home, away],
		won: good ? { tid: 0, pts: home.pts } : { tid: 1, pts: away.pts },
		lost: good ? { tid: 1, pts: away.pts } : { tid: 0, pts: home.pts },
		overtimes: 0,
		att: 10000,
	} as unknown as Game;
};

const games = [makeGame(1, true), makeGame(2, false), makeGame(3, true)];

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("season", 2024);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB(
		"teamInfoCache",
		helpers.getTeamsDefault().map(({ abbrev, region, name }) => ({
			abbrev,
			region,
			name,
			imgURL: undefined,
			imgURLSmall: undefined,
			disabled: false,
		})),
	);
	vi.spyOn(idb.cache.players, "indexGetAll").mockResolvedValue([] as any);
	vi.spyOn(idb.getCopies, "playersPlus").mockResolvedValue([
		{
			pid: 1,
			firstName: "Test",
			lastName: "Player",
			tid: 0,
			ratings: { pos: "SG" },
			stats: { abbrev: "ATL", gp: 3, min: 102, tid: 0 },
		},
	] as any);
	vi.spyOn(idb.getCopies, "games").mockResolvedValue(
		structuredClone(games) as any,
	);
});

afterEach(() => vi.restoreAllMocks());

const load = (metric: string, windowSize: number) =>
	statsVisualization(
		{ metric, minMinutes: 0, pid: 1, season: 2024, windowSize },
		["firstRun"],
		{},
	) as Promise<any>;

describe("Stats Visualization advanced metrics", () => {
	test("offers the advanced trend metrics from the removed Form Visualization page", async () => {
		const { metricOptions } = await load("pts", 1);
		for (const metric of [
			"per",
			"ewa",
			"tpar",
			"ftr",
			"tovp",
			"usgp",
			"ortg",
			"drtg",
			"ows",
			"dws",
			"ws",
			"ws48",
			"obpm",
			"dbpm",
			"bpm",
			"vorp",
		]) {
			expect(metricOptions).toContain(metric);
		}
		// Existing box score metrics are kept once each, and no Form metric exists
		expect(metricOptions.filter((metric: string) => metric === "tsp")).toEqual(
			["tsp"],
		);
		expect(metricOptions).toContain("gmsc");
		expect(metricOptions).not.toContain("form");
	});

	test.each(["per", "bpm", "ws", "ws48", "ortg", "usgp"])(
		"%s single-game and rolling values match the canonical advanced stat calculation",
		async (metric) => {
			const result = await load(metric, 2);
			expect(result.metric).toBe(metric);
			expect(result.games).toHaveLength(3);

			for (const [i, row] of result.games.entries()) {
				const single = aggregatePlayerGames([games[i]!], 1)!.advanced![
					metric
				];
				const window = aggregatePlayerGames(
					games.slice(Math.max(0, i - 1), i + 1),
					1,
				)!.advanced![metric];
				expect(Number.isFinite(row.rawValue)).toBe(true);
				expect(row.rawValue).toBeCloseTo(single, 10);
				expect(row.displayValue).toBeCloseTo(window, 10);
			}

			// Good games produce a better single-game rating than the bad game
			if (["per", "bpm", "ws", "ws48", "ortg"].includes(metric)) {
				expect(result.games[0].rawValue).toBeGreaterThan(
					result.games[1].rawValue,
				);
			}
		},
	);

	test("rolling advanced values are computed on the combined window, not averaged", async () => {
		const result = await load("per", 2);
		const second = result.games[1];
		expect(second.windowSize).toBe(2);
		expect(second.displayValue).not.toBeCloseTo(
			(result.games[0].rawValue + second.rawValue) / 2,
			6,
		);
	});

	test("cumulative advanced metrics are window totals", async () => {
		const ws = await load("ws", 3);
		const last = ws.games[2];
		expect(last.windowSize).toBe(3);
		const ows = aggregatePlayerGames(games, 1)!.advanced!.ows;
		const dws = aggregatePlayerGames(games, 1)!.advanced!.dws;
		expect(last.displayValue).toBeCloseTo(ows + dws, 10);
	});

	test("box score metrics are unchanged", async () => {
		const result = await load("pts", 3);
		expect(result.games.map((game: any) => game.rawValue)).toEqual([29, 9, 29]);
		expect(result.games[2].displayValue).toBeCloseTo((29 + 9 + 29) / 3, 10);
	});

	test("advanced metrics are omitted for old box scores missing required fields", async () => {
		const legacy = structuredClone(games);
		for (const game of legacy) {
			delete (game.teams[0].players[0] as any).pm;
		}
		vi.spyOn(idb.getCopies, "games").mockResolvedValue(legacy as any);
		const result = await load("per", 1);
		expect(result.games).toHaveLength(3);
		for (const row of result.games) {
			expect(row.rawValue).toBeUndefined();
			expect(row.displayValue).toBeUndefined();
		}
	});
});
