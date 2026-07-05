#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	markdownTable,
	money,
	pct,
	readJsonIfExists,
	readSave,
	round,
	writeCsv,
} from "./contract-market-proxy-core.mjs";
import {
	MODEL_TIERS,
	scoreTier,
	tierRange,
} from "./contract-market-tier-score.mjs";

const root = process.cwd();
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);
const humanNotesPath = path.join(
	root,
	"temp/contract_market_validation20_human_notes.json",
);
const candidatesPath = path.join(
	root,
	"contract_market_artifacts/contract_market_validation20_candidates.csv",
);
const anchorTargetsPath = path.join(
	root,
	"contract_market_artifacts/contract_market_anchor_targets.json",
);
const csvPath = path.join(
	root,
	"contract_market_artifacts/contract_market_validation20_score.csv",
);
const mdPath = path.join(
	root,
	"contract_market_artifacts/contract_market_validation20_score.md",
);

const DIAGNOSTIC_LADDER = [
	{
		tier: "MINIMUM_LEVEL",
		description: "player minimum to about 1.15x player minimum",
		min: "playerMinimum",
		max: "minimumMultiplier",
		maxMultiplier: 1.15,
	},
	{
		tier: "MINIMUM_PLUS",
		description: "about 1.15x player minimum to 3.5% cap",
		min: "minimumMultiplier",
		minMultiplier: 1.15,
		maxPct: 0.035,
	},
	{
		tier: "LOW_ROTATION",
		description: "3.5%-5.5% cap",
		minPct: 0.035,
		maxPct: 0.055,
	},
	{
		tier: "GOOD_ROTATION / SPECIALIST",
		description: "5.5%-8.0% cap",
		minPct: 0.055,
		maxPct: 0.08,
	},
	{
		tier: "HIGH_END_ROTATION",
		description: "8.0%-10.0% cap",
		minPct: 0.08,
		maxPct: 0.1,
	},
	{
		tier: "LOW_END_STARTER",
		description: "10.0%-14.0% cap",
		minPct: 0.1,
		maxPct: 0.14,
	},
	{
		tier: "SOLID_STARTER",
		description: "14.0%-18.0% cap",
		minPct: 0.14,
		maxPct: 0.18,
	},
	{
		tier: "GOOD_STARTER",
		description: "18.0%-22.5% cap",
		minPct: 0.18,
		maxPct: 0.225,
	},
	{
		tier: "HIGH_STARTER / YOUNG_PROVEN_STARTER",
		description: "22.5%-30.0% cap",
		minPct: 0.225,
		maxPct: 0.3,
	},
	{
		tier: "STAR_NEAR_MAX",
		description: "30.0% cap to eligible max below exact max",
		minPct: 0.3,
		max: "eligibleMax",
	},
	{
		tier: "SUPERSTAR_MAX",
		description: "eligible max",
		min: "eligibleMax",
		max: "eligibleMax",
	},
];

const DIAGNOSTIC_TIER_SCORE = Object.fromEntries(
	DIAGNOSTIC_LADDER.map((entry, index) => [entry.tier, index + 1]),
);

const MODEL_TIER_AMOUNT_SCORE = {
	MINIMUM_LEVEL: 1,
	VETERAN_MINIMUM_PLUS: 2,
	LOW_ROTATION_PLUS: 2,
	SPECIALIST_ROTATION: 3,
	YOUNG_UPSIDE_SUSPECT: 2,
	VETERAN_ROTATION_GUARD: 3,
	LOW_END_STARTER: 5,
	YOUNG_PROVEN_STARTER: 9,
	STAR_NEAR_MAX: 10,
	SUPERSTAR_MAX: 11,
};

const parseCsv = (text) => {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (char !== "\r") {
			field += char;
		}
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	const [header, ...body] = rows;
	return body
		.filter((values) => values.some((value) => value !== ""))
		.map((values) =>
			Object.fromEntries(
				header.map((key, index) => [key, values[index] ?? ""]),
			),
		);
};

const numberFields = [
	"pid",
	"age",
	"ovr",
	"pot",
	"value",
	"valueNoPot",
	"potentialPremium",
	"getContractValue",
	"estimatedDemandNoRandom",
	"normalNoOptionContractAmount",
	"normalNoOptionContractYears",
	"normalNoOptionContractCapPct",
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
];

const coerceCandidateRow = (row) => {
	const coerced = { ...row };
	for (const field of numberFields) {
		if (coerced[field] !== "") {
			coerced[field] = Number(coerced[field]);
		}
	}
	return coerced;
};

