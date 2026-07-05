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

const paths = {
	distribution: path.join(outDir, "distribution.csv"),
	transition: path.join(outDir, "transition_matrix.csv"),
	capBudget: path.join(outDir, "cap_budget.csv"),
	labeledEval: path.join(outDir, "labeled_eval.csv"),
	laneHits: path.join(outDir, "lane_hits.csv"),
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
const SOLID_STARTER_RANGE = { minPct: 0.12, maxPct: 0.17 };

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
	const grouped = new Map();
	for (const row of rows) {
		const key = keyFn(row);
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key).push(row);
	}
	return [...grouped.entries()];
};
const signal = (label, passed, weight = 1) => ({ label, passed, weight });
const supportScore = (entries) =>
	entries
		.filter((entry) => entry.passed)
		.reduce((total, entry) => total + entry.weight, 0);
const supportLabels = (entries) =>
	entries.filter((entry) => entry.passed).map((entry) => entry.label);
const boolText = (value) => (value ? "yes" : "no");

const roleSignals = (row) => [
	signal(
		"starter-like role: starterShare >= .45",
		num(row, "starterShare", 0) >= 0.45,
	),
	signal("starter-like role: GS >= 30", num(row, "GS", 0) >= 30),
	signal("very high minutes: MPG >= 29", num(row, "MPG", 0) >= 29),
];

const productionSignals = (row) => [
	signal("production: EWA >= 3", num(row, "EWA", 0) >= 3),
	signal("production: VORP >= .5", num(row, "VORP", -99) >= 0.5),
	signal("production: BPM >= 0", num(row, "BPM", -99) >= 0),
	signal("production: PER >= 14", num(row, "PER", 0) >= 14),
];

const extraSignals = (row) => [
	signal("extra: BPM >= 1", num(row, "BPM", -99) >= 1),
	signal("extra: EWA >= 5", num(row, "EWA", 0) >= 5),
	signal("extra: VORP >= 1", num(row, "VORP", -99) >= 1),
	signal("extra: PER >= 16", num(row, "PER", 0) >= 16),
	signal(
		"extra: defense/rebounding/connector support",
		supportScore([
			signal("defense interior", num(row, "comp_defenseInterior", 0) >= 0.62),
			signal("defense perimeter", num(row, "comp_defensePerimeter", 0) >= 0.62),
			signal("rebounding", num(row, "comp_rebounding", 0) >= 0.62),
			signal("blocking", num(row, "comp_blocking", 0) >= 0.62),
			signal("passing", num(row, "comp_passing", 0) >= 0.58, 0.75),
			signal(
				"positive impact stat",
				num(row, "BPM", -99) >= 0.5 || num(row, "VORP", -99) >= 0.8,
				0.75,
			),
		]) >= 2,
	),
	signal(
		"extra: shooting/spacing support",
		num(row, "comp_shootingThreePointer", 0) >= 0.64 &&
			num(row, "skill_3_margin", -1) >= 0.04 &&
			num(row, "TS", 0) >= 0.54,
	),
	signal(
		"extra: age <= 27 with value/pot support",
		num(row, "age", 99) <= 27 &&
			(num(row, "value", 0) >= 58 || num(row, "pot", 0) >= 65),
	),
];

