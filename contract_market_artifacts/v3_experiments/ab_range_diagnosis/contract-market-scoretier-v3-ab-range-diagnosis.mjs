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
const abDir = path.join(artifactsDir, "v3_experiments/ab_combined_audit");
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);

const out = {
	script: fileURLToPath(import.meta.url),
	summary: path.join(outDir, "summary.md"),
	rules: path.join(outDir, "rules.md"),
	analysisPack: path.join(outDir, "analysis_pack.md"),
	tierRangeDiagnosis: path.join(outDir, "tier_range_diagnosis.csv"),
	placementDiagnosis: path.join(outDir, "placement_diagnosis.csv"),
	labeledCaseDiagnosis: path.join(outDir, "labeled_case_diagnosis.csv"),
	teamTop15Payroll: path.join(outDir, "team_top15_payroll.csv"),
	teamTop15PayrollSummary: path.join(outDir, "team_top15_payroll_summary.csv"),
	teamPayrollOutliers: path.join(outDir, "team_payroll_outliers.csv"),
	teamDeltaAttribution: path.join(outDir, "team_delta_attribution.csv"),
	rangeSweepOptional: path.join(outDir, "range_sweep_optional.csv"),
};

const CFG = {
	nearBoundaryM: 1,
	nearBoundaryCapPct: 0.0075,
	highEndRotation: { minPct: 0.07, maxPct: 0.12 },
	solidStarter: { minPct: 0.12, maxPct: 0.17 },
	sweeps: {
		highEndRotation: [
			{ label: "6%-10%", minPct: 0.06, maxPct: 0.1 },
			{ label: "6.5%-10.5%", minPct: 0.065, maxPct: 0.105 },
			{ label: "7%-11%", minPct: 0.07, maxPct: 0.11 },
			{ label: "7%-12%", minPct: 0.07, maxPct: 0.12 },
		],
		solidStarter: [
			{ label: "10%-14%", minPct: 0.1, maxPct: 0.14 },
			{ label: "11%-15%", minPct: 0.11, maxPct: 0.15 },
			{ label: "12%-16%", minPct: 0.12, maxPct: 0.16 },
			{ label: "12%-17%", minPct: 0.12, maxPct: 0.17 },
		],
	},
};

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

const readCsv = (csvPath) =>
	csvParse(fs.readFileSync(csvPath, "utf8")).map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => {
				if (value !== "" && /^-?\d+(?:\.\d+)?$/.test(value))
					return [key, Number(value)];
				return [key, value];
			}),
		),
	);