const rangesOverlap = (aMin, aMax, bMin, bMax) => {
	const toleranceM = 0.1;
	return aMin <= bMax + toleranceM && bMin <= aMax + toleranceM;
};

const parseModelRangeM = (text) => {
	const numbers = [...String(text).matchAll(/\$?([0-9]+(?:\.[0-9]+)?)M/g)].map(
		(match) => Number(match[1]),
	);
	if (numbers.length === 0) {
		return {};
	}
	if (numbers.length === 1) {
		return { modelRangeMinM: numbers[0], modelRangeMaxM: numbers[0] };
	}
	return {
		modelRangeMinM: Math.min(numbers[0], numbers[1]),
		modelRangeMaxM: Math.max(numbers[0], numbers[1]),
	};
};

const amountFromEntry = (entry, row, attrs, side) => {
	if (entry[side] === "playerMinimum") {
		return row.minContractForPlayer / 1000;
	}
	if (entry[side] === "minimumMultiplier") {
		return (row.minContractForPlayer * entry[`${side}Multiplier`]) / 1000;
	}
	if (entry[side] === "eligibleMax") {
		return row.eligibleMax / 1000;
	}
	const pctKey = `${side}Pct`;
	if (entry[pctKey] !== undefined) {
		return (attrs.salaryCap * entry[pctKey]) / 1000;
	}
	const multiplierKey = `${side}Multiplier`;
	if (entry[multiplierKey] !== undefined) {
		return (row.minContractForPlayer * entry[multiplierKey]) / 1000;
	}
	throw new Error(`Could not resolve ${side} for ${entry.tier}`);
};

const diagnosticLadderRows = (sampleRow, attrs) =>
	DIAGNOSTIC_LADDER.map((entry) => {
		const minM = amountFromEntry(entry, sampleRow, attrs, "min");
		const maxM = amountFromEntry(entry, sampleRow, attrs, "max");
		return {
			...entry,
			minM,
			maxM,
			rangeText:
				minM === maxM
					? `$${minM.toFixed(2)}M`
					: `$${minM.toFixed(2)}M-$${maxM.toFixed(2)}M`,
			capRangeText:
				minM === maxM
					? pct((minM * 1000) / attrs.salaryCap)
					: `${pct((minM * 1000) / attrs.salaryCap)}-${pct((maxM * 1000) / attrs.salaryCap)}`,
		};
	});

const inferTierFromAmount = (
	{ minM, maxM, exactMinimum },
	sampleRow,
	attrs,
) => {
	if (exactMinimum) {
		return "MINIMUM_LEVEL";
	}
	const midpoint = (minM + maxM) / 2;
	const rows = diagnosticLadderRows(sampleRow, attrs);
	const entry = rows.find(
		(row) => midpoint >= row.minM - 0.001 && midpoint <= row.maxM + 0.001,
	);
	return (
		entry?.tier ??
		(midpoint >= sampleRow.eligibleMax / 1000 ? "SUPERSTAR_MAX" : "")
	);
};

