import { assert, beforeEach, test } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER, helpers } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { player, team } from "../index.ts";
import reconcileBasketballRotation from "./reconcileBasketballRotation.ts";
import {
	getBasketballMinutesOverrideContext,
	getBasketballRotationMinutes,
	getBasketballRotationPlayerInput,
	getGameEffectiveBasketballMinutes,
} from "./basketballMinutes.ts";

const VALUES = [40, 36, 34, 32, 30, 26, 24, 18];

const getHealthyPlan = async () => {
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	const players = await idb.cache.players.indexGetAll("playersByTid", 0);
	return getBasketballRotationMinutes({
		rotation,
		players: players.map((p) =>
			getBasketballRotationPlayerInput({
				pid: p.pid,
				rosterOrder: p.rosterOrder,
				ratings: p.ratings.at(-1)! as unknown as Record<string, unknown>,
				useFuzzedRatings: true,
			}),
		),
		numPlayersOnCourt: 5,
		playoffs: false,
	});
};

const setup = async () => {
	const players = Array.from({ length: 8 }, (_, i) => {
		const p = player.generate(0, 25, 2024, true, DEFAULT_LEVEL);
		p.pid = 100 + i;
		p.rosterOrder = i;
		return p;
	});
	const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
	t.basketballRotation = {
		version: 1,
		mode: "custom",
		minutesByPid: Object.fromEntries(
			players.map((p, i) => [p.pid!, VALUES[i]!]),
		),
		numPlayersOnCourtAtSave: 5,
	};
	await resetCache({ players, teams: [t] });
	return players;
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("season", 2024);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
});

test("roster reconciliation stores a baseline and shares the outgoing vacancy", async () => {
	const players = await setup();
	const outgoing = players[0]!;
	outgoing.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(outgoing);

	const incoming = player.generate(0, 24, 2024, true, DEFAULT_LEVEL);
	incoming.pid = 999;
	incoming.rosterOrder = 7;
	await idb.cache.players.put(incoming);

	await reconcileBasketballRotation([0]);
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.mode, "custom");
	assert.strictEqual(rotation.minutesByPid![outgoing.pid!], undefined);
	assert.strictEqual(rotation.minutesByPid![incoming.pid!], 0);
	assert.deepEqual(rotation.autoFilledPids, [incoming.pid]);
	assert.strictEqual(rotation.rosterAutoFillActive, true);
	assert.deepEqual(
		players
			.filter((p) => p.pid !== outgoing.pid)
			.map((p) => rotation.minutesByPid![p.pid!]),
		VALUES.slice(1),
	);
	assert.strictEqual(
		Object.values(rotation.minutesByPid!).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		200,
	);
	const healthy = await getHealthyPlan();
	assert.strictEqual(healthy.gameReady, true);
	assert.strictEqual(
		Object.values(healthy.minutesByPid).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		240,
	);
	assert.isBelow(healthy.minutesByPid[incoming.pid]!, 40);
	assert.isTrue(
		players
			.filter((p) => p.pid !== outgoing.pid && p.pid !== incoming.pid)
			.some(
				(p) => healthy.minutesByPid[p.pid!]! > rotation.minutesByPid![p.pid!]!,
			),
	);
});

test("trading an injured player uses his original healthy Custom vacancy", async () => {
	const players = await setup();
	const outgoing = players[0]!;
	const healthyMinutes = Object.fromEntries(
		players.map((p, i) => [p.pid!, VALUES[i]!]),
	);
	const temporary = getGameEffectiveBasketballMinutes({
		players: players.map((p) => ({
			pid: p.pid!,
			rosterOrder: p.rosterOrder,
			endurance: 0.7,
			available: p.pid !== outgoing.pid,
			value: 1,
		})),
		minutesByPid: healthyMinutes,
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
	});
	assert.strictEqual(temporary[outgoing.pid!], 0);
	assert.strictEqual(healthyMinutes[outgoing.pid!], 40);

	outgoing.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(outgoing);
	const incoming = player.generate(0, 24, 2024, true, DEFAULT_LEVEL);
	incoming.pid = 999;
	incoming.rosterOrder = 7;
	await idb.cache.players.put(incoming);
	await reconcileBasketballRotation([0]);

	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.minutesByPid![incoming.pid!], 0);
	assert.deepEqual(rotation.autoFilledPids, [incoming.pid]);
	assert.strictEqual(rotation.rosterAutoFillActive, true);
	assert.strictEqual(rotation.minutesByPid![101], healthyMinutes[101]);
	const healthyPlan = await getHealthyPlan();
	assert.strictEqual(healthyPlan.gameReady, true);
	assert.strictEqual(
		Object.values(healthyPlan.minutesByPid).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		240,
	);
	assert.strictEqual(
		Object.values(rotation.minutesByPid!).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		200,
	);
});

