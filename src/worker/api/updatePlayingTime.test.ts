import { assert, test } from "vitest";
import { player } from "../core/index.ts";
import { g } from "../util/index.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { idb } from "../db/index.ts";
import api from "./index.ts";

test("legacy basketball PT and targetMinutes updates are inert", async () => {
	resetG();
	g.setWithoutSavingToDB("godMode", true);

	const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL);
	p.ptModifier = 1;
	p.targetMinutes = 24;
	await resetCache({ players: [p] });

	await api.main.updatePlayingTime({
		pid: p.pid!,
		ptModifier: 1.5,
		targetMinutes: 40,
	});

	const updated = await idb.cache.players.get(p.pid!);
	assert(updated);
	assert.strictEqual(updated.ptModifier, 1);
	assert.strictEqual(updated.targetMinutes, 24);
});
