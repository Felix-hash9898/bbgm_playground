#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
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
	scoreTier,
	tierRange,
} from "./contract-market-tier-score.mjs";
import { scoreContractMarketV2 } from "./contract-market-sandbox-v2.mjs";

const root = process.cwd();
const artifactsDir = path.join(root, "contract_market_artifacts");
const tempDir = path.join(root, "temp");
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);

const distributionPath = path.join(
	artifactsDir,
	"contract_market_candidate1a_high_rotation_distribution.csv",
);
const transitionPath = path.join(
	artifactsDir,
	"contract_market_candidate1a_high_rotation_transition_matrix.csv",
);
const capBudgetPath = path.join(
	artifactsDir,
	"contract_market_candidate1a_high_rotation_cap_budget.csv",
);
const labeledEvalPath = path.join(
	artifactsDir,
	"contract_market_candidate1a_high_rotation_labeled_eval.csv",
);
const laneHitsPath = path.join(
	artifactsDir,
	"contract_market_candidate1a_high_rotation_lane_hits.csv",
);
const summaryPath = path.join(
	artifactsDir,
	"contract_market_candidate1a_high_rotation_summary.md",
);
const rulesPath = path.join(
	tempDir,
	"contract_market_candidate1a_high_rotation_rules.md",
);
const analysisPackPath = path.join(
	tempDir,
	"contract_market_candidate1a_high_rotation_analysis_pack.md",
);

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

