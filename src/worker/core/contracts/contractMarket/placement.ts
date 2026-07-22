import { helpers } from "../../../util/index.ts";
import type {
	ContractMarketFeatures,
	ContractMarketRange,
	ContractMarketTier,
} from "./types.ts";

const scale = (value: number, min: number, max: number, fallback = 0.5) =>
	Number.isFinite(value)
		? helpers.bound((value - min) / (max - min), 0, 1)
		: fallback;

const weightedAverage = (entries: [number, number][]) => {
	let numerator = 0;
	let denominator = 0;
	for (const [value, weight] of entries) {
		if (Number.isFinite(value)) {
			numerator += value * weight;
			denominator += weight;
		}
	}
	return denominator > 0 ? numerator / denominator : 0.5;
};

const riskFlags = (f: ContractMarketFeatures) => {
	const flags: string[] = [];
	const creatorLoad = f.usage >= 24 || f.ast >= 5 || f.astPct >= 24;
	const turnoverFlag =
		f.tov >= 2.2 && creatorLoad && f.minutesPerGame >= 16
			? "high_turnover_creator_risk"
			: f.tov >= 1.4 && !creatorLoad && f.minutesPerGame >= 16
				? "high_turnover_role_player_risk"
				: "";
	if (f.age <= 24 && f.pot >= 65 && f.potentialPremium >= 4) {
		if (
			f.minutesPerGame >= 18 &&
			(f.bpm >= -0.5 || f.ewa >= 2 || f.per >= 14)
		) {
			flags.push("young_proven_positive");
		} else if (f.minutesPerGame < 16 || (f.bpm < -2 && f.ewa < 1)) {
			flags.push("young_pot_only");
		} else if (f.minutesPerGame >= 14 && (f.ewa >= 1.5 || f.per >= 13)) {
			flags.push("young_productive_but_risky");
		}
		if (f.trueShooting < 0.51 && f.bpm < -2 && f.minutesPerGame < 20) {
			flags.push("young_bad_archetype_risk");
		}
	}
	const guardOnly =
		f.pos.includes("G") &&
		!f.pos.includes("SF") &&
		!f.pos.includes("F") &&
		!f.pos.includes("C");
	if (
		guardOnly &&
		(f.dbpm >= 1.1 || f.onOff >= 3.5) &&
		f.blk < 0.35 &&
		f.trb < 4.5 &&
		f.compDefensePerimeter < 0.62
	) {
		flags.push("small_guard_defense_stat_risk");
	}
	if (turnoverFlag) {
		flags.push(turnoverFlag);
	}
	const shooting = shootingPackage(f);
	if (shooting >= 0.68 && f.minutesPerGame >= 16 && f.trueShooting >= 0.55) {
		flags.push("shooting_portable");
	} else if (
		shooting >= 0.64 &&
		(f.minutesPerGame < 14 || f.trueShooting < 0.53)
	) {
		flags.push("shooting_rating_without_role");
	}
	if (f.trueShooting < 0.51 && f.usage >= 16) {
		flags.push("low_efficiency_shooter_risk");
	}
	const defense = defenseReboundPackage(f);
	if (
		f.minutesPerGame >= 18 &&
		(f.usage < 17 || f.pts < 10) &&
		(defense >= 0.62 || f.bpm >= 0.5 || f.vorp >= 1)
	) {
		flags.push("non_scoring_impact_positive");
	}
	if (f.trueShooting < 0.5 && f.obpm < -2) {
		flags.push("offensive_liability_risk");
	}
	if (defense >= 0.66 && !flags.includes("small_guard_defense_stat_risk")) {
		flags.push("defense_impact_supported");
	} else if (f.dbpm >= 1.2 && defense < 0.58) {
		flags.push("defense_impact_noisy");
	}
	return [...new Set(flags)];
};

const productionReliability = (f: ContractMarketFeatures) =>
	weightedAverage([
		[scale(f.games, 25, 75), 0.8],
		[scale(f.minutesPerGame, 8, 28), 0.8],
		[scale(f.ewa, 0, 8), 0.7],
		[scale(f.vorp, -0.5, 3), 0.5],
		[scale(f.bpm, -3, 3), 0.55],
		[scale(f.per, 9, 18), 0.5],
	]);

const futureUpside = (f: ContractMarketFeatures) => {
	const roleSupport = weightedAverage([
		[scale(f.minutesPerGame, 8, 26), 0.6],
		[scale(f.bpm, -3, 2), 0.5],
		[scale(f.ewa, 0, 5), 0.5],
	]);
	const upside =
		0.45 * scale(f.age, 27, 19) +
		0.3 * scale(f.pot, 58, 76) +
		0.25 * scale(f.potentialPremium, 0, 12);
	const potOnlyDiscount = roleSupport < 0.35 && upside > 0.6 ? 0.12 : 0;
	return helpers.bound(
		0.78 * upside + 0.22 * roleSupport - potOnlyDiscount,
		0,
		1,
	);
};

const isBig = (f: ContractMarketFeatures) =>
	f.pos.includes("C") || f.pos.includes("F");

const shootingPackage = (f: ContractMarketFeatures) =>
	weightedAverage([
		[scale(f.compShootingThree, 0.5, 0.75), 0.9],
		[scale(f.skillThreeMargin, -0.04, 0.12), 0.8],
		[scale(f.trueShooting, 0.5, 0.63), 0.8],
		[scale(f.effectiveFg, 0.47, 0.6), 0.5],
		[
			weightedAverage([
				[scale(f.minutesPerGame, 10, 28), 0.6],
				[scale(f.usage, 12, 24), 0.4],
			]),
			0.35,
		],
	]);

