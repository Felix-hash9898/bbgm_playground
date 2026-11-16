/**
 * Player-aging calibration research harness (research only; imports product modules read-only and
 * never modifies src/). Skipped unless AGING_RUN=1.
 *
 * Every arm uses the SAME engine (this worktree == bbgm_playground 363bcbc6: GameSim, loadTeams,
 * minutes, injuries) and differs ONLY in the developSeason formula. Controls:
 *   realPlayerDeterminism = 0 (the formula functions are called directly; no real-player blending)
 *   coaching level = DEFAULT_LEVEL for every team (coachingEffect = 0)
 *   scouting fuzz is irrelevant: GameSim/minutes use true ovr via valueNoPot (spectator=true, so no
 *     user team and no fuzzed user roster order)
 *   locked ratings are respected (not developed)
 *   identical initial rosters, schedule seed and per-replicate game seeds across arms
 *
 * Modes (AGING_MODE):
 *   port_check  : distribution of one-season rating changes of every formula on fixed archetypes, to
 *                 validate the Python ports (scripts/bbgm_dev.py)
 *   step        : one offseason of development on real-roster preseason saves, then one regular
 *                 season of GameSim; arm "none" = no development (age unchanged)
 *   population  : multi-year league population model (development + BBGM retirement rule + draft
 *                 generation through the same formula + roster selection by value), ratings only,
 *                 with a GameSim season at the cross-section years (AGING_XS_YEARS)
 *
 * Env: AGING_ARMS, AGING_SAVES, AGING_SEEDS, AGING_OUT (default analysis/player-aging-calibration/sim/output),
 *      AGING_YEARS (population), AGING_XS_YEARS (population), AGING_MAX_DAYS (smoke only)
 * Run (one process, per AGENTS.md):
 *   AGING_RUN=1 AGING_MODE=step npx vitest run analysis/player-aging-calibration/sim/aging_arms.test.ts \
 *     --project basketball --maxWorkers=1 --no-file-parallelism
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";
import type { Player } from "../../../src/common/types.ts";
import type { PlayerRatings } from "../../../src/common/types.basketball.ts";
import { PHASE } from "../../../src/common/constants.ts";
import { DEFAULT_LEVEL } from "../../../src/common/budgetLevels.ts";
import { resetCache, resetG } from "../../../src/test/helpers.ts";
import GameSim from "../../../src/worker/core/GameSim.basketball/index.ts";
import loadTeams from "../../../src/worker/core/game/loadTeams.ts";
import writePlayerStats from "../../../src/worker/core/game/writePlayerStats.ts";
import addDaysToSchedule from "../../../src/worker/core/season/addDaysToSchedule.ts";
import newScheduleGood from "../../../src/worker/core/season/newScheduleGood.ts";
import rosterAutoSort from "../../../src/worker/core/team/rosterAutoSort.ts";
import updateValues from "../../../src/worker/core/player/updateValues.ts";
import ovrFn from "../../../src/worker/core/player/ovr.basketball.ts";
import posFn from "../../../src/worker/core/player/pos.basketball.ts";
import genRatings from "../../../src/worker/core/player/genRatings.basketball.ts";
import valueCombineOvrPot from "../../../src/worker/core/player/valueCombineOvrPot.ts";
import { idb } from "../../../src/worker/db/index.ts";
import { g, local } from "../../../src/worker/util/index.ts";
import defaultInjuries from "../../../src/worker/util/defaultInjuries.ts";
import { FORMULAS } from "./formulas/index.ts";

const MODE = process.env.AGING_MODE ?? "step";
const list = (s: string | undefined, d: string) => (s ?? d).split(",").map((x) => x.trim()).filter(Boolean);
const ARMS = list(process.env.AGING_ARMS, MODE === "step" ? "none,official,playground" : "official,playground");
const SEEDS = list(process.env.AGING_SEEDS, "1001,2002").map(Number);
const SAVES = list(
	process.env.AGING_SAVES,
	"BBGM_League_11_2022_preseason.json.gz,BBGM_League_10_2023_preseason.json.gz,BBGM_League_9_2024_preseason.json.gz,BBGM_League_8_2025_preseason.json.gz,BBGM_League_8_2026_preseason.json.gz",
);
const OUT = path.resolve(process.cwd(), process.env.AGING_OUT ?? "analysis/player-aging-calibration/sim/output");
const MAX_DAYS = process.env.AGING_MAX_DAYS ? Number(process.env.AGING_MAX_DAYS) : Infinity;
const YEARS = Number(process.env.AGING_YEARS ?? 30);
const XS_YEARS = list(process.env.AGING_XS_YEARS, "12,13,24,25").map(Number);
const CONTROL_FRAC = Number(process.env.AGING_CONTROL_FRAC ?? 0); // step: share of players kept undeveloped (DiD control)
const TAG = process.env.AGING_TAG ?? (CONTROL_FRAC > 0 ? "step2" : "step");
const RATING_KEYS = ["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"] as const;

for (const arm of ARMS) {
	if (arm !== "none" && !FORMULAS[arm]) {
		throw new Error(`Unknown arm ${arm}; known: ${Object.keys(FORMULAS).join(",")}`);
	}
}

// mulberry32 (full 2^32 period), replaces Math.random so product modules are seeded too
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
const hashStr = (s: string) => {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	}
	return h >>> 0;
};

const writeOnce = (name: string, content: string) => {
	if (!existsSync(OUT)) {
		mkdirSync(OUT, { recursive: true });
	}
	const file = path.join(OUT, `${name}.gz`);
	if (existsSync(file)) {
		throw new Error(`Refusing to overwrite ${file}`);
	}
	writeFileSync(file, gzipSync(content), { flag: "wx" });
};

const readSave = (file: string) =>
	JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "real_saves", file))).toString("utf8"));

const gaOf = (save: any) =>
	Array.isArray(save.gameAttributes)
		? Object.fromEntries(save.gameAttributes.map((x: any) => [x.key, x.value]))
		: save.gameAttributes;

function resetGFromSave(save: any) {
	const ga = gaOf(save);
	resetG();
	Object.assign(g, structuredClone(ga));
	g.setWithoutSavingToDB("season", ga.season);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	g.setWithoutSavingToDB("injuries", structuredClone(defaultInjuries));
	g.setWithoutSavingToDB("spectator", true); // all teams AI-managed: no user rotation, no fuzzed order
	g.setWithoutSavingToDB("realPlayerDeterminism", 0);
}

const STAT_KEYS = ["gp", "gs", "min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "ast", "tov", "stl", "blk", "pf", "pm",
	"fgAtRim", "fgaAtRim", "fgLowPost", "fgaLowPost", "fgMidRange", "fgaMidRange"] as const;

/** Simulate one regular season with every team AI-controlled; returns per-player season totals. */
async function simSeason(save: any, players: Player[], seed: number, tag: string, afterSort?: () => Promise<void>) {
	const season = gaOf(save).season as number;
	const teamInputs = save.teams.filter((t: any) => t.tid >= 0 && !t.disabled)
		.map((t: any) => ({ tid: t.tid, seasonAttrs: { cid: t.cid, did: t.did } }));
	seedRandom(81231 + season); // same schedule in every arm/seed
	const generated = newScheduleGood(teamInputs);
	const schedule = addDaysToSchedule(
		generated.tids.map(([homeTid, awayTid]: [number, number]) => ({ homeTid, awayTid })), []);
	const teamRecords = structuredClone(save.teams);
	await resetCache({
		players,
		teams: teamRecords,
		teamSeasons: teamRecords.flatMap((t: any) => t.seasons),
		teamStats: teamRecords.flatMap((t: any) => t.stats),
	});
	seedRandom(seed);
	local.playerOvrMeanStdStale = true;
	for (const p of await idb.cache.players.getAll()) {
		await updateValues(p);
		await idb.cache.players.put(p);
	}
	for (const t of teamInputs) {
		await rosterAutoSort(t.tid);
	}
	if (afterSort) {
		await afterSort(); // jacobian mode: perturb AFTER values/roster order are fixed
	}
	const byDay = new Map<number, typeof schedule>();
	for (const gm of schedule) {
		const arr = byDay.get(gm.day) ?? [];
		arr.push(gm);
		byDay.set(gm.day, arr);
	}
	const tot = new Map<number, Record<string, number>>();
	const conditions: any = {};
	let gid = 0;
	let days = 0;
	const t0 = performance.now();
	for (const [day, games] of byDay) {
		if (days++ >= MAX_DAYS) {
			break;
		}
		for (const gm of games) {
			const teams = await loadTeams([gm.homeTid, gm.awayTid], conditions);
			const result = new GameSim({
				gid, day, teams: [teams[gm.homeTid]!, teams[gm.awayTid]!],
				baseInjuryRate: g.get("injuryRate"), doPlayByPlay: false, homeCourtFactor: 1,
				allStarGame: false, neutralSite: false,
			}).run();
			for (const t of result.team) {
				for (const p of t.player as any[]) {
					const row = tot.get(p.id) ?? Object.fromEntries([...STAT_KEYS.map((k) => [k, 0]), ...STAT_KEYS.map((k) => [`h1_${k}`, 0]), ["tid", t.id], ["injGames", 0]]);
					if (p.stat.min > 0) {
						row.gp! += 1;
						const odd = row.gp! % 2 === 1; // split-half: odd vs even appearance of this player
						for (const k of STAT_KEYS) {
							if (k !== "gp") {
								row[k]! += p.stat[k] ?? 0;
								if (odd) {
									row[`h1_${k}`]! += p.stat[k] ?? 0;
								}
							}
						}
						if (odd) {
							row.h1_gp! += 1;
						}
					} else if (p.injured) {
						row.injGames! += 1;
					}
					tot.set(p.id, row);
				}
			}
			await writePlayerStats([result], conditions);
			gid++;
		}
		for (const p of await idb.cache.players.getAll()) {
			if (p.injury.gamesRemaining > 0) {
				if (p.injury.skipDailyCountdown) {
					delete p.injury.skipDailyCountdown;
				} else {
					p.injury.gamesRemaining--;
				}
				if (p.injury.type !== "Healthy" && p.injury.gamesRemaining <= 0) {
					p.injury = { type: "Healthy", gamesRemaining: 0 };
				}
				await idb.cache.players.put(p);
			}
		}
	}
	// end-of-season ratings (after any permanent injury losses) and value
	const endRatings = new Map<number, any>();
	for (const p of await idb.cache.players.getAll()) {
		endRatings.set(p.pid, { ovrEnd: p.ratings.at(-1)!.ovr, valueNoPot: p.valueNoPot, rosterOrder: p.rosterOrder });
	}
	console.log(JSON.stringify({ tag, games: gid, seconds: Math.round((performance.now() - t0) / 100) / 10 }));
	return { tot, endRatings, season };
}

