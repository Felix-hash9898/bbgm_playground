import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import Cache, { STORES } from "../../db/Cache.ts";
import { connectLeague, idb } from "../../db/index.ts";
import { g, helpers, local, lock } from "../../util/index.ts";
import * as workerUtil from "../../util/index.ts";
import { league, phase, player, team, trade } from "../index.ts";
import play from "./play.ts";

let lid: number;
let previousAutoSave: boolean;

const makePlayer = (tid: number, value = 45) => {
	const p = player.generate(tid, 30, g.get("season") - 8, true, DEFAULT_LEVEL);
	p.value = value;
	p.valueNoPot = value;
	if (tid === PLAYER.FREE_AGENT) {
		p.contract.amount = g.get("maxContract");
		p.contract.exp = g.get("season");
		p.numDaysFreeAgent = 3;
	} else {
		p.contract.amount = g.get("minContract");
	}
	return p;
};

const readPlayer = async (pid: number) => {
	const tx = idb.league.transaction(["players"], "readonly");
	const p = await tx.objectStore("players").get(pid);
	await tx.done;
	return p;
};

const readGameAttribute = async (key: string) => {
	const tx = idb.league.transaction(["gameAttributes"], "readonly");
	const row = await tx.objectStore("gameAttributes").get(key);
	await tx.done;
	return row?.value;
};

beforeEach(async () => {
	resetG();
	lid = 900_000 + Math.floor(Math.random() * 90_000);
	g.setWithoutSavingToDB("lid", lid);
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	g.setWithoutSavingToDB("daysLeft", 2);
	g.setWithoutSavingToDB("numTeams", 2);
	g.setWithoutSavingToDB("numActiveTeams", 2);
	previousAutoSave = local.autoSave;
	local.autoSave = true;
	idb.league = await connectLeague(lid);
	idb.cache = new Cache();
	for (const store of STORES) {
		idb.cache._data[store] = {};
		idb.cache._deletes[store] = new Set();
		idb.cache._dirtyRecords[store] = new Set();
		idb.cache._maxIds[store] = -1;
		idb.cache._markDirtyIndexes(store);
	}
	idb.cache._status = "full";

	const players = [
		...Array.from({ length: g.get("minRosterSize") }, () => makePlayer(0)),
		...Array.from({ length: g.get("minRosterSize") - 1 }, () => makePlayer(1)),
		makePlayer(PLAYER.FREE_AGENT, 80),
	];
	for (const p of players) {
		await idb.cache.players.add(p);
	}
	for (const row of helpers.getTeamsDefault().slice(0, 2)) {
		await idb.cache.teams.add(team.generate(row));
	}
	await idb.cache.gameAttributes.put({ key: "daysLeft", value: 2 });
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	idb.cache.startAutoFlush();
});

afterEach(async () => {
	vi.restoreAllMocks();
	await lock.set("gameSim", false);
	await lock.set("stopGameSim", false);
	idb.cache.stopAutoFlush();
	idb.league.close();
	await deleteDB(`league${lid}`);
	local.autoSave = previousAutoSave;
});

