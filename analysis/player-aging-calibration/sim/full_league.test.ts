/**
 * FULL BBGM league experiment (research only; src/ untouched). Skipped unless FULL_RUN=1.
 *
 * A historical real-players league (default 2005 preseason, rpd = 0) is created with the product's own
 * realRosters.getLeague + league.createStream, loaded like beforeLeague does, and advanced with the
 * product's own Auto Play (local.autoPlayUntil + league.autoPlay): regular season, playoffs, draft
 * lottery, draft (real draft classes), re-signing, free agency, AI trades, contracts, retirement,
 * preseason development, injuries incl. permanent rating losses. spectator=true so every team is AI.
 * The ONLY difference between arms is the developSeason.basketball module, replaced with vi.mock.
 *
 * Paired randomness: Math.random is seeded (mulberry32) identically per seed before creation and before
 * auto play, so arms share the initial league and the first random draws; trajectories diverge after the
 * first development (handled by several seeds and player-level paired analysis).
 *
 * Env: FULL_ARM (official|playground|<candidate>), FULL_SEED, FULL_START (2005), FULL_YEARS (10),
 *      FULL_OUT (analysis/player-aging-calibration/sim/output_full)
 * Run: FULL_RUN=1 FULL_ARM=playground FULL_SEED=1 npx vitest run analysis/player-aging-calibration/sim/full_league.test.ts \
 *        --project basketball --maxWorkers=1 --no-file-parallelism
 */
import "fake-indexeddb/auto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, it, vi } from "vitest";

vi.mock("../../../src/worker/core/player/developSeason.basketball.ts", async () => {
	const arm = process.env.FULL_ARM ?? "playground";
	if (arm === "playground") {
		return await vi.importActual("../../../src/worker/core/player/developSeason.basketball.ts");
	}
	if (arm === "official") {
		return await import("./formulas/official.developSeason.basketball.ts");
	}
	const { CANDIDATES } = await import("./formulas/candidates.ts");
	if (!CANDIDATES[arm]) {
		throw new Error(`unknown FULL_ARM ${arm}`);
	}
	return { default: CANDIDATES[arm] };
});

import { PHASE } from "../../../src/common/constants.ts";
import { idb, connectLeague } from "../../../src/worker/db/index.ts";
import Cache from "../../../src/worker/db/Cache.ts";
import { g, helpers, local, lock } from "../../../src/worker/util/index.ts";
import { league } from "../../../src/worker/core/index.ts";
import realRosters from "../../../src/worker/core/realRosters/index.ts";
import createStreamFromLeagueObject from "../../../src/worker/core/league/create/createStreamFromLeagueObject.ts";
import { getDefaultSettings } from "../../../src/worker/views/newLeague.ts";

const ARM = process.env.FULL_ARM ?? "playground";
const SEED = Number(process.env.FULL_SEED ?? 1);
const START = Number(process.env.FULL_START ?? 2005);
const YEARS = Number(process.env.FULL_YEARS ?? 10);
const OUT = path.resolve(process.cwd(), process.env.FULL_OUT ?? "analysis/player-aging-calibration/sim/output_full");

