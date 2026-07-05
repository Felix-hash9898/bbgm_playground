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
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);
const candidatesPath = path.join(
	root,
	"contract_market_artifacts/contract_market_boundary40_candidates.csv",
);
const humanNotesSourcePath = path.join(
	root,
	"temp/contract_market_boundary40_human_notes (1).json",
);
const normalizedHumanNotesPath = path.join(
	root,
	"temp/contract_market_boundary40_human_notes.json",
);
const csvPath = path.join(
	root,
	"contract_market_artifacts/contract_market_boundary40_score.csv",
);
const mdPath = path.join(
	root,
	"contract_market_artifacts/contract_market_boundary40_score.md",
);

const BUCKET_ORDER = [
	"minimum_fringe_negative",
	"minimum_plus_functional_vet",
	"low_rotation",
	"good_rotation_specialist",
	"high_end_rotation_sixth_man",
	"low_end_starter",
	"solid_starter",
	"good_high_starter",
	"star_near_max",
	"superstar_max_lock",
];

const WATCH_BUCKETS = new Set([
	"high_end_rotation_sixth_man",
	"low_end_starter",
	"solid_starter",
	"good_high_starter",
	"star_near_max",
	"superstar_max_lock",
]);

const numberFields = [
	"pid",
	"age",
	"ovr",
	"pot",
	"value",
	"valueNoPot",
	"contractValue",
	"estimatedDemandNoRandom",
	"currentNoOptionAmount",
	"currentNoOptionYears",
	"currentNoOptionCapPct",
	"eligibleMax",
	"minContractForPlayer",
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
	"PER",
	"EWA",
	"VORP",
	"BPM",
	"OBPM",
	"DBPM",
	"On-Off",
	"USG",
];

const coerceRow = (row) => {
	const next = { ...row };
	for (const field of numberFields) {
		if (next[field] !== "") {
			next[field] = Number(next[field]);
		}
	}
	return next;
};

const formatRangeM = (minM, maxM) => {
	if (!Number.isFinite(minM) || !Number.isFinite(maxM)) return "";
	return Math.abs(minM - maxM) < 0.001
		? `$${minM.toFixed(2)}M`
		: `$${minM.toFixed(2)}M-$${maxM.toFixed(2)}M`;
};

const parseAmountRangeM = (raw) => {
	const text = String(raw ?? "")
		.trim()
		.replaceAll("–", "-")
		.replaceAll("—", "-")
		.replaceAll("，", ",");
	if (!text) {
		return {
			status: "missing",
			minM: undefined,
			maxM: undefined,
			text: "",
			parseNotes: "empty humanAmountRangeM",
		};
	}

	const cleaned = text
		.replaceAll("$", "")
		.replaceAll("M", "")
		.replaceAll("m", "")
		.replace(/\s+/g, "");
	const rangeMatch = cleaned.match(
		/^([0-9]+(?:\.[0-9]+)?)-([0-9]+(?:\.[0-9]+)?)$/,
	);
	const singleMatch = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)$/);

	let minM;
	let maxM;
	if (rangeMatch) {
		minM = Number(rangeMatch[1]);
		maxM = Number(rangeMatch[2]);
	} else if (singleMatch) {
		minM = Number(singleMatch[1]);
		maxM = minM;
	} else {
		const numbers = [...cleaned.matchAll(/([0-9]+(?:\.[0-9]+)?)/g)].map(
			(match) => Number(match[1]),
		);
		if (numbers.length >= 2) {
			minM = numbers[0];
			maxM = numbers[1];
		} else if (numbers.length === 1) {
			minM = numbers[0];
			maxM = minM;
		}
	}

	if (!Number.isFinite(minM) || !Number.isFinite(maxM)) {
		return {
			status: "invalid",
			minM: undefined,
			maxM: undefined,
			text,
			parseNotes: "could not parse amount range",
		};
	}

	if (maxM < minM) {
		[minM, maxM] = [maxM, minM];
	}

	return {
		status: "parsed",
		minM,
		maxM,
		text: formatRangeM(minM, maxM),
		parseNotes: "parsed as $M",
	};
};

