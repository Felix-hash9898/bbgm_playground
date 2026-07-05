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
	readJsonIfExists,
	readSave,
	round,
	targetsByPid,
	writeCsv,
} from "./contract-market-proxy-core.mjs";
import { scoreTier, tierRange } from "./contract-market-tier-score.mjs";

const root = process.cwd();
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);
const anchorTargetsPath = path.join(
	root,
	"contract_market_artifacts/contract_market_anchor_targets.json",
);
const validation20CandidatesPath = path.join(
	root,
	"contract_market_artifacts/contract_market_validation20_candidates.csv",
);
const artifactsDir = path.join(root, "contract_market_artifacts");
const candidatesCsvPath = path.join(
	artifactsDir,
	"contract_market_boundary40_candidates.csv",
);
const notesTemplatePath = path.join(
	artifactsDir,
	"contract_market_boundary40_notes_template.json",
);
const reviewBlindHtmlPath = path.join(
	artifactsDir,
	"contract_market_boundary40_review_blind.html",
);
const reviewDebugHtmlPath = path.join(
	artifactsDir,
	"contract_market_boundary40_review_debug.html",
);
const selectionReportPath = path.join(
	artifactsDir,
	"contract_market_boundary40_selection_report.md",
);

const bucketDefinitions = [
	{
		key: "minimum_fringe_negative",
		label: "A. MINIMUM / FRINGE NEGATIVE",
		goal: "Low-minute, negative-impact players to validate player-specific minimum and true minimum-level contracts.",
	},
	{
		key: "minimum_plus_functional_vet",
		label: "B. MINIMUM_PLUS / FUNCTIONAL VET",
		goal: "Older functional players with one useful skill but limited role, to separate minimum-plus from multi-year money.",
	},
	{
		key: "low_rotation",
		label: "C. LOW_ROTATION",
		goal: "Real rotation-edge players around 10-18 MPG whose role/sample size makes low-end AAV uncertain.",
	},
	{
		key: "good_rotation_specialist",
		label: "D. GOOD_ROTATION / SPECIALIST",
		goal: "Specialists and functional reserves near the 5.5%-8% and 8%-10% cap boundaries without defaulting to composite ratings.",
	},
	{
		key: "high_end_rotation_sixth_man",
		label: "E. HIGH_END_ROTATION / SIXTH MAN",
		goal: "Non-starters or unstable starters with real impact, covering the 10-15M and 15-20M challenge area.",
	},
	{
		key: "low_end_starter",
		label: "F. LOW_END_STARTER",
		goal: "High-minute or high-starter-share players with ordinary efficiency or impact, to validate the 10%-14% cap band.",
	},
	{
		key: "solid_starter",
		label: "G. SOLID_STARTER",
		goal: "Stable starters with some positive impact, covering the 14%-18% cap zone and the lower part of the current model gap.",
	},
	{
		key: "good_high_starter",
		label: "H. GOOD_STARTER / HIGH_STARTER",
		goal: "Clearly above ordinary starters but not near-max locks, emphasizing the 18%-22.5% and 22.5%-30% cap boundaries.",
	},
	{
		key: "star_near_max",
		label: "I. STAR_NEAR_MAX",
		goal: "Near-max candidates with strong impact but room for human judgment, including the $34.8M-$40.8M current-model gap.",
	},
	{
		key: "superstar_max_lock",
		label: "J. UPPER STAR / MAX BORDERLINE",
		goal: "Upper near-max candidates and max-borderline stars. These are not exact max locks; exact max calibration is covered by anchor15 and validation20.",
	},
];

const htmlEscape = (value) =>
	String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

const num = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : NaN;
};

const displayNumber = (value, digits = 1) => {
	const parsed = num(value);
	return Number.isFinite(parsed) ? round(parsed, digits) : "";
};

const broadPos = (pos) => {
	if (String(pos).includes("C")) return "big";
	if (String(pos).includes("G")) return "guard";
	return "wing";
};

const hasPosition = (row, token) => String(row.pos ?? "").includes(token);
const isGuard = (row) => hasPosition(row, "G");
const isBig = (row) => hasPosition(row, "C") || hasPosition(row, "F");

const toneForRating = (value) => {
	const parsed = num(value);
	if (!Number.isFinite(parsed)) return "low";
	if (parsed >= 75) return "good";
	if (parsed >= 55) return "mid";
	return "low";
};

const ratingGradientStyle = (value) => {
	const parsed = num(value);
	if (!Number.isFinite(parsed)) return "";

	let backgroundColor = "";
	if (parsed < 25) {
		backgroundColor = "rgb(var(--gradient-base-danger))";
	} else if (parsed < 45) {
		const fraction = (45 - parsed) / (45 - 25);
		backgroundColor = `rgba(var(--gradient-base-danger), ${round(fraction, 3)})`;
	} else if (parsed > 55) {
		const fraction = (parsed - 55) / (75 - 55);
		backgroundColor = `rgba(var(--gradient-base-success), ${round(Math.min(fraction, 1), 3)})`;
	} else if (parsed > 75) {
		backgroundColor = "rgb(var(--gradient-base-success))";
	}

	return backgroundColor ? ` style="background-color:${backgroundColor}"` : "";
};

const teamLabelByTid = (teamsByTid, tid) => {
	if (!Number.isFinite(tid) || tid < 0) {
		return "Free Agent";
	}
	const team = teamsByTid.get(tid);
	return team?.abbrev ?? team?.name ?? `T${tid}`;
};

const groupedAwards = (awards) => {
	const bySeason = new Map();
	for (const award of awards ?? []) {
		if (!bySeason.has(award.season)) {
			bySeason.set(award.season, []);
		}
		const types = bySeason.get(award.season);
		if (!types.includes(award.type)) {
			types.push(award.type);
		}
	}
	return Array.from(bySeason.entries())
		.sort((a, b) => b[0] - a[0])
		.map(([season, types]) => ({ season, types }));
};

const awardsSummary = (awardGroups) =>
	awardGroups.length === 0
		? "None"
		: awardGroups
				.map(({ season, types }) => `${season}: ${types.join(", ")}`)
				.join("; ");

const hasMajorRecentAward = (row) =>
	row.awardGroups.some(
		({ season, types }) =>
			season >= row.latestRegularSeason - 2 &&
			types.some((type) =>
				/(MVP|All-Star|All-League|Defensive Player|All-Defensive|Scoring Leader|Rebounds Leader|Assists Leader|Blocks Leader)/i.test(
					type,
				),
			),
	);

