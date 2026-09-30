import { assert, beforeEach, test } from "vitest";
import defaultGameAttributes, {
	legacyDefaultSaveOldBoxScores,
} from "../../../common/defaultGameAttributes.ts";
import type { GameAttribute } from "../../../common/types.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import loadGameAttributes from "./loadGameAttributes.ts";

beforeEach(async () => {
	resetG();
	await resetCache();
});

test("existing leagues without this setting keep the legacy retention defaults in memory", async () => {
	delete (g as any).saveOldBoxScores;

	await loadGameAttributes();

	assert.deepEqual(g.get("saveOldBoxScores"), legacyDefaultSaveOldBoxScores);
	assert.strictEqual(
		await idb.cache.gameAttributes.get("saveOldBoxScores"),
		undefined,
	);
});

test("explicit saved retention settings override both new and legacy defaults", async () => {
	const saved = {
		pastSeasons: 7,
		pastSeasonsType: "all",
		note: "your",
		playoffs: "all",
		finals: "your",
		playerFeat: "all",
		clutchPlays: "all",
		allStar: "all",
	} as const;
	await idb.cache.gameAttributes.add({
		key: "saveOldBoxScores",
		value: saved,
	} as GameAttribute<"saveOldBoxScores">);

	await loadGameAttributes();

	assert.deepEqual(g.get("saveOldBoxScores"), saved);
	assert.deepEqual(defaultGameAttributes.saveOldBoxScores, {
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
