// Round 5 shot-mechanism candidates (research only). Per-player quantities are frozen from PRESEASON ratings
// and pre-season box history, exactly like the round-4 three-point tendency.
import type { Player } from "../../../../src/common/types.ts";
import type { PlayerRatings } from "../../../../src/common/types.basketball.ts";
import fit from "../../results/r5_mix_fit.json";
import eraFit from "../../results/r5_era_fit.json";
import model from "./r4_tendency.json";
import astFit from "../../results/r6_assist_fit.json";
import foulFit from "../../results/r6_foul_model.json";
import usageFit from "../../results/r6_usage_model.json";
import usageNba from "../../results/r6_usage_nba_fit.json";
import driftFit from "../../results/r7_drift_fit.json";
import zoneHistory from "../r5_inputs/zone_history.json";
import zoneHistoryHist from "../r5_inputs/zone_history_hist.json";
import eraMixLeague from "../r5_inputs/era_mix_league.json";
import eraThreeLeague from "../r5_inputs/era_three_league.json";
import ARMS from "./r5_arms.json";
import { shotTendency } from "./r4.ts";

export type TwoType = "atRim" | "lowPost" | "midRange";
export type R5Arm = {
	three?: "r4rev" | "r4era";               // regular 3PA choice: round-4 revised tendency / era-safe version
	era?: boolean;                           // two-point mix shifted by kappa * log(threePointTendencyFactor)
	mix?: "C1" | "C2";                       // two-point type mix (scripts/30)
	makeShift?: Partial<Record<TwoType, number>>;
	foulScale?: Partial<Record<TwoType | "threePointer", number>>;
	forced?: number;                         // forced three kept with prob min(1, q / forced)
	astModel?: boolean;                      // round 6: P(assisted) = team probAst x (player's predicted assisted share / league mean)
	rimCtx?: [number, number];               // round 6: rim base-make shift if assisted / unassisted
	shrink?: Partial<Record<TwoType, number>>; // round 6: keep this fraction of the composite slope
	eraFoul?: number;                        // round 6: shooting-foul scale x factor^eraFoul (factor = threePointTendencyFactor)
	eraRim?: number;                         // round 6: rim base-make shift + eraRim * log(factor)
	zoneHist?: number;                       // round 6 style state: blend previous-season zone mix, pseudo 2PA of the model prior
	zoneSkill?: Partial<Record<TwoType, number>>; // round 6 skill state: + n/(n+k) x (own previous-season zone FG% - league)
	choiceState?: boolean;                   // round 6: style state fed by logged shot-type CHOICES instead of FGA zones
	eraMixLeague?: boolean;                  // round 7: recorded two-point mix follows the NBA league mix change (scripts/73), replaces the kappa x log(ratio) term
	innovMean?: boolean;                     // round 7 bug fix: yearly logit innovations made mean-preserving in SHARE space (symmetric log-odds noise inflated minority shares every year and compounded through the fed-back style)
	eraMixPrior?: boolean;                   // round 7: ratings-prior two-point mix anchored to the league mix of the season (log-ratio change from the C2 reference 2023), replaces kappa x log(factor)
	histZone?: boolean;                      // round 7 data fix: also use the pre-season zone record of historical targets 2006-2019
	skillFrozen?: boolean;                   // round 6: skill state = the REAL pre-league record (never re-estimated from simulated outcomes)
	innov?: { three: number; mid: number; post: number }; // round 6: yearly style innovation (logit SD, NBA sampling-corrected)
	blockWeights?: Record<string, number>;   // round 6: block probability x weight[type] (atRim / lowPost / midRange / threePointer)
	threeShift?: number;                     // round 6: three-point make shift
	eraPost?: number; eraMid?: number; eraThree?: number; // round 7: era make terms per zone (x log factor)
	ctxModernOnly?: boolean;                 // round 7: creation context only when the era factor >= 0.95
	choiceState3?: boolean;
	pScale?: boolean;
	eraLeague3?: boolean;
	anchor3?: boolean;
	priorCapPg?: number;                     // round 13.1: ratings prior <= cap x production choice (the r4 prior has no tp rating; rookies / no-history bigs got era-mean threes)
	anchor3rel?: boolean;                    // round 12: anchor only the TREND to production (league mean_t / mean_start = production's), level = candidate at the start season                       // round 12: league mean of the regular three choice anchored to PRODUCTION every season (previous-season plays as weights); individual spread from the candidate                    // round 11 B4: three-point era step = NBA league logit(3PA share) change (recorded season -> current), replaces eraRatio3 x log(factor ratio)                        // round 11 fix: cap the TRUE three probability (<= 0.97), not hook/factor at 1 (which capped P at the era factor); era ratio and innovation on logit(P)                  // round 7: three-point tendency from logged CHOICE shares (no 0.9 odds conversion)
	eraRatio?: boolean;
	eraRatio3?: number;                      // round 7: exponent of the three-point era ratio (default 1)
	eraRatioMix?: number;                    // round 7: scale of the two-point mix era ratio term (default 1)                      // round 7: simulated history recorded under factor f_h -> tendency odds x (f_now / f_h), mix logits + kappa log(f_now / f_h)
	drift?: boolean;                         // round 7: yearly 3PA-tendency drift (style mean reversion + experience + age + 3P% signal, r7_drift_fit "all")
	usageMap?: boolean;                      // round 6: usage composite x (NBA-fitted / sim-fitted ratings->usage)^gamma, ratings only
	usageModel?: number;                     // round 6 usage state: pseudo minutes of the shrinkage toward the expected sim usage
	foulModel?: number;                      // round 6 FT model v2: m = shrunk(own FTr toward expected sim FTr, pseudo FGA) / expected
	foulHist?: number;                       // round 6 foul-drawing state: shrunk previous-season FTr (pseudo FGA) replaces the composite-relative foul rate
	shrinkNeedsHist?: boolean;               // round 6: shrink a zone's composite slope only when a zone record replaces it
};
export const R5_ARMS = ARMS as Record<string, R5Arm>;

