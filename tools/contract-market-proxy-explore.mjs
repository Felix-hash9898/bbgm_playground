#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	COMPOSITE_KEYS,
	SKILL_KEYS,
	anchorEntriesFromNotes,
	buildProxyRows,
	markdownTable,
	money,
	pct,
	pearson,
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
const artifactsDir = path.join(root, "contract_market_artifacts");
const targetsPath = path.join(
	artifactsDir,
	"contract_market_anchor_targets.json",
);
const csvPath = path.join(artifactsDir, "contract_market_proxy_explore.csv");
const mdPath = path.join(artifactsDir, "contract_market_proxy_explore.md");

export const proxyExploreColumnOrder = (compositeWeights) => [
	"pid",
	"name",
	"tid",
	"age",
	"pos",
	"ovr",
	"pot",
	"value",
	"valueNoPot",
	"potentialPremium",
	"valueComputed",
	"valueNoPotComputed",
	"valueDiff",
	"valueNoPotDiff",
	"getContractValue",
	"estimatedDemandNoRandom",
	"rawContractAmount",
	"rawContractYears",
	"rawContractOption",
	"normalNoOptionContractAmount",
	"normalNoOptionContractYears",
	"normalNoOptionContractCapPct",
	"eligibleMax",
	"eligibleMaxTier",
	"minContractForPlayer",
	"latestRegularSeason",
	"GP",
	"GS",
	"min",
	"MPG",
	"starterShare",
	"PTS",
	"TRB",
	"AST",
	"STL",
	"BLK",
	"TOV",
	"ptsTotal",
	"trbTotal",
	"astTotal",
	"stlTotal",
	"blkTotal",
	"tovTotal",
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
	"DRB%",
	"ORB%",
	"STL%",
	"BLK%",
	...COMPOSITE_KEYS.map((key) => `comp_${key}`),
	"skills",
	"generatedSkills",
	...SKILL_KEYS.flatMap((key) => {
		const label = compositeWeights[key].skill.label;
		return [
			`skill_${label}_rating`,
			`skill_${label}_cutoff`,
			`skill_${label}_margin`,
			`skill_${label}_pass`,
		];
	}),
	"note",
	"targetTier",
	"targetRangeM",
	"targetNotes",
	"targetTierScore",
];

