import { assert, beforeEach, expect, test } from "vitest";
import type { Player } from "../../common/types.ts";
import { helpers } from "../../common/index.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { player, team } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g } from "../util/index.ts";
import {
	getBasketballRotationMinutes,
	getBasketballRotationPlayerInput,
	getLeagueRotationOvrPercentiles,
} from "../core/team/basketballMinutes.ts";
import { processTeam } from "../core/game/loadTeams.ts";
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

test("a Current Override conflicting with an existing hard lock is rejected atomically", async () => {
	const { players } = await setup();
	const values = [40, 33, 37, 32, 30, 26, 24, 18];
	const minutesByPid = Object.fromEntries(
		players.map((p, index) => [p.pid!, values[index]!]),
	);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	const pid = players[1]!.pid!;
	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid,
		protectedFromIncrease: true,
	});
	const before = structuredClone(
		(await idb.cache.teams.get(0))!.basketballRotation!,
	);

	await expect(
		api.main.updateBasketballCurrentMinutesOverride({
			tid: 0,
			pid,
			minutes: 36,
		}),
	).rejects.toThrow(/Disable Prevent injury increase/);
	assert.deepEqual((await idb.cache.teams.get(0))!.basketballRotation, before);
});

test("enabling a hard lock preserves the new lock and clears a conflicting Current Override", async () => {
	const { players } = await setup();
	const values = [40, 33, 37, 32, 30, 26, 24, 18];
	const minutesByPid = Object.fromEntries(
		players.map((p, index) => [p.pid!, values[index]!]),
	);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	const pid = players[1]!.pid!;
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid,
		minutes: 36,
	});
	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid,
		protectedFromIncrease: true,
	});

	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.noInjuryMinutesIncreasePids, [pid]);
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);
	assert.deepEqual(rotation.minutesByPid, minutesByPid);
});

test("enabling a hard lock removes only that player's conflicting Current Override", async () => {
	const { players } = await setup();
	const values = [40, 33, 37, 32, 30, 26, 24, 18];
	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: Object.fromEntries(
			players.map((p, index) => [p.pid!, values[index]!]),
		),
	});
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: players[1]!.pid!,
		minutes: 36,
	});
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: players[2]!.pid!,
		minutes: 34,
	});

	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: players[1]!.pid!,
		protectedFromIncrease: true,
	});
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.noInjuryMinutesIncreasePids, [players[1]!.pid!]);
	assert.deepEqual(rotation.currentMinutesOverrideByPid, {
		[players[2]!.pid!]: 34,
	});
	assert.isDefined(rotation.currentMinutesOverrideContext);

	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: players[1]!.pid!,
		protectedFromIncrease: false,
	});
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.noInjuryMinutesIncreasePids);
	assert.deepEqual(rotation.currentMinutesOverrideByPid, {
		[players[2]!.pid!]: 34,
	});
	assert.isDefined(rotation.currentMinutesOverrideContext);
});

test("a non-conflicting protection toggle preserves every Current Override", async () => {
	const { players } = await setup();
	const values = [40, 33, 37, 32, 30, 26, 24, 18];
	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: Object.fromEntries(
			players.map((p, index) => [p.pid!, values[index]!]),
		),
	});
	for (const [index, minutes] of [
		[1, 36],
		[2, 34],
	] as const) {
		await api.main.updateBasketballCurrentMinutesOverride({
			tid: 0,
			pid: players[index]!.pid!,
			minutes,
		});
	}
	const expectedOverrides = {
		[players[1]!.pid!]: 36,
		[players[2]!.pid!]: 34,
	};

	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: players[3]!.pid!,
		protectedFromIncrease: true,
	});
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.currentMinutesOverrideByPid, expectedOverrides);
	assert.isDefined(rotation.currentMinutesOverrideContext);

	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: players[3]!.pid!,
		protectedFromIncrease: false,
	});
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.currentMinutesOverrideByPid, expectedOverrides);
	assert.isDefined(rotation.currentMinutesOverrideContext);
});

