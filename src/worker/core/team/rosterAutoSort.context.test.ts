import { assert, beforeEach, describe, test, vi } from "vitest";
import type Cache from "../../db/Cache.ts";
import { idb } from "../../db/index.ts";
import type { CapturedLeagueContext } from "../capturedContext.ts";
import rosterAutoSortBaseball from "./rosterAutoSort.baseball.ts";
import rosterAutoSortBasketball from "./rosterAutoSort.basketball.ts";
import rosterAutoSortFootball from "./rosterAutoSort.football.ts";
import rosterAutoSortHockey from "./rosterAutoSort.hockey.ts";
import type { Team } from "../../../common/types.ts";
import { player, team } from "../index.ts";
import { resetG } from "../../../test/helpers.ts";
import { g, local } from "../../util/index.ts";

const makeGenDepthMock = () =>
	vi.fn(
		async (
			_players: unknown[],
			depth: unknown,
			_onlyNew?: boolean,
			_pos?: string,
			_season?: number,
		) => depth,
	);
const genDepthBaseball = makeGenDepthMock();
const genDepthFootball = makeGenDepthMock();
const genDepthHockey = makeGenDepthMock();
vi.mock("./genDepth.baseball.ts", () => ({ default: genDepthBaseball }));
vi.mock("./genDepth.football.ts", () => ({ default: genDepthFootball }));
vi.mock("./genDepth.hockey.ts", () => ({ default: genDepthHockey }));

const makeContext = (cache: Cache, userTid = 0) =>
	({
		cache,
		leagueDB: undefined,
		lid: 1,
		season: 2032,
		userTid,
		repeatSeason: g.get("repeatSeason"),
		ovrMeanStd: {
			playerOvrMean: local.playerOvrMean,
			playerOvrStd: local.playerOvrStd,
			playerOvrMeanStdStale: local.playerOvrMeanStdStale,
		},
	}) as unknown as CapturedLeagueContext;

const makeCache = (teamRow: Team, players: unknown[]) =>
	({
		players: {
			indexGetAll: vi.fn(async () => players),
			put: vi.fn(async () => {}),
		},
		teams: {
			get: vi.fn(async () => structuredClone(teamRow)),
			put: vi.fn(async () => {}),
		},
	}) as unknown as Cache;

const makeTeam = () =>
	team.generate({
		tid: 0,
		cid: 0,
		did: 0,
		region: "Test",
		name: "Test",
		abbrev: "TST",
		pop: 1,
		depth: {
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
		},
	});

beforeEach(() => {
	resetG();
	genDepthBaseball.mockClear();
	genDepthFootball.mockClear();
	genDepthHockey.mockClear();
});

describe("rosterAutoSort captured context", () => {
	test("basketball keeps put on the captured cache after a read-time league switch", async () => {
		const p = player.generate(-1, 30, 2018, true, 50) as any;
		p.pid = 1;
		p.ratings.at(-1)!.season = 2032;
		p.valueNoPot = 50;
		p.valueNoPotFuzz = 50;
		const firstTeam = makeTeam();
		const firstCache = makeCache(firstTeam, [p]);
		const secondCache = makeCache(makeTeam(), []);
		const originalCache = idb.cache;
		(firstCache.players.indexGetAll as any).mockImplementationOnce(async () => {
			idb.cache = secondCache;
			return [p];
		});
		const localBefore = {
			playerOvrMean: local.playerOvrMean,
			playerOvrStd: local.playerOvrStd,
			playerOvrMeanStdStale: local.playerOvrMeanStdStale,
		};

		try {
			await rosterAutoSortBasketball(
				0,
				false,
				undefined,
				makeContext(firstCache),
			);
		} finally {
			idb.cache = originalCache;
		}

		assert.strictEqual((firstCache.players.put as any).mock.calls.length, 1);
		assert.strictEqual((secondCache.players.put as any).mock.calls.length, 0);
		assert.deepStrictEqual(
			{
				playerOvrMean: local.playerOvrMean,
				playerOvrStd: local.playerOvrStd,
				playerOvrMeanStdStale: local.playerOvrMeanStdStale,
			},
			localBefore,
		);
	});

	test.each([
		["football", rosterAutoSortFootball, genDepthFootball],
		["baseball", rosterAutoSortBaseball, genDepthBaseball],
		["hockey", rosterAutoSortHockey, genDepthHockey],
	] as const)(
		"%s passes season and writes through captured cache",
		async (_name, sort, genDepth) => {
			const firstTeam = makeTeam();
			const firstCache = makeCache(firstTeam, []);
			const secondCache = makeCache(makeTeam(), []);
			const originalCache = idb.cache;
			genDepth.mockImplementationOnce(
				async (
					_players: unknown[],
					depth: unknown,
					_onlyNew?: boolean,
					_pos?: string,
					season?: number,
				) => {
					idb.cache = secondCache;
					assert.strictEqual(season, 2032);
					return depth;
				},
			);

			try {
				await sort(0, false, undefined, makeContext(firstCache));
			} finally {
				idb.cache = originalCache;
			}

			assert.strictEqual((firstCache.teams.put as any).mock.calls.length, 1);
			assert.strictEqual((secondCache.teams.put as any).mock.calls.length, 0);
		},
	);
});
