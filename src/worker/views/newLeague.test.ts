import { assert, test } from "vitest";
import { getDefaultSettings } from "./newLeague.ts";

test("future new leagues default to the configured old box-score retention", () => {
	assert.deepEqual(getDefaultSettings().saveOldBoxScores, {
		pastSeasons: 20,
		pastSeasonsType: "your",
		note: "all",
		playoffs: "your",
		finals: "all",
		playerFeat: "your",
		clutchPlays: "your",
		allStar: "all",
	});
});