const num = (row, key, fallback = undefined) => {
	const parsed = Number(row?.[key]);
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
	return finite.length ? sum(finite) / finite.length : "";
};
const median = (values) => {
	const finite = values
		.map(Number)
		.filter(Number.isFinite)
		.sort((a, b) => a - b);
	if (!finite.length) return "";
	const mid = Math.floor(finite.length / 2);
	return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
};
const quantile = (values, q) => {
	const finite = values
		.map(Number)
		.filter(Number.isFinite)
		.sort((a, b) => a - b);
	if (!finite.length) return "";
	const pos = (finite.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	return finite[base + 1] === undefined
		? finite[base]
		: finite[base] + rest * (finite[base + 1] - finite[base]);
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
const pctCap = (amountM, salaryCap) => (amountM * 1000 * 100) / salaryCap;
const fmtM = (value) =>
	Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}M` : "";
const boolText = (value) => (value ? "yes" : "no");

const highEndFail1A = (row, currentTier) => {
	const reasons = [];
	if (num(row, "GP", 0) < 45) reasons.push("GP < 45");
	if (num(row, "MPG", 0) < 18) reasons.push("MPG < 18");
	if (num(row, "valueNoPot", 0) < 52) reasons.push("valueNoPot < 52");
	if (num(row, "getContractValue", 0) < 52 && num(row, "value", 0) < 54) {
		reasons.push("contractValue < 52 and value < 54");
	}
	if (num(row, "PER", 12) < 9 && num(row, "BPM", 0) < -3)
		reasons.push("PER < 9 and BPM < -3");
	if (currentTier === "MINIMUM_LEVEL") {
		if (num(row, "MPG", 0) < 22)
			reasons.push("minimum stronger floor: MPG < 22");
		if (num(row, "valueNoPot", 0) < 55)
			reasons.push("minimum stronger floor: valueNoPot < 55");
		if (num(row, "getContractValue", 0) < 55)
			reasons.push("minimum stronger floor: contractValue < 55");
		if (
			!(
				num(row, "EWA", 0) >= 2 ||
				num(row, "VORP", -99) >= 0.2 ||
				num(row, "BPM", -99) >= -0.5
			)
		) {
			reasons.push("minimum stronger floor: no neutral production");
		}
	}
	if (
		[
			"SUPERSTAR_MAX",
			"STAR_NEAR_MAX",
			"YOUNG_PROVEN_STARTER",
			"LOW_END_STARTER",
		].includes(currentTier)
	) {
		reasons.push("protected current starter/star tier");
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
const coreSignals1A = (row) => [
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
const valueProdSignals1A = (row) => [
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
const check1A = (row, currentTier) => {
	const fails = highEndFail1A(row, currentTier);
	const role = roleSignals1A(row);
	const core = coreSignals1A(row);
	const valueProd = valueProdSignals1A(row);
	const entries = [
		...role.filter((entry) => entry.passed),
		...core.filter((entry) => entry.passed),
		...valueProd.filter((entry) => entry.passed),
	];
	if (supportScore(role) < 0.75) fails.push("missing real role support");
	if (!core.some((entry) => entry.passed)) fails.push("missing core identity");
	if (!valueProd.some((entry) => entry.passed))
		fails.push("missing value/production support");
	if (supportScore(entries) < 3) fails.push("support score < 3");
	return {
		passed: fails.length === 0,
		failReasons: fails,
		signals: entries.map((entry) => entry.label),
	};
};

const defenseConnectorSupport = (row) =>
	[
		num(row, "comp_defenseInterior", 0) >= 0.62,
		num(row, "comp_defensePerimeter", 0) >= 0.62,
		num(row, "comp_rebounding", 0) >= 0.62,
		num(row, "comp_blocking", 0) >= 0.62,
		num(row, "comp_passing", 0) >= 0.58,
		num(row, "BPM", -99) >= 0.5 || num(row, "VORP", -99) >= 0.8,
	].filter(Boolean).length >= 2;
const shootingSpacingSupport = (row) =>
	num(row, "comp_shootingThreePointer", 0) >= 0.64 &&
	num(row, "skill_3_margin", -1) >= 0.04 &&
	num(row, "TS", 0) >= 0.54;
const check1B = (row, currentTier) => {
	const fails = [];
	if (currentTier !== "LOW_END_STARTER")
		fails.push(`current tier ${currentTier} blocked`);
	if (num(row, "GP", 0) < 55) fails.push("GP < 55");
	if (num(row, "MPG", 0) < 29) fails.push("MPG < 29");
	if (num(row, "valueNoPot", 0) < 60) fails.push("valueNoPot < 60");
	if (num(row, "getContractValue", 0) < 60) fails.push("contractValue < 60");
	const role = [
		signal("role: starterShare >= 0.65", num(row, "starterShare", 0) >= 0.65),
		signal("role: GS >= 50", num(row, "GS", 0) >= 50),
		signal("role: MPG >= 31", num(row, "MPG", 0) >= 31),
	];
	const prod = [
		signal("production: BPM >= 1", num(row, "BPM", -99) >= 1),
		signal("production: EWA >= 5", num(row, "EWA", 0) >= 5),
		signal("production: VORP >= 1", num(row, "VORP", -99) >= 1),
		signal("production: PER >= 16", num(row, "PER", 0) >= 16),
	];
	const extra = [
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
	const exception =
		num(row, "BPM", 0) < 0 &&
		currentTier === "LOW_END_STARTER" &&
		num(row, "MPG", 0) >= 30 &&
		num(row, "valueNoPot", 0) >= 61 &&
		num(row, "getContractValue", 0) >= 61 &&
		(num(row, "EWA", 0) >= 5 ||
			num(row, "VORP", -99) >= 1 ||
			num(row, "PER", 0) >= 17) &&
		(defenseConnectorSupport(row) || shootingSpacingSupport(row)) &&
		num(row, "PER", 0) >= 12;
	if (!role.some((entry) => entry.passed)) fails.push("missing role core");
	if (prod.filter((entry) => entry.passed).length < 2)
		fails.push("production core count < 2");
	if (!extra.some((entry) => entry.passed)) fails.push("missing extra support");
	if (num(row, "BPM", 0) < 0 && !exception)
		fails.push("BPM < 0 without exception path");
	const signals = [
		...supportLabels(role),
		"value core: valueNoPot >= 60 and contractValue >= 60",
		...supportLabels(prod),
		...supportLabels(extra),
		exception ? "BPM<0 exception path" : "",
	].filter(Boolean);
	return { passed: fails.length === 0, failReasons: fails, signals };
};

const capRange = ({ row, attrs, minPct, maxPct }) => {
	const min = Math.max(row.minContractForPlayer, attrs.salaryCap * minPct);
	const max = Math.max(min, attrs.salaryCap * maxPct);
	return { minM: Math.round(min) / 1000, maxM: Math.round(max) / 1000 };
};
const rangeText = (range) =>
	range.minM === range.maxM
		? fmtM(range.minM)
		: `${fmtM(range.minM)}-${fmtM(range.maxM)}`;
const currentRange = (row, attrs) => {
	const range = tierRange(row.currentTier, row, attrs);
	return {
		minM: range.modelRangeMin / 1000,
		maxM: range.modelRangeMax / 1000,
		text: range.modelRangeText,
		years: range.modelYears,
	};
};
const combinedRange = (row, attrs, overrides = CFG) => {
	if (row.combinedTier === "HIGH_END_ROTATION") {
		const range = capRange({ row, attrs, ...overrides.highEndRotation });
		return { ...range, text: rangeText(range), years: "" };
	}
	if (row.combinedTier === "SOLID_STARTER") {
		const range = capRange({ row, attrs, ...overrides.solidStarter });
		return { ...range, text: rangeText(range), years: "" };
	}
	const range = tierRange(row.combinedTier, row, attrs);
	return {
		minM: range.modelRangeMin / 1000,
		maxM: range.modelRangeMax / 1000,
		text: range.modelRangeText,
		years: range.modelYears,
	};
};
const scorePoint = ({ row, attrs, tier, range }) =>
	scoreContractMarketV2(
		{
			...row,
			debugModelTier: tier,
			debugModelRangeText: range.text,
			modelYears: range.years,
			debugModelReason: row.combinedReason ?? row.currentReason,
		},
		attrs,
	);
const gapToRange = ({ pointM, humanMinM, humanMaxM }) => {
	if (
		!Number.isFinite(pointM) ||
		!Number.isFinite(humanMinM) ||
		!Number.isFinite(humanMaxM)
	)
		return "";
	if (pointM < humanMinM) return humanMinM - pointM;
	if (pointM > humanMaxM) return pointM - humanMaxM;
	return 0;
};
const directionToRange = ({ pointM, humanMinM, humanMaxM }) => {
	if (
		!Number.isFinite(pointM) ||
		!Number.isFinite(humanMinM) ||
		!Number.isFinite(humanMaxM)
	)
		return "missing";
	if (pointM < humanMinM) return "too_low";
	if (pointM > humanMaxM) return "too_high";
	return "inside";
};
const isNearBoundary = (gapM, salaryCap) =>
	Number.isFinite(Number(gapM)) &&
	Number(gapM) > 0 &&
	(Number(gapM) <= CFG.nearBoundaryM ||
		(Number(gapM) * 1000) / salaryCap <= CFG.nearBoundaryCapPct);
const humanVsTierRange = (row) => {
	if (row.humanAmountMaxM < row.combinedRangeMinM)
		return "human_range_below_tier_range";
	if (row.humanAmountMinM > row.combinedRangeMaxM)
		return "human_range_above_tier_range";
	return "human_range_overlaps_tier_range";
};
const missType = (row, salaryCap) => {
	if (row.combinedDirection === "inside") return "inside";
	if (isNearBoundary(row.combinedGapM, salaryCap))
		return "near_boundary_minor_miss";
	if (row.combinedSevere === "yes") return "severe";
	return row.combinedDirection;
};
const decomposition = (row, salaryCap) => {
	if (isNearBoundary(row.combinedGapM, salaryCap))
		return "near_boundary -> minor, do not overreact";
	const relation = humanVsTierRange(row);
	if (relation === "human_range_above_tier_range")
		return "human_range_above_tier_range -> likely range too low or tier too low";
	if (relation === "human_range_below_tier_range")
		return "human_range_below_tier_range -> likely range too high or tier too high";
	if (row.combinedDirection !== "inside")
		return "human_range_overlaps_tier_range_but_point_misses -> placement issue";
	return "inside";
};

const teamBucket = (pctValue) => {
	if (pctValue >= 180) return "extreme_bad";
	if (pctValue >= 160) return "likely_bad";
	if (pctValue >= 145) return "high_risk";
	if (pctValue >= 130) return "elevated";
	if (pctValue >= 110) return "normal-ish";
	return "low_or_conservative";
};
const summarizeSeries = (rows, key, model) => {
	const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
	return {
		model,
		metric: key,
		teamCount: values.length,
		mean: round(avg(values), 3),
		median: round(median(values), 3),
		p10: round(quantile(values, 0.1), 3),
		p25: round(quantile(values, 0.25), 3),
		p75: round(quantile(values, 0.75), 3),
		p90: round(quantile(values, 0.9), 3),
		max: round(Math.max(...values), 3),
		low_or_conservative: count(
			rows,
			(row) => teamBucket(Number(row[key])) === "low_or_conservative",
		),
		normal_ish: count(
			rows,
			(row) => teamBucket(Number(row[key])) === "normal-ish",
		),
		elevated: count(rows, (row) => teamBucket(Number(row[key])) === "elevated"),
		high_risk: count(
			rows,
			(row) => teamBucket(Number(row[key])) === "high_risk",
		),
		likely_bad: count(
			rows,
			(row) => teamBucket(Number(row[key])) === "likely_bad",
		),
		extreme_bad: count(
			rows,
			(row) => teamBucket(Number(row[key])) === "extreme_bad",
		),
		teamsGte145: count(rows, (row) => Number(row[key]) >= 145),
		teamsGte160: count(rows, (row) => Number(row[key]) >= 160),
		teamsGte180: count(rows, (row) => Number(row[key]) >= 180),
	};
};

const buildRows = () => {
	const save = readSave(savePath);
	const teamsByTid = new Map(save.teams.map((team) => [team.tid, team]));
	const entries = save.players
		.filter(
			(player) =>
				player.tid >= -1 && player.stats?.some((stats) => !stats.playoffs),
		)
		.map((player) => ({
			key: `v3-ab-range-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries: entries,
	});
	const scored = rows.map((row) => {
		const current = scoreTier(row);
		const base = {
			...row,
			currentTier: current.tier,
			currentReason: current.reason,
		};
		const oneA = check1A(base, current.tier);
		const oneB = check1B(base, current.tier);
		let combinedTier = current.tier;
		let responsibleModule = "none";
		let combinedReason = `kept current scoreTier (${current.tier})`;
		let signals = [];
		if (oneA.passed && oneB.passed) {
			combinedTier = "SOLID_STARTER";
			responsibleModule = "conflict";
			combinedReason = `CONFLICT: 1A and 1B-B both passed`;
			signals = [...oneA.signals, ...oneB.signals];
		} else if (oneB.passed) {
			combinedTier = "SOLID_STARTER";
			responsibleModule = "1B-B";
			combinedReason = "V3-1B-narrow-B SOLID_STARTER bridge";
			signals = oneB.signals;
		} else if (oneA.passed) {
			combinedTier = "HIGH_END_ROTATION";
			responsibleModule = "1A";
			combinedReason = "V3-1A HIGH_END_ROTATION bridge";
			signals = oneA.signals;
		}
		const enriched = {
			...base,
			teamAbbrev: teamsByTid.get(row.tid)?.abbrev ?? "",
			teamName: teamsByTid.get(row.tid)
				? `${teamsByTid.get(row.tid).region} ${teamsByTid.get(row.tid).name}`
				: "",
			combinedTier,
			responsibleModule,
			combinedReason,
			combinedPassedSignals: signals.join("; "),
		};
		const cr = currentRange(enriched, attrs);
		const vr = combinedRange(enriched, attrs);
		const currentV2 = scorePoint({
			row: enriched,
			attrs,
			tier: current.tier,
			range: cr,
		});
		const combinedV2 = scorePoint({
			row: enriched,
			attrs,
			tier: combinedTier,
			range: vr,
		});
		return {
			...enriched,
			currentRangeMinM: cr.minM,
			currentRangeMaxM: cr.maxM,
			currentRangeText: cr.text,
			combinedRangeMinM: vr.minM,
			combinedRangeMaxM: vr.maxM,
			combinedRangeText: vr.text,
			currentPointM: currentV2.debugPointEstimateM,
			combinedPointM: combinedV2.debugPointEstimateM,
			currentPlacement: currentV2.tierPlacementScore,
			combinedPlacement: combinedV2.tierPlacementScore,
		};
	});
	return { save, attrs, rows: scored };
};

