import { appendFileSync } from "node:fs";
import path from "node:path";
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
};
const TRAINED = ["ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb", "stre", "endu"] as const;
// Gap of the best 30-40 per class, real drafts 2012-25 minus generated (H, 24 classes): year 1, with the finishing, shooting and
// rebounding skills (almost no OVR weight) set between the year-1 and the larger year 4-7 gap.
export const PROFILE = { stre: -5, ins: 7, dnk: 10, ft: 5, fg: 12, tp: 4, oiq: 5, diq: 2, drb: -3, pss: -2, reb: 8 };
// Chosen 2026-11-25 in the class test (scripts/155, results/r164_local/classes): careers by draft age and skills match real drafts.
export const RULE: ClassRule = { stay: .2, noise: 8, points: { 19: 1, 20: 1, 22: -1 }, profile: PROFILE };
export const classRule = (): ClassRule => ({ ...RULE, ...(globalThis as any).r164Classes });

export const readyClass = async (players: any[], refresh: (p: any) => Promise<unknown>, rule = classRule()) => {
	for (const p of players) {
		const r = p.ratings.at(-1);
		const points = rule.points[Math.max(19, Math.min(22, p.draft.year - p.born.year))] ?? 0;
		for (const key of TRAINED) r[key] = limitRating(r[key] + points + (rule.profile[key] ?? 0));
		await refresh(p);
	}
	if (process.env.FULL_OUT) appendFileSync(path.join(process.env.FULL_OUT, "classes.jsonl"), JSON.stringify({ draft: players[0]?.draft.year, n: players.length,
		ages: players.map(p => p.draft.year - p.born.year).sort(), ovr: Math.max(...players.map(p => p.ratings.at(-1).ovr)) }) + "\n");
};