const KEYS = ["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"] as const;
const composite = (r: PlayerRatings, keys: (keyof PlayerRatings)[], w: number[]) =>
	Math.min(1, Math.max(0, keys.reduce((s, k, i) => s + (r[k] as number) * w[i]!, 0) / (100 * w.reduce((a, b) => a + b, 0))));
const dot = (c: number[], x: number[]) => c.reduce((s, v, i) => s + v * x[i]!, 0);

export function twoPointMix(r: PlayerRatings, model: "C1" | "C2", eraShift = 0): [number, number, number] {
	const x = model === "C1"
		? [1, composite(r, ["hgt", "stre", "dnk", "oiq"], [2, .3, .3, .2]),
			composite(r, ["hgt", "stre", "spd", "ins", "oiq"], [1, .6, .2, 1, .4]),
			composite(r, ["oiq", "fg", "stre"], [-.5, 1, .2])]
		: [1, ...KEYS.map(k => (r[k] as number) / 100)];
	const m = fit[model];
	const kPost = eraShift ? eraFit.kappa_post * eraShift : 0;
	const kMid = eraShift ? eraFit.kappa_mid * eraShift : 0;
	if (m.coef_post_vs_rim.length !== x.length) throw new Error("mix model shape");
	const post = Math.exp(dot(m.coef_post_vs_rim, x) + kPost);
	const mid = Math.exp(dot(m.coef_mid_vs_rim, x) + kMid);
	const z = 1 + post + mid;
	return [1 / z, post / z, mid / z];
}

/** Playground's own regular 3PA choice probability (index.ts), threePointTendencyFactor excluded. */
export function playgroundThreeChoice(r: PlayerRatings) {
	let s = composite(r, ["oiq", "tp"], [.1, 1]);
	if (s > .55) s = .55 + (s - .55) * (.3 / .45);
	const s2 = s < .35 ? s * (.1 / .35) : s < .45 ? .1 + (s - .35) * (.35 / .1) : s;
	return .67 * s2;
}

/**
 * Era-safe round-4 revised tendency. The player's own previous-season shares already contain the era, so only the
 * (modern-trained) ratings prior is scaled by the era factor. GameSim multiplies the hook value by the factor again,
 * so the hook returns tendency / factor. At factor 1 this equals shotTendency(p, season, true) exactly.
 */