const buildPlacementRows = (labeled, attrs) =>
	labeled.map((row) => ({
		dataset: row.dataset,
		caseId: row.caseId,
		globalCaseId: row.globalCaseId,
		name: row.name,
		bucket: row.bucket,
		currentTier: row.currentTier,
		combinedTier: row.combinedTier,
		responsibleModule: row.responsibleModule,
		humanRangeText: row.humanRangeText,
		tierRangeText: row.combinedRangeText,
		tierRangeMinM: row.combinedRangeMinM,
		tierRangeMaxM: row.combinedRangeMaxM,
		currentPointM: row.currentV2PointM,
		combinedPointM: row.combinedPointM,
		pointLocationInsideTierRange: round(
			row.combinedRangeMaxM === row.combinedRangeMinM
				? 1
				: (row.combinedPointM - row.combinedRangeMinM) /
						(row.combinedRangeMaxM - row.combinedRangeMinM),
			4,
		),
		currentGapM: row.currentV2GapM,
		combinedGapM: row.combinedGapM,
		missType: missType(row, attrs.salaryCap),
		humanVsTierRange: humanVsTierRange(row),
		decomposition: decomposition(row, attrs.salaryCap),
		nearBoundary: boolText(isNearBoundary(row.combinedGapM, attrs.salaryCap)),
		combinedSevere: row.combinedSevere,
		combinedDirection: row.combinedDirection,
	}));

