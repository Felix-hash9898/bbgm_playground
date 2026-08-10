import "fake-indexeddb/auto";
import { deleteDB, openDB, unwrap } from "@dumbmatter/idb";
import {
	assert,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";
import { PHASE } from "../../common/constants.ts";
import type { View } from "../../common/types.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { getScheduleAfterCSVImport } from "../../ui/views/ScheduleEditor/scheduleCSV.ts";
import { team } from "../core/index.ts";
import { Cache, idb } from "../db/index.ts";
import { STORES } from "../db/Cache.ts";
import * as workerUtil from "../util/index.ts";
import { g, helpers } from "../util/index.ts";
import api, { setScheduleFromEditor } from "./index.ts";

type Team = View<"scheduleEditor">["teams"][number];

const teams = ["ATL", "BOS"].map(
	(abbrev, tid) =>
		({
			tid,
			seasonAttrs: { abbrev },
		}) as Team,
);

beforeEach(async () => {
	resetG();
	const defaultTeams = helpers.getTeamsDefault().slice(0, 2);
	await resetCache({
		teams: defaultTeams.map(team.generate),
		teamSeasons: defaultTeams.map((t) => team.genSeasonRow(t)),
	});
});

describe("schedule CSV save integration", () => {
	test("does not write before Save and does not apply regenerated settings", async () => {
		const season = g.get("season");
		const rawSettings = {
			numGames: [
				{ start: season, value: 82 },
				{ start: season + 1, value: 76 },
			],
			divs: [
				{ start: season, value: [{ did: 0, cid: 0, name: "Old" }] },
				{ start: season + 1, value: [{ did: 1, cid: 0, name: "New" }] },
			],
			confs: [
				{ start: season, value: [{ cid: 0, name: "Old" }] },
				{ start: season + 1, value: [{ cid: 0, name: "New" }] },
			],
		};
		for (const [key, value] of Object.entries(rawSettings)) {
			g.setWithoutSavingToDB(key as "numGames", value as any);
		}

		await idb.cache.schedule.add({ awayTid: 0, day: 9, homeTid: 1 });

		const imported = getScheduleAfterCSVImport({
			context: {
				allStarGame: 0.7,
				allStarGameAlreadyHappened: false,
				maxDayAlreadyPlayed: 0,
				phase: PHASE.REGULAR_SEASON,
				tradeDeadline: 0.6,
			},
			csvText: "Day,ATL,BOS\n2,BOS,",
			schedule: [],
			teams,
		});

		expect(imported.regenerated).toBe(false);
		expect(await idb.cache.schedule.getAll()).toEqual([
			{ awayTid: 0, day: 9, gid: 0, homeTid: 1 },
		]);

		await setScheduleFromEditor({
			regenerated: imported.regenerated,
			schedule: imported.schedule,
		});

		expect(await idb.cache.schedule.getAll()).toEqual([
			expect.objectContaining({ awayTid: 1, day: 2, homeTid: 0 }),
		]);
		expect(g.getRaw("numGames")).toEqual(rawSettings.numGames);
		expect(g.getRaw("divs")).toEqual(rawSettings.divs);
		expect(g.getRaw("confs")).toEqual(rawSettings.confs);

		for (const key of ["numGames", "divs", "confs"] as const) {
			expect(await idb.cache.gameAttributes.get(key)).toBeUndefined();
		}
	});

	test("still preserves completed games in the UI state while omitting them from schedule DB writes", async () => {
		const completed = {
			type: "completed",
			day: 1,
			awayAbbrev: "BOS",
			awayTid: 1,
			homeAbbrev: "ATL",
			homeTid: 0,
			forceWin: undefined,
			winnerTid: undefined,
		} as const;
		const imported = getScheduleAfterCSVImport({
			context: {
				allStarGame: 0.7,
				allStarGameAlreadyHappened: false,
				maxDayAlreadyPlayed: 1,
				phase: PHASE.REGULAR_SEASON,
				tradeDeadline: 0.6,
			},
			csvText: "Day,ATL,BOS\n2,BOS,",
			schedule: [completed],
			teams,
		});

		expect(imported.schedule[0]).toEqual(completed);
		await setScheduleFromEditor(imported);
		expect(await idb.cache.schedule.getAll()).toEqual([
			expect.objectContaining({ awayTid: 1, day: 2, homeTid: 0 }),
		]);
	});
});

type ScheduleSaveHarness = {
	db: any;
	leagueDB: any;
	dbName: string;
	cache: Cache;
	setAbortNext: () => void;
	setAbortCount: (count: number) => void;
	holdNextTransaction: () => void;
	waitForHeldTransaction: () => Promise<void>;
	releaseHeldTransaction: () => void;
	transactionCount: () => number;
	installAsCurrent: (lid: number) => void;
	read: (
		store: "schedule" | "gameAttributes" | "players",
		key: number | string,
	) => Promise<any>;
	dispose: () => Promise<void>;
};

const createScheduleSaveHarness = async (
	lid: number,
): Promise<ScheduleSaveHarness> => {
	const dbName = `schedule-save-${lid}-${Date.now()}-${Math.random()}`;
	const db = await openDB<any>(dbName, 1, {
		upgrade(database) {
			database.createObjectStore("schedule", {
				keyPath: "gid",
				autoIncrement: true,
			});
			database.createObjectStore("gameAttributes", { keyPath: "key" });
			database.createObjectStore("players", { keyPath: "pid" });
		},
	});

	let abortNext = 0;
	let holdNext = false;
	let startedResolve: (() => void) | undefined;
	let started: Promise<void> | undefined;
	let releaseHeld: (() => void) | undefined;
	let transactions = 0;
	const originalTransaction = db.transaction.bind(db);

	const leagueDB = {
		transaction(stores: string[], mode: "readonly" | "readwrite") {
			transactions += 1;
			const transaction = originalTransaction(stores, mode);
			const shouldAbort = abortNext > 0;
			if (shouldAbort) {
				abortNext -= 1;
			}
			const shouldHold = holdNext;
			holdNext = false;
			startedResolve?.();
			startedResolve = undefined;

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
	cache._data.teams[0] = { tid: 0 };
	cache._data.teams[1] = { tid: 1 };
	cache._data.teams[2] = { tid: 2 };
	cache._data.teams[3] = { tid: 3 };
	cache._data.games = {};

	const installAsCurrent = (lid2: number) => {
		idb.cache = cache;
		(idb as any).league = leagueDB;
		g.setWithoutSavingToDB("lid", lid2);
	};
	installAsCurrent(lid);

	return {
		db,
		leagueDB,
		dbName,
		cache,
		setAbortNext: () => {
			abortNext = 1;
		},
		setAbortCount: (count) => {
			abortNext = count;
		},
		holdNextTransaction: () => {
			started = new Promise<void>((resolve) => {
				startedResolve = resolve;
			});
			holdNext = true;
		},
		waitForHeldTransaction: async () => {
			await started;
		},
		releaseHeldTransaction: () => {
			releaseHeld?.();
			releaseHeld = undefined;
		},
		transactionCount: () => transactions,
		installAsCurrent,
		read: async (store, key) => {
			const transaction = db.transaction([store], "readonly");
			const value = await transaction.objectStore(store).get(key);
			await transaction.done;
			return value;
		},
		dispose: async () => {
			cache.stopAutoFlush();
			db.close();
			await deleteDB(dbName);
		},
	};
};

const seedDurableSchedule = async (
	harness: ScheduleSaveHarness,
	schedule: any[],
	settings: Record<string, any> = {},
) => {
	for (const game of schedule) {
		await harness.cache.schedule.put(game);
	}
	for (const [key, value] of Object.entries(settings)) {
		await harness.cache.gameAttributes.put({ key, value });
	}
	await harness.cache.flush(["schedule", "gameAttributes"], {
		league: harness.leagueDB,
		updateLastPlayed: false,
	});
};

type ScheduleEditorSchedule = View<"scheduleEditor">["schedule"];

const scheduleForSave = (day: number, awayTid = 1, homeTid = 0) =>
	[
		{
			type: "game" as const,
			day,
			awayTid,
			homeTid,
		},
	] as unknown as ScheduleEditorSchedule;

const assertPromiseRejects = async (promise: Promise<unknown>) => {
	let rejected = false;
	try {
		await promise;
	} catch {
		rejected = true;
	}
	assert.equal(rejected, true);
};

describe("schedule save transaction integration", () => {
	let harness: ScheduleSaveHarness;

	beforeEach(async () => {
		harness = await createScheduleSaveHarness(1);
		vi.spyOn(workerUtil, "initUILocalGames").mockResolvedValue(undefined);
		await seedDurableSchedule(harness, [
			{ gid: 0, day: 2, awayTid: 1, homeTid: 0 },
		]);
	});

	afterEach(async () => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		await harness.dispose();
	});

	test("normal save flushes schedule and reopens with the new durable value", async () => {
		await setScheduleFromEditor({
			regenerated: false,
			schedule: scheduleForSave(3),
		});

		assert.deepStrictEqual(await harness.cache.schedule.getAll(), [
			{ gid: 1, day: 3, awayTid: 1, homeTid: 0 },
		]);
		assert.deepStrictEqual(await harness.read("schedule", 1), {
			gid: 1,
			day: 3,
			awayTid: 1,
			homeTid: 0,
		});

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		const transaction = reopened.transaction(["schedule"], "readonly");
		assert.deepStrictEqual(await transaction.objectStore("schedule").getAll(), [
			{ gid: 1, day: 3, awayTid: 1, homeTid: 0 },
		]);
		await transaction.done;
		reopened.close();
	});

	test("allows different teams to play two ordinary games on one day and reopens", async () => {
		await setScheduleFromEditor({
			regenerated: false,
			schedule: [
				{ type: "game", day: 3, awayTid: 1, homeTid: 0 },
				{ type: "game", day: 3, awayTid: 3, homeTid: 2 },
			] as ScheduleEditorSchedule,
		});

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		const transaction = reopened.transaction(["schedule"], "readonly");
		assert.deepStrictEqual(await transaction.objectStore("schedule").getAll(), [
			{ gid: 1, day: 3, awayTid: 1, homeTid: 0 },
			{ gid: 2, day: 3, awayTid: 3, homeTid: 2 },
		]);
		await transaction.done;
		reopened.close();
	});

	test("regenerated settings and schedule both survive reopening", async () => {
		const season = g.get("season");
		const settings = {
			numGames: [
				{ start: season, value: 82 },
				{ start: season + 1, value: 76 },
			],
			divs: [
				{ start: season, value: [{ did: 0, cid: 0, name: "Current" }] },
				{ start: season + 1, value: [{ did: 1, cid: 0, name: "Next" }] },
			],
			confs: [
				{ start: season, value: [{ cid: 0, name: "Current" }] },
				{ start: season + 1, value: [{ cid: 0, name: "Next" }] },
			],
		};
		for (const [key, value] of Object.entries(settings)) {
			g.setWithoutSavingToDB(
				key as "numGames" | "divs" | "confs",
				value as any,
			);
			await harness.cache.gameAttributes.put({ key, value } as any);
		}
		await harness.cache.flush(["gameAttributes"], {
			league: harness.leagueDB,
			updateLastPlayed: false,
		});

		await setScheduleFromEditor({
			regenerated: true,
			schedule: scheduleForSave(3),
		});

		const expectedSettings = {
			numGames: [{ start: season, value: 76 }],
			divs: [{ start: season, value: [{ did: 1, cid: 0, name: "Next" }] }],
			confs: [{ start: season, value: [{ cid: 0, name: "Next" }] }],
		};
		for (const [key, value] of Object.entries(expectedSettings)) {
			assert.deepStrictEqual(await harness.read("gameAttributes", key), {
				key,
				value,
			});
		}

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		const transaction = reopened.transaction(
			["schedule", "gameAttributes"],
			"readonly",
		);
		assert.deepStrictEqual(await transaction.objectStore("schedule").getAll(), [
			{ gid: 1, day: 3, awayTid: 1, homeTid: 0 },
		]);
		expect(await transaction.objectStore("gameAttributes").getAll()).toEqual(
			expect.arrayContaining(
				Object.entries(expectedSettings).map(([key, value]) => ({
					key,
					value,
				})),
			),
		);
		await transaction.done;
		reopened.close();
	});

	test("validation rejection leaves memory, dirty state, and durable state unchanged", async () => {
		const invalid = [
			{ type: "game" as const, day: 3, awayTid: 0, homeTid: 0 },
		] as unknown as ScheduleEditorSchedule;

		await assertPromiseRejects(
			setScheduleFromEditor({ regenerated: false, schedule: invalid }),
		);
		assert.deepStrictEqual(await harness.cache.schedule.getAll(), [
			{ gid: 0, day: 2, awayTid: 1, homeTid: 0 },
		]);
		assert.equal(harness.cache._dirty, false);
		assert.deepStrictEqual(await harness.read("schedule", 0), {
			gid: 0,
			day: 2,
			awayTid: 1,
			homeTid: 0,
		});
	});

	test("Cache put failure rolls back without leaving a durable half-state", async () => {
		const add = vi
			.spyOn(harness.cache.schedule, "add")
			.mockRejectedValueOnce(new Error("schedule put failed"));

		await assertPromiseRejects(
			setScheduleFromEditor({
				regenerated: false,
				schedule: scheduleForSave(3),
			}),
		);
		add.mockRestore();

		assert.deepStrictEqual(await harness.cache.schedule.getAll(), [
			{ gid: 0, day: 2, awayTid: 1, homeTid: 0 },
		]);
		assert.deepStrictEqual(await harness.read("schedule", 0), {
			gid: 0,
			day: 2,
			awayTid: 1,
			homeTid: 0,
		});
		assert.equal(await harness.read("schedule", 1), undefined);
	});

	test("first flush rejection rolls back and retry state remains observable", async () => {
		harness.setAbortNext();

		await assertPromiseRejects(
			setScheduleFromEditor({
				regenerated: false,
				schedule: scheduleForSave(3),
			}),
		);

		assert.deepStrictEqual(await harness.cache.schedule.getAll(), [
			{ gid: 0, day: 2, awayTid: 1, homeTid: 0 },
		]);
		assert.equal(harness.cache._dirty, false);
		assert.deepStrictEqual(await harness.read("schedule", 0), {
			gid: 0,
			day: 2,
			awayTid: 1,
			homeTid: 0,
		});

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		const transaction = reopened.transaction(["schedule"], "readonly");
		assert.deepStrictEqual(await transaction.objectStore("schedule").getAll(), [
			{ gid: 0, day: 2, awayTid: 1, homeTid: 0 },
		]);
		await transaction.done;
		reopened.close();
	});

	test("rollback flush rejection preserves both original and rollback errors", async () => {
		harness.setAbortCount(2);

		let error: any;
		try {
			await setScheduleFromEditor({
				regenerated: false,
				schedule: scheduleForSave(3),
			});
		} catch (error_) {
			error = error_;
		}

		assert(error instanceof Error);
		const diagnosticError = error as Error & {
			originalError?: Error;
			rollbackError?: Error;
		};
		assert.equal(
			diagnosticError.message,
			"Schedule save failed and rollback failed",
		);
		assert.equal(diagnosticError.originalError?.name, "AbortError");
		assert.equal(diagnosticError.rollbackError?.name, "AbortError");
		assert.deepStrictEqual(await harness.read("schedule", 0), {
			gid: 0,
			day: 2,
			awayTid: 1,
			homeTid: 0,
		});
	});

	test("captured context prevents an in-flight save from writing a switched league", async () => {
		harness.holdNextTransaction();
		const firstSave = setScheduleFromEditor({
			regenerated: false,
			schedule: scheduleForSave(3),
		});
		await harness.waitForHeldTransaction();

		const second = await createScheduleSaveHarness(2);
		try {
			await seedDurableSchedule(second, [
				{ gid: 0, day: 4, awayTid: 1, homeTid: 0 },
			]);
			second.installAsCurrent(2);
			const secondSave = setScheduleFromEditor({
				regenerated: false,
				schedule: scheduleForSave(5),
			});
			harness.releaseHeldTransaction();
			await Promise.all([firstSave, secondSave]);

			assert.deepStrictEqual(await harness.read("schedule", 1), {
				gid: 1,
				day: 3,
				awayTid: 1,
				homeTid: 0,
			});
			assert.deepStrictEqual(await second.read("schedule", 1), {
				gid: 1,
				day: 5,
				awayTid: 1,
				homeTid: 0,
			});
			assert.equal(harness.transactionCount(), 2);
			assert.equal(second.transactionCount(), 2);
		} finally {
			await second.dispose();
		}
	});

	test("two saves on one Cache serialize and the later save wins", async () => {
		harness.holdNextTransaction();
		const firstSave = setScheduleFromEditor({
			regenerated: false,
			schedule: scheduleForSave(3),
		});
		await harness.waitForHeldTransaction();
		const secondSave = setScheduleFromEditor({
			regenerated: false,
			schedule: scheduleForSave(4),
		});
		harness.releaseHeldTransaction();
		await Promise.all([firstSave, secondSave]);

		assert.deepStrictEqual(await harness.read("schedule", 2), {
			gid: 2,
			day: 4,
			awayTid: 1,
			homeTid: 0,
		});
		assert.equal(harness.transactionCount(), 3);
	});

	test("unrelated player mutation survives a successful schedule save", async () => {
		harness.holdNextTransaction();
		const save = setScheduleFromEditor({
			regenerated: false,
			schedule: scheduleForSave(3),
		});
		await harness.waitForHeldTransaction();
		await harness.cache.players.put({ pid: 1, tid: 0 } as any);
		harness.releaseHeldTransaction();
		await save;

		assert.deepStrictEqual((await harness.cache.players.get(1)) as any, {
			pid: 1,
			tid: 0,
		});
		assert(harness.cache._dirtyRecords.players.has(1));
		await harness.cache.flush(["players"], {
			league: harness.leagueDB,
			updateLastPlayed: false,
		});
	});

	test("rollback leaves unrelated player mutation dirty and durable after retry", async () => {
		harness.setAbortNext();
		await harness.cache.players.put({ pid: 1, tid: 0 } as any);

		await assertPromiseRejects(
			setScheduleFromEditor({
				regenerated: false,
				schedule: scheduleForSave(3),
			}),
		);

		assert(harness.cache._dirtyRecords.players.has(1));
		assert.deepStrictEqual(await harness.cache.schedule.getAll(), [
			{ gid: 0, day: 2, awayTid: 1, homeTid: 0 },
		]);
		await harness.cache.flush(["players"], {
			league: harness.leagueDB,
			updateLastPlayed: false,
		});
		assert.equal(harness.cache._dirty, false);
	});

	test("failed Editor save serializes a concurrent toggleTradeDeadline mutation", async () => {
		g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
		await harness.cache.schedule.clear();
		await harness.cache.schedule.put({
			gid: 0,
			day: 2,
			awayTid: -3,
			homeTid: -3,
		});
		await harness.cache.gameAttributes.put({
			key: "phase",
			value: PHASE.REGULAR_SEASON,
		});
		await harness.cache.flush(["schedule", "gameAttributes"], {
			league: harness.leagueDB,
			updateLastPlayed: false,
		});

		let flushReached!: () => void;
		const reached = new Promise<void>((resolve) => {
			flushReached = resolve;
		});
		let releaseFlush!: () => void;
		const barrier = new Promise<void>((resolve) => {
			releaseFlush = resolve;
		});
		const saveError = new Error("Editor flush failed");
		const originalFlush = harness.cache.flush.bind(harness.cache);
		vi.spyOn(harness.cache, "flush")
			.mockImplementationOnce(async () => {
				flushReached();
				await barrier;
				throw saveError;
			})
			.mockImplementation((...args) => originalFlush(...args));

		const editorSave = setScheduleFromEditor({
			regenerated: false,
			schedule: scheduleForSave(3),
		});
		await reached;
		let toggleSettled = false;
		const toggle = api.main.toggleTradeDeadline().finally(() => {
			toggleSettled = true;
		});
		await Promise.resolve();
		assert.equal(toggleSettled, false);

		releaseFlush();
		await assertPromiseRejects(editorSave);
		await toggle;

		assert.equal(g.get("phase"), PHASE.AFTER_TRADE_DEADLINE);
		assert.deepStrictEqual(await harness.cache.schedule.getAll(), []);
		assert.equal(
			(await harness.cache.gameAttributes.get("phase"))?.value,
			PHASE.AFTER_TRADE_DEADLINE,
		);

		await originalFlush(["schedule", "gameAttributes"], {
			league: harness.leagueDB,
			updateLastPlayed: false,
		});
		assert.deepStrictEqual(await harness.read("schedule", 0), undefined);
		assert.deepStrictEqual(await harness.read("gameAttributes", "phase"), {
			key: "phase",
			value: PHASE.AFTER_TRADE_DEADLINE,
		});
	});

	test("nested pause remains held until both Schedule and caller releases complete", async () => {
		const release = harness.cache.pauseAutoFlush();
		await setScheduleFromEditor({
			regenerated: false,
			schedule: scheduleForSave(3),
		});
		assert.equal(harness.cache._autoFlushPauseCount, 1);
		release();
		assert.equal(harness.cache._autoFlushPauseCount, 0);
		assert.notEqual(harness.cache._autoFlushTimer, undefined);
	});

	test("pending metadata does not cause Schedule to be rewritten", async () => {
		harness.cache._metaUpdatePending = true;
		await setScheduleFromEditor({
			regenerated: false,
			schedule: scheduleForSave(3),
		});

		assert.equal(harness.cache._metaUpdatePending, true);
		assert.equal(harness.transactionCount(), 2);
		assert.deepStrictEqual(await harness.read("schedule", 1), {
			gid: 1,
			day: 3,
			awayTid: 1,
			homeTid: 0,
		});
	});
});