export function shotTendencyEra(p: Player, season: number, factor: number, pScale = false, priorCapPg = 0) {
	const r = p.ratings.at(-1)! as PlayerRatings;
	const fit = model.revised;
	const centered = model.features.map((key, i) => (r[key as keyof PlayerRatings] as number) / 100 - fit.center[i]!);
	const low = 1 / (1 + Math.exp(-(fit.low[0]! + dot(fit.low.slice(1), centered))));
	const positive = Math.min(.93, Math.max(.10, fit.average + dot(fit.positive, centered)));
	const prior0 = low * fit.lowMean + (1 - low) * positive;
	const prior = priorCapPg ? Math.min(prior0, priorCapPg * playgroundThreeChoice(r)) : prior0;
	let attempts = fit.pseudoAttempts;
	let threes = attempts * prior * factor;
	for (const row of p.stats) {
		if (row.playoffs || (row.season !== season - 1 && row.season !== season - 2)) continue;
		const weight = row.season === season - 1 ? 1 : fit.previousWeight;
		attempts += weight * (row.fga ?? 0);
		threes += weight * (row.tpa ?? 0);
	}
	const share = threes / attempts;
	const odds = fit.drawOddsRatio * share;
	const P = odds / (1 - share + odds);
	return pScale ? Math.min(.97, P) / factor : Math.min(1, P / factor);
}

export type R5Player = { three: number | undefined; choice: number; pg?: number; mix?: [number, number, number]; ast: number; cMid: number; cPost: number; cRim: number; hist?: number[]; ftr?: [number, number]; cDf: number; ftrExp: number; usg?: [number, number]; usgExp: number; usgNba: number };
// 5-point Gauss-Hermite rule for a standard normal (deterministic: no extra random draws)
const GH = [[0, .5333333333333333], [1.3556261799742657, .2220759220056126], [-1.3556261799742657, .2220759220056126],
	[2.8569700138728056, .0112574113277207], [-2.8569700138728056, .0112574113277207]] as const;