const solidStarterCheck = (row, currentTier) => {
	const failReasons = [];
	const eligible =
		currentTier === "LOW_END_STARTER" ||
		(currentTier === "VETERAN_ROTATION_GUARD" &&
			num(row, "MPG", 0) >= 28 &&
			(num(row, "starterShare", 0) >= 0.35 || num(row, "GS", 0) >= 20));
	if (!eligible) {
		failReasons.push(
			currentTier === "YOUNG_UPSIDE_SUSPECT"
				? "current YOUNG_UPSIDE_SUSPECT blocked in 1B"
				: `current tier ${currentTier} not eligible`,
		);
	}
	if (
		["YOUNG_PROVEN_STARTER", "STAR_NEAR_MAX", "SUPERSTAR_MAX"].includes(
			currentTier,
		)
	) {
		failReasons.push("protected current young/star tier");
	}
	if (num(row, "GP", 0) < 50) failReasons.push("GP < 50");
	if (num(row, "MPG", 0) < 26) failReasons.push("MPG < 26");
	if (num(row, "valueNoPot", 0) < 57) failReasons.push("valueNoPot < 57");
	if (num(row, "getContractValue", 0) < 57)
		failReasons.push("contractValue < 57");
	if (num(row, "PER", 12) < 10 && num(row, "BPM", 0) < -2) {
		failReasons.push("PER < 10 and BPM < -2");
	}

	const role = roleSignals(row);
	const production = productionSignals(row);
	const extra = extraSignals(row);
	const rolePassed = role.some((entry) => entry.passed);
	const valuePassed =
		num(row, "valueNoPot", 0) >= 57 && num(row, "getContractValue", 0) >= 57;
	const productionPassed = production.some((entry) => entry.passed);
	const extraPassed = extra.some((entry) => entry.passed);
	if (!rolePassed) failReasons.push("missing required role core");
	if (!valuePassed) failReasons.push("missing required value core");
	if (!productionPassed)
		failReasons.push("missing required production support");
	if (!extraPassed) failReasons.push("missing extra support");

	const passedSignals = [
		...supportLabels(role),
		valuePassed ? "value core: valueNoPot >= 57 and contractValue >= 57" : "",
		...supportLabels(production),
		...supportLabels(extra),
	].filter(Boolean);

	return {
		passed: failReasons.length === 0,
		failReasons,
		hardFloorPassed:
			eligible &&
			num(row, "GP", 0) >= 50 &&
			num(row, "MPG", 0) >= 26 &&
			num(row, "valueNoPot", 0) >= 57 &&
			num(row, "getContractValue", 0) >= 57 &&
			!(num(row, "PER", 12) < 10 && num(row, "BPM", 0) < -2),
		rolePassed,
		valuePassed,
		productionPassed,
		extraPassed,
		roleSignals: supportLabels(role),
		productionSignals: supportLabels(production),
		extraSignals: supportLabels(extra),
		passedSignals,
		reason: [
			"V3-1B SOLID_STARTER bridge: eligible current starter tier + required role/value/production + extra support",
			`role: ${supportLabels(role).join("; ") || "none"}`,
			`production: ${supportLabels(production).join("; ") || "none"}`,
			`extra: ${supportLabels(extra).join("; ") || "none"}`,
		].join(" | "),
	};
};

