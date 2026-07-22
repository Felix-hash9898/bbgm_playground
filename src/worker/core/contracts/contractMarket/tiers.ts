import type {
	ContractMarketFeatures,
	ContractMarketRange,
	ContractMarketTier,
} from "./types.ts";

export const MODEL_TIERS = {
	MINIMUM_LEVEL: { rangeType: "minimumMultiplier", min: 1, max: 1.15 },
	VETERAN_MINIMUM_PLUS: { rangeType: "capPct", min: 0.0, max: 0.035 },
	LOW_ROTATION_PLUS: { rangeType: "capPct", min: 0.02, max: 0.035 },
	SPECIALIST_ROTATION: { rangeType: "capPct", min: 0.035, max: 0.055 },
	YOUNG_UPSIDE_SUSPECT: { rangeType: "capPct", min: 0.025, max: 0.045 },
	VETERAN_ROTATION_GUARD: { rangeType: "capPct", min: 0.04, max: 0.06 },
	LOW_END_STARTER: { rangeType: "capPct", min: 0.06, max: 0.12 },
	HIGH_END_ROTATION: { rangeType: "capPct", min: 0.07, max: 0.12 },
	SOLID_STARTER: { rangeType: "capPct", min: 0.12, max: 0.17 },
	YOUNG_PROVEN_STARTER: { rangeType: "capPct", min: 0.17, max: 0.225 },
	STAR_NEAR_MAX: { rangeType: "eligibleMaxPct", min: 0.88, max: 1 },
	SUPERSTAR_MAX: { rangeType: "eligibleMaxPct", min: 1, max: 1 },
} as const;

const isGuard = (f: ContractMarketFeatures) => f.pos.includes("G");
const isBig = (f: ContractMarketFeatures) =>
	f.pos.includes("C") || f.pos.includes("F");

const establishedStarter = (f: ContractMarketFeatures) =>
	f.games >= 50 && f.minutesPerGame >= 26 && f.starterShare >= 0.55;
const fullTimeStarter = (f: ContractMarketFeatures) =>
	f.games >= 50 && f.minutesPerGame >= 28 && f.starterShare >= 0.75;

const productionFlags = (f: ContractMarketFeatures) => ({
	high: f.per >= 18 && f.ewa >= 5 && f.vorp >= 1 && f.bpm >= 1,
	star: f.per >= 20 && f.ewa >= 8 && f.vorp >= 3 && f.bpm >= 3,
	superstar:
		f.per >= 25 && f.ewa >= 12 && f.vorp >= 5 && f.bpm >= 6 && f.usage >= 28,
});

const shootingSpacingSupport = (f: ContractMarketFeatures) =>
	f.compShootingThree >= 0.64 &&
	f.skillThreeMargin >= 0.04 &&
	f.trueShooting >= 0.54;

const shootingSpecialist = (f: ContractMarketFeatures) =>
	f.compShootingThree >= 0.68 &&
	f.skillThreeMargin >= 0.08 &&
	f.compUsage >= 0.5;

const defenseOrReboundBig = (f: ContractMarketFeatures) =>
	isBig(f) &&
	(f.compRebounding >= 0.64 ||
		f.compDefenseInterior >= 0.62 ||
		f.skillReboundingMargin >= 0.05 ||
		f.skillDefenseInteriorMargin >= 0.05);

const defenseConnectorSupport = (f: ContractMarketFeatures) =>
	[
		f.compDefenseInterior >= 0.62,
		f.compDefensePerimeter >= 0.62,
		f.compRebounding >= 0.62,
		f.compBlocking >= 0.62,
		f.compPassing >= 0.58,
		f.bpm >= 0.5 || f.vorp >= 0.8,
	].filter(Boolean).length >= 2;

