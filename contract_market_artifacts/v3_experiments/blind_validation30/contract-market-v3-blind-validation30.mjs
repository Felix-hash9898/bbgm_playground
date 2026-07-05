#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csvParse } from "d3-dsv";
import {
	buildProxyRows,
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

const CONFIG = {
	seed: 20260705,
	total: 30,
	localStorageKey: "bbgm-contract-v3-blind-validation30-notes",
	maxPerTeam: 3,
	quotas: {
		elite_maxish: 3,
		young_proven_high_starter: 4,
		solid_starter_v3_ab: 4,
		low_end_starter_retained: 5,
		high_end_rotation_v3_ab: 5,
		mid_rotation_mixed: 5,
		low_salary_minimum_fringe: 4,
	},
	ranges: {
		highEndRotation: { minPct: 0.07, maxPct: 0.12 },
		solidStarter: { minPct: 0.12, maxPct: 0.17 },
	},
	exclusionFiles: [
		"contract_market_artifacts/contract_market_boundary40_candidates.csv",
		"contract_market_artifacts/contract_market_boundary40_v2_score.csv",
		"contract_market_artifacts/contract_market_boundary40_v1_v2_comparable_eval.csv",
		"contract_market_artifacts/contract_market_validation20_candidates.csv",
		"contract_market_artifacts/contract_market_validation20_v2_score.csv",
		"contract_market_artifacts/contract_market_validation20_v1_v2_comparable_eval.csv",
		"contract_market_artifacts/v3_experiments/ab_combined_audit/labeled_eval.csv",
	],
};

const STRATA = {
	elite_maxish: {
		label: "Elite / max-ish",
		goal: "Validate that top-end/max-ish asks are not materially low/high.",
	},
	young_proven_high_starter: {
		label: "Young proven / high starter",
		goal: "Validate the 17%-22.5% neighborhood for young/high starters.",
	},
	solid_starter_v3_ab: {
		label: "SOLID_STARTER",
		goal: "Blind check of the temporary 12%-17% V3-AB SOLID_STARTER lane.",
	},
	low_end_starter_retained: {
		label: "LOW_END_STARTER retained",
		goal: "Check whether the remaining low-end starters are still priced reasonably.",
	},
	high_end_rotation_v3_ab: {
		label: "HIGH_END_ROTATION",
		goal: "Blind check of the temporary 7%-12% V3-AB high-end rotation lane.",
	},
	mid_rotation_mixed: {
		label: "Mid rotation mixed",
		goal: "Check mid-rotation players not lifted by V3-AB.",
	},
	low_salary_minimum_fringe: {
		label: "Low salary / minimum / fringe",
		goal: "Keep a small low-end sanity sample without dominating the set.",
	},
};

const out = {
	script: path.join(outDir, "contract-market-v3-blind-validation30.mjs"),
	candidates: path.join(outDir, "blind_validation30_candidates.csv"),
	notesTemplate: path.join(outDir, "blind_validation30_notes_template.json"),
	blindHtml: path.join(outDir, "blind_validation30_review_blind.html"),
	debugHtml: path.join(outDir, "blind_validation30_review_debug.html"),
	report: path.join(outDir, "blind_validation30_selection_report.md"),
	readme: path.join(outDir, "README.md"),
};

const num = (row, key, fallback = undefined) => {
	const parsed = Number(row?.[key]);
	return Number.isFinite(parsed) ? parsed : fallback;
};
const sum = (values) =>
	values.reduce(
		(total, value) =>
			total + (Number.isFinite(Number(value)) ? Number(value) : 0),
		0,
	);
const avg = (values) => {
	const finite = values.map(Number).filter(Number.isFinite);
	return finite.length ? sum(finite) / finite.length : "";
};
const groupRows = (rows, keyFn) => {
	const map = new Map();
	for (const row of rows) {
		const key = keyFn(row);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(row);
	}
	return [...map.entries()];
};
const htmlEscape = (value) =>
	String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
const fmt = (value, digits = 1) =>
	Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "--";
const fmtM = (value) =>
	Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}M` : "--";
const fmtPct = (value) =>
	Number.isFinite(Number(value))
		? `${(100 * Number(value)).toFixed(1)}%`
		: "--";
const rng = (seed) => {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 0x100000000;
	};
};
const shuffle = (items, random) =>
	items
		.map((item) => ({ item, sort: random() }))
		.sort((a, b) => a.sort - b.sort)
		.map(({ item }) => item);

const csvRows = (csvPath) =>
	fs.existsSync(csvPath) ? csvParse(fs.readFileSync(csvPath, "utf8")) : [];

const readExclusions = () => {
	const pids = new Set();
	const names = new Set();
	for (const relPath of CONFIG.exclusionFiles) {
		for (const row of csvRows(path.join(root, relPath))) {
			if (row.pid !== undefined && row.pid !== "") pids.add(Number(row.pid));
			if (row.name) names.add(String(row.name));
		}
	}
	return { pids, names };
};

const supportScore = (entries) =>
	entries
		.filter((entry) => entry.passed)
		.reduce((total, entry) => total + entry.weight, 0);
const signal = (label, passed, weight = 1) => ({ label, passed, weight });

const roleSignals1A = (row) => [
	signal(
		"strong rotation role: GP >= 50 and MPG >= 22",
		row.GP >= 50 && row.MPG >= 22,
	),
	signal("real role fallback: MPG >= 22", row.MPG >= 22, 0.75),
	signal(
		"real role fallback: GP >= 55 and MPG >= 20",
		row.GP >= 55 && row.MPG >= 20,
		0.75,
	),
];
const coreSignals1A = (row) => [
	signal(
		"creator/scorer core",
		(row.USG >= 22 && row.PTS >= 12) || row["AST%"] >= 18 || row.AST >= 4,
	),
	signal(
		"portable shooting core",
		row.comp_shootingThreePointer >= 0.64 &&
			row.skill_3_margin >= 0.04 &&
			row.TS >= 0.54,
	),
	signal(
		"young productive core",
		row.age <= 25 &&
			row.MPG >= 18 &&
			(row.EWA >= 1.5 || row.BPM >= -1 || row.value >= 57),
	),
	signal(
		"connector/defense core",
		row.MPG >= 20 &&
			(row.valueNoPot >= 52 || row.getContractValue >= 52) &&
			supportScore([
				signal("defense interior composite", row.comp_defenseInterior >= 0.62),
				signal(
					"defense perimeter composite",
					row.comp_defensePerimeter >= 0.62,
				),
				signal("rebounding composite", row.comp_rebounding >= 0.62),
				signal("blocking composite", row.comp_blocking >= 0.62),
				signal("passing composite", row.comp_passing >= 0.58, 0.75),
				signal("impact stat support", row.BPM >= 0 || row.VORP >= 0.5, 0.75),
			]) >= 2,
	),
];
const valueSignals1A = (row) => [
	signal("value support: valueNoPot >= 55", row.valueNoPot >= 55),
	signal("value support: contractValue >= 55", row.getContractValue >= 55),
	signal(
		"production support: EWA/VORP/BPM/PER",
		row.EWA >= 2 || row.VORP >= 0.2 || row.BPM >= -0.5 || row.PER >= 14,
	),
];
const highEndRotationCheck = (row, currentTier) => {
	const fails = [];
	if (row.GP < 45) fails.push("GP < 45");
	if (row.MPG < 18) fails.push("MPG < 18");
	if (row.valueNoPot < 52) fails.push("valueNoPot < 52");
	if (row.getContractValue < 52 && row.value < 54)
		fails.push("contractValue < 52 and value < 54");
	if (row.PER < 9 && row.BPM < -3) fails.push("PER < 9 and BPM < -3");
	if (currentTier === "MINIMUM_LEVEL") {
		if (row.MPG < 22) fails.push("minimum stronger floor: MPG < 22");
		if (row.valueNoPot < 55)
			fails.push("minimum stronger floor: valueNoPot < 55");
		if (row.getContractValue < 55)
			fails.push("minimum stronger floor: contractValue < 55");
		if (!(row.EWA >= 2 || row.VORP >= 0.2 || row.BPM >= -0.5))
			fails.push("minimum stronger floor: no neutral production");
	}
	if (
		[
			"SUPERSTAR_MAX",
			"STAR_NEAR_MAX",
			"YOUNG_PROVEN_STARTER",
			"LOW_END_STARTER",
		].includes(currentTier)
	) {
		fails.push("protected current starter/star tier");
	}
	const role = roleSignals1A(row);
	const core = coreSignals1A(row);
	const value = valueSignals1A(row);
	const entries = [...role, ...core, ...value].filter((entry) => entry.passed);
	if (supportScore(role) < 0.75) fails.push("missing real role support");
	if (!core.some((entry) => entry.passed)) fails.push("missing core identity");
	if (!value.some((entry) => entry.passed))
		fails.push("missing value/production support");
	if (supportScore(entries) < 3) fails.push("support score < 3");
	return {
		passed: fails.length === 0,
		signals: entries.map((entry) => entry.label),
		failReasons: fails,
	};
};

const defenseConnectorSupport = (row) =>
	[
		row.comp_defenseInterior >= 0.62,
		row.comp_defensePerimeter >= 0.62,
		row.comp_rebounding >= 0.62,
		row.comp_blocking >= 0.62,
		row.comp_passing >= 0.58,
		row.BPM >= 0.5 || row.VORP >= 0.8,
	].filter(Boolean).length >= 2;
const shootingSpacingSupport = (row) =>
	row.comp_shootingThreePointer >= 0.64 &&
	row.skill_3_margin >= 0.04 &&
	row.TS >= 0.54;
const solidStarterCheck = (row, currentTier) => {
	const fails = [];
	if (currentTier !== "LOW_END_STARTER")
		fails.push(`current tier ${currentTier} blocked`);
	if (row.GP < 55) fails.push("GP < 55");
	if (row.MPG < 29) fails.push("MPG < 29");
	if (row.valueNoPot < 60) fails.push("valueNoPot < 60");
	if (row.getContractValue < 60) fails.push("contractValue < 60");
	const role = [
		signal("role: starterShare >= 0.65", row.starterShare >= 0.65),
		signal("role: GS >= 50", row.GS >= 50),
		signal("role: MPG >= 31", row.MPG >= 31),
	];
	const prod = [
		signal("production: BPM >= 1", row.BPM >= 1),
		signal("production: EWA >= 5", row.EWA >= 5),
		signal("production: VORP >= 1", row.VORP >= 1),
		signal("production: PER >= 16", row.PER >= 16),
	];
	const extra = [
		signal("extra: BPM >= 1.5", row.BPM >= 1.5),
		signal("extra: EWA >= 6", row.EWA >= 6),
		signal("extra: VORP >= 1.5", row.VORP >= 1.5),
		signal("extra: PER >= 17", row.PER >= 17),
		signal(
			"extra: defense/rebounding/connector support",
			defenseConnectorSupport(row),
		),
		signal("extra: shooting/spacing support", shootingSpacingSupport(row)),
		signal(
			"extra: age <= 27 with value/pot support",
			row.age <= 27 && (row.value >= 58 || row.pot >= 65),
		),
	];
	const exception =
		row.BPM < 0 &&
		currentTier === "LOW_END_STARTER" &&
		row.MPG >= 30 &&
		row.valueNoPot >= 61 &&
		row.getContractValue >= 61 &&
		(row.EWA >= 5 || row.VORP >= 1 || row.PER >= 17) &&
		(defenseConnectorSupport(row) || shootingSpacingSupport(row)) &&
		row.PER >= 12;
	if (!role.some((entry) => entry.passed)) fails.push("missing role core");
	if (prod.filter((entry) => entry.passed).length < 2)
		fails.push("production core count < 2");
	if (!extra.some((entry) => entry.passed)) fails.push("missing extra support");
	if (row.BPM < 0 && !exception) fails.push("BPM < 0 without exception path");
	const signals = [
		...role.filter((entry) => entry.passed).map((entry) => entry.label),
		"value core: valueNoPot >= 60 and contractValue >= 60",
		...prod.filter((entry) => entry.passed).map((entry) => entry.label),
		...extra.filter((entry) => entry.passed).map((entry) => entry.label),
		exception ? "BPM<0 exception path" : "",
	].filter(Boolean);
	return { passed: fails.length === 0, signals, failReasons: fails };
};

const capRange = ({ row, attrs, minPct, maxPct }) => {
	const min = Math.max(row.minContractForPlayer, attrs.salaryCap * minPct);
	const max = Math.max(min, attrs.salaryCap * maxPct);
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
const v3Range = (row, attrs) => {
	if (row.v3Tier === "HIGH_END_ROTATION")
		return capRange({ row, attrs, ...CONFIG.ranges.highEndRotation });
	if (row.v3Tier === "SOLID_STARTER")
		return capRange({ row, attrs, ...CONFIG.ranges.solidStarter });
	const range = tierRange(row.v3Tier, row, attrs);
	return {
		minM: range.modelRangeMin / 1000,
		maxM: range.modelRangeMax / 1000,
		text: range.modelRangeText,
		years: range.modelYears,
	};
};

const latestRatingsByPid = (save) =>
	new Map(
		save.players.map((player) => [player.pid, player.ratings?.at(-1) ?? {}]),
	);
const teamMap = (save) => new Map(save.teams.map((team) => [team.tid, team]));

const loadRows = () => {
	const save = readSave(savePath);
	const entries = save.players
		.filter(
			(player) =>
				player.tid >= 0 &&
				player.stats?.some((stats) => !stats.playoffs) &&
				player.ratings?.length,
		)
		.map((player) => ({
			key: `blind-validation30-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries: entries,
	});
	const playersByPid = new Map(
		save.players.map((player) => [player.pid, player]),
	);
	const teams = teamMap(save);
	return {
		save,
		attrs,
		rows: rows
			.map((row) => ({
				...row,
				player: playersByPid.get(row.pid),
				ratings: playersByPid.get(row.pid)?.ratings?.at(-1) ?? {},
				teamAbbrev: teams.get(row.tid)?.abbrev ?? "",
				teamName: teams.get(row.tid)
					? `${teams.get(row.tid).region} ${teams.get(row.tid).name}`
					: "Free Agent",
			}))
			.filter((row) => row.GP > 0 && Number.isFinite(Number(row.MPG))),
	};
};

