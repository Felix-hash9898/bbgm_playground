import { assert, beforeEach, expect, test } from "vitest";
import { helpers } from "../../common/index.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { player, team } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import {
	getBasketballRotationMinutes,
	getBasketballRotationPlayerInput,
} from "../core/team/basketballMinutes.ts";
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

test("current minutes override persists without changing healthy intent and clears cleanly", async () => {
	const { players } = await setup();
	const values = [40, 33, 37, 32, 30, 26, 24, 18];
	const minutesByPid = Object.fromEntries(
		players.map((p, i) => [p.pid!, values[i]!]),
	);
	const t = (await idb.cache.teams.get(0))!;
	t.playThroughInjuries = [0, 0];
	await idb.cache.teams.put(t);
	const injured = (await idb.cache.players.get(players[0]!.pid!))!;
	injured.injury = { type: "Ankle", gamesRemaining: 5 };
	await idb.cache.players.put(injured);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });

	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: players[1]!.pid!,
		minutes: 36,
	});
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.currentMinutesOverrideByPid, {
		[players[1]!.pid!]: 36,
	});
	assert.strictEqual(rotation.minutesByPid![players[1]!.pid!], 33);
	assert.deepEqual(rotation.currentMinutesOverrideContext?.unavailablePids, [
		players[0]!.pid!,
	]);

	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: players[1]!.pid!,
		minutes: null,
	});
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);
});

test("editing an Auto incoming player's current minutes does not claim healthy Custom ownership", async () => {
	const { players } = await setup();
	const minutesByPid = Object.fromEntries(
		players.map((p, i) => [p.pid!, [48, 44, 40, 38, 36, 34, 0, 0][i]!]),
	);
	const t = (await idb.cache.teams.get(0))!;
	t.basketballRotation = {
		version: 1,
		mode: "custom",
		minutesByPid,
		numPlayersOnCourtAtSave: 5,
		autoFilledPids: [players[7]!.pid!],
		rosterAutoFillActive: true,
	};
	await idb.cache.teams.put(t);

	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: players[7]!.pid!,
		minutes: 12,
	});
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.autoFilledPids, [players[7]!.pid!]);
	assert.strictEqual(rotation.minutesByPid![players[7]!.pid!], 0);
	assert.deepEqual(rotation.currentMinutesOverrideByPid, {
		[players[7]!.pid!]: 12,
	});
});

test("custom save persists a complete non-total draft but rejects partial data", async () => {
	const { players } = await setup();
	await expect(
		api.main.updateBasketballMinutes({ tid: 0, minutesByPid: { 0: 48 } }),
	).rejects.toThrow(/every player/);

	const minutesByPid = Object.fromEntries(
		players.map((p, i) => [p.pid!, [39, 36, 34, 32, 30, 26, 24, 18][i]!]),
	);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	assert.deepEqual((await idb.cache.teams.get(0))!.basketballRotation, {
		version: 1,
		mode: "custom",
		minutesByPid,
		numPlayersOnCourtAtSave: 5,
	});
});

test("injury redistribution protection persists and survives Auto reset", async () => {
	const { players } = await setup();
	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: players[0]!.pid!,
		protectedFromIncrease: true,
	});
	assert.deepEqual((await idb.cache.teams.get(0))!.basketballRotation, {
		version: 1,
		mode: "auto",
		noInjuryMinutesIncreasePids: [players[0]!.pid!],
	});
	const minutesByPid = Object.fromEntries(
		players.map((p, i) => [p.pid!, [40, 36, 34, 32, 30, 26, 24, 18][i]!]),
	);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	assert.deepEqual(
		(await idb.cache.teams.get(0))!.basketballRotation!
			.noInjuryMinutesIncreasePids,
		[players[0]!.pid!],
	);

	await api.main.resetPlayingTime([0]);
	assert.deepEqual((await idb.cache.teams.get(0))!.basketballRotation, {
		version: 1,
		mode: "auto",
		noInjuryMinutesIncreasePids: [players[0]!.pid!],
	});
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

