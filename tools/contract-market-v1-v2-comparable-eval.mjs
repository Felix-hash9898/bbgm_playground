#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csvParse } from "d3-dsv";
import {
	markdownTable,
	money,
	pct,
	readSave,
	round,
	writeCsv,
} from "./contract-market-proxy-core.mjs";

const root = process.cwd();
const artifactsDir = path.join(root, "contract_market_artifacts");
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);

const DATASETS = [
	{
		dataset: "boundary40",
		inputPath: path.join(
			artifactsDir,
			"contract_market_boundary40_v2_score.csv",
		),
		csvPath: path.join(
			artifactsDir,
			"contract_market_boundary40_v1_v2_comparable_eval.csv",
		),
		mdPath: path.join(
			artifactsDir,
			"contract_market_boundary40_v1_v2_comparable_eval.md",
		),
		scope:
			"boundary40 是 boundary/challenge calibration set，不是 final test；A-C missing rows are skipped from comparable metrics.",
	},
	{
		dataset: "validation20",
		inputPath: path.join(
			artifactsDir,
			"contract_market_validation20_v2_score.csv",
		),
		csvPath: path.join(
			artifactsDir,
			"contract_market_validation20_v1_v2_comparable_eval.csv",
		),
		mdPath: path.join(
			artifactsDir,
			"contract_market_validation20_v1_v2_comparable_eval.md",
		),
		scope:
			"validation20 是 prior calibration/validation support set，不是 final unseen test.",
	},
];

const combinedMdPath = path.join(
	artifactsDir,
	"contract_market_v1_v2_comparable_eval_combined.md",
);

const numberFields = new Set([
	"humanAmountMinM",
	"humanAmountMaxM",
	"humanAmountMidpointM",
	"v1RangeMinM",
	"v1RangeMaxM",
	"debugPointEstimateM",
]);

const coerceRow = (row) =>
	Object.fromEntries(
		Object.entries(row).map(([key, value]) => {
			if (numberFields.has(key) && value !== "") {
				const parsed = Number(value);
				if (Number.isFinite(parsed)) return [key, parsed];
			}
			return [key, value];
		}),
	);

const readCsv = (csvPath) =>
	csvParse(fs.readFileSync(csvPath, "utf8")).map(coerceRow);

const isFiniteNumber = (value) => Number.isFinite(Number(value));

