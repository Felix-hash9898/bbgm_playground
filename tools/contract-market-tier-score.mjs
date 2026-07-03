#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	anchorEntriesFromNotes,
	bound,
	buildProxyRows,
	markdownTable,
	money,
	pct,
	readJsonIfExists,
	readSave,
	round,
	targetsByPid,
	writeCsv,
} from "./contract-market-proxy-core.mjs";

const root = process.cwd();
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);
const notesPath = path.join(root, "temp/bbgm_contract_review_notes_v3.json");
const validationHumanNotesPath = path.join(
	root,
	"temp/contract_market_validation20_human_notes.json",
);
const artifactsDir = path.join(root, "contract_market_artifacts");
const targetsPath = path.join(
	artifactsDir,
	"contract_market_anchor_targets.json",
);
const csvPath = path.join(artifactsDir, "contract_market_tier_score.csv");
const mdPath = path.join(artifactsDir, "contract_market_tier_score.md");

export const MODEL_TIERS = {
	MINIMUM_LEVEL: {
		rangeType: "minimumMultiplier",
		minMultiplier: 1,
		maxMultiplier: 1.15,
	},
	VETERAN_MINIMUM_PLUS: {
		rangeType: "capPct",
		min: "playerMinimum",
		maxPct: 0.035,
	},
	LOW_ROTATION_PLUS: {
		rangeType: "capPct",
		minPct: 0.02,
		maxPct: 0.035,
	},
	SPECIALIST_ROTATION: {
		rangeType: "capPct",
		minPct: 0.035,
		maxPct: 0.055,
	},
	YOUNG_UPSIDE_SUSPECT: {
		rangeType: "capPct",
		minPct: 0.025,
		maxPct: 0.045,
	},
	VETERAN_ROTATION_GUARD: {
		rangeType: "capPct",
		minPct: 0.04,
		maxPct: 0.06,
		years: "1-2",
	},
	LOW_END_STARTER: {
		rangeType: "capPct",
		minPct: 0.06,
		maxPct: 0.12,
	},
	YOUNG_PROVEN_STARTER: {
		rangeType: "capPct",
		minPct: 0.17,
		maxPct: 0.225,
	},
	STAR_NEAR_MAX: {
		rangeType: "eligibleMaxPct",
		minPct: 0.88,
		maxPct: 1,
	},
	SUPERSTAR_MAX: {
		rangeType: "eligibleMaxPct",
		minPct: 1,
		maxPct: 1,
	},
};

const comparableTargetTier = (targetTier) => {
	if (targetTier === "VETERAN_MINIMUM_LEVEL") {
		return "MINIMUM_LEVEL";
	}
	if (targetTier === "LOW_END_STARTER_GUARD_LENGTH_RISK") {
		return "LOW_END_STARTER";
	}
	return targetTier;
};

const hasPosition = (row, token) => row.pos?.includes(token);

const isGuard = (row) => hasPosition(row, "G");

const isBig = (row) => hasPosition(row, "C") || hasPosition(row, "F");

export const featureFlags = (row) => ({
	establishedStarter:
		row.GP >= 50 && row.MPG >= 26 && row.starterShare >= 0.55,
	fullTimeStarter:
		row.GP >= 50 && row.MPG >= 28 && row.starterShare >= 0.75,
	limitedRotation: row.MPG < 16 || row.min < 1000,
	smallButRealRole: row.GP >= 40 && row.MPG >= 6 && row.MPG < 16,
	highProduction:
		row.PER >= 18 && row.EWA >= 5 && row.VORP >= 1 && row.BPM >= 1,
	starProduction:
		row.PER >= 20 && row.EWA >= 8 && row.VORP >= 3 && row.BPM >= 3,
	superstarProduction:
		row.PER >= 25 &&
		row.EWA >= 12 &&
		row.VORP >= 5 &&
		row.BPM >= 6 &&
		row.USG >= 28,
	poorProduction: row.PER < 10 || row.EWA < 0 || row.BPM < -2,
	shootingSpecialist:
		row.skill_3_margin >= 0.08 &&
		row.comp_shootingThreePointer >= 0.68 &&
		row.comp_usage >= 0.5,
	creatorGuard:
		isGuard(row) &&
		row["AST%"] >= 14 &&
		row.comp_passing >= 0.6 &&
		row.MPG >= 18,
	youngUpside:
		row.age <= 24 &&
		row.pot >= 65 &&
		row.potentialPremium >= 4 &&
		row.value >= 57,
	defenseOrReboundBig:
		isBig(row) &&
		(row.comp_rebounding >= 0.64 ||
			row.comp_defenseInterior >= 0.62 ||
			row.skill_R_margin >= 0.05 ||
			row.skill_Di_margin >= 0.05),
});

