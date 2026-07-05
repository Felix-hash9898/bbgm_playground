#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	anchorEntriesFromNotes,
	bound,
	buildProxyRows,
	markdownTable,
	money,
	pct,
	readJsonIfExists,
	readSave,
	round,
	targetsByPid,
	writeCsv,
} from "./contract-market-proxy-core.mjs";

const root = process.cwd();
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);
const notesPath = path.join(root, "temp/bbgm_contract_review_notes_v3.json");
const validationHumanNotesPath = path.join(
	root,
	"temp/contract_market_validation20_human_notes.json",
);
const artifactsDir = path.join(root, "contract_market_artifacts");
const targetsPath = path.join(
	artifactsDir,
	"contract_market_anchor_targets.json",
);
const csvPath = path.join(artifactsDir, "contract_market_tier_score.csv");
const mdPath = path.join(artifactsDir, "contract_market_tier_score.md");

export const MODEL_TIERS = {
	MINIMUM_LEVEL: {
		rangeType: "minimumMultiplier",
		minMultiplier: 1,
		maxMultiplier: 1.15,
	},
	VETERAN_MINIMUM_PLUS: {
		rangeType: "capPct",
		min: "playerMinimum",
		maxPct: 0.035,
	},
	LOW_ROTATION_PLUS: {
		rangeType: "capPct",
		minPct: 0.02,
		maxPct: 0.035,
	},
	SPECIALIST_ROTATION: {
		rangeType: "capPct",
		minPct: 0.035,
		maxPct: 0.055,
	},
	YOUNG_UPSIDE_SUSPECT: {
		rangeType: "capPct",
		minPct: 0.025,
		maxPct: 0.045,
	},
	VETERAN_ROTATION_GUARD: {
		rangeType: "capPct",
		minPct: 0.04,
		maxPct: 0.06,
		years: "1-2",
	},
	LOW_END_STARTER: {
		rangeType: "capPct",
		minPct: 0.06,
		maxPct: 0.12,
	},
	HIGH_END_ROTATION: {
		rangeType: "capPct",
		minPct: 0.07,
		maxPct: 0.12,
	},
	SOLID_STARTER: {
		rangeType: "capPct",
		minPct: 0.12,
		maxPct: 0.17,
	},
	YOUNG_PROVEN_STARTER: {
		rangeType: "capPct",
		minPct: 0.17,
		maxPct: 0.225,
	},
	STAR_NEAR_MAX: {
		rangeType: "eligibleMaxPct",
		minPct: 0.88,
		maxPct: 1,
	},
	SUPERSTAR_MAX: {
		rangeType: "eligibleMaxPct",
		minPct: 1,
		maxPct: 1,
	},
};

const comparableTargetTier = (targetTier) => {
	if (targetTier === "VETERAN_MINIMUM_LEVEL") {
		return "MINIMUM_LEVEL";
	}
	if (targetTier === "LOW_END_STARTER_GUARD_LENGTH_RISK") {
		return "LOW_END_STARTER";
	}
	return targetTier;
};

const hasPosition = (row, token) => row.pos?.includes(token);

const isGuard = (row) => hasPosition(row, "G");

const isBig = (row) => hasPosition(row, "C") || hasPosition(row, "F");

export const featureFlags = (row) => ({
	establishedStarter: row.GP >= 50 && row.MPG >= 26 && row.starterShare >= 0.55,
	fullTimeStarter: row.GP >= 50 && row.MPG >= 28 && row.starterShare >= 0.75,
	limitedRotation: row.MPG < 16 || row.min < 1000,
	smallButRealRole: row.GP >= 40 && row.MPG >= 6 && row.MPG < 16,
	highProduction:
		row.PER >= 18 && row.EWA >= 5 && row.VORP >= 1 && row.BPM >= 1,
	starProduction:
		row.PER >= 20 && row.EWA >= 8 && row.VORP >= 3 && row.BPM >= 3,
	superstarProduction:
		row.PER >= 25 &&
		row.EWA >= 12 &&
		row.VORP >= 5 &&
		row.BPM >= 6 &&
		row.USG >= 28,
	poorProduction: row.PER < 10 || row.EWA < 0 || row.BPM < -2,
	shootingSpecialist:
		row.skill_3_margin >= 0.08 &&
		row.comp_shootingThreePointer >= 0.68 &&
		row.comp_usage >= 0.5,
	creatorGuard:
		isGuard(row) &&
		row["AST%"] >= 14 &&
		row.comp_passing >= 0.6 &&
		row.MPG >= 18,
	youngUpside:
		row.age <= 24 &&
		row.pot >= 65 &&
		row.potentialPremium >= 4 &&
		row.value >= 57,
	defenseOrReboundBig:
		isBig(row) &&
		(row.comp_rebounding >= 0.64 ||
			row.comp_defenseInterior >= 0.62 ||
			row.skill_R_margin >= 0.05 ||
			row.skill_Di_margin >= 0.05),
});

