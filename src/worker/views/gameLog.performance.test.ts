import { afterEach, expect, test, vi } from "vitest";
import type { Game } from "../../common/types.ts";
import getWinner from "../../common/getWinner.ts";
import formatScoreWithShootout from "../../common/formatScoreWithShootout.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import gameLog, { toGameLogSummary } from "./gameLog.ts";

const makeGame = (gid: number) =>
	({
		gid,
		season: 2016,
		won: { tid: 0, pts: 100 },
		lost: { tid: 1, pts: 100 },
		overtimes: 2,
		numPeriods: 4,
		neutralSite: true,
		forceWin: "tie",
		teams: [
			{ tid: 0, pts: 100, sPts: 3, players: [{ pid: 1, pts: 20 }] },
			{ tid: 1, pts: 100, sPts: 2, players: [{ pid: 2, pts: 25 }] },
		],
	}) as unknown as Game;

afterEach(() => vi.restoreAllMocks());

test("sidebar summaries retain score, winner, overtime, site, force result and navigation keys", () => {
	const game = makeGame(5);
	const before = structuredClone(game);
	const summary = toGameLogSummary(game);
	expect(summary.gid).toBe(game.gid);
	expect(getWinner(summary.teams)).toBe(getWinner(game.teams));
	expect(formatScoreWithShootout(...summary.teams)).toBe(
		formatScoreWithShootout(...game.teams),
	);
	expect(helpers.overtimeText(summary.overtimes, summary.numPeriods)).toBe(
		helpers.overtimeText(game.overtimes, game.numPeriods),
	);
	expect(summary.neutralSite).toBe(true);
	expect(summary.forceWin).toBe(game.forceWin);
	expect(summary.teams[0]).not.toHaveProperty("players");
	summary.teams[0].pts = 0;
	expect(game).toEqual(before);
});

test("Game Log incrementally prepends summaries and retains the independently loaded box score", async () => {
	resetG();
	g.setWithoutSavingToDB("season", 2016);
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
	await resetCache();
	await idb.cache.games.add(makeGame(5));
	const boxScore = { ...makeGame(5), customFullBoxScore: true };
	vi.spyOn(idb.getCopy, "games").mockResolvedValue(boxScore);
	const inputs = { gid: 5, tid: 0, abbrev: "ATL", season: 2016 };
	const initial = await gameLog(inputs, ["firstRun"], {});
	if (!initial.boxScore || !("teams" in initial.boxScore)) {
		throw new Error("Expected a complete selected box score");
	}
	expect(initial.boxScore.teams[0].players).toHaveLength(1);
	expect(initial.gamesList.games.map((game: any) => game.gid)).toEqual([5]);
	expect(initial.gamesList.games[0]!.teams[0]).not.toHaveProperty("players");
	await idb.cache.games.add(makeGame(6));
	const update = await gameLog(inputs, ["gameSim"], initial);
	expect(update.gamesList.games.map((game: any) => game.gid)).toEqual([6, 5]);
	expect(update.boxScore).toBeUndefined();
	expect(initial.boxScore).toHaveProperty("customFullBoxScore", true);
	const again = await gameLog(inputs, ["gameSim"], { ...initial, ...update });
	expect(again.gamesList.games.map((game: any) => game.gid)).toEqual([6, 5]);
});
