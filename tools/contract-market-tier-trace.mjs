#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csvParse } from "d3-dsv";
import {
	buildProxyRows,
	markdownTable,
	money,
	pct,
	readSave,
	round,
	writeCsv,
} from "./contract-market-proxy-core.mjs";
import {
	MODEL_TIERS,
	featureFlags,
	scoreTier,
} from "./contract-market-tier-score.mjs";

const root = process.cwd();
const artifactsDir = path.join(root, "contract_market_artifacts");
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);

const datasets = [
	{
		dataset: "boundary40",
		v2Path: path.join(artifactsDir, "contract_market_boundary40_v2_score.csv"),
		evalPath: path.join(
			artifactsDir,
			"contract_market_boundary40_v1_v2_comparable_eval.csv",
		),
	},
	{
		dataset: "validation20",
		v2Path: path.join(
			artifactsDir,
			"contract_market_validation20_v2_score.csv",
		),
		evalPath: path.join(
			artifactsDir,
			"contract_market_validation20_v1_v2_comparable_eval.csv",
		),
	},
];

const traceCsvPath = path.join(
	artifactsDir,
	"contract_market_tier_trace_all_cases.csv",
);
const summaryMdPath = path.join(
	artifactsDir,
	"contract_market_tier_trace_summary.md",
);
const explainerMdPath = path.join(
	root,
	"temp/contract_market_mechanism_explainer.md",
);
const attributionMdPath = path.join(
	root,
	"temp/contract_market_mechanism_failure_attribution.md",
);

const numericFields = new Set([
	"pid",
	"humanAmountMinM",
	"humanAmountMaxM",
	"humanMidpointM",
	"humanAmountMidpointM",
	"v1RangeMinM",
	"v1RangeMaxM",
	"v1PointM",
	"v2PointM",
	"debugPointEstimateM",
	"v1PointGapToHumanRangeM",
	"v2PointGapToHumanRangeM",
	"deltaPointGapM",
	"tierPlacementScore",
	"eligibleMax",
	"minContractForPlayer",
]);

const readCsv = (csvPath) =>
	csvParse(fs.readFileSync(csvPath, "utf8")).map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => {
				if (numericFields.has(key) && value !== "") {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) return [key, parsed];
				}
				return [key, value];
			}),
		),
	);

const finite = (value) => Number.isFinite(Number(value));