const computeCurrentAndV3 = (rows, attrs) =>
	rows.map((row) => {
		const current = scoreTier(row);
		const oneA = highEndRotationCheck(row, current.tier);
		const oneB = solidStarterCheck(row, current.tier);
		let v3Tier = current.tier;
		let responsibleModule = "none";
		let v3Reason = `kept current scoreTier (${current.tier})`;
		let v3Signals = [];
		if (oneA.passed && oneB.passed) {
			v3Tier = "SOLID_STARTER";
			responsibleModule = "conflict";
			v3Reason = "CONFLICT: 1A and 1B-B both passed";
			v3Signals = [...oneA.signals, ...oneB.signals];
		} else if (oneB.passed) {
			v3Tier = "SOLID_STARTER";
			responsibleModule = "1B-B";
			v3Reason = "V3-1B-narrow-B SOLID_STARTER bridge";
			v3Signals = oneB.signals;
		} else if (oneA.passed) {
			v3Tier = "HIGH_END_ROTATION";
			responsibleModule = "1A";
			v3Reason = "V3-1A HIGH_END_ROTATION bridge";
			v3Signals = oneA.signals;
		}
		const currentRange = tierRange(current.tier, row, attrs);
		const v3Base = {
			...row,
			currentTier: current.tier,
			v3Tier,
			responsibleModule,
			v3Reason,
		};
		const v3R = v3Range(v3Base, attrs);
		const currentV2 = scoreContractMarketV2(
			{
				...row,
				debugModelTier: current.tier,
				debugModelRangeText: currentRange.modelRangeText,
				modelYears: currentRange.modelYears,
				debugModelReason: current.reason,
			},
			attrs,
		);
		const v3V2 = scoreContractMarketV2(
			{
				...row,
				debugModelTier: v3Tier,
				debugModelRangeText: v3R.text,
				modelYears: v3R.years,
				debugModelReason: v3Reason,
			},
			attrs,
		);
		return {
			...v3Base,
			currentReason: current.reason,
			currentRangeText: currentRange.modelRangeText,
			currentPointM: currentV2.debugPointEstimateM,
			v3RangeText: v3R.text,
			v3PointM: v3V2.debugPointEstimateM,
			v3Signals: v3Signals.join("; "),
		};
	});

