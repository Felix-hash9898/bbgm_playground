import { afterAll, assert, beforeEach, test } from "vitest";
import { PHASE } from "../../../common/index.ts";
import type { Game, PlayoffSeries } from "../../../common/types.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import { processDaysOffBeforeGame } from "../game/play.ts";
import { getNextRoundFirstGameDayForCurrentSport } from "./newSchedulePlayoffsDay.ts";

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	await resetCache();
});

afterAll(() => {
	resetG();
});

test("does not process playoff schedule gaps in football", async () => {
	assert.strictEqual(await processDaysOffBeforeGame(107, {}), 0);
});

test("does not apply the basketball round window to football", () => {
	const round = [
		{
			away: { cid: 0, seed: 2, tid: 1, won: 0 },
			gids: [1],
			home: { cid: 0, seed: 1, tid: 0, won: 1 },
		},
	] satisfies PlayoffSeries["series"][number];
	const games = [
		{
			day: 100,
			gid: 1,
			playoffs: true,
			season: 2016,
			teams: [{ tid: 0 }, { tid: 1 }],
		} as Game,
	];

	assert.strictEqual(
		getNextRoundFirstGameDayForCurrentSport(round, games, 2016, 1),
		undefined,
	);
});