const developInPlace = (r: PlayerRatings, age: number, arm: string) => {
	FORMULAS[arm]!(r, age, DEFAULT_LEVEL);
	r.ovr = ovrFn(r);
};

// ------------------------------------------------------------------ port_check
async function portCheck() {
	const archetypes: Record<string, Record<string, number>> = {
		avg: { hgt: 47, stre: 50, spd: 50, jmp: 50, endu: 45, ins: 45, dnk: 50, ft: 50, fg: 50, tp: 50, oiq: 50, diq: 50, drb: 50, pss: 50, reb: 50 },
		star: { hgt: 55, stre: 60, spd: 70, jmp: 70, endu: 70, ins: 60, dnk: 75, ft: 80, fg: 75, tp: 75, oiq: 80, diq: 70, drb: 75, pss: 70, reb: 55 },
		low: { hgt: 40, stre: 35, spd: 40, jmp: 40, endu: 30, ins: 30, dnk: 35, ft: 35, fg: 35, tp: 30, oiq: 30, diq: 30, drb: 35, pss: 35, reb: 40 },
	};
	const N = 20000;
	const rows: string[] = ["arm,archetype,age,key,mean,sd,q05,q50,q95"];
	for (const arm of ARMS.filter((a) => a !== "none")) {
		for (const [an, base] of Object.entries(archetypes)) {
			for (let age = 19; age <= 40; age++) {
				seedRandom(hashStr(`${arm}${an}${age}`));
				const d: Record<string, number[]> = {};
				for (let i = 0; i < N; i++) {
					const r = { ...base } as any;
					const o0 = ovrFn(r);
					FORMULAS[arm]!(r, age, DEFAULT_LEVEL);
					for (const k of [...RATING_KEYS, "ovr"]) {
						(d[k] ??= []).push(k === "ovr" ? ovrFn(r) - o0 : r[k] - (base as any)[k]);
					}
				}
				for (const [k, v] of Object.entries(d)) {
					v.sort((a, b) => a - b);
					const mean = v.reduce((a, b) => a + b, 0) / N;
					const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / N);
					rows.push([arm, an, age, k, mean.toFixed(4), sd.toFixed(4), v[Math.floor(0.05 * N)], v[Math.floor(0.5 * N)], v[Math.floor(0.95 * N)]].join(","));
				}
			}
		}
	}
	writeOnce(`port_check__${ARMS.join("+")}.csv`, `${rows.join("\n")}\n`);
}

