import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { resetG } from "../../../test/helpers.ts";
import Cache, { STORES } from "../../db/Cache.ts";
import { connectLeague, idb } from "../../db/index.ts";
import { g, helpers, local } from "../../util/index.ts";
import { player, team } from "../index.ts";
import release from "./release.ts";

let lid: number;
let pid: number;
let previousAutoSave: boolean;

const readAll = async (store: "events" | "players" | "releasedPlayers") => {
	const tx = idb.league.transaction([store], "readonly");
	const rows = await tx.objectStore(store).getAll();
	await tx.done;
	return rows;
};

beforeEach(async () => {
	resetG();
	lid = 600_000 + Math.floor(Math.random() * 90_000);
	g.setWithoutSavingToDB("lid", lid);
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

	const t = team.generate(helpers.getTeamsDefault()[0]!);
	await idb.cache.teams.add(t);
	const p = player.generate(0, 30, g.get("season") - 5, true, DEFAULT_LEVEL);
	p.contract.exp = g.get("season") + 1;
	pid = await idb.cache.players.add(p);
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	idb.cache.startAutoFlush();
});

afterEach(async () => {
	vi.restoreAllMocks();
	idb.cache.stopAutoFlush();
	idb.league.close();
	await deleteDB(`league${lid}`);
	local.autoSave = previousAutoSave;
});

test("manual release immediately commits only its ledger, event, and player", async () => {
	const p = (await idb.cache.players.get(pid))!;
	await release(p, false);
	assert.strictEqual((await idb.cache.players.get(pid))?.tid, -1);
	assert.strictEqual(((await readAll("players")) as any[])[0]?.tid, -1);
	assert.strictEqual((await readAll("releasedPlayers")).length, 1);
	assert.strictEqual((await readAll("events")).length, 1);
});

test("enabled autoflush cannot persist a releasedPlayers-only state", async () => {
	const originalAdd = idb.cache.releasedPlayers.add.bind(
		idb.cache.releasedPlayers,
	);
	vi.spyOn(idb.cache.releasedPlayers, "add").mockImplementation(async (row) => {
		const rid = await originalAdd(row);
		await idb.cache._autoFlush();
		assert.deepStrictEqual(await readAll("releasedPlayers"), []);
		return rid;
	});
	const failure = new Error("event add failed");
	vi.spyOn(idb.cache.events, "add").mockRejectedValueOnce(failure);

	const p = (await idb.cache.players.get(pid))!;
	let caught: unknown;
	try {
		await release(p, false);
	} catch (error) {
		caught = error;
	}
	assert.strictEqual(caught, failure);
	assert.strictEqual((await idb.cache.players.get(pid))?.tid, 0);
	await new Promise((resolve) => setTimeout(resolve, 4500));
	assert.deepStrictEqual(await readAll("releasedPlayers"), []);
	assert.deepStrictEqual(await readAll("events"), []);
	assert.strictEqual(((await readAll("players")) as any[])[0]?.tid, 0);
});

test("enabled autoflush cannot persist an event-only release state", async () => {
	const originalAdd = idb.cache.events.add.bind(idb.cache.events);
	vi.spyOn(idb.cache.events, "add").mockImplementation(async (row) => {
		const eid = await originalAdd(row);
		await idb.cache._autoFlush();
		assert.deepStrictEqual(await readAll("events"), []);
		return eid;
	});
	const failure = new Error("player put failed");
	vi.spyOn(idb.cache.players, "put").mockRejectedValueOnce(failure);

	const p = (await idb.cache.players.get(pid))!;
	let caught: unknown;
	try {
		await release(p, false);
	} catch (error) {
		caught = error;
	}
	assert.strictEqual(caught, failure);
	assert.strictEqual((await idb.cache.players.get(pid))?.tid, 0);
	await new Promise((resolve) => setTimeout(resolve, 4500));
	assert.deepStrictEqual(await readAll("releasedPlayers"), []);
	assert.deepStrictEqual(await readAll("events"), []);
	assert.strictEqual(((await readAll("players")) as any[])[0]?.tid, 0);
});
