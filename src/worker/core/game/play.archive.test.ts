import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { deleteDB } from "@dumbmatter/idb";
import { expect, test, vi } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import { PLAYER } from "../../../common/index.ts";
import Cache, { STORES } from "../../db/Cache.ts";
import { connectLeague, idb } from "../../db/index.ts";
import { g, local, lock } from "../../util/index.ts";
import { freeAgents, trade } from "../index.ts";
import play from "./play.ts";

// Optional local fixture: never commit a user's league or modify the source file.
const archivePath = process.env.BBGM_RECOVERY_LEAGUE;
test.skipIf(!archivePath)(
	"the supplied 2019 league advances from an immutable in-memory copy and reopens durably",
	{ timeout: 120_000 },
	async () => {
		const source = await readFile(archivePath!);
		const hash = (data: Uint8Array) =>
			createHash("sha256").update(data).digest("hex");
		const digest = hash(source);
		const data = JSON.parse(gunzipSync(source).toString());
		resetG();
		lock.reset();
		const autoSave = local.autoSave;
		local.autoSave = true;
		const lid = 610_000 + Math.floor(Math.random() * 10_000);
		for (const [key, value] of Object.entries(data.gameAttributes)) {
			// JSON exports represent -Infinity history starts with null.
			if (Array.isArray(value)) {
				for (const row of value) {
					if (
						row &&
						typeof row === "object" &&
						"start" in row &&
						row.start === null
					) {
						row.start = -Infinity;
					}
				}
			}
			g.setWithoutSavingToDB(key as any, value as any);
		}
		g.setWithoutSavingToDB("lid", lid);
		g.setWithoutSavingToDB(
			"teamInfoCache",
			data.teams.map((t: any) => ({
				...t,
				seasons: undefined,
				stats: undefined,
			})),
		);
		idb.league = await connectLeague(lid);
		idb.cache = new Cache();
		try {
			for (const store of STORES) {
				idb.cache._data[store] = {};
				idb.cache._deletes[store] = new Set();
				idb.cache._dirtyRecords[store] = new Set();
				idb.cache._maxIds[store] = -1;
				idb.cache._markDirtyIndexes(store);
			}
			idb.cache._status = "full";
			const rows: Record<string, any[]> = {
				...data,
				gameAttributes: Object.entries(data.gameAttributes).map(
					([key, value]) => ({ key, value }),
				),
				teamSeasons: data.teams.flatMap((t: any) =>
					t.seasons.map((r: any) => ({ ...r, tid: t.tid })),
				),
				teamStats: data.teams.flatMap((t: any) =>
					t.stats.map((r: any) => ({ ...r, tid: t.tid })),
				),
				teams: data.teams.map(({ seasons, stats, ...t }: any) => t),
			};
			for (const p of rows.players!) {
				if (p.retiredYear === null) {
					p.retiredYear = Infinity;
				}
				if (p.diedYear === null) {
					p.diedYear = Infinity;
				}
			}
			for (const store of STORES) {
				for (const row of rows[store] ?? []) {
					await idb.cache[store].add(row);
				}
			}
			await idb.cache.flush(undefined, {
				league: idb.league,
				updateLastPlayed: false,
			});
			const stale = (
				await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
			).filter((p) => p.contract.option && p.contract.exp === g.get("season"));
			expect(stale.map((p) => p.pid).sort((a, b) => a - b)).toEqual([
				267, 1561,
			]);
			const beforeGames = (await idb.cache.games.getAll()).length;
			const beforeSchedule = (await idb.cache.schedule.getAll()).length;
			// Force the real AI signing pass to run for every team; leave GameSim RNG intact.
			const autoSign = freeAgents.autoSign;
			vi.spyOn(freeAgents, "autoSign").mockImplementation(async () => {
				const rng = vi.spyOn(Math, "random").mockReturnValue(0.99);
				try {
					await autoSign();
				} finally {
					rng.mockRestore();
				}
			});
			// Trade randomness is unrelated to the contract failure under investigation.
			vi.spyOn(trade, "betweenAiTeams").mockResolvedValue(undefined);
			await play(1, {});
			expect(lock.get("gameSim")).toBe(false);
			const finished = (await idb.cache.games.getAll()).length - beforeGames;
			expect(finished).toBeGreaterThan(0);
			expect((await idb.cache.schedule.getAll()).length).toBe(
				beforeSchedule - finished,
			);
			for (const p of stale) {
				expect(
					(await idb.cache.players.get(p.pid))!.contract.option,
				).toBeUndefined();
			}
			const games = structuredClone(await idb.cache.games.getAll());
			const schedule = structuredClone(await idb.cache.schedule.getAll());
			idb.league.close();
			idb.league = await connectLeague(lid);
			idb.cache = new Cache();
			await idb.cache.fill();
			expect(await idb.cache.games.getAll()).toEqual(
				games.filter((g) => g.season === data.gameAttributes.season),
			);
			expect(await idb.cache.schedule.getAll()).toEqual(schedule);
			expect(hash(await readFile(archivePath!))).toBe(digest);
			console.info(
				`Archive SHA256 ${digest}; completed ${finished} games; reopened successfully`,
			);
		} finally {
			vi.restoreAllMocks();
			idb.cache.stopAutoFlush();
			idb.league.close();
			await deleteDB(`league${lid}`);
			local.autoSave = autoSave;
			lock.reset();
		}
	},
);
