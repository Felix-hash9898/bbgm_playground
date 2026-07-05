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
import {
	formatV2ForCsv,
	scoreContractMarketV2,
} from "./contract-market-sandbox-v2.mjs";

const root = process.cwd();
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);
const artifactsDir = path.join(root, "contract_market_artifacts");

const boundaryConfig = {
	name: "boundary40",
	title: "Boundary40 Sandbox v2 Contract Market Scoring",
	scorePath: path.join(artifactsDir, "contract_market_boundary40_score.csv"),
	candidatesPath: path.join(
		artifactsDir,
		"contract_market_boundary40_candidates.csv",
	),
	csvPath: path.join(artifactsDir, "contract_market_boundary40_v2_score.csv"),
	mdPath: path.join(artifactsDir, "contract_market_boundary40_v2_score.md"),
	scopeNote:
		"boundary40 是 boundary/challenge calibration set，不是 final test。A-C 若为空仍按 missing/skip，不把空 human amount 当 0。",
	bucketKey: "bucket",
	bucketLabelKey: "bucketLabel",
};

const validationConfig = {
	name: "validation20",
	title: "Validation20 Sandbox v2 Contract Market Scoring",
	scorePath: path.join(artifactsDir, "contract_market_validation20_score.csv"),
	candidatesPath: path.join(
		artifactsDir,
		"contract_market_validation20_candidates.csv",
	),
	csvPath: path.join(artifactsDir, "contract_market_validation20_v2_score.csv"),
	mdPath: path.join(artifactsDir, "contract_market_validation20_v2_score.md"),
	scopeNote:
		"validation20 也不是 final unseen test，只是 prior calibration/validation support set。它只能提供方向性支持，不能作为最终准确率。",
	bucketKey: "bucket",
	bucketLabelKey: "bucket",
};

const notesPath = path.join(
	root,
	"temp/contract_market_sandbox_v2_implementation_notes.md",
);

const numberLikeFields = new Set([
	"pid",
	"age",
	"ovr",
	"pot",
	"value",
	"valueNoPot",
	"potentialPremium",
	"contractValue",
	"getContractValue",
	"estimatedDemandNoRandom",
	"currentNoOptionAmount",
	"currentNoOptionYears",
	"currentNoOptionCapPct",
	"normalNoOptionContractAmount",
	"normalNoOptionContractYears",
	"normalNoOptionContractCapPct",
	"eligibleMax",
	"minContractForPlayer",
	"humanAmountMinM",
	"humanAmountMaxM",
	"modelRangeMinM",
	"modelRangeMaxM",
	"sandboxModelRangeMinM",
	"sandboxModelRangeMaxM",
	"sandboxGapM",
	"sandboxSignedGapM",
	"sandboxGapCapPct",
	"oldDemandProxyM",
	"oldDemandProxyCapPct",
	"oldDemandGapM",
	"oldDemandSignedGapM",
	"GP",
	"GS",
	"MPG",
	"starterShare",
	"PTS",
	"TRB",
	"AST",
	"STL",
	"BLK",
	"TOV",
	"TS",
	"eFG",
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
	"BLK%",
	"comp_usage",
	"comp_passing",
	"comp_dribbling",
	"comp_shootingThreePointer",
	"comp_rebounding",
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
]);

const coerceRow = (row) =>
	Object.fromEntries(
		Object.entries(row).map(([key, value]) => {
			if (numberLikeFields.has(key) && value !== "") {
				const parsed = Number(value);
				if (Number.isFinite(parsed)) return [key, parsed];
			}
			return [key, value];
		}),
	);

const readCsv = (csvPath) =>
	csvParse(fs.readFileSync(csvPath, "utf8")).map(coerceRow);

const byPid = (rows) => new Map(rows.map((row) => [Number(row.pid), row]));

