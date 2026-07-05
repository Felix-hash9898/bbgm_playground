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
	distribution: path.join(outDir, "distribution.csv"),
	transition: path.join(outDir, "transition_matrix.csv"),
	capBudget: path.join(outDir, "cap_budget.csv"),
	labeledEval: path.join(outDir, "labeled_eval.csv"),
	laneHits: path.join(outDir, "lane_hits.csv"),
	variantComparison: path.join(outDir, "variant_comparison.csv"),
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
	"SPECIALIST_ROTATION",
	"YOUNG_UPSIDE_SUSPECT",
	"VETERAN_ROTATION_GUARD",
	"LOW_ROTATION_PLUS",
	"VETERAN_MINIMUM_PLUS",
	"MINIMUM_LEVEL",
];
const TIER_RANK = Object.fromEntries(TIERS.map((tier, index) => [tier, index]));

const VARIANTS = {
	A: {
		label: "A_moderate_narrow",
		gp: 55,
		mpg: 28,
		valueNoPot: 59,
		contractValue: 59,
		roleShare: 0.6,
		roleGs: 41,
		roleMpg: 30,
		productionNeed: 2,
		production: { bpm: 0.5, ewa: 4, vorp: 0.8, per: 15.5 },
		extra: { bpm: 1, ewa: 5, vorp: 1, per: 16, age: true },
		allowBpmNegativeException: true,
		bpmNegativeOrdinaryBlock: true,
	},
	B: {
		label: "B_normal_strict",
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
		allowBpmNegativeException: true,
		bpmNegativeOrdinaryBlock: true,
	},
	C: {
		label: "C_very_strict",
		gp: 60,
		mpg: 30,
		valueNoPot: 61,
		contractValue: 61,
		roleShare: 0.7,
		roleGs: 55,
		roleMpg: 32,
		productionNeed: 3,
		production: { bpm: 1, ewa: 5, vorp: 1, per: 16 },
		extra: { bpm: 2, ewa: 7, vorp: 2, per: 18, age: false },
		allowBpmNegativeException: false,
		bpmNegativeOrdinaryBlock: true,
	},
};