// ------------------------------------------------------------------ step
async function stepMode() {
	const header = ["save", "arm", "seed", "pid", "srID", "tid", "season", "born_sim", "age_sim", "dev_years", "locked",
		...RATING_KEYS.map((k) => `r_${k}`), "ovr", "ovrEnd", "valueNoPot", "rosterOrder", "injGames", ...STAT_KEYS, "control",
		...STAT_KEYS.map((k) => `h1_${k}`)].join(",");
	for (const file of SAVES) {
		const save = readSave(file);
		const season = gaOf(save).season as number;
		for (const arm of ARMS) {
			for (const seed of SEEDS) {
				const name = `${TAG}__${file.replace(".json.gz", "")}__${arm}__${seed}.csv`;
				if (existsSync(path.join(OUT, `${name}.gz`))) {
					console.log(`skip existing ${name}`);
					continue;
				}
				resetGFromSave(save);
				const players = (structuredClone(save.players) as Player[]).filter((p) => p.tid >= -1);
				// development draws: step = per (save, seed); step2 = per save only, so every game seed shares
				// the SAME developed ratings (signal/noise separable) and all formulas start the same RNG stream
				seedRandom(hashStr(CONTROL_FRAC > 0 ? `${file}|dev` : `${file}|dev|${seed}`));
				const isControl = (pid: number) => CONTROL_FRAC > 0 && (hashStr(`${file}|ctl|${pid}`) % 10000) / 10000 < CONTROL_FRAC;
				for (const p of players) {
					const r = p.ratings.at(-1)! as any;
					if (arm !== "none" && !r.locked && !isControl(p.pid)) {
						const age = season - p.born.year + 1;
						developInPlace(r, age, arm);
						p.born.year -= 1; // one year older, one offseason of development
					}
					(p as any).form = 0;
					delete (p as any).gameForm;
				}
				const { tot, endRatings } = await simSeason(save, players, seed, `${file}|${arm}|${seed}`);
				const rows: string[] = [];
				for (const p of players) {
					if (p.tid < 0) {
						continue;
					}
					const r = p.ratings.at(-1)! as any;
					const s = tot.get(p.pid);
					const e = endRatings.get(p.pid) ?? {};
					rows.push([file, arm, seed, p.pid, p.srID ?? "", p.tid, season, p.born.year, season - p.born.year, arm === "none" ? 0 : 1,
						r.locked ? 1 : 0, ...RATING_KEYS.map((k) => r[k]), r.ovr, e.ovrEnd ?? "", (e.valueNoPot ?? 0).toFixed(2),
						e.rosterOrder ?? "", s?.injGames ?? 0, ...STAT_KEYS.map((k) => s?.[k] ?? 0), isControl(p.pid) ? 1 : 0,
						...STAT_KEYS.map((k) => s?.[`h1_${k}`] ?? 0)].join(","));
				}
				writeOnce(name, `${header}\n${rows.join("\n")}\n`);
			}
		}
	}
}