test("healthy and injured departures have the same saved roster overlay semantics", async () => {
	const trade = async (injured: boolean) => {
		const players = await setup();
		const outgoing = players[0]!;
		const healthyMinutes = Object.fromEntries(
			players.map((p, i) => [p.pid!, VALUES[i]!]),
		);
		if (injured) {
			const temporary = getGameEffectiveBasketballMinutes({
				players: players.map((p) => ({
					pid: p.pid!,
					rosterOrder: p.rosterOrder,
					endurance: 0.7,
					available: p.pid !== outgoing.pid,
					value: 1,
				})),
				minutesByPid: healthyMinutes,
				numPlayersOnCourt: 5,
				regulationMinutes: 48,
			});
			assert.strictEqual(temporary[outgoing.pid!], 0);
		}
		outgoing.tid = PLAYER.FREE_AGENT;
		await idb.cache.players.put(outgoing);
		const incoming = player.generate(0, 24, 2024, true, DEFAULT_LEVEL);
		incoming.pid = 999;
		incoming.rosterOrder = 7;
		await idb.cache.players.put(incoming);
		await reconcileBasketballRotation([0]);
		return (await idb.cache.teams.get(0))!.basketballRotation!;
	};

	const healthyTrade = await trade(false);
	const injuredTrade = await trade(true);
	assert.deepEqual(injuredTrade.minutesByPid, healthyTrade.minutesByPid);
	assert.deepEqual(injuredTrade.autoFilledPids, healthyTrade.autoFilledPids);
	assert.strictEqual(
		injuredTrade.rosterAutoFillActive,
		healthyTrade.rosterAutoFillActive,
	);
});

test("positive-minute release without an incoming player keeps the overlay active", async () => {
	const players = await setup();
	const outgoing = players[0]!;
	outgoing.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(outgoing);

	await reconcileBasketballRotation([0]);
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.autoFilledPids, undefined);
	assert.strictEqual(rotation.rosterAutoFillActive, true);
	assert.deepEqual(Object.values(rotation.minutesByPid!), VALUES.slice(1));
	const healthy = await getHealthyPlan();
	assert.strictEqual(healthy.gameReady, true);
	assert.strictEqual(
		Object.values(healthy.minutesByPid).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		240,
	);
});

