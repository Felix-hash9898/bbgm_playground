/**
 * Round 9 development candidates (research only; interpreted from sim/formulas/v9_specs.json written by
 * scripts/81_design_v9.py, same formula as scripts/dev9.py).  Playground's base table, age modifiers and change limits,
 * with: symmetric shared noise of reduced share (lam), five ability-group shocks (sg) and per-rating shocks (si), all
 * scaled by Playground's noise sd (5 at <= 25, else 3) and clipped at +-3 sd; lower change limits widened (`widen`);
 * per-rating per-age offsets `off` (Monte-Carlo calibrated) so that the expected change of every rating at every age
 * equals Playground's (plus the V9c composition shift, already folded into `off`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlayerRatings, RatingKey } from "../../../../src/common/types.basketball.ts";
import { realGauss, uniform } from "../../../../src/common/random.ts";
import { coachingEffect } from "../../../../src/common/budgetLevels.ts";

type Key = Exclude<RatingKey, "hgt">;
type Table = { edges: number[]; vals: number[] };
type V9Spec = { lam: number; sg: number; si: number; groups: Record<string, Key[]>; widen: Partial<Record<Key, number>>; off: Record<Key, Record<string, number>>;
	transient?: { share_le25: number; share_older: number; tau_le25: number; tau_older: number } };

const KEYS: Key[] = ["stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"];
const look = (t: Table, age: number) => {
	for (let i = 0; i < t.edges.length; i++) if (age <= t.edges[i]!) return t.vals[i]!;
	return t.vals.at(-1)!;
};
// Playground (src/worker/core/player/developSeason.basketball.ts) tables, identical to scripts/cand_specs.PLAYGROUND
const BASE: Table = { edges: [21, 25, 28, 31, 35, 40, 43], vals: [2, 1, 0, -1, -2, -3, -4, -5] };
const PS: Table = { edges: [28, 31, 35], vals: [0, 0.5, 1.5, 2] };
const PIQ: Table = { edges: [21, 23, 28, 31, 35, 40], vals: [4, 3, 0, 1, 2, 2.5, 2] };
const PATH: Table = { edges: [27, 28, 30, 32, 35, 38, 40], vals: [0, -0.5, -1.5, -1.5, -2.0, -2.5, -3.5, -7.0] };
const MODS: Record<Key, Table> = {
	stre: { edges: [25, 32, 36], vals: [1, 1.5, 0.5, 0] }, spd: PATH, jmp: PATH, endu: { edges: [31, 33, 36, 41], vals: [0, -1, -2, -4, -8] },
	dnk: { edges: [28], vals: [0, 0.5] }, ins: PS, ft: PS, fg: PS, tp: PS, oiq: PIQ, diq: PIQ, drb: PS, pss: PS, reb: PS,
};
const LIMITS: Record<Key, [number, number] | "iq"> = {
	stre: [-8, 12], spd: [-12, 2], jmp: [-12, 2], endu: [-11, 19], dnk: [-3, 13], ins: [-3, 13], ft: [-3, 13], fg: [-3, 13], tp: [-3, 13],
	oiq: "iq", diq: "iq", drb: [-2, 5], pss: [-2, 5], reb: [-2, 5],
};
const clip3 = (z: number) => (z > 3 ? 3 : z < -3 ? -3 : z);
const bound = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const limitRating = (x: number) => (x > 100 ? 100 : x < 0 ? 0 : Math.floor(x));

export const makeV9 = (spec: V9Spec, noiseScale: (age: number) => number = () => 1) => (ratings: PlayerRatings, age: number, coachingLevel: number) => {
	// round 11: coaching effect exactly as production (calcBaseChange): base *= 1 + sign(base) x coachingEffect(level);
	// it is 0 at the default level used by every fixed-roster research loop, so earlier loop results are unchanged
	if (age <= 21) {
		const heightRand = Math.random();
		if (heightRand > 0.99 && age <= 20 && ratings.hgt <= 99) ratings.hgt += 1;
		if (heightRand > 0.999 && ratings.hgt <= 99) ratings.hgt += 1;
	}
	const sd = age <= 25 ? 5 : 3;
	const ns = noiseScale(age);
	let base = look(BASE, age) + spec.lam * ns * sd * clip3(realGauss(0, 1));
	base *= 1 + (base > 0 ? 1 : -1) * coachingEffect(coachingLevel);
	const group: Record<string, number> = {};
	for (const g of Object.keys(spec.groups)) group[g] = spec.sg * ns * sd * clip3(realGauss(0, 1));
	const groupOf: Partial<Record<Key, string>> = {};
	for (const [g, ks] of Object.entries(spec.groups)) for (const k of ks) groupOf[k] = g;
	const a = Math.max(18, Math.min(44, Math.round(age)));
	for (const key of KEYS) {
		let mod = look(MODS[key], age);
		if (key === "endu" && age <= 23) mod = uniform(0, 9);
		const lim = LIMITS[key];
		let [lo, hi] = lim === "iq" ? (age >= 24 ? [-3, 9] : [-3, 7 + 5 * (24 - age)]) : lim;
		lo -= spec.widen[key] ?? 0;
		const idio = spec.si * ns * sd * clip3(realGauss(0, 1));
		const off = spec.off[key]?.[String(a)] ?? 0;
		const d = (base + mod) * uniform(0.4, 1.4) + group[groupOf[key]!]! + idio + off;
		ratings[key] = limitRating(ratings[key] + bound(d, lo, hi));
	}
};

/**
 * Round 9 addendum 3 (`v9t`): permanent / transient split.  The permanent ratings (kept in a WeakMap keyed by the ratings
 * object, which the research loop mutates in place every season) develop with the V9 noise scaled by sqrt(1 - s(age));
 * the DISPLAYED ratings seen by GameSim and OVR are permanent + a fresh group shock N(0, tau(age) * sdPG(age)) per ability
 * group, rounded (not carried to the next season).  s = 0.4 at <= 25, 0.2 older (fixed a priori).
 */
export const makeV9T = (spec: V9Spec) => {
	const tr = spec.transient!;
	const share = (age: number) => (age <= 25 ? tr.share_le25 : tr.share_older);
	const develop = makeV9(spec, (age) => Math.sqrt(1 - share(age)));
	const perm = new WeakMap<PlayerRatings, PlayerRatings>();
	return (ratings: PlayerRatings, age: number, coachingLevel: number) => {
		const p = perm.get(ratings) ?? { ...ratings };
		develop(p, age, coachingLevel);
		const sd = (age <= 25 ? 5 : 3) * (age <= 25 ? tr.tau_le25 : tr.tau_older);
		ratings.hgt = p.hgt;
		for (const keys of Object.values(spec.groups)) {
			const t = sd * clip3(realGauss(0, 1));
			for (const k of keys) {
				const x = Math.round(p[k] + t);
				ratings[k] = x > 100 ? 100 : x < 0 ? 0 : x;
			}
		}
		perm.set(ratings, p);
	};
};

const SPEC_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "v9_specs.json");
const specs: Record<string, V9Spec> = JSON.parse(readFileSync(SPEC_FILE, "utf8"));
export const V9 = Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, v.transient ? makeV9T(v) : makeV9(v)]));