let rngState = 1;
const seeded = () => {
	rngState = (rngState + 0x6d2b79f5) | 0;
	let t = rngState;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const seedRandom = (seed: number) => {
	rngState = seed | 0;
	Math.random = seeded;
};

const waitFor = async (cond: () => boolean, timeoutMs: number) => {
	const t0 = Date.now();
	while (!cond()) {
		if (Date.now() - t0 > timeoutMs) {
			throw new Error("timeout waiting for auto play");
		}
		await new Promise((r) => setTimeout(r, 200));
	}
};

async function createLeague(lid: number) {
	const getLeagueOptions = {
		type: "real", season: START, phase: PHASE.PRESEASON, randomDebuts: false, randomDebutsKeepCurrent: false,
		realDraftRatings: "rookie", realStats: "none", includePlayers: true,
	} as const;
	const realLeague: any = await realRosters.getLeague(getLeagueOptions);
	const settings: any = { ...getDefaultSettings(), realStats: "none", realPlayerDeterminism: 0, realDraftRatings: "rookie",
		spectator: true, numSeasonsFutureDraftPicks: 4 };
	const keptKeys = new Set([...Object.keys(realLeague).filter((k) => k !== "version" && k !== "meta"), "startingSeason", "version"]);
	await league.createStream(createStreamFromLeagueObject(realLeague), {
		conditions: {}, confs: realLeague.gameAttributes.confs, divs: realLeague.gameAttributes.divs,
		fromFile: { gameAttributes: realLeague.gameAttributes, hasRookieContracts: true, maxGid: undefined,
			startingSeason: realLeague.startingSeason, teams: realLeague.teams, version: undefined },
		getLeagueOptions, keptKeys, lid, name: `aging ${ARM} ${SEED}`, setLeagueCreationStatus: () => {},
		settings, shuffleRosters: false, startingSeasonFromInput: undefined, teamsFromInput: realLeague.teams, tid: 0,
	} as any);
}

async function loadLeague(lid: number) {
	if (idb.cache) {
		idb.cache.stopAutoFlush();
	}
	helpers.resetG();
	idb.league = await connectLeague(lid);
	g.setWithoutSavingToDB("lid", lid);
	idb.cache = new Cache();
	await idb.cache.fill();
	idb.cache.startAutoFlush();
	await league.loadGameAttributes();
	local.leagueLoaded = true;
	await league.setGameAttributes({ spectator: true, realPlayerDeterminism: 0 });
}

async function exportPlayers() {
	await idb.cache.flush();
	const tx = idb.league.transaction(["players"], "readonly");
	const players = await tx.objectStore("players").getAll();
	await tx.done;
	const KEYS = ["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"];
	const STAT = ["gp", "gs", "min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "ast", "tov", "stl", "blk", "pf",
		"fgAtRim", "fgaAtRim", "fgLowPost", "fgaLowPost", "fgMidRange", "fgaMidRange", "per", "ows", "dws", "obpm", "dbpm"];
	return players.map((p: any) => ({
		pid: p.pid, srID: p.srID ?? null, real: !!p.real, born: p.born.year, tid: p.tid, retiredYear: p.retiredYear ?? null,
		draft: { year: p.draft.year, pick: p.draft.pick, round: p.draft.round },
		ratings: p.ratings.map((r: any) => ({ season: r.season, ovr: r.ovr, pot: r.pot, pos: r.pos, locked: !!r.locked, ...Object.fromEntries(KEYS.map((k) => [k, r[k]])) })),
		stats: p.stats.filter((s: any) => !s.playoffs).map((s: any) => ({ season: s.season, tid: s.tid, ...Object.fromEntries(STAT.map((k) => [k, s[k] ?? 0])) })),
		injuries: (p.injuries ?? []).map((i: any) => ({ season: i.season, type: i.type, games: i.games, ovrDrop: i.ovrDrop ?? 0 })),
		contract: p.contract, salaries: (p.salaries ?? []).length,
		transactions: (p.transactions ?? []).map((t: any) => ({ season: t.season, phase: t.phase, tid: t.tid, type: t.type })),
	}));
}

describe.skipIf(process.env.FULL_RUN !== "1")("full league aging experiment", () => {
	it(`arm ${ARM} seed ${SEED}`, async () => {
		const name = `full__${START}__${ARM}__${SEED}.json`;
		if (!existsSync(OUT)) {
			mkdirSync(OUT, { recursive: true });
		}
		if (existsSync(path.join(OUT, `${name}.gz`))) {
			throw new Error(`refusing to overwrite ${name}`);
		}
		const lid = 700000 + (Math.abs(hash(`${ARM}|${SEED}|${START}`)) % 90000);
		seedRandom(1000 + SEED);
		const t0 = Date.now();
		await createLeague(lid);
		await loadLeague(lid);
		const tCreate = (Date.now() - t0) / 1000;
		seedRandom(2000 + SEED);
		const timings: any[] = [];
		for (let y = 0; y < YEARS; y++) {
			const target = g.get("season") + 1;
			const t1 = Date.now();
			local.autoPlayUntil = { season: target, phase: PHASE.PRESEASON, start: Date.now() };
			void league.autoPlay({});
			await waitFor(() => local.autoPlayUntil === undefined && g.get("season") === target && g.get("phase") === PHASE.PRESEASON
				&& !lock.get("newPhase") && !lock.get("gameSim"), 3_600_000);
			// Memory: fake-indexeddb keeps every record in RAM. Box scores, events, feats and messages are not
			// used by this study and are dropped after every season (players, stats, ratings, injuries, teams,
			// contracts and draft data are untouched, so the simulation itself is unaffected).
			for (const store of ["games", "events", "playerFeats", "messages"] as const) {
				await (idb.cache as any)[store].clear();
			}
			await idb.cache.flush();
			{
				const tx = idb.league.transaction(["games", "events", "playerFeats", "messages"], "readwrite");
				for (const store of ["games", "events", "playerFeats", "messages"]) {
					await tx.objectStore(store as any).clear();
				}
				await tx.done;
			}
			const heapBeforeGc = Math.round(process.memoryUsage().heapUsed / 1048576);
			(globalThis as any).gc?.();
			timings.push({ season: target, seconds: (Date.now() - t1) / 1000, heapMB: Math.round(process.memoryUsage().heapUsed / 1048576),
				heapBeforeGcMB: heapBeforeGc, gcExposed: typeof (globalThis as any).gc === "function" });
			if (process.env.FULL_DIAG === "1") {
				// Memory diagnosis: record counts and serialized size of every IndexedDB store, and the size of every
				// collection held by the Cache object, to locate what grows season over season.
				const names = Array.from(idb.league.objectStoreNames) as string[];
				const stores: Record<string, { n: number; mb: number }> = {};
				for (const n of names) {
					const tx = idb.league.transaction([n] as any, "readonly");
					const all = await tx.objectStore(n as any).getAll();
					await tx.done;
					let bytes = 0;
					for (const rec of all) {
						bytes += JSON.stringify(rec)?.length ?? 0;
					}
					stores[n] = { n: all.length, mb: Math.round(bytes / 1048576 * 10) / 10 };
				}
				const sizeOf = (v: any): number => v instanceof Map || v instanceof Set ? v.size : Array.isArray(v) ? v.length
					: v && typeof v === "object" ? Object.keys(v).length : 0;
				const cache: Record<string, number | Record<string, number>> = {};
				for (const [k, v] of Object.entries(idb.cache as any)) {
					if (v && typeof v === "object" && !(v instanceof Map) && !(v instanceof Set) && !Array.isArray(v)
						&& Object.values(v).some((x) => x && typeof x === "object")) {
						cache[k] = Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, sizeOf(vv)]).filter(([, s]) => (s as number) > 0));
					} else {
						cache[k] = sizeOf(v);
					}
				}
				const localSizes = Object.fromEntries(Object.entries(local as any).map(([k, v]) => [k, sizeOf(v)]).filter(([, s]) => (s as number) > 0));
				const tids: Record<string, number> = {};
				for (const p of await idb.cache.players.getAll()) {
					const k = p.tid >= 0 ? "team" : String(p.tid);
					tids[k] = (tids[k] ?? 0) + 1;
				}
				appendFileSync(path.join(OUT, "diag.jsonl"), `${JSON.stringify({ arm: ARM, seed: SEED, season: target, memory: process.memoryUsage(), stores, cache, local: localSizes, tids })}\n`);
			}
			appendFileSync(path.join(OUT, "progress.jsonl"), `${JSON.stringify({ arm: ARM, seed: SEED, ...timings.at(-1) })}\n`);
		}
		const players = await exportPlayers();
		writeFileSync(path.join(OUT, `${name}.gz`), gzipSync(JSON.stringify({ arm: ARM, seed: SEED, start: START, years: YEARS, tCreate, timings, players })), { flag: "wx" });
		idb.cache.stopAutoFlush();
		idb.league.close();
	}, 6 * 3_600_000);
});

function hash(s: string) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	}
	return h | 0;
}
