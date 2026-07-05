#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { csvFormat, csvParse } from "d3-dsv";

const root = process.cwd();
const candidatesPath = path.join(
	root,
	"contract_market_artifacts/v3_experiments/blind_validation30/blind_validation30_candidates.csv",
);
const notesPath = path.join(
	root,
	"temp/blind_validation30_human_notes (2).json",
);
const outputDir = path.join(
	root,
	"contract_market_artifacts/v3_experiments/blind_validation30_eval",
);

const expectedNotes = 30;
const lowConfidenceValues = new Set(["low", "低", "low_confidence"]);

const numericCandidateFields = new Set([
	"pid",
	"age",
	"ovr",
	"pot",
	"value",
	"valueNoPot",
	"contractValue",
	"currentPointM",
	"v3PointM",
	"GP",
	"GS",
	"MPG",
	"starterShare",
	"PTS",
	"TRB",
	"AST",
	"PER",
	"EWA",
	"VORP",
	"BPM",
	"USG",
	"estimatedDemandNoRandom",
	"minContractForPlayer",
	"eligibleMax",
]);

const round = (value, digits = 2) =>
	Number.isFinite(value) ? Number(value.toFixed(digits)) : "";

const pct = (value) =>
	Number.isFinite(value) ? `${round(value * 100, 1)}%` : "";