export const scoreTier = (row) => {
	const flags = featureFlags(row);

	if (
		row.value >= 70 &&
		row.valueNoPot >= 67 &&
		row.getContractValue >= 68 &&
		flags.fullTimeStarter &&
		flags.superstarProduction &&
		row.comp_usage >= 0.7
	) {
		return {
			tier: "SUPERSTAR_MAX",
			reason:
				"elite BBGM value, full-time starter load, superstar production, and high usage composite",
		};
	}

	if (
		row.getContractValue >= 65 &&
		row.valueNoPot >= 65 &&
		flags.fullTimeStarter &&
		flags.starProduction
	) {
		return {
			tier: "STAR_NEAR_MAX",
			reason:
				"contractValue/valueNoPot clear star threshold with full starter role and strong EWA/VORP/BPM",
		};
	}

	if (
		row.age <= 26 &&
		flags.establishedStarter &&
		row.getContractValue >= 59 &&
		row.value >= 60 &&
		(flags.highProduction || row.BPM >= 1 || row.EWA >= 5)
	) {
		return {
			tier: "YOUNG_PROVEN_STARTER",
			reason:
				"young established starter with BBGM contractValue/value and production support",
		};
	}

	if (
		flags.establishedStarter &&
		row.valueNoPot >= 56 &&
		row.getContractValue >= 55 &&
		(row.PER >= 13 || row.EWA >= 2 || row.VORP >= 0.2)
	) {
		return {
			tier: "LOW_END_STARTER",
			reason:
				"starter role and adequate BBGM current value with at least neutral production support",
		};
	}

	if (
		row.age >= 28 &&
		flags.creatorGuard &&
		row.valueNoPot >= 52 &&
		row.PER >= 13 &&
		row.EWA >= 2
	) {
		return {
			tier: "VETERAN_ROTATION_GUARD",
			reason:
				"veteran guard creator profile with rotation minutes, passing composite, and positive production",
		};
	}

	if (flags.youngUpside && !flags.establishedStarter) {
		return {
			tier: "YOUNG_UPSIDE_SUSPECT",
			reason:
				"young player with pot/premium upside but not enough starter role or production certainty",
		};
	}

	if (
		flags.shootingSpecialist &&
		row.valueNoPot >= 50 &&
		row.GP >= 50 &&
		row.MPG >= 10
	) {
		return {
			tier: "SPECIALIST_ROTATION",
			reason:
				"rotation sample with strong shootingThreePointer composite and 3 skill margin",
		};
	}

	if (
		row.age >= 30 &&
		flags.defenseOrReboundBig &&
		row.PER >= 12 &&
		row.valueNoPot >= 50
	) {
		return {
			tier: "VETERAN_MINIMUM_PLUS",
			reason:
				"older frontcourt player with rebound/defense composite value but limited role/value ceiling",
		};
	}

	if (
		flags.smallButRealRole &&
		row.age < 30 &&
		row.valueNoPot >= 50 &&
		!flags.poorProduction
	) {
		return {
			tier: "LOW_ROTATION_PLUS",
			reason:
				"small but real regular-season role with non-poor production and BBGM current value above replacement",
		};
	}

	return {
		tier: "MINIMUM_LEVEL",
		reason:
			"falls through to minimum after role, production, age, and archetype checks",
	};
};

