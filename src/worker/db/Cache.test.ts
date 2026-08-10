import "fake-indexeddb/auto";
import { deleteDB, openDB, unwrap } from "@dumbmatter/idb";
import {
	afterEach,
	assert,
	beforeAll,
	beforeEach,
	describe,
	test,
	vi,
} from "vitest";
import { resetCache, resetG } from "../../test/helpers.ts";
import { league, player } from "../core/index.ts";
import { g, local } from "../util/index.ts";
import { idb } from "./index.ts";
import Cache, { STORES } from "./Cache.ts";
import type { Player } from "../../common/types.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";

let baseCache: Cache;

beforeAll(async () => {
	resetG();

	await resetCache({
		players: [player.generate(g.get("userTid"), 30, 2017, true, DEFAULT_LEVEL)],
	});
	baseCache = idb.cache;
});
beforeEach(() => {
	idb.cache._status = "full";
});

describe("get", () => {
	test("retrieve an object", async () => {
		const p = (await idb.cache.players.getAll())[0]!;
		const p2 = (await idb.cache.players.get(p.pid)) as Player;
		assert.strictEqual(p.pid, p2.pid);
	});

	test("return undefined for invalid ID", async () => {
		const p = await idb.cache.players.get(-1);
		assert.strictEqual(p, undefined);
	});

	test("wait until filling complete before resolving query", async () => {
		const p = (await idb.cache.players.getAll())[0]!;

		idb.cache._status = "filling";
		let setTimeoutCalled = false;
		setTimeout(() => {
			setTimeoutCalled = true;
			idb.cache._setStatus("full");
		}, 1000);

		const p2 = (await idb.cache.players.get(p.pid)) as Player;
		assert(setTimeoutCalled);
		assert.strictEqual(idb.cache._status, "full");
		assert.strictEqual(p.pid, p2.pid);
	});
});

type CacheTestHarness = {
	db: any;
	dbName: string;
	cache: Cache;
	failNextTransaction: () => void;
	holdNextTransaction: () => void;
	waitForHeldTransaction: () => Promise<void>;
	releaseHeldTransaction: () => void;
	getTransactionCount: () => number;
	dispose: () => Promise<void>;
};

const createCacheTestHarness = async (): Promise<CacheTestHarness> => {
	const dbName = `cache-hardening-${Date.now()}-${Math.random()}`;
	const db = await openDB<any>(dbName, 1, {
		upgrade(database) {
			database.createObjectStore("players", { keyPath: "pid" });
			database.createObjectStore("teams", { keyPath: "tid" });
		},
	});

	let abortNext = false;
	let holdNext = false;
	let transactionCount = 0;
	let transactionStartedResolve: (() => void) | undefined;
	let transactionStarted: Promise<void> | undefined;
	let releaseHeld: (() => void) | undefined;
	const originalAutoSave = local.autoSave;
	const originalTransaction = db.transaction.bind(db);

	const cacheLeague = {
		transaction(stores: string[], mode: "readonly" | "readwrite") {
			transactionCount += 1;
			const transaction = originalTransaction(stores, mode);
			const shouldAbort = abortNext;
			abortNext = false;
			const shouldHold = holdNext;
			holdNext = false;
			transactionStartedResolve?.();
			transactionStartedResolve = undefined;

			if (shouldAbort) {
				queueMicrotask(() => {
					unwrap(transaction).abort();
				});
			}

			if (shouldHold) {
				const held = new Promise<void>((resolve) => {
					releaseHeld = resolve;
				});
				return {
					objectStore: (store: string) => transaction.objectStore(store),
					done: Promise.resolve(transaction.done).then(async () => {
						await held;
					}),
				};
			}

			return transaction;
		},
	};

	const cache = new Cache();
	for (const store of STORES) {
		cache._data[store] = {};
		cache._deletes[store] = new Set();
		cache._dirtyRecords[store] = new Set();
		cache._maxIds[store] = -1;
		cache._markDirtyIndexes(store);
	}
	cache._status = "full";
	local.autoSave = true;
	idb.cache = cache;
	(idb as any).league = cacheLeague;

	return {
		db,
		dbName,
		cache,
		failNextTransaction: () => {
			abortNext = true;
		},
		holdNextTransaction: () => {
			transactionStarted = new Promise<void>((resolve) => {
				transactionStartedResolve = resolve;
			});
			holdNext = true;
		},
		waitForHeldTransaction: async () => {
			await transactionStarted;
		},
		releaseHeldTransaction: () => {
			releaseHeld?.();
			releaseHeld = undefined;
		},
		getTransactionCount: () => transactionCount,
		dispose: async () => {
			local.autoSave = originalAutoSave;
			idb.cache = baseCache;
			(idb as any).league = undefined;
			db.close();
			await deleteDB(dbName);
		},
	};
};

