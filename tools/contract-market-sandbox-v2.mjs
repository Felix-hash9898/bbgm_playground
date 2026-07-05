#!/usr/bin/env node

import { bound, money, pct, round } from "./contract-market-proxy-core.mjs";
import { scoreTier, tierRange } from "./contract-market-tier-score.mjs";

const finite = (value) => Number.isFinite(Number(value));

const num = (row, key, fallback = undefined) => {
	const value = row?.[key];
	if (value === "" || value === undefined || value === null) {
		return fallback;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const scale = (value, min, max, fallback = 0.5) => {
	if (!Number.isFinite(value)) return fallback;
	return bound((value - min) / (max - min), 0, 1);
};

const weightedAverage = (entries, fallback = 0.5) => {
	let numerator = 0;
	let denominator = 0;
	for (const [value, weight = 1] of entries) {
		if (Number.isFinite(value)) {
			numerator += value * weight;
			denominator += weight;
		}
	}
	return denominator > 0 ? numerator / denominator : fallback;
};

const hasPosition = (row, token) =>
	String(row.pos ?? "")
		.toUpperCase()
		.includes(token);

const isGuard = (row) => hasPosition(row, "G");

const isBig = (row) => hasPosition(row, "C") || hasPosition(row, "F");

const parseModelRangeM = (text) => {
	const numbers = [
		...String(text ?? "").matchAll(/\$?([0-9]+(?:\.[0-9]+)?)M/g),
	].map((match) => Number(match[1]));
	if (numbers.length === 0) return {};
	if (numbers.length === 1) return { minM: numbers[0], maxM: numbers[0] };
	return {
		minM: Math.min(numbers[0], numbers[1]),
		maxM: Math.max(numbers[0], numbers[1]),
	};
};

const normalizeRow = (row) => {
	const getContractValue = num(
		row,
		"getContractValue",
		num(row, "contractValue"),
	);
	const value = num(row, "value");
	const valueNoPot = num(row, "valueNoPot");
	return {
		...row,
		getContractValue,
		contractValue: num(row, "contractValue", getContractValue),
		value,
		valueNoPot,
		potentialPremium: num(
			row,
			"potentialPremium",
			Number.isFinite(value) && Number.isFinite(valueNoPot)
				? value - valueNoPot
				: 0,
		),
		normalNoOptionContractAmount: num(
			row,
			"normalNoOptionContractAmount",
			num(row, "currentNoOptionAmount"),
		),
		normalNoOptionContractYears: num(
			row,
			"normalNoOptionContractYears",
			num(row, "currentNoOptionYears"),
		),
		normalNoOptionContractCapPct: num(
			row,
			"normalNoOptionContractCapPct",
			num(row, "currentNoOptionCapPct"),
		),
	};
};

const currentImpactComponent = (row) =>
	weightedAverage([
		[scale(num(row, "getContractValue"), 48, 70), 1.4],
		[scale(num(row, "valueNoPot"), 48, 70), 1.2],
		[scale(num(row, "MPG"), 8, 32), 0.9],
		[scale(num(row, "starterShare"), 0, 0.8), 0.7],
		[scale(num(row, "PER"), 8, 22), 0.9],
		[scale(num(row, "EWA"), 0, 10), 0.9],
		[scale(num(row, "VORP"), -0.5, 4), 0.8],
		[scale(num(row, "BPM"), -3, 5), 0.9],
	]);

const roleCertaintyComponent = (row) =>
	weightedAverage([
		[scale(num(row, "GP"), 20, 75), 0.9],
		[scale(num(row, "MPG"), 8, 30), 1.2],
		[scale(num(row, "starterShare"), 0, 0.85), 0.9],
		[scale(num(row, "valueNoPot"), 48, 66), 0.7],
		[scale(num(row, "EWA"), 0, 8), 0.6],
	]);

const futureUpsideComponent = (row) => {
	const age = num(row, "age");
	const potentialPremium = num(row, "potentialPremium", 0);
	const pot = num(row, "pot");
	const roleSupport = weightedAverage([
		[scale(num(row, "MPG"), 8, 26), 0.6],
		[scale(num(row, "BPM"), -3, 2), 0.5],
		[scale(num(row, "EWA"), 0, 5), 0.5],
	]);
	const upside =
		0.45 * scale(age, 27, 19) +
		0.3 * scale(pot, 58, 76) +
		0.25 * scale(potentialPremium, 0, 12);
	const potOnlyDiscount = roleSupport < 0.35 && upside > 0.6 ? 0.12 : 0;
	return bound(0.78 * upside + 0.22 * roleSupport - potOnlyDiscount, 0, 1);
};

const shootingPackage = (row) => {
	const comp3 = num(row, "comp_shootingThreePointer");
	const skill3 = num(row, "skill_3_margin");
	const efg = num(row, "eFG");
	const ts = num(row, "TS");
	const volumeRole = weightedAverage([
		[scale(num(row, "MPG"), 10, 28), 0.6],
		[scale(num(row, "USG"), 12, 24), 0.4],
	]);

	return weightedAverage([
		[Number.isFinite(comp3) ? scale(comp3, 0.5, 0.75) : undefined, 0.9],
		[Number.isFinite(skill3) ? scale(skill3, -0.04, 0.12) : undefined, 0.8],
		[scale(ts, 0.5, 0.63), 0.8],
		[scale(efg, 0.47, 0.6), 0.5],
		[volumeRole, 0.35],
	]);
};

const playmakingPackage = (row) =>
	weightedAverage([
		[scale(num(row, "comp_passing"), 0.45, 0.72), 0.8],
		[scale(num(row, "AST%"), 8, 28), 0.8],
		[scale(num(row, "AST"), 1, 7), 0.6],
		[scale(num(row, "OBPM"), -3, 3), 0.4],
	]);

const defenseReboundPackage = (row) => {
	const statSupport = isBig(row)
		? weightedAverage([
				[scale(num(row, "TRB"), 3, 10), 0.5],
				[scale(num(row, "BLK"), 0.2, 1.8), 0.5],
				[scale(num(row, "DBPM"), -1, 3), 0.5],
			])
		: weightedAverage([
				[scale(num(row, "STL"), 0.4, 1.5), 0.35],
				[scale(num(row, "DBPM"), -1, 2), 0.35],
				[scale(num(row, "TRB"), 2, 6), 0.2],
			]);

	return weightedAverage([
		[scale(num(row, "comp_defenseInterior"), 0.45, 0.72), 0.7],
		[scale(num(row, "comp_defensePerimeter"), 0.45, 0.72), 0.7],
		[scale(num(row, "comp_rebounding"), 0.45, 0.72), 0.55],
		[scale(num(row, "comp_blocking"), 0.45, 0.72), 0.45],
		[statSupport, 0.75],
	]);
};

const skillPortabilityComponent = (row) =>
	weightedAverage([
		[shootingPackage(row), 0.45],
		[playmakingPackage(row), isGuard(row) ? 0.25 : 0.16],
		[defenseReboundPackage(row), isBig(row) ? 0.35 : 0.22],
		[scale(num(row, "MPG"), 8, 28), 0.2],
		[scale(num(row, "TS"), 0.48, 0.6), 0.18],
	]);

const turnoverRiskInfo = (row) => {
	const tov = num(row, "TOV", 0);
	const usg = num(row, "USG", 0);
	const ast = num(row, "AST", 0);
	const astPct = num(row, "AST%", 0);
	const mpg = num(row, "MPG", 0);
	const creatorLoad = usg >= 24 || ast >= 5 || astPct >= 24;
	const realRole = mpg >= 16;

	if (tov >= 2.2 && creatorLoad && realRole) {
		return {
			flag: "high_turnover_creator_risk",
			penalty: bound((tov - 2.1) / 3.5, 0.04, 0.18),
		};
	}
	if (tov >= 1.4 && !creatorLoad && realRole) {
		return {
			flag: "high_turnover_role_player_risk",
			penalty: bound((tov - 1.3) / 2.2, 0.08, 0.28),
		};
	}
	return { flag: "", penalty: 0 };
};

const smallGuardDefenseRisk = (row) => {
	const pos = String(row.pos ?? "").toUpperCase();
	const guardOnly =
		isGuard(row) &&
		!pos.includes("SF") &&
		!pos.includes("F") &&
		!pos.includes("C");
	if (!guardOnly) return false;
	const noisyAdvancedDefense =
		num(row, "DBPM", -99) >= 1.1 || num(row, "On-Off", -99) >= 3.5;
	const weakPhysicalSupport =
		num(row, "BLK", 0) < 0.35 &&
		num(row, "TRB", 0) < 4.5 &&
		num(row, "comp_defensePerimeter", 0.55) < 0.62;
	return noisyAdvancedDefense && weakPhysicalSupport;
};

const archetypeRiskComponent = (row, flags) => {
	const turnover = turnoverRiskInfo(row);
	const lowEfficiencyRisk =
		num(row, "TS", 0.56) < 0.52 && num(row, "USG", 0) >= 18 ? 0.18 : 0;
	const lowRoleRisk =
		num(row, "MPG", 0) < 14 && num(row, "starterShare", 0) < 0.2 ? 0.16 : 0;
	const poorImpactRisk =
		num(row, "BPM", 0) < -2 || num(row, "PER", 12) < 9 ? 0.18 : 0;
	const guardDefenseRisk = smallGuardDefenseRisk(row) ? 0.12 : 0;
	const nonPortableShootingRisk =
		flags.includes("shooting_rating_without_role") ||
		flags.includes("low_efficiency_shooter_risk")
			? 0.1
			: 0;

	return bound(
		turnover.penalty +
			lowEfficiencyRisk +
			lowRoleRisk +
			poorImpactRisk +
			guardDefenseRisk +
			nonPortableShootingRisk,
		0,
		0.75,
	);
};

const ageYearsRiskComponent = (row, modelYears) => {
	const age = num(row, "age", 27);
	const yearsText = String(modelYears ?? "");
	const longTerm =
		yearsText.includes("4") ||
		yearsText.includes("5") ||
		num(row, "normalNoOptionContractYears", 0) >= 3;
	const ageRisk = scale(age, 29, 35, 0.25);
	const longTermAdd = longTerm && age >= 30 ? 0.12 : 0;
	const durabilityAdd = num(row, "GP", 82) < 45 ? 0.1 : 0;
	return bound(ageRisk + longTermAdd + durabilityAdd, 0, 0.75);
};

const productionReliabilityComponent = (row) =>
	weightedAverage([
		[scale(num(row, "GP"), 25, 75), 0.8],
		[scale(num(row, "MPG"), 8, 28), 0.8],
		[scale(num(row, "EWA"), 0, 8), 0.7],
		[scale(num(row, "VORP"), -0.5, 3), 0.5],
		[scale(num(row, "BPM"), -3, 3), 0.55],
		[scale(num(row, "PER"), 9, 18), 0.5],
	]);

const buildRiskFlags = (row) => {
	const flags = [];
	const age = num(row, "age");
	const pot = num(row, "pot");
	const potentialPremium = num(row, "potentialPremium", 0);
	const mpg = num(row, "MPG", 0);
	const bpm = num(row, "BPM", 0);
	const ewa = num(row, "EWA", 0);
	const per = num(row, "PER", 0);
	const ts = num(row, "TS");
	const turnover = turnoverRiskInfo(row);

	if (age <= 24 && pot >= 65 && potentialPremium >= 4) {
		if (mpg >= 18 && (bpm >= -0.5 || ewa >= 2 || per >= 14)) {
			flags.push("young_proven_positive");
		} else if (
			mpg >= 14 &&
			(ewa >= 1.5 || per >= 13) &&
			(ts < 0.54 || bpm < -1 || turnover.flag)
		) {
			flags.push("young_productive_but_risky");
		} else if (mpg < 16 || (bpm < -2 && ewa < 1)) {
			flags.push("young_pot_only");
		}

		if (ts < 0.51 && bpm < -2 && mpg < 20) {
			flags.push("young_bad_archetype_risk");
		}
	}

	if (smallGuardDefenseRisk(row)) {
		flags.push("small_guard_defense_stat_risk");
	}
	if (turnover.flag) {
		flags.push(turnover.flag);
	}

	const shoot = shootingPackage(row);
	if (shoot >= 0.68 && mpg >= 16 && ts >= 0.55) {
		flags.push("shooting_portable");
	} else if (shoot >= 0.64 && (mpg < 14 || ts < 0.53)) {
		flags.push("shooting_rating_without_role");
	}
	if (ts < 0.51 && num(row, "USG", 0) >= 16) {
		flags.push("low_efficiency_shooter_risk");
	}

	const defense = defenseReboundPackage(row);
	const lowUsage = num(row, "USG", 20) < 17 || num(row, "PTS", 12) < 10;
	if (
		mpg >= 18 &&
		lowUsage &&
		(defense >= 0.62 || num(row, "BPM", 0) >= 0.5 || num(row, "VORP", 0) >= 1)
	) {
		flags.push("non_scoring_impact_positive");
	}
	if (ts < 0.5 && num(row, "OBPM", 0) < -2) {
		flags.push("offensive_liability_risk");
	}
	if (defense >= 0.66 && !flags.includes("small_guard_defense_stat_risk")) {
		flags.push("defense_impact_supported");
	} else if (num(row, "DBPM", 0) >= 1.2 && defense < 0.58) {
		flags.push("defense_impact_noisy");
	}

	return [...new Set(flags)];
};

const yearsForV2 = (row, tier, v1Years, riskFlags) => {
	if (v1Years) return v1Years;
	const age = num(row, "age", 27);
	if (tier === "SUPERSTAR_MAX" || tier === "STAR_NEAR_MAX") return "4-5";
	if (tier === "YOUNG_PROVEN_STARTER") return "3-5";
	if (tier === "LOW_END_STARTER") return age <= 28 ? "2-4" : "1-3";
	if (
		riskFlags.includes("young_pot_only") ||
		riskFlags.includes("young_bad_archetype_risk")
	) {
		return "1-2";
	}
	if (age >= 31) return "1";
	if (tier === "MINIMUM_LEVEL") return "1";
	return "1-2";
};

const getBaseRange = (row, attrs) => {
	const debugTier = row.debugModelTier ?? row.sandboxModelTier ?? row.modelTier;
	const rangeText =
		row.debugModelRangeText ?? row.sandboxModelRangeText ?? row.modelRangeText;
	const parsed = parseModelRangeM(rangeText);
	if (debugTier && finite(parsed.minM) && finite(parsed.maxM)) {
		return {
			debugTier,
			debugRangeMinM: parsed.minM,
			debugRangeMaxM: parsed.maxM,
			debugRangeText:
				parsed.minM === parsed.maxM
					? `$${parsed.minM.toFixed(2)}M`
					: `$${parsed.minM.toFixed(2)}M-$${parsed.maxM.toFixed(2)}M`,
			v1Years: row.modelYears ?? "",
			v1Reason: row.debugModelReason ?? row.modelReason ?? "",
		};
	}

	const score = scoreTier(row);
	const range = tierRange(score.tier, row, attrs);
	return {
		debugTier: score.tier,
		debugRangeMinM: range.modelRangeMin / 1000,
		debugRangeMaxM: range.modelRangeMax / 1000,
		debugRangeText: range.modelRangeText,
		v1Years: range.modelYears,
		v1Reason: score.reason,
	};
};

const oldDemandSanity = ({ row, pointM, salaryCap }) => {
	const oldDemandM = num(row, "estimatedDemandNoRandom") / 1000;
	if (!Number.isFinite(oldDemandM) || !Number.isFinite(pointM)) {
		return {
			oldDemandSanityGapM: "",
			oldDemandSanityFlag: "missing",
		};
	}
	const gapM = oldDemandM - pointM;
	const gapCapPct = Math.abs(gapM * 1000) / salaryCap;
	let flag = "old_demand_close";
	if (Math.abs(gapM) >= 8 || gapCapPct >= 0.05) {
		flag = gapM > 0 ? "old_demand_much_higher" : "old_demand_much_lower";
	}
	return {
		oldDemandSanityGapM: gapM,
		oldDemandSanityFlag: flag,
	};
};

const tradeExploitAudit = ({ row, pointM, riskFlags, oldDemandSanityFlag }) => {
	const value = num(row, "value", 0);
	const valueNoPot = num(row, "valueNoPot", 0);
	const contractValue = num(row, "getContractValue", 0);
	const pot = num(row, "pot", 0);
	const highAssetSignal =
		value >= 62 ||
		valueNoPot >= 60 ||
		contractValue >= 60 ||
		(pot >= 68 && value >= 58);
	const cheapAsk =
		pointM <= 8 || pointM <= num(row, "estimatedDemandNoRandom", 0) / 1000 - 8;
	const riskyCheapAsset =
		riskFlags.includes("young_pot_only") ||
		riskFlags.includes("young_bad_archetype_risk") ||
		riskFlags.includes("shooting_rating_without_role") ||
		riskFlags.includes("high_turnover_role_player_risk");

	if (highAssetSignal && cheapAsk && riskyCheapAsset) {
		return {
			tradeExploitRiskFlag: "high",
			tradeExploitReason:
				"cheap v2 ask with high asset proxy and role/archetype risk; audit only, not used as ask input",
		};
	}
	if (highAssetSignal && cheapAsk) {
		return {
			tradeExploitRiskFlag: "medium",
			tradeExploitReason:
				"cheap v2 ask with high OVR/POT/value/contractValue proxy; audit only",
		};
	}
	if (oldDemandSanityFlag === "old_demand_much_higher" && highAssetSignal) {
		return {
			tradeExploitRiskFlag: "medium",
			tradeExploitReason:
				"v2 ask is far below old demand proxy for a high asset signal player; audit only",
		};
	}
	return {
		tradeExploitRiskFlag: highAssetSignal ? "low" : "none",
		tradeExploitReason: highAssetSignal
			? "asset proxy is notable, but v2 ask is not clearly cheap enough for a high audit flag"
			: "",
	};
};

export const scoreContractMarketV2 = (inputRow, attrs) => {
	const row = normalizeRow(inputRow);
	const salaryCap = attrs.salaryCap;
	const base = getBaseRange(row, attrs);
	const riskFlags = buildRiskFlags(row);
	const components = {
		currentImpactComponent: currentImpactComponent(row),
		roleCertaintyComponent: roleCertaintyComponent(row),
		futureUpsideComponent: futureUpsideComponent(row),
		skillPortabilityComponent: skillPortabilityComponent(row),
		archetypeRiskComponent: archetypeRiskComponent(row, riskFlags),
		ageYearsRiskComponent: ageYearsRiskComponent(row, base.v1Years),
		productionReliabilityComponent: productionReliabilityComponent(row),
	};

	const positivePlacement =
		components.currentImpactComponent * 0.28 +
		components.roleCertaintyComponent * 0.17 +
		components.futureUpsideComponent * 0.13 +
		components.skillPortabilityComponent * 0.14 +
		components.productionReliabilityComponent * 0.14 +
		(1 - components.archetypeRiskComponent) * 0.08 +
		(1 - components.ageYearsRiskComponent) * 0.06;
	const tierPlacementScore = bound(positivePlacement, 0.04, 0.96);
	const rangeWidthM = base.debugRangeMaxM - base.debugRangeMinM;
	const pointM =
		rangeWidthM <= 0
			? base.debugRangeMinM
			: base.debugRangeMinM + tierPlacementScore * rangeWidthM;
	const roundedPointM = round(pointM, 2);
	const debugYears = yearsForV2(row, base.debugTier, base.v1Years, riskFlags);
	const oldDemand = oldDemandSanity({
		row,
		pointM: roundedPointM,
		salaryCap,
	});
	const tradeExploit = tradeExploitAudit({
		row,
		pointM: roundedPointM,
		riskFlags,
		oldDemandSanityFlag: oldDemand.oldDemandSanityFlag,
	});

	return {
		debugTier: base.debugTier,
		debugRangeMinM: base.debugRangeMinM,
		debugRangeMaxM: base.debugRangeMaxM,
		debugRangeText: base.debugRangeText,
		debugPointEstimateM: roundedPointM,
		debugPointEstimateText: `$${roundedPointM.toFixed(2)}M`,
		debugYears,
		debugReason: [
			`v2 keeps v1 tier/range (${base.debugTier}) and places ask at ${pct(tierPlacementScore)} inside the range`,
			riskFlags.length > 0
				? `flags: ${riskFlags.join(", ")}`
				: "no major risk flags",
		].join("; "),
		tierPlacementScore,
		modelComponents: Object.fromEntries(
			Object.entries(components).map(([key, value]) => [key, round(value, 4)]),
		),
		riskFlags,
		riskFlagsText: riskFlags.join("; "),
		oldDemandSanityGapM: oldDemand.oldDemandSanityGapM,
		oldDemandSanityFlag: oldDemand.oldDemandSanityFlag,
		...tradeExploit,
	};
};

export const formatV2ForCsv = (v2) => ({
	...v2,
	modelComponents: JSON.stringify(v2.modelComponents),
	riskFlags: v2.riskFlags.join("; "),
});

export const v2SummaryLine = (v2) =>
	`${v2.debugTier} ${v2.debugRangeText}, point ${v2.debugPointEstimateText}, years ${v2.debugYears}`;

export { money };