const mean = (values) => {
	const finite = values.filter(Number.isFinite);
	return finite.length === 0
		? undefined
		: finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const median = (values) => {
	const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
	if (finite.length === 0) return undefined;
	const mid = Math.floor(finite.length / 2);
	return finite.length % 2 === 0
		? (finite[mid - 1] + finite[mid]) / 2
		: finite[mid];
};

const coerceCandidate = (row) =>
	Object.fromEntries(
		Object.entries(row).map(([key, value]) => {
			if (numericCandidateFields.has(key) && value !== "") {
				const parsed = Number(value);
				if (Number.isFinite(parsed)) return [key, parsed];
			}
			return [key, value];
		}),
	);

const readCandidates = () =>
	csvParse(fs.readFileSync(candidatesPath, "utf8")).map(coerceCandidate);

const parseJson = () => JSON.parse(fs.readFileSync(notesPath, "utf8"));

const normalizeConfidence = (value) =>
	String(value ?? "")
		.trim()
		.toLowerCase();

const noteHasContent = (note) =>
	[
		"human_min_m",
		"human_max_m",
		"confidence",
		"role_note",
		"uncertainty_note",
	].some((key) => String(note?.[key] ?? "").trim() !== "") ||
	Object.values(note?.flags ?? {}).some(Boolean);

const parseHumanRange = (note, candidate) => {
	const rawMin = String(note?.human_min_m ?? "").trim();
	const rawMax = String(note?.human_max_m ?? "").trim();
	const parsedMin = rawMin === "" ? NaN : Number(rawMin);
	const parsedMax = rawMax === "" ? NaN : Number(rawMax);
	if (Number.isFinite(parsedMin) && Number.isFinite(parsedMax)) {
		return {
			status: parsedMin <= parsedMax ? "parsed_fields" : "invalid_fields",
			min: Math.min(parsedMin, parsedMax),
			max: Math.max(parsedMin, parsedMax),
			source: "human_min_m/human_max_m",
		};
	}

	const roleNote = String(note?.role_note ?? "").trim();
	const normalized = roleNote
		.replaceAll("－", "-")
		.replaceAll("—", "-")
		.replaceAll("–", "-")
		.replaceAll("~", "-")
		.replaceAll("～", "-")
		.toLowerCase();
	const eligibleMaxM = Number(candidate.eligibleMax) / 1000;
	const minContractM = Number(candidate.minContractForPlayer) / 1000;

	if (normalized === "max") {
		return {
			status: "parsed_role_note",
			min: eligibleMaxM,
			max: eligibleMaxM,
			source: "role_note:max",
		};
	}
	if (normalized.includes("底薪")) {
		return {
			status: "parsed_role_note",
			min: minContractM,
			max: minContractM,
			source: "role_note:底薪->minContractForPlayer",
		};
	}

	const maxMatch = normalized.match(/^\s*(\d+(?:\.\d+)?)\s*-\s*max\s*$/);
	if (maxMatch) {
		const min = Number(maxMatch[1]);
		return {
			status: "parsed_role_note",
			min,
			max: eligibleMaxM,
			source: "role_note:n-max",
		};
	}

	const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
	if (rangeMatch) {
		const a = Number(rangeMatch[1]);
		const b = Number(rangeMatch[2]);
		return {
			status: "parsed_role_note",
			min: Math.min(a, b),
			max: Math.max(a, b),
			source: "role_note:n-n",
		};
	}

	return {
		status: roleNote === "" ? "missing" : "unparsed_role_note",
		min: undefined,
		max: undefined,
		source: roleNote === "" ? "" : "role_note:unparsed",
	};
};

const gapDirection = (point, min, max) => {
	if (
		!Number.isFinite(point) ||
		!Number.isFinite(min) ||
		!Number.isFinite(max)
	) {
		return "missing";
	}
	if (point < min) return "too_low";
	if (point > max) return "too_high";
	return "in_range";
};

const gapToRange = (point, min, max) => {
	const direction = gapDirection(point, min, max);
	if (direction === "too_low") return min - point;
	if (direction === "too_high") return point - max;
	if (direction === "in_range") return 0;
	return undefined;
};

const gapBand = (gap, point, min, max) => {
	if (!Number.isFinite(gap)) return "missing";
	const reference = Math.max(
		1,
		Number.isFinite(point) ? point : 0,
		min ?? 0,
		max ?? 0,
	);
	const relativeGap = gap / reference;
	if (gap <= 3 || (reference <= 8 && relativeGap <= 0.25)) return "fine";
	if (gap <= 5 || (reference <= 8 && relativeGap <= 0.4)) return "acceptable";
	if (gap <= 8 || (reference <= 8 && relativeGap <= 0.65)) return "review";
	return "major";
};

const salaryBucket = (point) => {
	if (!Number.isFinite(point)) return "missing";
	if (point < 5) return "<5M";
	if (point < 10) return "5-10M";
	if (point < 20) return "10-20M";
	if (point < 30) return "20-30M";
	if (point < 40) return "30-40M";
	return "40M+";
};

const compareRows = (rows) =>
	rows.map((row) => {
		const currentGap = gapToRange(
			row.currentPointM,
			row.human_min_m,
			row.human_max_m,
		);
		const v3Gap = gapToRange(row.v3PointM, row.human_min_m, row.human_max_m);
		const currentDirection = gapDirection(
			row.currentPointM,
			row.human_min_m,
			row.human_max_m,
		);
		const v3Direction = gapDirection(
			row.v3PointM,
			row.human_min_m,
			row.human_max_m,
		);
		const currentBand = gapBand(
			currentGap,
			row.currentPointM,
			row.human_min_m,
			row.human_max_m,
		);
		const v3Band = gapBand(
			v3Gap,
			row.v3PointM,
			row.human_min_m,
			row.human_max_m,
		);
		const delta =
			Number.isFinite(currentGap) && Number.isFinite(v3Gap)
				? currentGap - v3Gap
				: undefined;
		return {
			...row,
			current_gap_m: round(currentGap),
			current_direction: currentDirection,
			current_gap_band: currentBand,
			current_relative_gap: round(
				Number.isFinite(currentGap)
					? currentGap / Math.max(1, row.currentPointM)
					: undefined,
				3,
			),
			v3_gap_m: round(v3Gap),
			v3_direction: v3Direction,
			v3_gap_band: v3Band,
			v3_relative_gap: round(
				Number.isFinite(v3Gap) ? v3Gap / Math.max(1, row.v3PointM) : undefined,
				3,
			),
			v3_improvement_m: round(delta),
			v3_result: !Number.isFinite(delta)
				? "missing"
				: Math.abs(delta) <= 0.1
					? "tie"
					: delta > 0
						? "v3_better"
						: "current_better",
		};
	});

const summarizeModel = (rows, prefix) => {
	const gapKey = `${prefix}_gap_m`;
	const directionKey = `${prefix}_direction`;
	const bandKey = `${prefix}_gap_band`;
	const gaps = rows.map((row) => Number(row[gapKey])).filter(Number.isFinite);
	const counts = (key, value) =>
		rows.filter((row) => row[key] === value).length;
	return {
		n: rows.length,
		evaluable_n: gaps.length,
		mean_absolute_gap_m: round(mean(gaps)),
		median_absolute_gap_m: round(median(gaps)),
		in_range_count: counts(directionKey, "in_range"),
		fine_count: counts(bandKey, "fine"),
		acceptable_count: counts(bandKey, "acceptable"),
		review_count: counts(bandKey, "review"),
		major_count: counts(bandKey, "major"),
		too_low_count: counts(directionKey, "too_low"),
		too_high_count: counts(directionKey, "too_high"),
	};
};

const summarizeGroup = (rows, groupKey) => {
	const groups = new Map();
	for (const row of rows) {
		const key = String(row[groupKey] ?? "");
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(row);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([group, groupRows]) => {
			const current = summarizeModel(groupRows, "current");
			const v3 = summarizeModel(groupRows, "v3");
			return {
				[groupKey]: group,
				n: groupRows.length,
				low_confidence_n: groupRows.filter(
					(row) => row.low_confidence === "yes",
				).length,
				current_mean_gap_m: current.mean_absolute_gap_m,
				v3_mean_gap_m: v3.mean_absolute_gap_m,
				mean_gap_delta_m: round(
					Number(current.mean_absolute_gap_m) - Number(v3.mean_absolute_gap_m),
				),
				current_median_gap_m: current.median_absolute_gap_m,
				v3_median_gap_m: v3.median_absolute_gap_m,
				current_in_range: current.in_range_count,
				v3_in_range: v3.in_range_count,
				current_fine: current.fine_count,
				v3_fine: v3.fine_count,
				current_acceptable: current.acceptable_count,
				v3_acceptable: v3.acceptable_count,
				current_review: current.review_count,
				v3_review: v3.review_count,
				current_major: current.major_count,
				v3_major: v3.major_count,
				current_too_low: current.too_low_count,
				v3_too_low: v3.too_low_count,
				current_too_high: current.too_high_count,
				v3_too_high: v3.too_high_count,
			};
		});
};

const mdTable = (rows) => {
	if (rows.length === 0) return "_None._";
	const headers = Object.keys(rows[0]);
	const escape = (value) => String(value ?? "").replaceAll("|", "\\|");
	return [
		`| ${headers.join(" | ")} |`,
		`| ${headers.map(() => "---").join(" | ")} |`,
		...rows.map(
			(row) =>
				`| ${headers.map((header) => escape(row[header])).join(" | ")} |`,
		),
	].join("\n");
};

const validationMarkdown = ({ validation, completedN, totalN }) => {
	const sections = [
		"# Blind Validation30 Input Validation",
		"",
		`- candidates CSV parse: ${validation.candidates_parse_ok ? "ok" : "failed"}`,
		`- human notes JSON parse: ${validation.notes_parse_ok ? "ok" : "failed"}`,
		`- candidate_n: ${validation.candidate_n}`,
		`- notes_n: ${validation.notes_n}`,
		`- completed_n: ${completedN}`,
		`- total_n: ${totalN}`,
		`- aligned_n: ${validation.aligned_n}`,
		`- parseable_human_range_n: ${validation.parseable_human_range_n}`,
		"",
		"## Alignment Issues",
		"",
		mdTable(validation.alignment_issues),
		"",
		"## Missing Or Abnormal Fields",
		"",
		mdTable(validation.field_issues),
		"",
		"## Human Range Parse Notes",
		"",
		mdTable(validation.range_parse_notes),
		"",
		"## Scope",
		"",
		"This run is artifact-only eval. It reads candidates and human notes, writes only blind_validation30_eval artifacts, and does not modify formal src or tier scoring code.",
	];
	return sections.join("\n");
};

const summaryMarkdown = ({ rows, validation, breakdowns }) => {
	const allRows = rows.filter((row) => row.evaluable === "yes");
	const highConfidenceRows = allRows.filter(
		(row) => row.low_confidence !== "yes",
	);
	const lowConfidenceRows = allRows.filter(
		(row) => row.low_confidence === "yes",
	);
	const currentAll = summarizeModel(allRows, "current");
	const v3All = summarizeModel(allRows, "v3");
	const currentHi = summarizeModel(highConfidenceRows, "current");
	const v3Hi = summarizeModel(highConfidenceRows, "v3");
	const currentLow = summarizeModel(lowConfidenceRows, "current");
	const v3Low = summarizeModel(lowConfidenceRows, "v3");
	const resultCounts = Object.fromEntries(
		["v3_better", "current_better", "tie", "missing"].map((key) => [
			key,
			allRows.filter((row) => row.v3_result === key).length,
		]),
	);
	const majorCases = (prefix) =>
		allRows
			.filter((row) => row[`${prefix}_gap_band`] === "major")
			.sort(
				(a, b) => Number(b[`${prefix}_gap_m`]) - Number(a[`${prefix}_gap_m`]),
			)
			.map((row) => ({
				caseId: row.caseId,
				name: row.name,
				confidence: row.confidence || "unspecified",
				human_range: row.human_range_text,
				[`${prefix}_point`]: row[`${prefix}PointM`],
				direction: row[`${prefix}_direction`],
				gap_m: row[`${prefix}_gap_m`],
				hiddenStratum: row.hiddenStratum,
				tier: row[prefix === "current" ? "currentTier" : "v3Tier"],
			}));
	const reviewCases = allRows
		.filter(
			(row) =>
				row.low_confidence === "yes" ||
				row.current_gap_band === "major" ||
				row.v3_gap_band === "major" ||
				row.v3_result === "current_better",
		)
		.sort((a, b) => {
			const aGap = Math.max(
				Number(a.current_gap_m) || 0,
				Number(a.v3_gap_m) || 0,
			);
			const bGap = Math.max(
				Number(b.current_gap_m) || 0,
				Number(b.v3_gap_m) || 0,
			);
			return bGap - aGap;
		})
		.map((row) => ({
			caseId: row.caseId,
			name: row.name,
			confidence: row.confidence || "unspecified",
			human_range: row.human_range_text,
			current: `${row.currentPointM} ${row.current_direction} gap=${row.current_gap_m}`,
			v3: `${row.v3PointM} ${row.v3_direction} gap=${row.v3_gap_m}`,
			v3_result: row.v3_result,
			note: row.role_note,
		}));
	const highEndRows = allRows.filter(
		(row) => row.v3Tier === "HIGH_END_ROTATION",
	);
	const solidRows = allRows.filter((row) => row.v3Tier === "SOLID_STARTER");
	const safetyLine = (label, modelRows) => {
		const current = summarizeModel(modelRows, "current");
		const v3 = summarizeModel(modelRows, "v3");
		return `- ${label}: n=${modelRows.length}; V3 mean gap ${v3.mean_absolute_gap_m}M vs current ${current.mean_absolute_gap_m}M; V3 in_range ${v3.in_range_count}/${modelRows.length}; V3 major ${v3.major_count}; V3 too_low ${v3.too_low_count}, too_high ${v3.too_high_count}.`;
	};
	const modules = breakdowns.responsibleModule
		.filter((row) => row.responsibleModule && row.responsibleModule !== "none")
		.map((row) => ({
			responsibleModule: row.responsibleModule,
			n: row.n,
			current_mean_gap_m: row.current_mean_gap_m,
			v3_mean_gap_m: row.v3_mean_gap_m,
			delta_m: row.mean_gap_delta_m,
			v3_major: row.v3_major,
			v3_too_high: row.v3_too_high,
			v3_too_low: row.v3_too_low,
		}));

	return [
		"# Blind Validation30 Current vs V3-AB Eval",
		"",
		"Scope: artifact-only held-out eval. This does not tune rules, implement V3, edit `src/`, edit `tools/contract-market-tier-score.mjs`, revive Candidate0, revive broad HIGH_IMPACT_STARTER, or revive broad 1C.",
		"",
		"## Input Status",
		"",
		`- completed_n / total_n: ${validation.completed_n} / ${validation.total_n}`,
		`- aligned_n: ${validation.aligned_n}`,
		`- evaluable_n: ${allRows.length}`,
		`- low_confidence_evaluable_n: ${lowConfidenceRows.length}`,
		`- required numeric fields issue: all notes have blank human_min_m/human_max_m; evaluable ranges were parsed from role_note shorthand where possible.`,
		"",
		"## Core Metrics",
		"",
		mdTable([
			{ scope: "all evaluable", model: "current", ...currentAll },
			{ scope: "all evaluable", model: "V3-AB", ...v3All },
			{ scope: "non-low-confidence", model: "current", ...currentHi },
			{ scope: "non-low-confidence", model: "V3-AB", ...v3Hi },
			{ scope: "low-confidence", model: "current", ...currentLow },
			{ scope: "low-confidence", model: "V3-AB", ...v3Low },
		]),
		"",
		`V3 case result count: ${resultCounts.v3_better} better, ${resultCounts.current_better} worse, ${resultCounts.tie} tied, ${resultCounts.missing} missing.`,
		"",
		"## Interpretation",
		"",
		`- Overall, V3-AB is ${Number(v3All.mean_absolute_gap_m) < Number(currentAll.mean_absolute_gap_m) ? "better" : "not better"} on mean absolute gap (${v3All.mean_absolute_gap_m}M vs ${currentAll.mean_absolute_gap_m}M) and ${Number(v3All.median_absolute_gap_m) < Number(currentAll.median_absolute_gap_m) ? "better" : "not better"} on median (${v3All.median_absolute_gap_m}M vs ${currentAll.median_absolute_gap_m}M).`,
		`- Directionally, current has ${currentAll.too_low_count} too_low and ${currentAll.too_high_count} too_high; V3 has ${v3All.too_low_count} too_low and ${v3All.too_high_count} too_high.`,
		"- Low-confidence cases are reported separately and should not be treated as hard failures.",
		"",
		"## Tier Safety",
		"",
		safetyLine("HIGH_END_ROTATION", highEndRows),
		safetyLine("SOLID_STARTER", solidRows),
		"",
		"## Responsible Module Impact",
		"",
		mdTable(modules),
		"",
		"## Major Cases",
		"",
		"### Current Major",
		"",
		mdTable(majorCases("current")),
		"",
		"### V3 Major",
		"",
		mdTable(majorCases("v3")),
		"",
		"## Manual Review Queue",
		"",
		mdTable(reviewCases),
		"",
		"## Formal Implementation Readiness",
		"",
		"Eval conclusion only: this result can inform a formal implementation plan, but it is not itself an implementation diff. Because human ranges were mostly entered in role_note rather than human_min_m/human_max_m and several young-player cases are low confidence, formal go/no-go should treat those input quality limits explicitly.",
	].join("\n");
};

const main = () => {
	const validation = {
		candidates_parse_ok: false,
		notes_parse_ok: false,
		candidate_n: 0,
		notes_n: 0,
		completed_n: 0,
		total_n: expectedNotes,
		aligned_n: 0,
		parseable_human_range_n: 0,
		alignment_issues: [],
		field_issues: [],
		range_parse_notes: [],
	};

	const candidates = readCandidates();
	validation.candidates_parse_ok = true;
	validation.candidate_n = candidates.length;
	const notes = parseJson();
	validation.notes_parse_ok = true;
	const noteEntries = Array.isArray(notes)
		? notes.map((note) => [`blind_validation30-${note.pid}`, note])
		: Object.entries(notes);
	validation.notes_n = noteEntries.length;
	const notesByPid = new Map(
		noteEntries.map(([, note]) => [String(note.pid), note]),
	);
	const candidatesByPid = new Map(
		candidates.map((candidate) => [String(candidate.pid), candidate]),
	);

	for (const candidate of candidates) {
		const note = notesByPid.get(String(candidate.pid));
		if (!note) {
			validation.alignment_issues.push({
				caseId: candidate.caseId,
				pid: candidate.pid,
				issue: "missing_note_for_candidate",
			});
			continue;
		}
		if (note.caseId !== candidate.caseId) {
			validation.alignment_issues.push({
				caseId: candidate.caseId,
				pid: candidate.pid,
				issue: `caseId_mismatch_note=${note.caseId}`,
			});
		}
	}
	for (const [, note] of noteEntries) {
		if (!candidatesByPid.has(String(note.pid))) {
			validation.alignment_issues.push({
				caseId: note.caseId,
				pid: note.pid,
				issue: "note_pid_not_in_candidates",
			});
		}
	}

	const rows = candidates.map((candidate) => {
		const note = notesByPid.get(String(candidate.pid)) ?? {};
		const confidence = normalizeConfidence(note.confidence);
		const completed = noteHasContent(note);
		if (completed) validation.completed_n += 1;
		const missing = [];
		for (const key of [
			"human_min_m",
			"human_max_m",
			"confidence",
			"role_note",
			"flags",
		]) {
			const value = note[key];
			if (
				value === undefined ||
				value === null ||
				(typeof value === "string" && value.trim() === "") ||
				(key === "flags" && (typeof value !== "object" || Array.isArray(value)))
			) {
				missing.push(key);
			}
		}
		if (missing.length > 0) {
			validation.field_issues.push({
				caseId: candidate.caseId,
				pid: candidate.pid,
				name: candidate.name,
				missing_or_blank: missing.join(";"),
			});
		}
		const parsedRange = parseHumanRange(note, candidate);
		if (parsedRange.status.startsWith("parsed"))
			validation.parseable_human_range_n += 1;
		if (parsedRange.status !== "parsed_fields") {
			validation.range_parse_notes.push({
				caseId: candidate.caseId,
				pid: candidate.pid,
				name: candidate.name,
				status: parsedRange.status,
				source: parsedRange.source,
				role_note: note.role_note ?? "",
				parsed_min_m: round(parsedRange.min),
				parsed_max_m: round(parsedRange.max),
			});
		}
		return {
			caseId: candidate.caseId,
			pid: candidate.pid,
			name: candidate.name,
			hiddenStratum: candidate.hiddenStratum,
			hiddenStratumLabel: candidate.hiddenStratumLabel,
			team: candidate.team,
			age: candidate.age,
			pos: candidate.pos,
			ovr: candidate.ovr,
			pot: candidate.pot,
			valueNoPot: candidate.valueNoPot,
			contractValue: candidate.contractValue,
			currentTier: candidate.currentTier,
			currentRangeText: candidate.currentRangeText,
			currentPointM: candidate.currentPointM,
			v3Tier: candidate.v3Tier,
			v3RangeText: candidate.v3RangeText,
			v3PointM: candidate.v3PointM,
			responsibleModule: candidate.responsibleModule || "none",
			salary_bucket_current: salaryBucket(candidate.currentPointM),
			salary_bucket_v3: salaryBucket(candidate.v3PointM),
			GP: candidate.GP,
			GS: candidate.GS,
			MPG: candidate.MPG,
			starterShare: candidate.starterShare,
			PTS: candidate.PTS,
			TRB: candidate.TRB,
			AST: candidate.AST,
			PER: candidate.PER,
			EWA: candidate.EWA,
			VORP: candidate.VORP,
			BPM: candidate.BPM,
			USG: candidate.USG,
			minContractForPlayerM: round(
				Number(candidate.minContractForPlayer) / 1000,
			),
			eligibleMaxM: round(Number(candidate.eligibleMax) / 1000),
			human_min_m: round(parsedRange.min),
			human_max_m: round(parsedRange.max),
			human_range_text:
				Number.isFinite(parsedRange.min) && Number.isFinite(parsedRange.max)
					? `${round(parsedRange.min)}-${round(parsedRange.max)}`
					: "",
			human_range_status: parsedRange.status,
			human_range_source: parsedRange.source,
			confidence: confidence || "unspecified",
			low_confidence: lowConfidenceValues.has(confidence) ? "yes" : "no",
			role_note: note.role_note ?? "",
			uncertainty_note: note.uncertainty_note ?? "",
			flags_json: JSON.stringify(note.flags ?? {}),
			evaluable:
				Number.isFinite(parsedRange.min) && Number.isFinite(parsedRange.max)
					? "yes"
					: "no",
		};
	});
	validation.aligned_n =
		candidates.length -
		validation.alignment_issues.filter((issue) =>
			String(issue.issue).startsWith("missing_note"),
		).length;

	const evaluatedRows = compareRows(rows);
	const evaluableRows = evaluatedRows.filter((row) => row.evaluable === "yes");
	const breakdowns = {
		hiddenStratum: summarizeGroup(evaluableRows, "hiddenStratum"),
		currentTier: summarizeGroup(evaluableRows, "currentTier"),
		v3Tier: summarizeGroup(evaluableRows, "v3Tier"),
		confidence: summarizeGroup(evaluableRows, "confidence"),
		responsibleModule: summarizeGroup(evaluableRows, "responsibleModule"),
		salaryBucketCurrent: summarizeGroup(evaluableRows, "salary_bucket_current"),
	};

	fs.mkdirSync(outputDir, { recursive: true });
	fs.writeFileSync(
		path.join(outputDir, "case_eval.csv"),
		csvFormat(evaluatedRows),
	);
	fs.writeFileSync(
		path.join(outputDir, "breakdown_by_hidden_stratum.csv"),
		csvFormat(breakdowns.hiddenStratum),
	);
	fs.writeFileSync(
		path.join(outputDir, "breakdown_by_current_tier.csv"),
		csvFormat(breakdowns.currentTier),
	);
	fs.writeFileSync(
		path.join(outputDir, "breakdown_by_v3_tier.csv"),
		csvFormat(breakdowns.v3Tier),
	);
	fs.writeFileSync(
		path.join(outputDir, "breakdown_by_confidence.csv"),
		csvFormat(breakdowns.confidence),
	);
	fs.writeFileSync(
		path.join(outputDir, "breakdown_by_responsible_module.csv"),
		csvFormat(breakdowns.responsibleModule),
	);
	fs.writeFileSync(
		path.join(outputDir, "breakdown_by_salary_bucket.csv"),
		csvFormat(breakdowns.salaryBucketCurrent),
	);
	fs.writeFileSync(
		path.join(outputDir, "input_validation.md"),
		validationMarkdown({
			validation: {
				...validation,
				completed_n: validation.completed_n,
				total_n: validation.total_n,
			},
			completedN: validation.completed_n,
			totalN: validation.total_n,
		}),
	);
	fs.writeFileSync(
		path.join(outputDir, "summary.md"),
		summaryMarkdown({
			rows: evaluatedRows,
			validation: {
				...validation,
				completed_n: validation.completed_n,
				total_n: validation.total_n,
			},
			breakdowns,
		}),
	);

	console.log(`Wrote eval artifacts to ${outputDir}`);
	console.log(
		JSON.stringify(
			{
				candidate_n: validation.candidate_n,
				notes_n: validation.notes_n,
				completed_n: validation.completed_n,
				total_n: validation.total_n,
				aligned_n: validation.aligned_n,
				evaluable_n: evaluableRows.length,
				current: summarizeModel(evaluableRows, "current"),
				v3: summarizeModel(evaluableRows, "v3"),
			},
			null,
			2,
		),
	);
};

main();
