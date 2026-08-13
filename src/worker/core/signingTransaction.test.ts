import "fake-indexeddb/auto";
import { deleteDB, openDB } from "@dumbmatter/idb";
import { afterEach, assert, beforeEach, describe, test, vi } from "vitest";
import { PHASE, PLAYER } from "../../common/index.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import type { Negotiation, Player, Team } from "../../common/types.ts";
import { resetG } from "../../test/helpers.ts";
import { player, team } from "./index.ts";
import { captureSigningContext } from "./capturedContext.ts";
import { applySigningTransaction } from "./signingTransaction.ts";
import Cache, { STORES } from "../db/Cache.ts";
import { idb } from "../db/index.ts";
import { g, local } from "../util/index.ts";

type Harness = {
	db: any;
	dbName: string;
	cache: Cache;
	player: Player;
	originalPlayer: Player;
	team: Team;
	originalTeam: Team;
	negotiation: Negotiation;
};

const initializeCache = (cache: Cache) => {
	for (const store of STORES) {
		cache._data[store] = {};
		cache._deletes[store] = new Set();
		cache._dirtyRecords[store] = new Set();
		cache._maxIds[store] = -1;
		cache._markDirtyIndexes(store);
	}
	cache._status = "full";
};

const readRecord = async (
	db: any,
	store: "events" | "negotiations" | "players" | "teams",
	key: number,
) => {
	const transaction = db.transaction([store], "readonly");
	const result = await transaction.objectStore(store).get(key);
	await transaction.done;
	return result;
};

let previousCache: Cache;
let previousLeague: typeof idb.league;
let previousAutoSave: boolean;
let harness: Harness;

const createHarness = async () => {
	const dbName = `signing-hardening-${Date.now()}-${Math.random()}`;
	const db = await openDB<any>(dbName, 1, {
		upgrade(database) {
			database.createObjectStore("events", {
				keyPath: "eid",
				autoIncrement: true,
			});
			database.createObjectStore("negotiations", { keyPath: "pid" });
			database.createObjectStore("players", { keyPath: "pid" });
			database.createObjectStore("teams", { keyPath: "tid" });
		},
	});

	const cache = new Cache();
	initializeCache(cache);
	idb.cache = cache;
	idb.league = db;
	local.autoSave = true;
	cache.stopAutoFlush();

	const teamToUse = helpersTeams()[0]!;
	const p = player.generate(
		PLAYER.FREE_AGENT,
		30,
		g.get("season") - 8,
		true,
		DEFAULT_LEVEL,
	) as Player;
	await cache.players.add(p);
	const originalPlayer = structuredClone(p) as Player;
	await cache.teams.add(teamToUse);
	const originalTeam = structuredClone(teamToUse) as Team;
	const negotiation = {
		pid: p.pid,
		tid: teamToUse.tid,
		resigning: false,
	} as Negotiation;
	await cache.negotiations.add(negotiation);
	await cache.flush(["players", "teams", "negotiations"], {
		league: db,
		updateLastPlayed: false,
	});

	return {
		db,
		dbName,
		cache,
		player: p,
		originalPlayer,
		team: teamToUse,
		originalTeam,
		negotiation,
	};
};

const helpersTeams = () =>
	[...Array(2)].map((_, tid) =>
		team.generate({
			tid,
			cid: 0,
			did: 0,
			region: `Region ${tid}`,
			name: `Team ${tid}`,
			abbrev: `T${tid}`,
			pop: 1,
		}),
	);

beforeEach(async () => {
	resetG();
	previousCache = idb.cache;
	previousLeague = idb.league;
	previousAutoSave = local.autoSave;
	harness = await createHarness();
});

afterEach(async () => {
	harness.cache.stopAutoFlush();
	harness.db.close();
	await deleteDB(harness.dbName);
	idb.cache = previousCache;
	idb.league = previousLeague;
	local.autoSave = previousAutoSave;
	vi.restoreAllMocks();
});

const contract = () => ({
	amount: g.get("minContract"),
	exp: g.get("season") + 1,
});