// ------------------------------------------------------------------ population
type PopPlayer = {
	pid: number; born: number; r: any; ovr: number; pot: number; value: number; maxOvr: number;
	rostered: boolean; yearsFA: number; draftYear: number; origin: string; retired?: number; template?: Player;
};

const monteCarloPotArm = (r: any, age: number, arm: string) => {
	if (age >= 29) {
		return r.ovr;
	}
	const maxOvrs: number[] = [];
	for (let i = 0; i < 20; i++) {
		const c = { ...r };
		let maxOvr = r.ovr;
		for (let a = age + 1; a < 30; a++) {
			FORMULAS[arm]!(c, a, DEFAULT_LEVEL);
			maxOvr = Math.max(maxOvr, ovrFn(c));
		}
		maxOvrs.push(maxOvr);
	}
	return maxOvrs.sort((a, b) => a - b)[Math.floor(0.75 * 20)]!;
};

const valueStatsFree = (ovr: number, pot: number, age: number, mean: number, std: number) => {
	const o = ((ovr - mean) / std) * 10 + 47;
	let p = ((pot - mean) / std) * 10 + 47;
	if (o >= p) {
		p = o;
	}
	const v = valueCombineOvrPot(o, p, age);
	return v < 0 ? Number.MIN_VALUE : v;
};