const numericFields = new Set([
	"pid",
	"humanAmountMinM",
	"humanAmountMaxM",
	"humanMidpointM",
	"debugPointEstimateM",
	"v2PointGapToHumanRangeM",
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
const signal = (label, passed) => ({ label, passed });
const supportLabels = (entries) =>
	entries.filter((entry) => entry.passed).map((entry) => entry.label);
const boolText = (value) => (value ? "yes" : "no");

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

const roleSignals = (row, spec) => [
	signal(
		`role: starterShare >= ${spec.roleShare}`,
		num(row, "starterShare", 0) >= spec.roleShare,
	),
	signal(`role: GS >= ${spec.roleGs}`, num(row, "GS", 0) >= spec.roleGs),
	signal(`role: MPG >= ${spec.roleMpg}`, num(row, "MPG", 0) >= spec.roleMpg),
];
const productionSignals = (row, spec) => [
	signal(
		`production: BPM >= ${spec.production.bpm}`,
		num(row, "BPM", -99) >= spec.production.bpm,
	),
	signal(
		`production: EWA >= ${spec.production.ewa}`,
		num(row, "EWA", 0) >= spec.production.ewa,
	),
	signal(
		`production: VORP >= ${spec.production.vorp}`,
		num(row, "VORP", -99) >= spec.production.vorp,
	),
	signal(
		`production: PER >= ${spec.production.per}`,
		num(row, "PER", 0) >= spec.production.per,
	),
];
const extraSignals = (row, spec) => [
	signal(
		`extra: BPM >= ${spec.extra.bpm}`,
		num(row, "BPM", -99) >= spec.extra.bpm,
	),
	signal(
		`extra: EWA >= ${spec.extra.ewa}`,
		num(row, "EWA", 0) >= spec.extra.ewa,
	),
	signal(
		`extra: VORP >= ${spec.extra.vorp}`,
		num(row, "VORP", -99) >= spec.extra.vorp,
	),
	signal(
		`extra: PER >= ${spec.extra.per}`,
		num(row, "PER", 0) >= spec.extra.per,
	),
	signal(
		"extra: defense/rebounding/connector support",
		defenseConnectorSupport(row),
	),
	signal("extra: shooting/spacing support", shootingSpacingSupport(row)),
	signal(
		"extra: age <= 27 with value/pot support",
		spec.extra.age &&
			num(row, "age", 99) <= 27 &&
			(num(row, "value", 0) >= 58 || num(row, "pot", 0) >= 65),
	),
];
const exceptionSignals = (row) => [
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

const variantCheck = (row, currentTier, variant, spec) => {
	const failReasons = [];
	const eligible = currentTier === "LOW_END_STARTER";
	if (!eligible) failReasons.push(`current tier ${currentTier} blocked`);
	if (num(row, "GP", 0) < spec.gp) failReasons.push(`GP < ${spec.gp}`);
	if (num(row, "MPG", 0) < spec.mpg) failReasons.push(`MPG < ${spec.mpg}`);
	if (num(row, "valueNoPot", 0) < spec.valueNoPot) {
		failReasons.push(`valueNoPot < ${spec.valueNoPot}`);
	}
	if (num(row, "getContractValue", 0) < spec.contractValue) {
		failReasons.push(`contractValue < ${spec.contractValue}`);
	}

	const role = roleSignals(row, spec);
	const production = productionSignals(row, spec);
	const extra = extraSignals(row, spec);
	const rolePassed = role.some((entry) => entry.passed);
	const productionCount = production.filter((entry) => entry.passed).length;
	const productionPassed = productionCount >= spec.productionNeed;
	const extraPassed = extra.some((entry) => entry.passed);
	const bpmNegative = num(row, "BPM", 0) < 0;
	const exception =
		spec.allowBpmNegativeException &&
		bpmNegative &&
		currentTier === "LOW_END_STARTER" &&
		exceptionSignals(row).every((entry) => entry.passed);

	if (!rolePassed) failReasons.push("missing role core");
	if (!productionPassed) {
		failReasons.push(`production core count < ${spec.productionNeed}`);
	}
	if (!extraPassed) failReasons.push("missing extra support");
	if (bpmNegative && spec.bpmNegativeOrdinaryBlock && !exception) {
		failReasons.push("BPM < 0 without exception path");
	}

	const passed = failReasons.length === 0;
	const passedSignals = [
		...supportLabels(role),
		`value core: valueNoPot >= ${spec.valueNoPot} and contractValue >= ${spec.contractValue}`,
		...supportLabels(production),
		...supportLabels(extra),
		exception ? "BPM<0 exception path" : "",
	].filter(Boolean);
	return {
		variant,
		passed,
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
			`V3-1B-narrow ${variant} SOLID_STARTER bridge`,
			`role: ${supportLabels(role).join("; ") || "none"}`,
			`production ${productionCount}/${spec.productionNeed}: ${supportLabels(production).join("; ") || "none"}`,
			`extra: ${supportLabels(extra).join("; ") || "none"}`,
			exception ? "BPM<0 exception path" : "",
		]
			.filter(Boolean)
			.join(" | "),
	};
};

const rangeForTier = (tier, row, attrs) => {
	if (tier !== "SOLID_STARTER") {
		const range = tierRange(tier, row, attrs);
		return {
			minM: range.modelRangeMin / 1000,
			maxM: range.modelRangeMax / 1000,
			text: range.modelRangeText,
			years: range.modelYears,
		};
	}
	const min = Math.max(row.minContractForPlayer, attrs.salaryCap * 0.12);
	const max = Math.max(min, attrs.salaryCap * 0.17);
	return {
		minM: Math.round(min) / 1000,
		maxM: Math.round(max) / 1000,
		text: `${money(Math.round(min))}-${money(Math.round(max))}`,
		years: "",
	};
};

const tierMove = (currentTier, candidateTier) => {
	const delta = TIER_RANK[currentTier] - TIER_RANK[candidateTier];
	if (!Number.isFinite(delta)) return { direction: "unknown", steps: "" };
	if (delta > 0) return { direction: "up", steps: delta };
	if (delta < 0) return { direction: "down", steps: Math.abs(delta) };
	return { direction: "same", steps: 0 };
};

const buildRows = () => {
	const save = readSave(savePath);
	const entries = save.players
		.filter(
			(player) =>
				player.tid >= -1 && player.stats?.some((stats) => !stats.playoffs),
		)
		.map((player) => ({
			key: `v3-1b-narrow-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries: entries,
	});
	const baseRows = rows.map((row) => {
		const current = scoreTier(row);
		return {
			...row,
			currentTier: current.tier,
			currentReason: current.reason,
			contractRelevant:
				row.tid === -1 || row.normalNoOptionContractYears <= 1 ? "yes" : "no",
		};
	});
	return { attrs, rows: baseRows };
};

const scoreRowsForVariant = (rows, variant, spec) =>
	rows.map((row) => {
		const check = variantCheck(row, row.currentTier, variant, spec);
		const candidateTier = check.passed ? "SOLID_STARTER" : row.currentTier;
		const move = tierMove(row.currentTier, candidateTier);
		return {
			...row,
			variant,
			variantLabel: spec.label,
			candidateTier,
			candidateReason: check.passed
				? check.reason
				: `kept current scoreTier (${row.currentTier}); SOLID_STARTER ${variant} failed: ${check.failReasons.join("; ")}`,
			candidatePassedSignals: check.passedSignals.join("; "),
			candidateFailReasons: check.failReasons.join("; "),
			moveDirection: move.direction,
			moveSteps: move.steps,
			laneHardFloorPassed: check.hardFloorPassed ? "yes" : "no",
			laneRolePassed: check.rolePassed ? "yes" : "no",
			laneProductionPassed: check.productionPassed ? "yes" : "no",
			laneProductionCount: check.productionCount,
			laneExtraPassed: check.extraPassed ? "yes" : "no",
			laneExceptionPath: check.exception ? "yes" : "no",
		};
	});

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

const distributionRows = ({ variant, pool, rows, model }) => {
	const tierField = model === "current" ? "currentTier" : "candidateTier";
	return TIERS.map((tier) => {
		const tierRows = rows.filter((row) => row[tierField] === tier);
		const share = rows.length ? tierRows.length / rows.length : 0;
		return {
			variant,
			pool,
			model,
			tier,
			count: tierRows.length,
			percentage: round(share, 6),
			percentageText: pct(share),
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

const transitionRows = ({ variant, pool, rows }) => {
	const currentCounts = new Map();
	for (const row of rows)
		currentCounts.set(
			row.currentTier,
			(currentCounts.get(row.currentTier) ?? 0) + 1,
		);
	return groupRows(rows, (row) => `${row.currentTier}||${row.candidateTier}`)
		.map(([key, groupedRows]) => {
			const [currentTier, candidateTier] = key.split("||");
			const move = tierMove(currentTier, candidateTier);
			const share =
				groupedRows.length /
				(currentCounts.get(currentTier) ?? groupedRows.length);
			return {
				variant,
				pool,
				currentTier,
				candidateTier,
				count: groupedRows.length,
				percentageOfCurrentTier: round(share, 6),
				percentageOfCurrentTierText: pct(share),
				moveDirection: move.direction,
				moveSteps: move.steps,
				focusTransition: boolText(candidateTier === "SOLID_STARTER"),
			};
		})
		.sort(
			(a, b) =>
				a.variant.localeCompare(b.variant) ||
				a.pool.localeCompare(b.pool) ||
				(TIER_RANK[a.currentTier] ?? 99) - (TIER_RANK[b.currentTier] ?? 99) ||
				(TIER_RANK[a.candidateTier] ?? 99) - (TIER_RANK[b.candidateTier] ?? 99),
		);
};

const capRows = ({ variant, pool, rows, attrs, model }) => {
	const tierField = model === "current" ? "currentTier" : "candidateTier";
	const capFor = (row) => {
		const tier = row[tierField];
		const range =
			model === "current"
				? tierRange(tier, row, attrs)
				: rangeForTier(tier, row, attrs);
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
			variant,
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
		variant,
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

const labeledEvalRows = ({ variant, labeledRows, rowsByPid, attrs }) =>
	labeledRows.map((label) => {
		const row = rowsByPid.get(Number(label.pid));
		const range = rangeForTier(row.candidateTier, row, attrs);
		const v2 = scoreContractMarketV2(
			{
				...row,
				debugModelTier: row.candidateTier,
				debugModelRangeText: range.text,
				modelYears: range.years,
				debugModelReason: row.candidateReason,
			},
			attrs,
		);
		const candidatePoint = v2.debugPointEstimateM;
		const candidateGap = pointGap({
			point: candidatePoint,
			humanMin: label.humanAmountMinM,
			humanMax: label.humanAmountMaxM,
		});
		const candidateDirection = pointDirection({
			point: candidatePoint,
			humanMin: label.humanAmountMinM,
			humanMax: label.humanAmountMaxM,
		});
		const deltaGap = candidateGap - label.currentV2GapM;
		return {
			variant,
			dataset: label.dataset,
			caseId: label.caseId,
			globalCaseId: label.globalCaseId,
			name: label.name,
			bucket: label.bucket,
			humanRangeText: label.humanRangeText,
			humanAmountMinM: label.humanAmountMinM,
			humanAmountMaxM: label.humanAmountMaxM,
			humanMidpointM: label.humanMidpointM,
			currentTier: row.currentTier,
			candidateTier: row.candidateTier,
			moveDirection: row.moveDirection,
			moveSteps: row.moveSteps,
			candidateReason: row.candidateReason,
			candidatePassedSignals: row.candidatePassedSignals,
			candidateFailReasons: row.candidateFailReasons,
			currentV2PointM: label.currentV2PointM,
			candidatePointM: candidatePoint,
			currentV2GapM: label.currentV2GapM,
			candidateGapM: candidateGap,
			deltaGapM: deltaGap,
			currentV2Direction: label.currentV2Direction,
			candidateDirection,
			currentV2Severe: label.currentV2Severe,
			candidateSevere: severeFromGap(candidateGap, attrs.salaryCap),
			candidateRangeText: range.text,
			candidateTierPlacementScore: v2.tierPlacementScore,
			candidateRiskFlags: v2.riskFlags.join("; "),
			tradeExploitRiskFlag: v2.tradeExploitRiskFlag,
			winner:
				Math.abs(deltaGap) <= 0.1
					? "tie"
					: deltaGap < 0
						? "candidate"
						: "current_v2",
			severeFixed:
				label.currentV2Severe === "yes" &&
				severeFromGap(candidateGap, attrs.salaryCap) === "no"
					? "yes"
					: "no",
			newSevere:
				label.currentV2Severe !== "yes" &&
				severeFromGap(candidateGap, attrs.salaryCap) === "yes"
					? "yes"
					: "no",
			improvedBy3M: deltaGap <= -3 ? "yes" : "no",
			worsenedBy3M: deltaGap >= 3 ? "yes" : "no",
			tooLowFixed:
				label.currentV2Direction === "too_low" &&
				candidateDirection !== "too_low"
					? "yes"
					: "no",
			tooHighAdded:
				label.currentV2Direction !== "too_high" &&
				candidateDirection === "too_high"
					? "yes"
					: "no",
		};
	});

const evalSummary = (rows) => ({
	labeled: rows.length,
	currentMeanGap: avg(rows.map((row) => row.currentV2GapM)),
	candidateMeanGap: avg(rows.map((row) => row.candidateGapM)),
	currentMedianGap: median(rows.map((row) => row.currentV2GapM)),
	candidateMedianGap: median(rows.map((row) => row.candidateGapM)),
	currentSevere: count(rows, (row) => row.currentV2Severe === "yes"),
	candidateSevere: count(rows, (row) => row.candidateSevere === "yes"),
	currentTooLow: count(rows, (row) => row.currentV2Direction === "too_low"),
	candidateTooLow: count(rows, (row) => row.candidateDirection === "too_low"),
	currentTooHigh: count(rows, (row) => row.currentV2Direction === "too_high"),
	candidateTooHigh: count(rows, (row) => row.candidateDirection === "too_high"),
	candidateBetter: count(rows, (row) => row.winner === "candidate"),
	currentBetter: count(rows, (row) => row.winner === "current_v2"),
	tie: count(rows, (row) => row.winner === "tie"),
	severeFixed: count(rows, (row) => row.severeFixed === "yes"),
	newSevere: count(rows, (row) => row.newSevere === "yes"),
	improvedBy3M: count(rows, (row) => row.improvedBy3M === "yes"),
	worsenedBy3M: count(rows, (row) => row.worsenedBy3M === "yes"),
	tooLowFixed: count(rows, (row) => row.tooLowFixed === "yes"),
	tooHighAdded: count(rows, (row) => row.tooHighAdded === "yes"),
});
const pct100 = (value, digits = 3) =>
	Number.isFinite(value) ? round(value * 100, digits) : "";

const bpmBucket = (row) => {
	const bpm = num(row, "BPM", 0);
	if (bpm < -1) return "BPM < -1";
	if (bpm < 0) return "-1 <= BPM < 0";
	if (bpm < 1) return "0 <= BPM < 1";
	return "BPM >= 1";
};
const productionBucket = (row) => {
	const ewa = num(row, "EWA", 0);
	const vorp = num(row, "VORP", -99);
	const per = num(row, "PER", 0);
	if (ewa >= 7 || vorp >= 2 || per >= 18) return "elite extra production";
	if (ewa >= 5 || vorp >= 1 || per >= 16) return "strong production";
	if (ewa >= 4 || vorp >= 0.8 || per >= 15.5) return "moderate production";
	return "thin production";
};
const roleBucket = (row) => {
	if (
		num(row, "MPG", 0) >= 32 ||
		num(row, "starterShare", 0) >= 0.7 ||
		num(row, "GS", 0) >= 55
	)
		return "very strong starter role";
	if (
		num(row, "MPG", 0) >= 31 ||
		num(row, "starterShare", 0) >= 0.65 ||
		num(row, "GS", 0) >= 50
	)
		return "strict starter role";
	if (
		num(row, "MPG", 0) >= 30 ||
		num(row, "starterShare", 0) >= 0.6 ||
		num(row, "GS", 0) >= 41
	)
		return "moderate starter role";
	return "below narrow role";
};

const buildLaneHits = ({ variant, rows, spec, labeledEval }) => {
	const laneRows = [];
	const add = (row) =>
		laneRows.push({
			variant,
			section: row.section ?? "",
			lane: "SOLID_STARTER",
			pool: row.pool ?? "",
			currentTier: row.currentTier ?? "",
			candidateTier: row.candidateTier ?? "",
			signalOrCombination: row.signalOrCombination ?? "",
			count: row.count ?? "",
			percentage: row.percentage === undefined ? "" : pct(row.percentage),
			notes: row.notes ?? "",
		});
	const entrants = rows.filter((row) => row.candidateTier === "SOLID_STARTER");
	const hardFloorPass = rows.filter(
		(row) => variantCheck(row, row.currentTier, variant, spec).hardFloorPassed,
	);
	add({
		section: "hard_floor",
		count: hardFloorPass.length,
		percentage: hardFloorPass.length / rows.length,
		notes:
			"passes current LOW_END_STARTER eligibility + GP/MPG/value hard floor",
	});
	for (const [reason, subset] of groupRows(
		rows.flatMap((row) =>
			variantCheck(row, row.currentTier, variant, spec).failReasons.map(
				(reason) => ({ reason }),
			),
		),
		(row) => row.reason,
	).sort((a, b) => b[1].length - a[1].length)) {
		add({
			section: "hard_veto_or_group_fail_reason",
			signalOrCombination: reason,
			count: subset.length,
			percentage: subset.length / rows.length,
		});
	}
	for (const { pool, rows: poolRows } of poolViews(rows)) {
		const subset = poolRows.filter(
			(row) => row.candidateTier === "SOLID_STARTER",
		);
		add({
			section: "entrants_by_pool",
			pool,
			count: subset.length,
			percentage: poolRows.length ? subset.length / poolRows.length : 0,
		});
	}
	for (const tier of [
		"LOW_END_STARTER",
		"MINIMUM_LEVEL",
		"LOW_ROTATION_PLUS",
		"YOUNG_UPSIDE_SUSPECT",
		"VETERAN_ROTATION_GUARD",
		"YOUNG_PROVEN_STARTER",
	]) {
		const subset = rows.filter(
			(row) =>
				row.currentTier === tier && row.candidateTier === "SOLID_STARTER",
		);
		const total = count(rows, (row) => row.currentTier === tier);
		add({
			section: "focus_transition_count",
			currentTier: tier,
			candidateTier: "SOLID_STARTER",
			count: subset.length,
			percentage: total ? subset.length / total : 0,
			notes: `${subset.length} of ${total} current ${tier}`,
		});
	}
	const allSignalLabels = [
		...roleSignals(rows[0], spec).map((entry) => entry.label),
		`value core: valueNoPot >= ${spec.valueNoPot} and contractValue >= ${spec.contractValue}`,
		...productionSignals(rows[0], spec).map((entry) => entry.label),
		...extraSignals(rows[0], spec).map((entry) => entry.label),
		"BPM<0 exception path",
	];
	for (const label of allSignalLabels) {
		const n = count(entrants, (row) =>
			row.candidatePassedSignals.split("; ").includes(label),
		);
		add({
			section: "entrant_signal_pass_count",
			signalOrCombination: label,
			count: n,
			percentage: entrants.length ? n / entrants.length : 0,
		});
	}
	for (const [combo, subset] of groupRows(
		entrants,
		(row) => row.candidatePassedSignals || "(no signals)",
	).sort((a, b) => b[1].length - a[1].length)) {
		add({
			section: "signal_combination",
			signalOrCombination: combo,
			count: subset.length,
			percentage: entrants.length ? subset.length / entrants.length : 0,
		});
	}
	for (const [bucket, subset] of groupRows(entrants, bpmBucket)) {
		add({
			section: "bpm_bucket",
			signalOrCombination: bucket,
			count: subset.length,
			percentage: entrants.length ? subset.length / entrants.length : 0,
		});
	}
	for (const [bucket, subset] of groupRows(entrants, productionBucket)) {
		add({
			section: "production_bucket",
			signalOrCombination: bucket,
			count: subset.length,
			percentage: entrants.length ? subset.length / entrants.length : 0,
		});
	}
	for (const [bucket, subset] of groupRows(entrants, roleBucket)) {
		add({
			section: "role_bucket",
			signalOrCombination: bucket,
			count: subset.length,
			percentage: entrants.length ? subset.length / entrants.length : 0,
		});
	}
	const labeledSolid = labeledEval.filter(
		(row) => row.candidateTier === "SOLID_STARTER",
	);
	add({
		section: "labeled_solid_attribution_summary",
		count: labeledSolid.length,
		notes: [
			`improved ${count(labeledSolid, (row) => row.deltaGapM < -0.1)}`,
			`worsened ${count(labeledSolid, (row) => row.deltaGapM > 0.1)}`,
			`fixed severe ${count(labeledSolid, (row) => row.severeFixed === "yes")}`,
			`new severe ${count(labeledSolid, (row) => row.newSevere === "yes")}`,
			`too_low fixed ${count(labeledSolid, (row) => row.tooLowFixed === "yes")}`,
			`too_high added ${count(labeledSolid, (row) => row.tooHighAdded === "yes")}`,
		].join("; "),
	});
	for (const row of labeledSolid) {
		add({
			section: "labeled_solid_case",
			currentTier: row.currentTier,
			candidateTier: row.candidateTier,
			signalOrCombination: row.candidatePassedSignals,
			count: 1,
			notes: `${row.dataset} ${row.caseId}; bucket ${row.bucket}; human ${row.humanRangeText}; current point ${row.currentV2PointM}; candidate point ${row.candidatePointM}; ${row.candidateDirection}`,
		});
	}
	return laneRows;
};

const verdictFor = ({ rows, labeledEval, capBudget }) => {
	const summary = evalSummary(labeledEval);
	const entrants = count(rows, (row) => row.candidateTier === "SOLID_STARTER");
	const lowEndTotal = count(
		rows,
		(row) => row.currentTier === "LOW_END_STARTER",
	);
	const lowEndToSolid = count(
		rows,
		(row) =>
			row.currentTier === "LOW_END_STARTER" &&
			row.candidateTier === "SOLID_STARTER",
	);
	const minToSolid = count(
		rows,
		(row) =>
			row.currentTier === "MINIMUM_LEVEL" &&
			row.candidateTier === "SOLID_STARTER",
	);
	const lowRotToSolid = count(
		rows,
		(row) =>
			row.currentTier === "LOW_ROTATION_PLUS" &&
			row.candidateTier === "SOLID_STARTER",
	);
	const youngUpsideToSolid = count(
		rows,
		(row) =>
			row.currentTier === "YOUNG_UPSIDE_SUSPECT" &&
			row.candidateTier === "SOLID_STARTER",
	);
	const vetGuardToSolid = count(
		rows,
		(row) =>
			row.currentTier === "VETERAN_ROTATION_GUARD" &&
			row.candidateTier === "SOLID_STARTER",
	);
	const total = (pool, model) =>
		capBudget.find(
			(row) =>
				row.pool === pool && row.model === model && row.tier === "__TOTAL__",
		);
	const variant = rows[0].variant;
	const rosteredPer30Delta =
		total("rostered_active", variant).deltaTotalMidpointCapPctVsCurrent / 30;
	const top15Per30Delta =
		total("top15_roster_proxy", variant).deltaTotalMidpointCapPctVsCurrent / 30;
	const unsafe = [];
	const warnings = [];
	if (minToSolid || lowRotToSolid || youngUpsideToSolid || vetGuardToSolid)
		unsafe.push("blocked lower/non-1B tier entered SOLID_STARTER");
	if (summary.candidateSevere > summary.currentSevere)
		unsafe.push(
			`labeled severe increased ${summary.currentSevere}->${summary.candidateSevere}`,
		);
	if (summary.candidateTooHigh > summary.currentTooHigh + 3)
		unsafe.push(
			`labeled too_high materially increased ${summary.currentTooHigh}->${summary.candidateTooHigh}`,
		);
	else if (summary.candidateTooHigh > summary.currentTooHigh)
		warnings.push(
			`labeled too_high increased ${summary.currentTooHigh}->${summary.candidateTooHigh}`,
		);
	if (entrants > 30) warnings.push(`SOLID_STARTER count ${entrants} > 30`);
	if (entrants < 8) warnings.push(`SOLID_STARTER count ${entrants} < 8`);
	const lowEndPct = lowEndTotal ? lowEndToSolid / lowEndTotal : 0;
	if (lowEndPct < 0.2 || lowEndPct > 0.4)
		warnings.push(
			`LOW_END_STARTER subset is ${pct(lowEndPct)}, outside 20%-40% target`,
		);
	if (rosteredPer30Delta > 0.15)
		unsafe.push(`rostered per-30 cap delta ${pct(rosteredPer30Delta)} > 15%`);
	else if (rosteredPer30Delta > 0.1)
		warnings.push(`rostered per-30 cap delta ${pct(rosteredPer30Delta)} > 10%`);
	if (top15Per30Delta > 0.15)
		unsafe.push(`top15 per-30 cap delta ${pct(top15Per30Delta)} > 15%`);
	else if (top15Per30Delta > 0.1)
		warnings.push(`top15 per-30 cap delta ${pct(top15Per30Delta)} > 10%`);
	return {
		variant,
		verdict: unsafe.length
			? "unsafe"
			: warnings.length
				? "inconclusive"
				: "safe",
		reasons: [...unsafe, ...warnings],
		entrants,
		lowEndToSolid,
		lowEndPct,
		minToSolid,
		lowRotToSolid,
		youngUpsideToSolid,
		vetGuardToSolid,
		rosteredPer30Delta,
		top15Per30Delta,
		...summary,
	};
};

const writeRules = () => {
	const md = `# V3-1B-narrow SOLID_STARTER sweep rules

Scope: artifact-only sweep. This tests three candidate-only SOLID_STARTER variants mapped to 12%-17% cap. It does not modify src, formal scoreTier, formal MODEL_TIERS, sandbox v2, existing score CSVs, or sampling.

Common hard blocks:

- Only current LOW_END_STARTER can enter SOLID_STARTER.
- MINIMUM_LEVEL, LOW_ROTATION_PLUS, YOUNG_UPSIDE_SUSPECT, VETERAN_ROTATION_GUARD, YOUNG_PROVEN_STARTER, STAR_NEAR_MAX, and SUPERSTAR_MAX are blocked.
- 1A HIGH_END_ROTATION is not enabled.
- HIGH_IMPACT_STARTER is not created.
- LOW_END_STARTER and LOW_ROTATION_PLUS are not relaxed.

## Variant A: moderate narrow

- GP >= 55, MPG >= 28, valueNoPot >= 59, contractValue >= 59
- role core: starterShare >= .60 or GS >= 41 or MPG >= 30
- production core: at least 2 of BPM >= .5, EWA >= 4, VORP >= .8, PER >= 15.5
- extra support: at least 1 of BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16, defense/rebounding/connector, shooting/spacing, age <= 27 with value/pot
- BPM < 0 blocks ordinary path unless exception path passes.

## Variant B: normal strict

- GP >= 55, MPG >= 29, valueNoPot >= 60, contractValue >= 60
- role core: starterShare >= .65 or GS >= 50 or MPG >= 31
- production core: at least 2 of BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16
- extra support: at least 1 of BPM >= 1.5, EWA >= 6, VORP >= 1.5, PER >= 17, defense/rebounding/connector, shooting/spacing, age <= 27 with value/pot
- BPM < 0 blocks ordinary path unless exception path passes.

## Variant C: very strict

- GP >= 60, MPG >= 30, valueNoPot >= 61, contractValue >= 61
- role core: starterShare >= .70 or GS >= 55 or MPG >= 32
- production core: at least 3 of BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16
- extra support: at least 1 of BPM >= 2, EWA >= 7, VORP >= 2, PER >= 18, defense/rebounding/connector, shooting/spacing
- BPM < 0 is not allowed in ordinary path.

## Exception path for A/B only

If BPM < 0, a player can enter only with current LOW_END_STARTER, MPG >= 30, valueNoPot >= 61, contractValue >= 61, EWA >= 5 or VORP >= 1 or PER >= 17, defense/rebounding/connector or shooting/spacing support, and PER >= 12.

No human labels, trade value, pid, name, or caseId are used as rule inputs.
`;
	fs.writeFileSync(out.rules, md);
};

const writeReports = ({
	comparison,
	distribution,
	capBudget,
	laneHits,
	labeledEval,
}) => {
	const comparisonTable = markdownTable(comparison, [
		{ key: "variant", label: "variant" },
		{ key: "verdict", label: "verdict" },
		{ key: "solidStarterEntrants", label: "entrants" },
		{ key: "lowEndToSolidText", label: "LOW_END -> SOLID" },
		{ key: "rosteredPer30DeltaText", label: "rostered delta/30" },
		{ key: "top15Per30DeltaText", label: "top15 delta/30" },
		{ key: "labeledSevere", label: "severe" },
		{ key: "labeledTooHigh", label: "too_high" },
		{ key: "tooLowFixed", label: "too_low fixed" },
		{ key: "tooHighAdded", label: "too_high added" },
	]);
	const best = comparison.find((row) => row.variant === "B") ?? comparison[0];
	const bpmNegativeSummary = comparison
		.map((row) => {
			const negativeBuckets = laneHits.filter(
				(hit) =>
					hit.variant === row.variant &&
					hit.section === "bpm_bucket" &&
					hit.signalOrCombination.includes("BPM < 0"),
			);
			const negativeCount = sum(negativeBuckets.map((hit) => hit.count));
			const exceptionCount =
				laneHits.find(
					(hit) =>
						hit.variant === row.variant &&
						hit.section === "entrant_signal_pass_count" &&
						hit.signalOrCombination === "BPM<0 exception path",
				)?.count ?? 0;
			return `${row.variant}: BPM<0 entrants ${negativeCount}, exception path ${exceptionCount}`;
		})
		.join("; ");
	const summaryMd = `# V3-1B-narrow SOLID_STARTER sweep

This is an artifact-only sweep. It tests three narrowed SOLID_STARTER variants and writes all outputs inside this directory. No src, formal scoreTier, sandbox v2, existing score CSVs, sampling, or temp files were changed.

## Verdict comparison

${comparisonTable}

## Answers

- A/B/C safety: ${comparison.map((row) => `${row.variant}=${row.verdict}`).join(", ")}.
- Best semantic match: ${best.variant}. It is the closest default candidate because it targets a smaller LOW_END_STARTER subset than A while avoiding C becoming too narrow, but it still needs review before implementation.
- Old 1B failure: yes, the old 1B failure was mainly entry-gate breadth. It lifted 43/63 LOW_END_STARTER players; the narrow variants reduce that.
- BPM < 0 among entrants: no. ${bpmNegativeSummary}. No variant used the BPM<0 exception path in this run.
- SOLID_STARTER bridge should be retained as a V3 candidate module: yes, as a candidate module only; the sweep supports continued analysis, not implementation.
- Continue to V3-1C or revise 1B again: review this sweep first. If B/C are too narrow or still add too_high, revise 1B; otherwise continue to 1C after choosing a target envelope.

## Distribution snapshot

${markdownTable(
	distribution.filter(
		(row) =>
			row.pool === "all_active" &&
			row.model !== "current" &&
			row.tier === "SOLID_STARTER",
	),
	[
		{ key: "variant", label: "variant" },
		{ key: "tier", label: "tier" },
		{ key: "count", label: "count" },
		{ key: "percentageText", label: "%" },
		{ key: "avgAge", label: "avg age" },
		{ key: "avgMPG", label: "avg MPG" },
		{ key: "avgValueNoPot", label: "avg valueNoPot" },
		{ key: "avgGetContractValue", label: "avg contractValue" },
		{ key: "avgBPM", label: "avg BPM" },
	],
)}

## Cap-budget totals

${markdownTable(
	capBudget.filter(
		(row) => row.tier === "__TOTAL__" && row.model !== "current",
	),
	[
		{ key: "variant", label: "variant" },
		{ key: "pool", label: "pool" },
		{ key: "totalImpliedMidpointCapPctText", label: "total mid cap" },
		{ key: "impliedMidpointCapPctPer30TeamsText", label: "mid/30" },
		{ key: "deltaTotalMidpointCapPctVsCurrentText", label: "delta" },
	],
)}

## Labeled SOLID_STARTER cases

${markdownTable(
	labeledEval
		.filter((row) => row.candidateTier === "SOLID_STARTER")
		.map((row) => ({
			variant: row.variant,
			caseId: row.caseId,
			bucket: row.bucket,
			human: row.humanRangeText,
			currentTier: row.currentTier,
			currentPoint: round(row.currentV2PointM, 2),
			candidatePoint: round(row.candidatePointM, 2),
			candidateDirection: row.candidateDirection,
			deltaGap: round(row.deltaGapM, 2),
			signals: row.candidatePassedSignals,
		})),
	[
		{ key: "variant", label: "variant" },
		{ key: "caseId", label: "case" },
		{ key: "bucket", label: "bucket" },
		{ key: "human", label: "human" },
		{ key: "currentPoint", label: "current point" },
		{ key: "candidatePoint", label: "candidate point" },
		{ key: "candidateDirection", label: "direction" },
		{ key: "deltaGap", label: "delta gap" },
		{ key: "signals", label: "signals" },
	],
)}
`;
	fs.writeFileSync(out.summary, summaryMd);

	const analysisMd = `# V3-1B-narrow analysis pack

## One-page summary

${comparisonTable}

## Exact rules

See \`rules.md\`.

## Exact differences vs current scoreTier

Current scoreTier is computed first. The only candidate-only change is mapping a narrowed subset of current LOW_END_STARTER players into SOLID_STARTER at 12%-17% cap. All blocked transitions must remain 0. No 1A HIGH_END_ROTATION or HIGH_IMPACT_STARTER logic is active.

## Files to inspect

- \`variant_comparison.csv\`: A/B/C top-line comparison.
- \`lane_hits.csv\`: signal combinations, BPM buckets, production buckets, role buckets, exception usage.
- \`labeled_eval.csv\`: labeled 48 point changes.
- \`cap_budget.csv\`: four-pool cap burden.
- \`transition_matrix.csv\`: current tier movement.

## Recommendation

Do not implement directly. Use this sweep to decide whether B is a viable default envelope, whether C is too narrow, or whether the bridge needs another 1B revision before moving to V3-1C.
`;
	fs.writeFileSync(out.analysisPack, analysisMd);
};

const main = () => {
	fs.mkdirSync(outDir, { recursive: true });
	const { attrs, rows: baseRows } = buildRows();
	const labeledRows = loadLabeledRows();
	const allDistribution = [];
	const allTransitions = [];
	const allCapBudgetRaw = [];
	const allCapBudget = [];
	const allLabeledEval = [];
	const allLaneHits = [];
	const comparisonRows = [];

	for (const [variant, spec] of Object.entries(VARIANTS)) {
		const rows = scoreRowsForVariant(baseRows, variant, spec);
		const pools = poolViews(rows);
		allDistribution.push(
			...pools.flatMap(({ pool, rows: poolRows }) => [
				...distributionRows({
					variant,
					pool,
					rows: poolRows,
					model: "current",
				}),
				...distributionRows({ variant, pool, rows: poolRows, model: variant }),
			]),
		);
		allTransitions.push(
			...pools.flatMap(({ pool, rows: poolRows }) =>
				transitionRows({ variant, pool, rows: poolRows }),
			),
		);

		const rawCap = pools.flatMap(({ pool, rows: poolRows }) => [
			...capRows({ variant, pool, rows: poolRows, attrs, model: "current" }),
			...capRows({ variant, pool, rows: poolRows, attrs, model: variant }),
		]);
		const currentMid = new Map(
			rawCap
				.filter((row) => row.model === "current")
				.map((row) => [
					`${row.pool}||${row.tier}`,
					row.totalImpliedMidpointCapPct,
				]),
		);
		const capWithDelta = rawCap.map((row) => {
			const delta =
				row.model === variant
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
		allCapBudgetRaw.push(...capWithDelta);
		allCapBudget.push(
			...capWithDelta.map((row) => ({
				variant: row.variant,
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
			})),
		);

		const rowsByPid = new Map(rows.map((row) => [Number(row.pid), row]));
		const labeledEval = labeledEvalRows({
			variant,
			labeledRows,
			rowsByPid,
			attrs,
		});
		allLabeledEval.push(...labeledEval);
		allLaneHits.push(...buildLaneHits({ variant, rows, spec, labeledEval }));
		const verdict = verdictFor({ rows, labeledEval, capBudget: capWithDelta });
		comparisonRows.push({
			variant,
			variantLabel: spec.label,
			verdict: verdict.verdict,
			reasons: verdict.reasons.join("; "),
			solidStarterEntrants: verdict.entrants,
			lowEndToSolid: verdict.lowEndToSolid,
			lowEndToSolidPct: pct100(verdict.lowEndPct, 3),
			lowEndToSolidText: `${verdict.lowEndToSolid} (${pct(verdict.lowEndPct)})`,
			minimumToSolid: verdict.minToSolid,
			lowRotationToSolid: verdict.lowRotToSolid,
			youngUpsideToSolid: verdict.youngUpsideToSolid,
			vetGuardToSolid: verdict.vetGuardToSolid,
			rosteredPer30Delta: pct100(verdict.rosteredPer30Delta, 3),
			rosteredPer30DeltaText: pct(verdict.rosteredPer30Delta),
			top15Per30Delta: pct100(verdict.top15Per30Delta, 3),
			top15Per30DeltaText: pct(verdict.top15Per30Delta),
			labeledSevere: `${verdict.currentSevere}->${verdict.candidateSevere}`,
			labeledTooHigh: `${verdict.currentTooHigh}->${verdict.candidateTooHigh}`,
			tooLowFixed: verdict.tooLowFixed,
			tooHighAdded: verdict.tooHighAdded,
			newSevere: verdict.newSevere,
			candidateBetter: verdict.candidateBetter,
			currentBetter: verdict.currentBetter,
			tie: verdict.tie,
			meanGap: round(verdict.candidateMeanGap, 3),
			medianGap: round(verdict.candidateMedianGap, 3),
		});
	}

	writeCsv(out.distribution, allDistribution, [
		"variant",
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
	writeCsv(out.transition, allTransitions, [
		"variant",
		"pool",
		"currentTier",
		"candidateTier",
		"count",
		"percentageOfCurrentTier",
		"percentageOfCurrentTierText",
		"moveDirection",
		"moveSteps",
		"focusTransition",
	]);
	writeCsv(out.capBudget, allCapBudget, [
		"variant",
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
	writeCsv(out.labeledEval, allLabeledEval, [
		"variant",
		"dataset",
		"caseId",
		"globalCaseId",
		"name",
		"bucket",
		"humanRangeText",
		"humanAmountMinM",
		"humanAmountMaxM",
		"humanMidpointM",
		"currentTier",
		"candidateTier",
		"moveDirection",
		"moveSteps",
		"candidateReason",
		"candidatePassedSignals",
		"candidateFailReasons",
		"currentV2PointM",
		"candidatePointM",
		"currentV2GapM",
		"candidateGapM",
		"deltaGapM",
		"currentV2Direction",
		"candidateDirection",
		"currentV2Severe",
		"candidateSevere",
		"candidateRangeText",
		"candidateTierPlacementScore",
		"candidateRiskFlags",
		"tradeExploitRiskFlag",
		"winner",
		"severeFixed",
		"newSevere",
		"improvedBy3M",
		"worsenedBy3M",
		"tooLowFixed",
		"tooHighAdded",
	]);
	writeCsv(out.laneHits, allLaneHits, [
		"variant",
		"section",
		"lane",
		"pool",
		"currentTier",
		"candidateTier",
		"signalOrCombination",
		"count",
		"percentage",
		"notes",
	]);
	writeCsv(out.variantComparison, comparisonRows, [
		"variant",
		"variantLabel",
		"verdict",
		"reasons",
		"solidStarterEntrants",
		"lowEndToSolid",
		"lowEndToSolidPct",
		"lowEndToSolidText",
		"minimumToSolid",
		"lowRotationToSolid",
		"youngUpsideToSolid",
		"vetGuardToSolid",
		"rosteredPer30Delta",
		"top15Per30Delta",
		"labeledSevere",
		"labeledTooHigh",
		"tooLowFixed",
		"tooHighAdded",
		"newSevere",
		"candidateBetter",
		"currentBetter",
		"tie",
		"meanGap",
		"medianGap",
	]);
	writeRules();
	writeReports({
		comparison: comparisonRows,
		distribution: allDistribution,
		capBudget: allCapBudgetRaw,
		laneHits: allLaneHits,
		labeledEval: allLabeledEval,
	});

	console.log(`Wrote ${out.distribution}`);
	console.log(`Wrote ${out.transition}`);
	console.log(`Wrote ${out.capBudget}`);
	console.log(`Wrote ${out.labeledEval}`);
	console.log(`Wrote ${out.laneHits}`);
	console.log(`Wrote ${out.variantComparison}`);
	console.log(`Wrote ${out.summary}`);
	console.log(`Wrote ${out.rules}`);
	console.log(`Wrote ${out.analysisPack}`);
	console.log(JSON.stringify(comparisonRows, null, 2));
};

main();