const firstFinite = (...values) => {
	for (const value of values) {
		if (value === "" || value === undefined || value === null) {
			continue;
		}
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
};

const compareRange = ({
	humanMinM,
	humanMaxM,
	modelMinM,
	modelMaxM,
	salaryCap,
}) => {
	if (
		!Number.isFinite(humanMinM) ||
		!Number.isFinite(humanMaxM) ||
		!Number.isFinite(modelMinM) ||
		!Number.isFinite(modelMaxM)
	) {
		return {
			direction: "missing",
			overlap: "",
			gapM: "",
			signedGapM: "",
			gapCapPct: "",
			severe: "",
		};
	}

	const toleranceM = 0.1;
	if (
		modelMinM <= humanMaxM + toleranceM &&
		humanMinM <= modelMaxM + toleranceM
	) {
		return {
			direction: "overlap",
			overlap: "yes",
			gapM: 0,
			signedGapM: 0,
			gapCapPct: 0,
			severe: "no",
		};
	}

	const tooLow = modelMaxM < humanMinM;
	const gapM = tooLow ? humanMinM - modelMaxM : modelMinM - humanMaxM;
	const gapCapPct = (gapM * 1000) / salaryCap;
	const severe = gapM >= 8 || gapCapPct >= 0.05;
	return {
		direction: tooLow ? "too_low" : "too_high",
		overlap: "no",
		gapM,
		signedGapM: tooLow ? -gapM : gapM,
		gapCapPct,
		severe: severe ? (tooLow ? "severe_low" : "severe_high") : "no",
	};
};

const comparePoint = ({ humanMinM, humanMaxM, pointM, salaryCap }) =>
	compareRange({
		humanMinM,
		humanMaxM,
		modelMinM: pointM,
		modelMaxM: pointM,
		salaryCap,
	});

const absPointGapToRange = (row) => {
	if (
		!Number.isFinite(row.humanAmountMinM) ||
		!Number.isFinite(row.humanAmountMaxM) ||
		!Number.isFinite(row.debugPointEstimateM)
	) {
		return "";
	}
	if (
		row.debugPointEstimateM >= row.humanAmountMinM - 0.1 &&
		row.debugPointEstimateM <= row.humanAmountMaxM + 0.1
	) {
		return 0;
	}
	return row.debugPointEstimateM < row.humanAmountMinM
		? row.humanAmountMinM - row.debugPointEstimateM
		: row.debugPointEstimateM - row.humanAmountMaxM;
};

const median = (values) => {
	const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (finite.length === 0) return "";
	const mid = Math.floor(finite.length / 2);
	return finite.length % 2 === 1
		? finite[mid]
		: (finite[mid - 1] + finite[mid]) / 2;
};

const avg = (values) => {
	const finite = values.filter(Number.isFinite);
	return finite.length === 0
		? ""
		: finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const count = (rows, predicate) => rows.filter(predicate).length;

const riskFlagRows = (rows) => {
	const counts = new Map();
	for (const row of rows) {
		for (const flag of String(row.riskFlags ?? "")
			.split(";")
			.map((flag) => flag.trim())
			.filter(Boolean)) {
			counts.set(flag, (counts.get(flag) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([flag, caseCount]) => ({ flag, caseCount }))
		.sort((a, b) => b.caseCount - a.caseCount || a.flag.localeCompare(b.flag));
};

const summarize = (rows) => {
	const labeled = rows.filter((row) => row.humanRangeStatus === "parsed");
	const missing = rows.filter((row) => row.humanRangeStatus !== "parsed");
	const v1Overlap = count(labeled, (row) => row.v1Direction === "overlap");
	const v1TooLow = count(labeled, (row) => row.v1Direction === "too_low");
	const v1TooHigh = count(labeled, (row) => row.v1Direction === "too_high");
	const v1Severe = count(labeled, (row) =>
		String(row.v1Severe).startsWith("severe"),
	);
	const v2Inside = count(labeled, (row) => row.v2PointDirection === "overlap");
	const v2TooLow = count(labeled, (row) => row.v2PointDirection === "too_low");
	const v2TooHigh = count(
		labeled,
		(row) => row.v2PointDirection === "too_high",
	);
	const v2Severe = count(labeled, (row) =>
		String(row.v2PointSevere).startsWith("severe"),
	);

	return {
		total: rows.length,
		labeled: labeled.length,
		missing: missing.length,
		v1Overlap,
		v1TooLow,
		v1TooHigh,
		v1Severe,
		v2Inside,
		v2TooLow,
		v2TooHigh,
		v2Severe,
		pointMeanAbsMidpointGapM: avg(
			labeled.map((row) => row.v2AbsGapToHumanMidpointM),
		),
		pointMedianAbsMidpointGapM: median(
			labeled.map((row) => row.v2AbsGapToHumanMidpointM),
		),
		pointMeanOutsideRangeGapM: avg(labeled.map((row) => row.v2PointGapM)),
	};
};

const improvementStatus = (row) => {
	if (row.humanRangeStatus !== "parsed") return "missing";
	const v1Gap = Number.isFinite(row.v1GapM) ? row.v1GapM : 0;
	const v2Gap = Number.isFinite(row.v2PointGapM) ? row.v2PointGapM : 0;
	if (row.v1Direction !== "overlap" && row.v2PointDirection === "overlap") {
		return "improved_to_inside";
	}
	if (row.v2PointDirection !== "overlap" && row.v2PointGapM + 0.5 < v1Gap) {
		return "improved_gap";
	}
	if (row.v1Direction === "overlap" && row.v2PointDirection !== "overlap") {
		return "worsened_from_range_overlap";
	}
	if (v2Gap > v1Gap + 2) {
		return "worsened_gap";
	}
	return "roughly_same";
};

const normalizeScoreRow = (scoreRow, config) => {
	const humanMinM = firstFinite(scoreRow.humanAmountMinM);
	const humanMaxM = firstFinite(scoreRow.humanAmountMaxM);
	const humanRangeStatus =
		scoreRow.humanRangeStatus ??
		(Number.isFinite(humanMinM) && Number.isFinite(humanMaxM)
			? "parsed"
			: "missing");
	return {
		caseId: scoreRow.caseId,
		globalCaseId: scoreRow.globalCaseId ?? "",
		pid: scoreRow.pid,
		name: scoreRow.name,
		bucket:
			scoreRow[config.bucketKey] ??
			scoreRow.validationBucket ??
			scoreRow.bucket ??
			"",
		bucketLabel:
			scoreRow[config.bucketLabelKey] ??
			scoreRow.validationBucketLabel ??
			scoreRow.bucketLabel ??
			"",
		humanRangeStatus,
		humanRangeText:
			scoreRow.humanRangeText ??
			(Number.isFinite(humanMinM) && Number.isFinite(humanMaxM)
				? humanMinM === humanMaxM
					? `$${humanMinM.toFixed(2)}M`
					: `$${humanMinM.toFixed(2)}M-$${humanMaxM.toFixed(2)}M`
				: ""),
		humanAmountMinM: humanMinM,
		humanAmountMaxM: humanMaxM,
		humanAmountMidpointM:
			Number.isFinite(humanMinM) && Number.isFinite(humanMaxM)
				? (humanMinM + humanMaxM) / 2
				: "",
		humanNotes: scoreRow.humanNotes ?? scoreRow.humanNote ?? "",
		humanTargetTier:
			scoreRow.humanTargetTier ?? scoreRow.humanTargetTierInferred ?? "",
		humanYears: scoreRow.humanYears ?? "",
	};
};

const buildRows = ({ config, attrs }) => {
	const scoreRows = readCsv(config.scorePath);
	const candidates = byPid(readCsv(config.candidatesPath));

	return scoreRows.map((scoreRow) => {
		const candidate = candidates.get(Number(scoreRow.pid)) ?? {};
		const merged = {
			...candidate,
			...scoreRow,
			debugModelTier:
				candidate.debugModelTier ??
				scoreRow.sandboxModelTier ??
				scoreRow.modelTier,
			debugModelRangeText:
				candidate.debugModelRangeText ??
				scoreRow.sandboxModelRangeText ??
				scoreRow.modelRangeText,
			debugModelReason:
				candidate.debugModelReason ?? scoreRow.modelReason ?? "",
			getContractValue:
				candidate.getContractValue ??
				candidate.contractValue ??
				scoreRow.getContractValue ??
				scoreRow.contractValue,
			contractValue:
				candidate.contractValue ??
				candidate.getContractValue ??
				scoreRow.contractValue ??
				scoreRow.getContractValue,
		};
		const normalized = normalizeScoreRow(scoreRow, config);
		const v1Range = {
			minM: firstFinite(
				scoreRow.sandboxModelRangeMinM,
				scoreRow.modelRangeMinM,
			),
			maxM: firstFinite(
				scoreRow.sandboxModelRangeMaxM,
				scoreRow.modelRangeMaxM,
			),
		};
		const v1 = compareRange({
			humanMinM: normalized.humanAmountMinM,
			humanMaxM: normalized.humanAmountMaxM,
			modelMinM: v1Range.minM,
			modelMaxM: v1Range.maxM,
			salaryCap: attrs.salaryCap,
		});
		const v2 = scoreContractMarketV2(merged, attrs);
		const v2Point = comparePoint({
			humanMinM: normalized.humanAmountMinM,
			humanMaxM: normalized.humanAmountMaxM,
			pointM: v2.debugPointEstimateM,
			salaryCap: attrs.salaryCap,
		});
		const humanMidpoint = normalized.humanAmountMidpointM;
		const absMidpointGap =
			Number.isFinite(humanMidpoint) && Number.isFinite(v2.debugPointEstimateM)
				? Math.abs(v2.debugPointEstimateM - humanMidpoint)
				: "";
		const csvV2 = formatV2ForCsv(v2);
		const oldDemandM =
			firstFinite(scoreRow.oldDemandProxyM) ??
			firstFinite(
				scoreRow.estimatedDemandNoRandom,
				candidate.estimatedDemandNoRandom,
			) / 1000;

		const row = {
			...normalized,
			v1Tier:
				scoreRow.sandboxModelTier ??
				scoreRow.modelTier ??
				candidate.debugModelTier ??
				"",
			v1RangeText:
				scoreRow.sandboxModelRangeText ??
				scoreRow.modelRangeText ??
				candidate.debugModelRangeText ??
				"",
			v1RangeMinM: v1Range.minM,
			v1RangeMaxM: v1Range.maxM,
			v1Direction: v1.direction,
			v1Overlap: v1.overlap,
			v1GapM: v1.gapM,
			v1SignedGapM: v1.signedGapM,
			v1GapCapPct: v1.gapCapPct,
			v1Severe: v1.severe,
			debugTier: csvV2.debugTier,
			debugRangeMinM: csvV2.debugRangeMinM,
			debugRangeMaxM: csvV2.debugRangeMaxM,
			debugRangeText: csvV2.debugRangeText,
			debugPointEstimateM: csvV2.debugPointEstimateM,
			debugPointEstimateText: csvV2.debugPointEstimateText,
			debugYears: csvV2.debugYears,
			tierPlacementScore: csvV2.tierPlacementScore,
			debugReason: csvV2.debugReason,
			modelComponents: csvV2.modelComponents,
			riskFlags: csvV2.riskFlags,
			oldDemandSanityGapM: csvV2.oldDemandSanityGapM,
			oldDemandSanityFlag: csvV2.oldDemandSanityFlag,
			tradeExploitRiskFlag: csvV2.tradeExploitRiskFlag,
			tradeExploitReason: csvV2.tradeExploitReason,
			v2PointDirection: v2Point.direction,
			v2PointInside: v2Point.overlap,
			v2PointGapM: v2Point.gapM,
			v2PointSignedGapM: v2Point.signedGapM,
			v2PointGapCapPct: v2Point.gapCapPct,
			v2PointSevere: v2Point.severe,
			v2AbsGapToHumanMidpointM: absMidpointGap,
			v2AbsGapToHumanRangeM: "",
			oldDemandProxyM: oldDemandM,
			oldDemandProxyText: Number.isFinite(oldDemandM)
				? `$${oldDemandM.toFixed(2)}M`
				: "",
			age: candidate.age ?? scoreRow.age,
			pos: candidate.pos ?? scoreRow.pos,
			ovr: candidate.ovr ?? scoreRow.ovr,
			pot: candidate.pot ?? scoreRow.pot,
			value: candidate.value ?? scoreRow.value,
			valueNoPot: candidate.valueNoPot ?? scoreRow.valueNoPot,
			contractValue:
				candidate.contractValue ??
				candidate.getContractValue ??
				scoreRow.contractValue ??
				scoreRow.getContractValue,
			MPG: candidate.MPG ?? scoreRow.MPG,
			starterShare: candidate.starterShare ?? scoreRow.starterShare,
			PER: candidate.PER ?? scoreRow.PER,
			EWA: candidate.EWA ?? scoreRow.EWA,
			VORP: candidate.VORP ?? scoreRow.VORP,
			BPM: candidate.BPM ?? scoreRow.BPM,
			USG: candidate.USG ?? scoreRow.USG,
		};
		row.v2AbsGapToHumanRangeM = absPointGapToRange(row);
		row.v1v2Change = improvementStatus(row);
		return row;
	});
};

const bucketSummary = (rows) => {
	const buckets = [...new Set(rows.map((row) => row.bucket))].filter(Boolean);
	return buckets.map((bucket) => {
		const bucketRows = rows.filter((row) => row.bucket === bucket);
		const labeled = bucketRows.filter(
			(row) => row.humanRangeStatus === "parsed",
		);
		return {
			bucket,
			cases: bucketRows.length,
			labeled: labeled.length,
			missing: bucketRows.length - labeled.length,
			v1Overlap: count(labeled, (row) => row.v1Direction === "overlap"),
			v1TooLow: count(labeled, (row) => row.v1Direction === "too_low"),
			v1TooHigh: count(labeled, (row) => row.v1Direction === "too_high"),
			v1Severe: count(labeled, (row) =>
				String(row.v1Severe).startsWith("severe"),
			),
			v2Inside: count(labeled, (row) => row.v2PointDirection === "overlap"),
			v2Below: count(labeled, (row) => row.v2PointDirection === "too_low"),
			v2Above: count(labeled, (row) => row.v2PointDirection === "too_high"),
			v2Severe: count(labeled, (row) =>
				String(row.v2PointSevere).startsWith("severe"),
			),
			meanV2PointGapM: avg(labeled.map((row) => row.v2PointSignedGapM)),
		};
	});
};

const tradeSummary = (rows) =>
	["none", "low", "medium", "high"].map((flag) => ({
		tradeExploitRiskFlag: flag,
		count: count(rows, (row) => row.tradeExploitRiskFlag === flag),
	}));

const writeReport = ({ config, rows, attrs }) => {
	const summary = summarize(rows);
	const labeled = rows.filter((row) => row.humanRangeStatus === "parsed");
	const improved = labeled
		.filter((row) => row.v1v2Change.startsWith("improved"))
		.sort((a, b) => b.v1GapM - a.v1GapM)
		.slice(0, 15);
	const worsened = labeled
		.filter((row) => row.v1v2Change.startsWith("worsened"))
		.sort((a, b) => b.v2PointGapM - a.v2PointGapM)
		.slice(0, 15);
	const stillSevere = labeled
		.filter((row) => String(row.v2PointSevere).startsWith("severe"))
		.sort((a, b) => b.v2PointGapM - a.v2PointGapM)
		.slice(0, 20);

	const summaryRows = [
		{ metric: "total cases", v1: summary.total, v2: summary.total },
		{ metric: "labeled cases", v1: summary.labeled, v2: summary.labeled },
		{ metric: "missing/skipped", v1: summary.missing, v2: summary.missing },
		{
			metric: "overlap / point inside",
			v1: summary.v1Overlap,
			v2: summary.v2Inside,
		},
		{
			metric: "too_low / point below",
			v1: summary.v1TooLow,
			v2: summary.v2TooLow,
		},
		{
			metric: "too_high / point above",
			v1: summary.v1TooHigh,
			v2: summary.v2TooHigh,
		},
		{ metric: "severe", v1: summary.v1Severe, v2: summary.v2Severe },
	];
	const pointRows = [
		{
			metric: "mean absolute gap to human midpoint",
			value: round(summary.pointMeanAbsMidpointGapM, 2),
		},
		{
			metric: "median absolute gap to human midpoint",
			value: round(summary.pointMedianAbsMidpointGapM, 2),
		},
		{ metric: "point inside human range", value: summary.v2Inside },
		{ metric: "point below human range", value: summary.v2TooLow },
		{ metric: "point above human range", value: summary.v2TooHigh },
		{
			metric: "mean outside-range gap",
			value: round(summary.pointMeanOutsideRangeGapM, 2),
		},
	];
	const caseColumns = [
		{ key: "caseId", label: "case" },
		{ key: "globalCaseId", label: "global" },
		{ key: "name", label: "player" },
		{ key: "bucket", label: "bucket" },
		{ key: "humanRangeText", label: "human" },
		{ key: "v1Tier", label: "v1 tier" },
		{ key: "v1RangeText", label: "v1 range" },
		{ key: "v1Direction", label: "v1" },
		{ key: "debugPointEstimateText", label: "v2 point" },
		{ key: "v2PointDirection", label: "v2 point" },
		{ key: "v2PointGapM", label: "v2 gap M", format: (v) => round(v, 2) },
		{ key: "riskFlags", label: "risk flags" },
		{ key: "tradeExploitRiskFlag", label: "trade risk" },
		{ key: "v1v2Change", label: "change" },
	];
	const bucketColumns = [
		{ key: "bucket", label: "bucket" },
		{ key: "cases", label: "cases" },
		{ key: "labeled", label: "labeled" },
		{ key: "missing", label: "missing" },
		{ key: "v1Overlap", label: "v1 overlap" },
		{ key: "v1TooLow", label: "v1 low" },
		{ key: "v1TooHigh", label: "v1 high" },
		{ key: "v1Severe", label: "v1 severe" },
		{ key: "v2Inside", label: "v2 inside" },
		{ key: "v2Below", label: "v2 below" },
		{ key: "v2Above", label: "v2 above" },
		{ key: "v2Severe", label: "v2 severe" },
		{
			key: "meanV2PointGapM",
			label: "mean v2 signed gap",
			format: (v) => round(v, 2),
		},
	];

	const md = `# ${config.title}

${config.scopeNote}

v2 仍然保留 v1 的 Debug tier / Debug range。这里的 v2 overlap/too_low/too_high 是用 \`debugPointEstimateM\` 当作 point ask 与 human range 比较；v1 overlap 仍是完整 range 与 human range 比较。因此 v1/v2 数字不是同一口径的最终准确率，而是用于观察 range coverage 与 point placement 的差异。

Severe threshold: 不重叠时 gap >= $8.00M 或 >= 5.0% salary cap（当前 cap ${money(attrs.salaryCap)}，5% cap = ${money(attrs.salaryCap * 0.05)}）。

## v1 vs v2 总览

${markdownTable(summaryRows, [
	{ key: "metric", label: "metric" },
	{ key: "v1", label: "v1 range" },
	{ key: "v2", label: "v2 point" },
])}

## Point Estimate Error

${markdownTable(pointRows, [
	{ key: "metric", label: "metric" },
	{ key: "value", label: "value" },
])}

## By Bucket Summary

${markdownTable(bucketSummary(rows), bucketColumns)}

## Failure Mode Summary

${markdownTable(riskFlagRows(labeled), [
	{ key: "flag", label: "risk / failure flag" },
	{ key: "caseCount", label: "labeled case count" },
])}

## Trade Exploit Risk Summary

Trade exploit risk 是旁路 audit flag，不回流进 \`debugPointEstimateM\`，也没有读取 current trade engine value。

${markdownTable(tradeSummary(rows), [
	{ key: "tradeExploitRiskFlag", label: "tradeExploitRiskFlag" },
	{ key: "count", label: "count" },
])}

## Cases Improved

${improved.length > 0 ? markdownTable(improved, caseColumns) : "_No labeled cases improved by the point placement metric._"}

## Cases Worsened

${worsened.length > 0 ? markdownTable(worsened, caseColumns) : "_No labeled cases worsened by the point placement metric._"}

## Cases Still Severe

${stillSevere.length > 0 ? markdownTable(stillSevere, caseColumns) : "_No v2 point estimate severe misses among labeled cases._"}

## All Cases

${markdownTable(rows, caseColumns)}

## Overfit Risk Notes

- v2 没有按 pid/caseId 写规则，case 只作为 evidence。
- v2 只做 tier-internal point placement 和 audit flags；没有重抽样，也没有把 validation/boundary 当 final test。
- boundary40 candidate 字段少于 validation20，缺失 composite/skill margin 时 v2 会降级到 stats/value/role proxies，因此某些 skillPortability 与 defense flags 需要后续用更完整字段复核。
- trade exploit risk 只标记 cheap ask + high asset proxy 风险，不把当前 trade value 当合同 ask 输入。
`;

	fs.writeFileSync(config.mdPath, md);
};

const csvColumns = [
	"caseId",
	"globalCaseId",
	"pid",
	"name",
	"bucket",
	"bucketLabel",
	"humanRangeStatus",
	"humanRangeText",
	"humanAmountMinM",
	"humanAmountMaxM",
	"humanAmountMidpointM",
	"humanTargetTier",
	"humanYears",
	"humanNotes",
	"v1Tier",
	"v1RangeText",
	"v1RangeMinM",
	"v1RangeMaxM",
	"v1Direction",
	"v1Overlap",
	"v1GapM",
	"v1SignedGapM",
	"v1GapCapPct",
	"v1Severe",
	"debugTier",
	"debugRangeMinM",
	"debugRangeMaxM",
	"debugRangeText",
	"debugPointEstimateM",
	"debugPointEstimateText",
	"debugYears",
	"tierPlacementScore",
	"debugReason",
	"modelComponents",
	"riskFlags",
	"v2PointDirection",
	"v2PointInside",
	"v2PointGapM",
	"v2PointSignedGapM",
	"v2PointGapCapPct",
	"v2PointSevere",
	"v2AbsGapToHumanMidpointM",
	"v2AbsGapToHumanRangeM",
	"v1v2Change",
	"oldDemandProxyM",
	"oldDemandProxyText",
	"oldDemandSanityGapM",
	"oldDemandSanityFlag",
	"tradeExploitRiskFlag",
	"tradeExploitReason",
	"age",
	"pos",
	"ovr",
	"pot",
	"value",
	"valueNoPot",
	"contractValue",
	"MPG",
	"starterShare",
	"PER",
	"EWA",
	"VORP",
	"BPM",
	"USG",
];

const writeImplementationNotes = ({ ranConfigs }) => {
	const md = `# Sandbox v2 Implementation Notes

Implemented artifact-only sandbox v2 scoring.

## Files

- New module: \`tools/contract-market-sandbox-v2.mjs\`
- New scorer: \`tools/contract-market-boundary40-v2-score.mjs\`
- Outputs generated by this run:
${ranConfigs.map((config) => `  - \`${path.relative(root, config.csvPath)}\`\n  - \`${path.relative(root, config.mdPath)}\``).join("\n")}

## Scope

- No \`src/\` changes.
- No commit.
- No boundary40 resampling.
- No v1 artifact overwrite.
- No unseen test set.
- No pid/caseId special rules.

## v2 behavior

v2 keeps v1 Debug tier/range as the base contract ask band and adds a tier-internal point estimate:

\`debugPointEstimateM = debugRangeMinM + tierPlacementScore * (debugRangeMaxM - debugRangeMinM)\`

\`tierPlacementScore\` is built from:

- currentImpactComponent
- roleCertaintyComponent
- futureUpsideComponent
- skillPortabilityComponent
- archetypeRiskComponent
- ageYearsRiskComponent
- productionReliabilityComponent

Trade exploit risk is audit-only and does not feed back into the point estimate.
`;
	fs.writeFileSync(notesPath, md);
};

const runOne = (config, attrs) => {
	const rows = buildRows({ config, attrs });
	writeCsv(config.csvPath, rows, csvColumns);
	writeReport({ config, rows, attrs });
	const summary = summarize(rows);
	console.log(
		JSON.stringify(
			{
				dataset: config.name,
				csv: path.relative(root, config.csvPath),
				md: path.relative(root, config.mdPath),
				...summary,
			},
			null,
			2,
		),
	);
	return { config, rows, summary };
};

const main = () => {
	const args = new Set(process.argv.slice(2));
	const save = readSave(savePath);
	const attrs = save.gameAttributes;
	const configs = args.has("--boundary40-only")
		? [boundaryConfig]
		: args.has("--validation20")
			? [validationConfig]
			: [boundaryConfig, validationConfig];
	const results = configs.map((config) => runOne(config, attrs));
	writeImplementationNotes({ ranConfigs: configs });
	console.log(`Wrote ${path.relative(root, notesPath)}`);
	return results;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
