import type BasketballGameSim from "../GameSim.basketball/index.ts";
import "fake-indexeddb/auto";
import { deleteDB, unwrap } from "@dumbmatter/idb";
import { afterEach, assert, beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import Cache, { STORES } from "../../db/Cache.ts";
import { connectLeague, idb } from "../../db/index.ts";
import { g, helpers, local, lock } from "../../util/index.ts";
import {
	GameSim,
	freeAgents,
	player,
	team,
	trade,
	phase,
	league,
	season,
} from "../index.ts";
import play from "./play.ts";
import * as playerStats from "./writePlayerStats.ts";
import * as uiTransport from "../../util/toUI.ts";
import playMenu from "../../api/playMenu.ts";

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

test(
	"real game day rolls back staged autoSign before enabled autoflush and retries on the same Cache",
	{ timeout: 15000 },
	async () => {
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

		assert.strictEqual((await idb.cache.games.getAll()).length, 0);
		assert.strictEqual((await idb.cache.schedule.getAll()).length, 4);
		assert.strictEqual(
			(await idb.cache.players.get(freeAgentPid))?.tid,
			PLAYER.FREE_AGENT,
		);
		await new Promise((resolve) => setTimeout(resolve, 4500));
		assert.strictEqual((await idb.league.getAll("games")).length, 0);
		assert.strictEqual((await idb.league.getAll("schedule")).length, 4);
		assert.strictEqual(
			(await readPlayer(freeAgentPid))?.tid,
			PLAYER.FREE_AGENT,
		);

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
	},
);

test("play(3) durably commits each day before continuing", async () => {
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

	assert.strictEqual(checkpointSpy.mock.calls.length, 3);
	assert.strictEqual(flushSpy.mock.calls.length, 4);
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

const cacheSnapshot = async () =>
	structuredClone(
		await Promise.all(STORES.map((store) => idb.cache[store].getAll())),
	);

const prepareDay = () => {
	vi.spyOn(team, "checkRosterSizes").mockResolvedValue(undefined);
	vi.spyOn(trade, "betweenAiTeams").mockResolvedValue(undefined);
	g.setWithoutSavingToDB("injuryRate", 0);
	g.setWithoutSavingToDB("tragicDeathRate", 0);
};

const reopenCache = async () => {
	idb.cache.stopAutoFlush();
	idb.league.close();
	idb.league = await connectLeague(lid);
	idb.cache = new Cache();
	await idb.cache.fill();
};

test("an aborted day transaction restores every cache store and survives reopen/retry", async () => {
	prepareDay();
	const before = await cacheSnapshot();
	const database = idb.league;
	let abort = true;
	// Intercept the facade, not an IDB Proxy method: spying on that method
	// double-wraps transactions and creates an unrelated unobserved done promise.
	idb.league = new Proxy(database, {
		get(target, key) {
			if (key === "transaction") {
				return (...args: any[]) => {
					const tx = (database.transaction as any)(...args);
					if (abort && args[1] === "readwrite") {
						abort = false;
						queueMicrotask(() =>
							(unwrap(tx) as unknown as IDBTransaction).abort(),
						);
					}
					return tx;
				};
			}
			const value = Reflect.get(target, key);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	await expect(play(1, {})).rejects.toThrow();
	expect(await cacheSnapshot()).toEqual(before);
	expect(idb.cache._dirty).toBe(false);
	expect(lock.get("gameSim")).toBe(false);
	await reopenCache();
	expect(await idb.cache.games.getAll()).toHaveLength(0);
	expect(await idb.cache.schedule.getAll()).toHaveLength(4);
	await play(1, {});
	await reopenCache();
	expect(await idb.cache.games.getAll()).toHaveLength(1);
	expect(await idb.cache.schedule.getAll()).toHaveLength(3);
});

test("a put failure after in-place stats mutation restores the untouched player and team totals", async () => {
	prepareDay();
	const before = await cacheSnapshot();
	vi.spyOn(idb.cache.players, "put").mockRejectedValueOnce(
		new Error("player put failed"),
	);
	await expect(play(1, {})).rejects.toThrow("player put failed");
	expect(await cacheSnapshot()).toEqual(before);
	expect(idb.cache._dirty).toBe(false);
	await play(1, {});
	expect(await idb.cache.games.getAll()).toHaveLength(1);
});

test("an injury is published only after durable settlement; failed days discard it and retry persists exactly once", async () => {
	prepareDay();
	const writeStats = playerStats.default;
	let injuredPid: number | undefined;
	vi.spyOn(playerStats, "default").mockImplementation(
		async (results, conditions) => {
			const t = results[0]!.team.find(
				(t: {
					id: number;
					player: { id: number; pendingPostGameInjury?: boolean }[];
				}) => t.id === g.get("userTid"),
			)!;
			const p = t.player[0]!;
			injuredPid = p.id;
			p.pendingPostGameInjury = true;
			return writeStats(results, conditions);
		},
	);
	vi.spyOn(player, "injury").mockReturnValue({
		type: "Sprained Ankle",
		gamesRemaining: 8,
	});
	const published: string[] = [];
	vi.spyOn(uiTransport, "default").mockImplementation((async (
		name: string,
		args: any[],
	) => {
		if (name === "showEvent" && args[0].type === "injuredList") {
			const saved = await readPlayer(injuredPid!);
			expect(saved!.injury).toMatchObject({
				type: "Sprained Ankle",
				gamesRemaining: 8,
			});
			expect(await idb.league.getAll("games")).toHaveLength(1);
			published.push(args[0].type);
		}
	}) as any);
	vi.mocked(trade.betweenAiTeams).mockRejectedValueOnce(
		new Error("settlement failed"),
	);
	const before = await cacheSnapshot();
	await expect(play(1, {})).rejects.toThrow("settlement failed");
	expect(await cacheSnapshot()).toEqual(before);
	expect(published).toHaveLength(0);
	await play(1, {});
	expect(published).toEqual(["injuredList"]);
	await reopenCache();
	expect((await idb.cache.players.get(injuredPid!))!.injury).toMatchObject({
		type: "Sprained Ankle",
		gamesRemaining: 8,
	});
	expect(
		(await idb.cache.players.get(injuredPid!))!.injuries!.filter(
			(i) => i.type === "Sprained Ankle",
		),
	).toHaveLength(1);
});

test("a UI failure after commit refreshes saved scores and retry never repeats the completed gid", async () => {
	prepareDay();
	const publishedGames: any[] = [];
	let failMerge = true;
	vi.spyOn(uiTransport, "default").mockImplementation((async (
		name: string,
		args: any[],
	) => {
		if (name === "mergeGames" && failMerge) {
			failMerge = false;
			throw new Error("score transport failed");
		}
		if (name === "updateLocal" && args[0].games) {
			publishedGames.push(...args[0].games);
		}
	}) as any);
	await expect(play(1, {})).rejects.toThrow("score transport failed");
	const [game] = await idb.league.getAll("games");
	expect(game).toBeDefined();
	expect(publishedGames.find((g) => g.gid === game!.gid).teams[0].pts).toBe(
		game!.teams[0].pts,
	);
	expect(lock.get("gameSim")).toBe(false);
	await play(1, {});
	const games = await idb.league.getAll("games");
	expect(games).toHaveLength(2);
	expect(new Set(games.map((g) => g.gid)).size).toBe(2);
});

test("Stop retains the active request lock until settlement completes and blocks a competing advance", async () => {
	prepareDay();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let entered!: () => void;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	vi.spyOn(freeAgents, "autoSign").mockImplementation(async () => {
		entered();
		await gate;
	});
	const playing = play(3, {});
	await started;
	await playMenu.stop();
	expect(lock.get("gameSim")).toBe(true);
	await play(1, {});
	release();
	await playing;
	expect(lock.get("gameSim")).toBe(false);
	expect(await idb.league.getAll("games")).toHaveLength(1);
});

test("a later failed day preserves earlier committed days without double countdown on retry", async () => {
	prepareDay();
	vi.spyOn(trade, "betweenAiTeams")
		.mockResolvedValueOnce(undefined)
		.mockRejectedValueOnce(new Error("second day failed"));
	await expect(play(3, {})).rejects.toThrow("second day failed");
	expect(await idb.league.getAll("games")).toHaveLength(1);
	expect(await idb.cache.games.getAll()).toHaveLength(1);
	expect(await idb.cache.schedule.getAll()).toHaveLength(3);
	await play(1, {});
	expect(await idb.league.getAll("games")).toHaveLength(2);
});

test("trade-deadline phase failure retains its marker and retry advances once", async () => {
	prepareDay();
	await idb.cache.schedule.clear();
	await idb.cache.schedule.add({ gid: 0, homeTid: -3, awayTid: -3, day: 1 });
	await idb.cache.schedule.add({ gid: 1, homeTid: 0, awayTid: 1, day: 2 });
	await idb.cache.gameAttributes.put({
		key: "phase",
		value: PHASE.REGULAR_SEASON,
	});
	await idb.cache.flush();
	const failFlush = vi
		.spyOn(idb.cache, "flush")
		.mockRejectedValueOnce(new Error("deadline save failed"));
	await expect(play(1, {})).rejects.toThrow("deadline save failed");
	expect((await idb.cache.schedule.get(0))!.homeTid).toBe(-3);
	expect(g.get("phase")).toBe(PHASE.REGULAR_SEASON);
	failFlush.mockRestore();
	await play(1, {});
	expect(await idb.cache.schedule.get(0)).toBeUndefined();
	expect(g.get("phase")).toBe(PHASE.AFTER_TRADE_DEADLINE);
	expect(await idb.cache.games.getAll()).toHaveLength(0);
	expect(lock.get("gameSim")).toBe(false);
});

test("phase autoplay begins only after the phase checkpoint has been released", async () => {
	local.autoPlayUntil = {
		season: g.get("season") + 1,
		phase: PHASE.PRESEASON,
		start: Date.now(),
	};
	const autoplay = vi.spyOn(league, "autoPlay").mockImplementation(async () => {
		const checkpoint = idb.cache.beginMutationCheckpoint();
		checkpoint.commit();
		local.autoPlayUntil = undefined;
	});
	try {
		await phase.newPhase(PHASE.AFTER_TRADE_DEADLINE, {});
		expect(autoplay).toHaveBeenCalledOnce();
		expect(lock.get("newPhase")).toBe(false);
	} finally {
		local.autoPlayUntil = undefined;
	}
});

test("failure to save an injury event aborts the day rather than leaking an unhandled rejection", async () => {
	prepareDay();
	const simulate = (GameSim as typeof BasketballGameSim).prototype.run;
	vi.spyOn(
		(GameSim as typeof BasketballGameSim).prototype,
		"run",
	).mockImplementation(function (this: BasketballGameSim) {
		const result = simulate.call(this);
		result.team[0].player[0]!.pendingPostGameInjury = true;
		return result;
	});
	vi.spyOn(player, "injury").mockReturnValue({
		type: "Sprained Ankle",
		gamesRemaining: 8,
	});
	vi.spyOn(idb.cache.events, "add").mockRejectedValueOnce(
		new Error("injury event failed"),
	);
	const before = await cacheSnapshot();
	await expect(play(1, {})).rejects.toThrow("injury event failed");
	expect(await cacheSnapshot()).toEqual(before);
	expect(await idb.league.getAll("games")).toHaveLength(0);
	expect(lock.get("gameSim")).toBe(false);
	await play(1, {});
	expect(await idb.league.getAll("games")).toHaveLength(1);
});

test("failure to publish the initial lock is observed and leaves simulation unlocked", async () => {
	vi.spyOn(uiTransport, "default").mockRejectedValueOnce(
		new Error("lock transport failed"),
	);
	await expect(lock.canStartGames()).rejects.toThrow("lock transport failed");
	expect(lock.get("gameSim")).toBe(false);
});

test("disabled autosave keeps a successful day in memory without writing it in the background", async () => {
	prepareDay();
	local.autoSave = false;
	await play(1, {});
	expect(await idb.cache.games.getAll()).toHaveLength(1);
	expect(await idb.league.getAll("games")).toHaveLength(0);
	expect(await idb.cache.schedule.getAll()).toHaveLength(3);
	expect(await idb.league.getAll("schedule")).toHaveLength(4);
	expect(idb.cache._dirty).toBe(true);
	local.autoSave = true;
	await idb.cache.flush();
	await reopenCache();
	expect(await idb.cache.games.getAll()).toHaveLength(1);
	expect(await idb.cache.schedule.getAll()).toHaveLength(3);
});

test("the committed day broadcasts deferred player movement with its gameSim refresh", async () => {
	prepareDay();
	const updates: unknown[] = [];
	vi.spyOn(uiTransport, "default").mockImplementation((async (
		name: string,
		args: any[],
	) => {
		if (name === "realtimeUpdate") {
			expect(await idb.league.getAll("games")).toHaveLength(1);
			updates.push(args[0]);
		}
	}) as any);
	await play(1, {});
	expect(updates).toContainEqual(["gameSim", "playerMovement"]);
});

test("failed playoff schedule bootstrap restores the series and empty schedule", async () => {
	prepareDay();
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	await idb.cache.schedule.clear();
	await idb.cache.flush();
	const before = await cacheSnapshot();
	vi.spyOn(season, "newSchedulePlayoffsDay").mockImplementationOnce(
		async () => {
			await idb.cache.playoffSeries.put({
				season: g.get("season"),
				currentRound: 1,
				series: [],
			});
			await idb.cache.schedule.add({ homeTid: 0, awayTid: 1, day: 5 });
			throw new Error("playoff schedule failed");
		},
	);
	await expect(play(1, {})).rejects.toThrow("playoff schedule failed");
	expect(await cacheSnapshot()).toEqual(before);
	expect(idb.cache._dirty).toBe(false);
	expect(lock.get("gameSim")).toBe(false);
});

test("a stale single-game playoff request cannot fall through and simulate another game", async () => {
	prepareDay();
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	const before = await cacheSnapshot();
	await play(1, {}, true, 999999, true);
	expect(await cacheSnapshot()).toEqual(before);
	expect(await idb.league.getAll("games")).toHaveLength(0);
	expect(lock.get("gameSim")).toBe(false);
});