const runSigning = (
	overrides: Partial<Parameters<typeof applySigningTransaction>[0]> = {},
) =>
	applySigningTransaction({
		context: captureSigningContext(),
		player: harness.player,
		tid: harness.team.tid,
		contract: contract(),
		phase: g.get("phase"),
		negotiation: harness.negotiation,
		...overrides,
	});

const expectRejected = async (promise: Promise<unknown>) => {
	let rejected = false;
	try {
		await promise;
	} catch {
		rejected = true;
	}
	assert.equal(rejected, true);
};

const assertOriginalDurableState = async () => {
	const pid = harness.player.pid;
	assert.deepStrictEqual(
		await readRecord(harness.db, "players", pid),
		harness.originalPlayer,
	);
	assert.deepStrictEqual(
		await readRecord(harness.db, "negotiations", pid),
		harness.negotiation,
	);
	assert.deepStrictEqual(
		await readRecord(harness.db, "teams", harness.team.tid),
		harness.originalTeam,
	);
	assert.strictEqual(await readRecord(harness.db, "events", 0), undefined);
};

const reopenHarnessDatabase = async () => {
	harness.db.close();
	harness.db = await openDB<any>(harness.dbName, 1);
	idb.league = harness.db;
};

describe("captured signing transaction", () => {
	test("writes player, event, negotiation deletion, and reopens durably", async () => {
		const result = await runSigning();
		const eventId = result.eventId!;

		assert.strictEqual(result.player.tid, harness.team.tid);
		assert.strictEqual(
			await harness.cache.negotiations.get(harness.player.pid),
			undefined,
		);
		assert.strictEqual((await harness.cache.events.getAll()).length, 1);
		const transaction = (
			await harness.cache.players.get(harness.player.pid)
		)?.transactions?.at(-1);
		assert.isDefined(transaction);
		assert.strictEqual(transaction.type, "freeAgent");
		if (transaction.type === "freeAgent") {
			assert.strictEqual(transaction.eid, eventId);
		}

		const event = await readRecord(harness.db, "events", eventId);
		assert.strictEqual(event.pids[0], harness.player.pid);
		assert.deepStrictEqual(
			await readRecord(harness.db, "players", harness.player.pid),
			result.player,
		);
		assert.strictEqual(
			await readRecord(harness.db, "negotiations", harness.player.pid),
			undefined,
		);

		harness.db.close();
		const reopened = await openDB<any>(harness.dbName, 1);
		assert.deepStrictEqual(
			await readRecord(reopened, "players", harness.player.pid),
			result.player,
		);
		assert.strictEqual(
			await readRecord(reopened, "negotiations", harness.player.pid),
			undefined,
		);
		assert.strictEqual(
			(await readRecord(reopened, "events", eventId)).pids[0],
			harness.player.pid,
		);
		reopened.close();
		// The teardown must not close the replacement database a second time.
		harness.db = await openDB<any>(harness.dbName, 1);
	});

	test("ordinary signing normalizes a legacy non-Normal free agent", async () => {
		const freeAgent = (await harness.cache.players.get(harness.player.pid))!;
		freeAgent.usageBias = 1.25;
		await harness.cache.players.put(freeAgent);
		await harness.cache.flush(["players"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { players: [freeAgent.pid] },
		});

		const result = await runSigning();
		assert.strictEqual(result.player.usageBias, 1);
		assert.strictEqual(
			(await readRecord(harness.db, "players", freeAgent.pid)).usageBias,
			1,
		);
	});

	test.each([0.85, 1.1, 1.25])(
		"formal same-team re-sign restores snapshot %s",
		async (usageBiasBeforeFreeAgency) => {
			const negotiation = {
				...harness.negotiation,
				resigning: true,
				usageBiasBeforeFreeAgency,
			};
			await harness.cache.negotiations.put(negotiation);
			await harness.cache.flush(["negotiations"], {
				league: harness.db,
				updateLastPlayed: false,
				records: { negotiations: [negotiation.pid] },
			});

			const result = await runSigning({
				negotiation,
				phase: PHASE.RESIGN_PLAYERS,
			});
			assert.strictEqual(result.player.usageBias, usageBiasBeforeFreeAgency);
			assert.strictEqual(
				(await readRecord(harness.db, "players", harness.player.pid)).usageBias,
				usageBiasBeforeFreeAgency,
			);
		},
	);

	test("legacy re-sign negotiation without snapshot is safely Normal", async () => {
		const negotiation = {
			...harness.negotiation,
			resigning: true,
		};
		await harness.cache.negotiations.put(negotiation);

		const result = await runSigning({
			negotiation,
			phase: PHASE.RESIGN_PLAYERS,
		});
		assert.strictEqual(result.player.usageBias, 1);
	});

	test.each([0, -1, Number.POSITIVE_INFINITY, Number.NaN])(
		"invalid formal re-sign snapshot %s is safely Normal",
		async (usageBiasBeforeFreeAgency) => {
			const negotiation = {
				...harness.negotiation,
				resigning: true,
				usageBiasBeforeFreeAgency,
			};
			await harness.cache.negotiations.put(negotiation);

			const result = await runSigning({
				negotiation,
				phase: PHASE.RESIGN_PLAYERS,
			});
			assert.strictEqual(result.player.usageBias, 1);
		},
	);

	test("formal snapshot for a different team does not follow the player", async () => {
		const negotiation = {
			...harness.negotiation,
			tid: harness.team.tid + 1,
			resigning: true,
			usageBiasBeforeFreeAgency: 1.25,
		};
		await harness.cache.negotiations.put(negotiation);

		const result = await runSigning({
			negotiation,
			phase: PHASE.RESIGN_PLAYERS,
		});
		assert.strictEqual(result.player.usageBias, 1);
	});

	test("AI-style in-place re-sign preserves current tendency", async () => {
		const rosterPlayer = (await harness.cache.players.get(harness.player.pid))!;
		rosterPlayer.tid = harness.team.tid;
		rosterPlayer.usageBias = 1.25;
		await harness.cache.players.put(rosterPlayer);
		await harness.cache.flush(["players"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { players: [rosterPlayer.pid] },
		});

		const result = await runSigning({
			player: rosterPlayer,
			negotiation: undefined,
			phase: PHASE.RESIGN_PLAYERS,
		});
		assert.strictEqual(result.player.usageBias, 1.25);
		assert.strictEqual(
			(await readRecord(harness.db, "players", rosterPlayer.pid)).usageBias,
			1.25,
		);
	});

	test("snapshot restoration rolls back to a Normal FA and remains retryable", async () => {
		const negotiation = {
			...harness.negotiation,
			resigning: true,
			usageBiasBeforeFreeAgency: 1.25,
		};
		await harness.cache.negotiations.put(negotiation);
		await harness.cache.flush(["negotiations"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { negotiations: [negotiation.pid] },
		});
		const deletionError = new Error("negotiation deletion failed");
		vi.spyOn(harness.cache.negotiations, "delete").mockRejectedValueOnce(
			deletionError,
		);

		try {
			await runSigning({ negotiation, phase: PHASE.RESIGN_PLAYERS });
			assert.fail("formal re-sign should reject");
		} catch (error) {
			assert.strictEqual(error, deletionError);
		}
		assert.strictEqual(
			(await harness.cache.players.get(harness.player.pid))?.usageBias,
			1,
		);
		assert.strictEqual(
			(await harness.cache.negotiations.get(harness.player.pid))
				?.usageBiasBeforeFreeAgency,
			1.25,
		);
		await reopenHarnessDatabase();
		assert.strictEqual(
			(await readRecord(harness.db, "players", harness.player.pid)).usageBias,
			1,
		);
		assert.strictEqual(
			(await readRecord(harness.db, "negotiations", harness.player.pid))
				.usageBiasBeforeFreeAgency,
			1.25,
		);

		const retry = await runSigning({
			negotiation,
			phase: PHASE.RESIGN_PLAYERS,
		});
		assert.strictEqual(retry.player.usageBias, 1.25);
	});

	test("immediate signing flushes only its record scope", async () => {
		const unrelatedPlayer = structuredClone(harness.originalPlayer);
		unrelatedPlayer.pid = 99;
		const unrelatedEvent = {
			eid: 99,
			type: "freeAgent",
			pids: [99],
			tids: [harness.team.tid],
		} as any;
		await harness.cache.players.put(unrelatedPlayer);
		await harness.cache.events.add(unrelatedEvent);

		const result = await runSigning();
		assert.isDefined(await readRecord(harness.db, "events", result.eventId!));
		assert.strictEqual(
			await readRecord(harness.db, "players", unrelatedPlayer.pid),
			undefined,
		);
		assert.strictEqual(harness.cache._dirtyRecords.players.has(99), true);
		assert.strictEqual(harness.cache._dirtyRecords.events.has(99), true);

		await reopenHarnessDatabase();
		assert.strictEqual(
			await readRecord(harness.db, "players", unrelatedPlayer.pid),
			undefined,
		);
		assert.strictEqual(
			await readRecord(harness.db, "events", unrelatedEvent.eid),
			undefined,
		);

		await harness.cache.flush(["players", "events"], {
			league: harness.db,
			updateLastPlayed: false,
		});
		assert.deepStrictEqual(
			await readRecord(harness.db, "players", unrelatedPlayer.pid),
			unrelatedPlayer,
		);
		assert.deepStrictEqual(
			await readRecord(harness.db, "events", unrelatedEvent.eid),
			unrelatedEvent,
		);
	});

	test("deferred signing stages memory only until the outer flush", async () => {
		const result = await runSigning({ durability: "deferred" });
		assert.isDefined(result.eventId);
		assert.strictEqual(harness.cache._dirty, true);

		await reopenHarnessDatabase();
		await assertOriginalDurableState();

		await harness.cache.flush(["players", "events", "negotiations"], {
			league: harness.db,
			updateLastPlayed: false,
		});
		assert.strictEqual(
			(await readRecord(harness.db, "players", harness.player.pid))?.tid,
			harness.team.tid,
		);
		assert.isDefined(await readRecord(harness.db, "events", result.eventId!));
		assert.strictEqual(
			await readRecord(harness.db, "negotiations", harness.player.pid),
			undefined,
		);
	});

	test("MLE marker and player are committed together", async () => {
		const teamWithMarker = {
			...harness.team,
			midLevelExceptionUsedSeason: g.get("season"),
		};
		const result = await runSigning({
			team: teamWithMarker,
			contract: { ...contract(), exception: "midLevel" },
		});

		assert.strictEqual(
			(await harness.cache.teams.get(harness.team.tid))
				?.midLevelExceptionUsedSeason,
			g.get("season"),
		);
		assert.strictEqual(
			(await readRecord(harness.db, "teams", harness.team.tid))
				.midLevelExceptionUsedSeason,
			g.get("season"),
		);
		assert.isDefined(await harness.cache.events.get(result.eventId!));
	});

	test("an MLE marker from the previous season is reusable", async () => {
		const context = captureSigningContext();
		context.mleSeason = g.get("season");
		const cachedTeam = (await harness.cache.teams.get(harness.team.tid))!;
		cachedTeam.midLevelExceptionUsedSeason = g.get("season") - 1;
		await harness.cache.teams.put(cachedTeam);
		await harness.cache.flush(["teams"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { teams: [cachedTeam.tid] },
		});
		const result = await runSigning({
			context,
			team: cachedTeam,
			contract: { ...contract(), exception: "midLevel" },
		});
		assert.isDefined(result.eventId);
		await reopenHarnessDatabase();
		assert.strictEqual(
			(await readRecord(harness.db, "teams", harness.team.tid))
				.midLevelExceptionUsedSeason,
			g.get("season"),
		);
	});

	test("MLE availability uses the captured target season, not only g.season", async () => {
		const context = captureSigningContext();
		context.mleSeason = g.get("season") + 1;
		const cachedTeam = (await harness.cache.teams.get(harness.team.tid))!;
		cachedTeam.midLevelExceptionUsedSeason = g.get("season");
		await harness.cache.teams.put(cachedTeam);
		await harness.cache.flush(["teams"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { teams: [cachedTeam.tid] },
		});
		const result = await runSigning({
			context,
			team: cachedTeam,
			contract: { ...contract(), exception: "midLevel" },
		});
		assert.isDefined(result.eventId);
		await reopenHarnessDatabase();
		assert.strictEqual(
			(await readRecord(harness.db, "teams", harness.team.tid))
				.midLevelExceptionUsedSeason,
			g.get("season") + 1,
		);
	});

	test("MLE marker for the captured target season rejects before mutation", async () => {
		const context = captureSigningContext();
		const cachedTeam = (await harness.cache.teams.get(harness.team.tid))!;
		cachedTeam.midLevelExceptionUsedSeason = context.mleSeason;
		await harness.cache.teams.put(cachedTeam);
		await harness.cache.flush(["teams"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { teams: [cachedTeam.tid] },
		});

		await expectRejected(
			runSigning({
				context,
				team: cachedTeam,
				contract: { ...contract(), exception: "midLevel" },
			}),
		);
		assert.equal((await harness.cache.events.getAll()).length, 0);
		assert.strictEqual(
			(await harness.cache.players.get(harness.player.pid))?.tid,
			PLAYER.FREE_AGENT,
		);
	});

	test.each([
		["capSpace to midLevel", "capSpace", "midLevel"],
		["midLevel to capSpace", "midLevel", "capSpace"],
		["capSpace to unavailable", "capSpace", undefined],
		["minimum to midLevel", "minimum", "midLevel"],
	] as const)(
		"commit-time exception transition %s rejects before mutation",
		async (_name, expected, actual) => {
			await expectRejected(
				runSigning({
					exceptionValidator: {
						expected,
						validate: async () => actual,
					},
				}),
			);
			assert.equal((await harness.cache.events.getAll()).length, 0);
			assert.strictEqual(
				(await harness.cache.players.get(harness.player.pid))?.tid,
				PLAYER.FREE_AGENT,
			);
			assert.isDefined(
				await harness.cache.negotiations.get(harness.player.pid),
			);
		},
	);

	test("Bird remaining Bird succeeds", async () => {
		const result = await runSigning({
			exceptionValidator: {
				expected: "bird",
				validate: async () => "bird",
			},
		});
		assert.isDefined(result.eventId);
		assert.strictEqual(result.player.tid, harness.team.tid);
	});

	test("an unmarked MLE result rejects before mutation", async () => {
		await expectRejected(
			runSigning({
				exceptionValidator: {
					expected: "midLevel",
					validate: async () => "midLevel",
				},
			}),
		);
		assert.equal((await harness.cache.events.getAll()).length, 0);
		assert.strictEqual(
			(await harness.cache.players.get(harness.player.pid))?.tid,
			PLAYER.FREE_AGENT,
		);
	});

	test("enabled auto-flush cannot persist a signing half-state", async () => {
		let observedBeforePrimaryFlush = false;
		const originalPut = harness.cache.players.put.bind(harness.cache.players);
		vi.spyOn(harness.cache.players, "put").mockImplementation(async (p) => {
			const result = await originalPut(p);
			await harness.cache._autoFlush();
			observedBeforePrimaryFlush =
				(await readRecord(harness.db, "events", 0)) === undefined &&
				(await readRecord(harness.db, "players", harness.player.pid))?.tid ===
					harness.originalPlayer.tid &&
				(await readRecord(harness.db, "negotiations", harness.player.pid)) !==
					undefined;
			return result;
		});
		harness.cache.startAutoFlush();
		await runSigning();

		assert.strictEqual(observedBeforePrimaryFlush, true);
		assert.isDefined(await readRecord(harness.db, "events", 0));
		assert.strictEqual(
			(await readRecord(harness.db, "negotiations", harness.player.pid)) !==
				undefined,
			false,
		);
	});

	test("MLE marker failure rolls back player and event before retry", async () => {
		const teamWithMarker = {
			...harness.team,
			midLevelExceptionUsedSeason: g.get("season"),
		};
		const error = new Error("team marker write failed");
		vi.spyOn(harness.cache.teams, "put").mockRejectedValueOnce(error);

		try {
			await runSigning({
				team: teamWithMarker,
				contract: { ...contract(), exception: "midLevel" },
			});
			assert.fail("MLE signing should reject");
		} catch (error_) {
			assert.strictEqual(error_, error);
		}
		await reopenHarnessDatabase();
		await assertOriginalDurableState();

		vi.restoreAllMocks();
		await harness.cache.flush(["players", "events", "negotiations", "teams"], {
			league: harness.db,
			updateLastPlayed: false,
		});
		const retry = await runSigning({
			team: teamWithMarker,
			contract: { ...contract(), exception: "midLevel" },
		});
		assert.isDefined(retry.eventId);
		assert.strictEqual(
			await readRecord(harness.db, "negotiations", harness.player.pid),
			undefined,
		);
	});

	test("MLE rollback restores only its marker and preserves unrelated team changes", async () => {
		const teamWithMarker = (await harness.cache.teams.get(harness.team.tid))!;
		teamWithMarker.midLevelExceptionUsedSeason = g.get("season") - 1;
		await harness.cache.teams.put(teamWithMarker);
		await harness.cache.flush(["teams"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { teams: [teamWithMarker.tid] },
		});
		const originalPut = harness.cache.teams.put.bind(harness.cache.teams);
		let firstPut = true;
		const markerError = new Error("marker write failed after unrelated update");
		vi.spyOn(harness.cache.teams, "put").mockImplementation(async (row) => {
			if (firstPut) {
				firstPut = false;
				const latest = await harness.cache.teams.get(harness.team.tid);
				latest!.keepRosterSorted = true;
				await originalPut(latest!);
				throw markerError;
			}
			return originalPut(row);
		});

		try {
			await runSigning({
				team: teamWithMarker,
				contract: { ...contract(), exception: "midLevel" },
			});
			assert.fail("MLE signing should reject");
		} catch (error) {
			assert.strictEqual(error, markerError);
		}

		await reopenHarnessDatabase();
		const restoredTeam = await readRecord(
			harness.db,
			"teams",
			harness.team.tid,
		);
		assert.strictEqual(restoredTeam.keepRosterSorted, true);
		assert.strictEqual(
			restoredTeam.midLevelExceptionUsedSeason,
			g.get("season") - 1,
		);
	});

	test.each([
		["event", "events.add"],
		["player", "players.put"],
		["negotiation", "negotiations.delete"],
		["primary flush", "flush"],
	] as const)(
		"failure at %s leaves no durable half-state and can retry",
		async (_name, point) => {
			const error = new Error(point);
			if (point === "events.add") {
				vi.spyOn(harness.cache.events, "add").mockRejectedValueOnce(error);
			} else if (point === "players.put") {
				vi.spyOn(harness.cache.players, "put").mockRejectedValueOnce(error);
			} else if (point === "negotiations.delete") {
				vi.spyOn(harness.cache.negotiations, "delete").mockRejectedValueOnce(
					error,
				);
			} else {
				vi.spyOn(harness.cache, "flush").mockRejectedValueOnce(error);
			}

			try {
				await runSigning();
				assert.fail("signing should reject");
			} catch (error_) {
				assert.strictEqual(error_, error);
			}
			await reopenHarnessDatabase();
			await assertOriginalDurableState();

			vi.restoreAllMocks();
			await harness.cache.flush(
				["players", "events", "negotiations", "teams"],
				{
					league: harness.db,
					updateLastPlayed: false,
				},
			);
			await assertOriginalDurableState();

			const retry = await runSigning();
			assert.isDefined(retry.eventId);
			assert.strictEqual(
				await readRecord(harness.db, "negotiations", harness.player.pid),
				undefined,
			);
		},
	);

	test("rollback flush failure preserves both diagnostics and remains retryable", async () => {
		const primaryError = new Error("primary flush failed");
		const rollbackError = new Error("rollback flush failed");
		const flush = vi.spyOn(harness.cache, "flush");
		flush
			.mockRejectedValueOnce(primaryError)
			.mockRejectedValueOnce(rollbackError);

		try {
			await runSigning();
			assert.fail("signing should reject");
		} catch (error: any) {
			assert.strictEqual(error.originalError, primaryError);
			assert.strictEqual(error.rollbackError, rollbackError);
		}
		await reopenHarnessDatabase();
		assert.strictEqual(
			(await readRecord(harness.db, "negotiations", harness.player.pid)) !==
				undefined,
			true,
		);

		flush.mockRestore();
		await harness.cache.flush(["players", "events", "negotiations"], {
			league: harness.db,
			updateLastPlayed: false,
		});
		const retry = await runSigning();
		assert.isDefined(retry.eventId);
	});

	test("same-team submissions serialize while different players remain independent", async () => {
		const secondPlayer = player.generate(
			PLAYER.FREE_AGENT,
			30,
			g.get("season") - 7,
			true,
			DEFAULT_LEVEL,
		) as Player;
		await harness.cache.players.add(secondPlayer);
		await harness.cache.flush(["players"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { players: [secondPlayer.pid] },
		});

		const [first, second] = await Promise.all([
			runSigning(),
			runSigning({
				player: secondPlayer,
				negotiation: undefined,
			}),
		]);
		assert.isDefined(first.eventId);
		assert.isDefined(second.eventId);
		assert.notStrictEqual(first.eventId, second.eventId);
		assert.isDefined(await readRecord(harness.db, "events", first.eventId!));
		assert.isDefined(await readRecord(harness.db, "events", second.eventId!));
	});

	test("queued same-team signing cannot stage an event before its turn", async () => {
		const secondPlayer = player.generate(
			PLAYER.FREE_AGENT,
			30,
			g.get("season") - 7,
			true,
			DEFAULT_LEVEL,
		) as Player;
		await harness.cache.players.add(secondPlayer);
		await harness.cache.flush(["players"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { players: [secondPlayer.pid] },
		});

		let firstEntered = false;
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const first = runSigning({
			revalidate: async () => {
				firstEntered = true;
				await firstGate;
			},
		});
		while (!firstEntered) {
			await Promise.resolve();
		}

		const second = runSigning({
			player: secondPlayer,
			negotiation: undefined,
		});
		await Promise.resolve();
		assert.deepStrictEqual(await harness.cache.events.getAll(), []);

		releaseFirst();
		const [firstResult, secondResult] = await Promise.all([first, second]);
		assert.isDefined(firstResult.eventId);
		assert.isDefined(secondResult.eventId);
		assert.strictEqual((await harness.cache.events.getAll()).length, 2);
	});

	test("different-team signing queues can progress independently", async () => {
		const secondTeam = helpersTeams()[1]!;
		const secondPlayer = player.generate(
			PLAYER.FREE_AGENT,
			30,
			g.get("season") - 7,
			true,
			DEFAULT_LEVEL,
		) as Player;
		await harness.cache.teams.add(secondTeam);
		await harness.cache.players.add(secondPlayer);
		await harness.cache.flush(["teams", "players"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { teams: [secondTeam.tid], players: [secondPlayer.pid] },
		});

		let releaseFirst!: () => void;
		let secondEntered = false;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const first = runSigning({
			revalidate: async () => {
				await firstGate;
			},
		});
		const second = runSigning({
			player: secondPlayer,
			tid: secondTeam.tid,
			negotiation: undefined,
			revalidate: async () => {
				secondEntered = true;
			},
		});
		while (!secondEntered) {
			await Promise.resolve();
		}
		assert.strictEqual(secondEntered, true);
		releaseFirst();
		await Promise.all([first, second]);
	});

	test("concurrent same-team MLE requests allow only one marker commit", async () => {
		const secondPlayer = player.generate(
			PLAYER.FREE_AGENT,
			30,
			g.get("season") - 7,
			true,
			DEFAULT_LEVEL,
		) as Player;
		await harness.cache.players.add(secondPlayer);
		await harness.cache.flush(["players"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { players: [secondPlayer.pid] },
		});
		const marker = {
			...harness.team,
			midLevelExceptionUsedSeason: g.get("season"),
		};

		const results = await Promise.allSettled([
			runSigning({
				team: marker,
				contract: { ...contract(), exception: "midLevel" },
			}),
			runSigning({
				player: secondPlayer,
				negotiation: undefined,
				team: marker,
				contract: { ...contract(), exception: "midLevel" },
			}),
		]);

		assert.strictEqual(
			results.filter((result) => result.status === "fulfilled").length,
			1,
		);
		assert.strictEqual(
			results.filter((result) => result.status === "rejected").length,
			1,
		);
		assert.strictEqual(
			(await harness.cache.teams.get(harness.team.tid))
				?.midLevelExceptionUsedSeason,
			g.get("season"),
		);
	});

	test("concurrent hard-cap re-signings re-read payroll inside the team queue", async () => {
		const context = captureSigningContext();
		context.salaryCapType = "hard";
		context.salaryCap = 1500;
		const makeExpiringPlayer = () => {
			const p = player.generate(
				harness.team.tid,
				30,
				g.get("season") - 7,
				true,
				DEFAULT_LEVEL,
			) as Player;
			p.contract.amount = 1000;
			p.contract.exp = context.season;
			return p;
		};
		const firstPlayer = makeExpiringPlayer();
		const secondPlayer = makeExpiringPlayer();
		await harness.cache.players.add(firstPlayer);
		await harness.cache.players.add(secondPlayer);
		await harness.cache.flush(["players"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { players: [firstPlayer.pid, secondPlayer.pid] },
		});
		const newContract = {
			amount: 1000,
			exp: context.season + 1,
		};
		const signWithHardCapValidation = (p: Player) =>
			applySigningTransaction({
				context,
				player: p,
				tid: harness.team.tid,
				contract: newContract,
				phase: g.get("phase"),
				durability: "deferred",
				exceptionValidator: {
					expected: "capSpace",
					validate: async () => {
						const payroll = await team.getPayroll(
							harness.team.tid,
							context.season + 1,
							context.cache,
						);
						return payroll + newContract.amount <= context.salaryCap
							? "capSpace"
							: undefined;
					},
				},
			});

		const results = await Promise.allSettled([
			signWithHardCapValidation(firstPlayer),
			signWithHardCapValidation(secondPlayer),
		]);
		assert.strictEqual(
			results.filter((result) => result.status === "fulfilled").length,
			1,
		);
		assert.strictEqual(
			results.filter((result) => result.status === "rejected").length,
			1,
		);
		assert.strictEqual((await harness.cache.events.getAll()).length, 1);
	});

	test("captured league change aborts before mutation", async () => {
		const context = captureSigningContext();
		const otherCache = new Cache();
		initializeCache(otherCache);
		const originalCache = idb.cache;
		idb.cache = otherCache;

		try {
			await applySigningTransaction({
				context,
				player: harness.player,
				tid: harness.team.tid,
				contract: contract(),
				phase: g.get("phase"),
			});
			assert.fail("signing should reject after league switch");
		} catch {
			// Expected: the captured cache is no longer the active league.
		}
		await assertOriginalDurableState();
		idb.cache = originalCache;
	});

	test("queued signings abort after a league switch and release every auto-flush pause", async () => {
		const secondPlayer = player.generate(
			PLAYER.FREE_AGENT,
			30,
			g.get("season") - 7,
			true,
			DEFAULT_LEVEL,
		) as Player;
		await harness.cache.players.add(secondPlayer);
		await harness.cache.flush(["players"], {
			league: harness.db,
			updateLastPlayed: false,
			records: { players: [secondPlayer.pid] },
		});

		let firstEntered = false;
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const context = captureSigningContext();
		const first = runSigning({
			context,
			revalidate: async () => {
				firstEntered = true;
				await firstGate;
			},
		});
		while (!firstEntered) {
			await Promise.resolve();
		}
		assert.strictEqual(harness.cache._autoFlushPauseCount, 1);

		const second = runSigning({
			context,
			player: secondPlayer,
			negotiation: undefined,
		});
		const otherCache = new Cache();
		initializeCache(otherCache);
		const originalCache = idb.cache;
		idb.cache = otherCache;
		releaseFirst();

		const results = await Promise.allSettled([first, second]);
		idb.cache = originalCache;
		assert.deepStrictEqual(
			results.map((result) => result.status),
			["rejected", "rejected"],
		);
		assert.strictEqual(harness.cache._autoFlushPauseCount, 0);
		assert.deepStrictEqual(await harness.cache.events.getAll(), []);
		assert.strictEqual(
			(await harness.cache.players.get(harness.player.pid))?.tid,
			PLAYER.FREE_AGENT,
		);
		assert.strictEqual(
			(await harness.cache.players.get(secondPlayer.pid))?.tid,
			PLAYER.FREE_AGENT,
		);
		await assertOriginalDurableState();
	});
});
