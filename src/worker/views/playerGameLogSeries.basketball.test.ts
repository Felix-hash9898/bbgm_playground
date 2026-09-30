import { beforeEach, describe, expect, test } from "vitest";
import type { Game, HeadToHead, PlayoffSeries } from "../../common/types.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { PHASE } from "../../common/index.ts";
import { player, team } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import advStats from "../util/advStats.basketball.ts";
import playerStatKeys from "../core/player/stats.basketball.ts";
import teamStatKeys from "../core/team/stats.basketball.ts";
import {
	aggregatePlayerGames,
	buildPlayerGameLogSummaries,
	identifyPlayerSeries,
} from "./playerGameLogSeries.basketball.ts";

beforeEach(() => resetG());

const makeGame = (
	gid: number,
	opponentTid: number,
	won: boolean,
	playoffs = true,
): Game => {
	const player = {
		pid: 1,
		pos: "SG",
		gp: 1,
		gs: 1,
		min: 36,
		fg: won ? 8 : 4,
		fga: won ? 16 : 12,
		tp: won ? 3 : 1,
		tpa: won ? 7 : 5,
		ft: 3,
		fta: 4,
		orb: 1,
		drb: 5,
		ast: won ? 7 : 3,
		tov: 2,
		stl: 1,
		blk: 0,
		pf: 2,
		pm: won ? 6 : -6,
		pts: won ? 22 : 12,
	};
	const home = {
		tid: 0,
		players: [player, { ...player, pid: 3, pos: "PF", min: 12 }],
		min: 240,
		fg: 40,
		fga: 85,
		tp: 12,
		tpa: 32,
		ft: 18,
		fta: 24,
		orb: 10,
		drb: 30,
		ast: 25,
		tov: 12,
		stl: 7,
		blk: 5,
		pf: 18,
		pts: won ? 110 : 98,
	};
	const away = {
		tid: opponentTid,
		players: [{ ...player, pid: 2, pos: "PG", min: 36 }],
		min: 240,
		fg: 38,
		fga: 82,
		tp: 10,
		tpa: 28,
		ft: 16,
		fta: 21,
		orb: 9,
		drb: 28,
		ast: 23,
		tov: 13,
		stl: 6,
		blk: 4,
		pf: 19,
		pts: won ? 102 : 106,
	};
	return {
		gid,
		season: 2024,
		playoffs,
		teams: [home, away],
		won: { tid: won ? 0 : opponentTid, pts: won ? home.pts : away.pts },
		lost: { tid: won ? opponentTid : 0, pts: won ? away.pts : home.pts },
		overtimes: 0,
		att: 10000,
	};
};