export const tierRange = (tier, row, attrs) => {
	const spec = MODEL_TIERS[tier];
	if (!spec) {
		throw new Error(`Unknown model tier ${tier}`);
	}

	let min;
	let max;
	if (spec.rangeType === "minimumMultiplier") {
		min = row.minContractForPlayer * spec.minMultiplier;
		max = row.minContractForPlayer * spec.maxMultiplier;
	} else if (spec.rangeType === "capPct") {
		min =
			spec.min === "playerMinimum"
				? row.minContractForPlayer
				: attrs.salaryCap * spec.minPct;
		max = attrs.salaryCap * spec.maxPct;
	} else if (spec.rangeType === "eligibleMaxPct") {
		min = row.eligibleMax * spec.minPct;
		max = row.eligibleMax * spec.maxPct;
	}

	min = Math.max(row.minContractForPlayer, min);
	max = Math.max(min, max);

	return {
		modelRangeMin: Math.round(min),
		modelRangeMax: Math.round(max),
		modelRangeCapMin: min / attrs.salaryCap,
		modelRangeCapMax: max / attrs.salaryCap,
		modelYears: spec.years ?? "",
		modelRangeText:
			min === max
				? money(Math.round(min))
				: `${money(Math.round(min))}-${money(Math.round(max))}`,
		modelCapRangeText:
			min === max
				? pct(min / attrs.salaryCap)
				: `${pct(min / attrs.salaryCap)}-${pct(max / attrs.salaryCap)}`,
	};
};

const targetRangeK = (target, row) => {
	if (!Array.isArray(target?.targetRangeM)) {
		return {};
	}

	const [rawMin, rawMax] = target.targetRangeM;
	const min =
		rawMin === null || rawMin === undefined
			? row.minContractForPlayer
			: rawMin * 1000;
	const unclampedMax =
		rawMax === null || rawMax === undefined
			? row.minContractForPlayer
			: rawMax * 1000;
	const max = Math.max(min, unclampedMax);

	return {
		targetRangeMin: min,
		targetRangeMax: max,
		targetRangeText:
			min === max ? money(min) : `${money(min)}-${money(max)}`,
	};
};

const rangesOverlap = (aMin, aMax, bMin, bMax) => {
	const tolerance = 100;
	return aMin <= bMax + tolerance && bMin <= aMax + tolerance;
};

const evaluateHit = (row, target, score, range) => {
	const comparableTier = comparableTargetTier(target?.targetTier);
	const tierHit = score.tier === comparableTier;
	const targetRange = targetRangeK(target, row);
	const rangeHit =
		targetRange.targetRangeMin === undefined
			? true
			: rangesOverlap(
					range.modelRangeMin,
					range.modelRangeMax,
					targetRange.targetRangeMin,
					targetRange.targetRangeMax,
				);
	const lengthRiskMiss =
		target?.targetTier === "LOW_END_STARTER_GUARD_LENGTH_RISK" &&
		row.normalNoOptionContractYears > 2;
	const hit = tierHit && rangeHit && !lengthRiskMiss;

	const missReasons = [];
	if (!tierHit) {
		missReasons.push(`tier ${score.tier} vs target ${target.targetTier}`);
	}
	if (!rangeHit) {
		missReasons.push(
			`model range ${range.modelRangeText} does not overlap target ${targetRange.targetRangeText}`,
		);
	}
	if (lengthRiskMiss) {
		missReasons.push(
			`AAV aligns with starter tier, but ${row.normalNoOptionContractYears}-year guard length risk is not modeled by base tiers`,
		);
	}

	return {
		comparableTargetTier: comparableTier,
		hit,
		hitStatus: hit ? "HIT" : "MISS",
		rangeHit,
		targetRangeText: targetRange.targetRangeText ?? "",
		tierHit,
		missReason: missReasons.join("; "),
	};
};