test("a court-size change relegalizes the saved custom plan and fingerprint", async () => {
	await setup();
	await reconcileBasketballRotation([0], { numPlayersOnCourt: 3 });
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

test("same-roster reorder preserves an invalid-total raw draft", async () => {
	const players = await setup();
	const teamRecord = (await idb.cache.teams.get(0))!;
	const raw = Object.fromEntries(
		players.map((p, i) => [p.pid!, [39, 36, 34, 32, 30, 26, 24, 18][i]!]),
	);
	teamRecord.basketballRotation!.minutesByPid = raw;
	await idb.cache.teams.put(teamRecord);

	for (const [i, p] of players.entries()) {
		p.rosterOrder = players.length - i - 1;
		await idb.cache.players.put(p);
	}
	await reconcileBasketballRotation([0]);

	assert.deepEqual(
		(await idb.cache.teams.get(0))!.basketballRotation!.minutesByPid,
		raw,
	);
});

test("legacy reserve priority is dropped during sort and membership reconciliation", async () => {
	const players = await setup();
	const teamRecord = (await idb.cache.teams.get(0))!;
	teamRecord.basketballRotation = {
		version: 1,
		mode: "custom",
		rotationDepth: "long",
		coreReliance: "low",
		minutesByPid: Object.fromEntries(
			players.map((p, i) => [p.pid!, [48, 44, 40, 38, 36, 34, 0, 0][i]!]),
		),
		numPlayersOnCourtAtSave: 5,
		reservePriorityPids: [107, 106],
	} as unknown as NonNullable<typeof teamRecord.basketballRotation>;
	await idb.cache.teams.put(teamRecord);

	for (const [i, p] of players.entries()) {
		p.rosterOrder = players.length - i - 1;
		await idb.cache.players.put(p);
	}
	await reconcileBasketballRotation([0]);
	assert.isUndefined(
		(
			(await idb.cache.teams.get(0))!.basketballRotation as unknown as Record<
				string,
				unknown
			>
		).reservePriorityPids,
	);

	const outgoing = players.find((p) => p.pid === 106)!;
	outgoing.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(outgoing);
	const incoming = player.generate(0, 24, 2024, true, DEFAULT_LEVEL);
	incoming.pid = 999;
	incoming.rosterOrder = 7;
	await idb.cache.players.put(incoming);
	await reconcileBasketballRotation([0]);
	assert.isUndefined(
		(
			(await idb.cache.teams.get(0))!.basketballRotation as unknown as Record<
				string,
				unknown
			>
		).reservePriorityPids,
	);
	assert.deepEqual(
		(await idb.cache.teams.get(0))!.basketballRotation!.autoFilledPids,
		[999],
	);
	assert.strictEqual(
		(await idb.cache.teams.get(0))!.basketballRotation!.minutesByPid![999],
		0,
	);
	assert.strictEqual(
		(await idb.cache.teams.get(0))!.basketballRotation!.rosterAutoFillActive,
		undefined,
	);
});

test("a pure new signing does not activate a roster overlay", async () => {
	await setup();
	const incoming = player.generate(0, 24, 2024, true, DEFAULT_LEVEL);
	incoming.pid = 999;
	incoming.rosterOrder = 8;
	await idb.cache.players.put(incoming);
	await reconcileBasketballRotation([0]);

	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(rotation.autoFilledPids, [999]);
	assert.strictEqual(rotation.rosterAutoFillActive, undefined);
	assert.strictEqual(
		Object.values(rotation.minutesByPid!).reduce(
			(total, minutes) => total + minutes,
			0,
		),
		240,
	);
	assert.strictEqual(rotation.minutesByPid![999], 0);
});

test("an availability context change permanently invalidates Current Override without later revival", async () => {
	const players = await setup();
	const teamRecord = (await idb.cache.teams.get(0))!;
	const contextPlayers = players.map((p) => ({ pid: p.pid! }));
	teamRecord.playThroughInjuries = [0, 0];
	players[0]!.injury = { type: "Ankle", gamesRemaining: 5 };
	await idb.cache.players.put(players[0]!);
	const availableA = new Set(players.slice(1).map((p) => p.pid!));
	teamRecord.basketballRotation = {
		...teamRecord.basketballRotation!,
		currentMinutesOverrideByPid: { 101: 36 },
		currentMinutesOverrideContext: getBasketballMinutesOverrideContext({
			players: contextPlayers,
			available: availableA,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		}),
	};
	await idb.cache.teams.put(teamRecord);

	await reconcileBasketballRotation([0]);
	assert.deepEqual(
		(await idb.cache.teams.get(0))!.basketballRotation!
			.currentMinutesOverrideByPid,
		{ 101: 36 },
	);

	players[0]!.injury = { type: "Healthy", gamesRemaining: 0 };
	players[2]!.injury = { type: "Knee", gamesRemaining: 5 };
	await idb.cache.players.put(players[0]!);
	await idb.cache.players.put(players[2]!);
	await reconcileBasketballRotation([0]);
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);

	players[0]!.injury = { type: "Ankle", gamesRemaining: 5 };
	players[2]!.injury = { type: "Healthy", gamesRemaining: 0 };
	await idb.cache.players.put(players[0]!);
	await idb.cache.players.put(players[2]!);
	await reconcileBasketballRotation([0]);
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);
});

