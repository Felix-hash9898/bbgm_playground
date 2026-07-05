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
	scoreTier,
	tierRange,
} from "./contract-market-tier-score.mjs";
import { scoreContractMarketV2 } from "./contract-market-sandbox-v2.mjs";

const root = process.cwd();
const artifactsDir = path.join(root, "contract_market_artifacts");
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);

const currentDistributionPath = path.join(
	artifactsDir,
	"contract_market_scoretier_current_distribution.csv",
);
const candidateDistributionPath = path.join(
	artifactsDir,
	"contract_market_scoretier_candidate_distribution.csv",
);
const transitionMatrixPath = path.join(
	artifactsDir,
	"contract_market_scoretier_transition_matrix.csv",
);
const labeledEvalPath = path.join(
	artifactsDir,
	"contract_market_scoretier_candidate_labeled_eval.csv",
);
const dryRunMdPath = path.join(
	artifactsDir,
	"contract_market_scoretier_candidate_dryrun.md",
);
const rulesMdPath = path.join(
	root,
	"temp/contract_market_scoretier_candidate_rules.md",
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

const CANDIDATE_TIERS = [
	"SUPERSTAR_MAX",
	"STAR_NEAR_MAX",
	"HIGH_IMPACT_STARTER",
	"YOUNG_PROVEN_STARTER",
	"SOLID_STARTER",
	"HIGH_END_ROTATION",
	"LOW_END_STARTER",
	"SPECIALIST_ROTATION",
	"YOUNG_UPSIDE_SUSPECT",
	"VETERAN_ROTATION_GUARD",
	"LOW_ROTATION_PLUS",
	"VETERAN_MINIMUM_PLUS",
	"MINIMUM_LEVEL",
];

const TIER_RANK = Object.fromEntries(
	CANDIDATE_TIERS.map((tier, index) => [tier, index]),
);

const TEMP_TIERS = {
	HIGH_IMPACT_STARTER: {
		rangeType: "capPct",
		minPct: 0.17,
		maxPct: 0.225,
	},
	SOLID_STARTER: {
		rangeType: "capPct",
		minPct: 0.12,
		maxPct: 0.17,
	},
	HIGH_END_ROTATION: {
		rangeType: "capPct",
		minPct: 0.07,
		maxPct: 0.12,
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

const hasPos = (row, token) => String(row.pos ?? "").includes(token);

const isGuard = (row) => hasPos(row, "G");

const isBig = (row) => hasPos(row, "C") || hasPos(row, "F");

const supportScore = (entries) =>
	entries
		.filter((entry) => entry.passed)
		.reduce((sum, entry) => sum + entry.weight, 0);

const supportLabels = (entries) =>
	entries.filter((entry) => entry.passed).map((entry) => entry.label);

const makeSignal = (label, passed, weight = 1) => ({ label, passed, weight });

const hardVeto = (
	row,
	{ minMpg = 0, minGp = 0, minValueNoPot = 0, allowLowEfficiency = true } = {},
) => {
	const vetoes = [];
	if (num(row, "GP", 0) < minGp) vetoes.push(`GP < ${minGp}`);
	if (num(row, "MPG", 0) < minMpg) vetoes.push(`MPG < ${minMpg}`);
	if (num(row, "valueNoPot", 0) < minValueNoPot) {
		vetoes.push(`valueNoPot < ${minValueNoPot}`);
	}
	if (num(row, "PER", 12) < 8 && num(row, "BPM", 0) < -3) {
		vetoes.push("PER/BPM extreme poor production");
	}
	if (
		!allowLowEfficiency &&
		num(row, "TS", 0.55) < 0.49 &&
		num(row, "OBPM", 0) < -2
	) {
		vetoes.push("low TS and negative OBPM");
	}
	return vetoes;
};

const establishedStarterLike = (row) =>
	num(row, "GP", 0) >= 45 &&
	num(row, "MPG", 0) >= 24 &&
	(num(row, "starterShare", 0) >= 0.4 || num(row, "GS", 0) >= 25);

const fullStarterLike = (row) =>
	num(row, "GP", 0) >= 50 &&
	num(row, "MPG", 0) >= 28 &&
	num(row, "starterShare", 0) >= 0.65;

const productiveImpact = (row) =>
	num(row, "EWA", 0) >= 5 ||
	num(row, "VORP", -99) >= 1 ||
	num(row, "BPM", -99) >= 1.5 ||
	(num(row, "PER", 0) >= 17 && num(row, "MPG", 0) >= 20);

const rotationRole = (row) =>
	num(row, "GP", 0) >= 35 && num(row, "MPG", 0) >= 16;

const strongRotationRole = (row) =>
	num(row, "GP", 0) >= 45 && num(row, "MPG", 0) >= 20;

const portableShootingSignals = (row) => [
	makeSignal(
		"3pt composite",
		num(row, "comp_shootingThreePointer", 0) >= 0.64,
		1,
	),
	makeSignal("3 skill margin", num(row, "skill_3_margin", -1) >= 0.04, 1),
	makeSignal("TS >= .55", num(row, "TS", 0) >= 0.55, 1),
	makeSignal("role minutes", num(row, "MPG", 0) >= 16, 1),
	makeSignal(
		"usage/volume",
		num(row, "USG", 0) >= 16 || num(row, "PTS", 0) >= 10,
		0.75,
	),
];

const defenseConnectorSignals = (row) => [
	makeSignal(
		"defense composite",
		Math.max(
			num(row, "comp_defenseInterior", 0),
			num(row, "comp_defensePerimeter", 0),
		) >= 0.62,
		1,
	),
	makeSignal(
		"rebound/block composite",
		Math.max(num(row, "comp_rebounding", 0), num(row, "comp_blocking", 0)) >=
			0.62,
		1,
	),
	makeSignal(
		"BPM/VORP support",
		num(row, "BPM", -99) >= 1 || num(row, "VORP", -99) >= 1,
		1,
	),
	makeSignal(
		"passing connector",
		num(row, "comp_passing", 0) >= 0.58 || num(row, "AST%", 0) >= 18,
		0.75,
	),
	makeSignal("starter/large role", num(row, "MPG", 0) >= 24, 0.75),
];

const creatorScorerSignals = (row) => [
	makeSignal(
		"usage scorer",
		num(row, "USG", 0) >= 22 && num(row, "PTS", 0) >= 13,
		1,
	),
	makeSignal(
		"creator passing",
		num(row, "AST%", 0) >= 18 || num(row, "AST", 0) >= 4,
		1,
	),
	makeSignal(
		"positive offense",
		num(row, "OBPM", -99) >= 0 || num(row, "EWA", 0) >= 3,
		1,
	),
	makeSignal("not inefficient", num(row, "TS", 0.55) >= 0.52, 0.75),
	makeSignal(
		"contract/value support",
		num(row, "getContractValue", 0) >= 54 || num(row, "valueNoPot", 0) >= 54,
		1,
	),
];

const candidateScoreTier = (row) => {
	const current = scoreTier(row);

	if (current.tier === "SUPERSTAR_MAX") {
		return {
			tier: "SUPERSTAR_MAX",
			reason: "kept current strict SUPERSTAR_MAX gate",
			passedSignals: ["current strict superstar gate"],
			hardVetoes: [],
		};
	}
	if (current.tier === "STAR_NEAR_MAX") {
		return {
			tier: "STAR_NEAR_MAX",
			reason: "kept current strict STAR_NEAR_MAX gate",
			passedSignals: ["current strict star/near-max gate"],
			hardVetoes: [],
		};
	}

	const highImpactVeto = hardVeto(row, {
		minMpg: 25,
		minGp: 40,
		minValueNoPot: 55,
		allowLowEfficiency: false,
	});
	const highImpactSignals = [
		makeSignal(
			"full or established starter-like role",
			fullStarterLike(row) || establishedStarterLike(row),
			1.25,
		),
		makeSignal("contractValue >= 60", num(row, "getContractValue", 0) >= 60, 1),
		makeSignal("valueNoPot >= 59", num(row, "valueNoPot", 0) >= 59, 1),
		makeSignal("current impact production", productiveImpact(row), 1),
		makeSignal(
			"non-scoring connector/defense",
			supportScore(defenseConnectorSignals(row)) >= 2.25,
			1,
		),
	];
	if (highImpactVeto.length === 0 && supportScore(highImpactSignals) >= 3.25) {
		return {
			tier: "HIGH_IMPACT_STARTER",
			reason:
				"candidate high-impact starter lane: strong role/value/impact without age hard blocker",
			passedSignals: supportLabels(highImpactSignals),
			hardVetoes: [],
		};
	}

	const youngVeto = hardVeto(row, {
		minMpg: 18,
		minGp: 35,
		minValueNoPot: 50,
	});
	const youngSignals = [
		makeSignal("age <= 26", num(row, "age", 99) <= 26, 1),
		makeSignal(
			"pot >= 65 or premium >= 4",
			num(row, "pot", 0) >= 65 || num(row, "potentialPremium", 0) >= 4,
			1,
		),
		makeSignal(
			"rotation/starter role",
			strongRotationRole(row) || establishedStarterLike(row),
			1,
		),
		makeSignal(
			"contract/value support",
			num(row, "getContractValue", 0) >= 57 || num(row, "value", 0) >= 60,
			1,
		),
		makeSignal(
			"production support",
			productiveImpact(row) || num(row, "EWA", 0) >= 3,
			1,
		),
		makeSignal(
			"portable skill support",
			supportScore(portableShootingSignals(row)) >= 2.75 ||
				supportScore(defenseConnectorSignals(row)) >= 2.5,
			0.75,
		),
	];
	if (youngVeto.length === 0 && supportScore(youngSignals) >= 4.25) {
		return {
			tier: "YOUNG_PROVEN_STARTER",
			reason:
				"candidate young productive starter/large-rotation lane with role and impact support",
			passedSignals: supportLabels(youngSignals),
			hardVetoes: [],
		};
	}

	const solidVeto = hardVeto(row, {
		minMpg: 22,
		minGp: 40,
		minValueNoPot: 53,
	});
	const solidSignals = [
		makeSignal(
			"starter-like role",
			establishedStarterLike(row) || num(row, "MPG", 0) >= 26,
			1.25,
		),
		makeSignal("valueNoPot >= 55", num(row, "valueNoPot", 0) >= 55, 1),
		makeSignal("contractValue >= 54", num(row, "getContractValue", 0) >= 54, 1),
		makeSignal(
			"neutral/positive production",
			num(row, "EWA", 0) >= 2 ||
				num(row, "VORP", -99) >= 0.2 ||
				num(row, "BPM", -99) >= -0.5,
			1,
		),
		makeSignal(
			"non-scoring impact lane",
			supportScore(defenseConnectorSignals(row)) >= 2.5,
			1,
		),
		makeSignal(
			"creator/scorer support",
			supportScore(creatorScorerSignals(row)) >= 2.75,
			0.75,
		),
	];
	if (solidVeto.length === 0 && supportScore(solidSignals) >= 3.75) {
		return {
			tier: "SOLID_STARTER",
			reason:
				"candidate solid starter bridge: starter/current-impact lane between low-end and young-proven",
			passedSignals: supportLabels(solidSignals),
			hardVetoes: [],
		};
	}

	const highRotationVeto = hardVeto(row, {
		minMpg: 16,
		minGp: 35,
		minValueNoPot: 50,
	});
	const highRotationSignals = [
		makeSignal("strong rotation role", strongRotationRole(row), 1),
		makeSignal(
			"creator/scorer lane",
			supportScore(creatorScorerSignals(row)) >= 2.75,
			1,
		),
		makeSignal(
			"young productive rotation",
			num(row, "age", 99) <= 25 &&
				num(row, "MPG", 0) >= 16 &&
				(num(row, "EWA", 0) >= 1.5 || num(row, "BPM", -99) >= -1),
			1,
		),
		makeSignal(
			"portable shooting lane",
			supportScore(portableShootingSignals(row)) >= 3.25,
			1,
		),
		makeSignal(
			"connector/defense lane",
			supportScore(defenseConnectorSignals(row)) >= 2.5,
			1,
		),
		makeSignal(
			"value support",
			num(row, "getContractValue", 0) >= 52 || num(row, "valueNoPot", 0) >= 52,
			1,
		),
	];
	if (
		highRotationVeto.length === 0 &&
		supportScore(highRotationSignals) >= 3.25
	) {
		return {
			tier: "HIGH_END_ROTATION",
			reason:
				"candidate high-end rotation lane: scorer/creator, young productive rotation, connector, or portable shooting with role support",
			passedSignals: supportLabels(highRotationSignals),
			hardVetoes: [],
		};
	}

	const lowStarterVeto = hardVeto(row, {
		minMpg: 20,
		minGp: 35,
		minValueNoPot: 51,
	});
	const lowStarterSignals = [
		makeSignal("role >= 20 MPG", num(row, "MPG", 0) >= 20, 1),
		makeSignal(
			"starterShare/starts support",
			num(row, "starterShare", 0) >= 0.3 || num(row, "GS", 0) >= 15,
			1,
		),
		makeSignal("valueNoPot >= 52", num(row, "valueNoPot", 0) >= 52, 1),
		makeSignal("contractValue >= 52", num(row, "getContractValue", 0) >= 52, 1),
		makeSignal(
			"some production support",
			num(row, "PER", 0) >= 12 ||
				num(row, "EWA", 0) >= 1.5 ||
				num(row, "VORP", -99) >= 0,
			1,
		),
	];
	if (lowStarterVeto.length === 0 && supportScore(lowStarterSignals) >= 3.5) {
		return {
			tier: "LOW_END_STARTER",
			reason:
				"candidate low-end starter lane with softened role entry but value/production vetoes",
			passedSignals: supportLabels(lowStarterSignals),
			hardVetoes: [],
		};
	}

	const specialistSignals = [
		...portableShootingSignals(row),
		makeSignal("valueNoPot >= 50", num(row, "valueNoPot", 0) >= 50, 1),
	];
	if (
		num(row, "GP", 0) >= 35 &&
		num(row, "MPG", 0) >= 10 &&
		supportScore(specialistSignals) >= 3.5
	) {
		return {
			tier: "SPECIALIST_ROTATION",
			reason:
				"candidate portable shooting/specialist lane with role and value support",
			passedSignals: supportLabels(specialistSignals),
			hardVetoes: [],
		};
	}

	const currentFallback = current.tier;
	if (
		[
			"YOUNG_UPSIDE_SUSPECT",
			"VETERAN_ROTATION_GUARD",
			"LOW_ROTATION_PLUS",
			"VETERAN_MINIMUM_PLUS",
		].includes(currentFallback)
	) {
		return {
			tier: currentFallback,
			reason: `kept current ${currentFallback} gate after candidate middle lanes failed`,
			passedSignals: [current.reason],
			hardVetoes: [],
		};
	}

	const lowRotationSignals = [
		makeSignal(
			"real role",
			rotationRole(row) || (num(row, "GP", 0) >= 40 && num(row, "MPG", 0) >= 8),
			1,
		),
		makeSignal("valueNoPot >= 49", num(row, "valueNoPot", 0) >= 49, 1),
		makeSignal(
			"not extreme poor production",
			!(num(row, "PER", 12) < 8 && num(row, "BPM", 0) < -3),
			1,
		),
	];
	if (supportScore(lowRotationSignals) >= 2.5) {
		return {
			tier: "LOW_ROTATION_PLUS",
			reason:
				"candidate low-rotation fallback with real role and no extreme production veto",
			passedSignals: supportLabels(lowRotationSignals),
			hardVetoes: [],
		};
	}

	return {
		tier: "MINIMUM_LEVEL",
		reason:
			"candidate fallback minimum after middle lanes and low-rotation checks failed",
		passedSignals: [],
		hardVetoes: hardVeto(row, { minMpg: 8, minGp: 25, minValueNoPot: 49 }),
	};
};

const rangeForTier = (tier, row, attrs) => {
	if (!TEMP_TIERS[tier]) {
		const range = tierRange(tier, row, attrs);
		return {
			minM: range.modelRangeMin / 1000,
			maxM: range.modelRangeMax / 1000,
			text: range.modelRangeText,
			years: range.modelYears,
		};
	}
	const spec = TEMP_TIERS[tier];
	const min = Math.max(row.minContractForPlayer, attrs.salaryCap * spec.minPct);
	const max = Math.max(min, attrs.salaryCap * spec.maxPct);
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

const buildPoolRows = ({ save, attrs }) => {
	const activeEntries = save.players
		.filter(
			(player) =>
				player.tid >= -1 && player.stats?.some((stats) => !stats.playoffs),
		)
		.map((player) => ({
			key: `candidate-dryrun-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { rows } = buildProxyRows({
		root,
		save,
		anchorEntries: activeEntries,
	});
	return rows.map((row) => {
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
			candidateHardVetoes: candidate.hardVetoes.join("; "),
			moveDirection: move.direction,
			moveSteps: move.steps,
		};
	});
};

const poolViews = (rows) => [
	{ pool: "all_active", rows },
	{
		pool: "contract_relevant",
		rows: rows.filter((row) => row.contractRelevant === "yes"),
	},
];

const distributionRows = ({ pool, rows, tierField }) => {
	const total = rows.length;
	return CANDIDATE_TIERS.map((tier) => {
		const tierRows = rows.filter((row) => row[tierField] === tier);
		return {
			pool,
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
	const grouped = new Map();
	for (const row of rows) {
		const key = `${row.currentTier}||${row.candidateTier}`;
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key).push(row);
	}
	const currentCounts = new Map();
	for (const row of rows) {
		currentCounts.set(
			row.currentTier,
			(currentCounts.get(row.currentTier) ?? 0) + 1,
		);
	}
	return [...grouped.entries()]
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
				netUpwardMoves: count(groupedRows, (row) => row.moveDirection === "up"),
				netDownwardMoves: count(
					groupedRows,
					(row) => row.moveDirection === "down",
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

const bucketBand = (row) => {
	const age = num(row, "age", 0);
	const mpg = num(row, "MPG", 0);
	const value = num(row, "valueNoPot", 0);
	return {
		posBand: isGuard(row) ? "guard" : isBig(row) ? "frontcourt" : "wing/other",
		ageBand:
			age <= 23 ? "age<=23" : age <= 27 ? "24-27" : age <= 31 ? "28-31" : "32+",
		mpgBand:
			mpg < 10
				? "<10 MPG"
				: mpg < 18
					? "10-18 MPG"
					: mpg < 26
						? "18-26 MPG"
						: "26+ MPG",
		valueBand:
			value < 50
				? "valueNoPot<50"
				: value < 55
					? "50-55"
					: value < 60
						? "55-60"
						: "60+",
	};
};

const movementSummaryRows = ({ pool, rows }) => {
	const totalRow = (label, subset) => ({
		pool,
		group: label,
		count: subset.length,
		unchanged: count(subset, (row) => row.moveDirection === "same"),
		upgraded: count(subset, (row) => row.moveDirection === "up"),
		downgraded: count(subset, (row) => row.moveDirection === "down"),
		upgraded1: count(
			subset,
			(row) => row.moveDirection === "up" && row.moveSteps === 1,
		),
		upgraded2Plus: count(
			subset,
			(row) => row.moveDirection === "up" && row.moveSteps >= 2,
		),
		downgraded1: count(
			subset,
			(row) => row.moveDirection === "down" && row.moveSteps === 1,
		),
		downgraded2Plus: count(
			subset,
			(row) => row.moveDirection === "down" && row.moveSteps >= 2,
		),
	});
	const rowsOut = [totalRow("all", rows)];
	for (const key of ["posBand", "ageBand", "mpgBand", "valueBand"]) {
		const groups = new Map();
		for (const row of rows) {
			const label = `${key}:${bucketBand(row)[key]}`;
			if (!groups.has(label)) groups.set(label, []);
			groups.get(label).push(row);
		}
		for (const [label, subset] of groups) rowsOut.push(totalRow(label, subset));
	}
	return rowsOut;
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
});

const distributionTableRows = (rows) =>
	rows
		.filter((row) => row.count > 0)
		.map((row) => ({
			...row,
			percentageText: pct(row.percentage),
		}));

const topTransitionRows = (rows, pool) =>
	rows
		.filter((row) => row.pool === pool && row.currentTier !== row.candidateTier)
		.sort((a, b) => b.count - a.count)
		.slice(0, 15);

const highTierSanityRows = ({ currentRows, candidateRows, pool }) => {
	const highTiers = [
		"SUPERSTAR_MAX",
		"STAR_NEAR_MAX",
		"HIGH_IMPACT_STARTER",
		"YOUNG_PROVEN_STARTER",
		"SOLID_STARTER",
		"HIGH_END_ROTATION",
	];
	return highTiers.map((tier) => {
		const current = currentRows.find(
			(row) => row.pool === pool && row.tier === tier,
		);
		const candidate = candidateRows.find(
			(row) => row.pool === pool && row.tier === tier,
		);
		return {
			tier,
			currentCount: current?.count ?? 0,
			currentPct: current?.percentage ?? 0,
			candidateCount: candidate?.count ?? 0,
			candidatePct: candidate?.percentage ?? 0,
			deltaCount: (candidate?.count ?? 0) - (current?.count ?? 0),
		};
	});
};

const writeRulesMd = () => {
	const md = `# ScoreTier Candidate Dry-Run Rules

These rules exist only inside \`tools/contract-market-scoretier-candidate-dryrun.mjs\`. They are not implementation, not v2.1, and not changes to \`tools/contract-market-tier-score.mjs\`.

## Candidate Rule Map

The candidate first layer keeps the top tiers strict and adds candidate-only middle tiers:

1. \`SUPERSTAR_MAX\`: keep current strict gate.
2. \`STAR_NEAR_MAX\`: keep current strict gate.
3. \`HIGH_IMPACT_STARTER\`: high-current-impact starter lane without age hard blocker.
4. \`YOUNG_PROVEN_STARTER\`: young productive starter or large-rotation lane.
5. \`SOLID_STARTER\`: bridge between low-end starter and young-proven/high-impact starter.
6. \`HIGH_END_ROTATION\`: sixth-man, high-end rotation, young productive rotation, connector, or portable shooting lane.
7. \`LOW_END_STARTER\`: softened starter-ish entry with value/production vetoes.
8. \`SPECIALIST_ROTATION\`: portable shooting/specialist lane.
9. Existing lower tiers and minimum fallback.

## Core Identity, Support Signals, Hard Vetoes

| candidate tier | core identity | support signals | hard vetoes |
| --- | --- | --- | --- |
| SUPERSTAR_MAX | current strict superstar | current scoreTier superstar gate | unchanged |
| STAR_NEAR_MAX | current strict star/near-max | current scoreTier near-max gate | unchanged |
| HIGH_IMPACT_STARTER | non-young or young high-current-impact starter | starter role, contractValue/valueNoPot, EWA/VORP/BPM/PER, connector/defense support | GP/MPG/valueNoPot floor, extreme low efficiency veto |
| YOUNG_PROVEN_STARTER | young productive starter/large rotation | age/pot, role, contract/value support, production, portable skill | GP/MPG/valueNoPot floor |
| SOLID_STARTER | starter bridge lane | starter-like role, valueNoPot, contractValue, neutral production, connector/scorer support | GP/MPG/valueNoPot floor |
| HIGH_END_ROTATION | sixth-man/high-end rotation lane | strong rotation role, creator/scorer, young productive rotation, portable shooting, connector defense, value support | GP/MPG/valueNoPot floor |
| LOW_END_STARTER | starter-ish lower lane | role, starts/starterShare, valueNoPot, contractValue, some production | GP/MPG/valueNoPot floor |
| SPECIALIST_ROTATION | portable specialist | shooting package, role minutes, TS/volume, valueNoPot | GP/MPG floor |

## Why This Is Softer Than Current scoreTier

- It does not require \`establishedStarter\` as the only starter-ish entry.
- It adds current-impact starter lanes for non-young players.
- It adds a \`SOLID_STARTER\` bridge between 12% and 17% cap.
- It adds a \`HIGH_END_ROTATION\` lane for sixth-man/scorer/connector/portable shooting profiles.
- It uses core identity + support signals + vetoes rather than pure all-AND gates.

## Why This Should Not Be Too Soft

- Top max/star tiers are still current strict gates.
- Middle lanes require role and value floors.
- Low production and low role profiles are still vetoed.
- Candidate-only tiers are range-mapped only inside this dry run.

## Likely Overfit Risks

- Labeled 48 can make the middle tiers look better even if full-league distribution inflates.
- HIGH_END_ROTATION can become too broad if shooting/creator/connector signals are too permissive.
- SOLID_STARTER can absorb too many ordinary starters if value floors are too low.
- Young productive lanes may overvalue young players with minutes but weak actual impact.

## Mechanisms Addressed

- missing high-end rotation / sixth-man lane
- over-hard establishedStarter gate
- missing veteran/current-impact starter lane
- low-end starter to young-proven gap

## Mechanisms Intentionally Not Touched

- v2 point weights
- trade value
- exact max snap
- formal \`src/\` logic
- formal \`MODEL_TIERS\`
`;
	fs.writeFileSync(rulesMdPath, md);
};

const writeReport = ({
	currentDist,
	candidateDist,
	transitions,
	movementRows,
	evalRows,
	allRows,
	contractRows,
}) => {
	const currentAll = currentDist.filter((row) => row.pool === "all_active");
	const candidateAll = candidateDist.filter((row) => row.pool === "all_active");
	const currentContract = currentDist.filter(
		(row) => row.pool === "contract_relevant",
	);
	const candidateContract = candidateDist.filter(
		(row) => row.pool === "contract_relevant",
	);
	const labeledSummary = evalSummary(evalRows);
	const allMovement = movementRows.find(
		(row) => row.pool === "all_active" && row.group === "all",
	);
	const contractMovement = movementRows.find(
		(row) => row.pool === "contract_relevant" && row.group === "all",
	);
	const highAll = highTierSanityRows({
		currentRows: currentDist,
		candidateRows: candidateDist,
		pool: "all_active",
	});
	const minCurrent =
		currentAll.find((row) => row.tier === "MINIMUM_LEVEL")?.count ?? 0;
	const minCandidate =
		candidateAll.find((row) => row.tier === "MINIMUM_LEVEL")?.count ?? 0;
	const starCurrent =
		(currentAll.find((row) => row.tier === "SUPERSTAR_MAX")?.count ?? 0) +
		(currentAll.find((row) => row.tier === "STAR_NEAR_MAX")?.count ?? 0);
	const starCandidate =
		(candidateAll.find((row) => row.tier === "SUPERSTAR_MAX")?.count ?? 0) +
		(candidateAll.find((row) => row.tier === "STAR_NEAR_MAX")?.count ?? 0);
	const distributionSafe =
		starCandidate <= starCurrent + 2 &&
		(candidateAll.find((row) => row.tier === "HIGH_IMPACT_STARTER")
			?.percentage ?? 0) <= 0.06 &&
		(candidateAll.find((row) => row.tier === "HIGH_END_ROTATION")?.percentage ??
			0) <= 0.18 &&
		minCandidate >= minCurrent * 0.5;

	const md = `# ScoreTier Candidate Dry-Run

## Executive Summary

This is a dry run only. It does not modify \`src/\`, \`scoreTier\`, \`MODEL_TIERS\`, \`scoreContractMarketV2\`, existing v1/v2 score CSVs, or sampling.

Distribution-first read:

- All-active pool size: ${allRows.length}
- Contract-relevant pool size: ${contractRows.length}
- Current top star tiers: ${starCurrent}
- Candidate top star tiers: ${starCandidate}
- Current minimum count: ${minCurrent}
- Candidate minimum count: ${minCandidate}
- All-active movement: unchanged ${allMovement.unchanged}, upgraded ${allMovement.upgraded}, downgraded ${allMovement.downgraded}
- Contract-relevant movement: unchanged ${contractMovement.unchanged}, upgraded ${contractMovement.upgraded}, downgraded ${contractMovement.downgraded}

Safety read: ${
		distributionSafe
			? "distribution is not obviously explosive, so it is reasonable for further discussion"
			: "distribution has safety concerns; the labeled 48 downstream eval also does not support this candidate"
	}.

## Current First-Layer Distribution

${markdownTable(distributionTableRows(currentAll), [
	{ key: "tier", label: "tier" },
	{ key: "count", label: "count" },
	{ key: "percentageText", label: "%" },
	{ key: "avgAge", label: "avg age", format: (v) => round(Number(v), 2) },
	{ key: "avgMPG", label: "avg MPG", format: (v) => round(Number(v), 2) },
	{ key: "avgValue", label: "avg value", format: (v) => round(Number(v), 2) },
	{
		key: "avgValueNoPot",
		label: "avg valueNoPot",
		format: (v) => round(Number(v), 2),
	},
	{
		key: "avgGetContractValue",
		label: "avg contractValue",
		format: (v) => round(Number(v), 2),
	},
	{ key: "avgBPM", label: "avg BPM", format: (v) => round(Number(v), 2) },
])}

## Candidate First-Layer Distribution

${markdownTable(distributionTableRows(candidateAll), [
	{ key: "tier", label: "tier" },
	{ key: "count", label: "count" },
	{ key: "percentageText", label: "%" },
	{ key: "avgAge", label: "avg age", format: (v) => round(Number(v), 2) },
	{ key: "avgMPG", label: "avg MPG", format: (v) => round(Number(v), 2) },
	{ key: "avgValue", label: "avg value", format: (v) => round(Number(v), 2) },
	{
		key: "avgValueNoPot",
		label: "avg valueNoPot",
		format: (v) => round(Number(v), 2),
	},
	{
		key: "avgGetContractValue",
		label: "avg contractValue",
		format: (v) => round(Number(v), 2),
	},
	{ key: "avgBPM", label: "avg BPM", format: (v) => round(Number(v), 2) },
])}

## Transition Matrix Summary

Top all-active movements:

${markdownTable(topTransitionRows(transitions, "all_active"), [
	{ key: "currentTier", label: "current tier" },
	{ key: "candidateTier", label: "candidate tier" },
	{ key: "count", label: "count" },
	{ key: "percentageOfCurrentTier", label: "% of current", format: pct },
	{ key: "moveDirection", label: "direction" },
	{ key: "moveSteps", label: "steps" },
])}

Movement summary:

${markdownTable(
	movementRows.filter((row) => row.group === "all"),
	[
		{ key: "pool", label: "pool" },
		{ key: "count", label: "count" },
		{ key: "unchanged", label: "unchanged" },
		{ key: "upgraded", label: "upgraded" },
		{ key: "downgraded", label: "downgraded" },
		{ key: "upgraded1", label: "up 1" },
		{ key: "upgraded2Plus", label: "up 2+" },
		{ key: "downgraded1", label: "down 1" },
		{ key: "downgraded2Plus", label: "down 2+" },
	],
)}

Movement by band:

${markdownTable(
	movementRows.filter((row) => row.group !== "all"),
	[
		{ key: "pool", label: "pool" },
		{ key: "group", label: "group" },
		{ key: "count", label: "count" },
		{ key: "unchanged", label: "unchanged" },
		{ key: "upgraded", label: "upgraded" },
		{ key: "downgraded", label: "downgraded" },
		{ key: "upgraded1", label: "up 1" },
		{ key: "upgraded2Plus", label: "up 2+" },
	],
)}

## High-Tier Sanity Check

${markdownTable(highAll, [
	{ key: "tier", label: "tier" },
	{ key: "currentCount", label: "current count" },
	{ key: "currentPct", label: "current %", format: pct },
	{ key: "candidateCount", label: "candidate count" },
	{ key: "candidatePct", label: "candidate %", format: pct },
	{ key: "deltaCount", label: "delta" },
])}

High-tier read:

- Superstar/star count ${starCandidate > starCurrent + 2 ? "increased materially and needs caution" : "did not obviously explode"}.
- HIGH_IMPACT_STARTER count is ${candidateAll.find((row) => row.tier === "HIGH_IMPACT_STARTER")?.count ?? 0}.
- SOLID_STARTER count is ${candidateAll.find((row) => row.tier === "SOLID_STARTER")?.count ?? 0}.
- HIGH_END_ROTATION count is ${candidateAll.find((row) => row.tier === "HIGH_END_ROTATION")?.count ?? 0}.
- Minimum/low-end did ${minCandidate < minCurrent * 0.5 ? "shrink aggressively, which is a distribution risk" : "not get over-cleared"}.

## Contract-Relevant Pool Distribution

Contract-relevant here means \`tid === -1\` or current no-option contract years <= 1. This is a proxy, not a formal negotiation pool.

Current:

${markdownTable(distributionTableRows(currentContract), [
	{ key: "tier", label: "tier" },
	{ key: "count", label: "count" },
	{ key: "percentageText", label: "%" },
	{ key: "avgMPG", label: "avg MPG", format: (v) => round(Number(v), 2) },
	{
		key: "avgValueNoPot",
		label: "avg valueNoPot",
		format: (v) => round(Number(v), 2),
	},
	{
		key: "avgGetContractValue",
		label: "avg contractValue",
		format: (v) => round(Number(v), 2),
	},
])}

Candidate:

${markdownTable(distributionTableRows(candidateContract), [
	{ key: "tier", label: "tier" },
	{ key: "count", label: "count" },
	{ key: "percentageText", label: "%" },
	{ key: "avgMPG", label: "avg MPG", format: (v) => round(Number(v), 2) },
	{
		key: "avgValueNoPot",
		label: "avg valueNoPot",
		format: (v) => round(Number(v), 2),
	},
	{
		key: "avgGetContractValue",
		label: "avg contractValue",
		format: (v) => round(Number(v), 2),
	},
])}

## Labeled 48 Downstream Eval

Candidate tier is temporarily connected to dry-run ranges and the unchanged v2 point placement formula. This does not overwrite original v2 outputs.

| metric | current v2 | candidate dry-run |
| --- | ---: | ---: |
| mean gap | ${round(labeledSummary.currentMeanGap, 2)} | ${round(labeledSummary.candidateMeanGap, 2)} |
| median gap | ${round(labeledSummary.currentMedianGap, 2)} | ${round(labeledSummary.candidateMedianGap, 2)} |
| severe | ${labeledSummary.currentSevere} | ${labeledSummary.candidateSevere} |
| too_low | ${labeledSummary.currentTooLow} | ${labeledSummary.candidateTooLow} |
| too_high | ${labeledSummary.currentTooHigh} | ${labeledSummary.candidateTooHigh} |
| better/tie | current ${labeledSummary.currentBetter} / tie ${labeledSummary.tie} | candidate ${labeledSummary.candidateBetter} / tie ${labeledSummary.tie} |
| severe fixed |  | ${labeledSummary.severeFixed} |
| new severe |  | ${labeledSummary.newSevere} |
| improved by >= 3M |  | ${labeledSummary.improvedBy3M} |
| worsened by >= 3M |  | ${labeledSummary.worsenedBy3M} |

Big labeled movements are in \`${path.relative(root, labeledEvalPath)}\`; the report intentionally avoids over-indexing on individual player names.

## Overfit Risk Notes

- Labeled 48 are calibration/support cases, not final test.
- Candidate lanes were motivated by mechanism classes, but this dry-run still needs distribution scrutiny before any implementation discussion.
- Human ranges are used only for downstream eval, not inside \`candidateScoreTier\`.
- Trade value is not used.

## Whether Candidate Rules Look Safe Enough For Further Discussion

${
	distributionSafe
		? "Yes, with caution. Distribution does not show top-tier explosion or full minimum-tier evacuation."
		: "Not yet. Distribution safety concerns plus worse labeled 48 downstream metrics make this candidate unsuitable as-is."
}

## What Needs Adjustment Before Any Implementation

- Review whether HIGH_END_ROTATION and SOLID_STARTER counts are reasonable at full-league scale.
- Check contract-relevant pool specifically before judging market inflation.
- Inspect transitions that upgrade by 2+ tiers as a class, not as single-player anecdotes.
- Keep max/star gates strict unless separate evidence supports changes.
- Do not implement until a smaller v2.1A proposal is written and reviewed.
`;

	fs.writeFileSync(dryRunMdPath, md);
};

const distColumns = [
	"pool",
	"tier",
	"count",
	"percentage",
	"avgAge",
	"avgMPG",
	"avgValue",
	"avgValueNoPot",
	"avgGetContractValue",
	"avgPER",
	"avgEWA",
	"avgVORP",
	"avgBPM",
];

const transitionColumns = [
	"pool",
	"currentTier",
	"candidateTier",
	"count",
	"percentageOfCurrentTier",
	"moveDirection",
	"moveSteps",
	"netUpwardMoves",
	"netDownwardMoves",
];

const labeledColumns = [
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
];

const main = () => {
	const save = readSave(savePath);
	const attrs = save.gameAttributes;
	const allRows = buildPoolRows({ save, attrs });
	const contractRows = allRows.filter((row) => row.contractRelevant === "yes");
	const currentDist = poolViews(allRows).flatMap(({ pool, rows }) =>
		distributionRows({ pool, rows, tierField: "currentTier" }),
	);
	const candidateDist = poolViews(allRows).flatMap(({ pool, rows }) =>
		distributionRows({ pool, rows, tierField: "candidateTier" }),
	);
	const transitions = poolViews(allRows).flatMap(({ pool, rows }) =>
		transitionRows({ pool, rows }),
	);
	const movementRows = poolViews(allRows).flatMap(({ pool, rows }) =>
		movementSummaryRows({ pool, rows }),
	);
	const labeledRows = loadLabeledRows();
	const poolByPid = new Map(allRows.map((row) => [row.pid, row]));
	const labeledEval = labeledEvalRows({ labeledRows, poolByPid, attrs });

	writeCsv(currentDistributionPath, currentDist, distColumns);
	writeCsv(candidateDistributionPath, candidateDist, distColumns);
	writeCsv(transitionMatrixPath, transitions, transitionColumns);
	writeCsv(labeledEvalPath, labeledEval, labeledColumns);
	writeRulesMd();
	writeReport({
		currentDist,
		candidateDist,
		transitions,
		movementRows,
		evalRows: labeledEval,
		allRows,
		contractRows,
	});

	console.log(
		JSON.stringify(
			{
				allActive: allRows.length,
				contractRelevant: contractRows.length,
				labeled: labeledEval.length,
				currentAll: Object.fromEntries(
					currentDist
						.filter((row) => row.pool === "all_active" && row.count > 0)
						.map((row) => [row.tier, row.count]),
				),
				candidateAll: Object.fromEntries(
					candidateDist
						.filter((row) => row.pool === "all_active" && row.count > 0)
						.map((row) => [row.tier, row.count]),
				),
				labeledEval: evalSummary(labeledEval),
				outputs: [
					path.relative(root, currentDistributionPath),
					path.relative(root, candidateDistributionPath),
					path.relative(root, transitionMatrixPath),
					path.relative(root, labeledEvalPath),
					path.relative(root, dryRunMdPath),
					path.relative(root, rulesMdPath),
				],
			},
			null,
			2,
		),
	);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
