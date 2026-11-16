/**
 * Data-driven candidate development formulas (research only). Specs are JSON written by
 * scripts/09_design_candidates.py (sim/formulas/candidate_specs.json) and interpreted identically by
 * the Python emulator (scripts/cand_specs.py). Structure is BBGM's:
 *   base = table(age) + bound(realGauss(0, sd), lo, hi)       (ONE shared draw per player-season)
 *   base *= 1 + sign(base) * coachingEffect
 *   r_k = limitRating(r_k + bound((base + mod_k(age)) * U(m_lo, m_hi) + N(0, idio_k(age)), lim_k))
 * plus BBGM's height rule and endurance U(0,9) bonus at age <= 23 when spec.enduYoungUniform.
 * Tables are {edges, vals}: value = vals[i] for the first edge with age <= edges[i], else vals.at(-1).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlayerRatings, RatingKey } from "../../../../src/common/types.basketball.ts";
import { coachingEffect } from "../../../../src/common/budgetLevels.ts";
import { realGauss, uniform } from "../../../../src/common/random.ts";
import { helpers } from "../../../../src/worker/util/index.ts";

type Key = Exclude<RatingKey, "hgt">;
type Table = { edges: number[]; vals: number[] };
export type DataSpec = {
	base: Table;
	noise: { maxAge: number; sd: number; lo: number; hi: number }[]; // last entry applies to all older ages
	mult: [number, number];
	mods: Record<Key, Table>;
	limits: Record<Key, [number, number] | "iq">;
	idio?: Partial<Record<Key, Table>>;
	enduYoungUniform: boolean;
};

const KEYS: Key[] = ["stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"];
const look = (t: Table, age: number) => {
	for (let i = 0; i < t.edges.length; i++) {
		if (age <= t.edges[i]!) {
			return t.vals[i]!;
		}
	}
	return t.vals.at(-1)!;
};
const limitRating = (x: number) => (x > 100 ? 100 : x < 0 ? 0 : Math.floor(x));

export const makeFromSpec = (spec: DataSpec) => (ratings: PlayerRatings, age: number, coachingLevel: number) => {
	if (age <= 21) {
		const heightRand = Math.random();
		if (heightRand > 0.99 && age <= 20 && ratings.hgt <= 99) {
			ratings.hgt += 1;
		}
		if (heightRand > 0.999 && ratings.hgt <= 99) {
			ratings.hgt += 1;
		}
	}
	const nz = spec.noise.find((n) => age <= n.maxAge) ?? spec.noise.at(-1)!;
	let base = look(spec.base, age) + helpers.bound(realGauss(0, nz.sd), nz.lo, nz.hi);
	base *= 1 + (base > 0 ? 1 : -1) * coachingEffect(coachingLevel);
	for (const key of KEYS) {
		let mod = look(spec.mods[key], age);
		if (key === "endu" && spec.enduYoungUniform && age <= 23) {
			mod = uniform(0, 9);
		}
		const lim = spec.limits[key];
		const [lo, hi] = lim === "iq" ? (age >= 24 ? [-3, 9] : [-3, 7 + 5 * (24 - age)]) : lim;
		const idioT = spec.idio?.[key];
		const idio = idioT ? look(idioT, age) : 0;
		const shock = idio > 0 ? realGauss(0, idio) : 0;
		ratings[key] = limitRating(
			ratings[key] + helpers.bound((base + mod) * uniform(spec.mult[0], spec.mult[1]) + shock, lo, hi),
		);
	}
};

const SPEC_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "candidate_specs.json");
const specs: Record<string, DataSpec> = JSON.parse(readFileSync(SPEC_FILE, "utf8"));
export const CANDIDATES = Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, makeFromSpec(v)]));