const challengeTagsForRow = (row, attrs) => {
	const tags = [];
	if (row.age <= 24 && row.potentialPremium >= 4 && row.valueNoPot < 60) {
		tags.push("young_high_pot_low_current");
	}
	if (row.age >= 31 && row.valueNoPot >= 53) {
		tags.push("old_good_current_short_term");
	}
	if (
		(row.starterShare >= 0.65 || row.MPG >= 28) &&
		(row.EWA < 3 || row.BPM < 0)
	) {
		tags.push("low_ewa_but_starter");
	}
	if (row.EWA >= 2 && row.MPG < 20) {
		tags.push("high_ewa_low_minutes");
	}
	if (row.USG >= 24 && (row.TS < 0.54 || row.TOV >= 3)) {
		tags.push("high_usage_bad_efficiency");
	}
	if (
		row.MPG < 20 &&
		(row.skill_3_margin >= 0.05 ||
			row.skill_Ps_margin >= 0.05 ||
			row.skill_R_margin >= 0.05 ||
			row.skill_Di_margin >= 0.05 ||
			row.skill_Dp_margin >= 0.05)
	) {
		tags.push("specialist_high_skill_low_minutes");
	}
	if (isGuard(row) && row.age >= 31) {
		tags.push("guard_age_31_plus_length_risk");
	}
	if (
		isBig(row) &&
		row.PTS < 10 &&
		(row.TRB >= 5 ||
			row.BLK >= 0.8 ||
			row.comp_rebounding >= 0.64 ||
			row.comp_defenseInterior >= 0.62)
	) {
		tags.push("defense_rebound_big_low_scoring");
	}
	if (
		row.estimatedDemandNoRandom >= 0.21 * attrs.salaryCap &&
		!hasMajorRecentAward(row)
	) {
		tags.push("near_max_without_award");
	}
	if (row.age >= 32 && row.awardGroups.length > 0 && row.EWA < 5) {
		tags.push("award_old_decline");
	}
	if (
		row.minContractForPlayer >= 3300 &&
		(row.debugModelTier === "MINIMUM_LEVEL" ||
			row.estimatedDemandNoRandom <= 0.06 * attrs.salaryCap ||
			row.estimatedDemandNoRandom <= row.minContractForPlayer * 1.6)
	) {
		tags.push("player_minimum_sensitive");
	}
	return tags;
};

const bucketCriteria = {
	minimum_fringe_negative: (row) =>
		row.MPG <= 10 &&
		(row.EWA <= 0 || row.BPM <= -3 || row.PER < 9) &&
		row.estimatedDemandNoRandom <= 1.7 * row.minContractForPlayer,
	minimum_plus_functional_vet: (row) =>
		row.age >= 30 &&
		row.MPG >= 8 &&
		row.MPG <= 20 &&
		row.valueNoPot >= 48 &&
		row.estimatedDemandNoRandom >= row.minContractForPlayer &&
		row.estimatedDemandNoRandom <= 0.08 * row.salaryCap &&
		(row.PER >= 10 || row.EWA >= 0 || row.skill_3_margin > 0.04),
	low_rotation: (row) =>
		row.MPG >= 10 &&
		row.MPG <= 18 &&
		row.GP >= 30 &&
		row.EWA >= 0 &&
		row.estimatedDemandNoRandom >= 0.035 * row.salaryCap &&
		row.estimatedDemandNoRandom <= 0.09 * row.salaryCap,
	good_rotation_specialist: (row) =>
		row.MPG >= 14 &&
		row.MPG <= 26 &&
		row.estimatedDemandNoRandom >= 0.055 * row.salaryCap &&
		row.estimatedDemandNoRandom <= 0.12 * row.salaryCap &&
		(row.skill_3_margin > 0.03 ||
			row.skill_Ps_margin > 0.03 ||
			row.skill_R_margin > 0.03 ||
			row.skill_Di_margin > 0.03 ||
			row.skill_Dp_margin > 0.03 ||
			row["AST%"] >= 18),
	high_end_rotation_sixth_man: (row) =>
		row.MPG >= 20 &&
		row.MPG <= 30 &&
		row.starterShare < 0.65 &&
		row.EWA >= 2 &&
		row.estimatedDemandNoRandom >= 0.08 * row.salaryCap &&
		row.estimatedDemandNoRandom <= 0.155 * row.salaryCap,
	low_end_starter: (row) =>
		(row.starterShare >= 0.65 || row.MPG >= 28) &&
		(row.PER < 17 || row.BPM < 1.5 || row.TS < 0.54) &&
		row.estimatedDemandNoRandom >= 0.08 * row.salaryCap &&
		row.estimatedDemandNoRandom <= 0.17 * row.salaryCap,
	solid_starter: (row) =>
		(row.starterShare >= 0.65 || row.MPG >= 28) &&
		row.EWA >= 3 &&
		row.EWA <= 9 &&
		row.estimatedDemandNoRandom >= 0.12 * row.salaryCap &&
		row.estimatedDemandNoRandom <= 0.2 * row.salaryCap,
	good_high_starter: (row) =>
		(row.starterShare >= 0.65 || row.MPG >= 28) &&
		row.EWA >= 5 &&
		row.BPM >= 1 &&
		row.estimatedDemandNoRandom >= 0.16 * row.salaryCap &&
		row.estimatedDemandNoRandom <= 0.26 * row.salaryCap,
	star_near_max: (row) =>
		row.EWA >= 8 &&
		row.BPM >= 3 &&
		row.estimatedDemandNoRandom >= 0.21 * row.salaryCap &&
		row.estimatedDemandNoRandom <= 0.292 * row.salaryCap,
	superstar_max_lock: (row) =>
		row.EWA >= 10 &&
		row.BPM >= 6 &&
		row.estimatedDemandNoRandom >= 0.245 * row.salaryCap,
};