const candidateScoreTier = (row) => {
	const current = scoreTier(row);
	const lane = solidStarterCheck(row, current.tier);
	if (lane.passed) {
		return {
			tier: "SOLID_STARTER",
			reason: lane.reason,
			passedSignals: lane.passedSignals,
			failReasons: [],
			lane,
		};
	}
	return {
		tier: current.tier,
		reason: `kept current scoreTier (${current.tier}); SOLID_STARTER failed: ${lane.failReasons.join("; ")}`,
		passedSignals: [],
		failReasons: lane.failReasons,
		lane,
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
	const min = Math.max(
		row.minContractForPlayer,
		attrs.salaryCap * SOLID_STARTER_RANGE.minPct,
	);
	const max = Math.max(min, attrs.salaryCap * SOLID_STARTER_RANGE.maxPct);
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
			key: `v3-1b-solid-starter-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries: entries,
	});
	return {
		attrs,
		rows: rows.map((row) => {
			const current = scoreTier(row);
			const candidate = candidateScoreTier(row);
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
				moveDirection: move.direction,
				moveSteps: move.steps,
				laneHardFloorPassed: candidate.lane.hardFloorPassed ? "yes" : "no",
				laneRolePassed: candidate.lane.rolePassed ? "yes" : "no",
				laneValuePassed: candidate.lane.valuePassed ? "yes" : "no",
				laneProductionPassed: candidate.lane.productionPassed ? "yes" : "no",
				laneExtraPassed: candidate.lane.extraPassed ? "yes" : "no",
			};
		}),
	};
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
	const tierField = model === "current" ? "currentTier" : "candidateTier";
	return TIERS.map((tier) => {
		const tierRows = rows.filter((row) => row[tierField] === tier);
		return {
			pool,
			model,
			tier,
			count: tierRows.length,
			percentage: rows.length ? tierRows.length / rows.length : 0,
			percentageText: pct(rows.length ? tierRows.length / rows.length : 0),
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
	return groupRows(rows, (row) => `${row.currentTier}||${row.candidateTier}`)
		.map(([key, groupedRows]) => {
			const [currentTier, candidateTier] = key.split("||");
			const move = tierMove(currentTier, candidateTier);
			const pctOfCurrent =
				groupedRows.length /
				(currentCounts.get(currentTier) ?? groupedRows.length);
			return {
				pool,
				currentTier,
				candidateTier,
				count: groupedRows.length,
				percentageOfCurrentTier: round(pctOfCurrent, 6),
				percentageOfCurrentTierText: pct(pctOfCurrent),
				moveDirection: move.direction,
				moveSteps: move.steps,
				focusTransition: boolText(
					candidateTier === "SOLID_STARTER" ||
						(currentTier === "YOUNG_PROVEN_STARTER" &&
							candidateTier !== currentTier),
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
	const capForRow = (row) => {
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
		const caps = tierRows.map(capForRow);
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
	const allCaps = rows.map(capForRow);
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

const labeledEvalRows = ({ labeledRows, poolByPid, attrs }) =>
	labeledRows.map((label) => {
		const row = poolByPid.get(Number(label.pid));
		const candidate = candidateScoreTier(row);
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

const pct100 = (value, digits = 3) =>
	Number.isFinite(value) ? round(value * 100, digits) : "";

const writeRules = () => {
	const md = `# V3-1B SOLID_STARTER dry-run rules

Scope: artifact-only first-layer ablation. This tests one candidate-only tier, \`SOLID_STARTER\`, mapped to 12%-17% cap. It does not modify \`src/\`, formal \`scoreTier\`, formal \`MODEL_TIERS\`, sandbox v2, existing v1/v2 score CSVs, or sampling.

## Preserved current tiers

All current \`scoreTier\` tiers are preserved unless a player passes the candidate-only \`SOLID_STARTER\` gate. This run does not enable 1A \`HIGH_END_ROTATION\`, does not create \`HIGH_IMPACT_STARTER\`, does not relax \`LOW_END_STARTER\`, and does not relax \`LOW_ROTATION_PLUS\`.

## SOLID_STARTER gate

Eligible pool:

- current tier must be \`LOW_END_STARTER\`; or
- narrowly \`VETERAN_ROTATION_GUARD\` with MPG >= 28 and starterShare >= .35 or GS >= 20.

Blocked by design:

- current \`MINIMUM_LEVEL\`
- current \`LOW_ROTATION_PLUS\`
- current \`YOUNG_UPSIDE_SUSPECT\`
- current \`YOUNG_PROVEN_STARTER\`, \`STAR_NEAR_MAX\`, \`SUPERSTAR_MAX\`

Hard floor:

- GP >= 50
- MPG >= 26
- valueNoPot >= 57
- getContractValue >= 57
- not (PER < 10 and BPM < -2)

Required groups:

- role core: starterShare >= .45, GS >= 30, or MPG >= 29
- value core: valueNoPot >= 57 and getContractValue >= 57
- production support: EWA >= 3, VORP >= .5, BPM >= 0, or PER >= 14
- extra support: BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16, defense/rebounding/connector support, shooting/spacing support, or age <= 27 with value/pot support

No human labels, trade value, pid, name, or caseId are used as rule inputs.
`;
	fs.writeFileSync(paths.rules, md);
};

const safetyVerdict = ({ rows, capBudget, labeledEval }) => {
	const summary = evalSummary(labeledEval);
	const solidEntrants = rows.filter(
		(row) => row.candidateTier === "SOLID_STARTER",
	);
	const minToSolid = count(
		rows,
		(row) =>
			row.currentTier === "MINIMUM_LEVEL" &&
			row.candidateTier === "SOLID_STARTER",
	);
	const youngUpsideToSolid = count(
		rows,
		(row) =>
			row.currentTier === "YOUNG_UPSIDE_SUSPECT" &&
			row.candidateTier === "SOLID_STARTER",
	);
	const lowEndToSolid = count(
		rows,
		(row) =>
			row.currentTier === "LOW_END_STARTER" &&
			row.candidateTier === "SOLID_STARTER",
	);
	const findTotal = (pool, model) =>
		capBudget.find(
			(row) =>
				row.pool === pool && row.model === model && row.tier === "__TOTAL__",
		);
	const rosteredDelta =
		findTotal("rostered_active", "V3-1B").deltaTotalMidpointCapPctVsCurrent /
		30;
	const top15Delta =
		findTotal("top15_roster_proxy", "V3-1B").deltaTotalMidpointCapPctVsCurrent /
		30;
	const unsafe = [];
	const warnings = [];
	if (summary.candidateSevere > summary.currentSevere)
		unsafe.push(
			`labeled severe increased ${summary.currentSevere} -> ${summary.candidateSevere}`,
		);
	if (summary.candidateTooHigh > summary.currentTooHigh + 3)
		unsafe.push(
			`labeled too_high increased materially ${summary.currentTooHigh} -> ${summary.candidateTooHigh}`,
		);
	else if (summary.candidateTooHigh > summary.currentTooHigh)
		warnings.push(
			`labeled too_high increased ${summary.currentTooHigh} -> ${summary.candidateTooHigh}`,
		);
	if (solidEntrants.length > 45)
		unsafe.push(`SOLID_STARTER count is ${solidEntrants.length} (>45)`);
	else if (solidEntrants.length > 30)
		warnings.push(`SOLID_STARTER count is ${solidEntrants.length} (>30)`);
	if (lowEndToSolid > 35)
		warnings.push(`LOW_END_STARTER -> SOLID_STARTER is ${lowEndToSolid} (>35)`);
	if (minToSolid > 0)
		unsafe.push(
			`MINIMUM_LEVEL -> SOLID_STARTER is ${minToSolid}; tripwire requires 0`,
		);
	if (youngUpsideToSolid > 0)
		unsafe.push(
			`YOUNG_UPSIDE_SUSPECT -> SOLID_STARTER is ${youngUpsideToSolid}; default should be 0`,
		);
	if (rosteredDelta > 0.15)
		unsafe.push(`rostered per-30 midpoint cap delta is ${pct(rosteredDelta)}`);
	else if (rosteredDelta > 0.1)
		warnings.push(
			`rostered per-30 midpoint cap delta is ${pct(rosteredDelta)}`,
		);
	if (top15Delta > 0.15)
		unsafe.push(`top15 per-30 midpoint cap delta is ${pct(top15Delta)}`);
	else if (top15Delta > 0.1)
		warnings.push(`top15 per-30 midpoint cap delta is ${pct(top15Delta)}`);
	return {
		verdict:
			unsafe.length > 0
				? "unsafe"
				: warnings.length > 0
					? "inconclusive"
					: "safe",
		reasons:
			unsafe.length > 0 || warnings.length > 0
				? [...unsafe, ...warnings]
				: [
						"no safety tripwire fired; still a calibration dry-run, not implementation approval",
					],
		solidEntrants: solidEntrants.length,
		allActiveUpgraded: count(rows, (row) => row.moveDirection === "up"),
		minToSolid,
		youngUpsideToSolid,
		lowEndToSolid,
		rosteredPer30DeltaText: pct(rosteredDelta),
		top15Per30DeltaText: pct(top15Delta),
	};
};

const writeReports = ({
	distribution,
	transitions,
	capBudget,
	labeledEval,
	laneHits,
	rows,
	safety,
}) => {
	const summary = evalSummary(labeledEval);
	const solidEntrants = rows.filter(
		(row) => row.candidateTier === "SOLID_STARTER",
	);
	const labeledSolid = labeledEval.filter(
		(row) => row.candidateTier === "SOLID_STARTER",
	);
	const allCurrent = distribution.filter(
		(row) =>
			row.pool === "all_active" && row.model === "current" && row.count > 0,
	);
	const allCandidate = distribution.filter(
		(row) =>
			row.pool === "all_active" && row.model === "V3-1B" && row.count > 0,
	);
	const topTransitions = transitions
		.filter(
			(row) =>
				row.pool === "all_active" && row.currentTier !== row.candidateTier,
		)
		.sort((a, b) => b.count - a.count)
		.slice(0, 15);
	const focusTransitionCounts = laneHits.filter(
		(row) => row.section === "focus_transition_count",
	);
	const capTotals = capBudget.filter((row) => row.tier === "__TOTAL__");

	const distributionTable = (rowsIn) =>
		markdownTable(rowsIn, [
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
	const labeledSolidTable = markdownTable(
		labeledSolid.map((row) => ({
			dataset: row.dataset,
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
			{ key: "dataset", label: "dataset" },
			{ key: "caseId", label: "case" },
			{ key: "bucket", label: "bucket" },
			{ key: "human", label: "human" },
			{ key: "currentTier", label: "current tier" },
			{ key: "currentPoint", label: "current point" },
			{ key: "candidatePoint", label: "1B point" },
			{ key: "candidateDirection", label: "1B dir" },
			{ key: "deltaGap", label: "delta gap" },
			{ key: "signals", label: "signals" },
		],
	);
	const futureNote =
		"Future research note: E-01 raised a small-guard positive-defense BPM reliability question. Do not fix it in 1B; separately audit whether small guards around 183cm with positive DBPM/BPM should receive full defensive credit in contract asks.";

	const summaryMd = `# V3-1B SOLID_STARTER dry-run

This is an artifact-only ablation. It tests only one candidate-only lane, \`SOLID_STARTER\` at 12%-17% cap. It does not modify \`src/\`, formal \`scoreTier\`, formal \`MODEL_TIERS\`, sandbox v2, existing score CSVs, or sampling.

## Safety verdict

Verdict: **${safety.verdict}**.

Reasons:

${safety.reasons.map((reason) => `- ${reason}`).join("\n")}

Tripwire read:

- all-active upgraded: ${safety.allActiveUpgraded}
- all-active SOLID_STARTER entrants: ${safety.solidEntrants}
- LOW_END_STARTER -> SOLID_STARTER: ${safety.lowEndToSolid}
- MINIMUM_LEVEL -> SOLID_STARTER: ${safety.minToSolid}
- YOUNG_UPSIDE_SUSPECT -> SOLID_STARTER: ${safety.youngUpsideToSolid}
- rostered mid-cap per 30 teams delta: ${safety.rosteredPer30DeltaText}
- top15 mid-cap per 30 teams delta: ${safety.top15Per30DeltaText}
- labeled severe: ${summary.currentSevere} -> ${summary.candidateSevere}
- labeled too_high: ${summary.currentTooHigh} -> ${summary.candidateTooHigh}

## Current vs V3-1B distribution

Current all-active:

${distributionTable(allCurrent)}

V3-1B all-active:

${distributionTable(allCandidate)}

Full four-pool distribution is in \`distribution.csv\`.

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

SOLID_STARTER entrants: ${solidEntrants.length}.

${markdownTable(
	laneHits.filter((row) => row.section === "entrants_by_current_tier"),
	[
		{ key: "currentTier", label: "current tier" },
		{ key: "count", label: "count" },
		{ key: "percentage", label: "% of entrants" },
	],
)}

Signal pass counts and combinations are in \`lane_hits.csv\`.

## Cap-budget sanity

${capTotalTable}

This does not require <=100%. Teams can operate over the cap and all-active is not formal payroll. The read is relative to current baseline.

## Labeled 48 downstream eval

| metric | current v2 | V3-1B |
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

## Labeled SOLID_STARTER attribution

${labeledSolid.length === 0 ? "No labeled cases entered SOLID_STARTER." : labeledSolidTable}

Labeled SOLID_STARTER aggregate:

- count: ${labeledSolid.length}
- improved: ${count(labeledSolid, (row) => row.deltaGapM < -0.1)}
- worsened: ${count(labeledSolid, (row) => row.deltaGapM > 0.1)}
- fixed severe: ${count(labeledSolid, (row) => row.severeFixed === "yes")}
- new severe: ${count(labeledSolid, (row) => row.newSevere === "yes")}
- too_low fixed: ${count(labeledSolid, (row) => row.tooLowFixed === "yes")}
- too_high added: ${count(labeledSolid, (row) => row.tooHighAdded === "yes")}

## Future research note

${futureNote}

## Read

V3-1B is deliberately narrower than candidate_0. It does not enable 1A \`HIGH_END_ROTATION\`, does not create \`HIGH_IMPACT_STARTER\`, does not relax \`LOW_END_STARTER\`, and blocks current \`MINIMUM_LEVEL\`, \`LOW_ROTATION_PLUS\`, and \`YOUNG_UPSIDE_SUSPECT\` from direct SOLID_STARTER jumps.
`;

	const analysisPackMd = `# V3-1B SOLID_STARTER analysis pack

## One-page summary

- Experiment: one-lane ablation for \`SOLID_STARTER\`.
- Range: 12%-17% cap, dry-run only.
- Entrants: ${solidEntrants.length} all-active.
- Upgrades: ${safety.allActiveUpgraded} all-active.
- LOW_END_STARTER -> SOLID_STARTER: ${safety.lowEndToSolid}.
- MINIMUM_LEVEL -> SOLID_STARTER: ${safety.minToSolid}.
- YOUNG_UPSIDE_SUSPECT -> SOLID_STARTER: ${safety.youngUpsideToSolid}.
- Labeled severe: ${summary.currentSevere} -> ${summary.candidateSevere}.
- Labeled too_high: ${summary.currentTooHigh} -> ${summary.candidateTooHigh}.
- Verdict: ${safety.verdict}.

## Exact V3-1B rule

See \`rules.md\`.

## Exact differences vs current scoreTier

The current \`scoreTier\` result is computed first. V3-1B changes only eligible current \`LOW_END_STARTER\` and narrow starter-minutes \`VETERAN_ROTATION_GUARD\` players who pass required role, value, production, and extra-support gates. All other current tiers stay unchanged.

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

## Labeled 48 eval

| metric | current v2 | V3-1B |
| --- | ---: | ---: |
| mean gap | ${round(summary.currentMeanGap, 2)} | ${round(summary.candidateMeanGap, 2)} |
| median gap | ${round(summary.currentMedianGap, 2)} | ${round(summary.candidateMedianGap, 2)} |
| severe | ${summary.currentSevere} | ${summary.candidateSevere} |
| too_low | ${summary.currentTooLow} | ${summary.candidateTooLow} |
| too_high | ${summary.currentTooHigh} | ${summary.candidateTooHigh} |
| candidate better / current better / tie |  | ${summary.candidateBetter} / ${summary.currentBetter} / ${summary.tie} |

## What to inspect next

- Inspect every \`LOW_END_STARTER -> SOLID_STARTER\` entrant in \`lane_hits.csv\` and \`labeled_eval.csv\`.
- Compare V3-1B against V3-1A only after this one-lane result is reviewed.
- Review whether the value core should be 57/57 or slightly higher before any implementation discussion.
- Keep the small-guard positive-defense BPM reliability issue separate from 1B.

## Recommendation

Do not implement directly from this dry-run. Use it as a distribution/cap/labeled calibration artifact for V3 first-layer discussion.
`;

	fs.writeFileSync(paths.summary, summaryMd);
	fs.writeFileSync(paths.analysisPack, analysisPackMd);
};

const main = () => {
	fs.mkdirSync(outDir, { recursive: true });
	const { attrs, rows } = buildRows();
	const pools = poolViews(rows);

	const distribution = pools.flatMap(({ pool, rows: poolRows }) => [
		...distributionRows({ pool, rows: poolRows, model: "current" }),
		...distributionRows({ pool, rows: poolRows, model: "V3-1B" }),
	]);
	writeCsv(distributionPathSafe(), distribution, [
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
	writeCsv(paths.transition, transitions, [
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

	const rawCap = pools.flatMap(({ pool, rows: poolRows }) => [
		...capRows({ pool, rows: poolRows, attrs, model: "current" }),
		...capRows({ pool, rows: poolRows, attrs, model: "V3-1B" }),
	]);
	const currentMid = new Map(
		rawCap
			.filter((row) => row.model === "current")
			.map((row) => [
				`${row.pool}||${row.tier}`,
				row.totalImpliedMidpointCapPct,
			]),
	);
	const capBudget = rawCap.map((row) => {
		const delta =
			row.model === "V3-1B"
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
	writeCsv(
		paths.capBudget,
		capBudget.map((row) => ({
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
	const addLane = (row) =>
		laneRows.push({
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
	const solidEntrants = rows.filter(
		(row) => row.candidateTier === "SOLID_STARTER",
	);
	const hardFloorPass = rows.filter(
		(row) => solidStarterCheck(row, row.currentTier).hardFloorPassed,
	);
	addLane({
		section: "hard_floor",
		count: hardFloorPass.length,
		percentage: hardFloorPass.length / rows.length,
		notes:
			"passes eligibility + GP/MPG/value/production hard floor before required group checks",
	});
	for (const [reason, subset] of groupRows(
		rows.flatMap((row) =>
			solidStarterCheck(row, row.currentTier).failReasons.map((reason) => ({
				reason,
			})),
		),
		(row) => row.reason,
	).sort((a, b) => b[1].length - a[1].length)) {
		addLane({
			section: "hard_veto_or_group_fail_reason",
			signalOrCombination: reason,
			count: subset.length,
			percentage: subset.length / rows.length,
		});
	}
	for (const [tier, subset] of groupRows(
		solidEntrants,
		(row) => row.currentTier,
	)) {
		addLane({
			section: "entrants_by_current_tier",
			currentTier: tier,
			candidateTier: "SOLID_STARTER",
			count: subset.length,
			percentage: solidEntrants.length
				? subset.length / solidEntrants.length
				: 0,
		});
	}
	for (const { pool, rows: poolRows } of pools) {
		const subset = poolRows.filter(
			(row) => row.candidateTier === "SOLID_STARTER",
		);
		addLane({
			section: "entrants_by_pool",
			pool,
			count: subset.length,
			percentage: poolRows.length ? subset.length / poolRows.length : 0,
		});
	}
	const allSignalLabels = [
		...roleSignals(rows[0]).map((entry) => entry.label),
		"value core: valueNoPot >= 57 and contractValue >= 57",
		...productionSignals(rows[0]).map((entry) => entry.label),
		...extraSignals(rows[0]).map((entry) => entry.label),
	];
	for (const label of allSignalLabels) {
		const n = count(solidEntrants, (row) =>
			row.candidatePassedSignals.split("; ").includes(label),
		);
		addLane({
			section: "entrant_signal_pass_count",
			signalOrCombination: label,
			count: n,
			percentage: solidEntrants.length ? n / solidEntrants.length : 0,
		});
	}
	for (const [combo, subset] of groupRows(
		solidEntrants,
		(row) => row.candidatePassedSignals || "(no signals)",
	).sort((a, b) => b[1].length - a[1].length)) {
		addLane({
			section: "signal_combination",
			signalOrCombination: combo,
			count: subset.length,
			percentage: solidEntrants.length
				? subset.length / solidEntrants.length
				: 0,
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
		addLane({
			section: "focus_transition_count",
			currentTier: tier,
			candidateTier: "SOLID_STARTER",
			count: subset.length,
			percentage: total ? subset.length / total : 0,
			notes: `${subset.length} of ${total} current ${tier}`,
		});
	}

	const labeledRows = loadLabeledRows();
	const poolByPid = new Map(rows.map((row) => [Number(row.pid), row]));
	const labeledEval = labeledEvalRows({ labeledRows, poolByPid, attrs });
	const labeledSolid = labeledEval.filter(
		(row) => row.candidateTier === "SOLID_STARTER",
	);
	addLane({
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
		addLane({
			section: "labeled_solid_case",
			currentTier: row.currentTier,
			candidateTier: row.candidateTier,
			signalOrCombination: row.candidatePassedSignals,
			count: 1,
			notes: `${row.dataset} ${row.caseId}; human ${row.humanRangeText}; current point ${row.currentV2PointM}; candidate point ${row.candidatePointM}; ${row.candidateDirection}; ${row.candidateReason}`,
		});
	}
	writeCsv(paths.laneHits, laneRows, [
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

	writeCsv(paths.labeledEval, labeledEval, [
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
	const safety = safetyVerdict({ rows, capBudget, labeledEval });
	writeReports({
		distribution,
		transitions,
		capBudget,
		labeledEval,
		laneHits: laneRows,
		rows,
		safety,
	});

	const summary = evalSummary(labeledEval);
	console.log(`Wrote ${paths.distribution}`);
	console.log(`Wrote ${paths.transition}`);
	console.log(`Wrote ${paths.capBudget}`);
	console.log(`Wrote ${paths.labeledEval}`);
	console.log(`Wrote ${paths.laneHits}`);
	console.log(`Wrote ${paths.summary}`);
	console.log(`Wrote ${paths.rules}`);
	console.log(`Wrote ${paths.analysisPack}`);
	console.log(
		JSON.stringify(
			{
				allActive: rows.length,
				solidStarterEntrants: safety.solidEntrants,
				allActiveUpgraded: safety.allActiveUpgraded,
				lowEndToSolid: safety.lowEndToSolid,
				minimumToSolid: safety.minToSolid,
				youngUpsideToSolid: safety.youngUpsideToSolid,
				labeledSevere: `${summary.currentSevere}->${summary.candidateSevere}`,
				labeledTooHigh: `${summary.currentTooHigh}->${summary.candidateTooHigh}`,
				verdict: safety.verdict,
			},
			null,
			2,
		),
	);
};

const distributionPathSafe = () => paths.distribution;

main();