test("free-agency request rolls back before enabled autoflush and retries on the same Cache", async () => {
	const freeAgent = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;
	const originalDemand = {
		amount: freeAgent.contract.amount,
		exp: freeAgent.contract.exp,
		numDaysFreeAgent: freeAgent.numDaysFreeAgent,
	};
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	const laterError = new Error("later day operation failed");
	vi.spyOn(trade, "betweenAiTeams").mockRejectedValueOnce(laterError);

	let rejected = false;
	try {
		await play(1, {} as any, false);
	} catch (error) {
		rejected = error === laterError;
	}
	assert.equal(rejected, true);
	assert.strictEqual(
		(await idb.cache.players.get(freeAgent.pid))?.tid,
		PLAYER.FREE_AGENT,
	);
	const rolledBackFreeAgent = await idb.cache.players.get(freeAgent.pid);
	assert.strictEqual(
		rolledBackFreeAgent?.contract.amount,
		originalDemand.amount,
	);
	assert.strictEqual(rolledBackFreeAgent?.contract.exp, originalDemand.exp);
	assert.strictEqual(
		rolledBackFreeAgent?.numDaysFreeAgent,
		originalDemand.numDaysFreeAgent,
	);
	assert.strictEqual(g.get("daysLeft"), 2);
	await new Promise((resolve) => setTimeout(resolve, 4500));
	const durableFreeAgent = await readPlayer(freeAgent.pid);
	assert.strictEqual(durableFreeAgent?.tid, PLAYER.FREE_AGENT);
	assert.strictEqual(durableFreeAgent?.contract.amount, originalDemand.amount);
	assert.strictEqual(durableFreeAgent?.contract.exp, originalDemand.exp);
	assert.strictEqual(
		durableFreeAgent?.numDaysFreeAgent,
		originalDemand.numDaysFreeAgent,
	);
	assert.strictEqual(await readGameAttribute("daysLeft"), 2);

	vi.mocked(trade.betweenAiTeams).mockRestore();
	vi.spyOn(trade, "betweenAiTeams").mockResolvedValue(undefined as any);

	await play(1, {} as any, false);
	assert.strictEqual((await idb.cache.players.get(freeAgent.pid))?.tid, 1);
	assert.strictEqual((await readPlayer(freeAgent.pid))?.tid, 1);
});

test("multi-day request rolls back the whole request on a controlled failure", async () => {
	await league.setGameAttributes({ daysLeft: 4 });
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	const freeAgent = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	const laterError = new Error("second free-agency day failed");
	let tradeCalls = 0;
	const toUISpy = vi.spyOn(workerUtil, "toUI");
	vi.spyOn(trade, "betweenAiTeams").mockImplementation(async () => {
		tradeCalls += 1;
		if (tradeCalls === 2) {
			throw laterError;
		}
		return undefined as any;
	});

	let caught: unknown;
	try {
		await play(3, {} as any, false);
	} catch (error) {
		caught = error;
	}
	assert.strictEqual(caught, laterError);
	assert.strictEqual(tradeCalls, 2);
	const playerMovementUpdates = toUISpy.mock.calls.filter(
		([name, args]) =>
			name === "realtimeUpdate" &&
			Array.isArray(args[0]) &&
			args[0].includes("playerMovement"),
	).length;
	assert.strictEqual(playerMovementUpdates, 0);
	assert.strictEqual(g.get("daysLeft"), 4);
	assert.strictEqual(
		(await idb.cache.gameAttributes.get("daysLeft"))?.value,
		4,
	);
	assert.strictEqual(await readGameAttribute("daysLeft"), 4);
	assert.strictEqual(
		(await idb.cache.players.get(freeAgent.pid))?.tid,
		PLAYER.FREE_AGENT,
	);
	assert.strictEqual((await readPlayer(freeAgent.pid))?.tid, PLAYER.FREE_AGENT);

	await new Promise((resolve) => setTimeout(resolve, 4500));
	assert.strictEqual(await readGameAttribute("daysLeft"), 4);

	await play(3, {} as any, false);
	assert.strictEqual(tradeCalls, 5);
	assert.strictEqual(g.get("daysLeft"), 1);
	assert.strictEqual(await readGameAttribute("daysLeft"), 1);
	assert.strictEqual((await idb.cache.players.get(freeAgent.pid))?.tid, 1);
	assert.strictEqual((await readPlayer(freeAgent.pid))?.tid, 1);
});

test("multi-day success flushes once at the request boundary", async () => {
	await league.setGameAttributes({ daysLeft: 4 });
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	vi.spyOn(trade, "betweenAiTeams").mockResolvedValue(undefined as any);
	const flushSpy = vi.spyOn(idb.cache, "flush");

	await play(2, {} as any, false);

	assert.strictEqual(flushSpy.mock.calls.length, 1);
	assert.strictEqual(g.get("daysLeft"), 2);
	assert.strictEqual(await readGameAttribute("daysLeft"), 2);
});

