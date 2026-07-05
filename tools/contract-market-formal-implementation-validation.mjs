#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { csvFormat, csvParse } from "d3-dsv";
import {
	buildProxyRows,
	money,
	pct,
	readSave,
	round,
} from "./contract-market-proxy-core.mjs";
import {
	scoreBaseTier,
	scoreContractMarketPlacement,
	scoreTier,
	tierRange,
} from "./contract-market-tier-score.mjs";

const root = process.cwd();
const artifactsDir = path.join(root, "contract_market_artifacts");
const outDir = path.join(
	artifactsDir,
	"v3_experiments/formal_implementation_validation",
);
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);

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

const numberFields = new Set([
	"pid",
	"humanAmountMinM",
	"humanAmountMaxM",
	"humanMidpointM",
	"human_min_m",
	"human_max_m",
	"currentPointM",
	"v3PointM",
	"combinedPointM",
	"currentV2PointM",
]);

const readCsv = (csvPath) =>
	csvParse(fs.readFileSync(csvPath, "utf8")).map((row) =>
		Object.fromEntries(
			Object.entries(row).map(([key, value]) => {
				if (numberFields.has(key) && value !== "") {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) return [key, parsed];
				}
				return [key, value];
			}),
		),
	);

const writeCsv = (fileName, rows) => {
	fs.writeFileSync(path.join(outDir, fileName), csvFormat(rows));
};

const sum = (values) =>
	values.reduce(
		(total, value) =>
			total + (Number.isFinite(Number(value)) ? Number(value) : 0),
		0,
	);
const mean = (values) => {
	const finite = values.map(Number).filter(Number.isFinite);
	return finite.length ? sum(finite) / finite.length : undefined;
};
const median = (values) => {
	const finite = values
		.map(Number)
		.filter(Number.isFinite)
		.sort((a, b) => a - b);
	if (!finite.length) return undefined;
	const mid = Math.floor(finite.length / 2);
	return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
};
const count = (rows, predicate) => rows.filter(predicate).length;
const groupRows = (rows, keyFn) => {
	const groups = new Map();
	for (const row of rows) {
		const key = keyFn(row);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(row);
	}
	return [...groups.entries()];
};

const pointDirection = (point, humanMin, humanMax) => {
	if (
		!Number.isFinite(point) ||
		!Number.isFinite(humanMin) ||
		!Number.isFinite(humanMax)
	) {
		return "missing";
	}
	if (point < humanMin) return "too_low";
	if (point > humanMax) return "too_high";
	return "in_range";
};

const pointGap = (point, humanMin, humanMax) => {
	const direction = pointDirection(point, humanMin, humanMax);
	if (direction === "too_low") return humanMin - point;
	if (direction === "too_high") return point - humanMax;
	if (direction === "in_range") return 0;
	return undefined;
};

const gapBand = (gap, point, min, max) => {
	if (!Number.isFinite(gap)) return "missing";
	const reference = Math.max(
		1,
		Number(point) || 0,
		Number(min) || 0,
		Number(max) || 0,
	);
	const relativeGap = gap / reference;
	if (gap <= 3 || (reference <= 8 && relativeGap <= 0.25)) return "fine";
	if (gap <= 5 || (reference <= 8 && relativeGap <= 0.4)) return "acceptable";
	if (gap <= 8 || (reference <= 8 && relativeGap <= 0.65)) return "review";
	return "major";
};