const buildTierRangeDiagnosis = (labeled, attrs) =>
	groupRows(labeled, (row) => row.combinedTier)
		.map(([tier, rows]) => {
			const near = count(rows, (row) =>
				isNearBoundary(row.combinedGapM, attrs.salaryCap),
			);
			const above = count(
				rows,
				(row) => humanVsTierRange(row) === "human_range_above_tier_range",
			);
			const below = count(
				rows,
				(row) => humanVsTierRange(row) === "human_range_below_tier_range",
			);
			const overlap = count(
				rows,
				(row) => humanVsTierRange(row) === "human_range_overlaps_tier_range",
			);
			const tooLow = count(
				rows,
				(row) =>
					row.combinedDirection === "too_low" &&
					!isNearBoundary(row.combinedGapM, attrs.salaryCap),
			);
			const tooHigh = count(
				rows,
				(row) =>
					row.combinedDirection === "too_high" &&
					!isNearBoundary(row.combinedGapM, attrs.salaryCap),
			);
			const severe = count(rows, (row) => row.combinedSevere === "yes");
			let diagnosis = "looks_ok";
			if (rows.length < 2) diagnosis = "sample_too_small";
			else if (
				above > 0 &&
				tooLow >= tooHigh &&
				tier !== "YOUNG_PROVEN_STARTER"
			)
				diagnosis = "range_too_low";
			else if (below > 0 && tooHigh > tooLow) diagnosis = "range_too_high";
			else if (overlap > 0 && (tooLow || tooHigh))
				diagnosis = "placement_issue";
			else if (tooLow && rows.every((row) => row.responsibleModule === "none"))
				diagnosis = "first_layer_issue_possible";
			return {
				tier,
				count: rows.length,
				currentRangeMinM: round(
					avg(rows.map((row) => row.currentRangeMinM)),
					3,
				),
				currentRangeMaxM: round(
					avg(rows.map((row) => row.currentRangeMaxM)),
					3,
				),
				candidateTemporaryRangeMinM: round(
					avg(rows.map((row) => row.combinedRangeMinM)),
					3,
				),
				candidateTemporaryRangeMaxM: round(
					avg(rows.map((row) => row.combinedRangeMaxM)),
					3,
				),
				labeledCaseCount: rows.length,
				meanGapM: round(avg(rows.map((row) => row.combinedGapM)), 3),
				medianGapM: round(median(rows.map((row) => row.combinedGapM)), 3),
				severe,
				tooLow,
				tooHigh,
				nearBoundaryCount: near,
				humanRangeBelowTierRangeCount: below,
				humanRangeOverlapsTierRangeCount: overlap,
				humanRangeAboveTierRangeCount: above,
				likelyDiagnosis: diagnosis,
			};
		})
		.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));

const top15ByTeam = (rows) =>
	groupRows(
		rows.filter((row) => num(row, "tid", -99) >= 0),
		(row) => row.tid,
	).map(([tid, teamRows]) => [
		tid,
		teamRows
			.slice()
			.sort(
				(a, b) =>
					num(b, "MPG", 0) - num(a, "MPG", 0) ||
					num(b, "valueNoPot", 0) - num(a, "valueNoPot", 0) ||
					num(b, "GP", 0) - num(a, "GP", 0),
			)
			.slice(0, 15),
	]);