const partialCurrentOverrideApiCases = [
	["override-only", "protection"],
	["context-only", "protection"],
	["override-only", "profile"],
	["context-only", "profile"],
	["override-only", "plan"],
	["context-only", "plan"],
	["override-only", "current"],
	["context-only", "current"],
] as const;

test.each(partialCurrentOverrideApiCases)(
	"%s Current Override state is removed by the %s API",
	async (partialState, mutation) => {
		const { players } = await setup();
		const values = [40, 33, 37, 32, 30, 26, 24, 18];
		const minutesByPid = Object.fromEntries(
			players.map((p, index) => [p.pid!, values[index]!]),
		);
		await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
		await api.main.updateBasketballCurrentMinutesOverride({
			tid: 0,
			pid: players[1]!.pid!,
			minutes: 36,
		});
		const t = (await idb.cache.teams.get(0))!;
		if (partialState === "override-only") {
			delete t.basketballRotation!.currentMinutesOverrideContext;
		} else {
			delete t.basketballRotation!.currentMinutesOverrideByPid;
		}
		await idb.cache.teams.put(t);

		if (mutation === "protection") {
			await api.main.updateBasketballNoInjuryMinutesIncrease({
				tid: 0,
				pid: players[2]!.pid!,
				protectedFromIncrease: true,
			});
		} else if (mutation === "profile") {
			await api.main.updateBasketballRotationProfile({
				tid: 0,
				rotationDepth: "long",
				coreReliance: "low",
			});
		} else if (mutation === "plan") {
			await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
		} else {
			await api.main.updateBasketballCurrentMinutesOverride({
				tid: 0,
				pid: players[1]!.pid!,
				minutes: null,
			});
		}

		const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
		assert.isUndefined(rotation.currentMinutesOverrideByPid);
		assert.isUndefined(rotation.currentMinutesOverrideContext);
	},
);

test("valid Current Override pairs survive compatible Plan and profile writes", async () => {
	const { players } = await setup();
	const values = [40, 33, 37, 32, 30, 26, 24, 18];
	const minutesByPid = Object.fromEntries(
		players.map((p, index) => [p.pid!, values[index]!]),
	);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: players[1]!.pid!,
		minutes: 36,
	});

	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	await api.main.updateBasketballRotationProfile({
		tid: 0,
		rotationDepth: "long",
		coreReliance: "low",
	});
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.currentMinutesOverrideByPid, {
		[players[1]!.pid!]: 36,
	});
	assert.isDefined(rotation.currentMinutesOverrideContext);
	assert.strictEqual(rotation.rotationDepth, "long");
	assert.strictEqual(rotation.coreReliance, "low");
});

test("a Plan write removes only the Current Override newly above its hard cap", async () => {
	const { players } = await setup();
	const originalMinutes = Object.fromEntries(
		players.map((p, index) => [
			p.pid!,
			[40, 36, 34, 32, 30, 26, 24, 18][index]!,
		]),
	);
	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: originalMinutes,
	});
	for (const [index, minutes] of [
		[1, 36],
		[2, 34],
	] as const) {
		await api.main.updateBasketballCurrentMinutesOverride({
			tid: 0,
			pid: players[index]!.pid!,
			minutes,
		});
	}
	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: players[1]!.pid!,
		protectedFromIncrease: true,
	});

	const changedMinutes = Object.fromEntries(
		players.map((p, index) => [
			p.pid!,
			[43, 33, 34, 32, 30, 26, 24, 18][index]!,
		]),
	);
	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: changedMinutes,
	});
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.noInjuryMinutesIncreasePids, [players[1]!.pid!]);
	assert.deepEqual(rotation.currentMinutesOverrideByPid, {
		[players[2]!.pid!]: 34,
	});
	assert.isDefined(rotation.currentMinutesOverrideContext);
});