export const scoreBaseTier = (row) => {
	const flags = featureFlags(row);

	if (
		row.value >= 70 &&
		row.valueNoPot >= 67 &&
		row.getContractValue >= 68 &&
		flags.fullTimeStarter &&
		flags.superstarProduction &&
		row.comp_usage >= 0.7
	) {
		return {
			tier: "SUPERSTAR_MAX",
			reason:
				"elite BBGM value, full-time starter load, superstar production, and high usage composite",
		};
	}

	if (
		row.getContractValue >= 65 &&
		row.valueNoPot >= 65 &&
		flags.fullTimeStarter &&
		flags.starProduction
	) {
		return {
			tier: "STAR_NEAR_MAX",
			reason:
				"contractValue/valueNoPot clear star threshold with full starter role and strong EWA/VORP/BPM",
		};
	}

	if (
		row.age <= 26 &&
		flags.establishedStarter &&
		row.getContractValue >= 59 &&
		row.value >= 60 &&
		(flags.highProduction || row.BPM >= 1 || row.EWA >= 5)
	) {
		return {
			tier: "YOUNG_PROVEN_STARTER",
			reason:
				"young established starter with BBGM contractValue/value and production support",
		};
	}

	if (
		flags.establishedStarter &&
		row.valueNoPot >= 56 &&
		row.getContractValue >= 55 &&
		(row.PER >= 13 || row.EWA >= 2 || row.VORP >= 0.2)
	) {
		return {
			tier: "LOW_END_STARTER",
			reason:
				"starter role and adequate BBGM current value with at least neutral production support",
		};
	}

	if (
		row.age >= 28 &&
		flags.creatorGuard &&
		row.valueNoPot >= 52 &&
		row.PER >= 13 &&
		row.EWA >= 2
	) {
		return {
			tier: "VETERAN_ROTATION_GUARD",
			reason:
				"veteran guard creator profile with rotation minutes, passing composite, and positive production",
		};
	}

	if (flags.youngUpside && !flags.establishedStarter) {
		return {
			tier: "YOUNG_UPSIDE_SUSPECT",
			reason:
				"young player with pot/premium upside but not enough starter role or production certainty",
		};
	}

	if (
		flags.shootingSpecialist &&
		row.valueNoPot >= 50 &&
		row.GP >= 50 &&
		row.MPG >= 10
	) {
		return {
			tier: "SPECIALIST_ROTATION",
			reason:
				"rotation sample with strong shootingThreePointer composite and 3 skill margin",
		};
	}

	if (
		row.age >= 30 &&
		flags.defenseOrReboundBig &&
		row.PER >= 12 &&
		row.valueNoPot >= 50
	) {
		return {
			tier: "VETERAN_MINIMUM_PLUS",
			reason:
				"older frontcourt player with rebound/defense composite value but limited role/value ceiling",
		};
	}

	if (
		flags.smallButRealRole &&
		row.age < 30 &&
		row.valueNoPot >= 50 &&
		!flags.poorProduction
	) {
		return {
			tier: "LOW_ROTATION_PLUS",
			reason:
				"small but real regular-season role with non-poor production and BBGM current value above replacement",
		};
	}

	return {
		tier: "MINIMUM_LEVEL",
		reason:
			"falls through to minimum after role, production, age, and archetype checks",
	};
};