const buildTeamPayroll = ({ rows, attrs }) =>
	top15ByTeam(rows).map(([tid, teamRows]) => {
		const deltaRows = teamRows
			.map((row) => ({
				...row,
				deltaPct: pctCap(
					row.combinedPointM - row.currentPointM,
					attrs.salaryCap,
				),
			}))
			.sort((a, b) => b.deltaPct - a.deltaPct);
		const topN = (n) =>
			sum(
				teamRows
					.slice(0, n)
					.map((row) => pctCap(row.combinedPointM, attrs.salaryCap)),
			);
		const combinedTop15 = topN(15);
		const moduleDelta = (module) =>
			sum(
				teamRows
					.filter((row) => row.responsibleModule === module)
					.map((row) =>
						pctCap(row.combinedPointM - row.currentPointM, attrs.salaryCap),
					),
			);
		const playerText = (row) =>
			row
				? `${row.name} (${row.currentTier}->${row.combinedTier}, ${round(row.currentPointM, 2)}->${round(row.combinedPointM, 2)}, +${round(row.deltaPct, 2)}% cap)`
				: "";
		return {
			tid,
			teamAbbrev: teamRows[0]?.teamAbbrev ?? "",
			teamName: teamRows[0]?.teamName ?? "",
			top15PlayerCount: teamRows.length,
			current_v2_point_sum_pct_cap: round(
				sum(teamRows.map((row) => pctCap(row.currentPointM, attrs.salaryCap))),
				3,
			),
			combined_point_sum_pct_cap: round(combinedTop15, 3),
			delta_pct_cap: round(
				sum(
					teamRows.map((row) =>
						pctCap(row.combinedPointM - row.currentPointM, attrs.salaryCap),
					),
				),
				3,
			),
			combined_range_min_sum_pct_cap: round(
				sum(
					teamRows.map((row) => pctCap(row.combinedRangeMinM, attrs.salaryCap)),
				),
				3,
			),
			combined_range_mid_sum_pct_cap: round(
				sum(
					teamRows.map((row) =>
						pctCap(
							(row.combinedRangeMinM + row.combinedRangeMaxM) / 2,
							attrs.salaryCap,
						),
					),
				),
				3,
			),
			combined_range_max_sum_pct_cap: round(
				sum(
					teamRows.map((row) => pctCap(row.combinedRangeMaxM, attrs.salaryCap)),
				),
				3,
			),
			top8_combined_point_sum_pct_cap: round(topN(8), 3),
			top10_combined_point_sum_pct_cap: round(topN(10), 3),
			top15_combined_point_sum_pct_cap: round(combinedTop15, 3),
			thresholdFlag: teamBucket(combinedTop15),
			oneA_delta_contribution: round(moduleDelta("1A"), 3),
			oneB_B_delta_contribution: round(moduleDelta("1B-B"), 3),
			other_delta_contribution: round(
				moduleDelta("none") + moduleDelta("conflict"),
				3,
			),
			highest_delta_player_1: playerText(deltaRows[0]),
			highest_delta_player_2: playerText(deltaRows[1]),
			highest_delta_player_3: playerText(deltaRows[2]),
			top15Players: teamRows.map((row) => row.name).join("; "),
		};
	});

const buildOutliers = (payrollRows) =>
	payrollRows
		.filter((row) => row.combined_point_sum_pct_cap >= 145)
		.map((row) => {
			const driver =
				row.top8_combined_point_sum_pct_cap >= 110
					? "top8 already too high / star-heavy"
					: row.oneA_delta_contribution > row.oneB_B_delta_contribution &&
						  row.oneA_delta_contribution > 5
						? "1A entrants materially lifted payroll"
						: row.oneB_B_delta_contribution > 5
							? "1B-B entrants materially lifted payroll"
							: row.top15_combined_point_sum_pct_cap -
										row.top8_combined_point_sum_pct_cap >
								  45
								? "9-15 too expensive / lower rotation burden"
								: "mostly original V1 range baseline";
			return {
				tid: row.tid,
				teamAbbrev: row.teamAbbrev,
				teamName: row.teamName,
				combinedTop15PctCap: row.combined_point_sum_pct_cap,
				thresholdFlag: row.thresholdFlag,
				top8PctCap: row.top8_combined_point_sum_pct_cap,
				nineToFifteenPctCap: round(
					row.top15_combined_point_sum_pct_cap -
						row.top8_combined_point_sum_pct_cap,
					3,
				),
				oneADelta: row.oneA_delta_contribution,
				oneBBDelta: row.oneB_B_delta_contribution,
				otherDelta: row.other_delta_contribution,
				driverDiagnosis: driver,
				highest_delta_player_1: row.highest_delta_player_1,
				highest_delta_player_2: row.highest_delta_player_2,
				highest_delta_player_3: row.highest_delta_player_3,
			};
		});

const buildTeamDeltaAttribution = (payrollRows) =>
	payrollRows
		.filter((row) => Math.abs(row.delta_pct_cap) >= 3)
		.sort((a, b) => b.delta_pct_cap - a.delta_pct_cap)
		.map((row) => ({
			tid: row.tid,
			teamAbbrev: row.teamAbbrev,
			teamName: row.teamName,
			totalDeltaPctCap: row.delta_pct_cap,
			deltaFrom1A: row.oneA_delta_contribution,
			deltaFrom1B_B: row.oneB_B_delta_contribution,
			deltaFromOther: row.other_delta_contribution,
			topDeltaPlayers: [
				row.highest_delta_player_1,
				row.highest_delta_player_2,
				row.highest_delta_player_3,
			]
				.filter(Boolean)
				.join("; "),
			acceptableRead:
				row.combined_point_sum_pct_cap >= 160
					? "needs review; team top15 payroll high"
					: row.delta_pct_cap <= 12
						? "likely acceptable diagnostic delta"
						: "review module concentration before implementation",
		}));

const evalForRows = ({ labeled, rowsByPid, rowsByName, attrs, overrides }) =>
	labeled.map((label) => {
		const row =
			rowsByPid.get(Number(label.pid)) ?? rowsByName.get(String(label.name));
		const range = combinedRange(row, attrs, overrides);
		const v2 = scorePoint({ row, attrs, tier: row.combinedTier, range });
		const gap = gapToRange({
			pointM: v2.debugPointEstimateM,
			humanMinM: label.humanAmountMinM,
			humanMaxM: label.humanAmountMaxM,
		});
		const direction = directionToRange({
			pointM: v2.debugPointEstimateM,
			humanMinM: label.humanAmountMinM,
			humanMaxM: label.humanAmountMaxM,
		});
		return {
			...label,
			combinedPointM: v2.debugPointEstimateM,
			combinedGapM: gap,
			combinedDirection: direction,
			combinedSevere:
				gap >= 8 || (gap * 1000) / attrs.salaryCap >= 0.05 ? "yes" : "no",
			combinedRangeText: range.text,
			combinedRangeMinM: range.minM,
			combinedRangeMaxM: range.maxM,
		};
	});