test("roster, court-size, and regulation changes invalidate Current Override even in Auto mode", async () => {
	const players = await setup();
	const teamRecord = (await idb.cache.teams.get(0))!;
	const contextPlayers = players.map((p) => ({ pid: p.pid! }));
	const available = new Set(players.map((p) => p.pid!));
	teamRecord.basketballRotation = {
		version: 1,
		mode: "auto",
		currentMinutesOverrideByPid: { 101: 36 },
		currentMinutesOverrideContext: getBasketballMinutesOverrideContext({
			players: contextPlayers,
			available,
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		}),
	};
	await idb.cache.teams.put(teamRecord);

	await reconcileBasketballRotation([0], { numPlayersOnCourt: 3 });
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);

	rotation.currentMinutesOverrideByPid = { 101: 24 };
	rotation.currentMinutesOverrideContext = getBasketballMinutesOverrideContext({
		players: contextPlayers,
		available,
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
	});
	await idb.cache.teams.put({ ...teamRecord, basketballRotation: rotation });
	await reconcileBasketballRotation([0], { regulationMinutes: 36 });
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);

	rotation.currentMinutesOverrideByPid = { 101: 24 };
	rotation.currentMinutesOverrideContext = getBasketballMinutesOverrideContext({
		players: contextPlayers,
		available,
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
	});
	await idb.cache.teams.put({ ...teamRecord, basketballRotation: rotation });
	players[7]!.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(players[7]!);
	await reconcileBasketballRotation([0]);
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
});

test("reconciliation removes one-sided partial Current Override fields", async () => {
	await setup();
	let teamRecord = (await idb.cache.teams.get(0))!;
	teamRecord.basketballRotation = {
		...teamRecord.basketballRotation!,
		currentMinutesOverrideByPid: { 101: 36 },
	};
	await idb.cache.teams.put(teamRecord);
	await reconcileBasketballRotation([0]);
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);

	teamRecord = (await idb.cache.teams.get(0))!;
	teamRecord.basketballRotation = {
		...teamRecord.basketballRotation!,
		currentMinutesOverrideContext: {
			rosterPids: [],
			unavailablePids: [],
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		},
	};
	await idb.cache.teams.put(teamRecord);
	await reconcileBasketballRotation([0]);
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);
});

test("reconciliation removes one-sided partial Current Override fields in Auto mode and persists to cache", async () => {
	await setup();
	let teamRecord = (await idb.cache.teams.get(0))!;
	teamRecord.basketballRotation = {
		version: 1,
		mode: "auto",
		currentMinutesOverrideByPid: { 101: 36 },
	};
	await idb.cache.teams.put(teamRecord);
	await reconcileBasketballRotation([0]);
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);

	teamRecord = (await idb.cache.teams.get(0))!;
	teamRecord.basketballRotation = {
		version: 1,
		mode: "auto",
		currentMinutesOverrideContext: {
			rosterPids: [100, 101],
			unavailablePids: [],
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		},
	};
	await idb.cache.teams.put(teamRecord);
	await reconcileBasketballRotation([0]);
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);

	teamRecord = (await idb.cache.teams.get(0))!;
	teamRecord.basketballRotation = {
		version: 1,
		mode: "auto",
		currentMinutesOverrideByPid: {},
		currentMinutesOverrideContext: {
			rosterPids: [100, 101],
			unavailablePids: [],
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		},
	};
	await idb.cache.teams.put(teamRecord);
	await reconcileBasketballRotation([0]);
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);
});