const assignHiddenStratum = (row) => {
	if (
		["SUPERSTAR_MAX", "STAR_NEAR_MAX"].includes(row.currentTier) ||
		row.valueNoPot >= 68 ||
		row.getContractValue >= 68
	) {
		return "elite_maxish";
	}
	if (
		row.currentTier === "YOUNG_PROVEN_STARTER" ||
		(row.age <= 26 && row.MPG >= 28 && row.valueNoPot >= 60)
	) {
		return "young_proven_high_starter";
	}
	if (row.v3Tier === "SOLID_STARTER") return "solid_starter_v3_ab";
	if (row.v3Tier === "LOW_END_STARTER") return "low_end_starter_retained";
	if (row.v3Tier === "HIGH_END_ROTATION") return "high_end_rotation_v3_ab";
	if (
		[
			"YOUNG_UPSIDE_SUSPECT",
			"SPECIALIST_ROTATION",
			"VETERAN_ROTATION_GUARD",
		].includes(row.v3Tier)
	) {
		return "mid_rotation_mixed";
	}
	if (
		["MINIMUM_LEVEL", "VETERAN_MINIMUM_PLUS", "LOW_ROTATION_PLUS"].includes(
			row.v3Tier,
		)
	) {
		return "low_salary_minimum_fringe";
	}
	return "mid_rotation_mixed";
};