const scoreBaseTier = (f: ContractMarketFeatures): ContractMarketTier => {
	const production = productionFlags(f);
	if (
		f.value >= 70 &&
		f.valueNoPot >= 67 &&
		f.contractValue >= 68 &&
		fullTimeStarter(f) &&
		production.superstar &&
		f.compUsage >= 0.7
	) {
		return "SUPERSTAR_MAX";
	}
	if (
		f.contractValue >= 65 &&
		f.valueNoPot >= 65 &&
		fullTimeStarter(f) &&
		production.star
	) {
		return "STAR_NEAR_MAX";
	}
	if (
		f.age <= 26 &&
		establishedStarter(f) &&
		f.contractValue >= 59 &&
		f.value >= 60 &&
		(production.high || f.bpm >= 1 || f.ewa >= 5)
	) {
		return "YOUNG_PROVEN_STARTER";
	}
	if (
		establishedStarter(f) &&
		f.valueNoPot >= 56 &&
		f.contractValue >= 55 &&
		(f.per >= 13 || f.ewa >= 2 || f.vorp >= 0.2)
	) {
		return "LOW_END_STARTER";
	}
	if (
		f.age >= 28 &&
		isGuard(f) &&
		f.valueNoPot >= 52 &&
		f.per >= 13 &&
		f.ewa >= 2
	) {
		return "VETERAN_ROTATION_GUARD";
	}
	if (
		f.age <= 24 &&
		f.pot >= 65 &&
		f.potentialPremium >= 4 &&
		f.value >= 57 &&
		!establishedStarter(f)
	) {
		return "YOUNG_UPSIDE_SUSPECT";
	}
	if (
		shootingSpecialist(f) &&
		f.valueNoPot >= 50 &&
		f.games >= 50 &&
		f.minutesPerGame >= 10
	) {
		return "SPECIALIST_ROTATION";
	}
	if (
		f.age >= 30 &&
		defenseOrReboundBig(f) &&
		f.per >= 12 &&
		f.valueNoPot >= 50
	) {
		return "VETERAN_MINIMUM_PLUS";
	}
	if (
		f.games >= 40 &&
		f.minutesPerGame >= 6 &&
		f.minutesPerGame < 16 &&
		f.age < 30 &&
		f.valueNoPot >= 50 &&
		f.per >= 10 &&
		f.ewa >= 0 &&
		f.bpm >= -2
	) {
		return "LOW_ROTATION_PLUS";
	}
	return "MINIMUM_LEVEL";
};