test("ratings drift invalidates only the protected pin exceeding its new healthy base and preserves unrelated valid pins", async () => {
	const positions = ["PG", "SG", "SF", "PF", "C", "SG", "PF", "C"];
	const ovrs = [80, 75, 70, 65, 60, 55, 50, 45];
	const players = Array.from({ length: 8 }, (_, i) => {
		const p = player.generate(0, 25, 2024, true, DEFAULT_LEVEL);
		p.pid = 100 + i;
		p.rosterOrder = i;
		const r = p.ratings.at(-1)!;
		r.ovr = ovrs[i]!;
		r.endu = 80;
		r.pos = positions[i]!;
		r.fuzz = 0;
		return p;
	});
	const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
	t.basketballRotation = {
		version: 1,
		mode: "auto",
		rotationDepth: "normal",
		coreReliance: "balanced",
		noInjuryMinutesIncreasePids: [101],
	};
	await resetCache({ players, teams: [t] });

	const initialInputs = players.map((p) =>
		getBasketballRotationPlayerInput({
			pid: p.pid!,
			rosterOrder: p.rosterOrder,
			ratings: p.ratings.at(-1)! as unknown as Record<string, unknown>,
			useFuzzedRatings: true,
		}),
	);
	const initialPlan = getBasketballRotationMinutes({
		rotation: t.basketballRotation,
		players: initialInputs,
		numPlayersOnCourt: 5,
		playoffs: false,
	});

	const pin101 = Math.floor(initialPlan.minutesByPid[101]! - 2);
	const pin102 = Math.floor(initialPlan.minutesByPid[102]! - 2);
	assert.isAbove(pin101, 20);
	assert.isAbove(pin102, 20);

	const context = getBasketballMinutesOverrideContext({
		players: players.map((p) => ({ pid: p.pid! })),
		available: new Set(players.map((p) => p.pid!)),
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
	});
	t.basketballRotation.currentMinutesOverrideByPid = {
		101: pin101,
		102: pin102,
	};
	t.basketballRotation.currentMinutesOverrideContext = context;
	await idb.cache.teams.put(t);

	// Drift ratings: severely drop player 101's ovr so his healthy base falls well below pin101
	// Player 102 remains unchanged.
	const p101 = players.find((p) => p.pid === 101)!;
	p101.ratings.at(-1)!.ovr = 20;
	await idb.cache.players.put(p101);

	await reconcileBasketballRotation([0]);
	const updated = (await idb.cache.teams.get(0))!.basketballRotation!;
	// Pin 101 should be removed because 101 is protected and pin101 > new healthyHardCap.
	// Pin 102 should be preserved because it remains valid.
	assert.deepEqual(updated.currentMinutesOverrideByPid, {
		102: pin102,
	});
	assert.deepEqual(updated.currentMinutesOverrideContext, context);
	assert.deepEqual(updated.noInjuryMinutesIncreasePids, [101]);
});

test("ratings drift that leaves all pins legal preserves the Current Override pair exactly", async () => {
	const positions = ["PG", "SG", "SF", "PF", "C", "SG", "PF", "C"];
	const ovrs = [80, 75, 70, 65, 60, 55, 50, 45];
	const players = Array.from({ length: 8 }, (_, i) => {
		const p = player.generate(0, 25, 2024, true, DEFAULT_LEVEL);
		p.pid = 100 + i;
		p.rosterOrder = i;
		const r = p.ratings.at(-1)!;
		r.ovr = ovrs[i]!;
		r.endu = 80;
		r.pos = positions[i]!;
		r.fuzz = 0;
		return p;
	});
	const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
	t.basketballRotation = {
		version: 1,
		mode: "auto",
		rotationDepth: "normal",
		coreReliance: "balanced",
		noInjuryMinutesIncreasePids: [100],
	};
	await resetCache({ players, teams: [t] });

	const context = getBasketballMinutesOverrideContext({
		players: players.map((p) => ({ pid: p.pid! })),
		available: new Set(players.map((p) => p.pid!)),
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
	});
	t.basketballRotation.currentMinutesOverrideByPid = {
		100: 25,
		101: 25,
	};
	t.basketballRotation.currentMinutesOverrideContext = context;
	await idb.cache.teams.put(t);

	const p0 = players[0]!;
	p0.ratings.at(-1)!.ovr = 78;
	await idb.cache.players.put(p0);

	await reconcileBasketballRotation([0]);
	const updated = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(updated.currentMinutesOverrideByPid, {
		100: 25,
		101: 25,
	});
	assert.deepEqual(updated.currentMinutesOverrideContext, context);
});