test("an Auto profile write removes only the Current Override newly above its hard cap", async () => {
	const { players } = await setup();
	await api.main.updateBasketballRotationProfile({
		tid: 0,
		rotationDepth: "short",
		coreReliance: "high",
	});
	const playerInputs = players.map((p) =>
		getBasketballRotationPlayerInput({
			pid: p.pid!,
			rosterOrder: p.rosterOrder,
			ratings: p.ratings.at(-1)! as unknown as Record<string, unknown>,
			useFuzzedRatings: true,
		}),
	);
	const rotationBefore = (await idb.cache.teams.get(0))!.basketballRotation!;
	const shortHigh = getBasketballRotationMinutes({
		rotation: rotationBefore,
		players: playerInputs,
		numPlayersOnCourt: 5,
		playoffs: false,
	});
	const longLow = getBasketballRotationMinutes({
		rotation: {
			...rotationBefore,
			rotationDepth: "long",
			coreReliance: "low",
		},
		players: playerInputs,
		numPlayersOnCourt: 5,
		playoffs: false,
	});
	const target = players.find(
		(p) =>
			Math.floor(shortHigh.minutesByPid[p.pid!]!) >
			longLow.minutesByPid[p.pid!]! + 1e-7,
	);
	if (!target) {
		throw new Error("Expected the long/low profile to lower one player's plan");
	}
	const unrelated = players.find((p) => p.pid !== target.pid)!;
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: target.pid!,
		minutes: Math.floor(shortHigh.minutesByPid[target.pid!]!),
	});
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: unrelated.pid!,
		minutes: 0,
	});
	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: target.pid!,
		protectedFromIncrease: true,
	});

	await api.main.updateBasketballRotationProfile({
		tid: 0,
		rotationDepth: "long",
		coreReliance: "low",
	});
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.noInjuryMinutesIncreasePids, [target.pid!]);
	assert.deepEqual(rotation.currentMinutesOverrideByPid, {
		[unrelated.pid!]: 0,
	});
	assert.isDefined(rotation.currentMinutesOverrideContext);
});

test("protecting a Plan=0 player clears its positive Current Override", async () => {
	const { players } = await setup();
	const minutesByPid = Object.fromEntries(
		players.map((p, index) => [p.pid!, index < 5 ? 48 : 0]),
	);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	const pid = players[5]!.pid!;
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid,
		minutes: 10,
	});
	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid,
		protectedFromIncrease: true,
	});
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.noInjuryMinutesIncreasePids, [pid]);
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);
});

test("an impossible downward Current Override under hard locks is rejected without a partial write", async () => {
	const { players } = await setup();
	const minutesByPid = Object.fromEntries(
		players.map((p, index) => [p.pid!, index < 5 ? 48 : 0]),
	);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid });
	for (const p of players) {
		await api.main.updateBasketballNoInjuryMinutesIncrease({
			tid: 0,
			pid: p.pid!,
			protectedFromIncrease: true,
		});
	}
	const before = structuredClone(
		(await idb.cache.teams.get(0))!.basketballRotation!,
	);

	await expect(
		api.main.updateBasketballCurrentMinutesOverride({
			tid: 0,
			pid: players[0]!.pid!,
			minutes: 0,
		}),
	).rejects.toThrow(/no legal way/);
	assert.deepEqual((await idb.cache.teams.get(0))!.basketballRotation, before);
});

test("one invalid edit cannot replace multiple previously valid Current Overrides", async () => {
	const { players } = await setup();
	const values = [40, 33, 37, 32, 30, 26, 24, 18];
	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: Object.fromEntries(
			players.map((p, index) => [p.pid!, values[index]!]),
		),
	});
	for (const [index, minutes] of [
		[1, 36],
		[2, 34],
	] as const) {
		await api.main.updateBasketballCurrentMinutesOverride({
			tid: 0,
			pid: players[index]!.pid!,
			minutes,
		});
	}
	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: players[3]!.pid!,
		protectedFromIncrease: true,
	});
	const before = structuredClone(
		(await idb.cache.teams.get(0))!.basketballRotation!,
	);

	await expect(
		api.main.updateBasketballCurrentMinutesOverride({
			tid: 0,
			pid: players[3]!.pid!,
			minutes: 36,
		}),
	).rejects.toThrow(/Disable Prevent injury increase/);
	assert.deepEqual((await idb.cache.teams.get(0))!.basketballRotation, before);
});