const playmakingPackage = (f: ContractMarketFeatures) =>
	weightedAverage([
		[scale(f.compPassing, 0.45, 0.72), 0.8],
		[scale(f.astPct, 8, 28), 0.8],
		[scale(f.ast, 1, 7), 0.6],
		[scale(f.obpm, -3, 3), 0.4],
	]);

const defenseReboundPackage = (f: ContractMarketFeatures) =>
	weightedAverage([
		[scale(f.compDefenseInterior, 0.45, 0.72), 0.7],
		[scale(f.compDefensePerimeter, 0.45, 0.72), 0.7],
		[scale(f.compRebounding, 0.45, 0.72), 0.55],
		[scale(f.compBlocking, 0.45, 0.72), 0.45],
		[
			isBig(f)
				? weightedAverage([
						[scale(f.trb, 3, 10), 0.5],
						[scale(f.blk, 0.2, 1.8), 0.5],
						[scale(f.dbpm, -1, 3), 0.5],
					])
				: weightedAverage([
						[scale(f.stl, 0.4, 1.5), 0.35],
						[scale(f.dbpm, -1, 2), 0.35],
						[scale(f.trb, 2, 6), 0.2],
					]),
			0.75,
		],
	]);

export const placeContractMarketAmount = (
	f: ContractMarketFeatures,
	tier: ContractMarketTier,
	range: ContractMarketRange,
) => {
	const flags = riskFlags(f);
	const currentImpact = weightedAverage([
		[scale(f.contractValue, 48, 70), 1.4],
		[scale(f.valueNoPot, 48, 70), 1.2],
		[scale(f.minutesPerGame, 8, 32), 0.9],
		[scale(f.starterShare, 0, 0.8), 0.7],
		[scale(f.per, 8, 22), 0.9],
		[scale(f.ewa, 0, 10), 0.9],
		[scale(f.vorp, -0.5, 4), 0.8],
		[scale(f.bpm, -3, 5), 0.9],
	]);
	const roleCertainty = weightedAverage([
		[scale(f.games, 20, 75), 0.9],
		[scale(f.minutesPerGame, 8, 30), 1.2],
		[scale(f.starterShare, 0, 0.85), 0.9],
		[scale(f.valueNoPot, 48, 66), 0.7],
		[scale(f.ewa, 0, 8), 0.6],
	]);
	const upside = helpers.bound(futureUpside(f), 0, 1);
	const shooting = shootingPackage(f);
	const playmaking = playmakingPackage(f);
	const defenseRebound = defenseReboundPackage(f);
	const skillPortability = weightedAverage([
		[shooting, 0.45],
		[playmaking, f.pos.includes("G") ? 0.25 : 0.16],
		[defenseRebound, isBig(f) ? 0.35 : 0.22],
		[scale(f.minutesPerGame, 8, 28), 0.2],
		[scale(f.trueShooting, 0.48, 0.6), 0.18],
	]);
	const turnoverRisk =
		f.tov >= 2.2 &&
		(f.usage >= 24 || f.ast >= 5 || f.astPct >= 24) &&
		f.minutesPerGame >= 16
			? helpers.bound((f.tov - 2.1) / 3.5, 0.04, 0.18)
			: f.tov >= 1.4 &&
				  !(f.usage >= 24 || f.ast >= 5 || f.astPct >= 24) &&
				  f.minutesPerGame >= 16
				? helpers.bound((f.tov - 1.3) / 2.2, 0.08, 0.28)
				: 0;
	const guardDefenseRisk =
		f.pos.includes("G") &&
		!f.pos.includes("SF") &&
		!f.pos.includes("F") &&
		!f.pos.includes("C") &&
		(f.dbpm >= 1.1 || f.onOff >= 3.5) &&
		f.blk < 0.35 &&
		f.trb < 4.5 &&
		f.compDefensePerimeter < 0.62
			? 0.12
			: 0;
	const risk = helpers.bound(
		turnoverRisk +
			(f.trueShooting < 0.52 && f.usage >= 18 ? 0.18 : 0) +
			(f.minutesPerGame < 14 && f.starterShare < 0.2 ? 0.16 : 0) +
			(f.bpm < -2 || f.per < 9 ? 0.18 : 0) +
			guardDefenseRisk +
			(flags.includes("shooting_rating_without_role") ||
			flags.includes("low_efficiency_shooter_risk")
				? 0.1
				: 0),
		0,
		0.75,
	);
	const ageRisk = helpers.bound(
		scale(f.age, 29, 35, 0.25) +
			(range.modelYears.includes("4") ||
			range.modelYears.includes("5") ||
			f.normalContractYears >= 3
				? f.age >= 30
					? 0.12
					: 0
				: 0) +
			(f.games < 45 ? 0.1 : 0),
		0,
		0.75,
	);
	const placement = helpers.bound(
		currentImpact * 0.28 +
			roleCertainty * 0.17 +
			upside * 0.13 +
			skillPortability * 0.14 +
			productionReliability(f) * 0.14 +
			(1 - risk) * 0.08 +
			(1 - ageRisk) * 0.06,
		0.04,
		0.96,
	);
	const unroundedPointAmount =
		range.minAmount + placement * (range.maxAmount - range.minAmount);
	// The formal tool rounds its million-dollar point estimate to two decimals.
	// In runtime units (thousands), that is a 10-unit increment.
	const pointAmount = Math.round(unroundedPointAmount / 10) * 10;
	return {
		tier,
		pointAmount,
		pointCapPct: pointAmount / f.salaryCap,
		placementScore: placement,
		yearsHint: range.modelYears,
		riskFlags: flags,
	};
};