const bucketScore = {
	minimum_fringe_negative: (row) =>
		Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.025) * 8 +
		Math.max(0, row.MPG - 8) * 0.05 +
		Math.max(0, row.EWA) * 0.4,
	minimum_plus_functional_vet: (row) =>
		Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.045) * 8 +
		Math.abs(row.MPG - 14) * 0.03 -
		(row.challengeTags.includes("award_old_decline") ? 0.25 : 0),
	low_rotation: (row) =>
		Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.06) * 8 +
		Math.abs(row.MPG - 14) * 0.03 -
		(row.challengeTags.includes("young_high_pot_low_current") ? 0.18 : 0),
	good_rotation_specialist: (row) =>
		Math.min(
			Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.08),
			Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.1),
		) *
			8 -
		(row.challengeTags.includes("specialist_high_skill_low_minutes")
			? 0.18
			: 0),
	high_end_rotation_sixth_man: (row) =>
		Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.12) * 8 +
		row.starterShare * 0.3 -
		row.EWA * 0.015,
	low_end_starter: (row) =>
		Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.13) * 8 -
		(row.challengeTags.includes("low_ewa_but_starter") ? 0.2 : 0),
	solid_starter: (row) =>
		Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.16) * 8 -
		(row.inModelGap18To26 ? 0.25 : 0),
	good_high_starter: (row) =>
		Math.min(
			Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.2),
			Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.245),
		) *
			8 -
		(row.inModelGap18To26 ? 0.15 : 0),
	star_near_max: (row) =>
		Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.245) * 8 -
		(row.inModelGap34To41 ? 0.3 : 0) -
		(row.challengeTags.includes("near_max_without_award") ? 0.15 : 0),
	superstar_max_lock: (row) =>
		Math.abs(row.estimatedDemandNoRandom / row.salaryCap - 0.285) * 8 -
		(hasMajorRecentAward(row) ? 0.15 : 0),
};

const selectionRationale = (row, bucket) => {
	const amount = money(row.estimatedDemandNoRandom);
	const cap = pct(row.estimatedDemandNoRandom / row.salaryCap);
	const profile = `${displayNumber(row.MPG, 1)} MPG, ${displayNumber(
		row.EWA,
		1,
	)} EWA, ${displayNumber(row.BPM, 1)} BPM`;
	const tags = row.challengeTagList.length
		? ` Challenge tags: ${row.challengeTagList.join(", ")}.`
		: "";
	return `${bucket.label} boundary sample: demand ${amount} (${cap}) with ${profile}.${tags}`;
};

const debugSelectionRationale = (row, bucket) =>
	`${selectionRationale(row, bucket)} Model currently says ${row.debugModelTier} ${row.debugModelRangeText}.`;

const notesSeed = (rows) =>
	Object.fromEntries(
		rows.map((row) => [
			row.noteKey,
			{
				caseId: row.caseId,
				globalCaseId: row.globalCaseId,
				pid: row.pid,
				bucket: row.bucket,
				humanTargetTier: "",
				humanAmountRangeM: "",
				humanYears: "",
				humanNotes: "",
			},
		]),
	);

const renderMetric = (label, value, cls = "") =>
	`<div class="stat ${cls}"><span>${htmlEscape(label)}</span><b>${htmlEscape(
		value,
	)}</b></div>`;