const num = (row, key, fallback = undefined) => {
	const value = row?.[key];
	if (value === "" || value === undefined || value === null) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const signal = (label, passed, weight = 1) => ({ label, passed, weight });

const supportScore = (entries) =>
	entries
		.filter((entry) => entry.passed)
		.reduce((total, entry) => total + entry.weight, 0);

const supportLabels = (entries) =>
	entries.filter((entry) => entry.passed).map((entry) => entry.label);

const defenseConnectorSupport = (row) => {
	const checks = [
		num(row, "comp_defenseInterior", 0) >= 0.62,
		num(row, "comp_defensePerimeter", 0) >= 0.62,
		num(row, "comp_rebounding", 0) >= 0.62,
		num(row, "comp_blocking", 0) >= 0.62,
		num(row, "comp_passing", 0) >= 0.58,
		num(row, "BPM", -99) >= 0.5 || num(row, "VORP", -99) >= 0.8,
	];
	return checks.filter(Boolean).length >= 2;
};

const shootingSpacingSupport = (row) =>
	num(row, "comp_shootingThreePointer", 0) >= 0.64 &&
	num(row, "skill_3_margin", -1) >= 0.04 &&
	num(row, "TS", 0) >= 0.54;

const hardFloorFailReasons1A = (row) => {
	const reasons = [];
	if (num(row, "GP", 0) < 45) reasons.push("GP < 45");
	if (num(row, "MPG", 0) < 18) reasons.push("MPG < 18");
	if (num(row, "valueNoPot", 0) < 52) reasons.push("valueNoPot < 52");
	if (num(row, "getContractValue", 0) < 52 && num(row, "value", 0) < 54) {
		reasons.push("contractValue < 52 and value < 54");
	}
	if (num(row, "PER", 12) < 9 && num(row, "BPM", 0) < -3) {
		reasons.push("PER < 9 and BPM < -3");
	}
	return reasons;
};

const minimumStrongerFloorFailReasons1A = (row) => {
	const reasons = [];
	if (num(row, "MPG", 0) < 22) reasons.push("minimum stronger floor: MPG < 22");
	if (num(row, "valueNoPot", 0) < 55) {
		reasons.push("minimum stronger floor: valueNoPot < 55");
	}
	if (num(row, "getContractValue", 0) < 55) {
		reasons.push("minimum stronger floor: contractValue < 55");
	}
	if (
		!(
			num(row, "EWA", 0) >= 2 ||
			num(row, "VORP", -99) >= 0.2 ||
			num(row, "BPM", -99) >= -0.5
		)
	) {
		reasons.push("minimum stronger floor: no neutral production");
	}
	return reasons;
};

const roleSignals1A = (row) => [
	signal(
		"strong rotation role: GP >= 50 and MPG >= 22",
		num(row, "GP", 0) >= 50 && num(row, "MPG", 0) >= 22,
	),
	signal("real role fallback: MPG >= 22", num(row, "MPG", 0) >= 22, 0.75),
	signal(
		"real role fallback: GP >= 55 and MPG >= 20",
		num(row, "GP", 0) >= 55 && num(row, "MPG", 0) >= 20,
		0.75,
	),
];

const coreIdentitySignals1A = (row) => [
	signal(
		"creator/scorer core",
		(num(row, "USG", 0) >= 22 && num(row, "PTS", 0) >= 12) ||
			num(row, "AST%", 0) >= 18 ||
			num(row, "AST", 0) >= 4,
	),
	signal(
		"portable shooting core",
		num(row, "comp_shootingThreePointer", 0) >= 0.64 &&
			num(row, "skill_3_margin", -1) >= 0.04 &&
			num(row, "TS", 0) >= 0.54,
	),
	signal(
		"young productive core",
		num(row, "age", 99) <= 25 &&
			num(row, "MPG", 0) >= 18 &&
			(num(row, "EWA", 0) >= 1.5 ||
				num(row, "BPM", -99) >= -1 ||
				num(row, "value", 0) >= 57),
	),
	signal(
		"connector/defense core",
		num(row, "MPG", 0) >= 20 &&
			(num(row, "valueNoPot", 0) >= 52 ||
				num(row, "getContractValue", 0) >= 52) &&
			supportScore([
				signal(
					"defense interior composite",
					num(row, "comp_defenseInterior", 0) >= 0.62,
				),
				signal(
					"defense perimeter composite",
					num(row, "comp_defensePerimeter", 0) >= 0.62,
				),
				signal("rebounding composite", num(row, "comp_rebounding", 0) >= 0.62),
				signal("blocking composite", num(row, "comp_blocking", 0) >= 0.62),
				signal("passing composite", num(row, "comp_passing", 0) >= 0.58, 0.75),
				signal(
					"impact stat support",
					num(row, "BPM", -99) >= 0 || num(row, "VORP", -99) >= 0.5,
					0.75,
				),
			]) >= 2,
	),
];

const valueProductionSignals1A = (row) => [
	signal("value support: valueNoPot >= 55", num(row, "valueNoPot", 0) >= 55),
	signal(
		"value support: contractValue >= 55",
		num(row, "getContractValue", 0) >= 55,
	),
	signal(
		"production support: EWA/VORP/BPM/PER",
		num(row, "EWA", 0) >= 2 ||
			num(row, "VORP", -99) >= 0.2 ||
			num(row, "BPM", -99) >= -0.5 ||
			num(row, "PER", 0) >= 14,
	),
];

const highEndRotationCheck = (row, baseTier) => {
	const hardFloorFails = hardFloorFailReasons1A(row);
	const minimumFloorFails =
		baseTier === "MINIMUM_LEVEL" ? minimumStrongerFloorFailReasons1A(row) : [];
	const protectedStarterTier = [
		"SUPERSTAR_MAX",
		"STAR_NEAR_MAX",
		"YOUNG_PROVEN_STARTER",
		"LOW_END_STARTER",
	].includes(baseTier);
	const role = roleSignals1A(row);
	const core = coreIdentitySignals1A(row);
	const valueProduction = valueProductionSignals1A(row);
	const supportEntries = [
		...role.filter((entry) => entry.passed),
		...core.filter((entry) => entry.passed),
		...valueProduction.filter((entry) => entry.passed),
	];
	const score = supportScore(supportEntries);
	const failReasons = [
		...hardFloorFails,
		...minimumFloorFails,
		protectedStarterTier
			? "protected current starter/star tier; 1A only tests below LOW_END_STARTER"
			: "",
		supportScore(role) >= 0.75 ? "" : "missing real role support",
		core.some((entry) => entry.passed) ? "" : "missing core identity",
		valueProduction.some((entry) => entry.passed)
			? ""
			: "missing value/production support",
		score >= 3 ? "" : "support score < 3",
	].filter(Boolean);

	return {
		passed: failReasons.length === 0,
		failReasons,
		supportScore: score,
		passedSignals: supportEntries.map((entry) => entry.label),
		reason: [
			"V3-1A HIGH_END_ROTATION: hard floor + real role + core identity + value/production support",
			`core: ${supportLabels(core).join("; ") || "none"}`,
			`support: ${[...supportLabels(role), ...supportLabels(valueProduction)].join("; ") || "none"}`,
		].join(" | "),
	};
};

const roleSignals1B = (row) => [
	signal("role: starterShare >= 0.65", num(row, "starterShare", 0) >= 0.65),
	signal("role: GS >= 50", num(row, "GS", 0) >= 50),
	signal("role: MPG >= 31", num(row, "MPG", 0) >= 31),
];

const productionSignals1B = (row) => [
	signal("production: BPM >= 1", num(row, "BPM", -99) >= 1),
	signal("production: EWA >= 5", num(row, "EWA", 0) >= 5),
	signal("production: VORP >= 1", num(row, "VORP", -99) >= 1),
	signal("production: PER >= 16", num(row, "PER", 0) >= 16),
];

const extraSignals1B = (row) => [
	signal("extra: BPM >= 1.5", num(row, "BPM", -99) >= 1.5),
	signal("extra: EWA >= 6", num(row, "EWA", 0) >= 6),
	signal("extra: VORP >= 1.5", num(row, "VORP", -99) >= 1.5),
	signal("extra: PER >= 17", num(row, "PER", 0) >= 17),
	signal(
		"extra: defense/rebounding/connector support",
		defenseConnectorSupport(row),
	),
	signal("extra: shooting/spacing support", shootingSpacingSupport(row)),
	signal(
		"extra: age <= 27 with value/pot support",
		num(row, "age", 99) <= 27 &&
			(num(row, "value", 0) >= 58 || num(row, "pot", 0) >= 65),
	),
];

const exceptionSignals1B = (row) => [
	signal("exception: MPG >= 30", num(row, "MPG", 0) >= 30),
	signal("exception: valueNoPot >= 61", num(row, "valueNoPot", 0) >= 61),
	signal(
		"exception: contractValue >= 61",
		num(row, "getContractValue", 0) >= 61,
	),
	signal(
		"exception: strong production",
		num(row, "EWA", 0) >= 5 ||
			num(row, "VORP", -99) >= 1 ||
			num(row, "PER", 0) >= 17,
	),
	signal(
		"exception: portable support",
		defenseConnectorSupport(row) || shootingSpacingSupport(row),
	),
	signal("exception: PER >= 12", num(row, "PER", 0) >= 12),
];

const solidStarterCheck = (row, baseTier) => {
	const failReasons = [];
	if (baseTier !== "LOW_END_STARTER")
		failReasons.push(`current tier ${baseTier} blocked`);
	if (num(row, "GP", 0) < 55) failReasons.push("GP < 55");
	if (num(row, "MPG", 0) < 29) failReasons.push("MPG < 29");
	if (num(row, "valueNoPot", 0) < 60) failReasons.push("valueNoPot < 60");
	if (num(row, "getContractValue", 0) < 60) {
		failReasons.push("contractValue < 60");
	}

	const role = roleSignals1B(row);
	const production = productionSignals1B(row);
	const extra = extraSignals1B(row);
	const productionCount = production.filter((entry) => entry.passed).length;
	const exception =
		num(row, "BPM", 0) < 0 &&
		baseTier === "LOW_END_STARTER" &&
		exceptionSignals1B(row).every((entry) => entry.passed);

	if (!role.some((entry) => entry.passed))
		failReasons.push("missing role core");
	if (productionCount < 2) failReasons.push("production core count < 2");
	if (!extra.some((entry) => entry.passed))
		failReasons.push("missing extra support");
	if (num(row, "BPM", 0) < 0 && !exception) {
		failReasons.push("BPM < 0 without exception path");
	}

	const passedSignals = [
		...supportLabels(role),
		"value core: valueNoPot >= 60 and contractValue >= 60",
		...supportLabels(production),
		...supportLabels(extra),
		exception ? "BPM<0 exception path" : "",
	].filter(Boolean);

	return {
		passed: failReasons.length === 0,
		failReasons,
		productionCount,
		exception,
		passedSignals,
		reason: [
			"V3-1B-narrow-B SOLID_STARTER bridge",
			`role: ${supportLabels(role).join("; ") || "none"}`,
			`production ${productionCount}/2: ${supportLabels(production).join("; ") || "none"}`,
			`extra: ${supportLabels(extra).join("; ") || "none"}`,
			exception ? "BPM<0 exception path" : "",
		]
			.filter(Boolean)
			.join(" | "),
	};
};

export const scoreTier = (row) => {
	const base = scoreBaseTier(row);
	const oneA = highEndRotationCheck(row, base.tier);
	const oneB = solidStarterCheck(row, base.tier);

	if (oneA.passed && oneB.passed) {
		return {
			tier: "SOLID_STARTER",
			reason: `CONFLICT: ${oneA.reason} || ${oneB.reason}`,
			baseTier: base.tier,
			baseReason: base.reason,
			responsibleModule: "conflict",
			conflict: "yes",
			passedSignals: [...oneA.passedSignals, ...oneB.passedSignals],
			failReasons: [],
		};
	}

	if (oneB.passed) {
		return {
			tier: "SOLID_STARTER",
			reason: oneB.reason,
			baseTier: base.tier,
			baseReason: base.reason,
			responsibleModule: "1B-B",
			conflict: "no",
			passedSignals: oneB.passedSignals,
			failReasons: oneB.failReasons,
		};
	}

	if (oneA.passed) {
		return {
			tier: "HIGH_END_ROTATION",
			reason: oneA.reason,
			baseTier: base.tier,
			baseReason: base.reason,
			responsibleModule: "1A",
			conflict: "no",
			passedSignals: oneA.passedSignals,
			failReasons: oneA.failReasons,
		};
	}

	return {
		...base,
		baseTier: base.tier,
		baseReason: base.reason,
		responsibleModule: "none",
		conflict: "no",
		passedSignals: [],
		failReasons: [
			...oneA.failReasons.map((reason) => `1A: ${reason}`),
			...oneB.failReasons.map((reason) => `1B-B: ${reason}`),
		],
	};
};

export const tierRange = (tier, row, attrs) => {
	const spec = MODEL_TIERS[tier];
	if (!spec) {
		throw new Error(`Unknown model tier ${tier}`);
	}

	let min;
	let max;
	if (spec.rangeType === "minimumMultiplier") {
		min = row.minContractForPlayer * spec.minMultiplier;
		max = row.minContractForPlayer * spec.maxMultiplier;
	} else if (spec.rangeType === "capPct") {
		min =
			spec.min === "playerMinimum"
				? row.minContractForPlayer
				: attrs.salaryCap * spec.minPct;
		max = attrs.salaryCap * spec.maxPct;
	} else if (spec.rangeType === "eligibleMaxPct") {
		min = row.eligibleMax * spec.minPct;
		max = row.eligibleMax * spec.maxPct;
	}

	min = Math.max(row.minContractForPlayer, min);
	max = Math.max(min, max);

	return {
		modelRangeMin: Math.round(min),
		modelRangeMax: Math.round(max),
		modelRangeCapMin: min / attrs.salaryCap,
		modelRangeCapMax: max / attrs.salaryCap,
		modelYears: spec.years ?? "",
		modelRangeText:
			min === max
				? money(Math.round(min))
				: `${money(Math.round(min))}-${money(Math.round(max))}`,
		modelCapRangeText:
			min === max
				? pct(min / attrs.salaryCap)
				: `${pct(min / attrs.salaryCap)}-${pct(max / attrs.salaryCap)}`,
	};
};

const finite = (value) => Number.isFinite(Number(value));

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

const normalizePlacementRow = (row) => {
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
		normalNoOptionContractYears: num(
			row,
			"normalNoOptionContractYears",
			num(row, "currentNoOptionYears"),
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

const yearsForPlacement = (row, tier, tierYears, riskFlags) => {
	if (tierYears) return tierYears;
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

export const scoreContractMarketPlacement = (inputRow, attrs, options = {}) => {
	const row = normalizePlacementRow(inputRow);
	const score = options.score ?? scoreTier(row);
	const range = options.range ?? tierRange(score.tier, row, attrs);
	const riskFlags = buildRiskFlags(row);
	const components = {
		currentImpactComponent: currentImpactComponent(row),
		roleCertaintyComponent: roleCertaintyComponent(row),
		futureUpsideComponent: futureUpsideComponent(row),
		skillPortabilityComponent: skillPortabilityComponent(row),
		archetypeRiskComponent: archetypeRiskComponent(row, riskFlags),
		ageYearsRiskComponent: ageYearsRiskComponent(row, range.modelYears),
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
	const rangeMinM = range.modelRangeMin / 1000;
	const rangeMaxM = range.modelRangeMax / 1000;
	const rangeWidthM = rangeMaxM - rangeMinM;
	const pointM =
		rangeWidthM <= 0 ? rangeMinM : rangeMinM + tierPlacementScore * rangeWidthM;
	const roundedPointM = round(pointM, 2);
	const modelYears = yearsForPlacement(
		row,
		score.tier,
		range.modelYears,
		riskFlags,
	);

	return {
		modelTier: score.tier,
		modelRangeMinM: rangeMinM,
		modelRangeMaxM: rangeMaxM,
		modelPointEstimateM: roundedPointM,
		modelPointAmount: Math.round(roundedPointM * 1000),
		modelPointCapPct: (roundedPointM * 1000) / attrs.salaryCap,
		modelPointText: `$${roundedPointM.toFixed(2)}M`,
		modelYears,
		tierPlacementScore,
		modelComponents: Object.fromEntries(
			Object.entries(components).map(([key, value]) => [key, round(value, 4)]),
		),
		riskFlags,
		riskFlagsText: riskFlags.join("; "),
		modelPlacementReason: [
			`v2 placement keeps formal tier/range (${score.tier}) and places ask at ${pct(tierPlacementScore)} inside the range`,
			riskFlags.length > 0
				? `flags: ${riskFlags.join(", ")}`
				: "no major risk flags",
		].join("; "),
	};
};

const targetRangeK = (target, row) => {
	if (!Array.isArray(target?.targetRangeM)) {
		return {};
	}

	const [rawMin, rawMax] = target.targetRangeM;
	const min =
		rawMin === null || rawMin === undefined
			? row.minContractForPlayer
			: rawMin * 1000;
	const unclampedMax =
		rawMax === null || rawMax === undefined
			? row.minContractForPlayer
			: rawMax * 1000;
	const max = Math.max(min, unclampedMax);

	return {
		targetRangeMin: min,
		targetRangeMax: max,
		targetRangeText: min === max ? money(min) : `${money(min)}-${money(max)}`,
	};
};

const rangesOverlap = (aMin, aMax, bMin, bMax) => {
	const tolerance = 100;
	return aMin <= bMax + tolerance && bMin <= aMax + tolerance;
};

const evaluateHit = (row, target, score, range) => {
	const comparableTier = comparableTargetTier(target?.targetTier);
	const tierHit = score.tier === comparableTier;
	const targetRange = targetRangeK(target, row);
	const rangeHit =
		targetRange.targetRangeMin === undefined
			? true
			: rangesOverlap(
					range.modelRangeMin,
					range.modelRangeMax,
					targetRange.targetRangeMin,
					targetRange.targetRangeMax,
				);
	const lengthRiskMiss =
		target?.targetTier === "LOW_END_STARTER_GUARD_LENGTH_RISK" &&
		row.normalNoOptionContractYears > 2;
	const hit = tierHit && rangeHit && !lengthRiskMiss;

	const missReasons = [];
	if (!tierHit) {
		missReasons.push(`tier ${score.tier} vs target ${target.targetTier}`);
	}
	if (!rangeHit) {
		missReasons.push(
			`model range ${range.modelRangeText} does not overlap target ${targetRange.targetRangeText}`,
		);
	}
	if (lengthRiskMiss) {
		missReasons.push(
			`AAV aligns with starter tier, but ${row.normalNoOptionContractYears}-year guard length risk is not modeled by base tiers`,
		);
	}

	return {
		comparableTargetTier: comparableTier,
		hit,
		hitStatus: hit ? "HIT" : "MISS",
		rangeHit,
		targetRangeText: targetRange.targetRangeText ?? "",
		tierHit,
		missReason: missReasons.join("; "),
	};
};

export const scoreRows = ({ proxyRows, targets, attrs }) => {
	const targetByPid = targetsByPid(targets);
	return proxyRows.map((row) => {
		const target = targetByPid[row.pid];
		const score = scoreTier(row);
		const range = tierRange(score.tier, row, attrs);
		const placement = scoreContractMarketPlacement(row, attrs, {
			score,
			range,
		});
		const evaluation = evaluateHit(row, target, score, range);
		const modelMid = (range.modelRangeMin + range.modelRangeMax) / 2;

		return {
			...row,
			modelTier: score.tier,
			baseModelTier: score.baseTier ?? score.tier,
			responsibleModule: score.responsibleModule ?? "none",
			conflict: score.conflict ?? "no",
			modelReason: score.reason,
			...range,
			modelYears: placement.modelYears,
			modelMidAmount: modelMid,
			modelMidCapPct: modelMid / attrs.salaryCap,
			modelPointAmount: placement.modelPointAmount,
			modelPointEstimateM: placement.modelPointEstimateM,
			modelPointText: placement.modelPointText,
			modelPointCapPct: placement.modelPointCapPct,
			tierPlacementScore: placement.tierPlacementScore,
			modelPlacementReason: placement.modelPlacementReason,
			modelComponents: JSON.stringify(placement.modelComponents),
			riskFlags: placement.riskFlagsText,
			targetTierOriginal: target?.targetTier,
			targetTierComparable: evaluation.comparableTargetTier,
			targetRangeText: evaluation.targetRangeText,
			hitStatus: evaluation.hitStatus,
			tierHit: evaluation.tierHit,
			rangeHit: evaluation.rangeHit,
			missReason: evaluation.missReason,
		};
	});
};

const main = () => {
	const save = readSave(savePath);
	const notes = readJsonIfExists(notesPath, {});
	const targets = readJsonIfExists(targetsPath, []);
	const validationHumanNotes = readJsonIfExists(validationHumanNotesPath, {});
	fs.mkdirSync(artifactsDir, { recursive: true });
	const anchorEntries = anchorEntriesFromNotes(notes);
	const { attrs, rows: proxyRows } = buildProxyRows({
		root,
		save,
		anchorEntries,
		targetByPid: targetsByPid(targets),
	});
	const scoredRows = scoreRows({ proxyRows, targets, attrs });

	const columnOrder = [
		"pid",
		"name",
		"age",
		"pos",
		"targetTierOriginal",
		"targetTierComparable",
		"targetRangeText",
		"baseModelTier",
		"modelTier",
		"responsibleModule",
		"modelRangeText",
		"modelCapRangeText",
		"modelYears",
		"modelPointText",
		"modelPointCapPct",
		"tierPlacementScore",
		"hitStatus",
		"missReason",
		"modelReason",
		"modelPlacementReason",
		"riskFlags",
		"normalNoOptionContractAmount",
		"normalNoOptionContractYears",
		"normalNoOptionContractCapPct",
		"rawContractAmount",
		"rawContractYears",
		"rawContractOption",
		"minContractForPlayer",
		"eligibleMax",
		"estimatedDemandNoRandom",
		"getContractValue",
		"valueNoPot",
		"value",
		"potentialPremium",
		"GP",
		"MPG",
		"starterShare",
		"PER",
		"EWA",
		"VORP",
		"BPM",
		"OBPM",
		"DBPM",
		"On-Off",
		"USG",
		"AST%",
		"TRB%",
		"DRB%",
		"ORB%",
		"STL%",
		"BLK%",
		"comp_usage",
		"comp_passing",
		"comp_dribbling",
		"comp_shootingThreePointer",
		"comp_rebounding",
		"comp_offensiveRebounding",
		"comp_defensiveRebounding",
		"comp_defenseInterior",
		"comp_defensePerimeter",
		"comp_blocking",
		"comp_athleticism",
		"skill_3_margin",
		"skill_Ps_margin",
		"skill_R_margin",
		"skill_Di_margin",
		"skill_Dp_margin",
		"skill_A_margin",
	];

	writeCsv(csvPath, scoredRows, columnOrder);

	const summaryColumns = [
		{ key: "pid", label: "pid" },
		{ key: "name", label: "player" },
		{ key: "targetTierOriginal", label: "target tier" },
		{ key: "baseModelTier", label: "base tier" },
		{ key: "modelTier", label: "model tier" },
		{ key: "responsibleModule", label: "module" },
		{ key: "targetRangeText", label: "target range" },
		{ key: "modelRangeText", label: "model range" },
		{ key: "modelPointText", label: "model point" },
		{ key: "modelCapRangeText", label: "model cap%" },
		{ key: "modelYears", label: "years" },
		{ key: "hitStatus", label: "hit/miss" },
		{ key: "missReason", label: "miss reason" },
	];

	const proxyColumns = [
		{ key: "pid", label: "pid" },
		{ key: "name", label: "player" },
		{ key: "baseModelTier", label: "base tier" },
		{ key: "modelTier", label: "model tier" },
		{ key: "modelPointText", label: "point" },
		{
			key: "normalNoOptionContractAmount",
			label: "normal current",
			format: money,
		},
		{ key: "estimatedDemandNoRandom", label: "demand", format: money },
		{
			key: "getContractValue",
			label: "contractValue",
			format: (v) => round(v, 1),
		},
		{ key: "valueNoPot", label: "valueNoPot", format: (v) => round(v, 1) },
		{ key: "value", label: "value", format: (v) => round(v, 1) },
		{ key: "MPG", label: "MPG", format: (v) => round(v, 1) },
		{ key: "starterShare", label: "start%", format: pct },
		{ key: "PER", label: "PER", format: (v) => round(v, 1) },
		{ key: "EWA", label: "EWA", format: (v) => round(v, 1) },
		{ key: "BPM", label: "BPM", format: (v) => round(v, 1) },
	];

	const misses = scoredRows.filter((row) => row.hitStatus !== "HIT");
	const missText =
		misses.length === 0
			? "- No misses in the 15-anchor sandbox."
			: misses
					.map(
						(row) =>
							`- ${row.name}: ${row.missReason}. Rule fired because ${row.modelReason}.`,
					)
					.join("\n");

	const hitCount = scoredRows.length - misses.length;
	const md = `# Contract Market Tier Scoring Sandbox

Inputs:

- \`${path.relative(root, savePath)}\`
- \`${path.relative(root, targetsPath)}\`

Scope: sandbox only. No \`src\` changes. Proxy calculations are imported from \`tools/contract-market-proxy-core.mjs\`, the same helper used by \`tools/contract-market-proxy-explore.mjs\`.

Hit rate on these anchors: ${hitCount}/${scoredRows.length}. Hit means model tier matches the comparable manual target and model amount range overlaps the manual target range when one is specified. \`LOW_END_STARTER_GUARD_LENGTH_RISK\` is intentionally marked miss if the current normal/no-option guard length is still risky.

Validation human notes input: \`${path.relative(root, validationHumanNotesPath)}\` (${Object.keys(validationHumanNotes).length} entries loaded if present). This script is ready to read validation20 export JSON, but anchor tier scoring below only uses the fixed anchor targets.

## Anchor Results

${markdownTable(scoredRows, summaryColumns)}

## Key Proxy Snapshot

${markdownTable(scoredRows, proxyColumns)}

## Miss Reasons

${missText}

## Tier Range Rules

| tier | amount range |
| --- | --- |
| MINIMUM_LEVEL | player minimum to 1.15x player minimum |
| VETERAN_MINIMUM_PLUS | player minimum to 3.5% cap |
| LOW_ROTATION_PLUS | 2.0%-3.5% cap |
| SPECIALIST_ROTATION | 3.5%-5.5% cap |
| YOUNG_UPSIDE_SUSPECT | 2.5%-4.5% cap |
| VETERAN_ROTATION_GUARD | 4.0%-6.0% cap, length 1-2 years |
| LOW_END_STARTER | 6.0%-12.0% cap |
| HIGH_END_ROTATION | 7.0%-12.0% cap |
| SOLID_STARTER | 12.0%-17.0% cap |
| YOUNG_PROVEN_STARTER | 17.0%-22.5% cap |
| STAR_NEAR_MAX | 88%-100% eligible max |
| SUPERSTAR_MAX | 100% eligible max |

## Rules That Need Validation

- Formal point estimates use the migrated V2 placement layer: after the formal tier/range is selected, component scoring places the ask within that range rather than using the midpoint.
- \`HIGH_END_ROTATION\` is limited to V3-1A candidates below current \`LOW_END_STARTER\`; it does not create a broad \`HIGH_IMPACT_STARTER\` tier.
- \`SOLID_STARTER\` is limited to the V3-1B-narrow-B subset of current \`LOW_END_STARTER\`; no broad 1C layer is enabled.
- The thresholds for \`YOUNG_PROVEN_STARTER\` vs \`STAR_NEAR_MAX\` are still coarse. They lean on \`getContractValue\`, \`valueNoPot\`, starter load, and EWA/VORP/BPM, but need a larger validation set around upper-end starters.
- \`LOW_END_STARTER\` currently treats starter role plus BBGM current value as enough. It needs validation for inefficient starters with strong minutes but weak impact stats.
- \`YOUNG_UPSIDE_SUSPECT\` uses potential premium and pot with role uncertainty. This should be checked against young athletic wings/guards who start because of roster context.
- \`VETERAN_ROTATION_GUARD\` has an explicit 1-2 year length rule, but other tiers do not yet model length risk. The London Perrantes style target shows that AAV and term need separate scoring.
- Specialist scoring uses 3pt composite and skill margin. It needs validation for defensive specialists, rebound-only bigs, and pass-first bench guards so specialist tiers do not become shooting-only.
- \`On-Off\` is included as context but deliberately not a hard tier splitter. A larger set should determine whether it adds signal after minutes and EWA/VORP/BPM.
`;

	fs.writeFileSync(mdPath, md);

	console.log(`Wrote ${path.relative(root, csvPath)}`);
	console.log(`Wrote ${path.relative(root, mdPath)}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
