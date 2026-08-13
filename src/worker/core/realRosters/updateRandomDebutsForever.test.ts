import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import Cache, { STORES } from "../../db/Cache.ts";
import { connectLeague, idb } from "../../db/index.ts";
import { g, helpers, local } from "../../util/index.ts";
import { captureSigningContext } from "../capturedContext.ts";
import { player, team } from "../index.ts";
import updateRandomDebutsForever from "./updateRandomDebutsForever.ts";

let lid: number;
let previousAutoSave: boolean;

beforeEach(async () => {
	resetG();
	lid = 700_000 + Math.floor(Math.random() * 90_000);
	g.setWithoutSavingToDB("lid", lid);
	g.setWithoutSavingToDB("randomDebutsForever", 4);
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
	idb.cache.stopAutoFlush();
	for (const row of helpers.getTeamsDefault().slice(0, 2)) {
		await idb.cache.teams.add(team.generate(row));
	}
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
});

afterEach(async () => {
	vi.restoreAllMocks();
	idb.cache.stopAutoFlush();
	idb.league.close();
	await deleteDB(`league${lid}`);
	local.autoSave = previousAutoSave;
});

test("captured Random Debuts Forever advances Cache and g on consecutive runs", async () => {
	const draftYear = g.get("season") + 1;
	await updateRandomDebutsForever(draftYear, 0, captureSigningContext());
	assert.strictEqual(g.get("randomDebutsForever"), 5);
	assert.strictEqual(
		(await idb.cache.gameAttributes.get("randomDebutsForever"))?.value,
		5,
	);

	await updateRandomDebutsForever(draftYear + 1, 0, captureSigningContext());
	assert.strictEqual(g.get("randomDebutsForever"), 6);
	assert.strictEqual(
		(await idb.cache.gameAttributes.get("randomDebutsForever"))?.value,
		6,
	);

	// The phase finalizer owns durability. Simulate that boundary, then verify
	// the second iteration survives a real IndexedDB reopen.
	await idb.cache.flush(["gameAttributes"], {
		league: idb.league,
		updateLastPlayed: false,
	});
	idb.league.close();
	idb.league = await connectLeague(lid);
	const tx = idb.league.transaction(["gameAttributes"], "readonly");
	const durableIteration = await tx
		.objectStore("gameAttributes")
		.get("randomDebutsForever");
	await tx.done;
	assert.strictEqual(durableIteration?.value, 6);
}, 60_000);

test("captured Random Debuts aborts before writes after a league switch", async () => {
	const context = captureSigningContext();
	const originalAugment = player.augmentPartialPlayer;
	vi.spyOn(player, "augmentPartialPlayer").mockImplementation(
		async (...args) => {
			const result = await originalAugment(...args);
			g.setWithoutSavingToDB("lid", context.lid + 1);
			return result;
		},
	);

	let rejected = false;
	try {
		await updateRandomDebutsForever(g.get("season") + 1, 0, context);
	} catch {
		rejected = true;
	}
	assert.equal(rejected, true);
	assert.strictEqual(g.get("randomDebutsForever"), 4);
	assert.strictEqual(
		await context.cache.gameAttributes.get("randomDebutsForever"),
		undefined,
	);
	assert.equal((await context.cache.players.getAll()).length, 0);
});
