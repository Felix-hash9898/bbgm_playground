import { COMPOSITE_WEIGHTS } from "../../../../common/index.ts";
import type { MinimalPlayerRatings } from "../../../../common/types.ts";
import { g } from "../../../util/index.ts";
import compositeRating from "../../player/compositeRating.ts";
import { getMaxContractForPlayer } from "../contractLimits.ts";
import { getMinContractForPlayer } from "../contractMinimum.ts";
import { getContractValue } from "../contractValue.ts";
import type { ContractMarketFeatures, ContractMarketPlayer } from "./types.ts";

type StatRecord = Record<string, number | boolean | undefined>;
type CompositeEntry = {
	ratings: (string | number)[];
	weights?: number[];
	skill?: { cutoff: number };
};

const weights = COMPOSITE_WEIGHTS as Record<string, CompositeEntry>;

const numberValue = (value: unknown, fallback = 0) =>
	typeof value === "number" && Number.isFinite(value) ? value : fallback;

const latestRegularSeasonStats = (p: ContractMarketPlayer): StatRecord => {
	for (let i = p.stats.length - 1; i >= 0; i -= 1) {
		const stats = p.stats[i] as StatRecord;
		if (!stats.playoffs) {
			return stats;
		}
	}
	return {};
};

const composite = (ratings: MinimalPlayerRatings, key: string) => {
	const entry = weights[key];
	if (!entry) {
		return 0.5;
	}
	return compositeRating(ratings, entry.ratings, entry.weights, false);
};

const trueShooting = (stats: StatRecord) => {
	const fga = numberValue(stats.fga);
	const fta = numberValue(stats.fta);
	const pts = numberValue(stats.pts);
	return fga + 0.44 * fta > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.5;
};

const effectiveFg = (stats: StatRecord) => {
	const fga = numberValue(stats.fga);
	return fga > 0
		? (numberValue(stats.fg) + 0.5 * numberValue(stats.tp)) / fga
		: 0.5;
};

export const getContractMarketFeatures = (
	p: ContractMarketPlayer,
): ContractMarketFeatures => {
	const ratings = p.ratings.at(-1)!;
	const stats = latestRegularSeasonStats(p);
	const games = numberValue(stats.gp);
	const minutes = numberValue(stats.min);
	const age = g.get("season") - p.born.year;
	const value = numberValue(p.value);
	const valueNoPot = numberValue(p.valueNoPot, value);
	const minutesPerGame = games > 0 ? minutes / games : 0;

	return {
		age,
		pos: ratings.pos,
		ovr: ratings.ovr,
		pot: ratings.pot,
		value,
		valueNoPot,
		potentialPremium: value - valueNoPot,
		contractValue: getContractValue(p),
		minutes,
		games,
		starts: numberValue(stats.gs),
		minutesPerGame,
		starterShare: games > 0 ? numberValue(stats.gs) / games : 0,
		per: numberValue(stats.per, 12),
		ewa: numberValue(stats.ewa),
		vorp: numberValue(stats.vorp),
		bpm: numberValue(stats.obpm) + numberValue(stats.dbpm),
		obpm: numberValue(stats.obpm),
		dbpm: numberValue(stats.dbpm),
		onOff: numberValue(stats.onOff100),
		pts: games > 0 ? numberValue(stats.pts) / games : 0,
		trb: games > 0 ? numberValue(stats.trb) / games : 0,
		ast: games > 0 ? numberValue(stats.ast) / games : 0,
		stl: games > 0 ? numberValue(stats.stl) / games : 0,
		blk: games > 0 ? numberValue(stats.blk) / games : 0,
		tov: games > 0 ? numberValue(stats.tov) / games : 0,
		trueShooting: trueShooting(stats),
		effectiveFg: effectiveFg(stats),
		usage: numberValue(stats.usgp),
		astPct: numberValue(stats.astp),
		compPassing: composite(ratings, "passing"),
		compUsage: composite(ratings, "usage"),
		compShootingThree: composite(ratings, "shootingThreePointer"),
		compRebounding: composite(ratings, "rebounding"),
		compDefense: composite(ratings, "defense"),
		compDefenseInterior: composite(ratings, "defenseInterior"),
		compDefensePerimeter: composite(ratings, "defensePerimeter"),
		compBlocking: composite(ratings, "blocking"),
		skillThreeMargin:
			composite(ratings, "shootingThreePointer") -
			(weights.shootingThreePointer?.skill?.cutoff ?? 0.59),
		skillReboundingMargin:
			composite(ratings, "rebounding") -
			(weights.rebounding?.skill?.cutoff ?? 0.61),
		skillDefenseInteriorMargin:
			composite(ratings, "defenseInterior") -
			(weights.defenseInterior?.skill?.cutoff ?? 0.57),
		minContract: getMinContractForPlayer(p),
		salaryCap: g.get("salaryCap"),
		eligibleMax: getMaxContractForPlayer(p),
		maxContractLength: g.get("maxContractLength"),
		normalContractYears: Math.max(
			0,
			p.contract.exp - g.get("season") + (g.get("phase") <= 3 ? 1 : 0),
		),
	};
};