const HIGH_END_ROTATION_RANGE = {
	rangeType: "capPct",
	minPct: 0.07,
	maxPct: 0.12,
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

const avg = (values) => {
	const finite = values.map(Number).filter(Number.isFinite);
	return finite.length === 0
		? ""
		: finite.reduce((sum, value) => sum + value, 0) / finite.length;
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

const count = (rows, predicate) => rows.filter(predicate).length;

const sum = (values) =>
	values.reduce(
		(total, value) =>
			total + (Number.isFinite(Number(value)) ? Number(value) : 0),
		0,
	);

const groupRows = (rows, keyFn) => {
	const grouped = new Map();
	for (const row of rows) {
		const key = keyFn(row);
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key).push(row);
	}
	return [...grouped.entries()];
};

const boolText = (value) => (value ? "yes" : "no");

const supportScore = (entries) =>
	entries
		.filter((entry) => entry.passed)
		.reduce((total, entry) => total + entry.weight, 0);

const supportLabels = (entries) =>
	entries.filter((entry) => entry.passed).map((entry) => entry.label);

const signal = (label, passed, weight = 1) => ({ label, passed, weight });

const hardFloorFailReasons = (row) => {
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

const minimumStrongerFloorFailReasons = (row) => {
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

const roleSignals = (row) => [
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

const coreIdentitySignals = (row) => [
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

const valueProductionSignals = (row) => [
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
	const hardFloorFails = hardFloorFailReasons(row);
	const minFloorFails =
		currentTier === "MINIMUM_LEVEL" ? minimumStrongerFloorFailReasons(row) : [];
	const protectedStarterTier = [
		"SUPERSTAR_MAX",
		"STAR_NEAR_MAX",
		"YOUNG_PROVEN_STARTER",
		"LOW_END_STARTER",
	].includes(currentTier);
	const role = roleSignals(row);
	const core = coreIdentitySignals(row);
	const valueProduction = valueProductionSignals(row);
	const rolePassed = supportScore(role) >= 0.75;
	const corePassed = core.some((entry) => entry.passed);
	const valueProductionPassed = valueProduction.some((entry) => entry.passed);
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
		rolePassed ? "" : "missing real role support",
		corePassed ? "" : "missing core identity",
		valueProductionPassed ? "" : "missing value/production support",
		score >= 3 ? "" : "support score < 3",
	].filter(Boolean);

	return {
		passed: failReasons.length === 0,
		failReasons,
		hardFloorPassed: hardFloorFails.length === 0,
		minimumStrongerFloorPassed: minFloorFails.length === 0,
		protectedStarterTier,
		rolePassed,
		corePassed,
		valueProductionPassed,
		supportScore: score,
		roleSignals: supportLabels(role),
		coreSignals: supportLabels(core),
		valueProductionSignals: supportLabels(valueProduction),
		allSignals: supportEntries.map((entry) => entry.label),
		reason: [
			"candidate_1A HIGH_END_ROTATION: hard floor + real role + core identity + value/production support",
			`core: ${supportLabels(core).join("; ") || "none"}`,
			`support: ${
				[...supportLabels(role), ...supportLabels(valueProduction)].join(
					"; ",
				) || "none"
			}`,
		].join(" | "),
	};
};

const candidate1aScoreTier = (row) => {
	const current = scoreTier(row);
	const lane = highEndRotationCheck(row, current.tier);
	if (lane.passed) {
		return {
			tier: "HIGH_END_ROTATION",
			reason: lane.reason,
			passedSignals: lane.allSignals,
			failReasons: [],
			lane,
		};
	}
	return {
		tier: current.tier,
		reason: `kept current scoreTier (${current.tier}); HIGH_END_ROTATION failed: ${lane.failReasons.join("; ")}`,
		passedSignals: [],
		failReasons: lane.failReasons,
		lane,
	};
};

const rangeForTier = (tier, row, attrs) => {
	if (tier !== "HIGH_END_ROTATION") {
		const range = tierRange(tier, row, attrs);
		return {
			minM: range.modelRangeMin / 1000,
			maxM: range.modelRangeMax / 1000,
			text: range.modelRangeText,
			years: range.modelYears,
		};
	}
	const min = Math.max(
		row.minContractForPlayer,
		attrs.salaryCap * HIGH_END_ROTATION_RANGE.minPct,
	);
	const max = Math.max(min, attrs.salaryCap * HIGH_END_ROTATION_RANGE.maxPct);
	return {
		minM: Math.round(min) / 1000,
		maxM: Math.round(max) / 1000,
		text:
			Math.round(min) === Math.round(max)
				? money(Math.round(min))
				: `${money(Math.round(min))}-${money(Math.round(max))}`,
		years: "",
	};
};

const tierMove = (currentTier, candidateTier) => {
	const currentRank = TIER_RANK[currentTier];
	const candidateRank = TIER_RANK[candidateTier];
	if (!Number.isFinite(currentRank) || !Number.isFinite(candidateRank)) {
		return { direction: "unknown", steps: "" };
	}
	const delta = currentRank - candidateRank;
	if (delta > 0) return { direction: "up", steps: delta };
	if (delta < 0) return { direction: "down", steps: Math.abs(delta) };
	return { direction: "same", steps: 0 };
};

const buildPoolRows = ({ save }) => {
	const activeEntries = save.players
		.filter(
			(player) =>
				player.tid >= -1 && player.stats?.some((stats) => !stats.playoffs),
		)
		.map((player) => ({
			key: `candidate1a-high-rotation-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries: activeEntries,
	});
	const scoredRows = rows.map((row) => {
		const current = scoreTier(row);
		const candidate = candidate1aScoreTier(row);
		const move = tierMove(current.tier, candidate.tier);
		return {
			...row,
			contractRelevant:
				row.tid === -1 || row.normalNoOptionContractYears <= 1 ? "yes" : "no",
			currentTier: current.tier,
			currentReason: current.reason,
			candidateTier: candidate.tier,
			candidateReason: candidate.reason,
			candidatePassedSignals: candidate.passedSignals.join("; "),
			candidateFailReasons: candidate.failReasons.join("; "),
			candidateLaneSupportScore: candidate.lane.supportScore,
			candidateLaneCoreSignals: candidate.lane.coreSignals.join("; "),
			candidateLaneRoleSignals: candidate.lane.roleSignals.join("; "),
			candidateLaneValueProductionSignals:
				candidate.lane.valueProductionSignals.join("; "),
			moveDirection: move.direction,
			moveSteps: move.steps,
		};
	});
	return { attrs, rows: scoredRows };
};

const top15RosterProxy = (rows) => {
	const rostered = rows.filter((row) => num(row, "tid", -99) >= 0);
	const pids = new Set();
	for (const [, teamRows] of groupRows(rostered, (row) => row.tid)) {
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
	const tierField = model === "current" ? "currentTier" : "candidateTier";
	const total = rows.length;
	return TIERS.map((tier) => {
		const tierRows = rows.filter((row) => row[tierField] === tier);
		return {
			pool,
			model,
			tier,
			count: tierRows.length,
			percentage: total > 0 ? tierRows.length / total : 0,
			avgAge: avg(tierRows.map((row) => row.age)),
			avgMPG: avg(tierRows.map((row) => row.MPG)),
			avgValue: avg(tierRows.map((row) => row.value)),
			avgValueNoPot: avg(tierRows.map((row) => row.valueNoPot)),
			avgGetContractValue: avg(tierRows.map((row) => row.getContractValue)),
			avgPER: avg(tierRows.map((row) => row.PER)),
			avgEWA: avg(tierRows.map((row) => row.EWA)),
			avgVORP: avg(tierRows.map((row) => row.VORP)),
			avgBPM: avg(tierRows.map((row) => row.BPM)),
		};
	});
};

const transitionRows = ({ pool, rows }) => {
	const currentCounts = new Map();
	for (const row of rows) {
		currentCounts.set(
			row.currentTier,
			(currentCounts.get(row.currentTier) ?? 0) + 1,
		);
	}
	return groupRows(rows, (row) => `${row.currentTier}||${row.candidateTier}`)
		.map(([key, groupedRows]) => {
			const [currentTier, candidateTier] = key.split("||");
			const move = tierMove(currentTier, candidateTier);
			return {
				pool,
				currentTier,
				candidateTier,
				count: groupedRows.length,
				percentageOfCurrentTier:
					groupedRows.length /
					(currentCounts.get(currentTier) ?? groupedRows.length),
				moveDirection: move.direction,
				moveSteps: move.steps,
				focusTransition: boolText(
					candidateTier === "HIGH_END_ROTATION" &&
						[
							"MINIMUM_LEVEL",
							"LOW_ROTATION_PLUS",
							"SPECIALIST_ROTATION",
							"YOUNG_UPSIDE_SUSPECT",
							"LOW_END_STARTER",
						].includes(currentTier),
				),
			};
		})
		.sort(
			(a, b) =>
				a.pool.localeCompare(b.pool) ||
				(TIER_RANK[a.currentTier] ?? 99) - (TIER_RANK[b.currentTier] ?? 99) ||
				(TIER_RANK[a.candidateTier] ?? 99) - (TIER_RANK[b.candidateTier] ?? 99),
		);
};

const capRows = ({ pool, rows, attrs, model }) => {
	const tierField = model === "current" ? "currentTier" : "candidateTier";
	const rowCap = (row) => {
		const tier = row[tierField];
		const range =
			model === "current"
				? tierRange(tier, row, attrs)
				: rangeForTier(tier, row, attrs);
		const minM = model === "current" ? range.modelRangeMin / 1000 : range.minM;
		const maxM = model === "current" ? range.modelRangeMax / 1000 : range.maxM;
		return {
			tier,
			minCap: (minM * 1000) / attrs.salaryCap,
			midCap: (((minM + maxM) / 2) * 1000) / attrs.salaryCap,
			maxCap: (maxM * 1000) / attrs.salaryCap,
		};
	};
	const out = [];
	for (const tier of TIERS) {
		const tierRows = rows.filter((row) => row[tierField] === tier);
		if (tierRows.length === 0) continue;
		const caps = tierRows.map(rowCap);
		out.push({
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
	const allCaps = rows.map(rowCap);
	out.push({
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
	return out;
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
		for (const row of readCsv(input.evalPath)) {
			comparableRows.push({ dataset: input.dataset, ...row });
		}
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
	) {
		return "";
	}
	if (point < humanMin) return humanMin - point;
	if (point > humanMax) return point - humanMax;
	return 0;
};

const pointDirection = ({ point, humanMin, humanMax }) => {
	if (
		!Number.isFinite(point) ||
		!Number.isFinite(humanMin) ||
		!Number.isFinite(humanMax)
	) {
		return "missing";
	}
	if (point < humanMin) return "too_low";
	if (point > humanMax) return "too_high";
	return "inside";
};

const severeFromGap = (gapM, salaryCap) =>
	Number.isFinite(gapM) && (gapM >= 8 || (gapM * 1000) / salaryCap >= 0.05)
		? "yes"
		: "no";

const labeledEvalRows = ({ labeledRows, poolByPid, attrs }) =>
	labeledRows.map((label) => {
		const row = poolByPid.get(Number(label.pid));
		const candidate = candidate1aScoreTier(row);
		const range = rangeForTier(candidate.tier, row, attrs);
		const candidateV2 = scoreContractMarketV2(
			{
				...row,
				debugModelTier: candidate.tier,
				debugModelRangeText: range.text,
				modelYears: range.years,
				debugModelReason: candidate.reason,
			},
			attrs,
		);
		const candidatePoint = candidateV2.debugPointEstimateM;
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
		const currentTier = scoreTier(row).tier;
		const move = tierMove(currentTier, candidate.tier);
		const deltaGap = candidateGap - label.currentV2GapM;
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
			currentTier,
			candidateTier: candidate.tier,
			moveDirection: move.direction,
			moveSteps: move.steps,
			candidateReason: candidate.reason,
			candidatePassedSignals: candidate.passedSignals.join("; "),
			candidateFailReasons: candidate.failReasons.join("; "),
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
			candidateTierPlacementScore: candidateV2.tierPlacementScore,
			candidateRiskFlags: candidateV2.riskFlags.join("; "),
			tradeExploitRiskFlag: candidateV2.tradeExploitRiskFlag,
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

const fmtPercent = (value, digits = 3) =>
	Number.isFinite(value) ? round(value * 100, digits) : "";

const writeRules = () => {
	const md = `# candidate_1A HIGH_END_ROTATION dry-run rules

Scope: artifact-only ablation. This script tests one candidate-only tier, \`HIGH_END_ROTATION\`, mapped to 7%-12% cap. It does not modify \`src/\`, formal \`scoreTier\`, formal \`MODEL_TIERS\`, sandbox v2, existing v1/v2 score CSVs, or sampling.

## Preserved current tiers

\`SUPERSTAR_MAX\`, \`STAR_NEAR_MAX\`, \`YOUNG_PROVEN_STARTER\`, \`LOW_END_STARTER\`, \`SPECIALIST_ROTATION\`, \`YOUNG_UPSIDE_SUSPECT\`, \`VETERAN_ROTATION_GUARD\`, \`LOW_ROTATION_PLUS\`, \`VETERAN_MINIMUM_PLUS\`, and \`MINIMUM_LEVEL\` all use current \`scoreTier\`.

## New candidate-only lane

\`HIGH_END_ROTATION\` can only override current tiers below \`LOW_END_STARTER\`. Current \`LOW_END_STARTER\` and above are protected in 1A so this remains a high-end rotation ablation, not a starter bridge experiment.

Hard floor:

- GP >= 45
- MPG >= 18
- valueNoPot >= 52
- getContractValue >= 52 or value >= 54
- not (PER < 9 and BPM < -3)

Extra floor for current \`MINIMUM_LEVEL\`:

- MPG >= 22
- valueNoPot >= 55
- getContractValue >= 55
- EWA >= 2 or VORP >= 0.2 or BPM >= -0.5

Required groups:

- real role support: GP >= 50 and MPG >= 22, or MPG >= 22, or GP >= 55 and MPG >= 20
- at least one core identity:
  - creator/scorer core: USG >= 22 and PTS >= 12, or AST% >= 18, or AST >= 4
  - portable shooting core: comp_shootingThreePointer >= 0.64, skill_3_margin >= 0.04, and TS >= .54
  - young productive core: age <= 25, MPG >= 18, and EWA >= 1.5 or BPM >= -1 or value >= 57
  - connector/defense core: composite defense/rebounding/passing/impact support with MPG >= 20 and non-negative value support
- at least one value/production support:
  - valueNoPot >= 55
  - getContractValue >= 55
  - EWA >= 2 or VORP >= 0.2 or BPM >= -0.5 or PER >= 14
- support score >= 3, but role/core/value-production groups are separate required gates.

No human labels, trade value, pid, name, or caseId are used as rule inputs.
`;
	fs.writeFileSync(rulesPath, md);
};

const writeReports = ({
	distribution,
	transitions,
	capBudget,
	labeledEval,
	laneHits,
	poolRows,
	safety,
}) => {
	const allCurrent = distribution.filter(
		(row) =>
			row.pool === "all_active" && row.model === "current" && row.count > 0,
	);
	const allCandidate = distribution.filter(
		(row) =>
			row.pool === "all_active" &&
			row.model === "candidate_1A" &&
			row.count > 0,
	);
	const topTransitions = transitions
		.filter(
			(row) =>
				row.pool === "all_active" && row.currentTier !== row.candidateTier,
		)
		.sort((a, b) => b.count - a.count)
		.slice(0, 15);
	const focusTransitions = transitions.filter(
		(row) => row.pool === "all_active" && row.focusTransition === "yes",
	);
	const focusTransitionCounts = laneHits.filter(
		(row) => row.section === "focus_transition_count",
	);
	const capTotals = capBudget.filter((row) => row.tier === "__TOTAL__");
	const summary = evalSummary(labeledEval);
	const highEntrants = poolRows.filter(
		(row) => row.candidateTier === "HIGH_END_ROTATION",
	);
	const labeledHighEntrants = labeledEval.filter(
		(row) => row.candidateTier === "HIGH_END_ROTATION",
	);

	const distributionTable = (rows) =>
		markdownTable(rows, [
			{ key: "tier", label: "tier" },
			{ key: "count", label: "count" },
			{ key: "percentageText", label: "%" },
			{ key: "avgAge", label: "avg age" },
			{ key: "avgMPG", label: "avg MPG" },
			{ key: "avgValueNoPot", label: "avg valueNoPot" },
			{ key: "avgGetContractValue", label: "avg contractValue" },
			{ key: "avgBPM", label: "avg BPM" },
		]);

	const capTotalTable = markdownTable(capTotals, [
		{ key: "pool", label: "pool" },
		{ key: "model", label: "model" },
		{ key: "count", label: "count" },
		{ key: "totalImpliedMinCapPctText", label: "total min cap" },
		{ key: "totalImpliedMidpointCapPctText", label: "total mid cap" },
		{ key: "totalImpliedMaxCapPctText", label: "total max cap" },
		{ key: "impliedMidpointCapPctPer30TeamsText", label: "mid per 30 teams" },
		{ key: "deltaTotalMidpointCapPctVsCurrentText", label: "delta vs current" },
	]);

	const labeledHighTable = markdownTable(
		labeledHighEntrants.map((row) => ({
			dataset: row.dataset,
			caseId: row.caseId,
			bucket: row.bucket,
			human: row.humanRangeText,
			currentTier: row.currentTier,
			candidateTier: row.candidateTier,
			currentPoint: round(row.currentV2PointM, 2),
			candidatePoint: round(row.candidatePointM, 2),
			currentDirection: row.currentV2Direction,
			candidateDirection: row.candidateDirection,
			deltaGap: round(row.deltaGapM, 2),
			signals: row.candidatePassedSignals,
		})),
		[
			{ key: "dataset", label: "dataset" },
			{ key: "caseId", label: "case" },
			{ key: "bucket", label: "bucket" },
			{ key: "human", label: "human" },
			{ key: "currentTier", label: "current tier" },
			{ key: "currentPoint", label: "current point" },
			{ key: "candidatePoint", label: "1A point" },
			{ key: "candidateDirection", label: "1A dir" },
			{ key: "deltaGap", label: "delta gap" },
			{ key: "signals", label: "signals" },
		],
	);

	const summaryMd = `# candidate_1A HIGH_END_ROTATION dry-run

This is an artifact-only ablation. It tests only one candidate-only lane, \`HIGH_END_ROTATION\` at 7%-12% cap. It does not modify \`src/\`, formal \`scoreTier\`, formal \`MODEL_TIERS\`, sandbox v2, existing score CSVs, or sampling.

## Safety verdict

Verdict: **${safety.verdict}**.

Reasons:

${safety.reasons.map((reason) => `- ${reason}`).join("\n")}

Tripwire read:

- all-active upgraded: ${safety.allActiveUpgraded}
- all-active HIGH_END_ROTATION count: ${highEntrants.length}
- current MINIMUM_LEVEL -> HIGH_END_ROTATION: ${safety.minimumToHighEnd}
- rostered mid-cap per 30 teams delta: ${safety.rosteredPer30DeltaText}
- top15 mid-cap per 30 teams delta: ${safety.top15Per30DeltaText}
- labeled severe: ${summary.currentSevere} -> ${summary.candidateSevere}
- labeled too_high: ${summary.currentTooHigh} -> ${summary.candidateTooHigh}

## Current vs candidate_1A distribution

Current all-active:

${distributionTable(allCurrent)}

candidate_1A all-active:

${distributionTable(allCandidate)}

Full four-pool distribution is in \`contract_market_artifacts/contract_market_candidate1a_high_rotation_distribution.csv\`.

## Transition matrix

Top all-active movements:

${markdownTable(topTransitions, [
	{ key: "currentTier", label: "current tier" },
	{ key: "candidateTier", label: "candidate tier" },
	{ key: "count", label: "count" },
	{ key: "percentageOfCurrentTierText", label: "% of current" },
	{ key: "moveDirection", label: "direction" },
	{ key: "moveSteps", label: "steps" },
	{ key: "focusTransition", label: "focus" },
])}

Focus transitions:

${markdownTable(focusTransitionCounts, [
	{ key: "currentTier", label: "current tier" },
	{ key: "candidateTier", label: "candidate tier" },
	{ key: "count", label: "count" },
	{ key: "percentage", label: "% of current" },
	{ key: "notes", label: "notes" },
])}

## Lane hits

HIGH_END_ROTATION entrants: ${highEntrants.length}.

${markdownTable(
	laneHits.filter((row) => row.section === "entrants_by_current_tier"),
	[
		{ key: "currentTier", label: "current tier" },
		{ key: "count", label: "count" },
		{ key: "percentage", label: "% of entrants" },
	],
)}

Signal pass counts and combinations are in \`contract_market_artifacts/contract_market_candidate1a_high_rotation_lane_hits.csv\`.

## Cap-budget sanity

${capTotalTable}

This does not require <=100%. Teams can operate over the cap and all-active is not formal payroll. The read is relative to current baseline.

## Labeled 48 downstream eval

| metric | current v2 | candidate_1A |
| --- | ---: | ---: |
| mean gap | ${round(summary.currentMeanGap, 2)} | ${round(summary.candidateMeanGap, 2)} |
| median gap | ${round(summary.currentMedianGap, 2)} | ${round(summary.candidateMedianGap, 2)} |
| severe | ${summary.currentSevere} | ${summary.candidateSevere} |
| too_low | ${summary.currentTooLow} | ${summary.candidateTooLow} |
| too_high | ${summary.currentTooHigh} | ${summary.candidateTooHigh} |
| candidate better / current better / tie |  | ${summary.candidateBetter} / ${summary.currentBetter} / ${summary.tie} |
| severe fixed |  | ${summary.severeFixed} |
| new severe |  | ${summary.newSevere} |
| improved >= 3M |  | ${summary.improvedBy3M} |
| worsened >= 3M |  | ${summary.worsenedBy3M} |
| too_low fixed |  | ${summary.tooLowFixed} |
| too_high added |  | ${summary.tooHighAdded} |

## Labeled HIGH_END_ROTATION attribution

${labeledHighEntrants.length === 0 ? "No labeled cases entered HIGH_END_ROTATION." : labeledHighTable}

Labeled HIGH_END_ROTATION aggregate:

- count: ${labeledHighEntrants.length}
- improved: ${count(labeledHighEntrants, (row) => row.deltaGapM < -0.1)}
- worsened: ${count(labeledHighEntrants, (row) => row.deltaGapM > 0.1)}
- fixed severe: ${count(labeledHighEntrants, (row) => row.severeFixed === "yes")}
- new severe: ${count(labeledHighEntrants, (row) => row.newSevere === "yes")}
- too_low fixed: ${count(labeledHighEntrants, (row) => row.tooLowFixed === "yes")}
- too_high added: ${count(labeledHighEntrants, (row) => row.tooHighAdded === "yes")}

## Read

candidate_1A is deliberately narrower than candidate_0. It does not create \`HIGH_IMPACT_STARTER\`, does not create \`SOLID_STARTER\`, does not relax \`LOW_END_STARTER\`, does not relax \`LOW_ROTATION_PLUS\`, and protects current \`LOW_END_STARTER\` and above from being rewritten by this ablation.
`;

	const analysisPackMd = `# candidate_1A HIGH_END_ROTATION analysis pack

## One-page summary

- Experiment: one-lane ablation for \`HIGH_END_ROTATION\`.
- Range: 7%-12% cap, dry-run only.
- Entrants: ${highEntrants.length} all-active.
- Upgrades: ${safety.allActiveUpgraded} all-active.
- MINIMUM_LEVEL -> HIGH_END_ROTATION: ${safety.minimumToHighEnd}.
- Labeled severe: ${summary.currentSevere} -> ${summary.candidateSevere}.
- Labeled too_high: ${summary.currentTooHigh} -> ${summary.candidateTooHigh}.
- Verdict: ${safety.verdict}.

## Exact candidate_1A rule

See \`temp/contract_market_candidate1a_high_rotation_rules.md\`.

## Exact differences vs current scoreTier

The current \`scoreTier\` result is computed first. candidate_1A changes only players below current \`LOW_END_STARTER\` who pass the new HIGH_END_ROTATION hard floor, role support, core identity, value/production support, and score gate. All other current tiers stay unchanged.

## Distribution tables

${distributionTable(allCandidate)}

## Cap-budget summary

${capTotalTable}

## Transition red flags

${markdownTable(focusTransitionCounts, [
	{ key: "currentTier", label: "current tier" },
	{ key: "candidateTier", label: "candidate tier" },
	{ key: "count", label: "count" },
	{ key: "percentage", label: "% of current" },
	{ key: "notes", label: "notes" },
])}

## Lane hit signal combinations

${markdownTable(
	laneHits.filter((row) => row.section === "signal_combination").slice(0, 20),
	[
		{ key: "signalOrCombination", label: "combination" },
		{ key: "count", label: "count" },
		{ key: "percentage", label: "% of entrants" },
	],
)}
`;

	fs.writeFileSync(summaryPath, summaryMd);
	fs.writeFileSync(analysisPackPath, analysisPackMd);
};

const main = () => {
	fs.mkdirSync(artifactsDir, { recursive: true });
	fs.mkdirSync(tempDir, { recursive: true });

	const save = readSave(savePath);
	const { attrs, rows } = buildPoolRows({ save });
	const pools = poolViews(rows);

	const distribution = pools.flatMap(({ pool, rows: poolRows }) => [
		...distributionRows({ pool, rows: poolRows, model: "current" }),
		...distributionRows({ pool, rows: poolRows, model: "candidate_1A" }),
	]);
	const distributionForCsv = distribution.map((row) => ({
		...row,
		percentage: round(row.percentage, 6),
		percentageText: pct(row.percentage),
		avgAge: round(row.avgAge, 3),
		avgMPG: round(row.avgMPG, 3),
		avgValue: round(row.avgValue, 3),
		avgValueNoPot: round(row.avgValueNoPot, 3),
		avgGetContractValue: round(row.avgGetContractValue, 3),
		avgPER: round(row.avgPER, 3),
		avgEWA: round(row.avgEWA, 3),
		avgVORP: round(row.avgVORP, 3),
		avgBPM: round(row.avgBPM, 3),
	}));
	writeCsv(distributionPath, distributionForCsv, [
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

	const transitions = pools.flatMap(({ pool, rows: poolRows }) =>
		transitionRows({ pool, rows: poolRows }),
	);
	const transitionsForCsv = transitions.map((row) => ({
		...row,
		percentageOfCurrentTier: round(row.percentageOfCurrentTier, 6),
		percentageOfCurrentTierText: pct(row.percentageOfCurrentTier),
	}));
	writeCsv(transitionPath, transitionsForCsv, [
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

	const rawCapBudget = pools.flatMap(({ pool, rows: poolRows }) => [
		...capRows({ pool, rows: poolRows, attrs, model: "current" }),
		...capRows({ pool, rows: poolRows, attrs, model: "candidate_1A" }),
	]);
	const currentMidByPoolTier = new Map(
		rawCapBudget
			.filter((row) => row.model === "current")
			.map((row) => [
				`${row.pool}||${row.tier}`,
				row.totalImpliedMidpointCapPct,
			]),
	);
	const capBudget = rawCapBudget.map((row) => {
		const delta =
			row.model === "candidate_1A"
				? row.totalImpliedMidpointCapPct -
					(currentMidByPoolTier.get(`${row.pool}||${row.tier}`) ?? 0)
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
	writeCsv(
		capBudgetPath,
		capBudget.map((row) => ({
			pool: row.pool,
			model: row.model,
			tier: row.tier,
			count: row.count,
			tierMinCapPct: fmtPercent(row.tierMinCapPct),
			tierMidpointCapPct: fmtPercent(row.tierMidpointCapPct),
			tierMaxCapPct: fmtPercent(row.tierMaxCapPct),
			totalImpliedMinCapPct: fmtPercent(row.totalImpliedMinCapPct),
			totalImpliedMidpointCapPct: fmtPercent(row.totalImpliedMidpointCapPct),
			totalImpliedMaxCapPct: fmtPercent(row.totalImpliedMaxCapPct),
			impliedMidpointCapPctPer30Teams: fmtPercent(
				row.impliedMidpointCapPctPer30Teams,
			),
			deltaTotalMidpointCapPctVsCurrent: fmtPercent(
				row.deltaTotalMidpointCapPctVsCurrent,
			),
		})),
		[
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
		],
	);

	const laneRows = [];
	const highEntrants = rows.filter(
		(row) => row.candidateTier === "HIGH_END_ROTATION",
	);
	const hardFloorPass = rows.filter(
		(row) => hardFloorFailReasons(row).length === 0,
	);
	const failReasons = groupRows(
		rows.flatMap((row) =>
			highEndRotationCheck(row, row.currentTier).failReasons.map((reason) => ({
				reason,
			})),
		),
		(row) => row.reason,
	).sort((a, b) => b[1].length - a[1].length);
	const addLaneRow = (row) =>
		laneRows.push({
			section: row.section ?? "",
			lane: row.lane ?? "HIGH_END_ROTATION",
			pool: row.pool ?? "",
			currentTier: row.currentTier ?? "",
			candidateTier: row.candidateTier ?? "",
			signalOrCombination: row.signalOrCombination ?? "",
			count: row.count ?? "",
			percentage: row.percentage === undefined ? "" : pct(row.percentage),
			notes: row.notes ?? "",
		});
	addLaneRow({
		section: "hard_floor",
		count: hardFloorPass.length,
		percentage: hardFloorPass.length / rows.length,
		notes:
			"passes base HIGH_END_ROTATION hard floor before protected-tier and group gates",
	});
	for (const [reason, subset] of failReasons) {
		addLaneRow({
			section: "hard_veto_or_group_fail_reason",
			signalOrCombination: reason,
			count: subset.length,
			percentage: subset.length / rows.length,
		});
	}
	for (const [currentTier, subset] of groupRows(
		highEntrants,
		(row) => row.currentTier,
	)) {
		addLaneRow({
			section: "entrants_by_current_tier",
			currentTier,
			candidateTier: "HIGH_END_ROTATION",
			count: subset.length,
			percentage: subset.length / highEntrants.length,
		});
	}
	for (const { pool, rows: poolRows } of pools) {
		const subset = poolRows.filter(
			(row) => row.candidateTier === "HIGH_END_ROTATION",
		);
		addLaneRow({
			section: "entrants_by_pool",
			pool,
			count: subset.length,
			percentage: poolRows.length ? subset.length / poolRows.length : 0,
		});
	}
	const signalNames = [
		...roleSignals(rows[0]).map((entry) => entry.label),
		...coreIdentitySignals(rows[0]).map((entry) => entry.label),
		...valueProductionSignals(rows[0]).map((entry) => entry.label),
	];
	for (const signalName of signalNames) {
		addLaneRow({
			section: "entrant_signal_pass_count",
			signalOrCombination: signalName,
			count: count(highEntrants, (row) =>
				[
					...roleSignals(row),
					...coreIdentitySignals(row),
					...valueProductionSignals(row),
				].some((entry) => entry.label === signalName && entry.passed),
			),
			percentage:
				count(highEntrants, (row) =>
					[
						...roleSignals(row),
						...coreIdentitySignals(row),
						...valueProductionSignals(row),
					].some((entry) => entry.label === signalName && entry.passed),
				) / highEntrants.length,
		});
	}
	for (const [combo, subset] of groupRows(
		highEntrants,
		(row) => row.candidatePassedSignals || "(no signals)",
	).sort((a, b) => b[1].length - a[1].length)) {
		addLaneRow({
			section: "signal_combination",
			signalOrCombination: combo,
			count: subset.length,
			percentage: subset.length / highEntrants.length,
		});
	}
	for (const tier of [
		"MINIMUM_LEVEL",
		"LOW_END_STARTER",
		"YOUNG_PROVEN_STARTER",
	]) {
		const subset = highEntrants.filter((row) => row.currentTier === tier);
		addLaneRow({
			section: "required_source_count",
			currentTier: tier,
			candidateTier: "HIGH_END_ROTATION",
			count: subset.length,
			percentage: highEntrants.length ? subset.length / highEntrants.length : 0,
		});
	}
	for (const currentTier of [
		"MINIMUM_LEVEL",
		"LOW_ROTATION_PLUS",
		"SPECIALIST_ROTATION",
		"YOUNG_UPSIDE_SUSPECT",
		"LOW_END_STARTER",
	]) {
		const subset = rows.filter(
			(row) =>
				row.currentTier === currentTier &&
				row.candidateTier === "HIGH_END_ROTATION",
		);
		const currentTotal = count(rows, (row) => row.currentTier === currentTier);
		addLaneRow({
			section: "focus_transition_count",
			currentTier,
			candidateTier: "HIGH_END_ROTATION",
			count: subset.length,
			percentage: currentTotal > 0 ? subset.length / currentTotal : 0,
			notes: `${subset.length} of ${currentTotal} current ${currentTier}`,
		});
	}

	const labeledRows = loadLabeledRows();
	const poolByPid = new Map(rows.map((row) => [Number(row.pid), row]));
	const labeledEval = labeledEvalRows({ labeledRows, poolByPid, attrs });
	const labeledHighEnd = labeledEval.filter(
		(row) => row.candidateTier === "HIGH_END_ROTATION",
	);
	addLaneRow({
		section: "labeled_high_end_attribution_summary",
		count: labeledHighEnd.length,
		notes: [
			`improved ${count(labeledHighEnd, (row) => row.deltaGapM < -0.1)}`,
			`worsened ${count(labeledHighEnd, (row) => row.deltaGapM > 0.1)}`,
			`fixed severe ${count(labeledHighEnd, (row) => row.severeFixed === "yes")}`,
			`new severe ${count(labeledHighEnd, (row) => row.newSevere === "yes")}`,
			`too_low fixed ${count(labeledHighEnd, (row) => row.tooLowFixed === "yes")}`,
			`too_high added ${count(labeledHighEnd, (row) => row.tooHighAdded === "yes")}`,
		].join("; "),
	});
	for (const row of labeledHighEnd) {
		addLaneRow({
			section: "labeled_high_end_case",
			currentTier: row.currentTier,
			candidateTier: row.candidateTier,
			signalOrCombination: row.candidatePassedSignals,
			count: 1,
			notes: `${row.dataset} ${row.caseId}; human ${row.humanRangeText}; current point ${row.currentV2PointM}; candidate point ${row.candidatePointM}; ${row.candidateDirection}; ${row.candidateReason}`,
		});
	}
	writeCsv(laneHitsPath, laneRows, [
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
	writeCsv(labeledEvalPath, labeledEval, [
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

	writeRules();

	const allActiveUpgraded = count(rows, (row) => row.moveDirection === "up");
	const minimumToHighEnd = count(
		rows,
		(row) =>
			row.currentTier === "MINIMUM_LEVEL" &&
			row.candidateTier === "HIGH_END_ROTATION",
	);
	const findCapTotal = (pool, model) =>
		capBudget.find(
			(row) =>
				row.pool === pool && row.model === model && row.tier === "__TOTAL__",
		);
	const rosteredDelta =
		findCapTotal("rostered_active", "candidate_1A")
			.deltaTotalMidpointCapPctVsCurrent / 30;
	const top15Delta =
		findCapTotal("top15_roster_proxy", "candidate_1A")
			.deltaTotalMidpointCapPctVsCurrent / 30;
	const summary = evalSummary(labeledEval);
	const unsafeReasons = [];
	const warningReasons = [];
	if (summary.candidateSevere > summary.currentSevere) {
		unsafeReasons.push(
			`labeled severe increased ${summary.currentSevere} -> ${summary.candidateSevere}`,
		);
	}
	if (summary.candidateTooHigh > summary.currentTooHigh + 3) {
		unsafeReasons.push(
			`labeled too_high increased materially ${summary.currentTooHigh} -> ${summary.candidateTooHigh}`,
		);
	} else if (summary.candidateTooHigh > summary.currentTooHigh) {
		warningReasons.push(
			`labeled too_high increased ${summary.currentTooHigh} -> ${summary.candidateTooHigh}`,
		);
	}
	if (rosteredDelta > 0.15) {
		unsafeReasons.push(
			`rostered per-30 midpoint cap delta is ${pct(rosteredDelta)}`,
		);
	} else if (rosteredDelta > 0.1) {
		warningReasons.push(
			`rostered per-30 midpoint cap delta is ${pct(rosteredDelta)}`,
		);
	}
	if (top15Delta > 0.15) {
		unsafeReasons.push(`top15 per-30 midpoint cap delta is ${pct(top15Delta)}`);
	} else if (top15Delta > 0.1) {
		warningReasons.push(
			`top15 per-30 midpoint cap delta is ${pct(top15Delta)}`,
		);
	}
	if (highEntrants.length > 45) {
		unsafeReasons.push(
			`HIGH_END_ROTATION count is ${highEntrants.length} (>45)`,
		);
	} else if (highEntrants.length > 30) {
		warningReasons.push(
			`HIGH_END_ROTATION count is ${highEntrants.length} (>30)`,
		);
	}
	if (minimumToHighEnd > 20) {
		unsafeReasons.push(
			`MINIMUM_LEVEL -> HIGH_END_ROTATION is ${minimumToHighEnd} (>20)`,
		);
	} else if (minimumToHighEnd > 10) {
		warningReasons.push(
			`MINIMUM_LEVEL -> HIGH_END_ROTATION is ${minimumToHighEnd} (>10)`,
		);
	}
	if (allActiveUpgraded > 80) {
		warningReasons.push(
			`all-active upgraded count is ${allActiveUpgraded} (>80)`,
		);
	}
	const safety = {
		verdict:
			unsafeReasons.length > 0
				? "unsafe"
				: warningReasons.length > 0
					? "inconclusive"
					: "safe",
		reasons:
			unsafeReasons.length > 0 || warningReasons.length > 0
				? [...unsafeReasons, ...warningReasons]
				: [
						"no safety tripwire fired; still only a calibration dry-run, not implementation approval",
					],
		allActiveUpgraded,
		minimumToHighEnd,
		rosteredPer30DeltaText: pct(rosteredDelta),
		top15Per30DeltaText: pct(top15Delta),
	};

	writeReports({
		distribution: distributionForCsv,
		transitions: transitionsForCsv,
		capBudget,
		labeledEval,
		laneHits: laneRows,
		poolRows: rows,
		safety,
	});

	console.log(`Wrote ${distributionPath}`);
	console.log(`Wrote ${transitionPath}`);
	console.log(`Wrote ${capBudgetPath}`);
	console.log(`Wrote ${labeledEvalPath}`);
	console.log(`Wrote ${laneHitsPath}`);
	console.log(`Wrote ${summaryPath}`);
	console.log(`Wrote ${rulesPath}`);
	console.log(`Wrote ${analysisPackPath}`);
	console.log(
		JSON.stringify(
			{
				allActive: rows.length,
				highEndRotationEntrants: highEntrants.length,
				allActiveUpgraded,
				minimumToHighEnd,
				labeledSevere: `${summary.currentSevere}->${summary.candidateSevere}`,
				labeledTooHigh: `${summary.currentTooHigh}->${summary.candidateTooHigh}`,
				verdict: safety.verdict,
			},
			null,
			2,
		),
	);
};

main();