export const scoreRows = ({ proxyRows, targets, attrs }) => {
	const targetByPid = targetsByPid(targets);
	return proxyRows.map((row) => {
		const target = targetByPid[row.pid];
		const score = scoreTier(row);
		const range = tierRange(score.tier, row, attrs);
		const evaluation = evaluateHit(row, target, score, range);
		const modelMid = (range.modelRangeMin + range.modelRangeMax) / 2;

		return {
			...row,
			modelTier: score.tier,
			modelReason: score.reason,
			...range,
			modelMidAmount: modelMid,
			modelMidCapPct: modelMid / attrs.salaryCap,
			targetTierOriginal: target?.targetTier,
			targetTierComparable: evaluation.comparableTargetTier,
			targetRangeText: evaluation.targetRangeText,
			hitStatus: evaluation.hitStatus,
			tierHit: evaluation.tierHit,
			rangeHit: evaluation.rangeHit,
			missReason: evaluation.missReason,
		};
	});
};

const main = () => {
	const save = readSave(savePath);
	const notes = readJsonIfExists(notesPath, {});
	const targets = readJsonIfExists(targetsPath, []);
	const validationHumanNotes = readJsonIfExists(validationHumanNotesPath, {});
	fs.mkdirSync(artifactsDir, { recursive: true });
	const anchorEntries = anchorEntriesFromNotes(notes);
	const { attrs, rows: proxyRows } = buildProxyRows({
		root,
		save,
		anchorEntries,
		targetByPid: targetsByPid(targets),
	});
	const scoredRows = scoreRows({ proxyRows, targets, attrs });

	const columnOrder = [
		"pid",
		"name",
		"age",
		"pos",
		"targetTierOriginal",
		"targetTierComparable",
		"targetRangeText",
		"modelTier",
		"modelRangeText",
		"modelCapRangeText",
		"modelYears",
		"hitStatus",
		"missReason",
		"modelReason",
		"normalNoOptionContractAmount",
		"normalNoOptionContractYears",
		"normalNoOptionContractCapPct",
		"rawContractAmount",
		"rawContractYears",
		"rawContractOption",
		"minContractForPlayer",
		"eligibleMax",
		"estimatedDemandNoRandom",
		"getContractValue",
		"valueNoPot",
		"value",
		"potentialPremium",
		"GP",
		"MPG",
		"starterShare",
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
		"DRB%",
		"ORB%",
		"STL%",
		"BLK%",
		"comp_usage",
		"comp_passing",
		"comp_dribbling",
		"comp_shootingThreePointer",
		"comp_rebounding",
		"comp_offensiveRebounding",
		"comp_defensiveRebounding",
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

	writeCsv(csvPath, scoredRows, columnOrder);

	const summaryColumns = [
		{ key: "pid", label: "pid" },
		{ key: "name", label: "player" },
		{ key: "targetTierOriginal", label: "target tier" },
		{ key: "modelTier", label: "model tier" },
		{ key: "targetRangeText", label: "target range" },
		{ key: "modelRangeText", label: "model range" },
		{ key: "modelCapRangeText", label: "model cap%" },
		{ key: "modelYears", label: "years" },
		{ key: "hitStatus", label: "hit/miss" },
		{ key: "missReason", label: "miss reason" },
	];

	const proxyColumns = [
		{ key: "pid", label: "pid" },
		{ key: "name", label: "player" },
		{ key: "modelTier", label: "model tier" },
		{
			key: "normalNoOptionContractAmount",
			label: "normal current",
			format: money,
		},
		{ key: "estimatedDemandNoRandom", label: "demand", format: money },
		{
			key: "getContractValue",
			label: "contractValue",
			format: (v) => round(v, 1),
		},
		{ key: "valueNoPot", label: "valueNoPot", format: (v) => round(v, 1) },
		{ key: "value", label: "value", format: (v) => round(v, 1) },
		{ key: "MPG", label: "MPG", format: (v) => round(v, 1) },
		{ key: "starterShare", label: "start%", format: pct },
		{ key: "PER", label: "PER", format: (v) => round(v, 1) },
		{ key: "EWA", label: "EWA", format: (v) => round(v, 1) },
		{ key: "BPM", label: "BPM", format: (v) => round(v, 1) },
	];

	const misses = scoredRows.filter((row) => row.hitStatus !== "HIT");
	const missText =
		misses.length === 0
			? "- No misses in the 15-anchor sandbox."
			: misses
					.map(
						(row) =>
							`- ${row.name}: ${row.missReason}. Rule fired because ${row.modelReason}.`,
					)
					.join("\n");

	const hitCount = scoredRows.length - misses.length;
	const md = `# Contract Market Tier Scoring Sandbox

Inputs:

- \`${path.relative(root, savePath)}\`
- \`${path.relative(root, targetsPath)}\`

Scope: sandbox only. No \`src\` changes. Proxy calculations are imported from \`tools/contract-market-proxy-core.mjs\`, the same helper used by \`tools/contract-market-proxy-explore.mjs\`.

Hit rate on these anchors: ${hitCount}/${scoredRows.length}. Hit means model tier matches the comparable manual target and model amount range overlaps the manual target range when one is specified. \`LOW_END_STARTER_GUARD_LENGTH_RISK\` is intentionally marked miss if the current normal/no-option guard length is still risky.

Validation human notes input: \`${path.relative(root, validationHumanNotesPath)}\` (${Object.keys(validationHumanNotes).length} entries loaded if present). This script is ready to read validation20 export JSON, but anchor tier scoring below only uses the fixed anchor targets.

## Anchor Results

${markdownTable(scoredRows, summaryColumns)}

## Key Proxy Snapshot

${markdownTable(scoredRows, proxyColumns)}

## Miss Reasons

${missText}

## Tier Range Rules

| tier | amount range |
| --- | --- |
| MINIMUM_LEVEL | player minimum to 1.15x player minimum |
| VETERAN_MINIMUM_PLUS | player minimum to 3.5% cap |
| LOW_ROTATION_PLUS | 2.0%-3.5% cap |
| SPECIALIST_ROTATION | 3.5%-5.5% cap |
| YOUNG_UPSIDE_SUSPECT | 2.5%-4.5% cap |
| VETERAN_ROTATION_GUARD | 4.0%-6.0% cap, length 1-2 years |
| LOW_END_STARTER | 6.0%-12.0% cap |
| YOUNG_PROVEN_STARTER | 17.0%-22.5% cap |
| STAR_NEAR_MAX | 88%-100% eligible max |
| SUPERSTAR_MAX | 100% eligible max |

## Rules That Need Validation

- The thresholds for \`YOUNG_PROVEN_STARTER\` vs \`STAR_NEAR_MAX\` are still coarse. They lean on \`getContractValue\`, \`valueNoPot\`, starter load, and EWA/VORP/BPM, but need a larger validation set around upper-end starters.
- \`LOW_END_STARTER\` currently treats starter role plus BBGM current value as enough. It needs validation for inefficient starters with strong minutes but weak impact stats.
- \`YOUNG_UPSIDE_SUSPECT\` uses potential premium and pot with role uncertainty. This should be checked against young athletic wings/guards who start because of roster context.
- \`VETERAN_ROTATION_GUARD\` has an explicit 1-2 year length rule, but other tiers do not yet model length risk. The London Perrantes style target shows that AAV and term need separate scoring.
- Specialist scoring uses 3pt composite and skill margin. It needs validation for defensive specialists, rebound-only bigs, and pass-first bench guards so specialist tiers do not become shooting-only.
- \`On-Off\` is included as context but deliberately not a hard tier splitter. A larger set should determine whether it adds signal after minutes and EWA/VORP/BPM.
`;

	fs.writeFileSync(mdPath, md);

	console.log(`Wrote ${path.relative(root, csvPath)}`);
	console.log(`Wrote ${path.relative(root, mdPath)}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
