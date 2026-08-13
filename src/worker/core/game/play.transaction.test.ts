import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import Cache, { STORES } from "../../db/Cache.ts";
import { connectLeague, idb } from "../../db/index.ts";
import { g, helpers, local, lock } from "../../util/index.ts";
import { freeAgents, player, team, trade } from "../index.ts";
import play from "./play.ts";

let lid: number;
let freeAgentPid: number;
let previousAutoSave: boolean;

const makePlayer = (tid: number, rosterOrder: number, value = 45) => {
	const p = player.generate(tid, 27, g.get("season") - 5, true, DEFAULT_LEVEL);
	p.rosterOrder = rosterOrder;
	p.value = value;
	p.valueNoPot = value;
	p.contract.amount = g.get("minContract");
	return p;
};

const readPlayer = async (pid: number) => {
	const tx = idb.league.transaction(["players"], "readonly");
	const p = await tx.objectStore("players").get(pid);
	await tx.done;
	return p;
};

beforeEach(async () => {
	resetG();
	lock.reset();
	lid = 500_000 + Math.floor(Math.random() * 90_000);
	g.setWithoutSavingToDB("lid", lid);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	g.setWithoutSavingToDB("numTeams", 2);
	g.setWithoutSavingToDB("numActiveTeams", 2);
	g.setWithoutSavingToDB("numGamesPlayoffSeries", [7]);
	g.setWithoutSavingToDB("numPlayoffByes", 0);
	g.setWithoutSavingToDB("playIn", false);
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

	const teamRows = helpers.getTeamsDefault().slice(0, 2);
	for (const row of teamRows) {
		await idb.cache.teams.add(team.generate(row));
		await idb.cache.teamSeasons.add(team.genSeasonRow(row));
		await idb.cache.teamStats.add(team.genStatsRow(row.tid));
	}
	for (const tid of [0, 1]) {
		const rosterSize = g.get("minRosterSize") - (tid === 1 ? 1 : 0);
		for (let i = 0; i < rosterSize; i++) {
			await idb.cache.players.add(makePlayer(tid, i));
		}
	}
	const freeAgent = makePlayer(PLAYER.FREE_AGENT, 0, 80);
	freeAgentPid = await idb.cache.players.add(freeAgent);
	for (let day = 1; day <= 4; day++) {
		await idb.cache.schedule.add({
			homeTid: day % 2,
			awayTid: (day + 1) % 2,
			day,
		});
	}
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	idb.cache.startAutoFlush();
});

afterEach(async () => {
	vi.restoreAllMocks();
	lock.reset();
	idb.cache.stopAutoFlush();
	idb.league.close();
	await deleteDB(`league${lid}`);
	local.autoSave = previousAutoSave;
});

test("real game day rolls back staged autoSign before enabled autoflush and retries on the same Cache", async () => {
	vi.spyOn(team, "checkRosterSizes").mockResolvedValue(undefined);
	const originalAutoSign = freeAgents.autoSign;
	vi.spyOn(freeAgents, "autoSign").mockImplementation(async (...args) => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
		try {
			return await originalAutoSign(...args);
		} finally {
			randomSpy.mockRestore();
		}
	});
	const laterError = new Error("post-game trade failed");
	vi.spyOn(trade, "betweenAiTeams").mockRejectedValueOnce(laterError);

	let caught: unknown;
	try {
		await play(1, {} as any);
	} catch (error) {
		caught = error;
	}
	assert.strictEqual(caught, laterError);
	assert.strictEqual(lock.get("gameSim"), false);

	await new Promise((resolve) => setTimeout(resolve, 4500));

	vi.mocked(trade.betweenAiTeams).mockRestore();
	vi.spyOn(trade, "betweenAiTeams").mockResolvedValue(undefined as any);
	await play(1, {} as any);
	assert.strictEqual(lock.get("gameSim"), false);
	assert.notStrictEqual(
		(await idb.cache.players.get(freeAgentPid))?.tid,
		PLAYER.FREE_AGENT,
	);
	assert.notStrictEqual(
		(await readPlayer(freeAgentPid))?.tid,
		PLAYER.FREE_AGENT,
	);
});

test("play(3) completes three consecutive days with one request-boundary flush", async () => {
	vi.spyOn(team, "checkRosterSizes").mockResolvedValue(undefined);
	const originalAutoSign = freeAgents.autoSign;
	vi.spyOn(freeAgents, "autoSign").mockImplementation(async (...args) => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
		try {
			return await originalAutoSign(...args);
		} finally {
			randomSpy.mockRestore();
		}
	});
	vi.spyOn(trade, "betweenAiTeams").mockResolvedValue(undefined as any);
	const checkpointSpy = vi.spyOn(idb.cache, "beginMutationCheckpoint");
	const flushSpy = vi.spyOn(idb.cache, "flush");

	await play(3, {} as any);

	assert.strictEqual(checkpointSpy.mock.calls.length, 0);
	assert.strictEqual(flushSpy.mock.calls.length, 1);
	assert.strictEqual((await idb.cache.schedule.getAll()).length, 1);
	assert.strictEqual((await idb.cache.games.getAll()).length, 3);
	assert.strictEqual(lock.get("gameSim"), false);
	assert.notStrictEqual(
		(await readPlayer(freeAgentPid))?.tid,
		PLAYER.FREE_AGENT,
	);
});

test("cleanup UI rejection preserves the original game-day error and clears the lock", async () => {
	vi.spyOn(team, "checkRosterSizes").mockResolvedValue(undefined);
	const originalAutoSign = freeAgents.autoSign;
	vi.spyOn(freeAgents, "autoSign").mockImplementation(async (...args) => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
		try {
			return await originalAutoSign(...args);
		} finally {
			randomSpy.mockRestore();
		}
	});
	const originalError = new Error("original game-day error");
	vi.spyOn(trade, "betweenAiTeams").mockRejectedValueOnce(originalError);
	const cleanupError = new Error("updateLocal cleanup failed");
	const originalSet = lock.set.bind(lock);
	vi.spyOn(lock, "set").mockImplementation(async (name, value) => {
		await originalSet(name, value);
		if (name === "gameSim" && value === false) {
			throw cleanupError;
		}
	});

	let caught: unknown;
	try {
		await play(1, {} as any);
	} catch (error) {
		caught = error;
	}
	assert.strictEqual(caught, originalError);
	assert.strictEqual(lock.get("gameSim"), false);
});