const readDurableRecord = async (
	db: any,
	store: "players" | "teams",
	key: number,
) => {
	const transaction = db.transaction([store], "readonly");
	const record = await transaction.objectStore(store).get(key);
	await transaction.done;
	return record;
};

const assertPromiseRejects = async (promise: Promise<unknown>) => {
	let rejected = false;
	try {
		await promise;
	} catch {
		rejected = true;
	}
	assert.equal(rejected, true);
};

const testPlayer = (pid: number, value: string) => ({ pid, value }) as any;
const testTeam = (tid: number, value: string) => ({ tid, value }) as any;

describe("mutation checkpoint", () => {
	let harness: CacheTestHarness;

	beforeEach(async () => {
		harness = await createCacheTestHarness();
	});

	afterEach(async () => {
		await harness.dispose();
	});

	test("rollback restores owned records and preserves pre-existing dirty state", async () => {
		await harness.cache.players.put(testPlayer(1, "durable-old"));
		await harness.cache.flush(["players"]);
		await harness.cache.players.put(testPlayer(2, "pre-existing-dirty"));
		const preExistingToken = harness.cache._dirtyTokens.players.get(2);

		const checkpoint = harness.cache.beginMutationCheckpoint();
		const playerOne = (await harness.cache.players.get(1))!;
		(playerOne as any).value = "failed-operation";
		await harness.cache.players.put(playerOne);
		await harness.cache.players.add(testPlayer(3, "failed-add"));
		checkpoint.rollback();

		assert.deepStrictEqual(
			await harness.cache.players.get(1),
			testPlayer(1, "durable-old"),
		);
		assert.equal(await harness.cache.players.get(3), undefined);
		assert.equal(harness.cache._dirtyRecords.players.has(1), false);
		assert.equal(harness.cache._dirtyRecords.players.has(2), true);
		assert.equal(harness.cache._dirtyTokens.players.get(2), preExistingToken);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			testPlayer(1, "durable-old"),
		);
	});

	test("scalar indexGetAll snapshots rows before in-place mutation", async () => {
		const row = player.generate(-1, 30, 2017, true, DEFAULT_LEVEL);
		row.pid = 1;
		(row as any).auditValue = "old";
		await harness.cache.players.put(row);
		await harness.cache.flush(["players"]);

		const checkpoint = harness.cache.beginMutationCheckpoint();
		const [freeAgent] = await harness.cache.players.indexGetAll(
			"playersByTid",
			-1,
		);
		assert(freeAgent);
		(freeAgent as any).auditValue = "mutated in place";
		await harness.cache.players.put(freeAgent);
		checkpoint.rollback();

		assert.equal(
			((await harness.cache.players.get(1)) as any).auditValue,
			"old",
		);
		assert.equal(harness.cache._dirtyRecords.players.has(1), false);
		assert.equal(harness.cache._dirtyTokens.players.has(1), false);
		assert.equal(
			((await readDurableRecord(harness.db, "players", 1)) as any).auditValue,
			"old",
		);
	});

	test("rollback is idempotent and the same Cache can retry successfully", async () => {
		await harness.cache.players.put(testPlayer(1, "old"));
		await harness.cache.flush(["players"]);

		const failed = harness.cache.beginMutationCheckpoint();
		const first = (await harness.cache.players.get(1))!;
		(first as any).value = "failed";
		await harness.cache.players.put(first);
		failed.rollback();
		failed.rollback();

		const retry = harness.cache.beginMutationCheckpoint();
		const second = (await harness.cache.players.get(1))!;
		(second as any).value = "retry";
		await harness.cache.players.put(second);
		await harness.cache.flush(["players"]);
		retry.commit();
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			testPlayer(1, "retry"),
		);
	});

	test("re-bases an active checkpoint after a durable flush", async () => {
		await harness.cache.players.put(testPlayer(1, "A"));
		await harness.cache.flush(["players"]);

		const checkpoint = harness.cache.beginMutationCheckpoint();
		await harness.cache.players.put(testPlayer(1, "B"));
		await harness.cache.flush(["players"]);

		await harness.cache.players.put(testPlayer(1, "C"));
		checkpoint.rollback();

		assert.deepStrictEqual(
			await harness.cache.players.get(1),
			testPlayer(1, "B"),
		);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			testPlayer(1, "B"),
		);
		assert.equal(harness.cache._dirtyRecords.players.has(1), false);
		assert.equal(harness.cache._dirtyTokens.players.has(1), false);
	});
});

