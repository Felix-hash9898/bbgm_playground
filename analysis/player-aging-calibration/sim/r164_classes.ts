import { appendFileSync } from "node:fs";
import path from "node:path";
import { alignGeneratedDefense } from "./r164_quality.ts";
import limitRating from "../../../src/worker/core/player/limitRating.ts";

// Generated draft classes only (classes with real prospects are untouched). Replaces r164_prospects.ts.
// The product makes prospects at 16, orders them by POT with +-50 noise, and lets half declare each year. Archive run 45539949243
// showed two consequences after the age mix was corrected:
//   - rookies are far better the older they are (year-1 OVR 35.9 at 19, 42.1 at 22); real draftees are equally good at every age
//     because the best leave early (45.4 / 45.6 / 44.5 / 44.5 at 19 / 20 / 21 / 22);
//   - at equal OVR they finish, shoot and rebound worse and are stronger and better handlers than real draftees.
export type ClassRule = {
	stay: number; // share of the remaining prospects that declares each year
	noise: number; // half-width of the random term in who declares first (product 50)
	points: Record<number, number>; // added to the trainable skills by draft age, once, at creation
	profile: Record<string, number>; // added to every generated prospect, once, at creation
	alignDefense?: boolean;
	spread?: Record<string, number>; // distance to the mean of the best 40 kept at creation (1 = unchanged)
};
const TRAINED = ["ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb", "stre", "endu"] as const;
// Gap of the best 30-40 per class, real drafts 2012-25 minus generated (H, 24 classes): year 1, with the finishing, shooting and
// rebounding skills (almost no OVR weight) set between the year-1 and the larger year 4-7 gap.
export const PROFILE = { stre: -5, ins: 7, dnk: 10, ft: 5, fg: 12, tp: 4, oiq: 5, diq: 2, drb: -3, pss: -2, reb: 8 };
// Chosen 2026-11-25 in the class test (scripts/155, results/r164_local/classes): careers by draft age and skills match real drafts.
export const RULE: ClassRule = { stay: .2, noise: 8, points: { 19: 1, 20: 1, 22: -1 }, profile: PROFILE };
// With the corrected growth (r164_growth.ts) rookies start higher and grow less: class test 2026-11-25 (results/r164_local/classes/gridj2, K2), 24 classes.
export const RULE_GROWTH: ClassRule = { stay: .2, noise: 8, points: { 19: 2, 20: 4, 21: 3, 22: 3 },
	profile: { stre: -4, ins: 8, dnk: 10, ft: 5, fg: 10, tp: 4, oiq: 6, diq: 2, drb: -3, pss: -2, reb: 8 } };
// With the composition of growth corrected (arms L, M): defensive IQ grows less after the draft, so it starts higher; and generated
// prospects are brought to the spread of real draftees (best 40 at year 1, sd of defensive IQ 10.1 to 8.4, real 6.4-7.5; offensive IQ
// 10.0 to 8.2, real 5.4-8.3; speed 13.4 to 9.6, real 8.8). Class test 2026-11-25 (results/r164_local/classes/gridl2, S1), 24 classes.
export const RULE_COMPOSITION: ClassRule = { ...RULE_GROWTH, spread: { spd: .7, oiq: .75, diq: .75 },
	profile: { ...RULE_GROWTH.profile, ins: 6, fg: 8, diq: 5, pss: -3 } };
export const classRule = (): ClassRule => {
	const on = (process.env.R164 ?? "").split(",");
	return { ...(on.includes("composition") ? RULE_COMPOSITION : on.includes("growth") ? RULE_GROWTH : RULE), alignDefense: on.includes("draftAlignment"), ...(globalThis as any).r164Classes };
};

export const readyClass = async (players: any[], refresh: (p: any) => Promise<unknown>, rule = classRule()) => {
	const alignment = rule.alignDefense ? alignGeneratedDefense(players) : undefined;
	const best = [...players].sort((a, b) => b.ratings.at(-1).ovr - a.ratings.at(-1).ovr).slice(0, 40).map(p => p.ratings.at(-1));
	const middle = Object.fromEntries(Object.keys(rule.spread ?? {}).map(key => [key, best.reduce((s, r) => s + r[key], 0) / Math.max(1, best.length)]));
	for (const p of players) {
		const r = p.ratings.at(-1);
		for (const [key, keep] of Object.entries(rule.spread ?? {})) r[key] = limitRating(Math.round(middle[key]! + keep * (r[key] - middle[key]!)));
		const points = rule.points[Math.max(19, Math.min(22, p.draft.year - p.born.year))] ?? 0;
		for (const key of TRAINED) r[key] = limitRating(r[key] + points + (rule.profile[key] ?? 0));
		await refresh(p);
	}
	if (process.env.FULL_OUT) appendFileSync(path.join(process.env.FULL_OUT, "classes.jsonl"), JSON.stringify({ draft: players[0]?.draft.year, n: players.length, alignment,
		ages: players.map(p => p.draft.year - p.born.year).sort(), ovr: Math.max(...players.map(p => p.ratings.at(-1).ovr)) }) + "\n");
};

// Opening file: real prospects drafted from 2026 on have no pro season behind their ratings, so the file rates those classes low
// and flat (best 40: 41.9 / 40.4 / 40.6 in 2026-28, against 43.3-45.9 in the known 2022-25 classes). Each class is raised by one
// whole number of points to the known level, at most 4. No player is moved relative to his class and no outcome is used.
export const FILE_FROM = 2026, FILE_LEVEL = 44, FILE_CAP = 4;
export const fileLift = (ovrs: number[]) => {
	const best = [...ovrs].sort((a, b) => b - a).slice(0, 40);
	if (best.length < 40) return 0; // mostly generated class
	return Math.max(0, Math.min(FILE_CAP, Math.round(FILE_LEVEL - best.reduce((a, b) => a + b, 0) / best.length)));
};
export const liftFileClasses = async (players: any[], start: number, refresh: (p: any) => Promise<unknown>) => {
	const classes = new Map<number, any[]>();
	for (const p of players) if (p.real && p.draft.year >= Math.max(FILE_FROM, start + 1)) classes.set(p.draft.year, [...classes.get(p.draft.year) ?? [], p]);
	const out: { draft: number; n: number; lift: number }[] = [];
	for (const [draft, ps] of [...classes].sort((a, b) => a[0] - b[0])) {
		const lift = fileLift(ps.map(p => p.ratings.at(-1).ovr));
		out.push({ draft, n: ps.length, lift });
		if (lift) for (const p of ps) {
			const r = p.ratings.at(-1);
			for (const key of [...TRAINED, "spd", "jmp"]) r[key] = limitRating(r[key] + lift);
			await refresh(p);
		}
	}
	return out;
};