test("one-day refresh remains immediate and multi-day refresh is batched", async () => {
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	const tradeSpy = vi
		.spyOn(trade, "betweenAiTeams")
		.mockResolvedValue(undefined as any);
	const toUISpy = vi.spyOn(workerUtil, "toUI");

	await league.setGameAttributes({ daysLeft: 4 });
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	await play(1, {} as any, false);
	assert.deepStrictEqual(tradeSpy.mock.calls[0], []);
	assert.strictEqual(
		toUISpy.mock.calls.filter(
			([name, args]) =>
				name === "realtimeUpdate" &&
				Array.isArray(args[0]) &&
				args[0].includes("playerMovement"),
		).length,
		1,
	);

	toUISpy.mockClear();
	tradeSpy.mockClear();
	await league.setGameAttributes({ daysLeft: 4 });
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	await play(2, {} as any, false);
	assert.deepStrictEqual(
		tradeSpy.mock.calls.map(([options]) => options),
		[{ deferUiRefresh: true }, { deferUiRefresh: true }],
	);
	assert.strictEqual(
		toUISpy.mock.calls.filter(
			([name, args]) =>
				name === "realtimeUpdate" &&
				Array.isArray(args[0]) &&
				args[0].includes("playerMovement"),
		).length,
		1,
	);
});

test("stopGameSim flushes completed days before an early return", async () => {
	await league.setGameAttributes({ daysLeft: 4 });
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	let tradeCalls = 0;
	vi.spyOn(trade, "betweenAiTeams").mockImplementation(async () => {
		tradeCalls += 1;
		await lock.set("stopGameSim", true);
	});
	const flushSpy = vi.spyOn(idb.cache, "flush");
	const toUISpy = vi.spyOn(workerUtil, "toUI");

	await play(3, {} as any, false);

	assert.strictEqual(tradeCalls, 1);
	assert.strictEqual(flushSpy.mock.calls.length, 1);
	assert.strictEqual(g.get("daysLeft"), 3);
	assert.strictEqual(await readGameAttribute("daysLeft"), 3);
	assert.strictEqual(
		toUISpy.mock.calls.filter(
			([name, args]) =>
				name === "realtimeUpdate" &&
				Array.isArray(args[0]) &&
				args[0].includes("playerMovement"),
		).length,
		1,
	);
});

test("PRESEASON transition is included in the final durable boundary", async () => {
	await league.setGameAttributes({ daysLeft: 1 });
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	vi.spyOn(phase, "newPhase").mockImplementation(async (nextPhase) => {
		await league.setGameAttributes({ phase: nextPhase });
		g.setWithoutSavingToDB("phase", nextPhase);
		await idb.cache.flush(undefined, {
			league: idb.league,
			updateLastPlayed: false,
		});
		await workerUtil.toUI("realtimeUpdate", [["playerMovement"]]);
	});
	const flushSpy = vi.spyOn(idb.cache, "flush");
	const toUISpy = vi.spyOn(workerUtil, "toUI");

	await play(2, {} as any, false);

	assert.strictEqual(flushSpy.mock.calls.length, 2);
	assert.strictEqual(g.get("phase"), PHASE.PRESEASON);
	assert.strictEqual(await readGameAttribute("phase"), PHASE.PRESEASON);
	assert.strictEqual(await readGameAttribute("daysLeft"), 0);
	assert.strictEqual(
		toUISpy.mock.calls.filter(
			([name, args]) =>
				name === "realtimeUpdate" &&
				Array.isArray(args[0]) &&
				args[0].includes("playerMovement"),
		).length,
		1,
	);
});

test("final flush failure keeps the committed day dirty for retry", async () => {
	const flushError = new Error("final Free Agency flush failed");
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	const flushSpy = vi
		.spyOn(idb.cache, "flush")
		.mockRejectedValueOnce(flushError);

	let caught: unknown;
	try {
		await play(1, {} as any, false);
	} catch (error) {
		caught = error;
	}

	assert.strictEqual(caught, flushError);
	assert.strictEqual(flushSpy.mock.calls.length, 1);
	assert.strictEqual(g.get("daysLeft"), 1);
	assert.strictEqual(await readGameAttribute("daysLeft"), 2);
	assert.strictEqual(idb.cache._dirty, true);

	flushSpy.mockRestore();
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	assert.strictEqual(await readGameAttribute("daysLeft"), 1);
});