async function populationMode() {
	const file = SAVES[0]!;
	const save = readSave(file);
	const startSeason = gaOf(save).season as number;
	const header = ["arm", "seed", "year", "season", "pid", "origin", "draftYear", "born", "age", "ovr", "pot", "value", "rostered", "retiredNow",
		...RATING_KEYS.map((k) => `r_${k}`)].join(",");
	for (const arm of ARMS) {
		for (const seed of SEEDS) {
			const name = `population__${file.replace(".json.gz", "")}__${arm}__${seed}.csv`;
			if (existsSync(path.join(OUT, `${name}.gz`))) {
				console.log(`skip existing ${name}`);
				continue;
			}
			seedRandom(hashStr(`${file}|pop|${arm}|${seed}`));
			resetGFromSave(save);
			const templates = (save.players as Player[]).filter((p) => p.tid >= 0);
			let nextPid = 1_000_000;
			const pop: PopPlayer[] = (save.players as Player[]).filter((p) => p.tid >= -1).map((p) => {
				const r = { ...p.ratings.at(-1)! } as any;
				return { pid: p.pid, born: p.born.year, r, ovr: r.ovr, pot: r.pot, value: 0, maxOvr: Math.max(...p.ratings.map((x: any) => x.ovr)),
					rostered: p.tid >= 0, yearsFA: p.tid === -1 ? 1 : 0, draftYear: p.draft.year, origin: "real", template: p };
			});
			const rows: string[] = [];
			const dump = (year: number, season: number, retiredNow: Set<number>) => {
				for (const p of pop) {
					if (p.retired !== undefined && !retiredNow.has(p.pid)) {
						continue;
					}
					rows.push([arm, seed, year, season, p.pid, p.origin, p.draftYear, p.born, season - p.born, p.ovr, p.pot, p.value.toFixed(2),
						p.rostered ? 1 : 0, retiredNow.has(p.pid) ? 1 : 0, ...RATING_KEYS.map((k) => p.r[k])].join(","));
				}
			};
			const genClass = (season: number) => {
				// genPlayersWithoutSaving logic: 70 prospects generated at 19, 50% of the remaining (sorted by
				// pot + fudge) declare each year, the rest develop one more season with the SAME arm formula
				let remaining = Array.from({ length: 70 }, () => {
					const { ratings } = genRatings(season, DEFAULT_LEVEL);
					const r = ratings as any;
					r.ovr = ovrFn(r);
					return { r, age: 19, fudge: Math.floor(Math.random() * 101) - 50, pot: monteCarloPotArm(r, 19, arm) };
				});
				const entering: typeof remaining = [];
				for (let i = 0; i < 4; i++) {
					const cutoff = i === 3 ? remaining.length : Math.round(0.5 * remaining.length);
					remaining.sort((a, b) => b.pot + b.fudge - (a.pot + a.fudge));
					entering.push(...remaining.slice(0, cutoff));
					remaining = remaining.slice(cutoff);
					for (const q of remaining) {
						q.age += 1;
						developInPlace(q.r, q.age, arm);
						q.pot = monteCarloPotArm(q.r, q.age, arm);
					}
				}
				return entering.map((q) => ({ pid: nextPid++, born: season - q.age, r: q.r, ovr: q.r.ovr, pot: q.pot, value: 0, maxOvr: q.r.ovr,
					rostered: false, yearsFA: 0, draftYear: season, origin: "generated" }) as PopPlayer);
			};
			const revalue = (season: number) => {
				const active = pop.filter((p) => p.retired === undefined);
				const ovrs = active.map((p) => p.ovr);
				const mean = ovrs.reduce((a, b) => a + b, 0) / ovrs.length;
				const std = Math.sqrt(ovrs.reduce((a, b) => a + (b - mean) ** 2, 0) / ovrs.length);
				for (const p of active) {
					p.value = valueStatsFree(p.ovr, p.pot, season - p.born, mean, std);
				}
			};
			const rosterSelect = () => {
				const active = pop.filter((p) => p.retired === undefined).sort((a, b) => b.value - a.value);
				active.forEach((p, i) => {
					const was = p.rostered;
					p.rostered = i < 30 * 15;
					p.yearsFA = p.rostered ? 0 : was ? 0 : p.yearsFA + 1;
				});
			};
			const xsYears = new Set(XS_YEARS);
			const teamOf = new Map<number, number>(); // persistent team membership across cross-section years
			revalue(startSeason);
			dump(0, startSeason, new Set());
			for (let year = 1; year <= YEARS; year++) {
				const season = startSeason + year;
				// preseason development
				for (const p of pop) {
					if (p.retired !== undefined) {
						continue;
					}
					developInPlace(p.r, season - p.born, arm);
					p.ovr = p.r.ovr;
					p.pot = monteCarloPotArm(p.r, season - p.born, arm);
					p.maxOvr = Math.max(p.maxOvr, p.ovr);
				}
				revalue(season);
				if (xsYears.has(year)) {
					await crossSection(save, pop, arm, seed, year, season, templates, teamOf);
					resetGFromSave(save);
				}
				// retirement (shouldRetire, basketball branch, ws=0 so max(ws, estWS) = estWS)
				const retiredNow = new Set<number>();
				for (const p of pop) {
					if (p.retired !== undefined) {
						continue;
					}
					const age = season - p.born;
					let retire = false;
					if (age >= 26) {
						const pot = 1.1 * p.value;
						if (age > 33 || (pot < 40 && !p.rostered)) {
							const estWS = (1 / 85.017) * (Math.max(pot, 37) - 37) ** 2;
							const logit = -1.4134 + (1 / 175.19) * (Math.max(age, 18) - 18) ** 2 - 0.971 * estWS;
							const prob = Math.exp(logit) / (1 + Math.exp(logit));
							if (prob > Math.random()) {
								retire = true;
							} else if (age > 33) {
								const frac = p.ovr / p.maxOvr;
								if (frac < 0.7 && 0.2 + (0.7 - frac) > Math.random()) {
									retire = true;
								}
							}
						}
					}
					if (!p.rostered && p.yearsFA >= 1) {
						retire = true;
					}
					if (retire) {
						p.retired = season;
						retiredNow.add(p.pid);
					}
				}
				dump(year, season, retiredNow);
				pop.push(...genClass(season));
				revalue(season);
				rosterSelect();
			}
			writeOnce(name, `${header}\n${rows.join("\n")}\n`);
		}
	}
}