const renderRatingsGroup = (title, items, ratings) =>
	`<div class="ratings-group">
		<h4>${htmlEscape(title)}</h4>
		<table>
			${items
				.map(([label, key]) => {
					const value = ratings?.[key];
					const display = Number.isFinite(Number(value))
						? Math.round(Number(value))
						: "--";
					return `<tr><td>${htmlEscape(label)}</td><td class="${toneForRating(
						value,
					)}"${ratingGradientStyle(value)}>${htmlEscape(display)}</td></tr>`;
				})
				.join("")}
		</table>
	</div>`;

const renderRatingsPanel = (ratings) => {
	const groups = [
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
	];

	return `<div class="ratings-wrap">
		${groups
			.map(([title, items]) => renderRatingsGroup(title, items, ratings))
			.join("")}
	</div>`;
};

const renderStatsPanel = (row, season) => `
	<div class="subhead">Basic</div>
	<div class="stat-grid">
		${[
			["Season", season],
			["GP", displayNumber(row.GP, 0)],
			["GS", displayNumber(row.GS, 0)],
			["MPG", displayNumber(row.MPG, 1)],
			["PTS", displayNumber(row.PTS, 1)],
			["TRB", displayNumber(row.TRB, 1)],
			["AST", displayNumber(row.AST, 1)],
			["STL", displayNumber(row.STL, 1)],
			["BLK", displayNumber(row.BLK, 1)],
			["TOV", displayNumber(row.TOV, 1)],
		]
			.map(([label, value]) => renderMetric(label, value))
			.join("")}
	</div>
	<div class="subhead">Advanced / Impact</div>
	<div class="stat-grid">
		${[
			["TS%", pct(num(row.TS))],
			["eFG%", pct(num(row.eFG))],
			["PER", displayNumber(row.PER, 1)],
			["EWA", displayNumber(row.EWA, 1)],
			["VORP", displayNumber(row.VORP, 1)],
			["BPM", displayNumber(row.BPM, 1)],
			["OBPM", displayNumber(row.OBPM, 1)],
			["DBPM", displayNumber(row.DBPM, 1)],
			["On-Off", displayNumber(row["On-Off"], 1)],
			["USG", displayNumber(row.USG, 1)],
			["AST%", displayNumber(row["AST%"], 1)],
			["TRB%", displayNumber(row["TRB%"], 1)],
			["BLK%", displayNumber(row["BLK%"], 1)],
		]
			.map(([label, value]) => renderMetric(label, value))
			.join("")}
	</div>`;

const renderAwardsPanel = (awards) => {
	if (!awards.length) {
		return '<p class="empty">No awards</p>';
	}

	return `<div class="award-list">
		${awards
			.map(
				({ season, types }) =>
					`<div class="award-line"><span>${season}</span><b>${htmlEscape(
						types.join(", "),
					)}</b></div>`,
			)
			.join("")}
	</div>`;
};

const renderDebugComposite = (row) => {
	const compositeRows = [
		["Usage", row.comp_usage],
		["Passing", row.comp_passing],
		["Dribbling", row.comp_dribbling],
		["3pt", row.comp_shootingThreePointer],
		["Rebounding", row.comp_rebounding],
		["Interior D", row.comp_defenseInterior],
		["Perimeter D", row.comp_defensePerimeter],
		["Blocking", row.comp_blocking],
		["Athleticism", row.comp_athleticism],
	];

	return `<div class="debug-grid">
		${compositeRows
			.map(
				([label, value]) =>
					`<div><span>${htmlEscape(label)}</span><b>${htmlEscape(
						displayNumber(value, 3),
					)}</b></div>`,
			)
			.join("")}
	</div>`;
};

const renderCard = (row, { debug, season }) => {
	const ratings = row.player?.ratings?.at(-1) ?? {};
	const identityLine = debug
		? `${htmlEscape(row.name)} <small>pid ${row.pid} · Case ${htmlEscape(
				row.caseId,
			)}</small>`
		: `Case ${htmlEscape(row.caseId)} <small>${htmlEscape(row.bucketLabel)}</small>`;

	return `<article class="card" id="${htmlEscape(row.caseId)}" data-case-id="${htmlEscape(
		row.caseId,
	)}" data-note-key="${htmlEscape(row.noteKey)}" data-bucket="${htmlEscape(row.bucket)}">
		<div class="title-row">
			<div>
				<h3>${identityLine}</h3>
				<div class="muted">${htmlEscape(row.bucketLabel)}</div>
			</div>
			<div class="verdict">${htmlEscape(row.bucketLabel)}</div>
		</div>

		${
			!debug
				? `<details class="extra identity"><summary>Hidden identity</summary>
			<p>${htmlEscape(row.name)} · pid ${row.pid}</p>
		</details>`
				: ""
		}

		<div class="pill-grid">
			${[
				[
					"Contract",
					`${money(num(row.normalNoOptionContractAmount))} / ${htmlEscape(row.normalNoOptionContractYears)}y`,
				],
				["OVR/POT", `${ratings.ovr ?? "--"}/${ratings.pot ?? "--"}`],
				["Age / Pos", `${htmlEscape(row.age)} / ${htmlEscape(row.pos)}`],
				["Team", row.teamLabel],
				[
					"PTS/TRB/AST",
					`${displayNumber(row.PTS, 1)} / ${displayNumber(row.TRB, 1)} / ${displayNumber(row.AST, 1)}`,
				],
				[
					"MPG / PER",
					`${displayNumber(row.MPG, 1)} / ${displayNumber(row.PER, 1)}`,
				],
				[
					"TS% / BPM / EWA",
					`${pct(num(row.TS))} / ${displayNumber(row.BPM, 1)} / ${displayNumber(row.EWA, 1)}`,
				],
				[
					"Demand / Cap",
					`${money(num(row.estimatedDemandNoRandom))} / ${pct(num(row.estimatedDemandNoRandom) / row.salaryCap)}`,
				],
				[
					"Eligible Max / Min",
					`${money(num(row.eligibleMax))} / ${money(num(row.minContractForPlayer))}`,
				],
			]
				.map(
					([label, value]) =>
						`<div class="pill${label === "Contract" ? " primary" : ""}"><span>${htmlEscape(label)}</span><b>${htmlEscape(value)}</b></div>`,
				)
				.join("")}
		</div>

		<div class="content-grid">
			<div class="panel">
				<h4>All Ratings</h4>
				${renderRatingsPanel(ratings)}
			</div>
			<div class="panel">
				<h4>Stats</h4>
				${renderStatsPanel(row, season)}
			</div>
		</div>

		<details class="extra awards-panel" open>
			<summary>Awards</summary>
			${renderAwardsPanel(row.awardGroups)}
		</details>

		<section class="review">
			<div class="review-grid">
				<label class="review-field">
					<span>humanTargetTier</span>
					<input type="text" data-field="humanTargetTier" data-note-key="${htmlEscape(row.noteKey)}" placeholder="e.g. max / starter / minimum" />
				</label>
				<label class="review-field">
					<span>humanAmountRangeM</span>
					<input type="text" data-field="humanAmountRangeM" data-note-key="${htmlEscape(row.noteKey)}" placeholder="e.g. 10-14" />
				</label>
				<label class="review-field">
					<span>humanYears</span>
					<input type="text" data-field="humanYears" data-note-key="${htmlEscape(row.noteKey)}" placeholder="e.g. 3" />
				</label>
			</div>
			<label class="note-label" for="note-${htmlEscape(row.caseId)}">humanNotes</label>
			<textarea id="note-${htmlEscape(row.caseId)}" data-field="humanNotes" data-note-key="${htmlEscape(row.noteKey)}" rows="4" placeholder="Tier, amount range, years, rationale"></textarea>
		</section>

		<details class="extra sampling-rationale">
			<summary>Selection / Sampling Rationale</summary>
			<p>${htmlEscape(debug ? row.debugSelectionRationale : row.selectionRationale)}</p>
			<p class="skills">Challenge tags: ${htmlEscape(row.challengeTags || "none")}</p>
		</details>

		${
			debug
				? `<details class="extra"><summary>Model internals / debug</summary>
			<div class="debug-grid">
				<div><span>Case</span><b>${htmlEscape(row.caseId)}</b></div>
				<div><span>Global case</span><b>${htmlEscape(row.globalCaseId)}</b></div>
				<div><span>pid</span><b>${row.pid}</b></div>
				<div><span>Bucket</span><b>${htmlEscape(row.bucketLabel)}</b></div>
				<div><span>Debug tier</span><b>${htmlEscape(row.debugModelTier)}</b></div>
				<div><span>Debug range</span><b>${htmlEscape(row.debugModelRangeText)}</b></div>
				<div><span>Eligible Max</span><b>${money(num(row.eligibleMax))}</b></div>
				<div><span>Normal contract</span><b>${money(num(row.normalNoOptionContractAmount))} / ${htmlEscape(row.normalNoOptionContractYears)}y</b></div>
				<div><span>ContractValue</span><b>${displayNumber(row.contractValue, 1)}</b></div>
				<div><span>Value / ValueNoPot</span><b>${displayNumber(row.value, 1)} / ${displayNumber(row.valueNoPot, 1)}</b></div>
			</div>
			<p class="debug-reason">${htmlEscape(row.debugModelReason)}</p>
			<div class="subhead">Composite ratings</div>
			${renderDebugComposite(row)}
			<div class="subhead">Skill margins</div>
			<p class="skills">${htmlEscape(
				`3: ${displayNumber(row.skill_3_margin, 3)} | Ps: ${displayNumber(row.skill_Ps_margin, 3)} | R: ${displayNumber(row.skill_R_margin, 3)} | Di: ${displayNumber(row.skill_Di_margin, 3)} | Dp: ${displayNumber(row.skill_Dp_margin, 3)} | A: ${displayNumber(row.skill_A_margin, 3)}`,
			)}</p>
			<p class="skills">Generated skills: ${htmlEscape(row.generatedSkills || "none")}</p>
		</details>`
				: ""
		}
	</article>`;
};

const buildClientScript = ({ storageKey, seedNotes }) => `
(function () {
	const STORAGE_KEY = ${JSON.stringify(storageKey)};
	const EXPORT_FILENAME = "contract_market_boundary40_human_notes.json";
	const seedNotes = ${JSON.stringify(seedNotes)};
	const fields = Array.from(document.querySelectorAll("[data-field]"));
	const statusEl = document.getElementById("save-status");

	const cloneSeed = () => JSON.parse(JSON.stringify(seedNotes));
	const normalizeImported = (data) => {
		const next = cloneSeed();
		const applyRecord = (key, value) => {
			if (!next[key]) return;
			const base = next[key];
			next[key] = {
				...base,
				caseId: value?.caseId ?? base.caseId,
				globalCaseId: value?.globalCaseId ?? base.globalCaseId,
				pid: Number.isFinite(Number(value?.pid ?? base.pid))
					? Number(value?.pid ?? base.pid)
					: base.pid,
				bucket: value?.bucket ?? base.bucket,
				humanTargetTier: value?.humanTargetTier ?? "",
				humanAmountRangeM: value?.humanAmountRangeM ?? "",
				humanYears: value?.humanYears ?? "",
				humanNotes:
					value?.humanNotes ?? value?.note ?? value?.text ?? value ?? "",
			};
		};

		if (Array.isArray(data)) {
			for (const value of data) {
				if (!value || typeof value !== "object") continue;
				const key =
					typeof value.caseId === "string"
						? Object.keys(next).find(
								(seedKey) => next[seedKey].caseId === value.caseId,
							)
						: typeof value.globalCaseId === "string"
							? Object.keys(next).find(
									(seedKey) =>
										next[seedKey].globalCaseId === value.globalCaseId,
								)
						: "boundary40-" + Number(value.pid);
				if (key && next[key]) {
					applyRecord(key, value);
				}
			}
			return next;
		}

		if (data && typeof data === "object") {
			const looksLikeSingleRecord =
				"caseId" in data || "pid" in data || "humanNotes" in data;
			if (looksLikeSingleRecord) {
				const key =
					typeof data.caseId === "string"
						? Object.keys(next).find(
								(seedKey) => next[seedKey].caseId === data.caseId,
							)
						: typeof data.globalCaseId === "string"
							? Object.keys(next).find(
									(seedKey) =>
										next[seedKey].globalCaseId === data.globalCaseId,
								)
						: "boundary40-" + Number(data.pid);
				if (key && next[key]) {
					applyRecord(key, data);
				}
				return next;
			}

			for (const [key, value] of Object.entries(data)) {
				if (!next[key]) continue;
				if (typeof value === "string") {
					applyRecord(key, { humanNotes: value });
				} else {
					applyRecord(key, value);
				}
			}
		}

		return next;
	};

	let notes = (function loadNotes() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			return raw ? normalizeImported(JSON.parse(raw)) : cloneSeed();
		} catch (error) {
			return cloneSeed();
		}
	})();

	const render = () => {
		for (const field of fields) {
			const key = field.dataset.noteKey;
			const fieldName = field.dataset.field;
			field.value = notes[key]?.[fieldName] ?? "";
		}
	};

	const persist = () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
		statusEl.textContent = "Saved locally " + new Date().toLocaleTimeString();
	};

	for (const field of fields) {
		field.addEventListener("input", () => {
			const key = field.dataset.noteKey;
			const fieldName = field.dataset.field;
			notes[key][fieldName] = field.value;
			persist();
		});
	}

	document.getElementById("export-json").addEventListener("click", () => {
		const blob = new Blob([JSON.stringify(notes, null, 2) + "\\n"], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = EXPORT_FILENAME;
		a.click();
		URL.revokeObjectURL(url);
	});

	const importFile = document.getElementById("import-file");
	document.getElementById("import-json").addEventListener("click", () => {
		importFile.click();
	});
	importFile.addEventListener("change", async () => {
		const file = importFile.files[0];
		if (!file) return;
		notes = normalizeImported(JSON.parse(await file.text()));
		render();
		persist();
		importFile.value = "";
	});

	document.getElementById("clear-notes").addEventListener("click", () => {
		if (!confirm("Clear all locally saved boundary40 notes?")) return;
		notes = cloneSeed();
		render();
		localStorage.removeItem(STORAGE_KEY);
		statusEl.textContent = "Local notes cleared.";
	});

	render();
})();
`;

const buildHtml = (rows, { debug, save }) => {
	const storageKey = `bbgm.contractMarket.boundary40.${debug ? "debug" : "blind"}.notes`;
	const seedNotes = notesSeed(rows);

	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BBGM Contract Boundary 40 ${debug ? "Debug" : "Blind"}</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#172033;--muted:#667085;--line:#e5e7eb;--soft:#f8fafc;--blue:#eef4ff;--green:#ecfdf3;--red:#fef3f2;--gradient-base-danger:239,162,169;--gradient-base-success:117,183,152;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif}
header{background:#111827;color:white;padding:22px 28px}
header h1{margin:0 0 8px;font-size:24px}
header p{margin:4px 0;color:#d1d5db}
main{max-width:1320px;margin:0 auto;padding:20px}
.toolbar{position:sticky;top:0;z-index:3;background:rgba(246,247,249,.95);backdrop-filter:blur(8px);padding:10px 0;border-bottom:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap}
button{border:1px solid #cbd5e1;background:#fff;border-radius:10px;padding:8px 12px;cursor:pointer}
.notice{background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:13px 15px;margin:14px 0;line-height:1.55}
.section h2{font-size:22px;margin:24px 0 12px}
.section h2 small{display:block;font-size:13px;color:var(--muted);font-weight:500;margin-top:3px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;margin:16px 0;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.title-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
h3{margin:0;font-size:23px}
h3 small{color:var(--muted);font-size:12px;font-weight:500}
.muted{color:var(--muted);font-size:13px}
.verdict{font-weight:800;border-radius:999px;padding:7px 12px;background:var(--blue);border:1px solid #b2ccff;white-space:nowrap}
.pill-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px;margin:10px 0 14px}
.pill{background:#fff;border:1px solid var(--line);border-radius:11px;padding:9px 10px;min-height:58px}
.pill.primary{background:#ecfdf3;border-color:#86efac}
.pill span{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}
.pill b{font-size:15px}
.why{background:#eef4ff;border:1px solid #b2ccff;border-radius:12px;padding:10px 12px;margin:10px 0 14px}
.why summary{font-weight:800;cursor:pointer}
.why p{margin:8px 0 0;line-height:1.55}
.content-grid{display:grid;grid-template-columns:minmax(280px,430px) minmax(360px,1fr);gap:16px;align-items:start}
@media(max-width:920px){.content-grid{grid-template-columns:1fr}}
.panel h4{margin:0 0 10px;font-size:17px}
.ratings-wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;width:100%}
.ratings-group{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
.ratings-group h4{margin:0;padding:8px 10px;background:#f2f4f7;border-bottom:1px solid var(--line);font-size:14px}
.ratings-group table{width:100%;border-collapse:collapse;table-layout:fixed}
.ratings-group td{padding:7px 10px;border-bottom:1px solid #eef2f7;font-size:13px;vertical-align:middle}
.ratings-group tr:last-child td{border-bottom:0}
.ratings-group td:first-child{width:72%;white-space:normal;overflow:visible;line-height:1.2}
.ratings-group td:last-child{width:28%;text-align:right;font-weight:800;font-size:15px}
.good{color:#067647}
.mid{color:#175cd3}
.low{color:#b42318}
.subhead{font-weight:800;color:#475467;font-size:13px;margin:2px 0 8px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:7px;margin-bottom:12px}
.stat{border:1px solid var(--line);border-radius:10px;padding:7px 9px;background:#fff;min-height:50px}
.stat span{display:block;color:var(--muted);font-size:11px;margin-bottom:3px}
.stat b{font-size:14px}
.extra{margin-top:12px;border-top:1px solid var(--line);padding-top:10px}
.extra summary{cursor:pointer;font-weight:800;color:#344054}
.extra p{line-height:1.5;color:#344054}
.identity{border-top:0;margin-top:0;padding-top:0}
.debug-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:9px}
.debug-grid div{border:1px solid var(--line);border-radius:10px;background:#fff;padding:8px 10px}
.debug-grid span{display:block;color:var(--muted);font-size:12px;margin-bottom:3px}
.note-label{display:block;margin:14px 0 6px;font-weight:800;color:#344054}
textarea,input[type="text"]{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;background:#fff}
textarea{min-height:100px;resize:vertical}
.review{margin-top:14px}
.review-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.review-field span{display:block;margin-bottom:6px;font-weight:800;color:#344054}
.review-field input{min-height:44px}
.award-list{display:grid;gap:8px}
.award-line{display:grid;grid-template-columns:74px 1fr;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:#fbfcfd}
.award-line span{font-weight:800;color:#344054}
.award-line b{font-weight:600;color:#344054}
.empty{margin:0;color:var(--muted)}
.skills{margin:6px 0 0;color:var(--muted)}
@media(max-width:700px){
	.title-row{display:block}
	.verdict{display:inline-block;margin-top:8px}
}
</style>
</head>
<body>
	<header>
		<h1>BBGM Contract Boundary 40${debug ? " Debug" : " Blind"}</h1>
		<p>Season ${save.gameAttributes.season}, phase ${save.gameAttributes.phase} re-sign players, salary cap ${money(save.gameAttributes.salaryCap)}</p>
		<p>Boundary/challenge calibration set. This is not validation20 and not a final test. Blind hides identity by default; debug keeps model internals in folded details.</p>
	</header>
	<main>
		<div class="toolbar">
			<button type="button" id="export-json">Export JSON</button>
			<button type="button" id="import-json">Import JSON</button>
			<button type="button" id="clear-notes">Clear local notes</button>
			<input type="file" id="import-file" accept="application/json,.json" hidden />
			<span id="save-status">Notes autosave locally.</span>
		</div>
		<div class="notice"><b>Boundary40 review:</b> v3 card layout, sticky toolbar, localStorage autosave, Import JSON, Export JSON, Clear, and awards shown by season.${debug ? " Model internals are folded under debug only." : ""}</div>
		${bucketDefinitions
			.map((bucket) => {
				const bucketRows = rows.filter((row) => row.bucket === bucket.key);
				return `<section class="section" id="${htmlEscape(bucket.key)}">
					<h2>${htmlEscape(bucket.label)} <small>${htmlEscape(bucket.goal)}</small></h2>
					${bucketRows
						.map((row) =>
							renderCard(row, { debug, season: save.gameAttributes.season }),
						)
						.join("\n")}
				</section>`;
			})
			.join("\n")}
	</main>
	<script>
${buildClientScript({ storageKey, seedNotes })}
	</script>
</body>
</html>
`;
};

