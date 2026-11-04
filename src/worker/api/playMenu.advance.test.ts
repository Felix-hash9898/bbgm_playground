import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PHASE } from "../../common/index.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { g, lock } from "../util/index.ts";
import { idb } from "../db/index.ts";
import { game, season } from "../core/index.ts";
import playMenu from "./playMenu.ts";

beforeEach(async () => {
	resetG();
	lock.reset();
	await resetCache();
	vi.spyOn(season, "getDaysLeftSchedule").mockResolvedValue(3);
	await idb.cache.playoffSeries.put({
		season: g.get("season"),
		currentRound: 0,
		series: [],
	} as any);
});
afterEach(() => {
	vi.restoreAllMocks();
	lock.reset();
});

test.each([
	"day",
	"week",
	"month",
	"untilAllStarGame",
	"untilTradeDeadline",
	"untilPlayoffs",
	"untilEndOfRound",
	"untilEndOfPlayIn",
	"throughPlayoffs",
] as const)(
	"%s waits for game.play and propagates the original failure",
	async (action) => {
		g.setWithoutSavingToDB(
			"phase",
			action === "untilEndOfRound" ||
				action === "untilEndOfPlayIn" ||
				action === "throughPlayoffs"
				? PHASE.PLAYOFFS
				: PHASE.REGULAR_SEASON,
		);
		let reject!: (error: Error) => void;
		const gate = new Promise<void>((_, rejectGate) => {
			reject = rejectGate;
		});
		vi.spyOn(game, "play").mockImplementation(() => gate);
		let completed = false;
		const request = playMenu[action](undefined, {}).finally(() => {
			completed = true;
		});
		const failure = new Error("settlement rejected");
		const assertion = expect(request).rejects.toBe(failure);
		await vi.waitFor(() => expect(game.play).toHaveBeenCalledOnce());
		expect(completed).toBe(false);
		reject(failure);
		await assertion;
	},
);