/**
 * GameSim season on the population's rostered players. Team membership persists across
 * cross-section years (teamOf): continuing players stay on their team, open spots are filled by
 * the remaining rostered players in value order, each going to the team with the fewest players
 * (ties: lowest total value), so consecutive cross-sections form a delta-method panel like the NBA.
 */
async function crossSection(save: any, pop: PopPlayer[], arm: string, seed: number, year: number, season: number, templates: Player[], teamOf: Map<number, number>) {
	const name = `xs__${SAVES[0]!.replace(".json.gz", "")}__${arm}__${seed}__y${year}.csv`;
	if (existsSync(path.join(OUT, `${name}.gz`))) {
		return;
	}
	const ga = gaOf(save);
	const rostered = pop.filter((p) => p.retired === undefined && p.rostered).sort((a, b) => b.value - a.value);
	const tids = save.teams.filter((t: any) => t.tid >= 0 && !t.disabled).map((t: any) => t.tid as number);
	const count = new Map<number, number>(tids.map((t: number) => [t, 0]));
	const tvalue = new Map<number, number>(tids.map((t: number) => [t, 0]));
	const assigned = new Map<number, number>();
	for (const pp of rostered) {
		const t = teamOf.get(pp.pid);
		if (t !== undefined && count.get(t)! < 15) {
			assigned.set(pp.pid, t);
			count.set(t, count.get(t)! + 1);
			tvalue.set(t, tvalue.get(t)! + pp.value);
		}
	}
	for (const pp of rostered) {
		if (assigned.has(pp.pid)) {
			continue;
		}
		const t = [...tids].sort((a, b) => count.get(a)! - count.get(b)! || tvalue.get(a)! - tvalue.get(b)!)[0]!;
		assigned.set(pp.pid, t);
		count.set(t, count.get(t)! + 1);
		tvalue.set(t, tvalue.get(t)! + pp.value);
	}
	teamOf.clear();
	for (const [pid, t] of assigned) {
		teamOf.set(pid, t);
	}
	const players: Player[] = rostered.map((pp, i) => {
		const tid = assigned.get(pp.pid)!;
		const tpl = (pp.template ?? templates[pp.pid % templates.length]!) as Player;
		const p = structuredClone(tpl) as any;
		p.pid = pp.pid;
		p.tid = tid;
		p.srID = pp.origin === "real" ? tpl.srID : undefined;
		p.born = { ...tpl.born, year: pp.born - (season - ga.season) }; // simulated age at the save season
		const r = { ...tpl.ratings.at(-1)!, ...pp.r, season: ga.season, ovr: pp.ovr, pot: pp.pot, locked: false } as any;
		r.pos = posFn(r);
		p.ratings = [r];
		p.stats = [];
		p.injury = { type: "Healthy", gamesRemaining: 0 };
		p.injuries = [];
		p.rosterOrder = i;
		p.form = 0;
		return p as Player;
	});
	const { tot } = await simSeason(save, players, seed, `xs|${arm}|${seed}|y${year}`);
	const header = ["arm", "seed", "year", "pid", "origin", "age", "ovr", "value", "tid", ...STAT_KEYS, "injGames"].join(",");
	const rows = rostered.map((pp) => {
		const s = tot.get(pp.pid);
		return [arm, seed, year, pp.pid, pp.origin, season - pp.born, pp.ovr, pp.value.toFixed(2), assigned.get(pp.pid),
			...STAT_KEYS.map((k) => s?.[k] ?? 0), s?.injGames ?? 0].join(",");
	});
	writeOnce(name, `${header}\n${rows.join("\n")}\n`);
}