test("a healthy Plan edit cannot leave an incompatible old Current Override hidden", async () => {
	const { players } = await setup();
	const original = [40, 36, 34, 32, 30, 26, 24, 18];
	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: Object.fromEntries(
			players.map((p, index) => [p.pid!, original[index]!]),
		),
	});
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: players[1]!.pid!,
		minutes: 36,
	});
	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: players[1]!.pid!,
		protectedFromIncrease: true,
	});
	const changedPlan = Object.fromEntries(
		players.map((p, index) => [
			p.pid!,
			[43, 33, 34, 32, 30, 26, 24, 18][index]!,
		]),
	);
	await api.main.updateBasketballMinutes({ tid: 0, minutesByPid: changedPlan });
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.minutesByPid, changedPlan);
	assert.deepEqual(rotation.noInjuryMinutesIncreasePids, [players[1]!.pid!]);
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);
});

test("a regulation-length change permanently invalidates Current Override", async () => {
	const { players } = await setup();
	await api.main.updateBasketballMinutes({
		tid: 0,
		minutesByPid: Object.fromEntries(
			players.map((p, index) => [
				p.pid!,
				[40, 36, 34, 32, 30, 26, 24, 18][index]!,
			]),
		),
	});
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: players[1]!.pid!,
		minutes: 36,
	});
	await api.main.updateGameAttributes({ quarterLength: 10 });
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
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

const makeLeaguePlayers = (
	tid: number,
	ovrs: number[],
	pidBase: number,
): Player[] =>
	ovrs.map((ovr, index) => {
		const p = player.generate(0, 25, 2020, true, DEFAULT_LEVEL) as Player;
		p.pid = pidBase + index;
		p.tid = tid;
		p.rosterOrder = index;
		const ratings = p.ratings.at(-1)!;
		ratings.ovr = ovr;
		ratings.endu = 80;
		ratings.pos = ["PG", "SG", "SF", "PF", "C", "SG", "PF", "C"][index]!;
		ratings.fuzz = 0;
		return p;
	});

const getAutoRotation = () => ({
	version: 1 as const,
	mode: "auto" as const,
	rotationDepth: "normal" as const,
	coreReliance: "balanced" as const,
});

const getRotationPlayerInputs = (
	players: ReturnType<typeof makeLeaguePlayers>,
	rotationOvrPercentiles?: ReadonlyMap<number, number>,
) =>
	players.map((p) =>
		getBasketballRotationPlayerInput({
			pid: p.pid!,
			rosterOrder: p.rosterOrder,
			ratings: p.ratings.at(-1)! as unknown as Record<string, unknown>,
			useFuzzedRatings: true,
			ovrPercentile: rotationOvrPercentiles?.get(p.pid!),
		}),
	);

test("API rejects a protected Current Override above the league-relative healthy base even when the roster-relative base would allow it", async () => {
	const userPlayers = makeLeaguePlayers(
		0,
		[80, 75, 70, 65, 60, 55, 50, 45],
		100,
	);
	const strongerLeague = makeLeaguePlayers(
		1,
		[98, 97, 96, 95, 94, 93, 92, 91],
		200,
	);
	const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
	await resetCache({
		players: [...userPlayers, ...strongerLeague],
		teams: [t],
	});
	await api.main.updateBasketballRotationProfile({
		tid: 0,
		rotationDepth: "normal",
		coreReliance: "balanced",
	});

	const rotation = getAutoRotation();
	const rosterPlan = getBasketballRotationMinutes({
		rotation,
		players: getRotationPlayerInputs(userPlayers),
		numPlayersOnCourt: 5,
		playoffs: false,
	});
	const leagueMap = getLeagueRotationOvrPercentiles(
		await idb.cache.players.indexGetAll("playersByTid", [0, Infinity]),
	);
	const leaguePlan = getBasketballRotationMinutes({
		rotation,
		players: getRotationPlayerInputs(userPlayers, leagueMap),
		numPlayersOnCourt: 5,
		playoffs: false,
	});
	const target = userPlayers[5]!;
	const rosterBase = rosterPlan.minutesByPid[target.pid!]!;
	const leagueBase = leaguePlan.minutesByPid[target.pid!]!;
	assert.isAbove(
		rosterBase,
		leagueBase + 1.5,
		"precondition: plans must differ",
	);
	const overrideMinutes = Math.floor((rosterBase + leagueBase) / 2);
	assert.isAbove(
		overrideMinutes,
		leagueBase,
		"precondition: override above league base",
	);
	assert.isAtMost(
		overrideMinutes,
		rosterBase,
		"precondition: override legal under roster-relative base",
	);

	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: target.pid!,
		protectedFromIncrease: true,
	});
	await expect(
		api.main.updateBasketballCurrentMinutesOverride({
			tid: 0,
			pid: target.pid!,
			minutes: overrideMinutes,
		}),
	).rejects.toThrow(/Disable Prevent injury increase/);
	const stored = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(stored.noInjuryMinutesIncreasePids, [target.pid!]);
	assert.isUndefined(stored.currentMinutesOverrideByPid);
	assert.isUndefined(stored.currentMinutesOverrideContext);
});

