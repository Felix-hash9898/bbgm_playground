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
} from "../../../tools/contract-market-proxy-core.mjs";
import {
	scoreTier,
	tierRange,
} from "../../../tools/contract-market-tier-score.mjs";
import { scoreContractMarketV2 } from "../../../tools/contract-market-sandbox-v2.mjs";

const root = process.cwd();
const outDir = path.dirname(fileURLToPath(import.meta.url));
const artifactsDir = path.join(root, "contract_market_artifacts");
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);

const out = {
	script: fileURLToPath(import.meta.url),
	distribution: path.join(outDir, "distribution.csv"),
	transition: path.join(outDir, "transition_matrix.csv"),
	capBudget: path.join(outDir, "cap_budget.csv"),
	labeledEval: path.join(outDir, "labeled_eval.csv"),
	laneHits: path.join(outDir, "lane_hits.csv"),
	remainingMisses: path.join(outDir, "remaining_misses.csv"),
	oneCNecessityAudit: path.join(outDir, "one_c_necessity_audit.csv"),
	summary: path.join(outDir, "summary.md"),
	rules: path.join(outDir, "rules.md"),
	analysisPack: path.join(outDir, "analysis_pack.md"),
};

const labeledInputs = [
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

const TIERS = [
	"SUPERSTAR_MAX",
	"STAR_NEAR_MAX",
	"YOUNG_PROVEN_STARTER",
	"SOLID_STARTER",
	"LOW_END_STARTER",
	"HIGH_END_ROTATION",
	"SPECIALIST_ROTATION",
	"YOUNG_UPSIDE_SUSPECT",
	"VETERAN_ROTATION_GUARD",
	"LOW_ROTATION_PLUS",
	"VETERAN_MINIMUM_PLUS",
	"MINIMUM_LEVEL",
];
const TIER_RANK = Object.fromEntries(TIERS.map((tier, index) => [tier, index]));

const MODULES = {
	oneA: {
		key: "1A",
		tier: "HIGH_END_ROTATION",
		rangeMinPct: 0.07,
		rangeMaxPct: 0.12,
	},
	oneB: {
		key: "1B-B",
		tier: "SOLID_STARTER",
		rangeMinPct: 0.12,
		rangeMaxPct: 0.17,
		gp: 55,
		mpg: 29,
		valueNoPot: 60,
		contractValue: 60,
		roleShare: 0.65,
		roleGs: 50,
		roleMpg: 31,
		productionNeed: 2,
		production: { bpm: 1, ewa: 5, vorp: 1, per: 16 },
		extra: { bpm: 1.5, ewa: 6, vorp: 1.5, per: 17, age: true },
	},
};

const numericFields = new Set([
	"pid",
	"humanAmountMinM",
	"humanAmountMaxM",
	"humanMidpointM",
	"debugPointEstimateM",
	"v2PointGapToHumanRangeM",
	"v2AbsErrorToHumanMidM",
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

const num = (row, key, fallback = undefined) => {
	const value = row?.[key];
	if (value === "" || value === undefined || value === null) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};
const count = (rows, predicate) => rows.filter(predicate).length;
const sum = (values) =>
	values.reduce(
		(total, value) =>
			total + (Number.isFinite(Number(value)) ? Number(value) : 0),
		0,
	);
const avg = (values) => {
	const finite = values.map(Number).filter(Number.isFinite);
	return finite.length === 0 ? "" : sum(finite) / finite.length;
};
const median = (values) => {
	const finite = values
		.map(Number)
		.filter(Number.isFinite)
		.sort((a, b) => a - b);
	if (finite.length === 0) return "";
	const mid = Math.floor(finite.length / 2);
	return finite.length % 2 === 1
		? finite[mid]
		: (finite[mid - 1] + finite[mid]) / 2;
};
const groupRows = (rows, keyFn) => {
	const map = new Map();
	for (const row of rows) {
		const key = keyFn(row);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(row);
	}
	return [...map.entries()];
};
const signal = (label, passed, weight = 1) => ({ label, passed, weight });
const supportScore = (entries) =>
	entries
		.filter((entry) => entry.passed)
		.reduce((total, entry) => total + entry.weight, 0);
const supportLabels = (entries) =>
	entries.filter((entry) => entry.passed).map((entry) => entry.label);
const pct100 = (value, digits = 3) =>
	Number.isFinite(value) ? round(value * 100, digits) : "";
const boolText = (value) => (value ? "yes" : "no");

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

const highEndRotationCheck = (row, currentTier) => {
	const hardFloorFails = hardFloorFailReasons1A(row);
	const minFloorFails =
		currentTier === "MINIMUM_LEVEL"
			? minimumStrongerFloorFailReasons1A(row)
			: [];
	const protectedStarterTier = [
		"SUPERSTAR_MAX",
		"STAR_NEAR_MAX",
		"YOUNG_PROVEN_STARTER",
		"LOW_END_STARTER",
	].includes(currentTier);
	const role = roleSignals1A(row);
	const core = coreIdentitySignals1A(row);
	const valueProduction = valueProductionSignals1A(row);
	const supportEntries = [
		...role
			.filter((entry) => entry.passed)
			.map((entry) => ({ ...entry, group: "role" })),
		...core
			.filter((entry) => entry.passed)
			.map((entry) => ({ ...entry, group: "core" })),
		...valueProduction
			.filter((entry) => entry.passed)
			.map((entry) => ({ ...entry, group: "value_production" })),
	];
	const score = supportScore(supportEntries);
	const failReasons = [
		...hardFloorFails,
		...minFloorFails,
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
		hardFloorPassed: hardFloorFails.length === 0,
		minimumStrongerFloorPassed: minFloorFails.length === 0,
		protectedStarterTier,
		supportScore: score,
		roleSignals: supportLabels(role),
		coreSignals: supportLabels(core),
		valueProductionSignals: supportLabels(valueProduction),
		allSignals: supportEntries.map((entry) => entry.label),
		reason: [
			"V3-1A HIGH_END_ROTATION: hard floor + real role + core identity + value/production support",
			`core: ${supportLabels(core).join("; ") || "none"}`,
			`support: ${[...supportLabels(role), ...supportLabels(valueProduction)].join("; ") || "none"}`,
		].join(" | "),
	};
};

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

const roleSignals1B = (row) => [
	signal(
		`role: starterShare >= ${MODULES.oneB.roleShare}`,
		num(row, "starterShare", 0) >= MODULES.oneB.roleShare,
	),
	signal(
		`role: GS >= ${MODULES.oneB.roleGs}`,
		num(row, "GS", 0) >= MODULES.oneB.roleGs,
	),
	signal(
		`role: MPG >= ${MODULES.oneB.roleMpg}`,
		num(row, "MPG", 0) >= MODULES.oneB.roleMpg,
	),
];
const productionSignals1B = (row) => [
	signal(
		`production: BPM >= ${MODULES.oneB.production.bpm}`,
		num(row, "BPM", -99) >= MODULES.oneB.production.bpm,
	),
	signal(
		`production: EWA >= ${MODULES.oneB.production.ewa}`,
		num(row, "EWA", 0) >= MODULES.oneB.production.ewa,
	),
	signal(
		`production: VORP >= ${MODULES.oneB.production.vorp}`,
		num(row, "VORP", -99) >= MODULES.oneB.production.vorp,
	),
	signal(
		`production: PER >= ${MODULES.oneB.production.per}`,
		num(row, "PER", 0) >= MODULES.oneB.production.per,
	),
];
const extraSignals1B = (row) => [
	signal(
		`extra: BPM >= ${MODULES.oneB.extra.bpm}`,
		num(row, "BPM", -99) >= MODULES.oneB.extra.bpm,
	),
	signal(
		`extra: EWA >= ${MODULES.oneB.extra.ewa}`,
		num(row, "EWA", 0) >= MODULES.oneB.extra.ewa,
	),
	signal(
		`extra: VORP >= ${MODULES.oneB.extra.vorp}`,
		num(row, "VORP", -99) >= MODULES.oneB.extra.vorp,
	),
	signal(
		`extra: PER >= ${MODULES.oneB.extra.per}`,
		num(row, "PER", 0) >= MODULES.oneB.extra.per,
	),
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

const solidStarterCheck = (row, currentTier) => {
	const spec = MODULES.oneB;
	const failReasons = [];
	const eligible = currentTier === "LOW_END_STARTER";
	if (!eligible) failReasons.push(`current tier ${currentTier} blocked`);
	if (num(row, "GP", 0) < spec.gp) failReasons.push(`GP < ${spec.gp}`);
	if (num(row, "MPG", 0) < spec.mpg) failReasons.push(`MPG < ${spec.mpg}`);
	if (num(row, "valueNoPot", 0) < spec.valueNoPot)
		failReasons.push(`valueNoPot < ${spec.valueNoPot}`);
	if (num(row, "getContractValue", 0) < spec.contractValue) {
		failReasons.push(`contractValue < ${spec.contractValue}`);
	}
	const role = roleSignals1B(row);
	const production = productionSignals1B(row);
	const extra = extraSignals1B(row);
	const rolePassed = role.some((entry) => entry.passed);
	const productionCount = production.filter((entry) => entry.passed).length;
	const productionPassed = productionCount >= spec.productionNeed;
	const extraPassed = extra.some((entry) => entry.passed);
	const bpmNegative = num(row, "BPM", 0) < 0;
	const exception =
		bpmNegative &&
		currentTier === "LOW_END_STARTER" &&
		exceptionSignals1B(row).every((entry) => entry.passed);
	if (!rolePassed) failReasons.push("missing role core");
	if (!productionPassed)
		failReasons.push(`production core count < ${spec.productionNeed}`);
	if (!extraPassed) failReasons.push("missing extra support");
	if (bpmNegative && !exception)
		failReasons.push("BPM < 0 without exception path");
	const passedSignals = [
		...supportLabels(role),
		`value core: valueNoPot >= ${spec.valueNoPot} and contractValue >= ${spec.contractValue}`,
		...supportLabels(production),
		...supportLabels(extra),
		exception ? "BPM<0 exception path" : "",
	].filter(Boolean);
	return {
		passed: failReasons.length === 0,
		failReasons,
		hardFloorPassed:
			eligible &&
			num(row, "GP", 0) >= spec.gp &&
			num(row, "MPG", 0) >= spec.mpg &&
			num(row, "valueNoPot", 0) >= spec.valueNoPot &&
			num(row, "getContractValue", 0) >= spec.contractValue,
		rolePassed,
		productionPassed,
		productionCount,
		extraPassed,
		bpmNegative,
		exception,
		passedSignals,
		reason: [
			"V3-1B-narrow-B SOLID_STARTER bridge",
			`role: ${supportLabels(role).join("; ") || "none"}`,
			`production ${productionCount}/${spec.productionNeed}: ${supportLabels(production).join("; ") || "none"}`,
			`extra: ${supportLabels(extra).join("; ") || "none"}`,
			exception ? "BPM<0 exception path" : "",
		]
			.filter(Boolean)
			.join(" | "),
	};
};

const moduleRangeForTier = (tier, row, attrs) => {
	if (tier === "HIGH_END_ROTATION") {
		const min = Math.max(
			row.minContractForPlayer,
			attrs.salaryCap * MODULES.oneA.rangeMinPct,
		);
		const max = Math.max(min, attrs.salaryCap * MODULES.oneA.rangeMaxPct);
		return {
			minM: Math.round(min) / 1000,
			maxM: Math.round(max) / 1000,
			text:
				Math.round(min) === Math.round(max)
					? money(Math.round(min))
					: `${money(Math.round(min))}-${money(Math.round(max))}`,
			years: "",
		};
	}
	if (tier === "SOLID_STARTER") {
		const min = Math.max(
			row.minContractForPlayer,
			attrs.salaryCap * MODULES.oneB.rangeMinPct,
		);
		const max = Math.max(min, attrs.salaryCap * MODULES.oneB.rangeMaxPct);
		return {
			minM: Math.round(min) / 1000,
			maxM: Math.round(max) / 1000,
			text: `${money(Math.round(min))}-${money(Math.round(max))}`,
			years: "",
		};
	}
	const range = tierRange(tier, row, attrs);
	return {
		minM: range.modelRangeMin / 1000,
		maxM: range.modelRangeMax / 1000,
		text: range.modelRangeText,
		years: range.modelYears,
	};
};

const tierMove = (currentTier, candidateTier) => {
	const delta = TIER_RANK[currentTier] - TIER_RANK[candidateTier];
	if (!Number.isFinite(delta)) return { direction: "unknown", steps: "" };
	if (delta > 0) return { direction: "up", steps: delta };
	if (delta < 0) return { direction: "down", steps: Math.abs(delta) };
	return { direction: "same", steps: 0 };
};

const combinedScore = (row) => {
	const oneA = highEndRotationCheck(row, row.currentTier);
	const oneB = solidStarterCheck(row, row.currentTier);
	const conflict = oneA.passed && oneB.passed;
	if (conflict) {
		return {
			tier: "SOLID_STARTER",
			module: "conflict",
			conflict: "yes",
			reason: `CONFLICT: ${oneA.reason} || ${oneB.reason}`,
			passedSignals: [...oneA.allSignals, ...oneB.passedSignals],
			failReasons: [],
			oneA,
			oneB,
		};
	}
	if (oneB.passed) {
		return {
			tier: "SOLID_STARTER",
			module: "1B-B",
			conflict: "no",
			reason: oneB.reason,
			passedSignals: oneB.passedSignals,
			failReasons: oneB.failReasons,
			oneA,
			oneB,
		};
	}
	if (oneA.passed) {
		return {
			tier: "HIGH_END_ROTATION",
			module: "1A",
			conflict: "no",
			reason: oneA.reason,
			passedSignals: oneA.allSignals,
			failReasons: oneA.failReasons,
			oneA,
			oneB,
		};
	}
	return {
		tier: row.currentTier,
		module: "none",
		conflict: "no",
		reason: `kept current scoreTier (${row.currentTier}); 1A failed: ${oneA.failReasons.join("; ")}; 1B-B failed: ${oneB.failReasons.join("; ")}`,
		passedSignals: [],
		failReasons: [
			...oneA.failReasons.map((reason) => `1A: ${reason}`),
			...oneB.failReasons.map((reason) => `1B-B: ${reason}`),
		],
		oneA,
		oneB,
	};
};

const buildRows = () => {
	const save = readSave(savePath);
	const entries = save.players
		.filter(
			(player) =>
				player.tid >= -1 && player.stats?.some((stats) => !stats.playoffs),
		)
		.map((player) => ({
			key: `v3-ab-combined-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries: entries,
	});
	const scoredRows = rows.map((row) => {
		const current = scoreTier(row);
		const base = {
			...row,
			contractRelevant:
				row.tid === -1 || row.normalNoOptionContractYears <= 1 ? "yes" : "no",
			currentTier: current.tier,
			currentReason: current.reason,
		};
		const combined = combinedScore(base);
		const move = tierMove(base.currentTier, combined.tier);
		return {
			...base,
			combinedTier: combined.tier,
			responsibleModule: combined.module,
			conflict: combined.conflict,
			combinedReason: combined.reason,
			combinedPassedSignals: combined.passedSignals.join("; "),
			combinedFailReasons: combined.failReasons.join("; "),
			oneAPassed: combined.oneA.passed ? "yes" : "no",
			oneBPassed: combined.oneB.passed ? "yes" : "no",
			oneASupportScore: combined.oneA.supportScore,
			oneBCoreProductionCount: combined.oneB.productionCount,
			oneBExceptionPath: combined.oneB.exception ? "yes" : "no",
			moveDirection: move.direction,
			moveSteps: move.steps,
		};
	});
	return { attrs, rows: scoredRows };
};

const top15RosterProxy = (rows) => {
	const pids = new Set();
	for (const [, teamRows] of groupRows(
		rows.filter((row) => num(row, "tid", -99) >= 0),
		(row) => row.tid,
	)) {
		teamRows
			.slice()
			.sort(
				(a, b) =>
					num(b, "valueNoPot", 0) - num(a, "valueNoPot", 0) ||
					num(b, "MPG", 0) - num(a, "MPG", 0),
			)
			.slice(0, 15)
			.forEach((row) => pids.add(Number(row.pid)));
	}
	return rows.filter((row) => pids.has(Number(row.pid)));
};
const poolViews = (rows) => [
	{ pool: "all_active", rows },
	{
		pool: "rostered_active",
		rows: rows.filter((row) => num(row, "tid", -99) >= 0),
	},
	{ pool: "top15_roster_proxy", rows: top15RosterProxy(rows) },
	{
		pool: "contract_relevant",
		rows: rows.filter((row) => row.contractRelevant === "yes"),
	},
];

const distributionRows = ({ pool, rows, model }) => {
	const tierField = model === "current" ? "currentTier" : "combinedTier";
	const total = rows.length;
	return TIERS.map((tier) => {
		const tierRows = rows.filter((row) => row[tierField] === tier);
		return {
			pool,
			model,
			tier,
			count: tierRows.length,
			percentage: total ? round(tierRows.length / total, 6) : 0,
			percentageText: pct(total ? tierRows.length / total : 0),
			avgAge: round(avg(tierRows.map((row) => row.age)), 3),
			avgMPG: round(avg(tierRows.map((row) => row.MPG)), 3),
			avgValue: round(avg(tierRows.map((row) => row.value)), 3),
			avgValueNoPot: round(avg(tierRows.map((row) => row.valueNoPot)), 3),
			avgGetContractValue: round(
				avg(tierRows.map((row) => row.getContractValue)),
				3,
			),
			avgPER: round(avg(tierRows.map((row) => row.PER)), 3),
			avgEWA: round(avg(tierRows.map((row) => row.EWA)), 3),
			avgVORP: round(avg(tierRows.map((row) => row.VORP)), 3),
			avgBPM: round(avg(tierRows.map((row) => row.BPM)), 3),
		};
	});
};

const transitionRows = ({ pool, rows }) => {
	const currentCounts = new Map();
	for (const row of rows)
		currentCounts.set(
			row.currentTier,
			(currentCounts.get(row.currentTier) ?? 0) + 1,
		);
	return groupRows(rows, (row) => `${row.currentTier}||${row.combinedTier}`)
		.map(([key, groupedRows]) => {
			const [currentTier, combinedTier] = key.split("||");
			const move = tierMove(currentTier, combinedTier);
			const share =
				groupedRows.length /
				(currentCounts.get(currentTier) ?? groupedRows.length);
			const unexpected =
				(combinedTier === "SOLID_STARTER" &&
					currentTier !== "LOW_END_STARTER") ||
				(combinedTier === "HIGH_END_ROTATION" &&
					[
						"SUPERSTAR_MAX",
						"STAR_NEAR_MAX",
						"YOUNG_PROVEN_STARTER",
						"LOW_END_STARTER",
					].includes(currentTier));
			return {
				pool,
				currentTier,
				combinedTier,
				count: groupedRows.length,
				percentageOfCurrentTier: round(share, 6),
				percentageOfCurrentTierText: pct(share),
				moveDirection: move.direction,
				moveSteps: move.steps,
				focusTransition: boolText(
					[
						"YOUNG_UPSIDE_SUSPECT||HIGH_END_ROTATION",
						"VETERAN_ROTATION_GUARD||HIGH_END_ROTATION",
						"MINIMUM_LEVEL||HIGH_END_ROTATION",
						"LOW_END_STARTER||SOLID_STARTER",
					].includes(`${currentTier}||${combinedTier}`),
				),
				unexpectedTransition: boolText(unexpected),
			};
		})
		.sort(
			(a, b) =>
				a.pool.localeCompare(b.pool) ||
				(TIER_RANK[a.currentTier] ?? 99) - (TIER_RANK[b.currentTier] ?? 99) ||
				(TIER_RANK[a.combinedTier] ?? 99) - (TIER_RANK[b.combinedTier] ?? 99),
		);
};

const capRows = ({ pool, rows, attrs, model }) => {
	const tierField = model === "current" ? "currentTier" : "combinedTier";
	const capFor = (row) => {
		const tier = row[tierField];
		const range =
			model === "current"
				? tierRange(tier, row, attrs)
				: moduleRangeForTier(tier, row, attrs);
		const minM = model === "current" ? range.modelRangeMin / 1000 : range.minM;
		const maxM = model === "current" ? range.modelRangeMax / 1000 : range.maxM;
		return {
			minCap: (minM * 1000) / attrs.salaryCap,
			midCap: (((minM + maxM) / 2) * 1000) / attrs.salaryCap,
			maxCap: (maxM * 1000) / attrs.salaryCap,
		};
	};
	const outRows = [];
	for (const tier of TIERS) {
		const tierRows = rows.filter((row) => row[tierField] === tier);
		if (tierRows.length === 0) continue;
		const caps = tierRows.map(capFor);
		outRows.push({
			pool,
			model,
			tier,
			count: tierRows.length,
			tierMinCapPct: avg(caps.map((cap) => cap.minCap)),
			tierMidpointCapPct: avg(caps.map((cap) => cap.midCap)),
			tierMaxCapPct: avg(caps.map((cap) => cap.maxCap)),
			totalImpliedMinCapPct: sum(caps.map((cap) => cap.minCap)),
			totalImpliedMidpointCapPct: sum(caps.map((cap) => cap.midCap)),
			totalImpliedMaxCapPct: sum(caps.map((cap) => cap.maxCap)),
		});
	}
	const allCaps = rows.map(capFor);
	outRows.push({
		pool,
		model,
		tier: "__TOTAL__",
		count: rows.length,
		tierMinCapPct: rows.length
			? sum(allCaps.map((cap) => cap.minCap)) / rows.length
			: 0,
		tierMidpointCapPct: rows.length
			? sum(allCaps.map((cap) => cap.midCap)) / rows.length
			: 0,
		tierMaxCapPct: rows.length
			? sum(allCaps.map((cap) => cap.maxCap)) / rows.length
			: 0,
		totalImpliedMinCapPct: sum(allCaps.map((cap) => cap.minCap)),
		totalImpliedMidpointCapPct: sum(allCaps.map((cap) => cap.midCap)),
		totalImpliedMaxCapPct: sum(allCaps.map((cap) => cap.maxCap)),
	});
	return outRows;
};

const loadLabeledRows = () => {
	const v2ByKey = new Map();
	const comparableRows = [];
	for (const input of labeledInputs) {
		for (const row of readCsv(input.v2Path)) {
			v2ByKey.set(`${input.dataset}:${row.caseId}`, {
				dataset: input.dataset,
				...row,
			});
		}
		for (const row of readCsv(input.evalPath))
			comparableRows.push({ dataset: input.dataset, ...row });
	}
	return comparableRows.map((row) => ({
		...v2ByKey.get(`${row.dataset}:${row.caseId}`),
		...row,
		pid: v2ByKey.get(`${row.dataset}:${row.caseId}`)?.pid,
		currentV2PointM: row.debugPointEstimateM,
		currentV2GapM: row.v2PointGapToHumanRangeM,
		currentV2Direction: row.v2PointDirection,
		currentV2Severe: row.v2Severe,
	}));
};

const pointGap = ({ point, humanMin, humanMax }) => {
	if (
		!Number.isFinite(point) ||
		!Number.isFinite(humanMin) ||
		!Number.isFinite(humanMax)
	)
		return "";
	if (point < humanMin) return humanMin - point;
	if (point > humanMax) return point - humanMax;
	return 0;
};
const pointDirection = ({ point, humanMin, humanMax }) => {
	if (
		!Number.isFinite(point) ||
		!Number.isFinite(humanMin) ||
		!Number.isFinite(humanMax)
	)
		return "missing";
	if (point < humanMin) return "too_low";
	if (point > humanMax) return "too_high";
	return "inside";
};
const severeFromGap = (gapM, salaryCap) =>
	Number.isFinite(gapM) && (gapM >= 8 || (gapM * 1000) / salaryCap >= 0.05)
		? "yes"
		: "no";

const labeledEvalRows = ({ labeledRows, rowsByPid, attrs }) =>
	labeledRows.map((label) => {
		const row = rowsByPid.get(Number(label.pid));
		const range = moduleRangeForTier(row.combinedTier, row, attrs);
		const combinedV2 = scoreContractMarketV2(
			{
				...row,
				debugModelTier: row.combinedTier,
				debugModelRangeText: range.text,
				modelYears: range.years,
				debugModelReason: row.combinedReason,
			},
			attrs,
		);
		const combinedPoint = combinedV2.debugPointEstimateM;
		const combinedGap = pointGap({
			point: combinedPoint,
			humanMin: label.humanAmountMinM,
			humanMax: label.humanAmountMaxM,
		});
		const combinedDirection = pointDirection({
			point: combinedPoint,
			humanMin: label.humanAmountMinM,
			humanMax: label.humanAmountMaxM,
		});
		const rangeOverlap =
			Number.isFinite(label.humanAmountMinM) &&
			Number.isFinite(label.humanAmountMaxM) &&
			range.maxM >= label.humanAmountMinM &&
			range.minM <= label.humanAmountMaxM;
		const deltaGap = combinedGap - label.currentV2GapM;
		return {
			dataset: label.dataset,
			caseId: label.caseId,
			globalCaseId: label.globalCaseId,
			name: label.name,
			bucket: label.bucket,
			humanRangeText: label.humanRangeText,
			humanAmountMinM: label.humanAmountMinM,
			humanAmountMaxM: label.humanAmountMaxM,
			humanMidpointM: label.humanMidpointM,
			age: row.age,
			GP: row.GP,
			MPG: row.MPG,
			GS: row.GS,
			starterShare: row.starterShare,
			valueNoPot: row.valueNoPot,
			contractValue: row.getContractValue,
			PER: row.PER,
			EWA: row.EWA,
			VORP: row.VORP,
			BPM: row.BPM,
			currentTier: row.currentTier,
			combinedTier: row.combinedTier,
			responsibleModule: row.responsibleModule,
			conflict: row.conflict,
			moveDirection: row.moveDirection,
			moveSteps: row.moveSteps,
			combinedReason: row.combinedReason,
			combinedPassedSignals: row.combinedPassedSignals,
			currentV2PointM: label.currentV2PointM,
			combinedPointM: combinedPoint,
			currentV2GapM: label.currentV2GapM,
			combinedGapM: combinedGap,
			deltaGapM: deltaGap,
			currentV2Direction: label.currentV2Direction,
			combinedDirection,
			currentV2Severe: label.currentV2Severe,
			combinedSevere: severeFromGap(combinedGap, attrs.salaryCap),
			combinedRangeText: range.text,
			combinedRangeMinM: range.minM,
			combinedRangeMaxM: range.maxM,
			combinedRangeOverlapsHuman: boolText(rangeOverlap),
			combinedTierPlacementScore: combinedV2.tierPlacementScore,
			combinedRiskFlags: combinedV2.riskFlags.join("; "),
			tradeExploitRiskFlag: combinedV2.tradeExploitRiskFlag,
			winner:
				Math.abs(deltaGap) <= 0.1
					? "tie"
					: deltaGap < 0
						? "combined"
						: "current_v2",
			severeFixed:
				label.currentV2Severe === "yes" &&
				severeFromGap(combinedGap, attrs.salaryCap) === "no"
					? "yes"
					: "no",
			newSevere:
				label.currentV2Severe !== "yes" &&
				severeFromGap(combinedGap, attrs.salaryCap) === "yes"
					? "yes"
					: "no",
			improvedBy3M: deltaGap <= -3 ? "yes" : "no",
			worsenedBy3M: deltaGap >= 3 ? "yes" : "no",
			tooLowFixed:
				label.currentV2Direction === "too_low" &&
				combinedDirection !== "too_low"
					? "yes"
					: "no",
			tooHighAdded:
				label.currentV2Direction !== "too_high" &&
				combinedDirection === "too_high"
					? "yes"
					: "no",
		};
	});

const evalSummary = (rows) => ({
	labeled: rows.length,
	currentMeanGap: avg(rows.map((row) => row.currentV2GapM)),
	combinedMeanGap: avg(rows.map((row) => row.combinedGapM)),
	currentMedianGap: median(rows.map((row) => row.currentV2GapM)),
	combinedMedianGap: median(rows.map((row) => row.combinedGapM)),
	currentSevere: count(rows, (row) => row.currentV2Severe === "yes"),
	combinedSevere: count(rows, (row) => row.combinedSevere === "yes"),
	currentTooLow: count(rows, (row) => row.currentV2Direction === "too_low"),
	combinedTooLow: count(rows, (row) => row.combinedDirection === "too_low"),
	currentTooHigh: count(rows, (row) => row.currentV2Direction === "too_high"),
	combinedTooHigh: count(rows, (row) => row.combinedDirection === "too_high"),
	combinedBetter: count(rows, (row) => row.winner === "combined"),
	currentBetter: count(rows, (row) => row.winner === "current_v2"),
	tie: count(rows, (row) => row.winner === "tie"),
	severeFixed: count(rows, (row) => row.severeFixed === "yes"),
	newSevere: count(rows, (row) => row.newSevere === "yes"),
	improvedBy3M: count(rows, (row) => row.improvedBy3M === "yes"),
	worsenedBy3M: count(rows, (row) => row.worsenedBy3M === "yes"),
	tooLowFixed: count(rows, (row) => row.tooLowFixed === "yes"),
	tooHighAdded: count(rows, (row) => row.tooHighAdded === "yes"),
});

const bpmBucket = (row) => {
	const bpm = num(row, "BPM", 0);
	if (bpm < -1) return "BPM < -1";
	if (bpm < 0) return "-1 <= BPM < 0";
	if (bpm < 1) return "0 <= BPM < 1";
	return "BPM >= 1";
};

const buildLaneHits = ({ rows, labeledEval }) => {
	const laneRows = [];
	const add = (row) =>
		laneRows.push({
			section: row.section ?? "",
			lane: row.lane ?? "",
			pool: row.pool ?? "",
			currentTier: row.currentTier ?? "",
			combinedTier: row.combinedTier ?? "",
			caseId: row.caseId ?? "",
			dataset: row.dataset ?? "",
			name: row.name ?? "",
			signalOrCombination: row.signalOrCombination ?? "",
			count: row.count ?? "",
			percentage: row.percentage === undefined ? "" : pct(row.percentage),
			notes: row.notes ?? "",
		});
	const moduleEntrants = (module) =>
		rows.filter((row) => row.responsibleModule === module);
	for (const module of ["1A", "1B-B"]) {
		const entrants = moduleEntrants(module);
		add({
			section: "module_entrant_count",
			lane: module,
			count: entrants.length,
			percentage: entrants.length / rows.length,
		});
		for (const [tier, subset] of groupRows(
			entrants,
			(row) => row.currentTier,
		)) {
			add({
				section: "entrants_by_current_tier",
				lane: module,
				currentTier: tier,
				combinedTier: module === "1A" ? "HIGH_END_ROTATION" : "SOLID_STARTER",
				count: subset.length,
				percentage: entrants.length ? subset.length / entrants.length : 0,
			});
		}
		for (const { pool, rows: poolRows } of poolViews(rows)) {
			const subset = poolRows.filter((row) => row.responsibleModule === module);
			add({
				section: "entrants_by_pool",
				lane: module,
				pool,
				count: subset.length,
				percentage: poolRows.length ? subset.length / poolRows.length : 0,
			});
		}
		for (const [bucket, subset] of groupRows(entrants, bpmBucket)) {
			add({
				section: "bpm_bucket",
				lane: module,
				signalOrCombination: bucket,
				count: subset.length,
				percentage: entrants.length ? subset.length / entrants.length : 0,
			});
		}
		for (const [combo, subset] of groupRows(
			entrants,
			(row) => row.combinedPassedSignals || "(no signals)",
		).sort((a, b) => b[1].length - a[1].length)) {
			add({
				section: "signal_combination",
				lane: module,
				signalOrCombination: combo,
				count: subset.length,
				percentage: entrants.length ? subset.length / entrants.length : 0,
			});
		}
		const signalNames =
			module === "1A"
				? [
						...roleSignals1A(rows[0]).map((entry) => entry.label),
						...coreIdentitySignals1A(rows[0]).map((entry) => entry.label),
						...valueProductionSignals1A(rows[0]).map((entry) => entry.label),
					]
				: [
						...roleSignals1B(rows[0]).map((entry) => entry.label),
						`value core: valueNoPot >= ${MODULES.oneB.valueNoPot} and contractValue >= ${MODULES.oneB.contractValue}`,
						...productionSignals1B(rows[0]).map((entry) => entry.label),
						...extraSignals1B(rows[0]).map((entry) => entry.label),
						"BPM<0 exception path",
					];
		for (const signalName of signalNames) {
			const n = count(entrants, (row) =>
				row.combinedPassedSignals.split("; ").includes(signalName),
			);
			add({
				section: "entrant_signal_pass_count",
				lane: module,
				signalOrCombination: signalName,
				count: n,
				percentage: entrants.length ? n / entrants.length : 0,
			});
		}
	}
	add({
		section: "conflict_count",
		lane: "combined",
		count: count(rows, (row) => row.conflict === "yes"),
		percentage: rows.length
			? count(rows, (row) => row.conflict === "yes") / rows.length
			: 0,
	});
	for (const currentTier of [
		"YOUNG_UPSIDE_SUSPECT",
		"VETERAN_ROTATION_GUARD",
		"MINIMUM_LEVEL",
		"LOW_END_STARTER",
	]) {
		const target =
			currentTier === "LOW_END_STARTER" ? "SOLID_STARTER" : "HIGH_END_ROTATION";
		const subset = rows.filter(
			(row) => row.currentTier === currentTier && row.combinedTier === target,
		);
		const total = count(rows, (row) => row.currentTier === currentTier);
		add({
			section: "focus_transition_count",
			lane: currentTier === "LOW_END_STARTER" ? "1B-B" : "1A",
			currentTier,
			combinedTier: target,
			count: subset.length,
			percentage: total ? subset.length / total : 0,
			notes: `${subset.length} of ${total} current ${currentTier}`,
		});
	}
	for (const row of labeledEval.filter(
		(label) =>
			(label.dataset === "boundary40" && label.caseId === "H-02") ||
			(label.dataset === "validation20" && label.caseId === "V20-11"),
	)) {
		add({
			section: "named_status",
			lane: row.responsibleModule,
			currentTier: row.currentTier,
			combinedTier: row.combinedTier,
			caseId: row.caseId,
			dataset: row.dataset,
			name: row.name,
			count: 1,
			notes: `${row.name} ${row.caseId}: ${row.currentTier} -> ${row.combinedTier}; module ${row.responsibleModule}; point ${round(row.combinedPointM, 2)} vs human ${row.humanRangeText}; direction ${row.combinedDirection}; gap ${round(row.combinedGapM, 2)}M`,
		});
	}
	return laneRows;
};

const missTags = (row) => {
	const tags = [];
	if (row.combinedGapM > 0 && row.combinedGapM < 3)
		tags.push("near_boundary_minor_miss");
	if (
		row.combinedDirection === "too_low" &&
		row.combinedRangeOverlapsHuman === "yes"
	) {
		tags.push("third_layer_point_placement_issue");
	}
	if (
		row.combinedDirection === "too_low" &&
		row.combinedRangeOverlapsHuman !== "yes" &&
		row.responsibleModule !== "none"
	) {
		tags.push("second_layer_range_issue");
	}
	if (row.combinedDirection === "too_low" && row.responsibleModule === "none") {
		tags.push("first_layer_gap_possible");
	}
	if (
		row.combinedDirection === "too_high" &&
		row.combinedGapM >= 3 &&
		(row.bucket.includes("solid") || row.bucket.includes("rotation"))
	) {
		tags.push("human_range_maybe_low_or_high");
	}
	if (
		row.bucket.includes("specialist") ||
		row.bucket.includes("guard") ||
		row.bucket.includes("young") ||
		row.bucket.includes("starter")
	) {
		tags.push("special_archetype_issue");
	}
	tags.push("needs_manual_review");
	return [...new Set(tags)];
};

const buildRemainingMisses = (labeledEval) =>
	labeledEval
		.filter((row) => {
			const named =
				(row.dataset === "boundary40" && row.caseId === "H-02") ||
				(row.dataset === "validation20" && row.caseId === "V20-11");
			const gap = Number(row.combinedGapM);
			return (
				named ||
				row.combinedSevere === "yes" ||
				(row.combinedDirection === "too_low" && gap >= 3) ||
				(row.combinedDirection === "too_high" && gap >= 3) ||
				(gap > 0 && gap < 1.5 && row.responsibleModule !== "none")
			);
		})
		.map((row) => ({
			dataset: row.dataset,
			caseId: row.caseId,
			globalCaseId: row.globalCaseId,
			name: row.name,
			bucket: row.bucket,
			humanRangeText: row.humanRangeText,
			age: round(row.age, 3),
			MPG: round(row.MPG, 3),
			starterShare: round(row.starterShare, 3),
			valueNoPot: round(row.valueNoPot, 3),
			contractValue: round(row.contractValue, 3),
			currentTier: row.currentTier,
			combinedTier: row.combinedTier,
			responsibleModule: row.responsibleModule,
			currentPointM: round(row.currentV2PointM, 3),
			combinedPointM: round(row.combinedPointM, 3),
			currentGapM: round(row.currentV2GapM, 3),
			combinedGapM: round(row.combinedGapM, 3),
			combinedDirection: row.combinedDirection,
			combinedSevere: row.combinedSevere,
			combinedRangeText: row.combinedRangeText,
			combinedRangeOverlapsHuman: row.combinedRangeOverlapsHuman,
			classification: missTags(row).join("; "),
			notes:
				row.combinedGapM > 0 && row.combinedGapM < 3
					? "minor gap; do not treat as strong first-layer evidence"
					: row.responsibleModule !== "none" &&
						  row.combinedDirection === "too_low"
						? "already upgraded by first-layer module; inspect range/placement before adding 1C"
						: "",
		}))
		.sort((a, b) => Number(b.combinedGapM) - Number(a.combinedGapM));

const buildOneCAudit = ({ rows, labeledEval, remainingMisses }) => {
	const h02 = labeledEval.find(
		(row) => row.dataset === "boundary40" && row.caseId === "H-02",
	);
	const v2011 = labeledEval.find(
		(row) => row.dataset === "validation20" && row.caseId === "V20-11",
	);
	const remainingTooLow = labeledEval.filter(
		(row) =>
			row.combinedDirection === "too_low" && Number(row.combinedGapM) >= 3,
	);
	const remainingSevere = labeledEval.filter(
		(row) => row.combinedSevere === "yes",
	);
	const lowEndTooLow = remainingTooLow.filter(
		(row) => row.combinedTier === "LOW_END_STARTER",
	);
	const alreadyUpgradedTooLow = remainingTooLow.filter((row) =>
		["HIGH_END_ROTATION", "SOLID_STARTER"].includes(row.combinedTier),
	);
	const nonYoungStarterStillLow = remainingTooLow.filter(
		(row) =>
			row.combinedTier === "LOW_END_STARTER" &&
			num(row, "age", 0) > 27 &&
			(num(row, "MPG", 0) >= 29 || num(row, "starterShare", 0) >= 0.65),
	);
	const conflictCount = count(rows, (row) => row.conflict === "yes");
	const oneAEntrants = count(rows, (row) => row.responsibleModule === "1A");
	const oneBEntrants = count(rows, (row) => row.responsibleModule === "1B-B");
	const broadOneCRisk =
		lowEndTooLow.length <= 2 &&
		alreadyUpgradedTooLow.length >= lowEndTooLow.length
			? "high risk of recreating a broad HIGH_IMPACT_STARTER absorption layer if opened for 1-2 cases"
			: "needs review; avoid broad absorption layer";
	return [
		{
			check: "conflict count",
			answer: String(conflictCount),
			evidence: `${conflictCount} players hit both 1A and 1B-B`,
			implication:
				conflictCount === 0
					? "combined modules are separable on original current tier"
					: "must resolve precedence before any further sweep",
		},
		{
			check: "H-02 / Simmons enters SOLID_STARTER",
			answer: h02?.combinedTier === "SOLID_STARTER" ? "yes" : "no",
			evidence: h02
				? `${h02.name}: ${h02.currentTier} -> ${h02.combinedTier}, module ${h02.responsibleModule}, point ${round(h02.combinedPointM, 2)} vs ${h02.humanRangeText}, ${h02.combinedDirection}, gap ${round(h02.combinedGapM, 2)}M`
				: "missing",
			implication:
				h02?.combinedTier === "SOLID_STARTER" &&
				h02?.combinedDirection === "too_low"
					? "remaining miss is more likely SOLID_STARTER range/placement than first-layer capture"
					: "review manually",
		},
		{
			check: "V20-11 / AD enters SOLID_STARTER",
			answer: v2011?.combinedTier === "SOLID_STARTER" ? "yes" : "no",
			evidence: v2011
				? `${v2011.name}: ${v2011.currentTier} -> ${v2011.combinedTier}, module ${v2011.responsibleModule}, point ${round(v2011.combinedPointM, 2)} vs ${v2011.humanRangeText}, ${v2011.combinedDirection}, gap ${round(v2011.combinedGapM, 2)}M`
				: "missing",
			implication:
				v2011?.combinedTier === "SOLID_STARTER" &&
				v2011?.combinedDirection === "too_low"
					? "remaining miss is more likely SOLID_STARTER range/placement than first-layer capture"
					: "review manually",
		},
		{
			check: "remaining severe",
			answer: String(remainingSevere.length),
			evidence:
				remainingSevere
					.map(
						(row) =>
							`${row.dataset} ${row.caseId} ${row.combinedTier} ${row.combinedDirection} ${round(row.combinedGapM, 2)}M`,
					)
					.join("; ") || "none",
			implication:
				remainingSevere.length === 0
					? "no severe first-layer pressure from labeled 48"
					: "inspect whether misses are already in upgraded tiers",
		},
		{
			check: "remaining too_low >= 3M still in LOW_END_STARTER",
			answer: String(lowEndTooLow.length),
			evidence:
				lowEndTooLow
					.map(
						(row) =>
							`${row.dataset} ${row.caseId} ${row.name} gap ${round(row.combinedGapM, 2)}M`,
					)
					.join("; ") || "none",
			implication:
				lowEndTooLow.length >= 4
					? "possible narrow 1C pool exists"
					: "not enough broad first-layer evidence by itself",
		},
		{
			check:
				"remaining too_low >= 3M already upgraded to HIGH_END_ROTATION/SOLID_STARTER",
			answer: String(alreadyUpgradedTooLow.length),
			evidence:
				alreadyUpgradedTooLow
					.map(
						(row) =>
							`${row.dataset} ${row.caseId} ${row.combinedTier} gap ${round(row.combinedGapM, 2)}M`,
					)
					.join("; ") || "none",
			implication:
				alreadyUpgradedTooLow.length > lowEndTooLow.length
					? "prioritize second-layer range or third-layer placement"
					: "mixed evidence",
		},
		{
			check: "non-young current-impact starters still missed by 1B-B",
			answer: String(nonYoungStarterStillLow.length),
			evidence:
				nonYoungStarterStillLow
					.map((row) => `${row.dataset} ${row.caseId} ${row.name}`)
					.join("; ") || "none",
			implication:
				nonYoungStarterStillLow.length >= 3
					? "could justify a narrow 1C hypothesis"
					: "does not justify broad 1C",
		},
		{
			check: "broad 1C absorption risk",
			answer: broadOneCRisk,
			evidence: `1A entrants ${oneAEntrants}; 1B-B entrants ${oneBEntrants}; LOW_END unresolved too_low ${lowEndTooLow.length}`,
			implication:
				"do not recreate candidate_0 HIGH_IMPACT_STARTER-like catch-all",
		},
		{
			check: "remaining_misses rows",
			answer: String(remainingMisses.length),
			evidence: `${remainingMisses.length} rows require manual audit after combined V3-AB`,
			implication: "use these rows to decide range/placement vs narrow 1C",
		},
	];
};

const writeRules = () => {
	const md = `# V3-AB combined first-layer audit rules

Scope: artifact-only audit. This combines V3-1A HIGH_END_ROTATION and V3-1B-narrow-B SOLID_STARTER. It does not modify src, formal scoreTier, formal MODEL_TIERS, sandbox v2, existing score CSVs, sampling, or temp files.

## Shared precedence

- Start from original current scoreTier.
- 1A and 1B-B eligibility both use original current tier.
- 1A output cannot feed 1B-B.
- 1B-B output cannot feed 1A.
- Any player hitting both modules is recorded as conflict.

## Module 1: V3-1A HIGH_END_ROTATION

- Uses the original candidate_1A dry-run gate.
- Temporary range: 7%-12% cap.
- Protected tiers: SUPERSTAR_MAX, STAR_NEAR_MAX, YOUNG_PROVEN_STARTER, LOW_END_STARTER.
- Hard floor: GP >= 45, MPG >= 18, valueNoPot >= 52, getContractValue >= 52 or value >= 54, and not PER < 9 with BPM < -3.
- Extra MINIMUM_LEVEL floor: MPG >= 22, valueNoPot >= 55, contractValue >= 55, and EWA >= 2 or VORP >= .2 or BPM >= -.5.
- Required groups: real role support, core identity, value/production support, and support score >= 3.

## Module 2: V3-1B-narrow-B SOLID_STARTER

- Only original current LOW_END_STARTER is eligible.
- Temporary range: 12%-17% cap.
- GP >= 55
- MPG >= 29
- valueNoPot >= 60
- getContractValue >= 60
- role core: starterShare >= .65 or GS >= 50 or MPG >= 31
- production core: at least 2 of BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16
- extra support: at least 1 of BPM >= 1.5, EWA >= 6, VORP >= 1.5, PER >= 17, defense/rebounding/connector support, shooting/spacing support, age <= 27 with value/pot support
- BPM < 0 blocks ordinary path unless the rare exception path passes.

No human labels, trade value, pid, name, or caseId are used as rule inputs.
`;
	fs.writeFileSync(out.rules, md);
};

const writeReports = ({
	rows,
	distribution,
	transitions,
	capBudgetRaw,
	labeledEval,
	laneHits,
	remainingMisses,
	oneCAudit,
}) => {
	const summary = evalSummary(labeledEval);
	const oneAEntrants = count(rows, (row) => row.responsibleModule === "1A");
	const oneBEntrants = count(rows, (row) => row.responsibleModule === "1B-B");
	const conflictCount = count(rows, (row) => row.conflict === "yes");
	const h02 = labeledEval.find(
		(row) => row.dataset === "boundary40" && row.caseId === "H-02",
	);
	const v2011 = labeledEval.find(
		(row) => row.dataset === "validation20" && row.caseId === "V20-11",
	);
	const capTotals = capBudgetRaw.filter((row) => row.tier === "__TOTAL__");
	const focusTransitions = transitions.filter(
		(row) => row.pool === "all_active" && row.focusTransition === "yes",
	);
	const unexpectedTransitions = transitions.filter(
		(row) => row.pool === "all_active" && row.unexpectedTransition === "yes",
	);
	const affected = labeledEval.filter(
		(row) => row.responsibleModule !== "none" || row.conflict === "yes",
	);
	const alreadyUpgradedTooLow = labeledEval.filter(
		(row) =>
			row.combinedDirection === "too_low" &&
			Number(row.combinedGapM) >= 3 &&
			["HIGH_END_ROTATION", "SOLID_STARTER"].includes(row.combinedTier),
	);
	const lowEndTooLow = labeledEval.filter(
		(row) =>
			row.combinedDirection === "too_low" &&
			Number(row.combinedGapM) >= 3 &&
			row.combinedTier === "LOW_END_STARTER",
	);
	const oneCAnswer =
		conflictCount > 0
			? "inconclusive"
			: lowEndTooLow.length >= 4
				? "inconclusive"
				: alreadyUpgradedTooLow.length >= lowEndTooLow.length
					? "no"
					: "inconclusive";
	const nextLayer =
		oneCAnswer === "no"
			? "second-layer range and third-layer placement should be reviewed before a 1C sweep"
			: "review remaining LOW_END_STARTER misses before defining any narrow 1C";

	const summaryMd = `# V3-AB combined first-layer audit

Artifact-only audit. This combines V3-1A HIGH_END_ROTATION and V3-1B-narrow-B SOLID_STARTER. It does not implement V3, modify src, modify formal scoreTier/MODEL_TIERS, modify sandbox v2, rewrite existing score CSVs, resample, write temp outputs, or commit.

## Top-line

| metric | value |
| --- | ---: |
| 1A HIGH_END_ROTATION entrants | ${oneAEntrants} |
| 1B-B SOLID_STARTER entrants | ${oneBEntrants} |
| conflicts | ${conflictCount} |
| labeled mean gap | ${round(summary.currentMeanGap, 2)} -> ${round(summary.combinedMeanGap, 2)} |
| labeled median gap | ${round(summary.currentMedianGap, 2)} -> ${round(summary.combinedMedianGap, 2)} |
| labeled severe | ${summary.currentSevere} -> ${summary.combinedSevere} |
| labeled too_low | ${summary.currentTooLow} -> ${summary.combinedTooLow} |
| labeled too_high | ${summary.currentTooHigh} -> ${summary.combinedTooHigh} |
| combined/current/tie | ${summary.combinedBetter} / ${summary.currentBetter} / ${summary.tie} |
| severe fixed / new severe | ${summary.severeFixed} / ${summary.newSevere} |
| too_low fixed / too_high added | ${summary.tooLowFixed} / ${summary.tooHighAdded} |

Safety read: ${summary.combinedSevere <= summary.currentSevere && conflictCount === 0 ? "passes severe/conflict tripwires" : "needs caution"}. Human ranges are calibration evidence, not ground truth; small point misses near a boundary are marked as minor rather than treated as automatic rule failures.

## 1C necessity

- Is 1C necessary now? **${oneCAnswer}**.
- Recommended next step: ${nextLayer}.
- Reason: H-02 and V20-11 are both checked explicitly below; if they are already in SOLID_STARTER but still too low, that is not clean evidence for a new first-layer tier.
- Broad 1C warning: if only a small number of special archetypes remain, opening a broad 1C risks recreating candidate_0-style HIGH_IMPACT_STARTER absorption.

## Required named checks

| case | status |
| --- | --- |
| H-02 / Simmons | ${h02 ? `${h02.name}: ${h02.currentTier} -> ${h02.combinedTier}, module ${h02.responsibleModule}, point ${round(h02.combinedPointM, 2)} vs ${h02.humanRangeText}, ${h02.combinedDirection}, gap ${round(h02.combinedGapM, 2)}M` : "missing"} |
| V20-11 / AD | ${v2011 ? `${v2011.name}: ${v2011.currentTier} -> ${v2011.combinedTier}, module ${v2011.responsibleModule}, point ${round(v2011.combinedPointM, 2)} vs ${v2011.humanRangeText}, ${v2011.combinedDirection}, gap ${round(v2011.combinedGapM, 2)}M` : "missing"} |

## Focus transitions

${markdownTable(focusTransitions, [
	{ key: "currentTier", label: "current tier" },
	{ key: "combinedTier", label: "combined tier" },
	{ key: "count", label: "count" },
	{ key: "percentageOfCurrentTierText", label: "% of current" },
	{ key: "moveDirection", label: "direction" },
	{ key: "moveSteps", label: "steps" },
])}

Unexpected transitions:

${
	unexpectedTransitions.length === 0
		? "None."
		: markdownTable(unexpectedTransitions, [
				{ key: "currentTier", label: "current tier" },
				{ key: "combinedTier", label: "combined tier" },
				{ key: "count", label: "count" },
				{ key: "percentageOfCurrentTierText", label: "% of current" },
			])
}

## Cap-budget totals

${markdownTable(capTotals, [
	{ key: "pool", label: "pool" },
	{ key: "model", label: "model" },
	{ key: "count", label: "count" },
	{ key: "totalImpliedMidpointCapPctText", label: "total mid cap" },
	{ key: "impliedMidpointCapPctPer30TeamsText", label: "mid/30" },
	{ key: "deltaTotalMidpointCapPctVsCurrentText", label: "delta" },
])}

## Affected labeled cases

${
	affected.length === 0
		? "No labeled cases changed tier."
		: markdownTable(
				affected.map((row) => ({
					dataset: row.dataset,
					caseId: row.caseId,
					bucket: row.bucket,
					human: row.humanRangeText,
					currentTier: row.currentTier,
					combinedTier: row.combinedTier,
					module: row.responsibleModule,
					currentPoint: round(row.currentV2PointM, 2),
					combinedPoint: round(row.combinedPointM, 2),
					currentGap: round(row.currentV2GapM, 2),
					combinedGap: round(row.combinedGapM, 2),
					direction: row.combinedDirection,
					signals: row.combinedPassedSignals,
				})),
				[
					{ key: "dataset", label: "dataset" },
					{ key: "caseId", label: "case" },
					{ key: "bucket", label: "bucket" },
					{ key: "human", label: "human" },
					{ key: "currentTier", label: "current tier" },
					{ key: "combinedTier", label: "combined tier" },
					{ key: "module", label: "module" },
					{ key: "currentPoint", label: "current point" },
					{ key: "combinedPoint", label: "combined point" },
					{ key: "combinedGap", label: "gap" },
					{ key: "direction", label: "direction" },
					{ key: "signals", label: "signals" },
				],
			)
}

## Remaining miss read

- Remaining misses written to \`remaining_misses.csv\`: ${remainingMisses.length}.
- Too-low >= 3M already upgraded to HIGH_END_ROTATION/SOLID_STARTER: ${alreadyUpgradedTooLow.length}.
- Too-low >= 3M still in LOW_END_STARTER: ${lowEndTooLow.length}.
- Read: if the miss is already in an upgraded first-layer tier, inspect range/placement before inventing 1C.

## Files

- \`rules.md\`: exact combined module rules.
- \`distribution.csv\`: four-pool current vs combined distribution.
- \`transition_matrix.csv\`: current -> combined movements.
- \`cap_budget.csv\`: four-pool cap burden.
- \`labeled_eval.csv\`: labeled 48 current v2 vs combined eval.
- \`lane_hits.csv\`: module entrants, signal counts, combinations, BPM buckets, named statuses.
- \`remaining_misses.csv\`: post-combined miss classification.
- \`one_c_necessity_audit.csv\`: explicit 1C necessity checks.
`;
	fs.writeFileSync(out.summary, summaryMd);

	const analysisMd = `# V3-AB combined analysis pack

## Audit answer

Is 1C necessary now? **${oneCAnswer}**.

The combined audit should be read as a first-layer diagnostic, not a final test. If H-02 / Simmons and V20-11 / AD are already in SOLID_STARTER, any remaining underpay on those cases is primarily a range/placement question unless a broader repeated LOW_END_STARTER miss pattern appears.

## Labeled 48 metrics

${markdownTable(
	[
		{
			metric: "mean gap",
			current: round(summary.currentMeanGap, 2),
			combined: round(summary.combinedMeanGap, 2),
		},
		{
			metric: "median gap",
			current: round(summary.currentMedianGap, 2),
			combined: round(summary.combinedMedianGap, 2),
		},
		{
			metric: "severe",
			current: summary.currentSevere,
			combined: summary.combinedSevere,
		},
		{
			metric: "too_low",
			current: summary.currentTooLow,
			combined: summary.combinedTooLow,
		},
		{
			metric: "too_high",
			current: summary.currentTooHigh,
			combined: summary.combinedTooHigh,
		},
	],
	[
		{ key: "metric", label: "metric" },
		{ key: "current", label: "current v2" },
		{ key: "combined", label: "combined V3-AB" },
	],
)}

## One C audit

${markdownTable(oneCAudit, [
	{ key: "check", label: "check" },
	{ key: "answer", label: "answer" },
	{ key: "evidence", label: "evidence" },
	{ key: "implication", label: "implication" },
])}
`;
	fs.writeFileSync(out.analysisPack, analysisMd);
};

const main = () => {
	fs.mkdirSync(outDir, { recursive: true });
	const { attrs, rows } = buildRows();
	const pools = poolViews(rows);

	const distribution = pools.flatMap(({ pool, rows: poolRows }) => [
		...distributionRows({ pool, rows: poolRows, model: "current" }),
		...distributionRows({ pool, rows: poolRows, model: "combined_v3_ab" }),
	]);
	const transitions = pools.flatMap(({ pool, rows: poolRows }) =>
		transitionRows({ pool, rows: poolRows }),
	);
	const rawCapBudget = pools.flatMap(({ pool, rows: poolRows }) => [
		...capRows({ pool, rows: poolRows, attrs, model: "current" }),
		...capRows({ pool, rows: poolRows, attrs, model: "combined_v3_ab" }),
	]);
	const currentMid = new Map(
		rawCapBudget
			.filter((row) => row.model === "current")
			.map((row) => [
				`${row.pool}||${row.tier}`,
				row.totalImpliedMidpointCapPct,
			]),
	);
	const capBudgetRaw = rawCapBudget.map((row) => {
		const delta =
			row.model === "combined_v3_ab"
				? row.totalImpliedMidpointCapPct -
					(currentMid.get(`${row.pool}||${row.tier}`) ?? 0)
				: 0;
		return {
			...row,
			impliedMidpointCapPctPer30Teams: row.totalImpliedMidpointCapPct / 30,
			deltaTotalMidpointCapPctVsCurrent: delta,
			tierMinCapPctText: pct(row.tierMinCapPct),
			tierMidpointCapPctText: pct(row.tierMidpointCapPct),
			tierMaxCapPctText: pct(row.tierMaxCapPct),
			totalImpliedMinCapPctText: pct(row.totalImpliedMinCapPct),
			totalImpliedMidpointCapPctText: pct(row.totalImpliedMidpointCapPct),
			totalImpliedMaxCapPctText: pct(row.totalImpliedMaxCapPct),
			impliedMidpointCapPctPer30TeamsText: pct(
				row.totalImpliedMidpointCapPct / 30,
			),
			deltaTotalMidpointCapPctVsCurrentText: pct(delta),
		};
	});
	const capBudget = capBudgetRaw.map((row) => ({
		pool: row.pool,
		model: row.model,
		tier: row.tier,
		count: row.count,
		tierMinCapPct: pct100(row.tierMinCapPct),
		tierMidpointCapPct: pct100(row.tierMidpointCapPct),
		tierMaxCapPct: pct100(row.tierMaxCapPct),
		totalImpliedMinCapPct: pct100(row.totalImpliedMinCapPct),
		totalImpliedMidpointCapPct: pct100(row.totalImpliedMidpointCapPct),
		totalImpliedMaxCapPct: pct100(row.totalImpliedMaxCapPct),
		impliedMidpointCapPctPer30Teams: pct100(
			row.impliedMidpointCapPctPer30Teams,
		),
		deltaTotalMidpointCapPctVsCurrent: pct100(
			row.deltaTotalMidpointCapPctVsCurrent,
		),
	}));

	const labeledRows = loadLabeledRows();
	const rowsByPid = new Map(rows.map((row) => [Number(row.pid), row]));
	const labeledEval = labeledEvalRows({ labeledRows, rowsByPid, attrs });
	const laneHits = buildLaneHits({ rows, labeledEval });
	const remainingMisses = buildRemainingMisses(labeledEval);
	const oneCAudit = buildOneCAudit({ rows, labeledEval, remainingMisses });

	writeCsv(out.distribution, distribution, [
		"pool",
		"model",
		"tier",
		"count",
		"percentage",
		"percentageText",
		"avgAge",
		"avgMPG",
		"avgValue",
		"avgValueNoPot",
		"avgGetContractValue",
		"avgPER",
		"avgEWA",
		"avgVORP",
		"avgBPM",
	]);
	writeCsv(out.transition, transitions, [
		"pool",
		"currentTier",
		"combinedTier",
		"count",
		"percentageOfCurrentTier",
		"percentageOfCurrentTierText",
		"moveDirection",
		"moveSteps",
		"focusTransition",
		"unexpectedTransition",
	]);
	writeCsv(out.capBudget, capBudget, [
		"pool",
		"model",
		"tier",
		"count",
		"tierMinCapPct",
		"tierMidpointCapPct",
		"tierMaxCapPct",
		"totalImpliedMinCapPct",
		"totalImpliedMidpointCapPct",
		"totalImpliedMaxCapPct",
		"impliedMidpointCapPctPer30Teams",
		"deltaTotalMidpointCapPctVsCurrent",
	]);
	writeCsv(out.labeledEval, labeledEval, [
		"dataset",
		"caseId",
		"globalCaseId",
		"name",
		"bucket",
		"humanRangeText",
		"humanAmountMinM",
		"humanAmountMaxM",
		"humanMidpointM",
		"age",
		"GP",
		"MPG",
		"GS",
		"starterShare",
		"valueNoPot",
		"contractValue",
		"PER",
		"EWA",
		"VORP",
		"BPM",
		"currentTier",
		"combinedTier",
		"responsibleModule",
		"conflict",
		"moveDirection",
		"moveSteps",
		"combinedReason",
		"combinedPassedSignals",
		"currentV2PointM",
		"combinedPointM",
		"currentV2GapM",
		"combinedGapM",
		"deltaGapM",
		"currentV2Direction",
		"combinedDirection",
		"currentV2Severe",
		"combinedSevere",
		"combinedRangeText",
		"combinedRangeMinM",
		"combinedRangeMaxM",
		"combinedRangeOverlapsHuman",
		"combinedTierPlacementScore",
		"combinedRiskFlags",
		"tradeExploitRiskFlag",
		"winner",
		"severeFixed",
		"newSevere",
		"improvedBy3M",
		"worsenedBy3M",
		"tooLowFixed",
		"tooHighAdded",
	]);
	writeCsv(out.laneHits, laneHits, [
		"section",
		"lane",
		"pool",
		"currentTier",
		"combinedTier",
		"caseId",
		"dataset",
		"name",
		"signalOrCombination",
		"count",
		"percentage",
		"notes",
	]);
	writeCsv(out.remainingMisses, remainingMisses, [
		"dataset",
		"caseId",
		"globalCaseId",
		"name",
		"bucket",
		"humanRangeText",
		"age",
		"MPG",
		"starterShare",
		"valueNoPot",
		"contractValue",
		"currentTier",
		"combinedTier",
		"responsibleModule",
		"currentPointM",
		"combinedPointM",
		"currentGapM",
		"combinedGapM",
		"combinedDirection",
		"combinedSevere",
		"combinedRangeText",
		"combinedRangeOverlapsHuman",
		"classification",
		"notes",
	]);
	writeCsv(out.oneCNecessityAudit, oneCAudit, [
		"check",
		"answer",
		"evidence",
		"implication",
	]);
	writeRules();
	writeReports({
		rows,
		distribution,
		transitions,
		capBudgetRaw,
		labeledEval,
		laneHits,
		remainingMisses,
		oneCAudit,
	});

	console.log(`Wrote ${out.script}`);
	console.log(`Wrote ${out.distribution}`);
	console.log(`Wrote ${out.transition}`);
	console.log(`Wrote ${out.capBudget}`);
	console.log(`Wrote ${out.labeledEval}`);
	console.log(`Wrote ${out.laneHits}`);
	console.log(`Wrote ${out.remainingMisses}`);
	console.log(`Wrote ${out.oneCNecessityAudit}`);
	console.log(`Wrote ${out.summary}`);
	console.log(`Wrote ${out.rules}`);
	console.log(`Wrote ${out.analysisPack}`);
	console.log(
		JSON.stringify(
			{
				oneAEntrants: count(rows, (row) => row.responsibleModule === "1A"),
				oneBEntrants: count(rows, (row) => row.responsibleModule === "1B-B"),
				conflicts: count(rows, (row) => row.conflict === "yes"),
				labeled: evalSummary(labeledEval),
			},
			null,
			2,
		),
	);
};

main();