const positionGroup = (row) => {
	const pos = String(row.pos ?? "");
	if (pos.includes("C")) return "big";
	if (pos.includes("F")) return "forward";
	if (pos.includes("G")) return "guard";
	return "unknown";
};
const ageGroup = (age) =>
	age <= 23 ? "age<=23" : age <= 27 ? "24-27" : age <= 31 ? "28-31" : "32+";

const applyDiversityGuard = ({
	candidates,
	selected,
	teamCounts,
	posCounts,
	quota,
	random,
}) => {
	const chosen = [];
	const shuffled = shuffle(candidates, random);
	const select = (row) => {
		chosen.push(row);
		selected.add(row.pid);
		teamCounts.set(row.tid, (teamCounts.get(row.tid) ?? 0) + 1);
		const pg = positionGroup(row);
		posCounts.set(pg, (posCounts.get(pg) ?? 0) + 1);
	};
	for (const row of shuffled) {
		if (chosen.length >= quota) break;
		if (selected.has(row.pid)) continue;
		if ((teamCounts.get(row.tid) ?? 0) >= CONFIG.maxPerTeam) continue;
		const pg = positionGroup(row);
		if ((posCounts.get(pg) ?? 0) >= 13 && shuffled.length > quota) continue;
		select(row);
	}
	for (const row of shuffled) {
		if (chosen.length >= quota) break;
		if (selected.has(row.pid)) continue;
		select(row);
	}
	return chosen;
};

const stratifiedSample = (rows) => {
	const random = rng(CONFIG.seed);
	const selected = new Set();
	const teamCounts = new Map();
	const posCounts = new Map();
	const byStratum = new Map();
	for (const row of rows) {
		if (!byStratum.has(row.hiddenStratum)) byStratum.set(row.hiddenStratum, []);
		byStratum.get(row.hiddenStratum).push(row);
	}
	const picked = [];
	const shortfalls = [];
	for (const [stratum, quota] of Object.entries(CONFIG.quotas)) {
		const candidates = byStratum.get(stratum) ?? [];
		const chosen = applyDiversityGuard({
			candidates,
			selected,
			teamCounts,
			posCounts,
			quota,
			random,
		});
		if (chosen.length < quota) {
			shortfalls.push({
				stratum,
				requested: quota,
				picked: chosen.length,
				missing: quota - chosen.length,
			});
		}
		picked.push(
			...chosen.map((row) => ({
				...row,
				selectedStratum: stratum,
				fallbackSource: "",
			})),
		);
	}
	if (picked.length < CONFIG.total) {
		const pool = shuffle(
			rows.filter((row) => !selected.has(row.pid)),
			random,
		);
		for (const row of pool) {
			if (picked.length >= CONFIG.total) break;
			if ((teamCounts.get(row.tid) ?? 0) >= CONFIG.maxPerTeam) continue;
			selected.add(row.pid);
			teamCounts.set(row.tid, (teamCounts.get(row.tid) ?? 0) + 1);
			picked.push({
				...row,
				selectedStratum: row.hiddenStratum,
				fallbackSource: "adjacent/general fallback",
			});
		}
	}
	return { picked: shuffle(picked, random).slice(0, CONFIG.total), shortfalls };
};

const awardsSummary = (row) => {
	const awards = row.player?.awards ?? [];
	if (!awards.length) return "None";
	return awards
		.slice()
		.sort((a, b) => b.season - a.season)
		.map((award) => `${award.season}: ${award.type}`)
		.join("; ");
};
const awardsByYearHtml = (row) => {
	const awards = row.player?.awards ?? [];
	if (!awards.length) return `<p class="empty">No awards</p>`;
	return awards
		.slice()
		.sort((a, b) => b.season - a.season)
		.map(
			(award) =>
				`<div class="award-line"><span>${htmlEscape(award.season)}</span><b>${htmlEscape(award.type)}</b></div>`,
		)
		.join("");
};

const selectionReason = (row) =>
	`${STRATA[row.selectedStratum]?.label ?? row.selectedStratum}: seed ${CONFIG.seed} stratified sample; current ${row.currentTier}, V3 ${row.v3Tier}, age ${row.age}, ${fmt(row.MPG)} MPG, ${fmt(row.valueNoPot)} valueNoPot.`;

const caseRows = (sample) =>
	sample.map((row, index) => ({
		...row,
		caseId: `BV30-${String(index + 1).padStart(2, "0")}`,
		noteKey: `blind_validation30-${row.pid}`,
		selectionReason: selectionReason(row),
	}));

const candidateCsvRows = (sample) =>
	sample.map((row) => ({
		caseId: row.caseId,
		pid: row.pid,
		name: row.name,
		hiddenStratum: row.selectedStratum,
		hiddenStratumLabel: STRATA[row.selectedStratum]?.label ?? "",
		fallbackSource: row.fallbackSource,
		team: row.teamAbbrev,
		tid: row.tid,
		age: row.age,
		pos: row.pos,
		height: row.ratings.hgt,
		ovr: row.ovr,
		pot: row.pot,
		value: round(row.value, 3),
		valueNoPot: round(row.valueNoPot, 3),
		contractValue: round(row.getContractValue, 3),
		currentTier: row.currentTier,
		currentRangeText: row.currentRangeText,
		currentPointM: row.currentPointM,
		v3Tier: row.v3Tier,
		v3RangeText: row.v3RangeText,
		v3PointM: row.v3PointM,
		responsibleModule: row.responsibleModule,
		GP: row.GP,
		GS: row.GS,
		MPG: round(row.MPG, 3),
		starterShare: round(row.starterShare, 3),
		PTS: round(row.PTS, 3),
		TRB: round(row.TRB, 3),
		AST: round(row.AST, 3),
		PER: round(row.PER, 3),
		EWA: round(row.EWA, 3),
		VORP: round(row.VORP, 3),
		BPM: round(row.BPM, 3),
		USG: round(row.USG, 3),
		estimatedDemandNoRandom: row.estimatedDemandNoRandom,
		minContractForPlayer: row.minContractForPlayer,
		eligibleMax: row.eligibleMax,
		awardsSummary: awardsSummary(row),
		selectionReason: row.selectionReason,
	}));