const num = (row, key) => {
	const value = row?.[key];
	if (value === "" || value === undefined || value === null) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const condition = ({
	label,
	field,
	value,
	threshold,
	op = ">=",
	marginScale,
}) => {
	const missing = !Number.isFinite(value);
	let passed = false;
	let margin = "";
	if (!missing) {
		if (op === ">=") {
			passed = value >= threshold;
			margin =
				(value - threshold) / (marginScale ?? Math.max(Math.abs(threshold), 1));
		} else if (op === "<=") {
			passed = value <= threshold;
			margin =
				(threshold - value) / (marginScale ?? Math.max(Math.abs(threshold), 1));
		}
	}
	return {
		label,
		field,
		value: Number.isFinite(value) ? round(value, 3) : "",
		threshold,
		op,
		passed,
		margin: Number.isFinite(margin) ? round(margin, 4) : "",
		missing,
	};
};

const boolCondition = ({ label, fields = [], passed, detail = "" }) => ({
	label,
	field: fields.join("+"),
	value: detail,
	threshold: "true",
	op: "is",
	passed: Boolean(passed),
	margin: passed ? 1 : -1,
	missing: false,
});

const anyCondition = ({ label, conditions }) => {
	const passed = conditions.some((entry) => entry.passed);
	const bestMargin = conditions
		.map((entry) => Number(entry.margin))
		.filter(Number.isFinite)
		.sort((a, b) => b - a)[0];
	return {
		label,
		field: conditions
			.map((entry) => entry.field)
			.filter(Boolean)
			.join("|"),
		value: conditions
			.map((entry) => `${entry.label}:${entry.value}`)
			.join("; "),
		threshold: "any",
		op: "any",
		passed,
		margin: Number.isFinite(bestMargin) ? round(bestMargin, 4) : "",
		missing: conditions.every((entry) => entry.missing),
		children: conditions,
	};
};

const establishedStarterConditions = (row) => [
	condition({
		label: "GP >= 50",
		field: "GP",
		value: num(row, "GP"),
		threshold: 50,
	}),
	condition({
		label: "MPG >= 26",
		field: "MPG",
		value: num(row, "MPG"),
		threshold: 26,
	}),
	condition({
		label: "starterShare >= 0.55",
		field: "starterShare",
		value: num(row, "starterShare"),
		threshold: 0.55,
		marginScale: 1,
	}),
];

const fullTimeStarterConditions = (row) => [
	condition({
		label: "GP >= 50",
		field: "GP",
		value: num(row, "GP"),
		threshold: 50,
	}),
	condition({
		label: "MPG >= 28",
		field: "MPG",
		value: num(row, "MPG"),
		threshold: 28,
	}),
	condition({
		label: "starterShare >= 0.75",
		field: "starterShare",
		value: num(row, "starterShare"),
		threshold: 0.75,
		marginScale: 1,
	}),
];

const highProductionConditions = (row) => [
	condition({
		label: "PER >= 18",
		field: "PER",
		value: num(row, "PER"),
		threshold: 18,
	}),
	condition({
		label: "EWA >= 5",
		field: "EWA",
		value: num(row, "EWA"),
		threshold: 5,
	}),
	condition({
		label: "VORP >= 1",
		field: "VORP",
		value: num(row, "VORP"),
		threshold: 1,
	}),
	condition({
		label: "BPM >= 1",
		field: "BPM",
		value: num(row, "BPM"),
		threshold: 1,
	}),
];

const starProductionConditions = (row) => [
	condition({
		label: "PER >= 20",
		field: "PER",
		value: num(row, "PER"),
		threshold: 20,
	}),
	condition({
		label: "EWA >= 8",
		field: "EWA",
		value: num(row, "EWA"),
		threshold: 8,
	}),
	condition({
		label: "VORP >= 3",
		field: "VORP",
		value: num(row, "VORP"),
		threshold: 3,
	}),
	condition({
		label: "BPM >= 3",
		field: "BPM",
		value: num(row, "BPM"),
		threshold: 3,
	}),
];

const superstarProductionConditions = (row) => [
	condition({
		label: "PER >= 25",
		field: "PER",
		value: num(row, "PER"),
		threshold: 25,
	}),
	condition({
		label: "EWA >= 12",
		field: "EWA",
		value: num(row, "EWA"),
		threshold: 12,
	}),
	condition({
		label: "VORP >= 5",
		field: "VORP",
		value: num(row, "VORP"),
		threshold: 5,
	}),
	condition({
		label: "BPM >= 6",
		field: "BPM",
		value: num(row, "BPM"),
		threshold: 6,
	}),
	condition({
		label: "USG >= 28",
		field: "USG",
		value: num(row, "USG"),
		threshold: 28,
	}),
];

const allPassed = (conditions) => conditions.every((entry) => entry.passed);

const v1TierGateDefinitions = (row) => {
	const flags = featureFlags(row);
	const isGuard = String(row.pos ?? "").includes("G");
	const isBig =
		String(row.pos ?? "").includes("C") || String(row.pos ?? "").includes("F");
	const fullTime = fullTimeStarterConditions(row);
	const established = establishedStarterConditions(row);
	const highProd = highProductionConditions(row);
	const starProd = starProductionConditions(row);
	const superstarProd = superstarProductionConditions(row);
	const starterSupport = anyCondition({
		label: "PER >= 13 OR EWA >= 2 OR VORP >= 0.2",
		conditions: [
			condition({
				label: "PER >= 13",
				field: "PER",
				value: num(row, "PER"),
				threshold: 13,
			}),
			condition({
				label: "EWA >= 2",
				field: "EWA",
				value: num(row, "EWA"),
				threshold: 2,
			}),
			condition({
				label: "VORP >= 0.2",
				field: "VORP",
				value: num(row, "VORP"),
				threshold: 0.2,
			}),
		],
	});
	const youngStarterSupport = anyCondition({
		label: "highProduction OR BPM >= 1 OR EWA >= 5",
		conditions: [
			boolCondition({
				label: "highProduction",
				fields: ["PER", "EWA", "VORP", "BPM"],
				passed: allPassed(highProd),
				detail: allPassed(highProd) ? "passed" : "failed",
			}),
			condition({
				label: "BPM >= 1",
				field: "BPM",
				value: num(row, "BPM"),
				threshold: 1,
			}),
			condition({
				label: "EWA >= 5",
				field: "EWA",
				value: num(row, "EWA"),
				threshold: 5,
			}),
		],
	});
	const defenseOrReboundBig = anyCondition({
		label: "frontcourt rebound/defense signal",
		conditions: [
			condition({
				label: "comp_rebounding >= 0.64",
				field: "comp_rebounding",
				value: num(row, "comp_rebounding"),
				threshold: 0.64,
				marginScale: 1,
			}),
			condition({
				label: "comp_defenseInterior >= 0.62",
				field: "comp_defenseInterior",
				value: num(row, "comp_defenseInterior"),
				threshold: 0.62,
				marginScale: 1,
			}),
			condition({
				label: "skill_R_margin >= 0.05",
				field: "skill_R_margin",
				value: num(row, "skill_R_margin"),
				threshold: 0.05,
				marginScale: 1,
			}),
			condition({
				label: "skill_Di_margin >= 0.05",
				field: "skill_Di_margin",
				value: num(row, "skill_Di_margin"),
				threshold: 0.05,
				marginScale: 1,
			}),
		],
	});

	return [
		{
			tier: "SUPERSTAR_MAX",
			reason:
				"elite BBGM value, full-time starter load, superstar production, and high usage composite",
			conditions: [
				condition({
					label: "value >= 70",
					field: "value",
					value: num(row, "value"),
					threshold: 70,
				}),
				condition({
					label: "valueNoPot >= 67",
					field: "valueNoPot",
					value: num(row, "valueNoPot"),
					threshold: 67,
				}),
				condition({
					label: "getContractValue >= 68",
					field: "getContractValue",
					value: num(row, "getContractValue"),
					threshold: 68,
				}),
				boolCondition({
					label: "fullTimeStarter",
					fields: ["GP", "MPG", "starterShare"],
					passed: allPassed(fullTime),
					detail: fullTime
						.map((entry) => `${entry.label}=${entry.passed}`)
						.join("; "),
				}),
				boolCondition({
					label: "superstarProduction",
					fields: ["PER", "EWA", "VORP", "BPM", "USG"],
					passed: allPassed(superstarProd),
					detail: superstarProd
						.map((entry) => `${entry.label}=${entry.passed}`)
						.join("; "),
				}),
				condition({
					label: "comp_usage >= 0.70",
					field: "comp_usage",
					value: num(row, "comp_usage"),
					threshold: 0.7,
					marginScale: 1,
				}),
			],
		},
		{
			tier: "STAR_NEAR_MAX",
			reason:
				"contractValue/valueNoPot clear star threshold with full starter role and strong EWA/VORP/BPM",
			conditions: [
				condition({
					label: "getContractValue >= 65",
					field: "getContractValue",
					value: num(row, "getContractValue"),
					threshold: 65,
				}),
				condition({
					label: "valueNoPot >= 65",
					field: "valueNoPot",
					value: num(row, "valueNoPot"),
					threshold: 65,
				}),
				boolCondition({
					label: "fullTimeStarter",
					fields: ["GP", "MPG", "starterShare"],
					passed: allPassed(fullTime),
					detail: fullTime
						.map((entry) => `${entry.label}=${entry.passed}`)
						.join("; "),
				}),
				boolCondition({
					label: "starProduction",
					fields: ["PER", "EWA", "VORP", "BPM"],
					passed: allPassed(starProd),
					detail: starProd
						.map((entry) => `${entry.label}=${entry.passed}`)
						.join("; "),
				}),
			],
		},
		{
			tier: "YOUNG_PROVEN_STARTER",
			reason:
				"young established starter with BBGM contractValue/value and production support",
			conditions: [
				condition({
					label: "age <= 26",
					field: "age",
					value: num(row, "age"),
					threshold: 26,
					op: "<=",
				}),
				boolCondition({
					label: "establishedStarter",
					fields: ["GP", "MPG", "starterShare"],
					passed: allPassed(established),
					detail: established
						.map((entry) => `${entry.label}=${entry.passed}`)
						.join("; "),
				}),
				condition({
					label: "getContractValue >= 59",
					field: "getContractValue",
					value: num(row, "getContractValue"),
					threshold: 59,
				}),
				condition({
					label: "value >= 60",
					field: "value",
					value: num(row, "value"),
					threshold: 60,
				}),
				youngStarterSupport,
			],
		},
		{
			tier: "LOW_END_STARTER",
			reason:
				"starter role and adequate BBGM current value with at least neutral production support",
			conditions: [
				boolCondition({
					label: "establishedStarter",
					fields: ["GP", "MPG", "starterShare"],
					passed: allPassed(established),
					detail: established
						.map((entry) => `${entry.label}=${entry.passed}`)
						.join("; "),
				}),
				condition({
					label: "valueNoPot >= 56",
					field: "valueNoPot",
					value: num(row, "valueNoPot"),
					threshold: 56,
				}),
				condition({
					label: "getContractValue >= 55",
					field: "getContractValue",
					value: num(row, "getContractValue"),
					threshold: 55,
				}),
				starterSupport,
			],
		},
		{
			tier: "VETERAN_ROTATION_GUARD",
			reason:
				"veteran guard creator profile with rotation minutes, passing composite, and positive production",
			conditions: [
				condition({
					label: "age >= 28",
					field: "age",
					value: num(row, "age"),
					threshold: 28,
				}),
				boolCondition({
					label: "pos includes G",
					fields: ["pos"],
					passed: isGuard,
					detail: row.pos,
				}),
				condition({
					label: "AST% >= 14",
					field: "AST%",
					value: num(row, "AST%"),
					threshold: 14,
				}),
				condition({
					label: "comp_passing >= 0.60",
					field: "comp_passing",
					value: num(row, "comp_passing"),
					threshold: 0.6,
					marginScale: 1,
				}),
				condition({
					label: "MPG >= 18",
					field: "MPG",
					value: num(row, "MPG"),
					threshold: 18,
				}),
				condition({
					label: "valueNoPot >= 52",
					field: "valueNoPot",
					value: num(row, "valueNoPot"),
					threshold: 52,
				}),
				condition({
					label: "PER >= 13",
					field: "PER",
					value: num(row, "PER"),
					threshold: 13,
				}),
				condition({
					label: "EWA >= 2",
					field: "EWA",
					value: num(row, "EWA"),
					threshold: 2,
				}),
			],
		},
		{
			tier: "YOUNG_UPSIDE_SUSPECT",
			reason:
				"young player with pot/premium upside but not enough starter role or production certainty",
			conditions: [
				condition({
					label: "age <= 24",
					field: "age",
					value: num(row, "age"),
					threshold: 24,
					op: "<=",
				}),
				condition({
					label: "pot >= 65",
					field: "pot",
					value: num(row, "pot"),
					threshold: 65,
				}),
				condition({
					label: "potentialPremium >= 4",
					field: "potentialPremium",
					value: num(row, "potentialPremium"),
					threshold: 4,
				}),
				condition({
					label: "value >= 57",
					field: "value",
					value: num(row, "value"),
					threshold: 57,
				}),
				boolCondition({
					label: "not establishedStarter",
					fields: ["GP", "MPG", "starterShare"],
					passed: !flags.establishedStarter,
					detail: flags.establishedStarter
						? "establishedStarter=true"
						: "establishedStarter=false",
				}),
			],
		},
		{
			tier: "SPECIALIST_ROTATION",
			reason:
				"rotation sample with strong shootingThreePointer composite and 3 skill margin",
			conditions: [
				condition({
					label: "skill_3_margin >= 0.08",
					field: "skill_3_margin",
					value: num(row, "skill_3_margin"),
					threshold: 0.08,
					marginScale: 1,
				}),
				condition({
					label: "comp_shootingThreePointer >= 0.68",
					field: "comp_shootingThreePointer",
					value: num(row, "comp_shootingThreePointer"),
					threshold: 0.68,
					marginScale: 1,
				}),
				condition({
					label: "comp_usage >= 0.50",
					field: "comp_usage",
					value: num(row, "comp_usage"),
					threshold: 0.5,
					marginScale: 1,
				}),
				condition({
					label: "valueNoPot >= 50",
					field: "valueNoPot",
					value: num(row, "valueNoPot"),
					threshold: 50,
				}),
				condition({
					label: "GP >= 50",
					field: "GP",
					value: num(row, "GP"),
					threshold: 50,
				}),
				condition({
					label: "MPG >= 10",
					field: "MPG",
					value: num(row, "MPG"),
					threshold: 10,
				}),
			],
		},
		{
			tier: "VETERAN_MINIMUM_PLUS",
			reason:
				"older frontcourt player with rebound/defense composite value but limited role/value ceiling",
			conditions: [
				condition({
					label: "age >= 30",
					field: "age",
					value: num(row, "age"),
					threshold: 30,
				}),
				boolCondition({
					label: "frontcourt pos",
					fields: ["pos"],
					passed: isBig,
					detail: row.pos,
				}),
				defenseOrReboundBig,
				condition({
					label: "PER >= 12",
					field: "PER",
					value: num(row, "PER"),
					threshold: 12,
				}),
				condition({
					label: "valueNoPot >= 50",
					field: "valueNoPot",
					value: num(row, "valueNoPot"),
					threshold: 50,
				}),
			],
		},
		{
			tier: "LOW_ROTATION_PLUS",
			reason:
				"small but real regular-season role with non-poor production and BBGM current value above replacement",
			conditions: [
				condition({
					label: "GP >= 40",
					field: "GP",
					value: num(row, "GP"),
					threshold: 40,
				}),
				condition({
					label: "MPG >= 6",
					field: "MPG",
					value: num(row, "MPG"),
					threshold: 6,
				}),
				condition({
					label: "MPG < 16",
					field: "MPG",
					value: num(row, "MPG"),
					threshold: 16,
					op: "<=",
				}),
				condition({
					label: "age < 30",
					field: "age",
					value: num(row, "age"),
					threshold: 29.999,
					op: "<=",
				}),
				condition({
					label: "valueNoPot >= 50",
					field: "valueNoPot",
					value: num(row, "valueNoPot"),
					threshold: 50,
				}),
				boolCondition({
					label: "not poorProduction",
					fields: ["PER", "EWA", "BPM"],
					passed: !flags.poorProduction,
					detail: flags.poorProduction
						? "poorProduction=true"
						: "poorProduction=false",
				}),
			],
		},
	];
};

const evaluateGates = (row) => {
	const gates = v1TierGateDefinitions(row).map((gate) => {
		const passed = gate.conditions.every((entry) => entry.passed);
		const failed = gate.conditions.filter((entry) => !entry.passed);
		const passedConditions = gate.conditions.filter((entry) => entry.passed);
		const margins = gate.conditions
			.map((entry) => Number(entry.margin))
			.filter(Number.isFinite);
		return {
			tier: gate.tier,
			passed,
			reason: gate.reason,
			passedConditions: passedConditions.map((entry) => entry.label),
			failedConditions: failed.map((entry) => entry.label),
			failedDetails: failed.map((entry) => ({
				label: entry.label,
				field: entry.field,
				value: entry.value,
				op: entry.op,
				threshold: entry.threshold,
				margin: entry.margin,
			})),
			missingFields: gate.conditions
				.filter((entry) => entry.missing && entry.field)
				.map((entry) => entry.field),
			minMargin: margins.length > 0 ? Math.min(...margins) : "",
			positiveMarginCount: margins.filter((margin) => margin >= 0).length,
			failedCount: failed.length,
		};
	});
	const firstPassed = gates.find((gate) => gate.passed);
	return {
		gates,
		returnedTier: firstPassed?.tier ?? "MINIMUM_LEVEL",
		returnedReason:
			firstPassed?.reason ??
			"falls through to minimum after role, production, age, and archetype checks",
	};
};

const nearestHigherGate = (gates, currentTier) => {
	const currentIndex = gates.findIndex((gate) => gate.tier === currentTier);
	const higher = currentIndex >= 0 ? gates.slice(0, currentIndex) : gates;
	if (higher.length === 0) return undefined;
	return [...higher].sort((a, b) => {
		if (a.failedCount !== b.failedCount) return a.failedCount - b.failedCount;
		return Number(b.minMargin) - Number(a.minMargin);
	})[0];
};

const rangeTrace = ({ tier, row, attrs, humanMinM }) => {
	const spec = MODEL_TIERS[tier];
	let baseMin;
	let baseMax;
	let ceilingReason = "";
	let floorReason = "";
	if (spec.rangeType === "minimumMultiplier") {
		baseMin = row.minContractForPlayer * spec.minMultiplier;
		baseMax = row.minContractForPlayer * spec.maxMultiplier;
		ceilingReason = `${spec.maxMultiplier}x player minimum`;
		floorReason = `${spec.minMultiplier}x player minimum`;
	} else if (spec.rangeType === "capPct") {
		baseMin =
			spec.min === "playerMinimum"
				? row.minContractForPlayer
				: attrs.salaryCap * spec.minPct;
		baseMax = attrs.salaryCap * spec.maxPct;
		ceilingReason = `${pct(spec.maxPct)} salary cap ceiling`;
		floorReason =
			spec.min === "playerMinimum"
				? "player-specific minimum floor"
				: `${pct(spec.minPct)} salary cap floor`;
	} else if (spec.rangeType === "eligibleMaxPct") {
		baseMin = row.eligibleMax * spec.minPct;
		baseMax = row.eligibleMax * spec.maxPct;
		ceilingReason = `${pct(spec.maxPct)} eligible max ceiling`;
		floorReason = `${pct(spec.minPct)} eligible max floor`;
	}
	const finalMin = Math.max(row.minContractForPlayer, baseMin);
	const finalMax = Math.max(finalMin, baseMax);
	const finalMaxM = finalMax / 1000;
	const ceilingGapToHumanMinM = Number.isFinite(humanMinM)
		? Math.max(0, humanMinM - finalMaxM)
		: "";
	const materialCeilingGapM =
		Number.isFinite(ceilingGapToHumanMinM) && ceilingGapToHumanMinM > 0.1
			? ceilingGapToHumanMinM
			: 0;
	return {
		rangeSourceTier: tier,
		rangeBaseMinM: baseMin / 1000,
		rangeBaseMaxM: baseMax / 1000,
		rangeFinalMinM: finalMin / 1000,
		rangeFinalMaxM: finalMaxM,
		rangeCeilingReason: ceilingReason,
		rangeFloorReason:
			finalMin > baseMin ? "floored by player-specific minimum" : floorReason,
		eligibleMaxM: row.eligibleMax / 1000,
		minContractM: row.minContractForPlayer / 1000,
		rangeWasCappedByEligibleMax:
			spec.rangeType === "eligibleMaxPct" ? "yes" : "no",
		rangeWasFlooredByMinimum: finalMin > baseMin ? "yes" : "no",
		rangeWasLockedLow:
			Number.isFinite(humanMinM) && materialCeilingGapM > 0 ? "yes" : "no",
		rangeCeilingGapToHumanMinM: Number.isFinite(humanMinM)
			? materialCeilingGapM
			: "",
	};
};

const parseComponents = (text) => {
	try {
		return JSON.parse(text || "{}");
	} catch {
		return {};
	}
};

const topSignals = (row, flags) => {
	const positive = [];
	const negative = [];
	if (num(row, "getContractValue") >= 65)
		positive.push("star-level contractValue");
	else if (num(row, "getContractValue") >= 59)
		positive.push("starter-level contractValue");
	if (num(row, "valueNoPot") >= 60) positive.push("strong current valueNoPot");
	if (num(row, "MPG") >= 28 && num(row, "starterShare") >= 0.55)
		positive.push("starter role");
	if (num(row, "BPM") >= 2 || num(row, "EWA") >= 5)
		positive.push("production support");
	if (num(row, "age") <= 24 && num(row, "pot") >= 65)
		positive.push("young upside");
	if (flags.includes("shooting_portable"))
		positive.push("portable shooting flag");
	if (flags.includes("non_scoring_impact_positive"))
		positive.push("non-scoring impact flag");
	if (flags.includes("defense_impact_supported"))
		positive.push("defense impact supported");

	if (num(row, "MPG") < 16) negative.push("limited role/minutes");
	if (num(row, "BPM") < -2 || num(row, "PER") < 10)
		negative.push("poor production signal");
	if (flags.includes("high_turnover_creator_risk"))
		negative.push("high turnover creator risk");
	if (flags.includes("high_turnover_role_player_risk"))
		negative.push("high turnover role-player risk");
	if (flags.includes("small_guard_defense_stat_risk"))
		negative.push("small guard defense stat risk");
	if (flags.includes("low_efficiency_shooter_risk"))
		negative.push("low efficiency shooter risk");
	if (flags.includes("offensive_liability_risk"))
		negative.push("offensive liability risk");
	return {
		topPositiveSignals: positive.slice(0, 5).join("; "),
		topNegativeSignals: negative.slice(0, 5).join("; "),
	};
};

const v2PlacementReason = ({
	components,
	tierPlacementScore,
	range,
	v2PointM,
}) => {
	const sorted = Object.entries(components)
		.filter(([, value]) => Number.isFinite(Number(value)))
		.sort((a, b) => Number(b[1]) - Number(a[1]));
	const high = sorted
		.filter(([, value]) => Number(value) >= 0.65)
		.slice(0, 3)
		.map(([key, value]) => `${key}=${round(Number(value), 2)}`);
	const low = sorted
		.filter(([key, value]) => Number(value) <= 0.35 && !key.includes("Risk"))
		.slice(0, 3)
		.map(([key, value]) => `${key}=${round(Number(value), 2)}`);
	const risks = ["archetypeRiskComponent", "ageYearsRiskComponent"]
		.filter((key) => Number(components[key]) >= 0.45)
		.map((key) => `${key}=${round(Number(components[key]), 2)}`);
	return [
		`placement=${pct(tierPlacementScore)}`,
		`range=${range.rangeFinalMinM.toFixed(2)}-${range.rangeFinalMaxM.toFixed(2)}M`,
		`point=${round(v2PointM, 2)}M`,
		high.length ? `high components: ${high.join(", ")}` : "",
		low.length ? `low components: ${low.join(", ")}` : "",
		risks.length ? `risk components: ${risks.join(", ")}` : "",
	]
		.filter(Boolean)
		.join("; ");
};

const initialCause = ({ row, range, components, nearCeiling, nearFloor }) => {
	if (row.v2PointDirection === "inside" || row.v2PointGapToHumanRangeM === 0) {
		return "aligned_or_control";
	}
	if (range.rangeCeilingGapToHumanMinM > 0) {
		return "v1_base_tier_range_ceiling_below_human";
	}
	if (row.v2PointDirection === "too_low" && nearCeiling === "yes") {
		return "v2_point_near_ceiling_but_range_not_enough";
	}
	if (
		row.v2PointDirection === "too_low" &&
		Number(components.archetypeRiskComponent) >= 0.35
	) {
		return "v2_archetype_risk_or_penalty_pulls_point_down";
	}
	if (row.v2PointDirection === "too_low") {
		return "v2_tier_internal_point_placement_low";
	}
	if (
		row.v2PointDirection === "too_high" &&
		row.v1RangeMinM > row.humanAmountMaxM
	) {
		return "v1_base_tier_range_floor_above_human";
	}
	if (row.v2PointDirection === "too_high") {
		return "v2_tier_internal_point_placement_high";
	}
	return "unknown_or_missing";
};

const loadRows = () => {
	const v2Rows = new Map();
	const comparableRows = [];
	for (const config of datasets) {
		for (const row of readCsv(config.v2Path)) {
			v2Rows.set(`${config.dataset}:${row.caseId}`, {
				dataset: config.dataset,
				...row,
			});
		}
		for (const row of readCsv(config.evalPath)) {
			comparableRows.push({ dataset: config.dataset, ...row });
		}
	}
	return comparableRows.map((row) => ({
		...v2Rows.get(`${row.dataset}:${row.caseId}`),
		...row,
		pid: v2Rows.get(`${row.dataset}:${row.caseId}`)?.pid,
		v2PointM: row.debugPointEstimateM,
	}));
};

const buildProxyByPid = ({ save, rows }) => {
	const anchorEntries = [
		...new Set(rows.map((row) => Number(row.pid)).filter(Number.isFinite)),
	].map((pid) => ({ key: `trace-${pid}`, pid, note: {} }));
	const { attrs, rows: proxyRows } = buildProxyRows({
		root,
		save,
		anchorEntries,
	});
	return {
		attrs,
		proxyByPid: new Map(proxyRows.map((row) => [row.pid, row])),
	};
};

const buildTraceRows = ({ rows, proxyByPid, attrs }) => {
	const initialRows = rows.map((input) => {
		const proxy = proxyByPid.get(Number(input.pid)) ?? {};
		const flags = String(input.riskFlags ?? "")
			.split(";")
			.map((flag) => flag.trim())
			.filter(Boolean);
		const score = scoreTier(proxy);
		const gateTrace = evaluateGates(proxy);
		const gates = gateTrace.gates;
		const failedHigher = gates
			.slice(
				0,
				Math.max(
					0,
					gates.findIndex((gate) => gate.tier === score.tier),
				),
			)
			.filter((gate) => !gate.passed);
		const nearest = nearestHigherGate(gates, score.tier);
		const range = rangeTrace({
			tier: input.v1Tier,
			row: proxy,
			attrs,
			humanMinM: input.humanAmountMinM,
		});
		const components = parseComponents(input.modelComponents);
		const tierPlacementScore = Number(input.tierPlacementScore);
		const v2PointM = Number(input.debugPointEstimateM);
		const rangeWidth = range.rangeFinalMaxM - range.rangeFinalMinM;
		const nearCeiling =
			rangeWidth > 0 &&
			(v2PointM >= range.rangeFinalMaxM - 0.75 || tierPlacementScore >= 0.85)
				? "yes"
				: "no";
		const nearFloor =
			rangeWidth > 0 &&
			(v2PointM <= range.rangeFinalMinM + 0.75 || tierPlacementScore <= 0.15)
				? "yes"
				: "no";
		const couldNotEscape =
			input.v2PointDirection === "too_low" &&
			(range.rangeCeilingGapToHumanMinM > 0 || nearCeiling === "yes")
				? "yes"
				: "no";
		const { topPositiveSignals, topNegativeSignals } = topSignals(proxy, flags);
		const primaryMechanisticCause = initialCause({
			row: input,
			range,
			components,
			nearCeiling,
			nearFloor,
		});
		const secondary = [
			failedHigher.length
				? `failed higher gates: ${failedHigher.map((gate) => gate.tier).join(", ")}`
				: "",
			flags.length ? `risk flags: ${flags.join(", ")}` : "",
			range.rangeWasLockedLow === "yes"
				? "range ceiling below human minimum"
				: "",
			Number(components.archetypeRiskComponent) >= 0.35
				? "archetype risk component elevated"
				: "",
			Number(components.ageYearsRiskComponent) >= 0.45
				? "age/years risk component elevated"
				: "",
		].filter(Boolean);
		const currentGate = gates.find((gate) => gate.tier === score.tier);
		const missingFields = [
			...new Set(gates.flatMap((gate) => gate.missingFields)),
		].filter(Boolean);

		return {
			dataset: input.dataset,
			caseId: input.caseId,
			globalCaseId: input.globalCaseId,
			name: input.name,
			bucket: input.bucket,
			humanRangeText: input.humanRangeText,
			humanAmountMinM: input.humanAmountMinM,
			humanAmountMaxM: input.humanAmountMaxM,
			humanMidpointM: input.humanMidpointM,
			v1Tier: input.v1Tier,
			v1RangeText: input.v1RangeText,
			v1RangeMinM: input.v1RangeMinM,
			v1RangeMaxM: input.v1RangeMaxM,
			v1PointM: input.v1PointM,
			v2PointM,
			v1PointGapToHumanRangeM: input.v1PointGapToHumanRangeM,
			v2PointGapToHumanRangeM: input.v2PointGapToHumanRangeM,
			deltaPointGapM: input.deltaPointGapM,
			v2PointDirection: input.v2PointDirection,
			v2Severe: input.v2Severe,
			riskFlags: input.riskFlags,
			tradeExploitRiskFlag: input.tradeExploitRiskFlag,
			scoreTierReturnedTier: score.tier,
			scoreTierReason: score.reason,
			allTierGateResultsJson: JSON.stringify(gates),
			passedTierGates: gates
				.filter((gate) => gate.passed)
				.map((gate) => gate.tier)
				.join("; "),
			failedHigherTierGates: failedHigher.map((gate) => gate.tier).join("; "),
			nearestHigherTierCandidate: nearest?.tier ?? "",
			nearestHigherTierFailedBecause:
				nearest?.failedConditions.join("; ") ?? "",
			topBlockingConditions:
				nearest?.failedDetails
					.slice(0, 5)
					.map((entry) => entry.label)
					.join("; ") ?? "",
			topPositiveSignals,
			topNegativeSignals,
			marginToNearestHigherTier:
				nearest === undefined
					? ""
					: `failed ${nearest.failedCount}; minMargin ${round(Number(nearest.minMargin), 3)}`,
			marginToCurrentTierFloor:
				currentGate === undefined
					? "fallback/no explicit floor"
					: `minMargin ${round(Number(currentGate.minMargin), 3)}`,
			whetherTierWasHardGateOrScoreBased:
				"hard if/else gate, not weighted score",
			missingFieldsUsedByTierLogic: missingFields.join("; "),
			...range,
			tierPlacementScore,
			currentImpactComponent: components.currentImpactComponent,
			roleCertaintyComponent: components.roleCertaintyComponent,
			futureUpsideComponent: components.futureUpsideComponent,
			skillPortabilityComponent: components.skillPortabilityComponent,
			archetypeRiskComponent: components.archetypeRiskComponent,
			ageYearsRiskComponent: components.ageYearsRiskComponent,
			productionReliabilityComponent: components.productionReliabilityComponent,
			v2PointPlacementReason: v2PlacementReason({
				components,
				tierPlacementScore,
				range,
				v2PointM,
			}),
			v2PointNearRangeCeiling: nearCeiling,
			v2PointNearRangeFloor: nearFloor,
			v2CouldNotEscapeRange: couldNotEscape,
			primaryMechanisticCause,
			secondaryMechanisticCauses: secondary.join("; "),
			confidence: "",
			overfitRisk: "",
			isSingleCaseOnly: "",
			appearsInMultipleCases: "",
			appearsAcrossDatasets: "",
			hasControlCases: "",
			notes:
				score.tier !== input.v1Tier
					? `rebuilt scoreTier returned ${score.tier}; artifact v1Tier is ${input.v1Tier}`
					: "",
		};
	});

	const causeCounts = new Map();
	const causeDatasets = new Map();
	for (const row of initialRows) {
		causeCounts.set(
			row.primaryMechanisticCause,
			(causeCounts.get(row.primaryMechanisticCause) ?? 0) + 1,
		);
		if (!causeDatasets.has(row.primaryMechanisticCause)) {
			causeDatasets.set(row.primaryMechanisticCause, new Set());
		}
		causeDatasets.get(row.primaryMechanisticCause).add(row.dataset);
	}
	const flagControl = new Map();
	for (const row of initialRows) {
		for (const flag of String(row.riskFlags ?? "")
			.split(";")
			.map((entry) => entry.trim())
			.filter(Boolean)) {
			if (!flagControl.has(flag)) flagControl.set(flag, { inside: 0, miss: 0 });
			if (row.v2PointDirection === "inside") flagControl.get(flag).inside += 1;
			else flagControl.get(flag).miss += 1;
		}
	}

	return initialRows.map((row) => {
		const causeCount = causeCounts.get(row.primaryMechanisticCause) ?? 0;
		const datasetCount =
			causeDatasets.get(row.primaryMechanisticCause)?.size ?? 0;
		const firstFlag = String(row.riskFlags ?? "")
			.split(";")
			.map((entry) => entry.trim())
			.filter(Boolean)[0];
		const control = firstFlag ? flagControl.get(firstFlag) : undefined;
		const hasControlCases =
			row.primaryMechanisticCause === "aligned_or_control" ||
			(control && control.inside > 0 && control.miss > 0) ||
			(initialRows.some(
				(other) =>
					other.v1Tier === row.v1Tier && other.v2PointDirection === "inside",
			) &&
				row.primaryMechanisticCause.includes("range"));
		const confidence =
			row.v2Severe === "yes" && causeCount > 1
				? "high"
				: row.v2PointGapToHumanRangeM >= 2 || causeCount > 1
					? "medium"
					: "low";
		const overfitRisk =
			causeCount === 1 ? "high" : datasetCount === 1 ? "medium" : "low";
		return {
			...row,
			confidence,
			overfitRisk,
			isSingleCaseOnly: causeCount === 1 ? "yes" : "no",
			appearsInMultipleCases: causeCount > 1 ? "yes" : "no",
			appearsAcrossDatasets: datasetCount > 1 ? "yes" : "no",
			hasControlCases: hasControlCases ? "yes" : "no",
		};
	});
};

const count = (rows, predicate) => rows.filter(predicate).length;

const avg = (values) => {
	const finite = values.map(Number).filter(Number.isFinite);
	return finite.length === 0
		? ""
		: finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const groupRows = (rows, keyFn) => {
	const map = new Map();
	for (const row of rows) {
		const key = keyFn(row);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(row);
	}
	return map;
};

const caseColumns = [
	{ key: "dataset", label: "dataset" },
	{ key: "caseId", label: "case" },
	{ key: "name", label: "player" },
	{ key: "bucket", label: "bucket" },
	{ key: "humanRangeText", label: "human" },
	{ key: "v1Tier", label: "v1 tier" },
	{ key: "v1RangeText", label: "v1 range" },
	{
		key: "v2PointM",
		label: "v2 point",
		format: (value) => round(Number(value), 2),
	},
	{
		key: "v2PointGapToHumanRangeM",
		label: "v2 gap",
		format: (value) => round(Number(value), 2),
	},
	{ key: "primaryMechanisticCause", label: "primary cause" },
	{ key: "nearestHigherTierCandidate", label: "nearest higher" },
	{ key: "topBlockingConditions", label: "blocking conditions" },
	{ key: "riskFlags", label: "risk flags" },
];

const writeTraceSummary = ({ rows, attrs }) => {
	const causeSummary = [
		...groupRows(rows, (row) => row.primaryMechanisticCause),
	].map(([cause, causeRows]) => ({
		cause,
		count: causeRows.length,
		severe: count(causeRows, (row) => row.v2Severe === "yes"),
		meanV2GapM: avg(causeRows.map((row) => row.v2PointGapToHumanRangeM)),
		acrossDatasets: [...new Set(causeRows.map((row) => row.dataset))].join(
			", ",
		),
		controlCases: count(causeRows, (row) => row.v2PointDirection === "inside"),
	}));
	const tierSummary = [...groupRows(rows, (row) => row.v1Tier)].map(
		([tier, tierRows]) => ({
			tier,
			count: tierRows.length,
			tooLow: count(tierRows, (row) => row.v2PointDirection === "too_low"),
			tooHigh: count(tierRows, (row) => row.v2PointDirection === "too_high"),
			inside: count(tierRows, (row) => row.v2PointDirection === "inside"),
			severe: count(tierRows, (row) => row.v2Severe === "yes"),
			lockedLow: count(tierRows, (row) => row.rangeWasLockedLow === "yes"),
			meanV2GapM: avg(tierRows.map((row) => row.v2PointGapToHumanRangeM)),
		}),
	);
	const blockingSummary = [
		...groupRows(rows, (row) => row.nearestHigherTierCandidate || "none"),
	].map(([tier, tierRows]) => ({
		nearestHigherTier: tier,
		count: tierRows.length,
		severe: count(tierRows, (row) => row.v2Severe === "yes"),
		commonBlockingConditions: [
			...groupRows(
				tierRows.flatMap((row) =>
					String(row.topBlockingConditions)
						.split(";")
						.map((entry) => entry.trim())
						.filter(Boolean)
						.map((conditionText) => ({ conditionText })),
				),
				(row) => row.conditionText,
			).entries(),
		]
			.sort((a, b) => b[1].length - a[1].length)
			.slice(0, 4)
			.map(
				([conditionText, conditionRows]) =>
					`${conditionText} (${conditionRows.length})`,
			)
			.join("; "),
	}));
	const worst = [...rows]
		.sort(
			(a, b) =>
				Number(b.v2PointGapToHumanRangeM) - Number(a.v2PointGapToHumanRangeM),
		)
		.slice(0, 15);

	const md = `# Contract Market Tier Trace Summary

本报告只做 read-only mechanism trace。它没有改 \`src/\`，没有改 \`scoreTier\`、\`tierRange\` 或 sandbox v2 逻辑，也没有重抽样。trace 覆盖 boundary40 与 validation20 的 labeled cases，共 ${rows.length} cases。

## 机制总览

- v1 tier 是 hard if/else gate，不是 weighted score。第一个通过的 tier 直接返回，后面的 tier 不再检查。
- v1 range 完全由 tier table 转成金额区间；低 tier 的 ceiling 会把球员锁在低金额区间。
- v2 point estimate 不能逃出 v1 range。它只计算 \`tierPlacementScore\`，然后在 v1 range 内插值。
- tradeExploitRiskFlag 是 audit-only，不参与 point estimate。
- comparable eval 用 v1 midpoint vs v2 point 做同口径比较，因此更适合判断 point placement。

Salary cap: ${money(attrs.salaryCap)}.

## Primary Mechanistic Cause Summary

${markdownTable(causeSummary, [
	{ key: "cause", label: "cause" },
	{ key: "count", label: "count" },
	{ key: "severe", label: "severe" },
	{
		key: "meanV2GapM",
		label: "mean v2 gap M",
		format: (value) => round(Number(value), 2),
	},
	{ key: "acrossDatasets", label: "datasets" },
	{ key: "controlCases", label: "inside/control" },
])}

## By v1 Tier

${markdownTable(tierSummary, [
	{ key: "tier", label: "v1 tier" },
	{ key: "count", label: "count" },
	{ key: "inside", label: "inside" },
	{ key: "tooLow", label: "too_low" },
	{ key: "tooHigh", label: "too_high" },
	{ key: "severe", label: "severe" },
	{ key: "lockedLow", label: "range locked low" },
	{
		key: "meanV2GapM",
		label: "mean gap M",
		format: (value) => round(Number(value), 2),
	},
])}

## Nearest Higher Tier Blocking Summary

${markdownTable(blockingSummary, [
	{ key: "nearestHigherTier", label: "nearest higher tier" },
	{ key: "count", label: "count" },
	{ key: "severe", label: "severe" },
	{ key: "commonBlockingConditions", label: "common blocking conditions" },
])}

## Worst v2 Point Misses With Mechanism Trace

${markdownTable(worst, caseColumns)}

## Reading Notes

- \`failedHigherTierGates\` tells which better tiers were checked before the returned tier and failed.
- \`nearestHigherTierFailedBecause\` is not a recommendation to tune those thresholds; it is the nearest hard gate blocker under current code.
- \`rangeWasLockedLow=yes\` means the final v1 range ceiling sits below the human range minimum.
- \`v2CouldNotEscapeRange=yes\` means v2 was limited by the inherited v1 range rather than only by point placement.
`;
	fs.writeFileSync(summaryMdPath, md);
};

const tierRowsForExplainer = Object.entries(MODEL_TIERS).map(([tier, spec]) => {
	let range = "";
	if (spec.rangeType === "minimumMultiplier") {
		range = `${spec.minMultiplier}x-${spec.maxMultiplier}x player minimum`;
	} else if (spec.rangeType === "capPct") {
		range = `${spec.min === "playerMinimum" ? "player minimum" : pct(spec.minPct)}-${pct(spec.maxPct)} cap`;
	} else if (spec.rangeType === "eligibleMaxPct") {
		range = `${pct(spec.minPct)}-${pct(spec.maxPct)} eligible max`;
	}
	return {
		tier,
		range,
		years: spec.years ?? "",
	};
});

const writeMechanismExplainer = ({ rows }) => {
	const md = `# Contract Market Mechanism Explainer

本文件从零解释当前 sandbox contract market 的机制。它不是调参建议，也不是 v2.1 实现方案。

## 1. 当前模型分两层

当前 sandbox 有三件事：

1. v1 \`scoreTier(row)\`：把球员分进一个 tier。
2. v1 \`tierRange(tier, row, attrs)\`：把 tier 转成金额 range。
3. v2 \`scoreContractMarketV2(row, attrs)\`：保留 v1 tier/range，只在 range 内放一个 point estimate。

这意味着 v2 不是一个能自由报价的模型。它不能跳出 v1 range。如果 v1 把一个球员放进 \`YOUNG_UPSIDE_SUSPECT $3.87M-$6.96M\`，v2 最多只能把 point 放到这个区间上沿附近，不能自己报到 $20M。

## 2. v1 tier 判断机制

v1 是 hard if/else gate。它不是 weighted score。代码按固定顺序检查 tier，第一个通过的 tier 直接返回。

检查顺序：

1. \`SUPERSTAR_MAX\`
2. \`STAR_NEAR_MAX\`
3. \`YOUNG_PROVEN_STARTER\`
4. \`LOW_END_STARTER\`
5. \`VETERAN_ROTATION_GUARD\`
6. \`YOUNG_UPSIDE_SUSPECT\`
7. \`SPECIALIST_ROTATION\`
8. \`VETERAN_MINIMUM_PLUS\`
9. \`LOW_ROTATION_PLUS\`
10. fallback \`MINIMUM_LEVEL\`

核心字段：

- value/valueNoPot/getContractValue: BBGM value and contract value proxies.
- GP/MPG/starterShare: role and starter certainty.
- PER/EWA/VORP/BPM/USG: production and impact gates.
- age/pot/potentialPremium: upside gates.
- comp_* and skill_* margins: shooting, passing, rebounding, defense archetype gates.
- pos: guard/frontcourt gates.

没有跨 tier 的总分。一个球员如果差一个关键条件，就会掉到后面的 tier，即使其他条件很强。

## 3. v1 range 判断机制

\`tierRange\` 不看更多篮球信息，只看 tier table、salary cap、eligible max、player minimum。

${markdownTable(tierRowsForExplainer, [
	{ key: "tier", label: "tier" },
	{ key: "range", label: "range source" },
	{ key: "years", label: "years override" },
])}

强限制来自 ceiling：

- \`MINIMUM_LEVEL\` ceiling 约 1.15x player minimum。
- \`YOUNG_UPSIDE_SUSPECT\` ceiling 4.5% cap。
- \`LOW_END_STARTER\` ceiling 12% cap。
- \`YOUNG_PROVEN_STARTER\` ceiling 22.5% cap。
- \`STAR_NEAR_MAX\` ceiling 是 eligible max。

所以如果 v1 tier 过低，v2 point 再好也逃不出低 ceiling。

## 4. v2 point estimate 机制

v2 的公式是：

\`\`\`text
debugPointEstimateM = debugRangeMinM + tierPlacementScore * (debugRangeMaxM - debugRangeMinM)
\`\`\`

\`tierPlacementScore\` 来自七个 component：

| component | main inputs | role |
| --- | --- | --- |
| currentImpactComponent | getContractValue, valueNoPot, MPG, starterShare, PER, EWA, VORP, BPM | 当前影响力 |
| roleCertaintyComponent | GP, MPG, starterShare, valueNoPot, EWA | 角色稳定性 |
| futureUpsideComponent | age, pot, potentialPremium, MPG/BPM/EWA role support | 未来 upside |
| skillPortabilityComponent | shooting package, playmaking, defense/rebound, MPG, TS | 技能能否转化成上场价值 |
| archetypeRiskComponent | turnover, low efficiency, low role, poor impact, small guard defense noise | 风险扣分 |
| ageYearsRiskComponent | age, years, GP durability | 年龄/年限风险 |
| productionReliabilityComponent | GP, MPG, EWA, VORP, BPM, PER | 产量可信度 |

权重：

\`\`\`text
currentImpact 0.28
roleCertainty 0.17
futureUpside 0.13
skillPortability 0.14
productionReliability 0.14
(1 - archetypeRisk) 0.08
(1 - ageYearsRisk) 0.06
\`\`\`

最终 placement 被 clamp 到 0.04-0.96。也就是说即使 component 很强，也不能超过 range 上沿。

## 5. Risk flags

v2 会输出 risk flags，例如：

- \`young_proven_positive\`
- \`young_pot_only\`
- \`small_guard_defense_stat_risk\`
- \`high_turnover_creator_risk\`
- \`high_turnover_role_player_risk\`
- \`shooting_portable\`
- \`low_efficiency_shooter_risk\`
- \`non_scoring_impact_positive\`
- \`defense_impact_supported\`
- \`defense_impact_noisy\`

这些 flags 解释机制和风险。它们不是单个 case 特供门。

## 6. Trade exploit audit

\`tradeExploitRiskFlag\` 是 audit-only。它不进入 \`tierPlacementScore\`，也不改变 point estimate。它只标记“低 ask + 高 asset proxy + 风险 profile”这种后续需要 trade-value audit 的情况。

## 7. Comparable eval 为什么更公平

旧对比是：

- v1: full range 是否 overlap human range。
- v2: point 是否 inside human range。

这对 v1 太宽容，对 v2 太严格。

同口径 eval 改成：

- v1 point = v1 range midpoint。
- v2 point = \`debugPointEstimateM\`。
- 两者都用 point-to-human-range gap、midpoint error、signed bias、severe threshold 比较。

当前 comparable eval 结论：v2 在 point gap、midpoint error、bias、severe count 上都比 v1 midpoint 更好，但仍然系统性 too_low。这指向的问题多半在 v1 base tier/range ceiling，而不只是 v2 point placement。

## 8. 当前 trace 覆盖

本轮 trace 覆盖 ${rows.length} 个 labeled cases，包括 boundary40 和 validation20。每个 case 都记录了 hard gate 结果、range ceiling/floor、v2 components、risk flags 和机制归因。
`;
	fs.writeFileSync(explainerMdPath, md);
};

const writeFailureAttribution = ({ rows }) => {
	const flagRows = [
		...groupRows(
			rows.flatMap((row) =>
				String(row.riskFlags ?? "")
					.split(";")
					.map((flag) => flag.trim())
					.filter(Boolean)
					.map((flag) => ({ flag, row })),
			),
			(entry) => entry.flag,
		).entries(),
	].map(([flag, entries]) => {
		const flagCaseRows = entries.map((entry) => entry.row);
		const missRows = flagCaseRows.filter(
			(row) => row.v2PointDirection !== "inside",
		);
		const controlRows = flagCaseRows.filter(
			(row) => row.v2PointDirection === "inside",
		);
		return {
			flag,
			cases: flagCaseRows.length,
			misses: missRows.length,
			controls: controlRows.length,
			severe: count(flagCaseRows, (row) => row.v2Severe === "yes"),
			exampleMisses: missRows
				.slice(0, 4)
				.map((row) => `${row.dataset}:${row.caseId}`)
				.join(", "),
			exampleControls: controlRows
				.slice(0, 4)
				.map((row) => `${row.dataset}:${row.caseId}`)
				.join(", "),
		};
	});
	const causeRows = [
		...groupRows(rows, (row) => row.primaryMechanisticCause),
	].map(([cause, causeRows]) => ({
		cause,
		cases: causeRows.length,
		misses: count(causeRows, (row) => row.v2PointDirection !== "inside"),
		controls: count(causeRows, (row) => row.v2PointDirection === "inside"),
		severe: count(causeRows, (row) => row.v2Severe === "yes"),
		datasets: [...new Set(causeRows.map((row) => row.dataset))].join(", "),
		examples: causeRows
			.slice(0, 5)
			.map((row) => `${row.dataset}:${row.caseId}`)
			.join(", "),
	}));
	const rangeLocked = rows.filter((row) => row.rangeWasLockedLow === "yes");
	const v2CannotEscape = rows.filter(
		(row) => row.v2CouldNotEscapeRange === "yes",
	);
	const highTurnover = rows.filter((row) =>
		String(row.riskFlags).includes("high_turnover"),
	);

	const md = `# Contract Market Mechanism Failure Attribution

本文件只做机制归因，不给具体调参实现，不针对单个 pid/name/caseId 写规则建议。

## Main Finding

当前 too_low 的核心不是单一 v2 point formula。很多 case 的 v2 point 已经接近 inherited v1 range 上沿，但 v1 tier/range ceiling 本身低于 human range。也就是说，v2 只能在错误或偏低的 base range 内做更好的落点，不能自己跨档。

## Primary Cause Summary

${markdownTable(causeRows, [
	{ key: "cause", label: "cause" },
	{ key: "cases", label: "cases" },
	{ key: "misses", label: "misses" },
	{ key: "controls", label: "controls" },
	{ key: "severe", label: "severe" },
	{ key: "datasets", label: "datasets" },
	{ key: "examples", label: "examples" },
])}

## Risk Flag Controls

每个 flag 都同时看 miss 和 control cases，避免把单个错例直接写成规则。比如 high_turnover 既出现在 miss，也出现在部分对齐/可接受 case 中，所以它不能被解释成“一出现就应该调高或调低”。

${markdownTable(flagRows, [
	{ key: "flag", label: "risk flag" },
	{ key: "cases", label: "cases" },
	{ key: "misses", label: "misses" },
	{ key: "controls", label: "controls" },
	{ key: "severe", label: "severe" },
	{ key: "exampleMisses", label: "example misses" },
	{ key: "exampleControls", label: "example controls" },
])}

## Range Ceiling Attribution

- rangeWasLockedLow cases: ${rangeLocked.length}
- v2CouldNotEscapeRange cases: ${v2CannotEscape.length}

${markdownTable(v2CannotEscape.slice(0, 20), caseColumns)}

## Turnover Risk Control Check

high turnover flags appear in ${highTurnover.length} cases. They are not all misses, so turnover should be read as a contextual risk signal rather than a direct rule outcome.

${markdownTable(highTurnover.slice(0, 20), caseColumns)}

## What This Does Not Prove

- It does not prove any specific threshold should move.
- It does not prove v2.1 should add a new tier.
- It does not prove a single named player is correctly or incorrectly valued.
- It does show which hard gates, range ceilings, and v2 placement components are responsible under current code.
`;
	fs.writeFileSync(attributionMdPath, md);
};

const csvColumns = [
	"dataset",
	"caseId",
	"globalCaseId",
	"name",
	"bucket",
	"humanRangeText",
	"humanAmountMinM",
	"humanAmountMaxM",
	"humanMidpointM",
	"v1Tier",
	"v1RangeText",
	"v1RangeMinM",
	"v1RangeMaxM",
	"v1PointM",
	"v2PointM",
	"v1PointGapToHumanRangeM",
	"v2PointGapToHumanRangeM",
	"deltaPointGapM",
	"v2PointDirection",
	"v2Severe",
	"riskFlags",
	"tradeExploitRiskFlag",
	"scoreTierReturnedTier",
	"scoreTierReason",
	"allTierGateResultsJson",
	"passedTierGates",
	"failedHigherTierGates",
	"nearestHigherTierCandidate",
	"nearestHigherTierFailedBecause",
	"topBlockingConditions",
	"topPositiveSignals",
	"topNegativeSignals",
	"marginToNearestHigherTier",
	"marginToCurrentTierFloor",
	"whetherTierWasHardGateOrScoreBased",
	"missingFieldsUsedByTierLogic",
	"rangeSourceTier",
	"rangeBaseMinM",
	"rangeBaseMaxM",
	"rangeFinalMinM",
	"rangeFinalMaxM",
	"rangeCeilingReason",
	"rangeFloorReason",
	"eligibleMaxM",
	"minContractM",
	"rangeWasCappedByEligibleMax",
	"rangeWasFlooredByMinimum",
	"rangeWasLockedLow",
	"rangeCeilingGapToHumanMinM",
	"tierPlacementScore",
	"currentImpactComponent",
	"roleCertaintyComponent",
	"futureUpsideComponent",
	"skillPortabilityComponent",
	"archetypeRiskComponent",
	"ageYearsRiskComponent",
	"productionReliabilityComponent",
	"v2PointPlacementReason",
	"v2PointNearRangeCeiling",
	"v2PointNearRangeFloor",
	"v2CouldNotEscapeRange",
	"primaryMechanisticCause",
	"secondaryMechanisticCauses",
	"confidence",
	"overfitRisk",
	"isSingleCaseOnly",
	"appearsInMultipleCases",
	"appearsAcrossDatasets",
	"hasControlCases",
	"notes",
];

const main = () => {
	const save = readSave(savePath);
	const rows = loadRows();
	const { attrs, proxyByPid } = buildProxyByPid({ save, rows });
	const traceRows = buildTraceRows({ rows, proxyByPid, attrs });
	writeCsv(traceCsvPath, traceRows, csvColumns);
	writeTraceSummary({ rows: traceRows, attrs });
	writeMechanismExplainer({ rows: traceRows });
	writeFailureAttribution({ rows: traceRows });
	console.log(
		JSON.stringify(
			{
				traceRows: traceRows.length,
				outputs: [
					path.relative(root, traceCsvPath),
					path.relative(root, summaryMdPath),
					path.relative(root, explainerMdPath),
					path.relative(root, attributionMdPath),
				],
				primaryCauses: Object.fromEntries(
					[...groupRows(traceRows, (row) => row.primaryMechanisticCause)].map(
						([cause, causeRows]) => [cause, causeRows.length],
					),
				),
			},
			null,
			2,
		),
	);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