describe("flush durability and retry", () => {
	let harness: CacheTestHarness;

	beforeEach(async () => {
		harness = await createCacheTestHarness();
	});

	afterEach(async () => {
		await harness.dispose();
	});

	test("put-only transaction reject preserves dirty state for retry and reopen", async () => {
		const row = { pid: 1, value: "put" };
		await harness.cache.players.put(row as any);
		harness.failNextTransaction();

		await assertPromiseRejects(harness.cache.flush(["players"]));
		assert.equal(harness.cache._dirty, true);
		assert(harness.cache._dirtyRecords.players.has(1));
		assert.deepStrictEqual(await harness.cache.players.get(1), row as any);
		assert.equal(await readDurableRecord(harness.db, "players", 1), undefined);

		await harness.cache.flush(["players"]);
		assert.equal(harness.cache._dirty, false);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			row,
		);

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		assert.deepStrictEqual(
			await readDurableRecord(reopened, "players", 1),
			row,
		);
		reopened.close();
	});

	test("delete-only transaction reject preserves delete for retry and reopen", async () => {
		const row = { pid: 1, value: "delete" };
		await harness.cache.players.put(row as any);
		await harness.cache.flush(["players"]);
		await harness.cache.players.delete(1);
		harness.failNextTransaction();

		await assertPromiseRejects(harness.cache.flush(["players"]));
		assert.equal(harness.cache._dirty, true);
		assert(harness.cache._deletes.players.has(1));
		assert.equal(await harness.cache.players.get(1), undefined);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			row,
		);

		await harness.cache.flush(["players"]);
		assert.equal(await readDurableRecord(harness.db, "players", 1), undefined);

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		assert.equal(await readDurableRecord(reopened, "players", 1), undefined);
		reopened.close();
	});

	test("mixed put/delete transaction reject preserves both mutations for retry", async () => {
		const first = { pid: 1, value: "old" };
		const second = { pid: 2, value: "keep" };
		await harness.cache.players.put(first as any);
		await harness.cache.players.put(second as any);
		await harness.cache.flush(["players"]);
		await harness.cache.players.put(testPlayer(1, "new"));
		await harness.cache.players.delete(2);
		harness.failNextTransaction();

		await assertPromiseRejects(harness.cache.flush(["players"]));
		assert.equal(harness.cache._dirty, true);
		assert(harness.cache._dirtyRecords.players.has(1));
		assert(harness.cache._deletes.players.has(2));
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			first,
		);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 2),
			second,
		);

		await harness.cache.flush(["players"]);
		assert.deepStrictEqual(await readDurableRecord(harness.db, "players", 1), {
			pid: 1,
			value: "new",
		});
		assert.equal(await readDurableRecord(harness.db, "players", 2), undefined);

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		assert.deepStrictEqual(await readDurableRecord(reopened, "players", 1), {
			pid: 1,
			value: "new",
		});
		assert.equal(await readDurableRecord(reopened, "players", 2), undefined);
		reopened.close();
	});

	test("subset flush reject preserves selected and unselected store dirty state", async () => {
		await harness.cache.players.put(testPlayer(1, "player"));
		await harness.cache.teams.put(testTeam(1, "team"));
		harness.failNextTransaction();

		await assertPromiseRejects(harness.cache.flush(["players"]));
		assert.equal(harness.cache._dirty, true);
		assert(harness.cache._dirtyRecords.players.has(1));
		assert(harness.cache._dirtyRecords.teams.has(1));
		assert.equal(await readDurableRecord(harness.db, "players", 1), undefined);
		assert.equal(await readDurableRecord(harness.db, "teams", 1), undefined);

		await harness.cache.flush(["players"]);
		assert.equal(harness.cache._dirty, true);
		assert.equal(harness.cache._dirtyRecords.players.size, 0);
		assert(harness.cache._dirtyRecords.teams.has(1));
		await harness.cache.flush(["teams"]);
		assert.equal(harness.cache._dirty, false);
		assert.deepStrictEqual(await readDurableRecord(harness.db, "teams", 1), {
			tid: 1,
			value: "team",
		});

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		assert.deepStrictEqual(await readDurableRecord(reopened, "players", 1), {
			pid: 1,
			value: "player",
		});
		assert.deepStrictEqual(await readDurableRecord(reopened, "teams", 1), {
			tid: 1,
			value: "team",
		});
		reopened.close();
	});

	test("record-scoped flush writes only selected puts and leaves other puts dirty", async () => {
		await harness.cache.players.put(testPlayer(1, "selected"));
		await harness.cache.players.put(testPlayer(2, "unselected"));

		await harness.cache.flush(["players"], {
			records: { players: [1] },
			updateLastPlayed: false,
		});

		assert.equal(harness.cache._dirtyRecords.players.has(1), false);
		assert.equal(harness.cache._dirtyRecords.players.has(2), true);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			testPlayer(1, "selected"),
		);
		assert.equal(await readDurableRecord(harness.db, "players", 2), undefined);

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		assert.deepStrictEqual(
			await readDurableRecord(reopened, "players", 1),
			testPlayer(1, "selected"),
		);
		assert.equal(await readDurableRecord(reopened, "players", 2), undefined);
		reopened.close();
	});

	test("record-scoped flush writes only selected deletes and preserves retry state", async () => {
		await harness.cache.players.put(testPlayer(1, "delete selected"));
		await harness.cache.players.put(testPlayer(2, "delete unselected"));
		await harness.cache.flush(["players"], { updateLastPlayed: false });
		await harness.cache.players.delete(1);
		await harness.cache.players.delete(2);

		harness.failNextTransaction();
		await assertPromiseRejects(
			harness.cache.flush(["players"], {
				records: { players: [1] },
				updateLastPlayed: false,
			}),
		);
		assert.equal(harness.cache._deletes.players.has(1), true);
		assert.equal(harness.cache._deletes.players.has(2), true);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			testPlayer(1, "delete selected"),
		);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 2),
			testPlayer(2, "delete unselected"),
		);

		await harness.cache.flush(["players"], {
			records: { players: [1] },
			updateLastPlayed: false,
		});
		assert.equal(await readDurableRecord(harness.db, "players", 1), undefined);
		assert.equal(harness.cache._deletes.players.has(2), true);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 2),
			testPlayer(2, "delete unselected"),
		);

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		assert.equal(await readDurableRecord(reopened, "players", 1), undefined);
		assert.deepStrictEqual(
			await readDurableRecord(reopened, "players", 2),
			testPlayer(2, "delete unselected"),
		);
		reopened.close();
	});

	test("record-scoped flush protects a selected key from put-to-put and put-to-delete races", async () => {
		await harness.cache.players.put(testPlayer(1, "old"));
		await harness.cache.flush(["players"], { updateLastPlayed: false });

		await harness.cache.players.put(testPlayer(1, "first"));
		harness.holdNextTransaction();
		const firstFlush = harness.cache.flush(["players"], {
			records: { players: [1] },
			updateLastPlayed: false,
		});
		await harness.waitForHeldTransaction();
		await harness.cache.players.put(testPlayer(1, "second"));
		harness.releaseHeldTransaction();
		await firstFlush;
		assert.equal(harness.cache._dirtyRecords.players.has(1), true);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			testPlayer(1, "first"),
		);

		await harness.cache.players.delete(1);
		harness.holdNextTransaction();
		const secondFlush = harness.cache.flush(["players"], {
			records: { players: [1] },
			updateLastPlayed: false,
		});
		await harness.waitForHeldTransaction();
		await harness.cache.players.put(testPlayer(1, "replacement"));
		harness.releaseHeldTransaction();
		await secondFlush;
		assert.equal(harness.cache._dirtyRecords.players.has(1), true);
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			undefined,
		);
		await harness.cache.flush(["players"], { updateLastPlayed: false });
		assert.deepStrictEqual(
			await readDurableRecord(harness.db, "players", 1),
			testPlayer(1, "replacement"),
		);
	});

	const mutationTransitions: [
		string,
		(cache: Cache) => Promise<void>,
		(cache: Cache) => Promise<void>,
		unknown,
	][] = [
		[
			"put to put",
			async (cache) => cache.players.put(testPlayer(1, "first")).then(() => {}),
			async (cache) =>
				cache.players.put(testPlayer(1, "second")).then(() => {}),
			{ pid: 1, value: "second" },
		],
		[
			"put to delete",
			async (cache) => cache.players.put(testPlayer(1, "first")).then(() => {}),
			async (cache) => cache.players.delete(1),
			undefined,
		],
		[
			"delete to put",
			async (cache) => cache.players.delete(1),
			async (cache) =>
				cache.players.put(testPlayer(1, "second")).then(() => {}),
			{ pid: 1, value: "second" },
		],
		[
			"delete to delete",
			async (cache) => cache.players.delete(1),
			async (cache) => cache.players.delete(1),
			undefined,
		],
	];

	test.each(mutationTransitions)(
		"flush preserves a mutation made during a transaction: %s",
		async (_name, firstMutation, secondMutation, expected) => {
			await harness.cache.players.put(testPlayer(1, "initial"));
			await harness.cache.flush(["players"]);
			await firstMutation(harness.cache);
			harness.holdNextTransaction();
			const firstFlush = harness.cache.flush(["players"]);
			await harness.waitForHeldTransaction();
			await secondMutation(harness.cache);
			harness.releaseHeldTransaction();
			await firstFlush;

			assert.equal(harness.cache._dirty, true);
			assert(
				harness.cache._dirtyRecords.players.has(1) ||
					harness.cache._deletes.players.has(1),
			);
			assert.deepStrictEqual(
				await readDurableRecord(harness.db, "players", 1),
				_name === "delete to put"
					? undefined
					: _name === "delete to delete"
						? undefined
						: { pid: 1, value: "first" },
			);

			await harness.cache.flush(["players"]);
			assert.deepStrictEqual(
				await readDurableRecord(harness.db, "players", 1),
				expected,
			);
		},
	);

	test("clear participates in token-protected cleanup", async () => {
		await harness.cache.players.put(testPlayer(1, "one"));
		await harness.cache.players.put(testPlayer(2, "two"));
		await harness.cache.flush(["players"]);
		await harness.cache.players.clear();
		harness.holdNextTransaction();
		const firstFlush = harness.cache.flush(["players"]);
		await harness.waitForHeldTransaction();
		await harness.cache.players.put(testPlayer(1, "replacement"));
		harness.releaseHeldTransaction();
		await firstFlush;

		assert.equal(harness.cache._dirty, true);
		await harness.cache.flush(["players"]);
		assert.deepStrictEqual(await readDurableRecord(harness.db, "players", 1), {
			pid: 1,
			value: "replacement",
		});
		assert.equal(await readDurableRecord(harness.db, "players", 2), undefined);
	});

	test("two concurrent flush calls serialize and do not duplicate transactions", async () => {
		await harness.cache.players.put(testPlayer(1, "one"));
		harness.holdNextTransaction();
		const firstFlush = harness.cache.flush(["players"]);
		await harness.waitForHeldTransaction();
		const secondFlush = harness.cache.flush(["players"]);
		harness.releaseHeldTransaction();
		await Promise.all([firstFlush, secondFlush]);

		assert.equal(harness.getTransactionCount(), 1);
		assert.equal(harness.cache._dirty, false);
		assert.deepStrictEqual(await readDurableRecord(harness.db, "players", 1), {
			pid: 1,
			value: "one",
		});
	});

	test("updateMeta rejection keeps committed data clean and retries metadata separately", async () => {
		const updateMeta = vi
			.spyOn(league, "updateMeta")
			.mockRejectedValueOnce(new Error("metadata failure"));
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await harness.cache.players.put(testPlayer(1, "committed"));
			await harness.cache.flush(["players"]);
			assert.equal(harness.cache._dirty, false);
			assert.equal(harness.cache._metaUpdatePending, true);
			assert.deepStrictEqual(
				await readDurableRecord(harness.db, "players", 1),
				{ pid: 1, value: "committed" },
			);

			updateMeta.mockResolvedValue(undefined);
			await harness.cache.flush(["players"]);
			assert.equal(harness.cache._metaUpdatePending, false);
			assert.equal(updateMeta.mock.calls.length, 2);

			harness.db.close();
			const reopened = await openDB<any>(harness.dbName, 1);
			assert.deepStrictEqual(await readDurableRecord(reopened, "players", 1), {
				pid: 1,
				value: "committed",
			});
			reopened.close();
		} finally {
			errorSpy.mockRestore();
			updateMeta.mockRestore();
		}
	});

	test("scoped flush never updates metadata for the switched-to league", async () => {
		const metaName = `cache-meta-${Date.now()}-${Math.random()}`;
		const metaDB = await openDB<any>(metaName, 1, {
			upgrade(database) {
				database.createObjectStore("leagues", { keyPath: "lid" });
			},
		});
		const metaTransaction = metaDB.transaction("leagues", "readwrite");
		await metaTransaction.store.put({ lid: 1, lastPlayed: "old-league" });
		await metaTransaction.store.put({ lid: 2, lastPlayed: "new-league" });
		await metaTransaction.done;

		try {
			await harness.cache.players.put(testPlayer(1, "captured league"));
			await harness.cache.flush(["players"], {
				league: (idb as any).league,
				updateLastPlayed: false,
			});

			const readMeta = async (lid: number) => {
				const transaction = metaDB.transaction("leagues", "readonly");
				const row = await transaction.store.get(lid);
				await transaction.done;
				return row;
			};
			assert.deepStrictEqual(await readMeta(1), {
				lid: 1,
				lastPlayed: "old-league",
			});
			assert.deepStrictEqual(await readMeta(2), {
				lid: 2,
				lastPlayed: "new-league",
			});
		} finally {
			metaDB.close();
			await deleteDB(metaName);
		}
	});
});