const buildSweep = ({ labeled, rows, attrs }) => {
	const rowsByPid = new Map(rows.map((row) => [Number(row.pid), row]));
	const rowsByName = new Map(rows.map((row) => [String(row.name), row]));
	return CFG.sweeps.highEndRotation.flatMap((her) =>
		CFG.sweeps.solidStarter.map((ss) => {
			const overrides = { ...CFG, highEndRotation: her, solidStarter: ss };
			const evalRows = evalForRows({
				labeled,
				rowsByPid,
				rowsByName,
				attrs,
				overrides,
			});
			const top15Rows = rows.map((row) => {
				const range = combinedRange(row, attrs, overrides);
				const v2 = scorePoint({ row, attrs, tier: row.combinedTier, range });
				return {
					...row,
					combinedPointM: v2.debugPointEstimateM,
					combinedRangeMinM: range.minM,
					combinedRangeMaxM: range.maxM,
				};
			});
			const payroll = buildTeamPayroll({ rows: top15Rows, attrs });
			const named = (caseId) => evalRows.find((row) => row.caseId === caseId);
			const status = (row) =>
				row
					? `${row.combinedDirection} gap ${round(row.combinedGapM, 2)}M point ${round(row.combinedPointM, 2)}M`
					: "missing";
			return {
				high_end_rotation_range: her.label,
				solid_starter_range: ss.label,
				meanGapM: round(avg(evalRows.map((row) => row.combinedGapM)), 3),
				medianGapM: round(median(evalRows.map((row) => row.combinedGapM)), 3),
				severe: count(evalRows, (row) => row.combinedSevere === "yes"),
				tooLow: count(evalRows, (row) => row.combinedDirection === "too_low"),
				tooHigh: count(evalRows, (row) => row.combinedDirection === "too_high"),
				nearBoundaryCount: count(evalRows, (row) =>
					isNearBoundary(row.combinedGapM, attrs.salaryCap),
				),
				teamTop15Mean: round(
					avg(payroll.map((row) => row.combined_point_sum_pct_cap)),
					3,
				),
				teamTop15Median: round(
					median(payroll.map((row) => row.combined_point_sum_pct_cap)),
					3,
				),
				teamTop15Max: round(
					Math.max(...payroll.map((row) => row.combined_point_sum_pct_cap)),
					3,
				),
				teamsGte145: count(
					payroll,
					(row) => row.combined_point_sum_pct_cap >= 145,
				),
				teamsGte160: count(
					payroll,
					(row) => row.combined_point_sum_pct_cap >= 160,
				),
				H_02_status: status(named("H-02")),
				V20_11_status: status(named("V20-11")),
				G_03_status: status(named("G-03")),
				E_01_status: status(named("E-01")),
			};
		}),
	);
};

