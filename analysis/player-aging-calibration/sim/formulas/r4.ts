import type { Player } from "../../../../src/common/types.ts";
import type { PlayerRatings } from "../../../../src/common/types.basketball.ts";
import model from "./r4_tendency.json";
import { CANDIDATES } from "./candidates.ts";

type TendencyFeature = "ins" | "dnk" | "fg" | "ft" | "hgt" | "pss" | "drb" | "stre" | "spd";
const expected = (intercept: number, coefficients: number[], features: number[]) =>
	features.reduce((total, x, index) => total + x * coefficients[index]!, intercept);

export function shotTendency(p: Player, season: number, revised: boolean) {
	const ratings = p.ratings.at(-1)! as PlayerRatings;
	const features = model.features.map(key => ratings[key as TendencyFeature] / 100);
	const settings = revised ? model.revised : model;
	let prior = Math.min(.93, Math.max(.01, expected(model.intercept, model.coef, features)));
	if (revised) {
		const fit = model.revised;
		const centered = features.map((x, index) => x - fit.center[index]!);
		const low = 1 / (1 + Math.exp(-expected(fit.low[0]!, fit.low.slice(1), centered)));
		const positive = Math.min(.93, Math.max(.10, expected(fit.average, fit.positive, centered)));
		prior = low * fit.lowMean + (1 - low) * positive;
	}

	let attempts = settings.pseudoAttempts;
	let threes = attempts * prior;
	for (const row of p.stats) {
		if (row.playoffs || (row.season !== season-1 && row.season !== season-2)) continue;
		const weight = row.season === season-1 ? 1 : settings.previousWeight;
		attempts += weight * (row.fga ?? 0);
		threes += weight * (row.tpa ?? 0);
	}
	const share = threes / attempts;
	if (!revised) return share;

	// Two-point events more often become shooting fouls without a recorded FGA.
	// Map an expected share of recorded attempts to slightly lower choice odds.
	const oddsNumerator = model.revised.drawOddsRatio * share;
	return oddsNumerator / (1 - share + oddsNumerator);
}

// At neutral coaching each group has exactly the A3 marginal transition law.
// draw complete A3 vectors so clipping, age modifiers and flooring remain identical.
export function developGrouped(r: PlayerRatings, age: number, coaching: number) {
	const initial = { ...r };
	CANDIDATES.A3!(r, age, coaching);
	if (age > 25 || Math.random() >= .5) return;
	for (const keys of [["diq","reb"],["spd","jmp","stre","endu"]] as const) {
		const other = { ...initial };
		CANDIDATES.A3!(other, age, coaching);
		for (const key of keys) r[key] = other[key];
	}
}