const parseHumanNote = (note, row, attrs) => {
	const normalized = String(note ?? "")
		.trim()
		.replaceAll("–", "-")
		.replaceAll("—", "-")
		.replaceAll("，", ",");
	const parseNotes = [];
	const hasMinimumText = /底薪|minimum/i.test(normalized);
	let humanAmountMinM;
	let humanAmountMaxM;
	let humanYears = "";

	const moneyRange = normalized.match(
		/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*M?\s*-\s*\$?\s*([0-9]+(?:\.[0-9]+)?)\s*M?/i,
	);
	const moneySingle = normalized.match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*M/i);

	if (moneyRange) {
		humanAmountMinM = Number(moneyRange[1]);
		humanAmountMaxM = Number(moneyRange[2]);
		parseNotes.push("parsed numeric amount range from note");
	} else if (moneySingle) {
		humanAmountMinM = Number(moneySingle[1]);
		humanAmountMaxM = humanAmountMinM;
		parseNotes.push("parsed single $ amount from note");
	} else {
		const plainRange = normalized.match(
			/(^|[^0-9])([0-9]+(?:\.[0-9]+)?)\s*-\s*([0-9]+(?:\.[0-9]+)?)(?![0-9])/,
		);
		if (plainRange) {
			humanAmountMinM = Number(plainRange[2]);
			humanAmountMaxM = Number(plainRange[3]);
			parseNotes.push("parsed bare numeric amount range as $M");
		}
	}

	if (hasMinimumText) {
		parseNotes.push("note includes minimum-salary text");
		if (humanAmountMinM === undefined) {
			humanAmountMinM = row.minContractForPlayer / 1000;
			humanAmountMaxM = humanAmountMinM;
			parseNotes.push("used player-specific minimum for amount");
		}
	}

	if (humanAmountMinM !== undefined && humanAmountMaxM < humanAmountMinM) {
		[humanAmountMinM, humanAmountMaxM] = [humanAmountMaxM, humanAmountMinM];
		parseNotes.push("normalized reversed range bounds");
	}

	const yearsMatch = normalized.match(/([1-5])\s*(?:年|yr|yrs|years)/i);
	if (yearsMatch) {
		humanYears = yearsMatch[1];
		parseNotes.push("parsed explicit years");
	}

	const humanTargetTierInferred =
		humanAmountMinM === undefined
			? ""
			: inferTierFromAmount(
					{
						minM: humanAmountMinM,
						maxM: humanAmountMaxM,
						exactMinimum: hasMinimumText && humanAmountMinM === humanAmountMaxM,
					},
					row,
					attrs,
				);

	return {
		humanAmountMinM,
		humanAmountMaxM,
		humanTargetTierInferred,
		humanYears,
		parseNotes: parseNotes.join("; "),
	};
};

const directionForRanges = (humanMinM, humanMaxM, modelMinM, modelMaxM) => {
	if (rangesOverlap(humanMinM, humanMaxM, modelMinM, modelMaxM)) {
		return "roughly aligned";
	}
	if (modelMaxM < humanMinM) {
		return "too low";
	}
	if (modelMinM > humanMaxM) {
		return "too high";
	}
	return "roughly aligned";
};

const tierDistanceLabel = (humanTier, modelTier) => {
	const humanScore = DIAGNOSTIC_TIER_SCORE[humanTier];
	const modelScore = MODEL_TIER_AMOUNT_SCORE[modelTier];
	if (!humanScore || !modelScore) {
		return { tierDistance: "", tierMissSeverity: "unknown" };
	}
	const tierDistance = modelScore - humanScore;
	const abs = Math.abs(tierDistance);
	return {
		tierDistance,
		tierMissSeverity:
			abs === 0
				? "same band"
				: abs === 1
					? "adjacent"
					: abs <= 3
						? "cross-band"
						: "severe",
	};
};

const shortReason = (row) => {
	if (row.direction === "roughly aligned") {
		return "range overlap; validation20 is supportive but not final-test evidence";
	}
	const details = [
		`human ${row.parsedHumanRange}`,
		`model ${row.modelRangeText}`,
		`${row.tierMissSeverity} amount-tier gap`,
	];
	if (row.modelYears || row.humanYears) {
		details.push("term should be diagnosed separately from AAV");
	}
	return `${details.join("; ")}; direction signal only, needs anchor/boundary confirmation`;
};

const currentModelCoverageRows = (sampleRow, attrs) => {
	const rows = Object.entries(MODEL_TIERS).map(([tier, spec]) => {
		const range = tierRange(tier, sampleRow, attrs);
		return {
			tier,
			rangeType: spec.rangeType,
			minM: range.modelRangeMin / 1000,
			maxM: range.modelRangeMax / 1000,
			rangeText: range.modelRangeText,
			capRangeText: range.modelCapRangeText,
			years: spec.years ?? "",
		};
	});
	return rows.sort((a, b) => a.minM - b.minM || a.maxM - b.maxM);
};