const writeReports = ({
	tierDiag,
	placementRows,
	payroll,
	payrollSummary,
	outliers,
	deltaAttribution,
	sweep,
	labeled,
}) => {
	const solidDiag = tierDiag.find((row) => row.tier === "SOLID_STARTER");
	const highDiag = tierDiag.find((row) => row.tier === "HIGH_END_ROTATION");
	const h02 = placementRows.find((row) => row.caseId === "H-02");
	const v2011 = placementRows.find((row) => row.caseId === "V20-11");
	const g03 = placementRows.find((row) => row.caseId === "G-03");
	const e01 = placementRows.find((row) => row.caseId === "E-01");
	const bestSweep = sweep
		.slice()
		.sort(
			(a, b) =>
				a.severe - b.severe ||
				a.tooHigh - b.tooHigh ||
				a.meanGapM - b.meanGapM ||
				a.teamsGte160 - b.teamsGte160,
		)[0];
	const maxPayroll = Math.max(
		...payroll.map((row) => row.combined_point_sum_pct_cap),
	);
	const summaryMd = `# V3-AB range / placement / team-payroll diagnosis

Artifact-only diagnosis. This does not implement V3, alter first-layer rules, modify src, modify formal scoreTier/MODEL_TIERS, modify sandbox v2, change existing score CSVs, resample, write temp outputs, or commit.

## Direct Answers

1. V1 existing ranges after V3-AB: no broad explosion in existing tiers, but YOUNG_PROVEN_STARTER still has some human-above-range signals; treat as calibration evidence, not an automatic first-layer change.
2. HIGH_END_ROTATION 7%-12%: ${highDiag?.likelyDiagnosis ?? "missing"}; labeled cases show one too-high/one too-low tension, so range needs review but not a single-case change.
3. SOLID_STARTER 12%-17%: ${solidDiag?.likelyDiagnosis ?? "missing"}; H-02 is below the upper range while G-03 is above human, so the problem is mixed range/placement/human-range calibration.
4. too_high 7->9: more likely new-tier range/placement plus possibly low human ranges on individual calibration cases, not a clean first-layer failure.
5. H-02 / Simmons: ${h02?.decomposition ?? "missing"}; status ${h02?.missType ?? "missing"}, gap ${round(h02?.combinedGapM, 2)}M.
6. V20-11 / AD: ${v2011?.missType === "near_boundary_minor_miss" ? "yes, near-boundary minor miss" : v2011?.missType}; gap ${round(v2011?.combinedGapM, 2)}M.
7. Team top15 implied payroll: median ${round(payrollSummary.find((row) => row.model === "combined")?.median, 1)}% cap, mean ${round(payrollSummary.find((row) => row.model === "combined")?.mean, 1)}% cap.
8. 160%/180% outliers: teams >=160% ${payrollSummary.find((row) => row.model === "combined")?.teamsGte160}, teams >=180% ${payrollSummary.find((row) => row.model === "combined")?.teamsGte180}; max ${round(maxPayroll, 1)}%.
9. Team explosions, if any: see \`team_payroll_outliers.csv\`; attribution separates 1A, 1B-B, and baseline/other.
10. Range sweep: yes, narrow optional sweep was run because new tier cases have both high and low signals. Best diagnostic row by severe/too_high/mean-gap ordering: HER ${bestSweep.high_end_rotation_range}, SOLID ${bestSweep.solid_starter_range}.
11. Blind validation/test set: not yet. First review range/placement and team payroll; then a blind validation set is reasonable before formal implementation.

## Tier Range Diagnosis

${markdownTable(tierDiag, [
	{ key: "tier", label: "tier" },
	{ key: "labeledCaseCount", label: "cases" },
	{ key: "meanGapM", label: "mean gap" },
	{ key: "medianGapM", label: "median gap" },
	{ key: "severe", label: "severe" },
	{ key: "tooLow", label: "too_low" },
	{ key: "tooHigh", label: "too_high" },
	{ key: "nearBoundaryCount", label: "near" },
	{ key: "humanRangeBelowTierRangeCount", label: "human below" },
	{ key: "humanRangeOverlapsTierRangeCount", label: "overlap" },
	{ key: "humanRangeAboveTierRangeCount", label: "human above" },
	{ key: "likelyDiagnosis", label: "diagnosis" },
])}

## Placement Highlights

${markdownTable([h02, v2011, g03, e01].filter(Boolean), [
	{ key: "dataset", label: "dataset" },
	{ key: "caseId", label: "case" },
	{ key: "combinedTier", label: "tier" },
	{ key: "responsibleModule", label: "module" },
	{ key: "humanRangeText", label: "human" },
	{ key: "tierRangeText", label: "tier range" },
	{ key: "combinedPointM", label: "point" },
	{ key: "combinedGapM", label: "gap" },
	{ key: "missType", label: "miss type" },
	{ key: "decomposition", label: "decomposition" },
])}

## Team Payroll Summary

${markdownTable(payrollSummary, [
	{ key: "model", label: "model" },
	{ key: "mean", label: "mean" },
	{ key: "median", label: "median" },
	{ key: "p10", label: "p10" },
	{ key: "p25", label: "p25" },
	{ key: "p75", label: "p75" },
	{ key: "p90", label: "p90" },
	{ key: "max", label: "max" },
	{ key: "teamsGte145", label: ">=145" },
	{ key: "teamsGte160", label: ">=160" },
	{ key: "teamsGte180", label: ">=180" },
])}

Outliers >=145%: ${outliers.length}. Team delta attribution rows: ${deltaAttribution.length}.

## Range Sweep Read

${markdownTable(sweep.slice(0, 8), [
	{ key: "high_end_rotation_range", label: "HER" },
	{ key: "solid_starter_range", label: "SOLID" },
	{ key: "meanGapM", label: "mean gap" },
	{ key: "medianGapM", label: "median gap" },
	{ key: "severe", label: "severe" },
	{ key: "tooLow", label: "too_low" },
	{ key: "tooHigh", label: "too_high" },
	{ key: "teamsGte145", label: "teams >=145" },
	{ key: "teamsGte160", label: "teams >=160" },
])}
`;
	fs.writeFileSync(out.summary, summaryMd);
	fs.writeFileSync(
		out.rules,
		`# V3-AB range diagnosis rules

This script diagnoses V3-AB range, placement, and team top15 implied payroll only.

- First layer is fixed as V3-AB: 1A HIGH_END_ROTATION plus 1B-narrow-B SOLID_STARTER.
- HIGH_END_ROTATION baseline temporary range: 7%-12% cap.
- SOLID_STARTER baseline temporary range: 12%-17% cap.
- Near-boundary miss: gap <= $1M or <= 0.75% cap.
- Team top15 selection is fixed by tid >= 0, regular-season stats, MPG desc, valueNoPot desc, GP desc. It does not use candidate contract point.
- Team payroll thresholds are diagnostic only: <=110 low/conservative, 110-130 normal-ish, 130-145 elevated, 145-160 high_risk, >=160 likely_bad, >=180 extreme_bad.
- Optional range sweep is diagnostic and does not imply a rule change.
`,
	);
	fs.writeFileSync(
		out.analysisPack,
		`# V3-AB range diagnosis analysis pack

## Main read

- Labeled cases: ${labeled.length}
- Tier diagnosis rows: ${tierDiag.length}
- Placement diagnosis rows: ${placementRows.length}
- Team top15 rows: ${payroll.length}
- Outlier teams >=145%: ${outliers.length}
- Range sweep rows: ${sweep.length}

## Recommended sequence

1. Review \`tier_range_diagnosis.csv\` for tier-level range issues.
2. Review \`placement_diagnosis.csv\` for point-placement decomposition.
3. Review \`team_payroll_outliers.csv\` and \`team_delta_attribution.csv\` before considering any range change.
4. Use \`range_sweep_optional.csv\` only as diagnostic support.
5. Do blind validation/test only after deciding whether range/placement needs a sandbox revision.
`,
	);
};