const writeCandidateCsv = (sample) => {
	const rows = candidateCsvRows(sample);
	writeCsv(out.candidates, rows, [
		"caseId",
		"pid",
		"name",
		"hiddenStratum",
		"hiddenStratumLabel",
		"fallbackSource",
		"team",
		"tid",
		"age",
		"pos",
		"height",
		"ovr",
		"pot",
		"value",
		"valueNoPot",
		"contractValue",
		"currentTier",
		"currentRangeText",
		"currentPointM",
		"v3Tier",
		"v3RangeText",
		"v3PointM",
		"responsibleModule",
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
		"awardsSummary",
		"selectionReason",
	]);
};

const writeNotesTemplate = (sample) => {
	const notes = Object.fromEntries(
		sample.map((row) => [
			row.noteKey,
			{
				caseId: row.caseId,
				pid: row.pid,
				human_min_m: "",
				human_max_m: "",
				confidence: "",
				role_note: "",
				uncertainty_note: "",
				flags: {
					human_range_wide: false,
					special_archetype: false,
					stats_unreliable: false,
					team_context_uncertain: false,
					likely_overpay_possible: false,
					likely_discount_possible: false,
				},
			},
		]),
	);
	fs.writeFileSync(out.notesTemplate, `${JSON.stringify(notes, null, "\t")}\n`);
};

const ratingClass = (value) =>
	value >= 65 ? "good" : value >= 55 ? "mid" : "low";
const ratingStyle = (value) => {
	if (!Number.isFinite(Number(value))) return "";
	if (value >= 60)
		return ` style="background-color:rgba(var(--gradient-base-success), ${Math.min(0.75, (value - 55) / 34).toFixed(2)})"`;
	if (value <= 45)
		return ` style="background-color:rgba(var(--gradient-base-danger), ${Math.min(0.75, (45 - value) / 28).toFixed(2)})"`;
	return "";
};
const renderRatingGroup = (title, items, ratings) => `
	<div class="ratings-group">
		<h4>${htmlEscape(title)}</h4>
		<table>${items
			.map(([label, key]) => {
				const value = ratings?.[key];
				return `<tr><td>${htmlEscape(label)}</td><td class="${ratingClass(value)}"${ratingStyle(value)}>${htmlEscape(value ?? "--")}</td></tr>`;
			})
			.join("")}</table>
	</div>`;
const renderRatings = (ratings) => `
	<div class="ratings-wrap">
		${[
			[
				"Physical",
				[
					["Height", "hgt"],
					["Strength", "stre"],
					["Speed", "spd"],
					["Jumping", "jmp"],
					["Endurance", "endu"],
				],
			],
			[
				"Shooting",
				[
					["Inside", "ins"],
					["Dunks/Layups", "dnk"],
					["Free Throws", "ft"],
					["Mid Range", "fg"],
					["Three Pointers", "tp"],
				],
			],
			[
				"Skill",
				[
					["Offensive IQ", "oiq"],
					["Defensive IQ", "diq"],
					["Dribbling", "drb"],
					["Passing", "pss"],
					["Rebounding", "reb"],
				],
			],
		]
			.map(([title, items]) => renderRatingGroup(title, items, ratings))
			.join("")}
	</div>`;
const stat = (label, value) =>
	`<div class="stat"><span>${htmlEscape(label)}</span><b>${htmlEscape(value)}</b></div>`;
const renderStats = (row) => `
	<div class="subhead">Basic</div>
	<div class="stat-grid">
		${[
			["Season", row.latestRegularSeason],
			["GP", row.GP],
			["GS", row.GS],
			["MPG", fmt(row.MPG)],
			["PTS", fmt(row.PTS)],
			["TRB", fmt(row.TRB)],
			["AST", fmt(row.AST)],
			["STL", fmt(row.STL)],
			["BLK", fmt(row.BLK)],
			["TOV", fmt(row.TOV)],
		]
			.map(([label, value]) => stat(label, value))
			.join("")}
	</div>
	<div class="subhead">Advanced / Impact</div>
	<div class="stat-grid">
		${[
			["TS%", fmtPct(row.TS)],
			["eFG%", fmtPct(row.eFG)],
			["PER", fmt(row.PER)],
			["EWA", fmt(row.EWA)],
			["VORP", fmt(row.VORP)],
			["BPM", fmt(row.BPM)],
			["OBPM", fmt(row.OBPM)],
			["DBPM", fmt(row.DBPM)],
			["On-Off", fmt(row["On-Off"])],
			["USG", fmt(row.USG)],
			["AST%", fmt(row["AST%"])],
			["TRB%", fmt(row["TRB%"])],
			["BLK%", fmt(row["BLK%"])],
		]
			.map(([label, value]) => stat(label, value))
			.join("")}
	</div>`;