// offset c such that E[sigmoid(l + c + s z)] = sigmoid(l)
const meanOffset1 = (l: number, sd: number) => {
	const target = 1 / (1 + Math.exp(-l));
	let c = 0;
	for (let it = 0; it < 4; it++) {
		let e = 0, de = 0;
		for (const [x, w] of GH) { const q = 1 / (1 + Math.exp(-(l + c + sd * x))); e += w * q; de += w * q * (1 - q); }
		c -= (e - target) / Math.max(1e-6, de);
	}
	return c;
};
// offsets (cp, cm) such that the expected softmax shares of [rim, post, mid] equal the shares at (lp, lm)
const meanOffset2 = (lp: number, lm: number, sp: number, sm: number) => {
	const sh = (a: number, b: number) => { const z = 1 + Math.exp(a) + Math.exp(b); return [1 / z, Math.exp(a) / z, Math.exp(b) / z]; };
	const t = sh(lp, lm);
	let cp = 0, cm = 0;
	for (let it = 0; it < 6; it++) {
		const e = [0, 0, 0];
		for (const [x, wx] of GH) for (const [y, wy] of GH) { const q = sh(lp + cp + sp * x, lm + cm + sm * y); for (let i = 0; i < 3; i++) e[i]! += wx * wy * q[i]!; }
		cp += Math.log(t[1]! / e[1]!) - Math.log(t[0]! / e[0]!);
		cm += Math.log(t[2]! / e[2]!) - Math.log(t[0]! / e[0]!);
	}
	return [cp, cm] as const;
};
const zoneRecord = (arm: R5Arm, season: number, srID: string | undefined) => {
	const key = srID ?? "";
	const modern = (zoneHistory as unknown as Record<string, Record<string, number[]>>)[String(season)];
	if (modern) return modern[key];
	return arm.histZone ? (zoneHistoryHist as unknown as Record<string, Record<string, number[]>>)[String(season)]?.[key] : undefined;
};
// round 12: season context of the current prepare/install cycle (all players of a season share it)
const seasonCtx = { season: 0, start: 0, k0: 1 };
export function prepare(p: Player, season: number, arm: R5Arm, factor = 1, startSeason = season): R5Player {
	seasonCtx.season = season; seasonCtx.start = startSeason;
	const r = p.ratings.at(-1)! as PlayerRatings;
	let three = arm.three === "r4rev" ? shotTendency(p, season, true) : arm.three === "r4era" ? shotTendencyEra(p, season, factor, !!arm.pScale, arm.priorCapPg ?? 0) : undefined;
	if (arm.choiceState3) {
		const rowsC = (s2: number) => p.stats.filter(x => !x.playoffs && x.season === s2 && (x as any).chN !== undefined) as any[];
		const c1 = rowsC(season - 1), c2 = rowsC(season - 2);
		if (c1.length) {
			const sum = (rs: any[], k: string) => rs.reduce((a, x) => a + (x[k] ?? 0), 0);
			const rr = p.ratings.at(-1)! as PlayerRatings;
			const fit = model.revised;
			const centered = model.features.map((key, i) => (rr[key as keyof PlayerRatings] as number) / 100 - fit.center[i]!);
			const low = 1 / (1 + Math.exp(-(fit.low[0]! + dot(fit.low.slice(1), centered))));
			const prior0 = low * fit.lowMean + (1 - low) * Math.min(.93, Math.max(.10, fit.average + dot(fit.positive, centered)));
			const prior = arm.priorCapPg ? Math.min(prior0, arm.priorCapPg * playgroundThreeChoice(rr)) : prior0;
			const n = sum(c1, "chN") + fit.previousWeight * sum(c2, "chN") + fit.pseudoAttempts;
			const t3 = sum(c1, "ch3") + fit.previousWeight * sum(c2, "ch3") + fit.pseudoAttempts * prior * factor;
			three = arm.pScale ? Math.min(.97, t3 / n) / factor : Math.min(1, (t3 / n) / factor); // GameSim multiplies the hook value by the factor again
		}
	}
	const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
	// era of the simulated previous season (recorded by the loop); real history at the start is already era-consistent
	const prevRow = p.stats.find(x => !x.playoffs && x.season === season - 1 && (x as any).era !== undefined) as any;
	const eraLog = arm.eraRatio && prevRow ? Math.log(factor / prevRow.era) : 0;
	// round 11: with pScale the logit transforms act on the true probability P = hook x factor
	const toP = (h: number) => (arm.pScale ? Math.min(.97, Math.max(.001, h * factor)) : h);
	const fromP = (q: number) => (arm.pScale ? q / factor : q);
	const LT = eraThreeLeague as unknown as Record<string, number>;
	const lgt = (x: number) => Math.log(x / (1 - x));
	const eraStep3 = arm.eraLeague3 ? (prevRow && LT[String(season)] && LT[String(season - 1)] ? lgt(LT[String(season)]!) - lgt(LT[String(season - 1)]!) : 0)
		: (arm.eraRatio3 ?? 1) * eraLog;
	if (eraStep3 && three !== undefined) {
		const q = toP(three);
		const l = Math.log(q / (1 - q)) + eraStep3;
		three = fromP(1 / (1 + Math.exp(-l)));
	}
	const innovate = arm.innov && season > startSeason;
	if (innovate && three !== undefined) {
		const q0 = toP(three);
		const l0 = Math.log(q0 / (1 - q0));
		const l = l0 + (arm.innovMean ? meanOffset1(l0, arm.innov!.three) : 0) + arm.innov!.three * gauss();
		three = fromP(1 / (1 + Math.exp(-l)));
	}
	if (arm.drift && season > startSeason && three !== undefined) {
		// pre-season information only: the player's own seasons before `season`
		const c = (driftFit as Record<string, Record<string, number>>).all!;
		const rows = p.stats.filter(x => !x.playoffs && x.season < season && (x.fga ?? 0) > 0);
		const bySeason = new Map<number, { fga: number; tpa: number; tp: number }>();
		for (const x of rows) {
			const t = bySeason.get(x.season) ?? { fga: 0, tpa: 0, tp: 0 };
			t.fga += x.fga ?? 0; t.tpa += x.tpa ?? 0; t.tp += x.tp ?? 0;
			bySeason.set(x.season, t);
		}
		const last = bySeason.get(season - 1);
		if (last && last.fga >= 150) {
			const lq = (t: { fga: number; tpa: number }) => { const q = Math.min(.95, Math.max(.01, t.tpa / t.fga)); return Math.log(q / (1 - q)); };
			const earlier = [...bySeason.entries()].filter(([s2]) => s2 < season - 1 && bySeason.get(s2)!.fga >= 150).map(([, t]) => lq(t));
			const dev = earlier.length ? lq(last) - earlier.reduce((a, b) => a + b, 0) / earlier.length : 0;
			const tpS = (last.tp + 250 * .36) / (last.tpa + 250);
			const age = season - 1 - p.born.year;
			const exp = season - 1 - Math.min(...bySeason.keys());
			const ab = age <= 22 ? 0 : age <= 25 ? 1 : age <= 28 ? 2 : age <= 31 ? 3 : age <= 34 ? 4 : 5;
			const eb = exp <= 1 ? 0 : exp <= 3 ? 1 : exp <= 6 ? 2 : exp <= 9 ? 3 : 4;
			const d = c.const! + c.lq! * lq(last) + c.dev_own! * dev + c.has_prev! * (earlier.length ? 1 : 0) + c.tp_s! * tpS +
				(ab > 0 ? c[`age_${ab}`]! : 0) + (eb > 0 ? c[`exp_${eb}`]! : 0);
			const l = Math.log(three / (1 - three)) + d;
			three = 1 / (1 + Math.exp(-l));
		}
	}
	const eraShift = arm.era ? Math.log(factor) : 0;
	let mix = arm.mix ? twoPointMix(r, arm.mix, arm.eraMixPrior ? 0 : eraShift) : undefined;
	const LMp = eraMixLeague as unknown as Record<string, [number, number, number]>;
	if (arm.eraMixPrior && mix && LMp[String(season)]) {
		const [rim, post, mid] = mix, a = LMp[String(season)]!, b = LMp["2023"]!;
		const lp = Math.log(post / rim) + Math.log(a[1] / a[0]) - Math.log(b[1] / b[0]);
		const lm = Math.log(mid / rim) + Math.log(a[2] / a[0]) - Math.log(b[2] / b[0]);
		const zz = 1 + Math.exp(lp) + Math.exp(lm);
		mix = [1 / zz, Math.exp(lp) / zz, Math.exp(lm) / zz];
	}
	// previous-season zone record: simulated history first (multi-season loop), else the pre-season real record
	const simRow = p.stats.filter(x => !x.playoffs && x.season === season - 1 && (x as any).fgaAtRim !== undefined);
	// style history on the CHOICE scale when the loop logged choices (fouled misses are not FGA, so FGA zone shares
	// understate rim / post choices and would drift the mix when fed back)
	const chosen = arm.choiceState && simRow.length && (simRow[0] as any).chRim !== undefined
		? (["chRim", "chPost", "chMid"] as const).map(k => simRow.reduce((a, x) => a + ((x as any)[k] ?? 0), 0)) : undefined;
	const hist = simRow.length
		? (["fgaAtRim", "fgaLowPost", "fgaMidRange", "fgAtRim", "fgLowPost", "fgMidRange"] as const).map(k => simRow.reduce((a, x) => a + ((x as any)[k] ?? 0), 0))
		: zoneRecord(arm, season, p.srID);
	const style = chosen ?? hist;
	if (arm.zoneHist && style && mix) {
		const k = arm.zoneHist!, n = style[0]! + style[1]! + style[2]!;
		mix = mix.map((m, i) => (style[i]! + k * m) / (n + k)) as [number, number, number];
	}
	const LM = eraMixLeague as unknown as Record<string, [number, number, number]>;
	if (arm.eraMixLeague && style && mix && LM[String(season)] && LM[String(season - 1)]) {
		const [rim, post, mid] = mix, a = LM[String(season)]!, b = LM[String(season - 1)]!;
		const lp = Math.log(post / rim) + Math.log(a[1] / a[0]) - Math.log(b[1] / b[0]);
		const lm = Math.log(mid / rim) + Math.log(a[2] / a[0]) - Math.log(b[2] / b[0]);
		const zz = 1 + Math.exp(lp) + Math.exp(lm);
		mix = [1 / zz, Math.exp(lp) / zz, Math.exp(lm) / zz];
	} else if (eraLog && mix && arm.era) {
		const [rim, post, mid] = mix;
		const sm = arm.eraRatioMix ?? 1;
		const lp = Math.log(post / rim) + eraFit.kappa_post * eraLog * sm, lm = Math.log(mid / rim) + eraFit.kappa_mid * eraLog * sm;
		const zz = 1 + Math.exp(lp) + Math.exp(lm);
		mix = [1 / zz, Math.exp(lp) / zz, Math.exp(lm) / zz];
	}
	// R13-M fix: an arm with three-point innovation only (three_anchor_rel_cap2_mix: innov = {three}) has no two-point
	// innovation; without this guard undefined * gauss() = NaN made every mix NaN from season 2 on and every two-point
	// draw fell through to midRange (cloud smoke run 44560536244: mid share 0.999, FT rate 0.095)
	if (innovate && mix && arm.innov!.post !== undefined && arm.innov!.mid !== undefined) {
		const [rim, post, mid] = mix;
		const lp0 = Math.log(post / rim), lm0 = Math.log(mid / rim);
		const [cp, cm] = arm.innovMean ? meanOffset2(lp0, lm0, arm.innov!.post, arm.innov!.mid) : [0, 0];
		const lp = lp0 + cp + arm.innov!.post * gauss(), lm = lm0 + cm + arm.innov!.mid * gauss();
		const zz = 1 + Math.exp(lp) + Math.exp(lm);
		mix = [1 / zz, Math.exp(lp) / zz, Math.exp(lm) / zz];
	}
	const ast = Math.min(.95, Math.max(.15, dot(astFit.coef, [1, ...KEYS.map(k => (r[k] as number) / 100)])));
	return { three, pg: playgroundThreeChoice(r), choice: three ?? playgroundThreeChoice(r), mix, ast,
		cMid: composite(r, ["oiq", "fg", "stre"], [-.5, 1, .2]), cPost: composite(r, ["hgt", "stre", "spd", "ins", "oiq"], [1, .6, .2, 1, .4]),
		cRim: composite(r, ["hgt", "stre", "dnk", "oiq"], [2, .3, .3, .2]),
		cDf: composite(r, ["hgt", "spd", "drb", "dnk", "oiq"], [1, 1, 1, 1, 1]),
		ftrExp: Math.max(.05, dot(foulFit.coef, [1, ...KEYS.map(k => (r[k] as number) / 100)])),
		usgExp: Math.max(4, dot(usageFit.coef, [1, ...KEYS.map(k => (r[k] as number) / 100)])),
		usgNba: Math.max(4, dot(usageNba.coef, [1, ...KEYS.map(k => (r[k] as number) / 100)])),
		usg: (() => {
			const rows = p.stats.filter(x => !x.playoffs && x.season === season - 1);
			const min = rows.reduce((a, x) => a + (x.min ?? 0), 0);
			const plays = rows.reduce((a, x) => a + (x.fga ?? 0) + .44 * (x.fta ?? 0) + (x.tov ?? 0), 0);
			return min > 0 ? [plays, min] as [number, number] : undefined;
		})(),
		ftr: (() => {
			const rows = p.stats.filter(x => !x.playoffs && x.season === season - 1);
			const fga = rows.reduce((a, x) => a + (x.fga ?? 0), 0), fta = rows.reduce((a, x) => a + (x.fta ?? 0), 0);
			return fga > 0 ? [fta, fga] as [number, number] : undefined;
		})(),
		hist: arm.zoneSkill ? (arm.skillFrozen ? zoneRecord(arm, startSeason, p.srID) : hist) : undefined };
}