const parseModelRangeM = (text) => {
	const numbers = [
		...String(text ?? "").matchAll(/\$?([0-9]+(?:\.[0-9]+)?)M/g),
	].map((match) => Number(match[1]));
	if (numbers.length === 0) {
		return { minM: undefined, maxM: undefined };
	}
	if (numbers.length === 1) {
		return { minM: numbers[0], maxM: numbers[0] };
	}
	return {
		minM: Math.min(numbers[0], numbers[1]),
		maxM: Math.max(numbers[0], numbers[1]),
	};
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
	const severeGapM = 8;
	const severeGapCapPct = 0.05;
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
	const severe = gapM >= severeGapM || gapCapPct >= severeGapCapPct;
	return {
		direction: tooLow ? "too_low" : "too_high",
		overlap: "no",
		gapM,
		signedGapM: tooLow ? -gapM : gapM,
		gapCapPct,
		severe: severe ? (tooLow ? "severe_low" : "severe_high") : "no",
	};
};

const comparePoint = ({ humanMinM, humanMaxM, amountM }) => {
	if (
		!Number.isFinite(humanMinM) ||
		!Number.isFinite(humanMaxM) ||
		!Number.isFinite(amountM)
	) {
		return {
			status: "missing",
			gapM: "",
			signedGapM: "",
		};
	}
	const toleranceM = 0.1;
	if (amountM >= humanMinM - toleranceM && amountM <= humanMaxM + toleranceM) {
		return {
			status: "inside",
			gapM: 0,
			signedGapM: 0,
		};
	}
	if (amountM < humanMinM) {
		return {
			status: "too_low",
			gapM: humanMinM - amountM,
			signedGapM: amountM - humanMinM,
		};
	}
	return {
		status: "too_high",
		gapM: amountM - humanMaxM,
		signedGapM: amountM - humanMaxM,
	};
};