const renderCard = (row, { debug }) => `
	<article class="card" id="${htmlEscape(row.caseId)}" data-case-id="${htmlEscape(row.caseId)}" data-note-key="${htmlEscape(row.noteKey)}">
		<div class="title-row">
			<div>
				<h3>Case ${htmlEscape(row.caseId)}</h3>
				<div class="muted">${htmlEscape(row.name)} · age ${htmlEscape(row.age)} · ${htmlEscape(row.pos)} · ${htmlEscape(row.teamAbbrev || row.teamName)}</div>
			</div>
			<div class="verdict">Blind Validation</div>
		</div>
		<div class="pill-grid">
			<div class="pill primary"><span>Current Contract</span><b>${money(row.normalNoOptionContractAmount)} / ${htmlEscape(row.normalNoOptionContractYears ?? "--")}y</b></div>
			<div class="pill"><span>OVR/POT</span><b>${htmlEscape(row.ovr)}/${htmlEscape(row.pot)}</b></div>
			<div class="pill"><span>Age / Pos / Height</span><b>${htmlEscape(row.age)} / ${htmlEscape(row.pos)} / ${htmlEscape(row.ratings.hgt ?? "--")}</b></div>
			<div class="pill"><span>Team</span><b>${htmlEscape(row.teamAbbrev || row.teamName)}</b></div>
			<div class="pill"><span>Value / NoPot</span><b>${fmt(row.value)} / ${fmt(row.valueNoPot)}</b></div>
			<div class="pill"><span>Contract Value</span><b>${fmt(row.getContractValue)}</b></div>
			<div class="pill"><span>PTS/TRB/AST</span><b>${fmt(row.PTS)} / ${fmt(row.TRB)} / ${fmt(row.AST)}</b></div>
			<div class="pill"><span>MPG / PER</span><b>${fmt(row.MPG)} / ${fmt(row.PER)}</b></div>
			<div class="pill"><span>TS% / BPM / EWA</span><b>${fmtPct(row.TS)} / ${fmt(row.BPM)} / ${fmt(row.EWA)}</b></div>
			<div class="pill"><span>Min / Eligible Max</span><b>${money(row.minContractForPlayer)} / ${money(row.eligibleMax)}</b></div>
		</div>
		<div class="content-grid">
			<div class="panel"><h4>Ratings</h4>${renderRatings(row.ratings)}</div>
			<div class="panel"><h4>Stats</h4>${renderStats(row)}</div>
		</div>
		<details class="extra awards-panel" open><summary>Awards</summary><div class="award-list">${awardsByYearHtml(row)}</div></details>
		<section class="review">
			<div class="review-grid">
				<label class="review-field"><span>human_min_m</span><input type="number" step="0.01" data-field="human_min_m" data-note-key="${htmlEscape(row.noteKey)}" placeholder="e.g. 10" /></label>
				<label class="review-field"><span>human_max_m</span><input type="number" step="0.01" data-field="human_max_m" data-note-key="${htmlEscape(row.noteKey)}" placeholder="e.g. 14" /></label>
				<label class="review-field"><span>confidence</span><select data-field="confidence" data-note-key="${htmlEscape(row.noteKey)}"><option value=""></option><option>low</option><option>medium</option><option>high</option></select></label>
			</div>
			<label class="note-label">role_note</label>
			<textarea data-field="role_note" data-note-key="${htmlEscape(row.noteKey)}" placeholder="Role / market read"></textarea>
			<label class="note-label">uncertainty_note</label>
			<textarea data-field="uncertainty_note" data-note-key="${htmlEscape(row.noteKey)}" placeholder="Why the range is wide or uncertain"></textarea>
			<div class="flag-grid">
				${[
					"human_range_wide",
					"special_archetype",
					"stats_unreliable",
					"team_context_uncertain",
					"likely_overpay_possible",
					"likely_discount_possible",
				]
					.map(
						(flag) =>
							`<label><input type="checkbox" data-flag="${flag}" data-note-key="${htmlEscape(row.noteKey)}" /> ${flag}</label>`,
					)
					.join("")}
			</div>
		</section>
		${
			debug
				? `<details class="extra debug-panel"><summary>Debug / Model Internals</summary>
					<div class="debug-grid">
						<div><span>Hidden stratum</span><b>${htmlEscape(row.selectedStratum)}</b></div>
						<div><span>Current tier/range</span><b>${htmlEscape(row.currentTier)} · ${htmlEscape(row.currentRangeText)}</b></div>
						<div><span>Current point</span><b>${fmtM(row.currentPointM)}</b></div>
						<div><span>V3 tier/range</span><b>${htmlEscape(row.v3Tier)} · ${htmlEscape(row.v3RangeText)}</b></div>
						<div><span>V3 point</span><b>${fmtM(row.v3PointM)}</b></div>
						<div><span>Module</span><b>${htmlEscape(row.responsibleModule)}</b></div>
					</div>
					<p>${htmlEscape(row.selectionReason)}</p>
					<p class="skills">${htmlEscape(row.v3Signals)}</p>
				</details>`
				: ""
		}
	</article>`;