const selectBucketRows = (pool, bucket, usedPids) => {
	const candidates = pool
		.filter((row) => !usedPids.has(row.pid) && bucketCriteria[bucket.key](row))
		.sort((a, b) => bucketScore[bucket.key](a) - bucketScore[bucket.key](b));
	const selected = [];
	const posCounts = new Map();
	const tagCounts = new Map();

	for (const row of candidates) {
		const pos = broadPos(row.pos);
		const dominantTags = row.challengeTags.slice(0, 2).join("|");
		const posCount = posCounts.get(pos) ?? 0;
		const tagCount = tagCounts.get(dominantTags) ?? 0;
		if (selected.length < 3 && posCount >= 2) continue;
		if (selected.length < 3 && dominantTags && tagCount >= 2) continue;
		selected.push(row);
		posCounts.set(pos, posCount + 1);
		tagCounts.set(dominantTags, tagCount + 1);
		if (selected.length === 4) break;
	}

	for (const row of candidates) {
		if (selected.length === 4) break;
		if (!selected.some((selectedRow) => selectedRow.pid === row.pid)) {
			selected.push(row);
		}
	}

	if (selected.length !== 4) {
		throw new Error(
			`Bucket ${bucket.key} expected 4 rows, found ${selected.length}`,
		);
	}
	for (const row of selected) {
		usedPids.add(row.pid);
	}
	return selected;
};

