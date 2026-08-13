import { assert, beforeEach, describe, test, vi } from "vitest";
import type Cache from "../../db/Cache.ts";
import type { CapturedLeagueContext } from "../capturedContext.ts";
import type { Team } from "../../../common/types.ts";
import { resetG } from "../../../test/helpers.ts";
import rosterAutoSortBaseball from "./rosterAutoSort.baseball.ts";
import rosterAutoSortBasketball from "./rosterAutoSort.basketball.ts";
import rosterAutoSortFootball from "./rosterAutoSort.football.ts";
import rosterAutoSortHockey from "./rosterAutoSort.hockey.ts";
import { player } from "../index.ts";
import { g, local } from "../../util/index.ts";

const makePlayer = (pid: number, pos: string, ovrs: Record<string, number>) =>
	({
		pid,
		tid: 0,
		draft: {
			year: 2000,
			tid: 0,
			originalTid: 0,
			round: 1,
			pick: 1,
			ovr: 50,
			pot: 50,
			skills: [],
		},
		ratings: [
			{
				season: 2016,
				pos,
				ovrs,
				fuzz: 0,
			},
		],
		stats: [],
		valueNoPot: 50,
		valueNoPotFuzz: 50,
		rosterOrder: 666,
	}) as any;

const makeCache = (teamRow: Team, players: any[]) => {
	const teamPuts: Team[] = [];
	const playerPuts: any[] = [];
	const cache = {
		players: {
			indexGetAll: vi.fn(async () => players),
			put: vi.fn(async (p: any) => playerPuts.push(p)),
		},
		teams: {
			get: vi.fn(async () => structuredClone(teamRow)),
			put: vi.fn(async (t: Team) => teamPuts.push(t)),
		},
	};
	return {
		cache: cache as unknown as Cache,
		teamPuts,
		playerPuts,
	};
};

const context = (cache: Cache) =>
	({
		cache,
		leagueDB: undefined,
		lid: 1,
		season: 2016,
		userTid: 0,
		repeatSeason: g.get("repeatSeason"),
		ovrMeanStd: {
			playerOvrMean: local.playerOvrMean,
			playerOvrStd: local.playerOvrStd,
			playerOvrMeanStdStale: local.playerOvrMeanStdStale,
		},
	}) as unknown as CapturedLeagueContext;

const allOvr = (keys: string[]) =>
	Object.fromEntries(keys.map((key) => [key, 80]));

const runAndAssertRosterWrite = async (
	run: Promise<void>,
	setup: ReturnType<typeof makeCache>,
) => {
	await run;
	assert.strictEqual(setup.teamPuts.length + setup.playerPuts.length, 1);
};

beforeEach(() => resetG());

describe("rosterAutoSort normal behavior", () => {
	test.each([
		[
			"basketball",
			() => {
				const p = player.generate(-1, 30, 2008, true, 50) as any;
				p.pid = 1;
				p.ratings.at(-1)!.season = 2016;
				const setup = makeCache(makeTeam({}), [p]);
				return runAndAssertRosterWrite(
					rosterAutoSortBasketball(0, false, undefined, context(setup.cache)),
					setup,
				);
			},
		],
		[
			"football",
			() => {
				const setup = makeCache(
					makeTeam({
						QB: [],
						RB: [],
						WR: [],
						TE: [],
						OL: [],
						DL: [],
						LB: [],
						CB: [],
						S: [],
						K: [],
						P: [],
						KR: [],
						PR: [],
					}),
					[
						makePlayer(
							1,
							"QB",
							allOvr([
								"QB",
								"RB",
								"WR",
								"TE",
								"OL",
								"DL",
								"LB",
								"CB",
								"S",
								"K",
								"P",
								"KR",
								"PR",
							]),
						),
					],
				);
				return runAndAssertRosterWrite(
					rosterAutoSortFootball(0, false, undefined, context(setup.cache)),
					setup,
				);
			},
		],
		[
			"baseball",
			() => {
				const setup = makeCache(
					makeTeam({ L: [], LP: [], D: [], DP: [], P: [] }),
					[
						makePlayer(
							1,
							"SP",
							allOvr([
								"C",
								"1B",
								"2B",
								"3B",
								"SS",
								"LF",
								"CF",
								"RF",
								"DH",
								"SP",
								"RP",
							]),
						),
					],
				);
				return runAndAssertRosterWrite(
					rosterAutoSortBaseball(0, false, undefined, context(setup.cache)),
					setup,
				);
			},
		],
		[
			"hockey",
			() => {
				const setup = makeCache(makeTeam({ F: [], D: [], G: [] }), [
					makePlayer(1, "G", allOvr(["F", "D", "G"])),
				]);
				return runAndAssertRosterWrite(
					rosterAutoSortHockey(0, false, undefined, context(setup.cache)),
					setup,
				);
			},
		],
	] as const)("%s preserves a valid sorted roster", async (_name, run) => {
		await run();
	});
});

const makeTeam = (depth: Record<string, number[]>) =>
	({
		tid: 0,
		depth,
	}) as unknown as Team;