const renderHtml = (sample, { debug }) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BBGM V3-AB Blind Validation 30 ${debug ? "Debug" : "Blind"}</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#172033;--muted:#667085;--line:#e5e7eb;--soft:#f8fafc;--blue:#eef4ff;--green:#ecfdf3;--red:#fef3f2;--gradient-base-danger:239,162,169;--gradient-base-success:117,183,152}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif}
header{background:#111827;color:white;padding:22px 28px} header h1{margin:0 0 8px;font-size:24px} header p{margin:4px 0;color:#d1d5db}
main{max-width:1320px;margin:0 auto;padding:20px}.toolbar{position:sticky;top:0;z-index:3;background:rgba(246,247,249,.96);backdrop-filter:blur(8px);padding:10px 0;border-bottom:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
button{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer}.notice{background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:13px 15px;margin:14px 0;line-height:1.55}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:16px 0;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.title-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}h3{margin:0;font-size:23px}.muted{color:var(--muted);font-size:13px}.verdict{font-weight:800;border-radius:999px;padding:7px 12px;background:var(--blue);border:1px solid #b2ccff;white-space:nowrap}
.pill-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px;margin:10px 0 14px}.pill{background:#fff;border:1px solid var(--line);border-radius:11px;padding:9px 10px;min-height:58px}.pill.primary{background:#ecfdf3;border-color:#86efac}.pill span,.debug-grid span{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}.pill b{font-size:15px}
.content-grid{display:grid;grid-template-columns:minmax(280px,430px) minmax(360px,1fr);gap:16px;align-items:start}@media(max-width:920px){.content-grid{grid-template-columns:1fr}}.panel h4{margin:0 0 10px;font-size:17px}
.ratings-wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;width:100%}.ratings-group{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}.ratings-group h4{margin:0;padding:8px 10px;background:#f2f4f7;border-bottom:1px solid var(--line);font-size:14px}.ratings-group table{width:100%;border-collapse:collapse;table-layout:fixed}.ratings-group td{padding:7px 10px;border-bottom:1px solid #eef2f7;font-size:13px}.ratings-group td:first-child{width:72%}.ratings-group td:last-child{text-align:right;font-weight:800;font-size:15px}.good{color:#067647}.mid{color:#175cd3}.low{color:#b42318}
.subhead{font-weight:800;color:#475467;font-size:13px;margin:2px 0 8px}.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:7px;margin-bottom:12px}.stat{border:1px solid var(--line);border-radius:10px;padding:7px 9px;background:#fff;min-height:50px}.stat span{display:block;color:var(--muted);font-size:11px;margin-bottom:3px}.stat b{font-size:14px}
.extra{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}.extra summary{cursor:pointer;font-weight:800;color:#344054}.award-list{display:grid;gap:8px}.award-line{display:grid;grid-template-columns:74px 1fr;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:#fbfcfd}.award-line span{font-weight:800;color:#344054}.empty{margin:0;color:var(--muted)}
.review{margin-top:14px}.review-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.review-field span,.note-label{display:block;margin:12px 0 6px;font-weight:800;color:#344054}textarea,input,select{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;background:#fff}textarea{min-height:84px;resize:vertical}.flag-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:12px}.flag-grid label{border:1px solid var(--line);border-radius:10px;background:#fff;padding:8px 10px}.flag-grid input{width:auto;margin-right:6px}.debug-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin-top:9px}.debug-grid div{border:1px solid var(--line);border-radius:10px;background:#fff;padding:8px 10px}.skills{color:var(--muted)}
</style>
</head>
<body>
<header>
	<h1>BBGM V3-AB Blind Validation 30 ${debug ? "Debug" : "Blind"}</h1>
	<p>Season 2025, salary cap ${money(sample[0]?.attrsSalaryCap ?? 154650)}. Fixed seed ${CONFIG.seed}.</p>
	<p>${debug ? "Debug page exposes sampling groups and model internals. Do not use this for blind labeling." : "Blind test set. Label before opening debug/eval outputs. No model outputs are shown."}</p>
</header>
<main>
	<div class="toolbar">
		<button type="button" id="export-json">Export JSON</button>
		<button type="button" id="export-csv">Export CSV</button>
		<button type="button" id="import-json">Import JSON</button>
		<button type="button" id="clear-notes">Clear local notes</button>
		<input type="file" id="import-file" accept="application/json,.json" hidden />
		<span id="save-status">Notes autosave locally.</span>
	</div>
	<div class="notice"><b>Workflow:</b> fill a wide-but-honest human contract range first. Do not tune rules while labeling. Export JSON/CSV when done.</div>
	${sample.map((row) => renderCard(row, { debug })).join("\n")}
</main>
<script>
const STORAGE_KEY = ${JSON.stringify(CONFIG.localStorageKey + (debug ? "-debug" : "-blind"))};
const CASES = ${JSON.stringify(sample.map((row) => ({ caseId: row.caseId, noteKey: row.noteKey, pid: row.pid })))};
const fields = Array.from(document.querySelectorAll("[data-field]"));
const flags = Array.from(document.querySelectorAll("[data-flag]"));
const statusEl = document.getElementById("save-status");
const blankNote = (item) => ({caseId:item.caseId,pid:item.pid,human_min_m:"",human_max_m:"",confidence:"",role_note:"",uncertainty_note:"",flags:{human_range_wide:false,special_archetype:false,stats_unreliable:false,team_context_uncertain:false,likely_overpay_possible:false,likely_discount_possible:false}});
let notes = Object.fromEntries(CASES.map((item) => [item.noteKey, blankNote(item)]));
try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) notes = {...notes, ...JSON.parse(raw)}; } catch {}
const save = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); if(statusEl) statusEl.textContent = "Saved " + new Date().toLocaleTimeString(); };
const render = () => {
	for (const el of fields) { const note = notes[el.dataset.noteKey] || {}; el.value = note[el.dataset.field] ?? ""; }
	for (const el of flags) { const note = notes[el.dataset.noteKey] || {}; el.checked = Boolean(note.flags?.[el.dataset.flag]); }
};
for (const el of fields) el.addEventListener("input", () => { const key=el.dataset.noteKey; notes[key] ||= blankNote(CASES.find(c=>c.noteKey===key)); notes[key][el.dataset.field]=el.value; save(); });
for (const el of flags) el.addEventListener("change", () => { const key=el.dataset.noteKey; notes[key] ||= blankNote(CASES.find(c=>c.noteKey===key)); notes[key].flags ||= {}; notes[key].flags[el.dataset.flag]=el.checked; save(); });
const download = (name, text, type) => { const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); };
document.getElementById("export-json").addEventListener("click",()=>download("blind_validation30_human_notes.json", JSON.stringify(notes,null,2), "application/json"));
document.getElementById("export-csv").addEventListener("click",()=>{ const header=["noteKey","caseId","pid","human_min_m","human_max_m","confidence","role_note","uncertainty_note","flags"]; const lines=[header.join(",")]; for (const [key,n] of Object.entries(notes)){ const vals=[key,n.caseId,n.pid,n.human_min_m,n.human_max_m,n.confidence,n.role_note,n.uncertainty_note,Object.entries(n.flags||{}).filter(([,v])=>v).map(([k])=>k).join(";")]; lines.push(vals.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")); } download("blind_validation30_human_notes.csv", lines.join("\\n"), "text/csv");});
document.getElementById("import-json").addEventListener("click",()=>document.getElementById("import-file").click());
document.getElementById("import-file").addEventListener("change", async (event)=>{ const file=event.target.files?.[0]; if(!file) return; notes={...notes,...JSON.parse(await file.text())}; save(); render(); });
document.getElementById("clear-notes").addEventListener("click",()=>{ if(confirm("Clear local notes for this page?")){ localStorage.removeItem(STORAGE_KEY); notes=Object.fromEntries(CASES.map((item)=>[item.noteKey, blankNote(item)])); render(); }});
render();
</script>
</body>
</html>`;

const renderBlindHtml = (sample) =>
	fs.writeFileSync(out.blindHtml, renderHtml(sample, { debug: false }));
const renderDebugHtml = (sample) =>
	fs.writeFileSync(out.debugHtml, renderHtml(sample, { debug: true }));

const writeSelectionReport = ({
	sample,
	candidateRows,
	shortfalls,
	exclusions,
}) => {
	const countBy = (keyFn) =>
		groupRows(sample, keyFn)
			.map(([key, rows]) => ({ key, count: rows.length }))
			.sort((a, b) => String(a.key).localeCompare(String(b.key)));
	const stratumRows = countBy((row) => row.selectedStratum);
	const teamRows = countBy((row) => row.teamAbbrev || row.teamName);
	const ageRows = countBy((row) => ageGroup(row.age));
	const posRows = countBy(positionGroup);
	const heightRows = countBy((row) => {
		const h = Number(row.ratings.hgt);
		if (h >= 65) return "height>=65";
		if (h >= 55) return "height55-64";
		if (h >= 45) return "height45-54";
		return "height<45";
	});
	const table = (rows, keyLabel = "bucket") =>
		`| ${keyLabel} | count |\n| --- | ---: |\n${rows.map((row) => `| ${row.key} | ${row.count} |`).join("\n")}`;
	const md = `# V3-AB Blind Validation 30 Selection Report

This is a blind validation/test set, not a calibration set. Do not tune rules while labeling.

## Summary

- Total selected: ${sample.length}
- Random seed: ${CONFIG.seed}
- Excluded prior labeled/development players by pid/name from boundary40, validation20, and existing comparable eval artifacts.
- Excluded pids count: ${exclusions.pids.size}
- Excluded names count: ${exclusions.names.size}
- Candidate pool after exclusion: ${candidateRows.length}
- Diversity guard: max ${CONFIG.maxPerTeam} players per team where possible; position groups monitored during greedy selection.
- This is not pure random because pure random over all active players over-samples minimum/fringe players. It is stratified to cover high-end, starter, rotation, and low-salary cases.
- User should label blind first because debug/model fields can anchor the human estimate.

## Hidden Stratum Counts

${table(stratumRows, "hidden stratum")}

## Requested Quotas

| hidden stratum | quota | purpose |
| --- | ---: | --- |
${Object.entries(CONFIG.quotas)
	.map(([key, quota]) => `| ${key} | ${quota} | ${STRATA[key].goal} |`)
	.join("\n")}

## Shortfalls / Fallbacks

${
	shortfalls.length
		? table(
				shortfalls.map((row) => ({ key: row.stratum, count: row.missing })),
				"stratum missing",
			)
		: "No quota shortfalls."
}

## Per-Team Counts

${table(teamRows, "team")}

## Age Distribution

${table(ageRows, "age group")}

## Position Distribution

${table(posRows, "position group")}

## Height Distribution

${table(heightRows, "height group")}

## Selected Cases

| case | name | team | age | pos | hidden stratum |
| --- | --- | --- | ---: | --- | --- |
${sample.map((row) => `| ${row.caseId} | ${row.name} | ${row.teamAbbrev} | ${row.age} | ${row.pos} | ${row.selectedStratum} |`).join("\n")}
`;
	fs.writeFileSync(out.report, md);
};

const writeReadme = () => {
	fs.writeFileSync(
		out.readme,
		`# V3-AB Blind Validation 30

Workflow:

1. Open \`blind_validation30_review_blind.html\`.
2. Fill human min/max annual salary range, confidence, role note, uncertainty note, and optional flags.
3. Export notes JSON/CSV from the blind page.
4. Only after labeling is done, use \`blind_validation30_review_debug.html\` or a future eval script to compare current vs V3.
5. Do not tune rules while labeling.

This is a test set, not a calibration set. Human ranges can be wide when the market is uncertain.
`,
	);
};

const main = () => {
	fs.mkdirSync(outDir, { recursive: true });
	const exclusions = readExclusions();
	const { attrs, rows } = loadRows();
	const scoredRows = computeCurrentAndV3(rows, attrs).map((row) => ({
		...row,
		hiddenStratum: assignHiddenStratum(row),
		attrsSalaryCap: attrs.salaryCap,
	}));
	const candidateRows = scoredRows.filter(
		(row) => !exclusions.pids.has(row.pid) && !exclusions.names.has(row.name),
	);
	const { picked, shortfalls } = stratifiedSample(candidateRows);
	const sample = caseRows(picked);
	writeCandidateCsv(sample);
	writeNotesTemplate(sample);
	renderBlindHtml(sample);
	renderDebugHtml(sample);
	writeSelectionReport({ sample, candidateRows, shortfalls, exclusions });
	writeReadme();
	console.log(`Wrote ${out.script}`);
	console.log(`Wrote ${out.candidates}`);
	console.log(`Wrote ${out.notesTemplate}`);
	console.log(`Wrote ${out.blindHtml}`);
	console.log(`Wrote ${out.debugHtml}`);
	console.log(`Wrote ${out.report}`);
	console.log(`Wrote ${out.readme}`);
	console.log(
		JSON.stringify(
			{
				seed: CONFIG.seed,
				total: sample.length,
				hiddenStrata: Object.fromEntries(
					groupRows(sample, (row) => row.selectedStratum).map(([key, rows]) => [
						key,
						rows.length,
					]),
				),
				excludedPids: exclusions.pids.size,
				excludedNames: exclusions.names.size,
			},
			null,
			2,
		),
	);
};

main();