const main = () => {
	const save = readSave(savePath);
	const notes = readJsonIfExists(notesPath, {});
	const targets = readJsonIfExists(targetsPath, []);
	fs.mkdirSync(artifactsDir, { recursive: true });
	const anchorEntries = anchorEntriesFromNotes(notes);
	const { attrs, compositeWeights, ovrMean, ovrStd, rows } = buildProxyRows({
		root,
		save,
		anchorEntries,
		targetByPid: targetsByPid(targets),
	});

	writeCsv(csvPath, rows, proxyExploreColumnOrder(compositeWeights));

	const correlationKeys = [
		"getContractValue",
		"estimatedDemandNoRandom",
		"valueNoPot",
		"value",
		"potentialPremium",
		"ovr",
		"pot",
		"min",
		"MPG",
		"starterShare",
		"PER",
		"EWA",
		"VORP",
		"BPM",
		"USG",
		"On-Off",
		"comp_usage",
		"comp_passing",
		"comp_shootingThreePointer",
		"comp_rebounding",
		"comp_defense",
		"comp_defenseInterior",
		"comp_defensePerimeter",
		"comp_athleticism",
	];
	const correlations = correlationKeys
		.map((key) => ({
			key,
			r: pearson(rows, key, "targetTierScore"),
		}))
		.filter((row) => Number.isFinite(row.r))
		.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

	const topCorrelationRows = correlations.slice(0, 10).map((row) => ({
		proxy: row.key,
		pearsonVsTargetScore: round(row.r, 3),
	}));

	const overviewColumns = [
		{ key: "pid", label: "pid" },
		{ key: "name", label: "player" },
		{ key: "age", label: "age" },
		{ key: "pos", label: "pos" },
		{ key: "ovr", label: "ovr" },
		{ key: "pot", label: "pot" },
		{ key: "valueNoPot", label: "valueNoPot", format: (v) => round(v, 1) },
		{ key: "value", label: "value", format: (v) => round(v, 1) },
		{ key: "potentialPremium", label: "prem", format: (v) => round(v, 1) },
		{
			key: "getContractValue",
			label: "contractValue",
			format: (v) => round(v, 1),
		},
		{ key: "estimatedDemandNoRandom", label: "demand", format: money },
		{
			key: "normalNoOptionContractAmount",
			label: "normal current",
			format: money,
		},
		{ key: "rawContractOption", label: "option" },
		{
			key: "normalNoOptionContractCapPct",
			label: "cap%",
			format: pct,
		},
		{ key: "eligibleMax", label: "eligibleMax", format: money },
		{ key: "targetTier", label: "target" },
	];

	const statsColumns = [
		{ key: "pid", label: "pid" },
		{ key: "name", label: "player" },
		{ key: "GP", label: "GP" },
		{ key: "GS", label: "GS" },
		{ key: "MPG", label: "MPG", format: (v) => round(v, 1) },
		{ key: "starterShare", label: "start%", format: pct },
		{ key: "PTS", label: "PTS", format: (v) => round(v, 1) },
		{ key: "TRB", label: "TRB", format: (v) => round(v, 1) },
		{ key: "AST", label: "AST", format: (v) => round(v, 1) },
		{ key: "PER", label: "PER", format: (v) => round(v, 1) },
		{ key: "EWA", label: "EWA", format: (v) => round(v, 1) },
		{ key: "VORP", label: "VORP", format: (v) => round(v, 1) },
		{ key: "BPM", label: "BPM", format: (v) => round(v, 1) },
		{ key: "USG", label: "USG", format: (v) => round(v, 1) },
		{ key: "On-Off", label: "On-Off", format: (v) => round(v, 1) },
	];

	const compositeColumns = [
		{ key: "pid", label: "pid" },
		{ key: "name", label: "player" },
		{ key: "skills", label: "skills" },
		{ key: "comp_usage", label: "usage", format: (v) => round(v, 3) },
		{ key: "comp_passing", label: "passing", format: (v) => round(v, 3) },
		{
			key: "comp_shootingThreePointer",
			label: "3pt",
			format: (v) => round(v, 3),
		},
		{ key: "comp_rebounding", label: "reb", format: (v) => round(v, 3) },
		{
			key: "comp_defenseInterior",
			label: "Di",
			format: (v) => round(v, 3),
		},
		{
			key: "comp_defensePerimeter",
			label: "Dp",
			format: (v) => round(v, 3),
		},
		{ key: "comp_athleticism", label: "ath", format: (v) => round(v, 3) },
	];

	const md = `# Contract Market Proxy Exploration

Inputs:

- \`${path.relative(root, savePath)}\`
- \`${path.relative(root, notesPath)}\`
- \`${path.relative(root, targetsPath)}\`

Scope: standalone proxy dump only. This script does not import or modify formal game logic. Shared proxy formulas live in \`tools/contract-market-proxy-core.mjs\` and replicate the basketball branches of \`player/value.ts\`, \`contracts/contractValue.ts\`, contract min/max helpers, option effective-offer helpers, and \`player/compositeRating.ts\`. \`COMPOSITE_WEIGHTS\` is read from \`src/common/constants.basketball.ts\` at runtime.

League context: season ${attrs.season}, phase ${attrs.phase}, salary cap ${money(attrs.salaryCap)}, min ${money(attrs.minContract)}, global max ${money(attrs.maxContract)}. Active-player OVR normalization used by \`value.ts\`: mean ${round(ovrMean, 3)}, std ${round(ovrStd, 3)}.

## Anchor Overview

${markdownTable(rows, overviewColumns)}

## Latest Regular Season Production

${markdownTable(rows, statsColumns)}

## BBGM Composite Ratings

${markdownTable(rows, compositeColumns)}

## Top Simple Correlations vs Manual Target Buckets

${markdownTable(topCorrelationRows, [
	{ key: "proxy", label: "proxy" },
	{ key: "pearsonVsTargetScore", label: "Pearson r" },
])}

## What Looks Most Explanatory

- \`estimatedDemandNoRandom\`, \`getContractValue\`, \`valueNoPot\`, and \`value\` remain the strongest first-pass anchors because they reuse BBGM's current-production/PER/rating blend and salary conversion.
- Minute load and role proxies (\`min\`, \`MPG\`, \`starterShare\`) separate real starters from small-sample playoff or bench-only lines better than efficiency alone.
- \`PER\`, \`EWA\`, \`VORP\`, and \`BPM\` are useful when they agree with minutes. \`EWA/VORP\` help distinguish full-season value from high-rate small samples.
- Composite ratings explain archetype premiums: \`usage\` for primary scorers, \`passing\` for guards/creators, \`rebounding/defenseInterior\` for bigs, \`defensePerimeter/athleticism\` for wings and guards. Skill cutoff margin is more useful than label alone.

## What Looks Misleading

- Raw \`pot\` and \`potentialPremium\` can overstate young, limited-minute players. BBGM's \`getContractValue\` intentionally dampens trade-value upside for contract pricing, especially for age <= 24 with <1500 recent minutes.
- Small-sample \`PER\`, \`On-Off\`, \`TS\`, and \`eFG\` can mislead when latest regular season minutes are low.
- \`On-Off\` is context sensitive in a 15-player anchor set. It is a warning flag, not a tier driver.
- Skill labels are thresholded and fuzzed. A player barely above/below \`3\`, \`Ps\`, \`R\`, \`Di\`, \`Dp\`, or \`A\` should not jump tiers without the underlying composite margin and production support.

## Suggested Next Step for Tier Scoring

Use \`estimatedDemandNoRandom\` or \`getContractValue\` as the base market axis, then adjust with explicit modifiers:

1. Role/sample modifier from \`min\`, \`MPG\`, \`starterShare\`, and \`GP\`.
2. Production modifier from \`EWA/VORP/BPM/PER\`, with small-sample shrinkage.
3. Archetype modifier from composite ratings and skill margins.
4. Upside/risk modifier from age, \`potentialPremium\`, and recent minutes, capped so raw potential cannot dominate the BBGM contract-value base.
5. Clamp against \`minContractForPlayer\`, low-end young FA rules, and \`eligibleMax\`.

CSV contains the full dump, including all requested advanced stats, normal/no-option contract fields, and skill cutoff margins.
`;

	fs.writeFileSync(mdPath, md);

	console.log(`Wrote ${path.relative(root, csvPath)}`);
	console.log(`Wrote ${path.relative(root, mdPath)}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