test("rotation profile persists and legacy reserve data is dropped on save", async () => {
	const { players } = await setup();
	await api.main.updateBasketballRotationProfile({
		tid: 0,
		rotationDepth: "long",
		coreReliance: "low",
	});
	const minutesByPid = Object.fromEntries(
		players.map((p, i) => [p.pid!, [48, 44, 40, 38, 36, 34, 0, 0][i]!]),
	);
	const t = (await idb.cache.teams.get(0))!;
	t.basketballRotation = {
		version: 1,
		mode: "custom",
		rotationDepth: "long",
		coreReliance: "low",
		minutesByPid,
		numPlayersOnCourtAtSave: 5,
		reservePriorityPids: [players[7]!.pid!, players[6]!.pid!],
	} as unknown as NonNullable<typeof t.basketballRotation>;
	await idb.cache.teams.put(t);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });

	assert.deepEqual((await idb.cache.teams.get(0))!.basketballRotation, {
		version: 1,
		mode: "custom",
		rotationDepth: "long",
		coreReliance: "low",
		minutesByPid,
		numPlayersOnCourtAtSave: 5,
	});

	await api.main.resetPlayingTime([0]);
	assert.deepEqual((await idb.cache.teams.get(0))!.basketballRotation, {
		version: 1,
		mode: "auto",
		rotationDepth: "long",
		coreReliance: "low",
	});
});

test("editing an Auto-filled incoming player makes it explicit without reserve state", async () => {
	const { players } = await setup();
	const minutesByPid = Object.fromEntries(
		players.map((p, i) => [p.pid!, [48, 44, 40, 38, 36, 34, 0, 0][i]!]),
	);
	const t = (await idb.cache.teams.get(0))!;
	t.basketballRotation = {
		version: 1,
		mode: "custom",
		minutesByPid,
		numPlayersOnCourtAtSave: 5,
		autoFilledPids: [players[7]!.pid!],
	};
	await idb.cache.teams.put(t);

	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.autoFilledPids, [players[7]!.pid!]);

	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid,
		explicitPids: [players[7]!.pid!],
	});
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.autoFilledPids, undefined);
});

test("editing the sole Auto-filled player keeps the derived healthy plan game-ready", async () => {
	const { players } = await setup();
	const minutesByPid = Object.fromEntries(
		players.map((p, i) => [p.pid!, [44, 40, 36, 34, 32, 30, 0, 0][i]!]),
	);
	const t = (await idb.cache.teams.get(0))!;
	t.basketballRotation = {
		version: 1,
		mode: "custom",
		minutesByPid,
		numPlayersOnCourtAtSave: 5,
		autoFilledPids: [players[7]!.pid!],
		rosterAutoFillActive: true,
	};
	await idb.cache.teams.put(t);

	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: { ...minutesByPid, [players[7]!.pid!]: 16 },
		explicitPids: [players[7]!.pid!],
	});
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.minutesByPid![players[7]!.pid!], 16);
	assert.strictEqual(rotation.autoFilledPids, undefined);
	assert.strictEqual(rotation.rosterAutoFillActive, true);

	const currentHealthy = getBasketballRotationMinutes({
		rotation,
		players: players.map((p) =>
			getBasketballRotationPlayerInput({
				pid: p.pid!,
				rosterOrder: p.rosterOrder,
				ratings: p.ratings.at(-1)! as unknown as Record<string, unknown>,
				useFuzzedRatings: true,
			}),
		),
		numPlayersOnCourt: 5,
		playoffs: false,
	});
	assert.strictEqual(currentHealthy.gameReady, true);
	assert.strictEqual(
		Object.values(currentHealthy.minutesByPid).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		240,
	);
	assert.isTrue(
		players
			.slice(0, 6)
			.some(
				(p) =>
					currentHealthy.minutesByPid[p.pid!]! >
					rotation.minutesByPid![p.pid!]!,
			),
	);
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