type Hooks = {
	r4ShotProbability?: (pid: number) => number | undefined;
	r5ForcedThree?: (pid: number) => boolean;
	r5TwoType?: (pid: number) => TwoType | undefined;
	r5MakeShift?: (type: string, pid: number, assisted?: boolean) => number;
	r6AstProb?: (pid: number, base: number) => number;
	r6BlockWeight?: (type: string) => number;
	r6ThreeShift?: (pid: number) => number;
	r6UsageMult?: (pid: number) => number;
	r5FoulScale?: (type: string, pid?: number) => number;
};
export const HOOK_NAMES = ["r4ShotProbability", "r5ForcedThree", "r5TwoType", "r5MakeShift", "r5FoulScale", "r6AstProb", "r6BlockWeight", "r6ThreeShift", "r6UsageMult"] as const;

export function install(arm: R5Arm, players: Map<number, R5Player>, calls: Record<string, number>, factor = 1, choiceLog?: Map<number, number[]>, lenient = false) {
	// lenient (round 13, open league): players signed after the season-start prepare fall back to PRODUCTION (hook returns undefined)
	const lf = Math.log(factor);
	const h = globalThis as typeof globalThis & Hooks;
	const get = (pid: number) => {
		const x = players.get(pid);
		if (!x) throw new Error(`missing round-5 player ${pid}`);
		return x;
	};
	const count = (k: string) => { calls[k] = (calls[k] ?? 0) + 1; };
	if (arm.anchor3) {
		// round 12: keep production's league-level three choice (and therefore its era trend) and the candidate's individual
		// spread: scale every player's candidate choice by one constant so that the plays-weighted mean equals production's
		let num = 0, den = 0;
		for (const x of players.values()) {
			const w = x.usg ? x.usg[0] : 0;
			if (w > 0 && x.three !== undefined && x.pg !== undefined) { num += w * x.pg; den += w * x.three; }
		}
		const r = den > 0 ? num / den : 1;  // production / candidate (plays-weighted means)
		let c = r;
		if (arm.anchor3rel) {
			if (seasonCtx.season === seasonCtx.start) { seasonCtx.k0 = 1 / r; c = 1; } // start season: candidate level kept
			else c = r * seasonCtx.k0;                                                 // later: mean_t = (cand0 / prod0) x prod_t
		}
		for (const x of players.values()) if (x.three !== undefined) x.three = Math.min(.97 / factor, x.three * c);
		calls.anchor_c = c;
	}
	if (arm.three) h.r4ShotProbability = pid => {
		if (lenient && !players.has(pid)) { count("three_missing"); return undefined as unknown as number; }
		count("three");
		if (choiceLog) {
			const c = choiceLog.get(pid) ?? [0, 0, 0, 0];
			c[3] = (c[3] ?? 0) + 1; // regular three-point decisions (forced threes, put-backs and tip-ins never reach here)
			choiceLog.set(pid, c);
		}
		return get(pid).three;
	};
	if (arm.forced) h.r5ForcedThree = pid => { count("forced"); return Math.random() < Math.min(1, get(pid).choice / arm.forced!); };
	if (arm.mix) h.r5TwoType = pid => {
		count("mix");
		const [rim, post] = get(pid).mix!;
		const u = Math.random();
		const t = u < rim ? 0 : u < rim + post ? 1 : 2;
		if (choiceLog) {
			const c = choiceLog.get(pid) ?? [0, 0, 0, 0];
			c[t] = (c[t] ?? 0) + 1;
			choiceLog.set(pid, c);
		}
		return (["atRim", "lowPost", "midRange"] as const)[t];
	};
	// round 11 fix: choice-scale three-point state without a two-point mix model must still log the TOTAL of regular
	// two-point choices (ch3 = decisions - two-point choices); pass-through (undefined -> production two-point draw)
	else if (arm.choiceState3 && choiceLog) h.r5TwoType = pid => {
		const c = choiceLog.get(pid) ?? [0, 0, 0, 0];
		c[2] = (c[2] ?? 0) + 1;
		choiceLog.set(pid, c);
		return undefined;
	};
	const all = [...players.values()];
	const mean = (f: (x: R5Player) => number) => all.reduce((a, x) => a + f(x), 0) / all.length;
	const astMean = mean(x => x.ast), midMean = mean(x => x.cMid), postMean = mean(x => x.cPost), rimMean = mean(x => x.cRim);
	const ZI = { atRim: 0, lowPost: 1, midRange: 2 } as const;
	const withHist = all.filter(x => x.hist);
	const lgPct = [0, 1, 2].map(i => withHist.reduce((a, x) => a + x.hist![i + 3]!, 0) / Math.max(1, withHist.reduce((a, x) => a + x.hist![i]!, 0)));
	if (arm.blockWeights) h.r6BlockWeight = type => { count("blk"); return arm.blockWeights![type] ?? arm.blockWeights!.atRim ?? 1; };
	if (arm.threeShift || arm.eraThree) h.r6ThreeShift = () => (arm.threeShift ?? 0) + (arm.eraThree ?? 0) * lf;
	if (arm.usageMap) {
		const um = new Map<number, number>();
		for (const [pid, x] of players) um.set(pid, Math.min(1.6, Math.max(.6, (x.usgNba / x.usgExp) ** usageNba.gamma)));
		h.r6UsageMult = pid => { count("usage"); return um.get(pid) ?? 1; };
	}
	if (arm.usageModel) {
		const um = new Map<number, number>();
		for (const [pid, x] of players) {
			if (!x.usg) continue;
			const own = (36 * x.usg[0] / Math.max(1, x.usg[1]) * x.usg[1] + arm.usageModel * x.usgExp) / (x.usg[1] + arm.usageModel);
			um.set(pid, Math.min(1.6, Math.max(.6, (own / x.usgExp) ** usageFit.gamma)));
		}
		h.r6UsageMult = pid => { count("usage"); return um.get(pid) ?? 1; };
	}
	const ctxOn = !arm.ctxModernOnly || factor >= .95;
	if (arm.astModel && ctxOn) h.r6AstProb = (pid, base) => { count("ast"); return Math.min(.97, base * get(pid).ast / astMean); };
	if (arm.makeShift || arm.rimCtx || arm.shrink || arm.eraRim || arm.zoneSkill) h.r5MakeShift = (type, pid, assisted) => {
		count("make");
		let shift = arm.makeShift?.[type as TwoType] ?? 0;
		if (arm.rimCtx && ctxOn && type === "atRim") shift += assisted ? arm.rimCtx[0] : arm.rimCtx[1];
		if (arm.eraPost && type === "lowPost") shift += arm.eraPost * lf;
		if (arm.eraMid && type === "midRange") shift += arm.eraMid * lf;
		if (arm.eraRim && type === "atRim") shift += arm.eraRim * lf;
		const k = arm.shrink?.[type as TwoType];
		const hasHist = !!get(pid).hist && get(pid).hist![ZI[type as TwoType] ?? 0]! > 0;
		if (k !== undefined && (!arm.shrinkNeedsHist || hasHist)) {
			const x = get(pid);
			shift -= (1 - k) * (type === "midRange" ? .32 * (x.cMid - midMean) : type === "lowPost" ? .32 * (x.cPost - postMean) : .41 * (x.cRim - rimMean));
		}
		const ks = arm.zoneSkill?.[type as TwoType];
		const hz = get(pid).hist;
		if (ks !== undefined && hz) {
			const i = ZI[type as TwoType], n = hz[i]!;
			if (n > 0) shift += (n / (n + ks)) * (hz[i + 3]! / n - lgPct[i]!);
		}
		return shift;
	};
	// foul-drawing state: m = (shrunk own FTr / league FTr) / (composite factor / league composite factor), mean-normalized
	const withFtr = all.filter(x => x.ftr);
	const lgFtr = withFtr.reduce((a, x) => a + x.ftr![0], 0) / Math.max(1, withFtr.reduce((a, x) => a + x.ftr![1], 0));
	const dfMean = mean(x => x.cDf * x.cDf);
	const foulMult = new Map<number, number>();
	if (arm.foulHist) {
		for (const [pid, x] of players) {
			if (!x.ftr) continue;
			const own = (x.ftr[0] + arm.foulHist * lgFtr) / (x.ftr[1] + arm.foulHist);
			foulMult.set(pid, Math.min(3, Math.max(.33, (own / lgFtr) / ((x.cDf * x.cDf) / dfMean))));
		}
		const avg = [...foulMult.values()].reduce((a, b) => a + b, 0) / Math.max(1, foulMult.size);
		for (const [pid, v] of foulMult) foulMult.set(pid, v / avg);
	}
	if (arm.foulModel) {
		let wsum = 0, msum = 0;
		for (const [pid, x] of players) {
			if (!x.ftr) continue;
			const m = Math.min(2.5, Math.max(.4, ((x.ftr[0] + arm.foulModel * x.ftrExp) / (x.ftr[1] + arm.foulModel)) / x.ftrExp));
			foulMult.set(pid, m);
			wsum += x.ftr[1];
			msum += m * x.ftr[1];
		}
		const avg = wsum > 0 ? msum / wsum : 1;
		for (const [pid, v] of foulMult) foulMult.set(pid, v / avg);
	}
	if (arm.foulScale || arm.eraFoul || arm.foulHist || arm.foulModel) h.r5FoulScale = (type, pid) => {
		count("foul");
		return (arm.foulScale?.[type as TwoType] ?? 1) * (arm.eraFoul ? Math.exp(arm.eraFoul * lf) : 1) * (pid !== undefined ? foulMult.get(pid) ?? 1 : 1);
	};
	// round 13.1 (open league): every per-player hook falls back to PRODUCTION for players signed after the season-start
	// prepare (the GameSim replacements treat undefined as "use the original expression"); counted as <hook>_missing.
	if (lenient) {
		const g = h as unknown as Record<string, ((...a: any[]) => unknown) | undefined>;
		const pidArg: Record<string, number> = { r5ForcedThree: 0, r5TwoType: 0, r6AstProb: 0, r5MakeShift: 1, r5FoulScale: 1 };
		for (const [name, i] of Object.entries(pidArg)) {
			const f = g[name];
			if (!f) continue;
			g[name] = (...a: any[]) => {
				const pid = a[i];
				if (pid !== undefined && !players.has(pid)) { count(`${name}_missing`); return undefined; }
				return f(...a);
			};
		}
	}
}

export function uninstall() {
	const h = globalThis as Record<string, unknown>;
	for (const k of HOOK_NAMES) delete h[k];
}
