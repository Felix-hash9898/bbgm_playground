import { assert, beforeEach, test } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER, helpers } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { player, team } from "../index.ts";
import reconcileBasketballRotation from "./reconcileBasketballRotation.ts";
import {
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
