import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import Cache, { STORES } from "../../db/Cache.ts";
import { connectLeague, idb } from "../../db/index.ts";
import { g, helpers, local } from "../../util/index.ts";
import * as workerUtil from "../../util/index.ts";
import {
	contractNegotiation,
	freeAgents,
	league,
	player,
	team,
	trade,
} from "../index.ts";
import newPhase from "./newPhase.ts";

let lid: number;
let pid: number;
let previousAutoSave: boolean;

const readPlayer = async () => {
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

const readScheduledEvent = async (id: number) => {
	const tx = idb.league.transaction(["scheduledEvents"], "readonly");
	const event = await tx.objectStore("scheduledEvents").get(id);
	await tx.done;
	return event;
};

beforeEach(async () => {
	resetG();
	lid = 800_000 + Math.floor(Math.random() * 90_000);
	g.setWithoutSavingToDB("lid", lid);
	g.setWithoutSavingToDB("phase", PHASE.AFTER_DRAFT);
	g.setWithoutSavingToDB("repeatSeason", {
		type: "players",
		startingSeason: g.get("season"),
	});
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

	for (const row of helpers.getTeamsDefault().slice(0, 2)) {
		await idb.cache.teams.add(team.generate(row));
	}
	const p = player.generate(1, 27, g.get("season") - 5, true, DEFAULT_LEVEL);
	p.contract.exp = g.get("season");
	p.value = 70;
	p.valueNoPot = 68;
	p.usageBias = 1.25;
	pid = await idb.cache.players.add(p);
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	idb.cache.startAutoFlush();

	vi.spyOn(player, "moodInfo").mockResolvedValue({ willing: true } as any);
	vi.spyOn(team, "valueChange").mockResolvedValue(-1);
	vi.spyOn(Math, "random").mockReturnValue(0.99);
});

test.each([0.85, 1.1, 1.25])(
	"user formal same-team re-sign restores usageBias %s",
	async (usageBias) => {
		g.setWithoutSavingToDB("userTid", 1);
		g.setWithoutSavingToDB("userTids", [1]);
		const expiring = await idb.cache.players.get(pid);
		assert.isDefined(expiring);
		expiring!.usageBias = usageBias;
		await idb.cache.players.put(expiring!);

		await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
		const freeAgent = await idb.cache.players.get(pid);
		const negotiation = await idb.cache.negotiations.get(pid);
		assert.strictEqual(freeAgent?.tid, -1);
		assert.strictEqual(freeAgent?.usageBias, 1);
		assert.strictEqual(negotiation?.tid, 1);
		assert.strictEqual(negotiation?.resigning, true);
		assert.strictEqual(negotiation?.usageBiasBeforeFreeAgency, usageBias);
		assert.strictEqual((await readPlayer())?.usageBias, 1);

		const error = await contractNegotiation.accept({
			pid,
			amount: freeAgent!.contract.amount,
			exp: freeAgent!.contract.exp,
		});
		assert.strictEqual(error, undefined);
		assert.strictEqual((await idb.cache.players.get(pid))?.tid, 1);
		assert.strictEqual(
			(await idb.cache.players.get(pid))?.usageBias,
			usageBias,
		);
		assert.strictEqual((await readPlayer())?.usageBias, usageBias);
	},
);

test("canceling formal re-sign then ordinary FA return stays Normal", async () => {
	g.setWithoutSavingToDB("userTid", 1);
	g.setWithoutSavingToDB("userTids", [1]);
	await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
	assert.strictEqual(
		(await idb.cache.negotiations.get(pid))?.usageBiasBeforeFreeAgency,
		1.25,
	);
	await contractNegotiation.cancel(pid);

	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	const createError = await contractNegotiation.create(pid, false, 1);
	assert.strictEqual(createError, undefined);
	const freeAgent = await idb.cache.players.get(pid);
	assert.strictEqual(freeAgent?.usageBias, 1);
	const acceptError = await contractNegotiation.accept({
		pid,
		amount: freeAgent!.contract.amount,
		exp: freeAgent!.contract.exp,
	});
	assert.strictEqual(acceptError, undefined);
	assert.strictEqual((await idb.cache.players.get(pid))?.tid, 1);
	assert.strictEqual((await idb.cache.players.get(pid))?.usageBias, 1);
});

test("canceling formal re-sign then signing a different team stays Normal", async () => {
	g.setWithoutSavingToDB("userTid", 1);
	g.setWithoutSavingToDB("userTids", [1]);
	await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
	assert.strictEqual(
		(await idb.cache.negotiations.get(pid))?.usageBiasBeforeFreeAgency,
		1.25,
	);
	await contractNegotiation.cancel(pid);

	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB("userTids", [0]);
	const createError = await contractNegotiation.create(pid, false, 0);
	assert.strictEqual(createError, undefined);
	const freeAgent = await idb.cache.players.get(pid);
	assert.strictEqual(freeAgent?.usageBias, 1);
	const acceptError = await contractNegotiation.accept({
		pid,
		amount: freeAgent!.contract.amount,
		exp: freeAgent!.contract.exp,
	});
	assert.strictEqual(acceptError, undefined);
	assert.strictEqual((await idb.cache.players.get(pid))?.tid, 0);
	assert.strictEqual((await idb.cache.players.get(pid))?.usageBias, 1);
	assert.strictEqual((await readPlayer())?.usageBias, 1);
});

test("concurrent formal re-sign accepts consume one snapshot and restore once", async () => {
	g.setWithoutSavingToDB("userTid", 1);
	g.setWithoutSavingToDB("userTids", [1]);
	await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
	const freeAgent = await idb.cache.players.get(pid);
	const eventsBefore = (await idb.cache.events.getAll()).length;
	const params = {
		pid,
		amount: freeAgent!.contract.amount,
		exp: freeAgent!.contract.exp,
	};

	const results = await Promise.all([
		contractNegotiation.accept(params),
		contractNegotiation.accept(params),
	]);
	assert.strictEqual(
		results.filter((result) => result === undefined).length,
		1,
	);
	assert.strictEqual(
		results.filter((result) => typeof result === "string").length,
		1,
	);
	assert.strictEqual(await idb.cache.negotiations.get(pid), undefined);
	assert.strictEqual(
		(await idb.cache.events.getAll()).length,
		eventsBefore + 1,
	);
	assert.strictEqual((await idb.cache.players.get(pid))?.usageBias, 1.25);
	assert.strictEqual((await readPlayer())?.usageBias, 1.25);
});

test("trade resets a roster player's usageBias to Normal", async () => {
	assert.strictEqual((await idb.cache.players.get(pid))?.usageBias, 1.25);
	const toUISpy = vi.spyOn(workerUtil, "toUI");
	const recomputeSpy = vi.spyOn(workerUtil, "recomputeLocalUITeamOvrs");
	await trade.processTrade([1, 0], [[pid], []], [[], []]);
	const traded = await idb.cache.players.get(pid);
	assert.strictEqual(traded?.tid, 0);
	assert.strictEqual(traded?.usageBias, 1);
	assert.strictEqual(
		toUISpy.mock.calls.filter(([name]) => name === "realtimeUpdate").length,
		1,
	);
	assert.strictEqual(recomputeSpy.mock.calls.length, 1);
});

test("trade can defer UI-only refreshes when explicitly requested", async () => {
	const toUISpy = vi.spyOn(workerUtil, "toUI");
	const recomputeSpy = vi.spyOn(workerUtil, "recomputeLocalUITeamOvrs");

	await trade.processTrade([1, 0], [[pid], []], [[], []], {
		deferUiRefresh: true,
	});

	assert.strictEqual((await idb.cache.players.get(pid))?.tid, 0);
	assert.strictEqual(
		toUISpy.mock.calls.filter(([name]) => name === "realtimeUpdate").length,
		0,
	);
	assert.strictEqual(recomputeSpy.mock.calls.length, 0);
});

afterEach(async () => {
	vi.restoreAllMocks();
	idb.cache.stopAutoFlush();
	idb.league.close();
	await deleteDB(`league${lid}`);
	local.autoSave = previousAutoSave;
});

test("newPhaseResignPlayers rolls back memory before enabled autoflush and retries on the same Cache", async () => {
	const oldPlayer = structuredClone(await readPlayer());
	const oldDaysLeft = g.get("daysLeft");
	const oldPhase = g.get("phase");
	const oldRandomDebutsForever = (g as any).randomDebutsForever;
	const oldMemory = {
		events: structuredClone(await idb.cache.events.getAll()),
		gameAttributes: structuredClone(await idb.cache.gameAttributes.getAll()),
		negotiations: structuredClone(await idb.cache.negotiations.getAll()),
		players: structuredClone(await idb.cache.players.getAll()),
		schedule: structuredClone(await idb.cache.schedule.getAll()),
		teams: structuredClone(await idb.cache.teams.getAll()),
	};
	const originalSetGameAttributes = league.setGameAttributes;
	const laterError = new Error("daysLeft stage failed");
	vi.spyOn(league, "setGameAttributes").mockImplementation(
		async (attrs, options) => {
			if (Object.hasOwn(attrs, "daysLeft")) {
				throw laterError;
			}
			return originalSetGameAttributes(attrs, options);
		},
	);

	let rejected = false;
	try {
		await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
	} catch (error) {
		rejected = error === laterError;
	}
	assert.equal(rejected, true);
	assert.deepStrictEqual(await idb.cache.events.getAll(), oldMemory.events);
	assert.deepStrictEqual(
		await idb.cache.gameAttributes.getAll(),
		oldMemory.gameAttributes,
	);
	assert.deepStrictEqual(
		await idb.cache.negotiations.getAll(),
		oldMemory.negotiations,
	);
	assert.deepStrictEqual(await idb.cache.players.getAll(), oldMemory.players);
	assert.deepStrictEqual(await idb.cache.schedule.getAll(), oldMemory.schedule);
	assert.deepStrictEqual(await idb.cache.teams.getAll(), oldMemory.teams);
	assert.deepStrictEqual(await idb.cache.players.get(pid), oldPlayer);
	assert.strictEqual(g.get("daysLeft"), oldDaysLeft);
	assert.strictEqual(g.get("phase"), oldPhase);
	assert.strictEqual((g as any).randomDebutsForever, oldRandomDebutsForever);

	// The failed phase must not leave dirty staged state that a resumed real
	// auto-flush can persist.
	await new Promise((resolve) => setTimeout(resolve, 4500));
	assert.deepStrictEqual(await readPlayer(), oldPlayer);

	vi.mocked(league.setGameAttributes).mockRestore();

	await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
	const durablePlayer = await readPlayer();
	if (!durablePlayer) {
		throw new Error("Re-signed player was not persisted");
	}
	assert.strictEqual(durablePlayer.tid, 1);
	assert.strictEqual(durablePlayer.usageBias, 1.25);
	assert.strictEqual(durablePlayer.contract.exp > g.get("season"), true);
});

test("post-flush finalize failure leaves one consistent durable phase boundary", async () => {
	const postFlushError = new Error("updatePhase failed after durable flush");
	vi.spyOn(workerUtil, "updatePhase").mockRejectedValueOnce(postFlushError);

	let caught: unknown;
	try {
		await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
	} catch (error) {
		caught = error;
	}
	assert.strictEqual(caught, postFlushError);

	const memoryPlayer = await idb.cache.players.get(pid);
	const durablePlayer = await readPlayer();
	assert.strictEqual(g.get("phase"), PHASE.RESIGN_PLAYERS);
	assert.strictEqual(
		(await idb.cache.gameAttributes.get("phase"))?.value,
		PHASE.RESIGN_PLAYERS,
	);
	assert.strictEqual(await readGameAttribute("phase"), PHASE.RESIGN_PLAYERS);
	assert.deepStrictEqual(memoryPlayer, durablePlayer);
	assert.strictEqual(memoryPlayer?.tid, 1);
	assert.strictEqual(memoryPlayer?.usageBias, 1.25);
	assert.strictEqual((memoryPlayer?.contract.exp ?? 0) > g.get("season"), true);
	assert.strictEqual(idb.cache._dirty, false);
	assert.strictEqual(idb.cache._dirtyRecords.players.size, 0);
	assert.strictEqual(idb.cache._dirtyRecords.gameAttributes.size, 0);
	assert.strictEqual(idb.cache._dirtyTokens.players.size, 0);
	assert.strictEqual(idb.cache._dirtyTokens.gameAttributes.size, 0);
});

test("phase scheduled event failure rolls back to the post-flush same-record boundary", async () => {
	await idb.cache.gameAttributes.put({
		key: "phase",
		value: g.get("phase"),
	});
	const scheduledEvent = {
		type: "gameAttributes" as const,
		season: g.get("season"),
		phase: PHASE.FREE_AGENCY,
		info: { phase: PHASE.REGULAR_SEASON },
	};
	const scheduledEventID = await idb.cache.scheduledEvents.add(scheduledEvent);
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});

	vi.spyOn(freeAgents, "ensureEnoughPlayers").mockResolvedValue(undefined);
	vi.spyOn(freeAgents, "normalizeContractDemands").mockResolvedValue(undefined);
	const postEventError = new Error("post-event realtime update failed");
	vi.spyOn(workerUtil, "toUI").mockImplementation(async (name) => {
		if (name === "realtimeUpdate") {
			throw postEventError;
		}
		return undefined as any;
	});

	let caught: unknown;
	try {
		await newPhase(PHASE.FREE_AGENCY, {});
	} catch (error) {
		caught = error;
	}
	assert.strictEqual(caught, postEventError);

	assert.equal(g.get("phase"), PHASE.FREE_AGENCY);
	assert.equal(
		(await idb.cache.gameAttributes.get("phase"))?.value,
		PHASE.FREE_AGENCY,
	);
	assert.equal(await readGameAttribute("phase"), PHASE.FREE_AGENCY);
	assert.deepStrictEqual(
		await idb.cache.scheduledEvents.get(scheduledEventID),
		{ ...scheduledEvent, id: scheduledEventID },
	);
	assert.deepStrictEqual(await readScheduledEvent(scheduledEventID), {
		...scheduledEvent,
		id: scheduledEventID,
	});
	assert.equal(idb.cache._dirty, false);
	assert.equal(idb.cache._dirtyRecords.gameAttributes.size, 0);
	assert.equal(idb.cache._dirtyRecords.scheduledEvents.size, 0);
	assert.equal(idb.cache._dirtyTokens.gameAttributes.size, 0);
	assert.equal(idb.cache._dirtyTokens.scheduledEvents.size, 0);
	assert.equal(idb.cache._mutationCheckpoint, undefined);
});
