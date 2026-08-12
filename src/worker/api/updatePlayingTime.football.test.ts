import { assert, test } from "vitest";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { player } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import api from "./index.ts";

test("legacy PT remains available outside basketball", async () => {
	resetG();
	const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL);
	p.ptModifier = 1;
	await resetCache({ players: [p] });

	await api.main.updatePlayingTime({ pid: p.pid!, ptModifier: 1.5 });
	const updated = await idb.cache.players.get(p.pid!);
	assert.strictEqual(updated?.ptModifier, 1.5);
});

test("targetMinutes keeps its legacy God Mode gate outside basketball", async () => {
	resetG();
	g.setWithoutSavingToDB("godMode", false);
	const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL);
	await resetCache({ players: [p] });

	await api.main.updatePlayingTime({
		pid: p.pid!,
		ptModifier: 1.25,
		targetMinutes: 28,
	});
	let updated = await idb.cache.players.get(p.pid!);
	assert.strictEqual(updated?.ptModifier, 1.25);
	assert.strictEqual(updated?.targetMinutes, undefined);

	g.setWithoutSavingToDB("godMode", true);
	await api.main.updatePlayingTime({ pid: p.pid!, targetMinutes: 32 });
	updated = await idb.cache.players.get(p.pid!);
	assert.strictEqual(updated?.targetMinutes, 32);

	await api.main.updatePlayingTime({ pid: p.pid!, targetMinutes: null });
	updated = await idb.cache.players.get(p.pid!);
	assert.strictEqual(updated?.targetMinutes, undefined);
});