const scoreProxyRow = (row, attrs) => {
	const baseScore = scoreBaseTier(row);
	const baseRange = tierRange(baseScore.tier, row, attrs);
	const basePlacement = scoreContractMarketPlacement(row, attrs, {
		score: baseScore,
		range: baseRange,
	});
	const formalScore = scoreTier(row);
	const formalRange = tierRange(formalScore.tier, row, attrs);
	const formalPlacement = scoreContractMarketPlacement(row, attrs, {
		score: formalScore,
		range: formalRange,
	});
	const moveSteps =
		Number.isFinite(TIER_RANK[baseScore.tier]) &&
		Number.isFinite(TIER_RANK[formalScore.tier])
			? TIER_RANK[baseScore.tier] - TIER_RANK[formalScore.tier]
			: "";
	return {
		...row,
		contractRelevant:
			row.tid === -1 || row.normalNoOptionContractYears <= 1 ? "yes" : "no",
		currentTier: baseScore.tier,
		currentReason: baseScore.reason,
		currentRangeText: baseRange.modelRangeText,
		currentRangeMinM: round(baseRange.modelRangeMin / 1000, 3),
		currentRangeMaxM: round(baseRange.modelRangeMax / 1000, 3),
		currentPointM: basePlacement.modelPointEstimateM,
		currentTierPlacementScore: round(basePlacement.tierPlacementScore, 6),
		formalTier: formalScore.tier,
		formalRangeText: formalRange.modelRangeText,
		formalRangeMinM: round(formalRange.modelRangeMin / 1000, 3),
		formalRangeMaxM: round(formalRange.modelRangeMax / 1000, 3),
		formalPointM: formalPlacement.modelPointEstimateM,
		formalPointText: formalPlacement.modelPointText,
		formalYears: formalPlacement.modelYears,
		formalTierPlacementScore: round(formalPlacement.tierPlacementScore, 6),
		formalReason: formalScore.reason,
		responsibleModule: formalScore.responsibleModule ?? "none",
		conflict: formalScore.conflict ?? "no",
		formalPassedSignals: (formalScore.passedSignals ?? []).join("; "),
		formalRiskFlags: formalPlacement.riskFlagsText,
		moveDirection: moveSteps > 0 ? "up" : moveSteps < 0 ? "down" : "same",
		moveSteps: moveSteps === "" ? "" : Math.abs(moveSteps),
		pointDeltaM: round(
			formalPlacement.modelPointEstimateM - basePlacement.modelPointEstimateM,
			3,
		),
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
			key: `formal-v3-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries: entries,
	});
	const teams = new Map(save.teams.map((team) => [team.tid, team]));
	const scoredRows = rows.map((row) => {
		const team = teams.get(row.tid);
		return {
			...scoreProxyRow(row, attrs),
			teamAbbrev: team?.abbrev ?? "",
			teamName: team ? `${team.region} ${team.name}` : "Free Agent",
		};
	});
	return { attrs, rows: scoredRows };
};

const top15RosterProxy = (rows) => {
	const pids = new Set();
	for (const [, teamRows] of groupRows(
		rows.filter((row) => Number(row.tid) >= 0),
		(row) => row.tid,
	)) {
		teamRows
			.slice()
			.sort(
				(a, b) =>
					Number(b.valueNoPot) - Number(a.valueNoPot) ||
					Number(b.MPG) - Number(a.MPG),
			)
			.slice(0, 15)
			.forEach((row) => pids.add(Number(row.pid)));
	}
	return rows.filter((row) => pids.has(Number(row.pid)));
};

const poolViews = (rows) => [
	{ pool: "all_active", rows },
	{ pool: "rostered_active", rows: rows.filter((row) => Number(row.tid) >= 0) },
	{ pool: "top15_roster_proxy", rows: top15RosterProxy(rows) },
	{
		pool: "contract_relevant",
		rows: rows.filter((row) => row.contractRelevant === "yes"),
	},
];

const distributionRows = (rows) =>
	poolViews(rows).flatMap(({ pool, rows: poolRows }) => {
		const total = poolRows.length;
		return ["current", "formal_v3"].flatMap((model) => {
			const tierField = model === "current" ? "currentTier" : "formalTier";
			return TIERS.map((tier) => {
				const subset = poolRows.filter((row) => row[tierField] === tier);
				return {
					pool,
					model,
					tier,
					count: subset.length,
					share: round(total ? subset.length / total : 0, 6),
					shareText: pct(total ? subset.length / total : 0),
					avgPointM: round(
						mean(
							subset.map((row) =>
								model === "current" ? row.currentPointM : row.formalPointM,
							),
						),
						3,
					),
					avgAge: round(mean(subset.map((row) => row.age)), 3),
					avgMPG: round(mean(subset.map((row) => row.MPG)), 3),
					avgValueNoPot: round(mean(subset.map((row) => row.valueNoPot)), 3),
					avgBPM: round(mean(subset.map((row) => row.BPM)), 3),
				};
			});
		});
	});

const transitionRows = (rows) =>
	poolViews(rows).flatMap(({ pool, rows: poolRows }) => {
		const currentCounts = new Map();
		for (const row of poolRows) {
			currentCounts.set(
				row.currentTier,
				(currentCounts.get(row.currentTier) ?? 0) + 1,
			);
		}
		return groupRows(poolRows, (row) => `${row.currentTier}||${row.formalTier}`)
			.map(([key, subset]) => {
				const [currentTier, formalTier] = key.split("||");
				const moveSteps =
					Number.isFinite(TIER_RANK[currentTier]) &&
					Number.isFinite(TIER_RANK[formalTier])
						? TIER_RANK[currentTier] - TIER_RANK[formalTier]
						: "";
				return {
					pool,
					currentTier,
					formalTier,
					count: subset.length,
					percentageOfCurrentTier: round(
						subset.length / (currentCounts.get(currentTier) ?? subset.length),
						6,
					),
					percentageOfCurrentTierText: pct(
						subset.length / (currentCounts.get(currentTier) ?? subset.length),
					),
					moveDirection: moveSteps > 0 ? "up" : moveSteps < 0 ? "down" : "same",
					moveSteps: moveSteps === "" ? "" : Math.abs(moveSteps),
					responsibleModules: [
						...new Set(subset.map((row) => row.responsibleModule)),
					]
						.sort()
						.join("; "),
					avgPointDeltaM: round(mean(subset.map((row) => row.pointDeltaM)), 3),
				};
			})
			.sort(
				(a, b) =>
					(TIER_RANK[a.currentTier] ?? 99) - (TIER_RANK[b.currentTier] ?? 99) ||
					(TIER_RANK[a.formalTier] ?? 99) - (TIER_RANK[b.formalTier] ?? 99),
			);
	});

const teamTop15Rows = (rows, attrs) =>
	groupRows(
		rows.filter((row) => Number(row.tid) >= 0),
		(row) => row.tid,
	)
		.map(([tid, teamRows]) => {
			const top = teamRows
				.slice()
				.sort(
					(a, b) =>
						Number(b.valueNoPot) - Number(a.valueNoPot) ||
						Number(b.MPG) - Number(a.MPG),
				)
				.slice(0, 15);
			const currentPayrollM = sum(top.map((row) => row.currentPointM));
			const formalPayrollM = sum(top.map((row) => row.formalPointM));
			return {
				tid,
				team: top[0]?.teamAbbrev ?? "",
				top15_n: top.length,
				currentTop15PointPayrollM: round(currentPayrollM, 3),
				formalTop15PointPayrollM: round(formalPayrollM, 3),
				deltaM: round(formalPayrollM - currentPayrollM, 3),
				currentCapPct: round((currentPayrollM * 1000) / attrs.salaryCap, 6),
				formalCapPct: round((formalPayrollM * 1000) / attrs.salaryCap, 6),
				deltaCapPct: round(
					((formalPayrollM - currentPayrollM) * 1000) / attrs.salaryCap,
					6,
				),
				highEndRotation_n: count(
					top,
					(row) => row.formalTier === "HIGH_END_ROTATION",
				),
				solidStarter_n: count(top, (row) => row.formalTier === "SOLID_STARTER"),
			};
		})
		.sort((a, b) => Number(b.deltaM) - Number(a.deltaM));

const evalSummary = (rows, prefix) => ({
	[`${prefix}_n`]: rows.length,
	[`${prefix}_mean_gap_m`]: round(mean(rows.map((row) => row.formalGapM)), 3),
	[`${prefix}_median_gap_m`]: round(
		median(rows.map((row) => row.formalGapM)),
		3,
	),
	[`${prefix}_in_range`]: count(
		rows,
		(row) => row.formalDirection === "in_range",
	),
	[`${prefix}_fine`]: count(rows, (row) => row.formalGapBand === "fine"),
	[`${prefix}_acceptable`]: count(
		rows,
		(row) => row.formalGapBand === "acceptable",
	),
	[`${prefix}_review`]: count(rows, (row) => row.formalGapBand === "review"),
	[`${prefix}_major`]: count(rows, (row) => row.formalGapBand === "major"),
	[`${prefix}_too_low`]: count(
		rows,
		(row) => row.formalDirection === "too_low",
	),
	[`${prefix}_too_high`]: count(
		rows,
		(row) => row.formalDirection === "too_high",
	),
});

const priorCombinedRows = () => {
	const csvPath = path.join(
		artifactsDir,
		"v3_experiments/ab_combined_audit/labeled_eval.csv",
	);
	if (!fs.existsSync(csvPath)) return new Map();
	return new Map(
		readCsv(csvPath).map((row) => [`${row.dataset}:${row.caseId}`, row]),
	);
};

const evalLabeledDataset = ({
	dataset,
	comparablePath,
	v2Path,
	rowsByPid,
	priorByKey,
}) => {
	const comparableRows = readCsv(comparablePath).filter(
		(row) =>
			Number.isFinite(Number(row.humanAmountMinM)) &&
			Number.isFinite(Number(row.humanAmountMaxM)),
	);
	const v2ByCase = new Map(readCsv(v2Path).map((row) => [row.caseId, row]));
	return comparableRows
		.map((label) => {
			const source = v2ByCase.get(label.caseId);
			const row = rowsByPid.get(Number(source?.pid));
			if (!row) return undefined;
			const humanMin = Number(label.humanAmountMinM);
			const humanMax = Number(label.humanAmountMaxM);
			const formalGap = pointGap(row.formalPointM, humanMin, humanMax);
			const formalDirection = pointDirection(
				row.formalPointM,
				humanMin,
				humanMax,
			);
			const currentGap = pointGap(row.currentPointM, humanMin, humanMax);
			const currentDirection = pointDirection(
				row.currentPointM,
				humanMin,
				humanMax,
			);
			const prior = priorByKey.get(`${dataset}:${label.caseId}`);
			return {
				dataset,
				caseId: label.caseId,
				globalCaseId: label.globalCaseId ?? source?.globalCaseId ?? "",
				pid: source?.pid ?? "",
				name: label.name,
				bucket: label.bucket,
				humanRangeText: label.humanRangeText,
				humanMinM: humanMin,
				humanMaxM: humanMax,
				currentTier: row.currentTier,
				formalTier: row.formalTier,
				responsibleModule: row.responsibleModule,
				currentPointM: row.currentPointM,
				formalPointM: row.formalPointM,
				currentGapM: round(currentGap, 3),
				formalGapM: round(formalGap, 3),
				currentDirection,
				formalDirection,
				formalGapBand: gapBand(formalGap, row.formalPointM, humanMin, humanMax),
				formalMinusCurrentGapM: round(formalGap - currentGap, 3),
				priorArtifactTier: prior?.combinedTier ?? "",
				priorArtifactPointM: prior?.combinedPointM ?? "",
				formalMinusPriorArtifactPointM: Number.isFinite(
					Number(prior?.combinedPointM),
				)
					? round(row.formalPointM - Number(prior.combinedPointM), 3)
					: "",
				formalRiskFlags: row.formalRiskFlags,
			};
		})
		.filter(Boolean);
};

const evalBlind30 = ({ rowsByPid }) => {
	const blindPath = path.join(
		artifactsDir,
		"v3_experiments/blind_validation30_eval/case_eval.csv",
	);
	return readCsv(blindPath).map((label) => {
		const row = rowsByPid.get(Number(label.pid));
		const humanMin = Number(label.human_min_m);
		const humanMax = Number(label.human_max_m);
		const evaluable =
			label.evaluable === "yes" &&
			Number.isFinite(humanMin) &&
			Number.isFinite(humanMax);
		const formalGap = evaluable
			? pointGap(row?.formalPointM, humanMin, humanMax)
			: undefined;
		const currentGap = evaluable
			? pointGap(row?.currentPointM, humanMin, humanMax)
			: undefined;
		return {
			dataset: "blind_validation30",
			caseId: label.caseId,
			pid: label.pid,
			name: label.name,
			hiddenStratum: label.hiddenStratum,
			confidence: label.confidence,
			evaluable: evaluable ? "yes" : "no",
			humanRangeText: label.human_range_text,
			humanMinM: evaluable ? humanMin : "",
			humanMaxM: evaluable ? humanMax : "",
			artifactV3Tier: label.v3Tier,
			currentTier: row?.currentTier ?? "",
			formalTier: row?.formalTier ?? "",
			responsibleModule: row?.responsibleModule ?? "",
			artifactV3PointM: label.v3PointM,
			formalPointM: row?.formalPointM ?? "",
			formalMinusArtifactV3PointM:
				Number.isFinite(Number(label.v3PointM)) && row
					? round(row.formalPointM - Number(label.v3PointM), 3)
					: "",
			currentPointM: row?.currentPointM ?? "",
			currentGapM: round(currentGap, 3),
			formalGapM: round(formalGap, 3),
			currentDirection: evaluable
				? pointDirection(row?.currentPointM, humanMin, humanMax)
				: "missing",
			formalDirection: evaluable
				? pointDirection(row?.formalPointM, humanMin, humanMax)
				: "missing",
			formalGapBand: evaluable
				? gapBand(formalGap, row?.formalPointM, humanMin, humanMax)
				: "missing",
			formalRiskFlags: row?.formalRiskFlags ?? "",
		};
	});
};

const buildReviewQueue = ({ validation20, boundary40, blind30 }) =>
	[
		...validation20.map((row) => ({ ...row, source: "validation20" })),
		...boundary40.map((row) => ({ ...row, source: "boundary40" })),
		...blind30
			.filter((row) => row.evaluable === "yes")
			.map((row) => ({ ...row, source: "blind_validation30" })),
	]
		.filter((row) => {
			const gap = Number(row.formalGapM);
			const priorDiff = Math.abs(Number(row.formalMinusPriorArtifactPointM));
			const blindDiff = Math.abs(Number(row.formalMinusArtifactV3PointM));
			return (
				row.formalGapBand === "major" ||
				row.formalGapBand === "review" ||
				gap >= 5 ||
				priorDiff > 0.15 ||
				blindDiff > 0.15
			);
		})
		.map((row) => ({
			source: row.source,
			caseId: row.caseId,
			pid: row.pid,
			name: row.name,
			humanRangeText: row.humanRangeText,
			currentTier: row.currentTier ?? "",
			formalTier: row.formalTier,
			responsibleModule: row.responsibleModule,
			formalPointM: row.formalPointM,
			formalDirection: row.formalDirection,
			formalGapM: row.formalGapM,
			formalGapBand: row.formalGapBand,
			priorArtifactPointM:
				row.priorArtifactPointM ?? row.artifactV3PointM ?? "",
			formalMinusPriorArtifactPointM:
				row.formalMinusPriorArtifactPointM ??
				row.formalMinusArtifactV3PointM ??
				"",
			notes:
				row.formalGapBand === "major"
					? "major human-range miss"
					: row.formalGapBand === "review"
						? "review-band human-range miss"
						: "artifact reproduction diff",
		}))
		.sort((a, b) => Number(b.formalGapM) - Number(a.formalGapM));

const mdTable = (rows) => {
	if (!rows.length) return "_None._";
	const headers = Object.keys(rows[0]);
	return [
		`| ${headers.join(" | ")} |`,
		`| ${headers.map(() => "---").join(" | ")} |`,
		...rows.map(
			(row) =>
				`| ${headers.map((header) => String(row[header] ?? "").replaceAll("|", "\\|")).join(" | ")} |`,
		),
	].join("\n");
};

const implementationSummary = ({
	rows,
	distribution,
	transitions,
	teamTop15,
	validation20,
	boundary40,
	blind30,
	reviewQueue,
}) => {
	const her = rows.filter((row) => row.formalTier === "HIGH_END_ROTATION");
	const solid = rows.filter((row) => row.formalTier === "SOLID_STARTER");
	const allActiveCurrent = distribution.filter(
		(row) => row.pool === "all_active" && row.model === "current",
	);
	const allActiveFormal = distribution.filter(
		(row) => row.pool === "all_active" && row.model === "formal_v3",
	);
	const tierCounts = (distRows) =>
		Object.fromEntries(
			distRows
				.filter((row) => row.count > 0)
				.map((row) => [row.tier, row.count]),
		);
	const blindEvaluable = blind30.filter((row) => row.evaluable === "yes");
	const summaries = [
		{ dataset: "validation20", ...evalSummary(validation20, "formal") },
		{ dataset: "boundary40", ...evalSummary(boundary40, "formal") },
		{ dataset: "blind_validation30", ...evalSummary(blindEvaluable, "formal") },
	];
	const priorDiffs = [
		...validation20.map((row) =>
			Math.abs(Number(row.formalMinusPriorArtifactPointM)),
		),
		...boundary40.map((row) =>
			Math.abs(Number(row.formalMinusPriorArtifactPointM)),
		),
	].filter(Number.isFinite);
	const blindDiffs = blind30
		.map((row) => Math.abs(Number(row.formalMinusArtifactV3PointM)))
		.filter(Number.isFinite);
	const topTeamDeltas = teamTop15.slice(0, 8).map((row) => ({
		team: row.team,
		formalTop15PointPayrollM: row.formalTop15PointPayrollM,
		deltaM: row.deltaM,
		deltaCapPct: pct(row.deltaCapPct),
		highEndRotation_n: row.highEndRotation_n,
		solidStarter_n: row.solidStarter_n,
	}));
	const focusTransitions = transitions.filter(
		(row) =>
			row.pool === "all_active" &&
			[
				"YOUNG_UPSIDE_SUSPECT||HIGH_END_ROTATION",
				"VETERAN_ROTATION_GUARD||HIGH_END_ROTATION",
				"MINIMUM_LEVEL||HIGH_END_ROTATION",
				"LOW_END_STARTER||SOLID_STARTER",
			].includes(`${row.currentTier}||${row.formalTier}`),
	);
	return [
		"# Formal Implementation Validation",
		"",
		"Scope: validates the formal implementation only. This run writes only `contract_market_artifacts/v3_experiments/formal_implementation_validation/` and does not rewrite historical review artifacts.",
		"",
		"## Implementation Mapping",
		"",
		"- V1/current base: `scoreBaseTier` in `tools/contract-market-tier-score.mjs` preserves the prior formal tier rules.",
		"- V3-AB first layer: formal `scoreTier` starts from `scoreBaseTier`, then applies only 1A `HIGH_END_ROTATION` and 1B-B `SOLID_STARTER`.",
		"- V3 ranges: `HIGH_END_ROTATION` is 7%-12% cap; `SOLID_STARTER` is 12%-17% cap.",
		"- V2 placement: `scoreContractMarketPlacement` migrates the V2 range-internal point placement and years logic into the formal helper.",
		"- Not migrated: sandbox old-demand sanity and trade-exploit audit fields; those remain validation/debug concepts, not formal point inputs.",
		"",
		"## Current vs Formal V3 Distribution",
		"",
		mdTable([
			{
				model: "current",
				counts: JSON.stringify(tierCounts(allActiveCurrent)),
			},
			{
				model: "formal_v3",
				counts: JSON.stringify(tierCounts(allActiveFormal)),
			},
		]),
		"",
		"## Focus Transitions",
		"",
		mdTable(
			focusTransitions.map((row) => ({
				currentTier: row.currentTier,
				formalTier: row.formalTier,
				count: row.count,
				percentageOfCurrentTierText: row.percentageOfCurrentTierText,
				avgPointDeltaM: row.avgPointDeltaM,
			})),
		),
		"",
		"## Entrants",
		"",
		`- HIGH_END_ROTATION entrants: ${her.length}`,
		`- SOLID_STARTER entrants: ${solid.length}`,
		`- conflicts: ${count(rows, (row) => row.conflict === "yes")}`,
		"",
		"## Labeled Eval Summary",
		"",
		mdTable(summaries),
		"",
		"## Artifact Reproduction",
		"",
		`- ab_combined_audit validation/boundary max point diff: ${round(Math.max(0, ...priorDiffs), 3)}M`,
		`- blind_validation30 max V3 point diff: ${round(Math.max(0, ...blindDiffs), 3)}M`,
		"",
		"## Team Top15 Payroll Sanity",
		"",
		mdTable(topTeamDeltas),
		"",
		"## Review Queue",
		"",
		mdTable(reviewQueue.slice(0, 25)),
		"",
		"## Read",
		"",
		`Formal V3 ${Math.max(0, ...blindDiffs) <= 0.15 && Math.max(0, ...priorDiffs) <= 0.15 ? "reproduces" : "does not exactly reproduce"} prior V3-AB point artifacts within 0.15M tolerance.`,
		`HIGH_END_ROTATION should be manually watched: ${count(reviewQueue, (row) => row.formalTier === "HIGH_END_ROTATION")} review queue rows are in that tier.`,
		`SOLID_STARTER stability check: ${count(reviewQueue, (row) => row.formalTier === "SOLID_STARTER")} review queue rows are in that tier.`,
	].join("\n");
};

const main = () => {
	fs.mkdirSync(outDir, { recursive: true });
	const { attrs, rows } = buildRows();
	const rowsByPid = new Map(rows.map((row) => [Number(row.pid), row]));
	const distribution = distributionRows(rows);
	const transitions = transitionRows(rows);
	const teamTop15 = teamTop15Rows(rows, attrs);
	const priorByKey = priorCombinedRows();
	const validation20 = evalLabeledDataset({
		dataset: "validation20",
		comparablePath: path.join(
			artifactsDir,
			"contract_market_validation20_v1_v2_comparable_eval.csv",
		),
		v2Path: path.join(
			artifactsDir,
			"contract_market_validation20_v2_score.csv",
		),
		rowsByPid,
		priorByKey,
	});
	const boundary40 = evalLabeledDataset({
		dataset: "boundary40",
		comparablePath: path.join(
			artifactsDir,
			"contract_market_boundary40_v1_v2_comparable_eval.csv",
		),
		v2Path: path.join(artifactsDir, "contract_market_boundary40_v2_score.csv"),
		rowsByPid,
		priorByKey,
	});
	const blind30 = evalBlind30({ rowsByPid });
	const reviewQueue = buildReviewQueue({ validation20, boundary40, blind30 });

	writeCsv("case_eval.csv", rows);
	writeCsv("current_vs_formal_v3_distribution.csv", distribution);
	writeCsv("tier_transition_matrix.csv", transitions);
	writeCsv(
		"her_entrants.csv",
		rows.filter((row) => row.formalTier === "HIGH_END_ROTATION"),
	);
	writeCsv(
		"solid_starter_entrants.csv",
		rows.filter((row) => row.formalTier === "SOLID_STARTER"),
	);
	writeCsv("review_queue.csv", reviewQueue);
	writeCsv("team_top15_payroll_sanity.csv", teamTop15);
	writeCsv("validation20_eval.csv", validation20);
	writeCsv("boundary40_eval.csv", boundary40);
	writeCsv("blind_validation30_eval.csv", blind30);
	fs.writeFileSync(
		path.join(outDir, "implementation_summary.md"),
		implementationSummary({
			rows,
			distribution,
			transitions,
			teamTop15,
			validation20,
			boundary40,
			blind30,
			reviewQueue,
		}),
	);

	console.log(`Wrote formal implementation validation to ${outDir}`);
	console.log(
		JSON.stringify(
			{
				all_active_n: rows.length,
				high_end_rotation: count(
					rows,
					(row) => row.formalTier === "HIGH_END_ROTATION",
				),
				solid_starter: count(rows, (row) => row.formalTier === "SOLID_STARTER"),
				review_queue_n: reviewQueue.length,
				validation20: evalSummary(validation20, "formal"),
				boundary40: evalSummary(boundary40, "formal"),
				blind_validation30: evalSummary(
					blind30.filter((row) => row.evaluable === "yes"),
					"formal",
				),
			},
			null,
			2,
		),
	);
};

main();