const buildCandidatePool = ({ save, anchorTargets, validation20Pids }) => {
	const excludedPids = new Set([
		...anchorTargets.map((target) => Number(target.pid)),
		...validation20Pids,
	]);
	const anchorEntries = save.players
		.filter(
			(player) =>
				player.tid >= -1 &&
				!excludedPids.has(player.pid) &&
				player.stats?.some((row) => !row.playoffs),
		)
		.map((player) => ({
			key: `boundary-candidate-${player.pid}`,
			pid: player.pid,
			note: {},
		}));
	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries,
		targetByPid: targetsByPid(anchorTargets),
	});
	const playersByPid = new Map(
		save.players.map((player) => [player.pid, player]),
	);
	const teamsByTid = new Map(
		(save.teams ?? []).map((team) => [team.tid, team]),
	);

	const pool = rows.map((row) => {
		const player = playersByPid.get(row.pid);
		const score = scoreTier(row);
		const range = tierRange(score.tier, row, attrs);
		const awardGroups = groupedAwards(player.awards);
		const enriched = {
			...row,
			player,
			salaryCap: attrs.salaryCap,
			contractValue: row.getContractValue,
			currentNoOptionAmount: row.normalNoOptionContractAmount,
			currentNoOptionYears: row.normalNoOptionContractYears,
			currentNoOptionCapPct: row.normalNoOptionContractCapPct,
			teamLabel: teamLabelByTid(teamsByTid, player.tid),
			awardGroups,
			awardsSummary: awardsSummary(awardGroups),
			debugModelTier: score.tier,
			debugModelRangeText: range.modelRangeText,
			debugModelReason: score.reason,
			inModelGap18To26:
				row.estimatedDemandNoRandom >= 18560 &&
				row.estimatedDemandNoRandom <= 26290,
			inModelGap34To41:
				row.estimatedDemandNoRandom >= 34800 &&
				row.estimatedDemandNoRandom <= 40830,
		};
		enriched.challengeTags = challengeTagsForRow(enriched, attrs);
		return enriched;
	});

	return { attrs, pool, excludedPids };
};