const coverageDiagnostics = (rows, sampleRow) => {
	const minM = sampleRow.minContractForPlayer / 1000;
	const maxM = sampleRow.eligibleMax / 1000;
	const issues = [];
	let cursor = minM;
	const gaps = [];
	const overlaps = [];

	for (const row of rows) {
		if (row.minM > cursor + 0.1) {
			gaps.push({ minM: cursor, maxM: row.minM, before: row.tier });
		}
		if (row.minM < cursor - 0.1) {
			overlaps.push({
				minM: row.minM,
				maxM: Math.min(cursor, row.maxM),
				tier: row.tier,
			});
		}
		cursor = Math.max(cursor, row.maxM);
	}
	if (cursor < maxM - 0.1) {
		gaps.push({ minM: cursor, maxM, before: "eligible max" });
	}

	if (gaps.length > 0) {
		issues.push(
			`current MODEL_TIERS leave amount gaps: ${gaps
				.map(
					(gap) =>
						`$${gap.minM.toFixed(2)}M-$${gap.maxM.toFixed(2)}M before ${gap.before}`,
				)
				.join("; ")}`,
		);
	}
	if (overlaps.length > 0) {
		issues.push(
			`current MODEL_TIERS overlap in low/mid bands: ${overlaps
				.map(
					(overlap) =>
						`${overlap.tier} touches $${overlap.minM.toFixed(2)}M-$${overlap.maxM.toFixed(2)}M`,
				)
				.join("; ")}`,
		);
	}
	if (
		rows.some(
			(row) => row.tier.includes("YOUNG") || row.tier.includes("VETERAN"),
		)
	) {
		issues.push(
			"amount bands and player-type labels are mixed in MODEL_TIERS, so coverage diagnostics should be separated from archetype/term rules",
		);
	}
	if (
		rows.some(
			(row) =>
				row.tier === "LOW_END_STARTER" && row.maxM < (0.14 * 154650) / 1000,
		)
	) {
		issues.push(
			"LOW_END_STARTER upper edge is below the suggested 10%-14% cap diagnostic band",
		);
	}

	return { gaps, overlaps, issues };
};

const countBy = (rows, key) => {
	const counts = new Map();
	for (const row of rows) {
		counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
	}
	return [...counts.entries()].map(([name, count]) => ({ name, count }));
};