test("derived playoff healthy plan changes remove protected pins exceeding playoff base while preserving legal pins", async () => {
	const positions = ["PG", "SG", "SF", "PF", "C", "SG", "PF", "C", "SF", "PF"];
	const ovrs = [85, 80, 75, 70, 65, 55, 50, 45, 40, 35];
	const players = Array.from({ length: 10 }, (_, i) => {
		const p = player.generate(0, 25, 2024, true, DEFAULT_LEVEL);
		p.pid = 100 + i;
		p.rosterOrder = i;
		const r = p.ratings.at(-1)!;
		r.ovr = ovrs[i]!;
		r.endu = 80;
		r.pos = positions[i]!;
		r.fuzz = 0;
		return p;
	});
	const t = team.generate({ ...helpers.getTeamsDefault()[0], tid: 0 });
	t.basketballRotation = {
		version: 1,
		mode: "auto",
		rotationDepth: "normal",
		coreReliance: "balanced",
		noInjuryMinutesIncreasePids: [100, 106],
	};
	await resetCache({ players, teams: [t] });

	const regInputs = players.map((p) =>
		getBasketballRotationPlayerInput({
			pid: p.pid!,
			rosterOrder: p.rosterOrder,
			ratings: p.ratings.at(-1)! as unknown as Record<string, unknown>,
			useFuzzedRatings: true,
		}),
	);
	const regPlan = getBasketballRotationMinutes({
		rotation: t.basketballRotation,
		players: regInputs,
		numPlayersOnCourt: 5,
		playoffs: false,
	});
	const playoffPlan = getBasketballRotationMinutes({
		rotation: t.basketballRotation,
		players: regInputs,
		numPlayersOnCourt: 5,
		playoffs: true,
	});

	const reg106 = regPlan.minutesByPid[106] ?? 0;
	const playoff106 = playoffPlan.minutesByPid[106] ?? 0;
	assert.isAbove(reg106, playoff106);

	const context = getBasketballMinutesOverrideContext({
		players: players.map((p) => ({ pid: p.pid! })),
		available: new Set(players.map((p) => p.pid!)),
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
	});
	t.basketballRotation.currentMinutesOverrideByPid = {
		100: 30,
		106: Math.floor(reg106),
	};
	t.basketballRotation.currentMinutesOverrideContext = context;
	await idb.cache.teams.put(t);

	// Reconcile with playoffs: false -> both pins preserved
	await reconcileBasketballRotation([0], { playoffs: false });
	let updated = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(updated.currentMinutesOverrideByPid, {
		100: 30,
		106: Math.floor(reg106),
	});

	// Reconcile with playoffs: true -> protected pin 106 exceeds playoff healthy cap and is removed; pin 100 preserved
	await reconcileBasketballRotation([0], { playoffs: true });
	updated = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(updated.currentMinutesOverrideByPid, {
		100: 30,
	});
	assert.deepEqual(updated.currentMinutesOverrideContext, context);
});

test("reconciliation under challengeNoRatings does not derive or leak true league OVR percentiles", async () => {
	const players = await setup();
	const t = (await idb.cache.teams.get(0))!;
	t.basketballRotation = {
		version: 1,
		mode: "auto",
		rotationDepth: "normal",
		coreReliance: "balanced",
		noInjuryMinutesIncreasePids: [100],
	};
	const context = getBasketballMinutesOverrideContext({
		players: players.map((p) => ({ pid: p.pid! })),
		available: new Set(players.map((p) => p.pid!)),
		numPlayersOnCourt: 5,
		regulationMinutes: 48,
	});
	t.basketballRotation.currentMinutesOverrideByPid = {
		100: 25,
	};
	t.basketballRotation.currentMinutesOverrideContext = context;
	await idb.cache.teams.put(t);

	g.setWithoutSavingToDB("challengeNoRatings", true);
	await reconcileBasketballRotation([0], { challengeNoRatings: true });
	const updated = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.deepEqual(updated.currentMinutesOverrideByPid, {
		100: 25,
	});
	assert.deepEqual(updated.currentMinutesOverrideContext, context);
});

test("custom roster overlay vacancy reconciliation utilizes supplied league-relative OVR percentiles", async () => {
	const players = await setup();
	const outgoing = players[0]!;
	outgoing.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(outgoing);

	const incoming = player.generate(0, 24, 2024, true, DEFAULT_LEVEL);
	incoming.pid = 999;
	incoming.rosterOrder = 7;
	await idb.cache.players.put(incoming);

	const customPercentiles = new Map<number, number>([
		[101, 0.95],
		[102, 0.2],
		[103, 0.2],
		[104, 0.2],
		[105, 0.2],
		[106, 0.2],
		[107, 0.2],
		[999, 0.1],
	]);

	await reconcileBasketballRotation([0], {
		rotationOvrPercentiles: customPercentiles,
	});
	const rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.strictEqual(rotation.mode, "custom");
	assert.deepEqual(rotation.autoFilledPids, [999]);
});