const main = () => {
	fs.mkdirSync(outDir, { recursive: true });
	const { attrs, rows } = buildRows();
	const rowsByName = new Map(rows.map((row) => [String(row.name), row]));
	const labeled = readCsv(path.join(abDir, "labeled_eval.csv")).map((label) => {
		const fullRow = rowsByName.get(String(label.name));
		return {
			...label,
			currentRangeMinM: fullRow?.currentRangeMinM ?? "",
			currentRangeMaxM: fullRow?.currentRangeMaxM ?? "",
			currentRangeText: fullRow?.currentRangeText ?? "",
			currentPlacement: fullRow?.currentPlacement ?? "",
			combinedPlacement: fullRow?.combinedPlacement ?? "",
		};
	});
	const placementRows = buildPlacementRows(labeled, attrs);
	const tierDiag = buildTierRangeDiagnosis(labeled, attrs);
	const payroll = buildTeamPayroll({ rows, attrs });
	const payrollSummary = [
		summarizeSeries(payroll, "current_v2_point_sum_pct_cap", "current"),
		summarizeSeries(payroll, "combined_point_sum_pct_cap", "combined"),
	];
	const outliers = buildOutliers(payroll);
	const deltaAttribution = buildTeamDeltaAttribution(payroll);
	const sweep = buildSweep({ labeled, rows, attrs });
	const labeledCaseDiagnosis = placementRows.map((row) => ({
		...row,
		diagnosis:
			row.missType === "inside"
				? "looks_ok"
				: row.missType === "near_boundary_minor_miss"
					? "near_boundary_minor_miss"
					: row.decomposition,
	}));

	writeCsv(out.tierRangeDiagnosis, tierDiag, [
		"tier",
		"count",
		"currentRangeMinM",
		"currentRangeMaxM",
		"candidateTemporaryRangeMinM",
		"candidateTemporaryRangeMaxM",
		"labeledCaseCount",
		"meanGapM",
		"medianGapM",
		"severe",
		"tooLow",
		"tooHigh",
		"nearBoundaryCount",
		"humanRangeBelowTierRangeCount",
		"humanRangeOverlapsTierRangeCount",
		"humanRangeAboveTierRangeCount",
		"likelyDiagnosis",
	]);
	writeCsv(out.placementDiagnosis, placementRows, [
		"dataset",
		"caseId",
		"globalCaseId",
		"name",
		"bucket",
		"currentTier",
		"combinedTier",
		"responsibleModule",
		"humanRangeText",
		"tierRangeText",
		"tierRangeMinM",
		"tierRangeMaxM",
		"currentPointM",
		"combinedPointM",
		"pointLocationInsideTierRange",
		"currentGapM",
		"combinedGapM",
		"missType",
		"humanVsTierRange",
		"decomposition",
		"nearBoundary",
		"combinedSevere",
		"combinedDirection",
	]);
	writeCsv(out.labeledCaseDiagnosis, labeledCaseDiagnosis, [
		"dataset",
		"caseId",
		"globalCaseId",
		"name",
		"bucket",
		"combinedTier",
		"responsibleModule",
		"humanRangeText",
		"tierRangeText",
		"combinedPointM",
		"combinedGapM",
		"missType",
		"diagnosis",
	]);
	writeCsv(out.teamTop15Payroll, payroll, [
		"tid",
		"teamAbbrev",
		"teamName",
		"top15PlayerCount",
		"current_v2_point_sum_pct_cap",
		"combined_point_sum_pct_cap",
		"delta_pct_cap",
		"combined_range_min_sum_pct_cap",
		"combined_range_mid_sum_pct_cap",
		"combined_range_max_sum_pct_cap",
		"top8_combined_point_sum_pct_cap",
		"top10_combined_point_sum_pct_cap",
		"top15_combined_point_sum_pct_cap",
		"thresholdFlag",
		"oneA_delta_contribution",
		"oneB_B_delta_contribution",
		"other_delta_contribution",
		"highest_delta_player_1",
		"highest_delta_player_2",
		"highest_delta_player_3",
		"top15Players",
	]);
	writeCsv(out.teamTop15PayrollSummary, payrollSummary, [
		"model",
		"metric",
		"teamCount",
		"mean",
		"median",
		"p10",
		"p25",
		"p75",
		"p90",
		"max",
		"low_or_conservative",
		"normal_ish",
		"elevated",
		"high_risk",
		"likely_bad",
		"extreme_bad",
		"teamsGte145",
		"teamsGte160",
		"teamsGte180",
	]);
	writeCsv(out.teamPayrollOutliers, outliers, [
		"tid",
		"teamAbbrev",
		"teamName",
		"combinedTop15PctCap",
		"thresholdFlag",
		"top8PctCap",
		"nineToFifteenPctCap",
		"oneADelta",
		"oneBBDelta",
		"otherDelta",
		"driverDiagnosis",
		"highest_delta_player_1",
		"highest_delta_player_2",
		"highest_delta_player_3",
	]);
	writeCsv(out.teamDeltaAttribution, deltaAttribution, [
		"tid",
		"teamAbbrev",
		"teamName",
		"totalDeltaPctCap",
		"deltaFrom1A",
		"deltaFrom1B_B",
		"deltaFromOther",
		"topDeltaPlayers",
		"acceptableRead",
	]);
	writeCsv(out.rangeSweepOptional, sweep, [
		"high_end_rotation_range",
		"solid_starter_range",
		"meanGapM",
		"medianGapM",
		"severe",
		"tooLow",
		"tooHigh",
		"nearBoundaryCount",
		"teamTop15Mean",
		"teamTop15Median",
		"teamTop15Max",
		"teamsGte145",
		"teamsGte160",
		"H_02_status",
		"V20_11_status",
		"G_03_status",
		"E_01_status",
	]);
	writeReports({
		tierDiag,
		placementRows,
		payroll,
		payrollSummary,
		outliers,
		deltaAttribution,
		sweep,
		labeled,
	});

	for (const file of Object.values(out)) console.log(`Wrote ${file}`);
	console.log(
		JSON.stringify(
			{
				tierRows: tierDiag.length,
				teams: payroll.length,
				combinedPayroll: payrollSummary.find((row) => row.model === "combined"),
				outliers: outliers.length,
				sweepRows: sweep.length,
			},
			null,
			2,
		),
	);
};

main();