test("API accepts a protected Current Override legal under the league-relative healthy base even when the roster-relative base is lower", async () => {
	const userPlayers = makeLeaguePlayers(
		0,
		[80, 75, 70, 65, 60, 55, 50, 45],
		100,
	);
	const weakerLeague = makeLeaguePlayers(
		1,
		[45, 44, 43, 42, 41, 40, 39, 38],
		200,
	);
	const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
	await resetCache({ players: [...userPlayers, ...weakerLeague], teams: [t] });
	await api.main.updateBasketballRotationProfile({
		tid: 0,
		rotationDepth: "normal",
		coreReliance: "balanced",
	});

	const rotation = getAutoRotation();
	const rosterPlan = getBasketballRotationMinutes({
		rotation,
		players: getRotationPlayerInputs(userPlayers),
		numPlayersOnCourt: 5,
		playoffs: false,
	});
	const leagueMap = getLeagueRotationOvrPercentiles(
		await idb.cache.players.indexGetAll("playersByTid", [0, Infinity]),
	);
	const leaguePlan = getBasketballRotationMinutes({
		rotation,
		players: getRotationPlayerInputs(userPlayers, leagueMap),
		numPlayersOnCourt: 5,
		playoffs: false,
	});
	const target = userPlayers[5]!;
	const rosterBase = rosterPlan.minutesByPid[target.pid!]!;
	const leagueBase = leaguePlan.minutesByPid[target.pid!]!;
	assert.isAbove(
		leagueBase,
		rosterBase + 1.5,
		"precondition: plans must differ",
	);
	const overrideMinutes = Math.floor((rosterBase + leagueBase) / 2);
	assert.isAbove(
		overrideMinutes,
		rosterBase,
		"precondition: override above roster-relative base",
	);
	assert.isAtMost(
		overrideMinutes,
		leagueBase,
		"precondition: override legal under league-relative base",
	);

	await api.main.updateBasketballNoInjuryMinutesIncrease({
		tid: 0,
		pid: target.pid!,
		protectedFromIncrease: true,
	});
	await api.main.updateBasketballCurrentMinutesOverride({
		tid: 0,
		pid: target.pid!,
		minutes: overrideMinutes,
	});
	const stored = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(stored.currentMinutesOverrideByPid, {
		[target.pid!]: overrideMinutes,
	});

	const teamRecord = await idb.cache.teams.get(0);
	const processed = await processTeam(
		{ ...teamRecord!, rotationOvrPercentiles: leagueMap },
		{ won: 0, lost: 0, tied: 0, otl: 0, cid: 0, did: 0 },
		userPlayers,
	);
	const processedTarget = processed.player.find(
		(p: { id: number }) => p.id === target.pid,
	) as { plannedMinutes: number } | undefined;
	assert.strictEqual(processedTarget?.plannedMinutes, overrideMinutes);
});