const avg = (values) => {
	const finite = values.filter((value) => Number.isFinite(value));
	return finite.length === 0
		? ""
		: finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const count = (rows, predicate) => rows.filter(predicate).length;

const main = () => {
	const save = readSave(savePath);
	const salaryCap = save.gameAttributes.salaryCap;
	const rawCandidates = csvParse(fs.readFileSync(candidatesPath, "utf8")).map(
		coerceRow,
	);
	const humanNotes = JSON.parse(fs.readFileSync(humanNotesSourcePath, "utf8"));

	const notesByPid = new Map(
		Object.values(humanNotes).map((entry) => [Number(entry.pid), entry]),
	);

	const rows = rawCandidates.map((candidate) => {
		const note = notesByPid.get(candidate.pid) ?? {};
		const human = parseAmountRangeM(note.humanAmountRangeM);
		const modelRange = parseModelRangeM(candidate.debugModelRangeText);
		const model = compareRange({
			humanMinM: human.minM,
			humanMaxM: human.maxM,
			modelMinM: modelRange.minM,
			modelMaxM: modelRange.maxM,
			salaryCap,
		});
		const oldDemandM = candidate.estimatedDemandNoRandom / 1000;
		const oldDemand = comparePoint({
			humanMinM: human.minM,
			humanMaxM: human.maxM,
			amountM: oldDemandM,
		});

		return {
			caseId: candidate.caseId,
			globalCaseId: candidate.globalCaseId,
			noteCaseId: note.caseId ?? "",
			pid: candidate.pid,
			name: candidate.name,
			bucket: candidate.bucket,
			bucketLabel: candidate.bucketLabel,
			humanTargetTier: note.humanTargetTier ?? "",
			humanAmountRangeM: note.humanAmountRangeM ?? "",
			humanRangeStatus: human.status,
			humanRangeText: human.text,
			humanAmountMinM: human.minM,
			humanAmountMaxM: human.maxM,
			humanYears: note.humanYears ?? "",
			humanNotes: note.humanNotes ?? "",
			parseNotes: human.parseNotes,
			sandboxModelTier: candidate.debugModelTier,
			sandboxModelRangeText: candidate.debugModelRangeText,
			sandboxModelRangeMinM: modelRange.minM,
			sandboxModelRangeMaxM: modelRange.maxM,
			sandboxDirection: model.direction,
			sandboxOverlap: model.overlap,
			sandboxGapM: model.gapM,
			sandboxSignedGapM: model.signedGapM,
			sandboxGapCapPct: model.gapCapPct,
			sandboxSevere: model.severe,
			oldDemandProxyM: oldDemandM,
			oldDemandProxyText: money(candidate.estimatedDemandNoRandom),
			oldDemandProxyCapPct: candidate.estimatedDemandNoRandom / salaryCap,
			oldDemandVsHuman: oldDemand.status,
			oldDemandGapM: oldDemand.gapM,
			oldDemandSignedGapM: oldDemand.signedGapM,
			currentNoOptionAmount: candidate.currentNoOptionAmount,
			currentNoOptionYears: candidate.currentNoOptionYears,
			currentNoOptionCapPct: candidate.currentNoOptionCapPct,
			age: candidate.age,
			pos: candidate.pos,
			ovr: candidate.ovr,
			pot: candidate.pot,
			value: candidate.value,
			valueNoPot: candidate.valueNoPot,
			contractValue: candidate.contractValue,
			MPG: candidate.MPG,
			starterShare: candidate.starterShare,
			PER: candidate.PER,
			EWA: candidate.EWA,
			VORP: candidate.VORP,
			BPM: candidate.BPM,
			USG: candidate.USG,
			awardsSummary: candidate.awardsSummary,
		};
	});

	const normalizedHumanNotes = Object.fromEntries(
		rawCandidates.map((candidate) => {
			const note = notesByPid.get(candidate.pid) ?? {};
			return [
				`boundary40-${candidate.pid}`,
				{
					caseId: candidate.caseId,
					globalCaseId: candidate.globalCaseId,
					noteCaseId: note.caseId ?? "",
					pid: candidate.pid,
					bucket: candidate.bucket,
					humanTargetTier: note.humanTargetTier ?? "",
					humanAmountRangeM: note.humanAmountRangeM ?? "",
					humanYears: note.humanYears ?? "",
					humanNotes: note.humanNotes ?? "",
				},
			];
		}),
	);
	fs.writeFileSync(
		normalizedHumanNotesPath,
		`${JSON.stringify(normalizedHumanNotes, null, "\t")}\n`,
	);

	writeCsv(csvPath, rows, [
		"caseId",
		"globalCaseId",
		"noteCaseId",
		"pid",
		"name",
		"bucket",
		"bucketLabel",
		"humanTargetTier",
		"humanAmountRangeM",
		"humanRangeStatus",
		"humanRangeText",
		"humanAmountMinM",
		"humanAmountMaxM",
		"humanYears",
		"humanNotes",
		"parseNotes",
		"sandboxModelTier",
		"sandboxModelRangeText",
		"sandboxModelRangeMinM",
		"sandboxModelRangeMaxM",
		"sandboxDirection",
		"sandboxOverlap",
		"sandboxGapM",
		"sandboxSignedGapM",
		"sandboxGapCapPct",
		"sandboxSevere",
		"oldDemandProxyM",
		"oldDemandProxyText",
		"oldDemandProxyCapPct",
		"oldDemandVsHuman",
		"oldDemandGapM",
		"oldDemandSignedGapM",
		"currentNoOptionAmount",
		"currentNoOptionYears",
		"currentNoOptionCapPct",
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
		"awardsSummary",
	]);

	const labeledRows = rows.filter((row) => row.humanRangeStatus === "parsed");
	const missingRows = rows.filter((row) => row.humanRangeStatus !== "parsed");
	const overlapRows = labeledRows.filter(
		(row) => row.sandboxDirection === "overlap",
	);
	const tooLowRows = labeledRows.filter(
		(row) => row.sandboxDirection === "too_low",
	);
	const tooHighRows = labeledRows.filter(
		(row) => row.sandboxDirection === "too_high",
	);
	const severeRows = labeledRows.filter((row) =>
		String(row.sandboxSevere).startsWith("severe"),
	);

	const bucketSummary = BUCKET_ORDER.map((bucket) => {
		const bucketRows = rows.filter((row) => row.bucket === bucket);
		const bucketLabeled = bucketRows.filter(
			(row) => row.humanRangeStatus === "parsed",
		);
		return {
			bucket,
			cases: bucketRows.length,
			labeled: bucketLabeled.length,
			missing: bucketRows.length - bucketLabeled.length,
			overlap: count(
				bucketLabeled,
				(row) => row.sandboxDirection === "overlap",
			),
			tooLow: count(bucketLabeled, (row) => row.sandboxDirection === "too_low"),
			tooHigh: count(
				bucketLabeled,
				(row) => row.sandboxDirection === "too_high",
			),
			severe: count(bucketLabeled, (row) =>
				String(row.sandboxSevere).startsWith("severe"),
			),
			meanGapM: avg(bucketLabeled.map((row) => row.sandboxSignedGapM)),
			meanAbsGapM: avg(bucketLabeled.map((row) => row.sandboxGapM)),
			oldInside: count(
				bucketLabeled,
				(row) => row.oldDemandVsHuman === "inside",
			),
			oldTooLow: count(
				bucketLabeled,
				(row) => row.oldDemandVsHuman === "too_low",
			),
			oldTooHigh: count(
				bucketLabeled,
				(row) => row.oldDemandVsHuman === "too_high",
			),
		};
	});

	const oldDemandSummary = [
		{
			status: "inside",
			count: count(labeledRows, (row) => row.oldDemandVsHuman === "inside"),
		},
		{
			status: "too_low",
			count: count(labeledRows, (row) => row.oldDemandVsHuman === "too_low"),
		},
		{
			status: "too_high",
			count: count(labeledRows, (row) => row.oldDemandVsHuman === "too_high"),
		},
		{
			status: "missing",
			count: count(rows, (row) => row.oldDemandVsHuman === "missing"),
		},
	];

	const importantMisses = labeledRows
		.filter(
			(row) =>
				row.sandboxDirection !== "overlap" && WATCH_BUCKETS.has(row.bucket),
		)
		.sort((a, b) => b.sandboxGapM - a.sandboxGapM)
		.slice(0, 15);
	const allLargestMisses = labeledRows
		.filter((row) => row.sandboxDirection !== "overlap")
		.sort((a, b) => b.sandboxGapM - a.sandboxGapM)
		.slice(0, 12);

	const caseColumns = [
		{ key: "caseId", label: "case" },
		{ key: "globalCaseId", label: "global" },
		{ key: "name", label: "player" },
		{ key: "bucket", label: "bucket" },
		{ key: "humanRangeText", label: "human range" },
		{ key: "sandboxModelTier", label: "sandbox tier" },
		{ key: "sandboxModelRangeText", label: "sandbox range" },
		{ key: "sandboxDirection", label: "sandbox vs human" },
		{ key: "sandboxGapM", label: "gap M", format: (v) => round(v, 2) },
		{ key: "sandboxSevere", label: "severe" },
		{ key: "oldDemandProxyText", label: "old demand" },
		{ key: "oldDemandProxyCapPct", label: "old demand cap%", format: pct },
		{ key: "oldDemandVsHuman", label: "old vs human" },
		{ key: "humanNotes", label: "human notes" },
	];
	const bucketColumns = [
		{ key: "bucket", label: "bucket" },
		{ key: "cases", label: "cases" },
		{ key: "labeled", label: "labeled" },
		{ key: "missing", label: "missing" },
		{ key: "overlap", label: "overlap" },
		{ key: "tooLow", label: "too_low" },
		{ key: "tooHigh", label: "too_high" },
		{ key: "severe", label: "severe" },
		{ key: "meanGapM", label: "mean signed gap M", format: (v) => round(v, 2) },
		{ key: "meanAbsGapM", label: "mean abs gap M", format: (v) => round(v, 2) },
		{ key: "oldInside", label: "old inside" },
		{ key: "oldTooLow", label: "old too_low" },
		{ key: "oldTooHigh", label: "old too_high" },
	];
	const missingColumns = [
		{ key: "caseId", label: "case" },
		{ key: "globalCaseId", label: "global" },
		{ key: "name", label: "player" },
		{ key: "bucket", label: "bucket" },
		{ key: "humanAmountRangeM", label: "humanAmountRangeM" },
		{ key: "humanRangeStatus", label: "status" },
	];
	const oldDemandColumns = [
		{ key: "status", label: "old demand vs human" },
		{ key: "count", label: "count" },
	];

	const md = `# Boundary40 Contract Market Scoring

结论先说：boundary40 是 boundary/challenge calibration set，不是 final test。当前只应把结果当作 sandbox model 与人工目标、old/current BBGM demand proxy 的差异诊断，不应直接当成最终准确率。

输入来源：

- candidates: \`${path.relative(root, candidatesPath)}\`
- human notes source: \`${path.relative(root, humanNotesSourcePath)}\`
- normalized copy written for follow-up scripts: \`${path.relative(root, normalizedHumanNotesPath)}\`

用户 human amount 的含义：这些金额大体综合了用户自己愿不愿意签、球员未来发展/潜力、交易价值/倒卖风险。这里的 \`Demand / Cap\` 是 old/current BBGM demand proxy，不是 sandbox model prediction；sandbox model prediction 来自 candidates 的 \`debugModelTier/debugModelRangeText\`。

## 总览

- Total cases: ${rows.length}
- Labeled cases: ${labeledRows.length}
- Missing/skipped cases: ${missingRows.length}
- Sandbox overlap: ${overlapRows.length}/${labeledRows.length}
- Sandbox too_low: ${tooLowRows.length}
- Sandbox too_high: ${tooHighRows.length}
- Severe miss: ${severeRows.length}
- Severe threshold: sandbox range 与 human range 不重叠时，边界距离 >= $8.00M 或 >= 5.0% salary cap（当前 cap ${money(salaryCap)}，5% cap = ${money(salaryCap * 0.05)}）记为 severe_low / severe_high。

A-C 目前不可用于 scoring：用户从 D 组开始填，A-C 的 humanAmountRangeM 为空。空值没有当作 0，也没有猜测，全部按 missing/skip 处理。

## 是否足够支持继续改规则

足够支持继续做 sandbox 规则修正，但仍不足以当 final test。信号最集中在 mid/high bucket：\`high_end_rotation_sixth_man\`、\`low_end_starter\`、\`solid_starter\`、\`good_high_starter\`、\`star_near_max\` 和 J bucket（旧字段 \`superstar_max_lock\`，当前 label 为 upper-star/max-borderline）。当前 labeled 样本里 sandbox miss 全部是 too_low，没有 too_high；应优先修 amount ladder、starter/high-starter gap、near-max 上沿，再用 anchors + validation20 + 更多 boundary samples 复核。old demand proxy 则呈现 inside / too_low / too_high 混合，说明它是另一条需要单独诊断的旧需求口径。

## Bucket 汇总

${markdownTable(bucketSummary, bucketColumns)}

注：mean signed gap M 为 sandbox 相对 human 的有符号距离，负数表示 sandbox range 低于 human range；overlap 记 0。

## Old Demand Proxy 汇总

${markdownTable(oldDemandSummary, oldDemandColumns)}

## Case 明细

${markdownTable(rows, caseColumns)}

## Missing / Skipped Cases

这些 case 没有进入 overlap/too_low/too_high 分母。

${markdownTable(missingRows, missingColumns)}

## 最大 miss cases（重点 buckets）

${markdownTable(importantMisses, caseColumns)}

## 最大 miss cases（全体 labeled）

${markdownTable(allLargestMisses, caseColumns)}

## 方向性诊断

- D 组 good_rotation/specialist：人工目标偏低的样本会暴露 sandbox 是否把 specialist/young-upside 拉得过高或过宽。
- E/F/G 组：这是最该优先看的区域。这里覆盖 sixth-man、高分钟低效率 starter、solid starter，也是当前模型 amount ladder 空档和 LOW_END_STARTER 上沿问题的核心。
- H/I/J 组：用于判断 high-starter、near-max、upper-star/max-borderline 是否应该推到 exact max 或保留 max 以下。J bucket 不是 exact-max lock；exact max calibration 仍要结合 anchor15 和 validation20。
- old demand proxy 与 human 的差异可以作为 BBGM 旧需求口径诊断，但不能替代 sandbox model scoring。

## Trade-value Sanity Note

用户的 human target 已经部分综合使用价值、未来发展、交易价值。后续正式接入前应增加 trade-value sanity audit，避免合同 ask 偏低导致可倒卖资产套利。尤其是年轻高潜、正资产 starter、near-max 上沿球员，需要检查“签下后是否明显可立刻交易套利”，而不只是检查 AAV 是否看起来合理。
`;

	fs.writeFileSync(mdPath, md);

	console.log(`Wrote ${path.relative(root, normalizedHumanNotesPath)}`);
	console.log(`Wrote ${path.relative(root, csvPath)}`);
	console.log(`Wrote ${path.relative(root, mdPath)}`);
	console.log(
		JSON.stringify(
			{
				total: rows.length,
				labeled: labeledRows.length,
				missing: missingRows.length,
				overlap: overlapRows.length,
				too_low: tooLowRows.length,
				too_high: tooHighRows.length,
				severe: severeRows.length,
			},
			null,
			2,
		),
	);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