describe("player game log series", () => {
	test("identifies a completed and in-progress series from saved metadata, including play-in", () => {
		const games = [
			makeGame(1, 9, true),
			makeGame(2, 8, true),
			makeGame(3, 8, false),
		];
		const bracket = {
			season: 2024,
			currentRound: 0,
			series: [
				[
					{
						home: { tid: 0, cid: 0, seed: 1, won: 1 },
						away: { tid: 8, cid: 0, seed: 8, won: 1 },
						gids: [2, 3],
					},
				],
			],
			playIns: [
				[
					{
						home: { tid: 0, cid: 0, seed: 7, won: 1 },
						away: { tid: 9, cid: 0, seed: 8, won: 0 },
						gids: [1],
					},
					{
						home: { tid: 2, cid: 0, seed: 9, won: 0 },
						away: { tid: 3, cid: 0, seed: 10, won: 0 },
					},
				],
			],
		} as PlayoffSeries;
		const records = {
			season: 2024,
			regularSeason: {},
			playoffs: {
				0: {
					9: {
						round: -1,
						result: "won",
						won: 1,
						lost: 0,
						pts: 110,
						oppPts: 102,
					},
					8: {
						round: 0,
						result: undefined,
						won: 1,
						lost: 1,
						pts: 208,
						oppPts: 208,
					},
				},
			},
		} as HeadToHead;
		const series = identifyPlayerSeries(
			games,
			1,
			bracket,
			records,
			(round) => (round === -1 ? "play-in tournament" : "1st round"),
			[7],
		);
		expect(
			series.map(({ round, oppTid, won, lost, result }) => ({
				round,
				oppTid,
				won,
				lost,
				result,
			})),
		).toEqual([
			{ round: -1, oppTid: 9, won: 1, lost: 0, result: "won" },
			{ round: 0, oppTid: 8, won: 1, lost: 1, result: undefined },
		]);
		const opponentSeries = identifyPlayerSeries(
			games,
			2,
			bracket,
			records,
			(round) => (round === -1 ? "play-in tournament" : "1st round"),
			[7],
		);
		expect(opponentSeries[0]).toMatchObject({
			tid: 9,
			oppTid: 0,
			won: 0,
			lost: 1,
			result: "lost",
		});
		expect(
			identifyPlayerSeries(
				[games[0]!],
				1,
				bracket,
				undefined,
				(round) => (round === -1 ? "play-in tournament" : "1st round"),
				[7],
			)[0],
		).toMatchObject({ round: -1, result: "won" });
		const summaries = buildPlayerGameLogSummaries(games, 1, series, {
			8: "NYK",
			9: "MIA",
		});
		expect(summaries.map((row) => row.label)).toEqual([
			"Regular Season",
			"All Playoffs",
			"play-in tournament vs. MIA",
			"1st round vs. NYK",
		]);
		expect(summaries[2]?.record).toBe("Won 1-0");
		expect(summaries[3]?.record).toBe("In progress 1-1");
		expect(summaries[2]?.stats.regular?.gp).toBe(1);
		expect(summaries[2]?.stats.regular?.pts).toBe(22);
		expect(summaries[2]?.stats.regular?.trb).toBe(6);
		expect(summaries[2]?.stats.regular?.ast).toBe(7);
		expect(summaries[2]?.stats.regular?.fgp).toBe(50);
		expect(summaries[2]?.stats.regular?.tpp).toBeCloseTo((3 / 7) * 100);
	});

	test("sums raw makes and attempts before percentages and retains game-high links", () => {
		const stats = aggregatePlayerGames(
			[makeGame(1, 8, true), makeGame(2, 8, false)],
			1,
		)!;
		expect(stats.totals?.gp).toBe(2);
		expect(stats.totals?.pts).toBe(34);
		expect(stats.regular?.pts).toBe(17);
		expect(stats.regular?.trb).toBe(6);
		expect(stats.regular?.ast).toBe(5);
		expect(stats.regular?.fgp).toBeCloseTo((12 / 28) * 100);
		expect(stats.regular?.tpp).toBeCloseTo((4 / 12) * 100);
		expect(stats.per36?.pts).toBe(17);
		expect(stats.gameHighs?.ptsMax).toEqual([22, 1, 0]);
	});

	test("partial historical game data uses tracked-game denominators and omits unavailable advanced stats", () => {
		const first = makeGame(1, 8, true);
		const second = makeGame(2, 8, false);
		first.teams[0].players[0].fgAtRim = 3;
		first.teams[0].players[0].fgaAtRim = 5;
		delete second.teams[0].players[0].pm;
		const stats = aggregatePlayerGames([first, second], 1)!;
		expect(stats.shotLocations?.fgAtRim).toBe(3);
		expect(stats.shotLocations?.fgpAtRim).toBe(60);
		expect(stats.advanced?.per).toBeUndefined();
	});

	test("advanced stats are calculated on the complete scope and never averaged", () => {
		const games = [makeGame(1, 8, true), makeGame(2, 8, false)];
		const both = aggregatePlayerGames(games, 1)!.advanced!;
		const first = aggregatePlayerGames([games[0]!], 1)!.advanced!;
		const second = aggregatePlayerGames([games[1]!], 1)!.advanced!;
		for (const key of ["per", "ortg", "drtg", "ws", "bpm"]) {
			expect(Number.isFinite(both[key])).toBe(true);
		}
		expect(both.per).not.toBeCloseTo((first.per + second.per) / 2, 6);
	});

	test("full-playoff aggregation matches stored playoff totals and advanced stats", async () => {
		g.setWithoutSavingToDB("season", 2024);
		g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
		const games = [makeGame(1, 8, true), makeGame(2, 8, false)];
		const defaults = helpers
			.getTeamsDefault()
			.filter((t) => t.tid === 0 || t.tid === 8);
		const playerRows = [
			{ pid: 1, tid: 0, pos: "SG" },
			{ pid: 3, tid: 0, pos: "PF" },
			{ pid: 2, tid: 8, pos: "PG" },
		].map(({ pid, tid, pos }) => {
			const p = player.generate(tid, 25, 2023, false, DEFAULT_LEVEL);
			p.pid = pid;
			p.ratings.at(-1)!.season = 2024;
			p.ratings.at(-1)!.pos = pos;
			player.addStatsRow(p, 2024, true);
			const stored = p.stats.at(-1)!;
			for (const game of games) {
				const row = game.teams
					.flatMap((t) => t.players)
					.find((row) => row.pid === pid);
				if (!row) {
					continue;
				}
				for (const key of playerStatKeys.raw) {
					if (typeof row[key] === "number") {
						stored[key] += row[key];
					}
				}
			}
			return p;
		});
		const teamRows = defaults.map((t) => {
			const stored = team.genStatsRow(t.tid, true);
			for (const game of games) {
				const own = game.teams.find((row) => row.tid === t.tid)!;
				const opp = game.teams.find((row) => row.tid !== t.tid)!;
				stored.gp++;
				for (const key of teamStatKeys.raw) {
					if (key === "gp") {
						continue;
					}
					const value = key.startsWith("opp")
						? opp[key[3]!.toLowerCase() + key.slice(4)]
						: own[key];
					if (typeof value === "number") {
						stored[key] += value;
					}
				}
			}
			return stored;
		});
		await resetCache({
			players: playerRows,
			teams: defaults.map(team.generate),
			teamSeasons: defaults.map((t) => team.genSeasonRow(t)),
			teamStats: teamRows,
		});
		await advStats();
		const stored = (await idb.cache.players.get(1))!.stats.at(-1)!;
		const calculated = aggregatePlayerGames(games, 1)!;
		for (const key of [
			"gp",
			"min",
			"fg",
			"fga",
			"tp",
			"tpa",
			"pts",
			"orb",
			"drb",
			"ast",
		]) {
			expect(calculated.totals![key]).toBe(stored[key]);
		}
		for (const key of [
			"per",
			"ewa",
			"astp",
			"blkp",
			"orbp",
			"drbp",
			"stlp",
			"trbp",
			"usgp",
			"pm100",
			"onOff100",
			"ortg",
			"drtg",
			"ows",
			"dws",
			"obpm",
			"dbpm",
			"vorp",
		]) {
			expect(calculated.advanced![key]).toBeCloseTo(stored[key], 7);
		}
	});
});