// ------------------------------------------------------------------ jacobian (GameSim mechanism probes)
// A random third of rostered players is perturbed AFTER valueNoPot and roster order are computed, so the
// rotation/minutes inputs are frozen and only GameSim's response to the ratings is measured.
//   <rating>  : +AGING_PERTURB_SIZE (default 8) to that single rating
//   young21 / old33 : the Playground formula's mean one-year change vector at that age (50-draw mean)
//   minutes   : valueNoPot + size (more trust / minutes), ratings unchanged
//   base      : no perturbation (paired control)
const PERTURBS = list(process.env.AGING_PERTURB, "base,tp,fg,ins,dnk,oiq,drb,pss,spd,jmp,stre,hgt,ft,diq,young21,old33,minutes");
const PERTURB_SIZE = Number(process.env.AGING_PERTURB_SIZE ?? 8);
async function jacobianMode() {
	const header = ["save", "perturb", "seed", "pid", "srID", "tid", "age", "treated", ...RATING_KEYS.map((k) => `r_${k}`), "ovr", "valueNoPot",
		...STAT_KEYS].join(",");
	for (const file of SAVES) {
		const save = readSave(file);
		const season = gaOf(save).season as number;
		for (const pert of PERTURBS) {
			for (const seed of SEEDS) {
				const name = `jac__${file.replace(".json.gz", "")}__${pert}__${seed}.csv`;
				if (existsSync(path.join(OUT, `${name}.gz`))) {
					continue;
				}
				resetGFromSave(save);
				const players = (structuredClone(save.players) as Player[]).filter((p) => p.tid >= -1);
				const treated = (pid: number) => hashStr(`${file}|jac|${pid}`) % 3 === 0;
				for (const p of players) {
					(p as any).form = 0;
				}
				const after = async () => {
					if (pert === "base") {
						return;
					}
					for (const p of await idb.cache.players.getAll()) {
						if (!treated(p.pid) || p.tid < 0) {
							continue;
						}
						const r = p.ratings.at(-1)! as any;
						if (pert === "minutes") {
							p.valueNoPot += PERTURB_SIZE; // (found inert: Playground rotation minutes use the stored ovr, not valueNoPot)
						} else if (pert === "rolemin") {
							r.ovr += PERTURB_SIZE; // stored ovr only -> rotation minutes rise, ratings unchanged
						} else if (pert === "young21" || pert === "old33" || pert === "young21free" || pert === "old33free"
							|| pert === "young21sorted" || pert === "old33sorted") {
							const age = pert.startsWith("young21") ? 21 : 33;
							const acc: Record<string, number> = {};
							const keep = Math.random;
							seedRandom(hashStr(`${file}|jacdev|${p.pid}`));
							for (let i = 0; i < 50; i++) {
								const c = { ...r };
								FORMULAS.playground!(c, age, DEFAULT_LEVEL);
								for (const k of RATING_KEYS) {
									acc[k] = (acc[k] ?? 0) + (c[k] - r[k]) / 50;
								}
							}
							Math.random = keep;
							for (const k of RATING_KEYS) {
								if (k !== "hgt") {
									r[k] = Math.max(0, Math.min(100, r[k] + acc[k]!));
								}
							}
							if (pert.endsWith("free") || pert.endsWith("sorted")) {
								r.ovr = ovrFn(r); // stored ovr follows the new ratings
							}
						} else {
							r[pert] = Math.max(0, Math.min(100, r[pert] + PERTURB_SIZE));
						}
						await idb.cache.players.put(p);
					}
					if (pert.endsWith("sorted")) {
						// as after a real offseason: values and roster order (the main minutes signal) are recomputed
						local.playerOvrMeanStdStale = true;
						for (const p of await idb.cache.players.getAll()) {
							await updateValues(p);
							await idb.cache.players.put(p);
						}
						for (const t of save.teams.filter((t: any) => t.tid >= 0 && !t.disabled)) {
							await rosterAutoSort(t.tid);
						}
					}
				};
				const { tot } = await simSeason(save, players, seed, `jac|${file}|${pert}|${seed}`, after);
				const fin = new Map((await idb.cache.players.getAll()).map((p) => [p.pid, p]));
				const rows: string[] = [];
				for (const p0 of players) {
					if (p0.tid < 0) {
						continue;
					}
					const p = fin.get(p0.pid)!;
					const r = p.ratings.at(-1)! as any;
					const st = tot.get(p.pid);
					rows.push([file, pert, seed, p.pid, p.srID ?? "", p.tid, season - p.born.year, treated(p.pid) ? 1 : 0,
						...RATING_KEYS.map((k) => Math.round(r[k] * 100) / 100), r.ovr, p.valueNoPot.toFixed(2),
						...STAT_KEYS.map((k) => st?.[k] ?? 0)].join(","));
				}
				writeOnce(name, `${header}\n${rows.join("\n")}\n`);
			}
		}
	}
}

describe.skipIf(process.env.AGING_RUN !== "1")("player aging calibration harness", () => {
	it(`mode ${MODE}`, async () => {
		if (MODE === "port_check") {
			await portCheck();
		} else if (MODE === "step") {
			await stepMode();
		} else if (MODE === "population") {
			await populationMode();
		} else if (MODE === "jacobian") {
			await jacobianMode();
		} else {
			throw new Error(`unknown AGING_MODE ${MODE}`);
		}
	}, 6 * 3_600_000);
});
