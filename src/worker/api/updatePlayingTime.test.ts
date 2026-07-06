import { assert, describe, test } from "vitest";
import { player } from "../core/index.ts";
import { g } from "../util/index.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { idb } from "../db/index.ts";
import api from "./index.ts";

const updatePlayingTime = api.main.updatePlayingTime;

describe("updatePlayingTime API & godMode Gating", () => {
	test("normal updatePlayingTime allows modifying ptModifier regardless of godMode", async () => {
		resetG();
		g.setWithoutSavingToDB("godMode", false);

		const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL);
		p.ptModifier = 1;
		await resetCache({ players: [p] });

		await updatePlayingTime({ pid: p.pid, ptModifier: 1.5 });

		const updated = await idb.cache.players.get(p.pid);
		assert.strictEqual(updated.ptModifier, 1.5);
	});

	test("non-God Mode updatePlayingTime ignores targetMinutes parameter", async () => {
		resetG();
		g.setWithoutSavingToDB("godMode", false);

		const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL);
		delete p.targetMinutes;
		p.ptModifier = 1;
		await resetCache({ players: [p] });

		// Attempt to update targetMinutes when godMode is false
		await updatePlayingTime({
			pid: p.pid,
			ptModifier: 1.25,
			targetMinutes: 28,
		});

		const updated = await idb.cache.players.get(p.pid);
		assert.strictEqual(updated.ptModifier, 1.25);
		assert.strictEqual(
			updated.targetMinutes,
			undefined,
			"targetMinutes should NOT be saved in non-God Mode",
		);
	});

	test("God Mode updatePlayingTime saves targetMinutes parameter", async () => {
		resetG();
		g.setWithoutSavingToDB("godMode", true);

		const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL);
		delete p.targetMinutes;
		await resetCache({ players: [p] });

		await updatePlayingTime({
			pid: p.pid,
			targetMinutes: 32,
		});

		const updated = await idb.cache.players.get(p.pid);
		assert.strictEqual(
			updated.targetMinutes,
			32,
			"targetMinutes should be saved in God Mode",
		);
	});

	test("God Mode updatePlayingTime with targetMinutes=null clears targetMinutes", async () => {
		resetG();
		g.setWithoutSavingToDB("godMode", true);

		const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL);
		p.targetMinutes = 32;
		await resetCache({ players: [p] });

		await updatePlayingTime({
			pid: p.pid,
			targetMinutes: null,
		});

		const updated = await idb.cache.players.get(p.pid);
		assert.strictEqual(
			updated.targetMinutes,
			undefined,
			"targetMinutes should be deleted when targetMinutes=null in God Mode",
		);
	});
});