export const selectContractMarketTier = (
	f: ContractMarketFeatures,
): ContractMarketTier => {
	const base = scoreBaseTier(f);
	const roleSignals = [
		[f.games >= 50 && f.minutesPerGame >= 22, 1],
		[f.minutesPerGame >= 22, 0.75],
		[f.games >= 55 && f.minutesPerGame >= 20, 0.75],
	] as const;
	const coreSignals = [
		[(f.usage >= 22 && f.pts >= 12) || f.astPct >= 18 || f.ast >= 4, 1],
		[shootingSpacingSupport(f), 1],
		[
			f.age <= 25 &&
				f.minutesPerGame >= 18 &&
				(f.ewa >= 1.5 || f.bpm >= -1 || f.value >= 57),
			1,
		],
		[
			f.minutesPerGame >= 20 &&
				(f.valueNoPot >= 52 || f.contractValue >= 52) &&
				defenseConnectorSupport(f),
			1,
		],
	] as const;
	const valueProductionSignals = [
		[f.valueNoPot >= 55, 1],
		[f.contractValue >= 55, 1],
		[f.ewa >= 2 || f.vorp >= 0.2 || f.bpm >= -0.5 || f.per >= 14, 1],
	] as const;
	const supportScore = [
		...roleSignals,
		...coreSignals,
		...valueProductionSignals,
	].reduce((score, [passed, weight]) => score + (passed ? weight : 0), 0);
	const hardFloor =
		f.games >= 45 &&
		f.minutesPerGame >= 18 &&
		f.valueNoPot >= 52 &&
		!(f.contractValue < 52 && f.value < 54) &&
		!(f.per < 9 && f.bpm < -3);
	const minimumStrongerFloor =
		f.minutesPerGame >= 22 &&
		f.valueNoPot >= 55 &&
		f.contractValue >= 55 &&
		(f.ewa >= 2 || f.vorp >= 0.2 || f.bpm >= -0.5);
	const protectedStarterTier = [
		"SUPERSTAR_MAX",
		"STAR_NEAR_MAX",
		"YOUNG_PROVEN_STARTER",
		"LOW_END_STARTER",
	].includes(base);
	const coreSupport = coreSignals.some(([passed]) => passed);
	const valueProductionSupport = valueProductionSignals.some(
		([passed]) => passed,
	);
	const provenStarter =
		base === "LOW_END_STARTER" &&
		f.games >= 55 &&
		f.minutesPerGame >= 29 &&
		f.valueNoPot >= 60 &&
		f.contractValue >= 60 &&
		[f.bpm >= 1, f.ewa >= 5, f.vorp >= 1, f.per >= 16].filter(Boolean).length >=
			2 &&
		(f.starterShare >= 0.65 || f.starts >= 50 || f.minutesPerGame >= 31) &&
		(f.bpm >= 1.5 ||
			f.ewa >= 6 ||
			f.vorp >= 1.5 ||
			f.per >= 17 ||
			defenseConnectorSupport(f) ||
			shootingSpacingSupport(f) ||
			(f.age <= 27 && (f.value >= 58 || f.pot >= 65))) &&
		(f.bpm >= 0 ||
			(f.minutesPerGame >= 30 &&
				f.valueNoPot >= 61 &&
				f.contractValue >= 61 &&
				f.ewa >= 5 &&
				f.vorp >= 1 &&
				f.per >= 17 &&
				(defenseConnectorSupport(f) ||
					shootingSpacingSupport(f) ||
					f.per >= 12)));
	if (provenStarter) {
		return "SOLID_STARTER";
	}
	const highEndRotation =
		!(
			[
				"SUPERSTAR_MAX",
				"STAR_NEAR_MAX",
				"YOUNG_PROVEN_STARTER",
				"LOW_END_STARTER",
			] as ContractMarketTier[]
		).includes(base) &&
		hardFloor &&
		(!protectedStarterTier ? minimumStrongerFloor : true) &&
		roleSignals.some(([passed, weight]) => passed && weight >= 0.75) &&
		coreSupport &&
		valueProductionSupport &&
		supportScore >= 3;
	if (highEndRotation) {
		return "HIGH_END_ROTATION";
	}
	return base;
};

export const getContractMarketRange = (
	tier: ContractMarketTier,
	f: ContractMarketFeatures,
): ContractMarketRange => {
	const spec = MODEL_TIERS[tier];
	let min =
		spec.rangeType === "minimumMultiplier"
			? f.minContract * spec.min
			: f.salaryCap * spec.min;
	let max =
		spec.rangeType === "minimumMultiplier"
			? f.minContract * spec.max
			: spec.rangeType === "eligibleMaxPct"
				? f.eligibleMax * spec.max
				: f.salaryCap * spec.max;
	if (spec.rangeType === "eligibleMaxPct") {
		min = f.eligibleMax * spec.min;
	}
	min = Math.max(f.minContract, min);
	max = Math.max(min, max);
	return {
		minAmount: Math.round(min),
		maxAmount: Math.round(max),
		minCapPct: min / f.salaryCap,
		maxCapPct: max / f.salaryCap,
		modelYears:
			tier === "VETERAN_ROTATION_GUARD"
				? "1-2"
				: tier === "SUPERSTAR_MAX" || tier === "STAR_NEAR_MAX"
					? "4-5"
					: tier === "YOUNG_PROVEN_STARTER"
						? "3-5"
						: tier === "LOW_END_STARTER"
							? f.age <= 28
								? "2-4"
								: "1-3"
							: tier === "MINIMUM_LEVEL"
								? "1"
								: "1-2",
	};
};
