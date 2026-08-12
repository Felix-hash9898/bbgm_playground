import { assert, beforeEach, expect, test } from "vitest";
import { helpers } from "../../common/index.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { player, team } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import api from "./index.ts";

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB("userTids", [0]);
	g.setWithoutSavingToDB("spectator", false);
});

const setup = async () => {
	const players = Array.from({ length: 8 }, (_, i) => {
		const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL);
		p.pid = i;
		p.rosterOrder = i;
		return p;
	});
	const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
	await resetCache({ players, teams: [t] });
	return { players, t };
};

test("custom minutes save atomically and Reset returns to Auto", async () => {
	const { players } = await setup();
	const rosterOrderBefore = players.map((p) => p.rosterOrder);
	const values = [40, 36, 34, 32, 30, 26, 24, 18];
	const minutesByPid = Object.fromEntries(
		players.map((p, i) => [p.pid!, values[i]!]),
	);

	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	let t = await idb.cache.teams.get(0);
	assert.deepEqual(t?.basketballRotation, {
		version: 1,
		mode: "custom",
		minutesByPid,
		numPlayersOnCourtAtSave: 5,
	});

	await api.main.resetPlayingTime([0]);
	t = await idb.cache.teams.get(0);
	assert.deepEqual(t?.basketballRotation, { version: 1, mode: "auto" });
	const playersAfter = (await idb.cache.players.getAll()).filter(
		(p) => p.tid === 0,
	);
	assert.deepEqual(
		playersAfter.sort((a, b) => a.pid - b.pid).map((p) => p.rosterOrder),
		rosterOrderBefore,
	);
});

test("custom save rejects partial and non-240 plans", async () => {
	await setup();
	await expect(
		api.main.updateBasketballMinutes({ tid: 0, minutesByPid: { 0: 48 } }),
	).rejects.toThrow(/every player/);
});

test("custom save rejects decimal minutes", async () => {
	const { players } = await setup();
	await expect(
		api.main.updateBasketballMinutes({
			tid: 0,
			minutesByPid: Object.fromEntries(
				players.map((p, i) => [
					p.pid!,
					i === 0 ? 40.5 : [36, 34, 32, 30, 26, 24, 18][i - 1]!,
				]),
			),
		}),
	).rejects.toThrow(/integer/);
});

test("changing the court size immediately relegalizes a persisted custom plan", async () => {
	const { players } = await setup();
	const values = [40, 36, 34, 32, 30, 26, 24, 18];
	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: Object.fromEntries(
			players.map((p, i) => [p.pid!, values[i]!]),
		),
	});

	await api.main.updateGameAttributes({ numPlayersOnCourt: 3 });
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.numPlayersOnCourtAtSave, 3);
	assert.closeTo(
		Object.values(rotation.minutesByPid!).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		144,
		8,
	);
});