const mean = (values) => {
	const finite = values.filter(Number.isFinite);
	return finite.length === 0
		? undefined
		: finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const median = (values) => quantile(values, 0.5);

const quantile = (values, q) => {
	const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (finite.length === 0) return undefined;
	const pos = (finite.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	if (finite[base + 1] === undefined) return finite[base];
	return finite[base] + rest * (finite[base + 1] - finite[base]);
};

const count = (rows, predicate) => rows.filter(predicate).length;

const rate = (numerator, denominator) =>
	denominator > 0
		? `${numerator}/${denominator} (${pct(numerator / denominator)})`
		: "";

const pointGapToHumanRange = (point, humanMin, humanMax) => {
	if (
		!isFiniteNumber(point) ||
		!isFiniteNumber(humanMin) ||
		!isFiniteNumber(humanMax)
	) {
		return undefined;
	}
	if (point < humanMin) return humanMin - point;
	if (point > humanMax) return point - humanMax;
	return 0;
};

const pointDirection = (point, humanMin, humanMax) => {
	if (
		!isFiniteNumber(point) ||
		!isFiniteNumber(humanMin) ||
		!isFiniteNumber(humanMax)
	) {
		return "missing";
	}
	if (point < humanMin) return "too_low";
	if (point > humanMax) return "too_high";
	return "inside";
};

const tolerantGapToHumanRange = (point, humanMin, humanMax, toleranceM) => {
	if (
		!isFiniteNumber(point) ||
		!isFiniteNumber(humanMin) ||
		!isFiniteNumber(humanMax)
	) {
		return undefined;
	}
	return Math.max(
		0,
		humanMin - toleranceM - point,
		point - (humanMax + toleranceM),
	);
};

const severe = (gapM, salaryCap) =>
	Number.isFinite(gapM) && (gapM >= 8 || (gapM * 1000) / salaryCap >= 0.05)
		? "yes"
		: "no";

const rangeMissGap = ({ rangeMin, rangeMax, humanMin, humanMax }) => {
	if (
		!isFiniteNumber(rangeMin) ||
		!isFiniteNumber(rangeMax) ||
		!isFiniteNumber(humanMin) ||
		!isFiniteNumber(humanMax)
	) {
		return undefined;
	}
	if (rangeMin <= humanMax && humanMin <= rangeMax) return 0;
	if (rangeMax < humanMin) return humanMin - rangeMax;
	return rangeMin - humanMax;
};

const winner = (v1, v2) => {
	const toleranceM = 0.1;
	if (!Number.isFinite(v1) || !Number.isFinite(v2)) return "";
	if (Math.abs(v1 - v2) <= toleranceM) return "tie";
	return v1 < v2 ? "v1" : "v2";
};

const buildComparableRows = ({ dataset, rows, salaryCap, toleranceM }) =>
	rows
		.filter(
			(row) =>
				row.humanRangeStatus === "parsed" &&
				isFiniteNumber(row.humanAmountMinM) &&
				isFiniteNumber(row.humanAmountMaxM) &&
				isFiniteNumber(row.v1RangeMinM) &&
				isFiniteNumber(row.v1RangeMaxM) &&
				isFiniteNumber(row.debugPointEstimateM),
		)
		.map((row) => {
			const humanMin = Number(row.humanAmountMinM);
			const humanMax = Number(row.humanAmountMaxM);
			const humanMid = (humanMin + humanMax) / 2;
			const v1RangeMinM = Number(row.v1RangeMinM);
			const v1RangeMaxM = Number(row.v1RangeMaxM);
			const v1PointM = (v1RangeMinM + v1RangeMaxM) / 2;
			const v1WidthM = v1RangeMaxM - v1RangeMinM;
			const v2PointM = Number(row.debugPointEstimateM);
			const v1PointGap = pointGapToHumanRange(v1PointM, humanMin, humanMax);
			const v2PointGap = pointGapToHumanRange(v2PointM, humanMin, humanMax);
			const v1TolerantGap = tolerantGapToHumanRange(
				v1PointM,
				humanMin,
				humanMax,
				toleranceM,
			);
			const v2TolerantGap = tolerantGapToHumanRange(
				v2PointM,
				humanMin,
				humanMax,
				toleranceM,
			);
			const v1AbsErrorToHumanMidM = Math.abs(v1PointM - humanMid);
			const v2AbsErrorToHumanMidM = Math.abs(v2PointM - humanMid);
			const v1SignedErrorToHumanMidM = v1PointM - humanMid;
			const v2SignedErrorToHumanMidM = v2PointM - humanMid;
			const intervalMissGapM = rangeMissGap({
				rangeMin: v1RangeMinM,
				rangeMax: v1RangeMaxM,
				humanMin,
				humanMax,
			});
			const v1IntervalScoreM_lambda010 = intervalMissGapM + 0.1 * v1WidthM;
			const v1IntervalScoreM_lambda015 = intervalMissGapM + 0.15 * v1WidthM;
			const v1IntervalScoreM_lambda020 = intervalMissGapM + 0.2 * v1WidthM;

			return {
				dataset,
				caseId: row.caseId,
				globalCaseId: row.globalCaseId,
				name: row.name,
				bucket: row.bucket,
				humanRangeText: row.humanRangeText,
				humanAmountMinM: humanMin,
				humanAmountMaxM: humanMax,
				humanMidpointM: humanMid,
				v1Tier: row.v1Tier,
				v1RangeText: row.v1RangeText,
				v1RangeMinM,
				v1RangeMaxM,
				v1PointM,
				v1WidthM,
				debugPointEstimateM: v2PointM,
				v2WidthM: 0,
				v1PointDirection: pointDirection(v1PointM, humanMin, humanMax),
				v2PointDirection: pointDirection(v2PointM, humanMin, humanMax),
				v1PointGapToHumanRangeM: v1PointGap,
				v2PointGapToHumanRangeM: v2PointGap,
				v1TolerantGapM: v1TolerantGap,
				v2TolerantGapM: v2TolerantGap,
				v1AbsErrorToHumanMidM,
				v2AbsErrorToHumanMidM,
				v1SignedErrorToHumanMidM,
				v2SignedErrorToHumanMidM,
				v1StrictInside: v1PointGap === 0 ? "yes" : "no",
				v2StrictInside: v2PointGap === 0 ? "yes" : "no",
				v1TolerantInside: v1TolerantGap === 0 ? "yes" : "no",
				v2TolerantInside: v2TolerantGap === 0 ? "yes" : "no",
				v1Severe: severe(v1PointGap, salaryCap),
				v2Severe: severe(v2PointGap, salaryCap),
				v1TolerantSevere: severe(v1TolerantGap, salaryCap),
				v2TolerantSevere: severe(v2TolerantGap, salaryCap),
				v1IntervalMissGapM: intervalMissGapM,
				v1IntervalScoreM_lambda010,
				v1IntervalScoreM_lambda015,
				v1IntervalScoreM_lambda020,
				v2IntervalScoreM_lambda015: v2PointGap,
				deltaPointGapM: v2PointGap - v1PointGap,
				deltaAbsMidErrorM: v2AbsErrorToHumanMidM - v1AbsErrorToHumanMidM,
				winnerByPointGap: winner(v1PointGap, v2PointGap),
				winnerByMidError: winner(v1AbsErrorToHumanMidM, v2AbsErrorToHumanMidM),
				riskFlags: row.riskFlags,
				tradeExploitRiskFlag: row.tradeExploitRiskFlag,
			};
		});

const modelSummary = (rows, prefix) => {
	const total = rows.length;
	const pointGapKey = `${prefix}PointGapToHumanRangeM`;
	const tolerantGapKey = `${prefix}TolerantGapM`;
	const absMidKey = `${prefix}AbsErrorToHumanMidM`;
	const signedMidKey = `${prefix}SignedErrorToHumanMidM`;
	const directionKey = `${prefix}PointDirection`;
	const severeKey = `${prefix}Severe`;
	const strictInsideKey = `${prefix}StrictInside`;
	const tolerantInsideKey = `${prefix}TolerantInside`;
	const strictInside = count(rows, (row) => row[strictInsideKey] === "yes");
	const tolerantInside = count(rows, (row) => row[tolerantInsideKey] === "yes");
	const gaps = rows.map((row) => row[pointGapKey]);
	const absMid = rows.map((row) => row[absMidKey]);
	const signedMid = rows.map((row) => row[signedMidKey]);

	return {
		model: prefix,
		labeled: total,
		strictInside: rate(strictInside, total),
		tolerantInside: rate(tolerantInside, total),
		meanPointGapM: round(mean(gaps), 2),
		medianPointGapM: round(median(gaps), 2),
		p75PointGapM: round(quantile(gaps, 0.75), 2),
		p90PointGapM: round(quantile(gaps, 0.9), 2),
		maxPointGapM: round(Math.max(...gaps), 2),
		meanAbsMidErrorM: round(mean(absMid), 2),
		medianAbsMidErrorM: round(median(absMid), 2),
		meanSignedBiasM: round(mean(signedMid), 2),
		tooLow: count(rows, (row) => row[directionKey] === "too_low"),
		tooHigh: count(rows, (row) => row[directionKey] === "too_high"),
		severe: count(rows, (row) => row[severeKey] === "yes"),
		tolerantSevere: count(
			rows,
			(row) => row[`${prefix}TolerantSevere`] === "yes",
		),
		meanTolerantGapM: round(mean(rows.map((row) => row[tolerantGapKey])), 2),
	};
};

const comparisonSummary = (rows) => ({
	v2BetterByPointGap: count(rows, (row) => row.winnerByPointGap === "v2"),
	v1BetterByPointGap: count(rows, (row) => row.winnerByPointGap === "v1"),
	tieByPointGap: count(rows, (row) => row.winnerByPointGap === "tie"),
	v2BetterByMidError: count(rows, (row) => row.winnerByMidError === "v2"),
	v1BetterByMidError: count(rows, (row) => row.winnerByMidError === "v1"),
	tieByMidError: count(rows, (row) => row.winnerByMidError === "tie"),
	meanDeltaGapM: round(mean(rows.map((row) => row.deltaPointGapM)), 2),
	medianDeltaGapM: round(median(rows.map((row) => row.deltaPointGapM)), 2),
	meanDeltaAbsMidErrorM: round(
		mean(rows.map((row) => row.deltaAbsMidErrorM)),
		2,
	),
	medianDeltaAbsMidErrorM: round(
		median(rows.map((row) => row.deltaAbsMidErrorM)),
		2,
	),
});

const bucketSummary = (rows) =>
	[...new Set(rows.map((row) => `${row.dataset}::${row.bucket}`))]
		.map((key) => {
			const [dataset, bucket] = key.split("::");
			const bucketRows = rows.filter(
				(row) => row.dataset === dataset && row.bucket === bucket,
			);
			return {
				dataset,
				bucket,
				count: bucketRows.length,
				v1MedianPointGapM: round(
					median(bucketRows.map((row) => row.v1PointGapToHumanRangeM)),
					2,
				),
				v2MedianPointGapM: round(
					median(bucketRows.map((row) => row.v2PointGapToHumanRangeM)),
					2,
				),
				v1MeanSignedBiasM: round(
					mean(bucketRows.map((row) => row.v1SignedErrorToHumanMidM)),
					2,
				),
				v2MeanSignedBiasM: round(
					mean(bucketRows.map((row) => row.v2SignedErrorToHumanMidM)),
					2,
				),
				v2BetterCount: count(
					bucketRows,
					(row) => row.winnerByPointGap === "v2",
				),
				v1BetterCount: count(
					bucketRows,
					(row) => row.winnerByPointGap === "v1",
				),
				tieCount: count(bucketRows, (row) => row.winnerByPointGap === "tie"),
				stillSevereCases: bucketRows
					.filter((row) => row.v2Severe === "yes")
					.map((row) => row.caseId)
					.join(", "),
			};
		})
		.sort(
			(a, b) =>
				a.dataset.localeCompare(b.dataset) || a.bucket.localeCompare(b.bucket),
		);

const aggregateBucketSummary = (rows) =>
	[...new Set(rows.map((row) => row.bucket))]
		.filter(Boolean)
		.map((bucket) => {
			const bucketRows = rows.filter((row) => row.bucket === bucket);
			return {
				dataset: "combined",
				bucket,
				count: bucketRows.length,
				v1MedianPointGapM: round(
					median(bucketRows.map((row) => row.v1PointGapToHumanRangeM)),
					2,
				),
				v2MedianPointGapM: round(
					median(bucketRows.map((row) => row.v2PointGapToHumanRangeM)),
					2,
				),
				v1MeanSignedBiasM: round(
					mean(bucketRows.map((row) => row.v1SignedErrorToHumanMidM)),
					2,
				),
				v2MeanSignedBiasM: round(
					mean(bucketRows.map((row) => row.v2SignedErrorToHumanMidM)),
					2,
				),
				v2BetterCount: count(
					bucketRows,
					(row) => row.winnerByPointGap === "v2",
				),
				v1BetterCount: count(
					bucketRows,
					(row) => row.winnerByPointGap === "v1",
				),
				tieCount: count(bucketRows, (row) => row.winnerByPointGap === "tie"),
				stillSevereCases: bucketRows
					.filter((row) => row.v2Severe === "yes")
					.map((row) => `${row.dataset}:${row.caseId}`)
					.join(", "),
			};
		})
		.sort((a, b) => a.bucket.localeCompare(b.bucket));

const intervalSummary = (rows) => ({
	meanV1WidthM: round(mean(rows.map((row) => row.v1WidthM)), 2),
	medianV1WidthM: round(median(rows.map((row) => row.v1WidthM)), 2),
	meanIntervalScoreLambda010: round(
		mean(rows.map((row) => row.v1IntervalScoreM_lambda010)),
		2,
	),
	meanIntervalScoreLambda015: round(
		mean(rows.map((row) => row.v1IntervalScoreM_lambda015)),
		2,
	),
	meanIntervalScoreLambda020: round(
		mean(rows.map((row) => row.v1IntervalScoreM_lambda020)),
		2,
	),
	meanV2PointGapM: round(
		mean(rows.map((row) => row.v2PointGapToHumanRangeM)),
		2,
	),
});

const topRows = (rows, sorter, limit = 12) =>
	[...rows].sort(sorter).slice(0, limit);

const exactMaxToleranceRows = (rows) =>
	rows.filter((row) => {
		const bucket = String(row.bucket);
		const nearMax =
			bucket.includes("max") ||
			bucket.includes("near_max") ||
			bucket.includes("high_star") ||
			bucket.startsWith("star_") ||
			String(row.v1Tier).includes("MAX") ||
			Math.max(row.humanAmountMinM, row.humanAmountMaxM) >= 38;
		const toleranceChanged =
			row.v1StrictInside !== row.v1TolerantInside ||
			row.v2StrictInside !== row.v2TolerantInside;
		return nearMax && toleranceChanged;
	});

const misleadingRangeRows = (rows) =>
	rows.filter(
		(row) =>
			row.v1IntervalMissGapM === 0 &&
			(row.v1PointGapToHumanRangeM > 0 || row.v1IntervalScoreM_lambda015 >= 2),
	);

const summaryTableRows = (rows) => [
	modelSummary(rows, "v1"),
	modelSummary(rows, "v2"),
];

const comparisonTableRows = (rows) => {
	const summary = comparisonSummary(rows);
	return [
		{ metric: "v2 better by point gap", value: summary.v2BetterByPointGap },
		{ metric: "v1 better by point gap", value: summary.v1BetterByPointGap },
		{ metric: "tie by point gap", value: summary.tieByPointGap },
		{
			metric: "v2 better by midpoint error",
			value: summary.v2BetterByMidError,
		},
		{
			metric: "v1 better by midpoint error",
			value: summary.v1BetterByMidError,
		},
		{ metric: "tie by midpoint error", value: summary.tieByMidError },
		{ metric: "mean delta point gap M", value: summary.meanDeltaGapM },
		{ metric: "median delta point gap M", value: summary.medianDeltaGapM },
		{
			metric: "mean delta abs midpoint error M",
			value: summary.meanDeltaAbsMidErrorM,
		},
		{
			metric: "median delta abs midpoint error M",
			value: summary.medianDeltaAbsMidErrorM,
		},
	];
};

const conclusionRows = (rows) => {
	const v1 = modelSummary(rows, "v1");
	const v2 = modelSummary(rows, "v2");
	const comparison = comparisonSummary(rows);
	return [
		{
			question: "point-to-range gap",
			answer:
				Number(v2.meanPointGapM) < Number(v1.meanPointGapM)
					? "v2 improves"
					: "v2 does not improve",
			detail: `v1 mean ${v1.meanPointGapM}M vs v2 mean ${v2.meanPointGapM}M`,
		},
		{
			question: "midpoint error",
			answer:
				Number(v2.meanAbsMidErrorM) < Number(v1.meanAbsMidErrorM)
					? "v2 improves"
					: "v2 does not improve",
			detail: `v1 mean ${v1.meanAbsMidErrorM}M vs v2 mean ${v2.meanAbsMidErrorM}M`,
		},
		{
			question: "bias",
			answer:
				Math.abs(Number(v2.meanSignedBiasM)) <
				Math.abs(Number(v1.meanSignedBiasM))
					? "v2 less biased"
					: "v2 not less biased",
			detail: `v1 bias ${v1.meanSignedBiasM}M vs v2 bias ${v2.meanSignedBiasM}M`,
		},
		{
			question: "severe count",
			answer:
				Number(v2.severe) < Number(v1.severe)
					? "v2 improves"
					: Number(v2.severe) === Number(v1.severe)
						? "tie"
						: "v2 worsens",
			detail: `v1 severe ${v1.severe} vs v2 severe ${v2.severe}`,
		},
		{
			question: "winner count",
			answer:
				comparison.v2BetterByPointGap > comparison.v1BetterByPointGap
					? "v2 wins more cases"
					: comparison.v2BetterByPointGap === comparison.v1BetterByPointGap
						? "tie"
						: "v1 wins more cases",
			detail: `v2 ${comparison.v2BetterByPointGap}, v1 ${comparison.v1BetterByPointGap}, tie ${comparison.tieByPointGap}`,
		},
	];
};

const caseColumns = [
	{ key: "dataset", label: "dataset" },
	{ key: "caseId", label: "case" },
	{ key: "globalCaseId", label: "global" },
	{ key: "name", label: "player" },
	{ key: "bucket", label: "bucket" },
	{ key: "humanRangeText", label: "human" },
	{ key: "v1RangeText", label: "v1 range" },
	{ key: "v1PointM", label: "v1 point", format: (v) => round(v, 2) },
	{ key: "debugPointEstimateM", label: "v2 point", format: (v) => round(v, 2) },
	{
		key: "v1PointGapToHumanRangeM",
		label: "v1 gap",
		format: (v) => round(v, 2),
	},
	{
		key: "v2PointGapToHumanRangeM",
		label: "v2 gap",
		format: (v) => round(v, 2),
	},
	{ key: "deltaPointGapM", label: "delta gap", format: (v) => round(v, 2) },
	{
		key: "v1AbsErrorToHumanMidM",
		label: "v1 mid err",
		format: (v) => round(v, 2),
	},
	{
		key: "v2AbsErrorToHumanMidM",
		label: "v2 mid err",
		format: (v) => round(v, 2),
	},
	{ key: "winnerByPointGap", label: "gap winner" },
	{ key: "riskFlags", label: "risk flags" },
	{ key: "tradeExploitRiskFlag", label: "trade risk" },
];

const summaryColumns = [
	{ key: "model", label: "model" },
	{ key: "labeled", label: "labeled" },
	{ key: "strictInside", label: "strict inside" },
	{ key: "tolerantInside", label: "tolerant inside" },
	{ key: "meanPointGapM", label: "mean gap" },
	{ key: "medianPointGapM", label: "median gap" },
	{ key: "p75PointGapM", label: "p75 gap" },
	{ key: "p90PointGapM", label: "p90 gap" },
	{ key: "maxPointGapM", label: "max gap" },
	{ key: "meanAbsMidErrorM", label: "mean mid err" },
	{ key: "medianAbsMidErrorM", label: "median mid err" },
	{ key: "meanSignedBiasM", label: "mean bias" },
	{ key: "tooLow", label: "too_low" },
	{ key: "tooHigh", label: "too_high" },
	{ key: "severe", label: "severe" },
	{ key: "tolerantSevere", label: "tolerant severe" },
];

const bucketColumns = [
	{ key: "dataset", label: "dataset" },
	{ key: "bucket", label: "bucket" },
	{ key: "count", label: "count" },
	{ key: "v1MedianPointGapM", label: "v1 median gap" },
	{ key: "v2MedianPointGapM", label: "v2 median gap" },
	{ key: "v1MeanSignedBiasM", label: "v1 bias" },
	{ key: "v2MeanSignedBiasM", label: "v2 bias" },
	{ key: "v2BetterCount", label: "v2 better" },
	{ key: "v1BetterCount", label: "v1 better" },
	{ key: "tieCount", label: "tie" },
	{ key: "stillSevereCases", label: "still severe" },
];

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
	"v1WidthM",
	"debugPointEstimateM",
	"v2WidthM",
	"v1PointDirection",
	"v2PointDirection",
	"v1PointGapToHumanRangeM",
	"v2PointGapToHumanRangeM",
	"v1TolerantGapM",
	"v2TolerantGapM",
	"v1AbsErrorToHumanMidM",
	"v2AbsErrorToHumanMidM",
	"v1SignedErrorToHumanMidM",
	"v2SignedErrorToHumanMidM",
	"v1StrictInside",
	"v2StrictInside",
	"v1TolerantInside",
	"v2TolerantInside",
	"v1Severe",
	"v2Severe",
	"v1TolerantSevere",
	"v2TolerantSevere",
	"v1IntervalMissGapM",
	"v1IntervalScoreM_lambda010",
	"v1IntervalScoreM_lambda015",
	"v1IntervalScoreM_lambda020",
	"v2IntervalScoreM_lambda015",
	"deltaPointGapM",
	"deltaAbsMidErrorM",
	"winnerByPointGap",
	"winnerByMidError",
	"riskFlags",
	"tradeExploitRiskFlag",
];

const writeDatasetMd = ({ config, rows, salaryCap, toleranceM }) => {
	const interval = intervalSummary(rows);
	const md = `# ${config.dataset} v1/v2 Comparable Evaluation

${config.scope}

## Why This Report Exists

v1 range overlap and v2 point inside are not directly comparable. v1 gets credit if any part of a wide range touches the human range, while v2 is judged as a single point estimate. This report compares both models using the same point-to-human-range gap and human-midpoint error metrics.

Tolerance: max($0.75M, 0.5% cap) = $${toleranceM.toFixed(2)}M. Salary cap: ${money(salaryCap)}.

## Overall Summary

${markdownTable(summaryTableRows(rows), summaryColumns)}

## Winner Summary

${markdownTable(comparisonTableRows(rows), [
	{ key: "metric", label: "metric" },
	{ key: "value", label: "value" },
])}

## By Bucket Summary

${markdownTable(bucketSummary(rows), bucketColumns)}

## Worst Cases

### Biggest v2 misses

${markdownTable(
	topRows(
		rows,
		(a, b) => b.v2PointGapToHumanRangeM - a.v2PointGapToHumanRangeM,
	),
	caseColumns,
)}

### Biggest v1 misses

${markdownTable(
	topRows(
		rows,
		(a, b) => b.v1PointGapToHumanRangeM - a.v1PointGapToHumanRangeM,
	),
	caseColumns,
)}

### v2 improved most vs v1

${markdownTable(
	topRows(rows, (a, b) => a.deltaPointGapM - b.deltaPointGapM),
	caseColumns,
)}

### v2 worsened most vs v1

${markdownTable(
	topRows(rows, (a, b) => b.deltaPointGapM - a.deltaPointGapM),
	caseColumns,
)}

### v1 range overlap was misleading

${markdownTable(
	topRows(
		misleadingRangeRows(rows),
		(a, b) => b.v1IntervalScoreM_lambda015 - a.v1IntervalScoreM_lambda015,
	),
	caseColumns,
)}

### Exact max / near-max cases affected by tolerance

${markdownTable(exactMaxToleranceRows(rows), caseColumns)}

## Interval Width Penalty

For v1 range only: intervalScore = intervalMissGap + lambda * v1WidthM. This penalizes over-wide ranges so range overlap is not counted as a precise prediction.

${markdownTable(
	[
		{
			metric: "mean v1 width",
			value: interval.meanV1WidthM,
		},
		{
			metric: "median v1 width",
			value: interval.medianV1WidthM,
		},
		{
			metric: "mean v1 intervalScore lambda .10",
			value: interval.meanIntervalScoreLambda010,
		},
		{
			metric: "mean v1 intervalScore lambda .15",
			value: interval.meanIntervalScoreLambda015,
		},
		{
			metric: "mean v1 intervalScore lambda .20",
			value: interval.meanIntervalScoreLambda020,
		},
		{
			metric: "mean v2 point gap",
			value: interval.meanV2PointGapM,
		},
	],
	[
		{ key: "metric", label: "metric" },
		{ key: "value", label: "value" },
	],
)}

## Conclusion

${markdownTable(conclusionRows(rows), [
	{ key: "question", label: "metric" },
	{ key: "answer", label: "conclusion" },
	{ key: "detail", label: "detail" },
])}
`;

	fs.writeFileSync(config.mdPath, md);
};

const writeCombinedMd = ({
	datasetRows,
	combinedRows,
	salaryCap,
	toleranceM,
}) => {
	const interval = intervalSummary(combinedRows);
	const datasetSummaryRows = datasetRows.flatMap(({ config, rows }) =>
		summaryTableRows(rows).map((row) => ({
			dataset: config.dataset,
			...row,
		})),
	);

	const md = `# Combined v1/v2 Comparable Evaluation

This report combines boundary40 and validation20. Both are calibration/support sets, not final unseen tests.

v1 range overlap and v2 point inside are not directly comparable, so this report compares both with the same point-to-human-range gap and midpoint error metrics.

Tolerance: max($0.75M, 0.5% cap) = $${toleranceM.toFixed(2)}M. Salary cap: ${money(salaryCap)}.

## Per-Dataset Summary

${markdownTable(datasetSummaryRows, [
	{ key: "dataset", label: "dataset" },
	...summaryColumns,
])}

## Combined Summary

${markdownTable(summaryTableRows(combinedRows), summaryColumns)}

## Combined Winner Summary

${markdownTable(comparisonTableRows(combinedRows), [
	{ key: "metric", label: "metric" },
	{ key: "value", label: "value" },
])}

## By Bucket Summary

${markdownTable(bucketSummary(combinedRows), bucketColumns)}

## Combined Bucket Summary

${markdownTable(aggregateBucketSummary(combinedRows), bucketColumns)}

## Worst Cases

### Biggest v2 misses

${markdownTable(
	topRows(
		combinedRows,
		(a, b) => b.v2PointGapToHumanRangeM - a.v2PointGapToHumanRangeM,
	),
	caseColumns,
)}

### Biggest v1 misses

${markdownTable(
	topRows(
		combinedRows,
		(a, b) => b.v1PointGapToHumanRangeM - a.v1PointGapToHumanRangeM,
	),
	caseColumns,
)}

### v2 improved most vs v1

${markdownTable(
	topRows(combinedRows, (a, b) => a.deltaPointGapM - b.deltaPointGapM),
	caseColumns,
)}

### v2 worsened most vs v1

${markdownTable(
	topRows(combinedRows, (a, b) => b.deltaPointGapM - a.deltaPointGapM),
	caseColumns,
)}

### v1 range overlap was misleading

${markdownTable(
	topRows(
		misleadingRangeRows(combinedRows),
		(a, b) => b.v1IntervalScoreM_lambda015 - a.v1IntervalScoreM_lambda015,
	),
	caseColumns,
)}

### Exact max / near-max cases affected by tolerance

${markdownTable(exactMaxToleranceRows(combinedRows), caseColumns)}

## Interval Width Penalty

For v1 range only: intervalScore = intervalMissGap + lambda * v1WidthM. Wide v1 ranges should not be counted as precise predictions.

${markdownTable(
	[
		{
			metric: "mean v1 width",
			value: interval.meanV1WidthM,
		},
		{
			metric: "median v1 width",
			value: interval.medianV1WidthM,
		},
		{
			metric: "mean v1 intervalScore lambda .10",
			value: interval.meanIntervalScoreLambda010,
		},
		{
			metric: "mean v1 intervalScore lambda .15",
			value: interval.meanIntervalScoreLambda015,
		},
		{
			metric: "mean v1 intervalScore lambda .20",
			value: interval.meanIntervalScoreLambda020,
		},
		{
			metric: "mean v2 point gap",
			value: interval.meanV2PointGapM,
		},
	],
	[
		{ key: "metric", label: "metric" },
		{ key: "value", label: "value" },
	],
)}

## Conclusion

${markdownTable(conclusionRows(combinedRows), [
	{ key: "question", label: "metric" },
	{ key: "answer", label: "conclusion" },
	{ key: "detail", label: "detail" },
])}
`;

	fs.writeFileSync(combinedMdPath, md);
};

const run = () => {
	const save = readSave(savePath);
	const salaryCap = save.gameAttributes.salaryCap;
	const toleranceM = Math.max(0.75, (salaryCap * 0.005) / 1000);
	const datasetRows = DATASETS.map((config) => {
		const rows = buildComparableRows({
			dataset: config.dataset,
			rows: readCsv(config.inputPath),
			salaryCap,
			toleranceM,
		});
		writeCsv(config.csvPath, rows, csvColumns);
		writeDatasetMd({ config, rows, salaryCap, toleranceM });
		return { config, rows };
	});
	const combinedRows = datasetRows.flatMap((entry) => entry.rows);
	writeCombinedMd({ datasetRows, combinedRows, salaryCap, toleranceM });

	const output = Object.fromEntries(
		datasetRows.map(({ config, rows }) => [
			config.dataset,
			{
				labeled: rows.length,
				v1: modelSummary(rows, "v1"),
				v2: modelSummary(rows, "v2"),
				comparison: comparisonSummary(rows),
				csv: path.relative(root, config.csvPath),
				md: path.relative(root, config.mdPath),
			},
		]),
	);
	output.combined = {
		labeled: combinedRows.length,
		v1: modelSummary(combinedRows, "v1"),
		v2: modelSummary(combinedRows, "v2"),
		comparison: comparisonSummary(combinedRows),
		md: path.relative(root, combinedMdPath),
	};
	console.log(JSON.stringify(output, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	run();
}