const selectBoundaryRows = (pool) => {
	const usedPids = new Set();
	const byBucket = new Map();
	for (const bucket of [...bucketDefinitions].reverse()) {
		byBucket.set(bucket.key, selectBucketRows(pool, bucket, usedPids));
	}

	return bucketDefinitions.flatMap((bucket) =>
		byBucket.get(bucket.key).map((row, bucketIndex) => {
			const globalCaseId = `B40-${String(
				bucketDefinitions.findIndex((entry) => entry.key === bucket.key) * 4 +
					bucketIndex +
					1,
			).padStart(2, "0")}`;
			const bucketLetter = bucket.label.slice(0, 1);
			const caseId = `${bucketLetter}-${String(bucketIndex + 1).padStart(2, "0")}`;
			const challengeTags = row.challengeTags.join(";");
			const selected = {
				...row,
				caseId,
				globalCaseId,
				bucket: bucket.key,
				bucketLabel: bucket.label,
				bucketGoal: bucket.goal,
				challengeTagList: row.challengeTags,
				challengeTags,
				noteKey: `boundary40-${row.pid}`,
			};
			selected.selectionRationale = selectionRationale(selected, bucket);
			return selected;
		}),
	);
};

const writeNotesTemplate = (rows) => {
	fs.writeFileSync(
		notesTemplatePath,
		`${JSON.stringify(notesSeed(rows), null, "\t")}\n`,
	);
};

const writeCandidatesCsv = (rows) => {
	const columnOrder = [
		"caseId",
		"globalCaseId",
		"pid",
		"name",
		"bucket",
		"bucketLabel",
		"challengeTags",
		"age",
		"pos",
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
		"awardsSummary",
		"selectionRationale",
		"debugModelTier",
		"debugModelRangeText",
		"debugModelReason",
	];
	writeCsv(candidatesCsvPath, rows, columnOrder);
};

const boundaryCoverageRows = (rows, attrs) => {
	const targets = [0.055, 0.08, 0.1, 0.14, 0.18, 0.225, 0.3];
	return targets.map((target) => {
		const nearest = [...rows].sort(
			(a, b) =>
				Math.abs(a.estimatedDemandNoRandom / attrs.salaryCap - target) -
				Math.abs(b.estimatedDemandNoRandom / attrs.salaryCap - target),
		)[0];
		return {
			boundary: pct(target),
			nearestCase: nearest.caseId,
			player: nearest.name,
			demand: money(nearest.estimatedDemandNoRandom),
			demandCap: pct(nearest.estimatedDemandNoRandom / attrs.salaryCap),
			bucket: nearest.bucket,
		};
	});
};