describe("auto-flush lifecycle", () => {
	let harness: CacheTestHarness;

	beforeEach(async () => {
		harness = await createCacheTestHarness();
	});

	afterEach(async () => {
		harness.cache.stopAutoFlush();
		vi.useRealTimers();
		await harness.dispose();
	});

	test("nested pauses and interleaved idempotent releases keep one timer", () => {
		vi.useFakeTimers();
		harness.cache.startAutoFlush();
		assert.equal(vi.getTimerCount(), 1);
		harness.cache.startAutoFlush();
		assert.equal(vi.getTimerCount(), 1);
		const releaseOne = harness.cache.pauseAutoFlush();
		const releaseTwo = harness.cache.pauseAutoFlush();
		assert.equal(vi.getTimerCount(), 0);

		releaseOne();
		releaseOne();
		assert.equal(vi.getTimerCount(), 0);
		releaseTwo();
		assert.equal(vi.getTimerCount(), 1);
		releaseTwo();
		assert.equal(vi.getTimerCount(), 1);

		const releaseThree = harness.cache.pauseAutoFlush();
		const releaseFour = harness.cache.pauseAutoFlush();
		releaseFour();
		assert.equal(vi.getTimerCount(), 0);
		releaseThree();
		assert.equal(vi.getTimerCount(), 1);
		releaseFour();
		assert.equal(vi.getTimerCount(), 1);
	});

	test("pause, start, and stop keep temporary pause separate from permanent stop", () => {
		vi.useFakeTimers();
		const release = harness.cache.pauseAutoFlush();
		harness.cache.startAutoFlush();
		assert.equal(vi.getTimerCount(), 0);
		harness.cache.stopAutoFlush();
		release();
		assert.equal(vi.getTimerCount(), 0);
		harness.cache.startAutoFlush();
		assert.equal(vi.getTimerCount(), 1);
	});

	test("in-flight auto-flush stop does not recreate a timer", async () => {
		vi.useFakeTimers();
		harness.cache._dirty = true;
		let resolveFlush!: () => void;
		const flush = vi.spyOn(harness.cache, "flush").mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveFlush = resolve;
				}),
		);
		const autoFlush = harness.cache._autoFlush();
		await Promise.resolve();
		assert.equal(flush.mock.calls.length, 1);
		harness.cache.stopAutoFlush();
		resolveFlush();
		await autoFlush;
		assert.equal(vi.getTimerCount(), 0);
	});

	test("in-flight auto-flush start leaves exactly one new timer", async () => {
		vi.useFakeTimers();
		harness.cache._dirty = true;
		let resolveFlush!: () => void;
		vi.spyOn(harness.cache, "flush").mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveFlush = resolve;
				}),
		);
		const autoFlush = harness.cache._autoFlush();
		await Promise.resolve();
		harness.cache.startAutoFlush();
		assert.equal(vi.getTimerCount(), 1);
		resolveFlush();
		await autoFlush;
		assert.equal(vi.getTimerCount(), 1);
	});

	test("auto-flush rejection keeps a retry timer and never schedules two", async () => {
		vi.useFakeTimers();
		harness.cache._dirty = true;
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const flush = vi
			.spyOn(harness.cache, "flush")
			.mockRejectedValueOnce(new Error("flush failure"));
		try {
			await harness.cache._autoFlush();
			assert.equal(flush.mock.calls.length, 1);
			assert.equal(vi.getTimerCount(), 1);
			harness.cache.startAutoFlush();
			assert.equal(vi.getTimerCount(), 1);
		} finally {
			errorSpy.mockRestore();
		}
	});
});