const main = () => {
	const save = readSave(savePath);
	const attrs = {
		season: save.gameAttributes.season,
		phase: save.gameAttributes.phase,
		salaryCap: save.gameAttributes.salaryCap,
		minContract: save.gameAttributes.minContract,
		maxContract: save.gameAttributes.maxContract,
	};
	const humanNotes = readJsonIfExists(humanNotesPath, {});
	const anchorTargets = readJsonIfExists(anchorTargetsPath, []);
	const candidates = parseCsv(fs.readFileSync(candidatesPath, "utf8")).map(
		coerceCandidateRow,
	);
	const candidateByPid = new Map(candidates.map((row) => [row.pid, row]));
	const sampleRow =
		candidates.find((row) => row.caseId === "V20-01") ?? candidates[0];

	const rows = Object.values(humanNotes)
		.map((entry) => {
			const candidate = candidateByPid.get(Number(entry.pid));
			if (!candidate) {
				throw new Error(`Could not find validation candidate pid ${entry.pid}`);
			}

			const score = scoreTier(candidate);
			const range = tierRange(score.tier, candidate, attrs);
			const parsed = parseHumanNote(entry.humanNotes, candidate, attrs);
			const modelRange = parseModelRangeM(range.modelRangeText);
			const overlap =
				parsed.humanAmountMinM !== undefined &&
				rangesOverlap(
					parsed.humanAmountMinM,
					parsed.humanAmountMaxM,
					modelRange.modelRangeMinM,
					modelRange.modelRangeMaxM,
				);
			const direction = directionForRanges(
				parsed.humanAmountMinM,
				parsed.humanAmountMaxM,
				modelRange.modelRangeMinM,
				modelRange.modelRangeMaxM,
			);
			const tierDistance = tierDistanceLabel(
				parsed.humanTargetTierInferred,
				score.tier,
			);

			const row = {
				caseId: entry.caseId,
				pid: Number(entry.pid),
				name: candidate.name,
				bucket: candidate.validationBucket,
				bucketLabel: candidate.validationBucketLabel,
				humanNote: entry.humanNotes,
				humanAmountMinM: parsed.humanAmountMinM,
				humanAmountMaxM: parsed.humanAmountMaxM,
				parsedHumanRange:
					parsed.humanAmountMinM === parsed.humanAmountMaxM
						? `$${parsed.humanAmountMinM.toFixed(2)}M`
						: `$${parsed.humanAmountMinM.toFixed(2)}M-$${parsed.humanAmountMaxM.toFixed(2)}M`,
				humanTargetTierInferred: parsed.humanTargetTierInferred,
				humanYears: parsed.humanYears,
				parseNotes: parsed.parseNotes,
				modelTier: score.tier,
				modelRangeText: range.modelRangeText,
				modelRangeMinM: modelRange.modelRangeMinM,
				modelRangeMaxM: modelRange.modelRangeMaxM,
				modelYears: range.modelYears,
				modelReason: score.reason,
				overlap: overlap ? "yes" : "no",
				direction,
				tierDistance: tierDistance.tierDistance,
				tierMissSeverity: tierDistance.tierMissSeverity,
				severeMiss: tierDistance.tierMissSeverity === "severe" ? "yes" : "no",
				anchorConsistency: anchorTargets.some(
					(target) => target.targetTier === score.tier,
				)
					? "model tier appears in anchor targets"
					: "no direct anchor tier match",
				normalNoOptionContractAmount: candidate.normalNoOptionContractAmount,
				normalNoOptionContractYears: candidate.normalNoOptionContractYears,
				estimatedDemandNoRandom: candidate.estimatedDemandNoRandom,
				minContractForPlayer: candidate.minContractForPlayer,
				eligibleMax: candidate.eligibleMax,
				getContractValue: candidate.getContractValue,
				valueNoPot: candidate.valueNoPot,
				value: candidate.value,
				MPG: candidate.MPG,
				starterShare: candidate.starterShare,
				PER: candidate.PER,
				EWA: candidate.EWA,
				BPM: candidate.BPM,
			};
			row.shortReason = shortReason(row);
			return row;
		})
		.sort((a, b) => a.caseId.localeCompare(b.caseId));

	const columnOrder = [
		"caseId",
		"pid",
		"name",
		"bucket",
		"humanNote",
		"humanAmountMinM",
		"humanAmountMaxM",
		"humanTargetTierInferred",
		"humanYears",
		"parseNotes",
		"modelTier",
		"modelRangeText",
		"modelRangeMinM",
		"modelRangeMaxM",
		"modelYears",
		"overlap",
		"direction",
		"tierDistance",
		"tierMissSeverity",
		"severeMiss",
		"shortReason",
		"modelReason",
		"anchorConsistency",
		"normalNoOptionContractAmount",
		"normalNoOptionContractYears",
		"estimatedDemandNoRandom",
		"minContractForPlayer",
		"eligibleMax",
		"getContractValue",
		"valueNoPot",
		"value",
		"MPG",
		"starterShare",
		"PER",
		"EWA",
		"BPM",
	];
	writeCsv(csvPath, rows, columnOrder);

	const overlapCount = rows.filter((row) => row.overlap === "yes").length;
	const tooLowCount = rows.filter((row) => row.direction === "too low").length;
	const tooHighCount = rows.filter(
		(row) => row.direction === "too high",
	).length;
	const severeMissCount = rows.filter((row) => row.severeMiss === "yes").length;
	const bucketSummary = [...new Set(rows.map((row) => row.bucket))].map(
		(bucket) => {
			const bucketRows = rows.filter((row) => row.bucket === bucket);
			return {
				bucket,
				cases: bucketRows.length,
				overlap: bucketRows.filter((row) => row.overlap === "yes").length,
				tooLow: bucketRows.filter((row) => row.direction === "too low").length,
				tooHigh: bucketRows.filter((row) => row.direction === "too high")
					.length,
				severe: bucketRows.filter((row) => row.severeMiss === "yes").length,
			};
		},
	);

	const ladderRows = diagnosticLadderRows(sampleRow, attrs);
	const modelCoverageRows = currentModelCoverageRows(sampleRow, attrs);
	const coverage = coverageDiagnostics(modelCoverageRows, sampleRow);
	const directionCounts = countBy(rows, "direction")
		.map((row) => `${row.name}: ${row.count}`)
		.join(", ");

	const caseColumns = [
		{ key: "caseId", label: "case" },
		{ key: "pid", label: "pid" },
		{ key: "bucket", label: "bucket" },
		{ key: "humanNote", label: "human note" },
		{ key: "parsedHumanRange", label: "parsed human range" },
		{ key: "humanTargetTierInferred", label: "inferred human tier" },
		{ key: "modelTier", label: "model tier" },
		{ key: "modelRangeText", label: "model range" },
		{ key: "overlap", label: "overlap?" },
		{ key: "direction", label: "direction" },
		{ key: "shortReason", label: "short reason" },
	];
	const bucketColumns = [
		{ key: "bucket", label: "bucket" },
		{ key: "cases", label: "cases" },
		{ key: "overlap", label: "overlap" },
		{ key: "tooLow", label: "too low" },
		{ key: "tooHigh", label: "too high" },
		{ key: "severe", label: "severe miss" },
	];
	const ladderColumns = [
		{ key: "tier", label: "diagnostic ladder band" },
		{ key: "description", label: "definition" },
		{ key: "rangeText", label: "example amount" },
		{ key: "capRangeText", label: "cap%" },
	];
	const modelCoverageColumns = [
		{ key: "tier", label: "current model tier" },
		{ key: "rangeType", label: "range type" },
		{ key: "rangeText", label: "example amount" },
		{ key: "capRangeText", label: "cap%" },
		{ key: "years", label: "years" },
	];

	const md = `# Contract Market Validation20 Score

Scope: sandbox report only. This uses \`validation20\` as calibration/training-extension evidence, not as a final test and not as a direct rule-edit recipe. No \`src\` files are changed.

Inputs:

- \`${path.relative(root, humanNotesPath)}\`
- \`${path.relative(root, candidatesPath)}\`
- \`${path.relative(root, anchorTargetsPath)}\`
- \`tools/contract-market-tier-score.mjs\`
- \`tools/contract-market-proxy-core.mjs\`

## Overview

- 20 cases: ${rows.length}
- Range overlap count: ${overlapCount}/${rows.length}
- Too low count: ${tooLowCount}
- Too high count: ${tooHighCount}
- Severe miss count: ${severeMissCount}
- Direction counts: ${directionCounts}

## Case Results

${markdownTable(rows, caseColumns)}

## Bucket Summary

${markdownTable(bucketSummary, bucketColumns)}

## Complete Amount Ladder Coverage Check

This ladder is diagnostic only. It is used to inspect continuous amount/cap coverage from player minimum to eligible max, not to replace the current model.

${markdownTable(ladderRows, ladderColumns)}

Current MODEL_TIERS projected onto the V20-01 salary context (salary cap ${money(attrs.salaryCap)}, player minimum ${money(sampleRow.minContractForPlayer)}, eligible max ${money(sampleRow.eligibleMax)}):

${markdownTable(modelCoverageRows, modelCoverageColumns)}

Coverage findings:

${coverage.issues.map((issue) => `- ${issue}`).join("\n")}
- Low-end coverage depends on player-specific minimums, so veteran minimum cases should not be evaluated against a fixed dollar floor.
- The current table has player-type/archetype tiers such as \`YOUNG_UPSIDE_SUSPECT\`, \`VETERAN_ROTATION_GUARD\`, and \`YOUNG_PROVEN_STARTER\` mixed with amount bands. That makes amount coverage, archetype selection, and term risk harder to diagnose independently.
- There is no current standalone 12%-17% cap amount band between \`LOW_END_STARTER\` and \`YOUNG_PROVEN_STARTER\`, and no explicit 22.5%-30% high-starter band other than the young-proven starter archetype.

## Systemic Direction Signals

- Validation20 shows direction signals, not final conclusions. Any tier movement should be verified against anchor targets plus boundary/challenge samples.
- The strongest amount signal is whether the current model leaves mid/high-starter gaps: validation cases in the $22M-$29M and $38M-$44M zones often sit between existing current-model bands or depend on eligible-max logic.
- Minimum and minimum-plus cases need player-specific minimum handling. Notes marked \`底薪\` were parsed against each player's actual minimum, not a fixed dollar value.
- AAV tier and years/term logic should be diagnosed separately. Current \`MODEL_TIERS\` only has an explicit years hint for \`VETERAN_ROTATION_GUARD\`; validation20 notes mostly encode amount, not term.
- Anchor consistency is stronger where validation20 misses point in the same direction as existing anchors. Where validation20 conflicts with anchors or lacks comparable anchors, treat it as a challenge-sample request rather than a rule change.

## Next Steps

- Add boundary samples around 5.5%/8%/10%/14%/18%/22.5%/30% cap to verify gaps and overlaps independently of these 20 cases.
- Add challenge samples for $20M-$35M starters, including inefficient starters, young upside starters, and stable veterans with lower term tolerance.
- Add near-max samples below exact eligible max to separate \`STAR_NEAR_MAX\` from \`SUPERSTAR_MAX\`.
- Add veteran-minimum and minimum-plus samples with different years of experience so player-specific minimum behavior is covered.
- Split AAV amount-tier scoring from years/term scoring before changing formal rules; term risk should not be hidden inside amount bands.
`;

	fs.writeFileSync(mdPath, md);
	console.log(`Wrote ${path.relative(root, csvPath)}`);
	console.log(`Wrote ${path.relative(root, mdPath)}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