const writeSelectionReport = ({
	rows,
	attrs,
	anchorPids,
	validation20Pids,
}) => {
	const bucketSummaryColumns = [
		{ key: "caseId", label: "case" },
		{ key: "globalCaseId", label: "global id" },
		{ key: "pid", label: "pid" },
		{ key: "name", label: "player" },
		{ key: "age", label: "age" },
		{ key: "pos", label: "pos" },
		{
			key: "estimatedDemandNoRandom",
			label: "demand",
			format: money,
		},
		{
			key: "estimatedDemandNoRandom",
			label: "cap%",
			format: (value) => pct(value / attrs.salaryCap),
		},
		{ key: "debugModelTier", label: "model tier" },
		{ key: "challengeTags", label: "challenge tags" },
	];
	const rationaleColumns = [
		{ key: "caseId", label: "case" },
		{ key: "globalCaseId", label: "global id" },
		{ key: "name", label: "player" },
		{ key: "selectionRationale", label: "selection rationale" },
	];
	const boundaryColumns = [
		{ key: "boundary", label: "cap boundary" },
		{ key: "nearestCase", label: "nearest case" },
		{ key: "player", label: "player" },
		{ key: "demand", label: "demand" },
		{ key: "demandCap", label: "demand cap%" },
		{ key: "bucket", label: "bucket" },
	];
	const bucketSections = bucketDefinitions
		.map((bucket) => {
			const bucketRows = rows.filter((row) => row.bucket === bucket.key);
			return `### ${bucket.label}

Selection target: ${bucket.goal}

${markdownTable(bucketRows, bucketSummaryColumns)}

${markdownTable(bucketRows, rationaleColumns)}
`;
		})
		.join("\n");
	const gap18Rows = rows.filter((row) => row.inModelGap18To26);
	const gap34Rows = rows.filter((row) => row.inModelGap34To41);
	const minimumRows = rows.filter((row) =>
		row.challengeTags.includes("player_minimum_sensitive"),
	);
	const termRows = rows.filter(
		(row) =>
			row.challengeTags.includes("guard_age_31_plus_length_risk") ||
			row.challengeTags.includes("old_good_current_short_term") ||
			row.challengeTags.includes("award_old_decline"),
	);

	const md = `# Contract Market Boundary40 Selection Report

Scope: boundary/challenge calibration set only. This does not replace validation20, does not act as a final test, and does not change model rules.

Inputs:

- \`${path.relative(root, savePath)}\`
- \`${path.relative(root, anchorTargetsPath)}\`
- \`${path.relative(root, validation20CandidatesPath)}\`
- \`tools/contract-market-proxy-core.mjs\`
- \`tools/contract-market-tier-score.mjs\`
- \`tools/contract-market-validation20.mjs\`
- \`temp/bbgm_contract_review_sample_v3.html\`

## Exclusion Rules

- Excluded anchor15 pids: ${anchorPids.join(", ")}
- Excluded validation20 pids: ${validation20Pids.join(", ")}
- Boundary40 selected pids have no overlap with either excluded set.

## Bucket Targets And Cases

${bucketSections}

## Coverage Check

- Case count: ${rows.length}
- Bucket count: ${bucketDefinitions.length} x 4 cases
- Minimum to max coverage: selected demands run from ${money(
		Math.min(...rows.map((row) => row.estimatedDemandNoRandom)),
	)} to ${money(Math.max(...rows.map((row) => row.estimatedDemandNoRandom)))}; player-specific minimum rows are included.
- Max-end note: after excluding anchor15 and validation20 pids, the selected pool's strongest available max-proximity sample is ${[
		...rows,
	]
		.sort((a, b) => b.estimatedDemandNoRandom - a.estimatedDemandNoRandom)
		.slice(0, 1)
		.map(
			(row) =>
				`${row.caseId} ${row.name} at ${money(row.estimatedDemandNoRandom)} (${pct(row.estimatedDemandNoRandom / attrs.salaryCap)})`,
		)
		.join(
			"",
		)}; after excluding anchor15 and validation20, this set does not force exact-max cases. J bucket is used to test whether upper-star / near-max candidates should be pushed to exact max or remain below max.
- Current model gap $18.56M-$26.29M coverage: ${gap18Rows.length} cases (${
		gap18Rows
			.map(
				(row) =>
					`${row.caseId} ${row.name} ${money(row.estimatedDemandNoRandom)}`,
			)
			.join("; ") || "none"
	}).
- Current model gap $34.80M-$40.83M coverage: ${gap34Rows.length} cases (${
		gap34Rows
			.map(
				(row) =>
					`${row.caseId} ${row.name} ${money(row.estimatedDemandNoRandom)}`,
			)
			.join("; ") || "none"
	}).
- Player-specific minimum coverage: ${minimumRows.length} cases tagged \`player_minimum_sensitive\`.
- Years/term risk coverage: ${termRows.length} cases tagged for guard age, old-current-value, or award/decline term risk.

Nearest selected samples to requested cap boundaries:

${markdownTable(boundaryCoverageRows(rows, attrs), boundaryColumns)}

## Notes

- Buckets intentionally favor boundary and conflict samples over the most typical examples.
- Composite ratings are used internally only for selection tags and debug details; the blind review page does not display them.
- AAV bucket placement and years/term risk should remain separate review questions.
`;
	fs.writeFileSync(selectionReportPath, md);
};

const validateOutputs = ({ rows, anchorPids, validation20Pids }) => {
	if (rows.length !== 40) {
		throw new Error(`Expected 40 cases, found ${rows.length}`);
	}
	for (const bucket of bucketDefinitions) {
		const count = rows.filter((row) => row.bucket === bucket.key).length;
		if (count !== 4) {
			throw new Error(`Bucket ${bucket.key} expected 4 cases, found ${count}`);
		}
	}
	const anchorSet = new Set(anchorPids);
	const validation20Set = new Set(validation20Pids);
	const anchorOverlap = rows.filter((row) => anchorSet.has(row.pid));
	const validationOverlap = rows.filter((row) => validation20Set.has(row.pid));
	if (anchorOverlap.length > 0) {
		throw new Error(
			`Anchor overlap: ${anchorOverlap.map((row) => row.pid).join(", ")}`,
		);
	}
	if (validationOverlap.length > 0) {
		throw new Error(
			`Validation20 overlap: ${validationOverlap.map((row) => row.pid).join(", ")}`,
		);
	}
};

const main = () => {
	const save = readSave(savePath);
	const anchorTargets = readJsonIfExists(anchorTargetsPath, []);
	const validation20Rows = csvParse(
		fs.readFileSync(validation20CandidatesPath, "utf8"),
	);
	const anchorPids = anchorTargets.map((target) => Number(target.pid));
	const validation20Pids = validation20Rows.map((row) => Number(row.pid));
	const { attrs, pool } = buildCandidatePool({
		save,
		anchorTargets,
		validation20Pids,
	});
	const rows = selectBoundaryRows(pool);
	validateOutputs({ rows, anchorPids, validation20Pids });

	fs.mkdirSync(artifactsDir, { recursive: true });
	writeCandidatesCsv(rows);
	writeNotesTemplate(rows);
	fs.writeFileSync(
		reviewBlindHtmlPath,
		buildHtml(rows, { debug: false, save }),
	);
	fs.writeFileSync(reviewDebugHtmlPath, buildHtml(rows, { debug: true, save }));
	writeSelectionReport({ rows, attrs, anchorPids, validation20Pids });

	console.log(`Wrote ${path.relative(root, candidatesCsvPath)}`);
	console.log(`Wrote ${path.relative(root, notesTemplatePath)}`);
	console.log(`Wrote ${path.relative(root, reviewBlindHtmlPath)}`);
	console.log(`Wrote ${path.relative(root, reviewDebugHtmlPath)}`);
	console.log(`Wrote ${path.relative(root, selectionReportPath)}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main();
}
