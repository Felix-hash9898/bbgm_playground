import type { Player } from "../../../src/common/types.ts";
import type { PlayerRatings } from "../../../src/common/types.basketball.ts";
import { twoPointMix, type R5Arm, type R5Player } from "./formulas/r5.ts";
import modernHistory from "./r5_inputs/zone_history.json";
import earlyHistory from "./r5_inputs/zone_history_hist.json";

// Opening finishing identity. It is estimated ONCE, from records strictly before the league opened, and carried
// by the player. Simulated results and later real NBA seasons are never read, so prospects who arrive later and
// generated players keep the plain ratings mapping.
type Zone = "atRim" | "lowPost";
type ZoneRecord = [number, number, number, number, number, number];
export type FinishingMark = { season: number; source: "zone" | "box"; atRim: number; lowPost: number };
export type FinishingPlayer = Player & { r164Finishing?: FinishingMark };
type Prepare = (p: Player, season: number, arm: R5Arm, factor: number, start: number) => R5Player;

const records = { ...earlyHistory, ...modernHistory } as unknown as Record<string, Record<string, ZoneRecord>>;
const ZONES = [
	{ kind: "atRim", index: 0, slope: .41, composite: "cRim", k: 120 },
	{ kind: "lowPost", index: 1, slope: .32, composite: "cPost", k: 90 },
] as const;
const LIMIT = .04;
// NBA 2005-18 and 2022-25: an opening residual predicts the same zone .74-.79 as strongly after six seasons.
export const YEARLY_CARRY = .95;
const clamp = (x: number, limit = LIMIT) => Math.max(-limit, Math.min(limit, x));
const add = (marks: Map<number, FinishingMark>, pid: number, season: number, source: "zone" | "box", kind: Zone, shift: number) => {
	const mark = marks.get(pid) ?? { season, source, atRim: 0, lowPost: 0 };
	mark[kind] = clamp(shift);
	marks.set(pid, mark);
};

/** Read only what was known when the league opened. */
export function openingMarks(players: Player[], season: number, arm: R5Arm, factor: number, prepare: Prepare) {
	const marks = new Map<number, FinishingMark>();
	const active = players.filter(p => p.tid >= -1 && p.draft.year < season);
	const inputs = new Map(active.map(p => [p.pid, prepare(p, season, arm, factor, season)]));
	const table = records[String(season)];
	const sample = table ? active.flatMap(p => {
		const history = p.srID && p.tid >= 0 ? table[p.srID] : undefined;
		return history ? [{ p, history, x: inputs.get(p.pid)! }] : [];
	}) : [];
	if (sample.length >= 150) {
		for (const { kind, index, slope, composite, k } of ZONES) {
			const n = sample.reduce((a, r) => a + r.history[index], 0);
			const pct = sample.reduce((a, r) => a + r.history[index + 3]!, 0) / n;
			const mean = sample.reduce((a, r) => a + r.history[index] * r.x[composite], 0) / n;
			for (const { p, history, x } of sample) {
				const own = history[index];
				if (own < 30) continue;
				const residual = history[index + 3]! / own - pct - slope * (x[composite] - mean);
				add(marks, p.pid, season, "zone", kind, .5 * own / (own + k) * residual);
			}
		}
	}

	// Openings without zone tables (2020-22, other eras) use the two-point boxes already stored in the league file.
	const boxes = active.flatMap(p => {
		let attempts = 0, makes = 0;
		for (const row of p.stats) {
			if (row.playoffs || (row.season !== season - 1 && row.season !== season - 2)) continue;
			const weight = row.season === season - 1 ? 1 : .5;
			attempts += weight * ((row.fga ?? 0) - (row.tpa ?? 0));
			makes += weight * ((row.fg ?? 0) - (row.tp ?? 0));
		}
		if (!(attempts > 0)) return [];
		const mix = twoPointMix(p.ratings.at(-1)! as PlayerRatings, "C2");
		return [{ p, attempts, makes, mix, x: inputs.get(p.pid)! }];
	});
	if (boxes.length >= 150) {
		const total = boxes.reduce((a, r) => a + r.attempts, 0);
		const pct = boxes.reduce((a, r) => a + r.makes, 0) / total;
		const base = [.64, .41, .41], slopes = [.41, .32, .32], keys = ["cRim", "cPost", "cMid"] as const;
		const means = keys.map((key, i) => boxes.reduce((a, r) => a + r.attempts * r.mix[i]! * r.x[key], 0) /
			boxes.reduce((a, r) => a + r.attempts * r.mix[i]!, 0));
		const expected = (r: typeof boxes[number]) => keys.reduce((a, key, i) =>
			a + r.mix[i]! * (base[i]! + slopes[i]! * (r.x[key] - means[i]!)), 0);
		const mean = boxes.reduce((a, r) => a + r.attempts * expected(r), 0) / total;
		for (const r of boxes) {
			// A zone table covers this opening: only players it omits (for example, a season lost to injury) use the box.
			if (r.attempts < 60 || marks.has(r.p.pid)) continue;
			const residual = r.makes / r.attempts - pct - (expected(r) - mean);
			const weight = r.attempts / (r.attempts + 250);
			add(marks, r.p.pid, season, "box", "atRim", .5 * weight * residual);
			add(marks, r.p.pid, season, "box", "lowPost", .4 * weight * residual);
		}
	}
	return marks;
}

export function carriedShift(mark: FinishingMark | undefined, season: number, kind: string) {
	if (!mark || (kind !== "atRim" && kind !== "lowPost") || season < mark.season) return 0;
	return mark[kind] * YEARLY_CARRY ** (season - mark.season);
}

/** Adds the carried identity to whatever two-point make hook the base arm installed. */
export function installFinishing(players: FinishingPlayer[], season: number) {
	const shifts = new Map<number, Record<Zone, number>>();
	for (const p of players) {
		if (!p.r164Finishing) continue;
		shifts.set(p.pid, {
			atRim: carriedShift(p.r164Finishing, season, "atRim"),
			lowPost: carriedShift(p.r164Finishing, season, "lowPost"),
		});
	}
	const hook = globalThis as typeof globalThis & { r5MakeShift?: (kind: string, pid: number, assisted?: boolean) => number | undefined };
	const base = hook.r5MakeShift;
	hook.r5MakeShift = (kind, pid, assisted) => {
		// The base hook is undefined for in-season signings. Adding to undefined would turn every shot into NaN.
		const before = base?.(kind, pid, assisted);
		const own = shifts.get(pid)?.[kind as Zone];
		return before === undefined ? own : before + (own ?? 0);
	};
	return shifts.size;
}

