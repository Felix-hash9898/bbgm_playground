#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
	anchorEntriesFromNotes,
	buildProxyRows,
	markdownTable,
	money,
	pct,
	readJsonIfExists,
	readSave,
	round,
	writeCsv,
} from "./contract-market-proxy-core.mjs";
import { scoreTier, tierRange } from "./contract-market-tier-score.mjs";

const root = process.cwd();
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);
const anchorsPath = path.join(root, "temp/contract_market_anchor_targets.json");
const artifactsDir = path.join(root, "contract_market_artifacts");
const artifactAnchorsPath = path.join(
	artifactsDir,
	"contract_market_anchor_targets.json",
);
const validationHumanNotesPath = path.join(
	root,
	"temp/contract_market_validation20_human_notes.json",
);
const candidatesCsvPath = path.join(
	artifactsDir,
	"contract_market_validation20_candidates.csv",
);
const reviewBlindHtmlPath = path.join(
	artifactsDir,
	"contract_market_validation20_review_blind.html",
);
const reviewDebugHtmlPath = path.join(
	artifactsDir,
	"contract_market_validation20_review_debug.html",
);
const notesTemplatePath = path.join(
	artifactsDir,
	"contract_market_validation20_notes_template.json",
);

const bucketDefinitions = [
	{
		key: "max_near_max_high_star",
		label: "Max / near-max / high-star candidate",
		filter: (row) =>
			row.getContractValue >= 62 &&
			row.valueNoPot >= 62 &&
			row.MPG >= 28 &&
			row.EWA >= 5,
		score: (row) =>
			row.getContractValue * 3 +
			row.valueNoPot * 1.5 +
			row.estimatedDemandNoRandom / 1000 +
			row.EWA * 2 +
			row.VORP * 2 +
			row.BPM +
			row.comp_usage * 20,
		reason: (row) =>
			`star proxy: contractValue ${round(row.getContractValue, 1)}, demand ${money(row.estimatedDemandNoRandom)}, ${round(row.MPG, 1)} MPG, EWA ${round(row.EWA, 1)}, BPM ${round(row.BPM, 1)}`,
	},
	{
		key: "young_proven_young_starter",
		label: "Young proven / young starter candidate",
		filter: (row) =>
			row.age <= 26 &&
			row.getContractValue >= 56 &&
			row.getContractValue < 66 &&
			row.value >= 58 &&
			row.MPG >= 24 &&
			row.starterShare >= 0.4 &&
			row.EWA >= 1.5,
		score: (row) =>
			row.getContractValue * 2 +
			row.value +
			row.potentialPremium * 1.5 +
			row.MPG +
			row.starterShare * 15 +
			row.EWA +
			row.comp_usage * 8 +
			row.comp_defensePerimeter * 8,
		reason: (row) =>
			`young starter proxy: age ${row.age}, value ${round(row.value, 1)}, premium ${round(row.potentialPremium, 1)}, ${round(row.MPG, 1)} MPG, start ${pct(row.starterShare)}`,
	},
	{
		key: "low_end_starter_good_rotation",
		label: "Low-end starter / good rotation candidate",
		filter: (row) =>
			row.getContractValue >= 53 &&
			row.getContractValue < 61 &&
			row.valueNoPot >= 53 &&
			row.MPG >= 18 &&
			row.EWA >= 0.5,
		score: (row) =>
			row.getContractValue * 2 +
			row.valueNoPot +
			row.MPG * 1.5 +
			row.starterShare * 12 +
			row.EWA * 1.5 +
			row.VORP +
			Math.max(
				row.comp_passing,
				row.comp_rebounding,
				row.comp_defenseInterior,
				row.comp_defensePerimeter,
			) *
				12,
		reason: (row) =>
			`starter/rotation proxy: contractValue ${round(row.getContractValue, 1)}, valueNoPot ${round(row.valueNoPot, 1)}, ${round(row.MPG, 1)} MPG, start ${pct(row.starterShare)}, EWA ${round(row.EWA, 1)}`,
	},
	{
		key: "specialist_low_rotation",
		label: "Specialist / low rotation candidate",
		filter: (row) =>
			row.GP >= 30 &&
			row.MPG >= 6 &&
			row.MPG < 20 &&
			row.getContractValue >= 48 &&
			row.getContractValue < 57 &&
			Math.max(
				row.skill_3_margin,
				row.skill_Ps_margin,
				row.skill_R_margin,
				row.skill_Di_margin,
				row.skill_Dp_margin,
				row.skill_A_margin,
			) >= -0.03,
		score: (row) =>
			Math.max(
				row.skill_3_margin,
				row.skill_Ps_margin,
				row.skill_R_margin,
				row.skill_Di_margin,
				row.skill_Dp_margin,
				row.skill_A_margin,
			) *
				100 +
			Math.max(
				row.comp_shootingThreePointer,
				row.comp_passing,
				row.comp_rebounding,
				row.comp_defenseInterior,
				row.comp_defensePerimeter,
				row.comp_athleticism,
			) *
				25 +
			row.valueNoPot +
			row.PER +
			row.MPG,
		reason: (row) =>
			`specialist/low-rotation proxy: ${round(row.MPG, 1)} MPG, valueNoPot ${round(row.valueNoPot, 1)}, best skill margin ${round(bestSkillMargin(row), 3)}, best composite ${round(bestComposite(row), 3)}`,
	},
	{
		key: "veteran_minimum_fringe_negative",
		label: "Veteran minimum / fringe / negative candidate",
		filter: (row) =>
			row.age >= 28 &&
			row.getContractValue <= 54.5 &&
			(row.MPG < 16 || row.PER < 10 || row.EWA < 0 || row.BPM < -1.5),
		score: (row) =>
			row.age * 1.5 -
			row.getContractValue +
			Math.max(0, 16 - row.MPG) * 2 +
			Math.max(0, 10 - row.PER) * 2 +
			Math.max(0, -row.EWA) * 8 +
			Math.max(0, -row.BPM) * 2,
		reason: (row) =>
			`fringe/negative proxy: age ${row.age}, contractValue ${round(row.getContractValue, 1)}, ${round(row.MPG, 1)} MPG, PER ${round(row.PER, 1)}, EWA ${round(row.EWA, 1)}, BPM ${round(row.BPM, 1)}`,
	},
];

const bestSkillMargin = (row) =>
	Math.max(
		row.skill_3_margin,
		row.skill_Ps_margin,
		row.skill_R_margin,
		row.skill_Di_margin,
		row.skill_Dp_margin,
		row.skill_A_margin,
	);

const bestComposite = (row) =>
	Math.max(
		row.comp_shootingThreePointer,
		row.comp_passing,
		row.comp_rebounding,
		row.comp_defenseInterior,
		row.comp_defensePerimeter,
		row.comp_athleticism,
	);

const htmlEscape = (value) =>
	String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

const display = (value, digits = 1) =>
	Number.isFinite(value) ? round(value, digits) : "";

const pickBucketRows = (rows) => {
	const selectedPids = new Set();
	const selected = [];

	for (const bucket of bucketDefinitions) {
		const candidates = rows
			.filter((row) => !selectedPids.has(row.pid) && bucket.filter(row))
			.map((row) => ({
				...row,
				validationBucket: bucket.key,
				validationBucketLabel: bucket.label,
				validationBucketReason: bucket.reason(row),
				validationBucketScore: bucket.score(row),
			}))
			.sort(
				(a, b) =>
					b.validationBucketScore - a.validationBucketScore ||
					a.pid - b.pid,
			);

		for (const row of candidates.slice(0, 4)) {
			selectedPids.add(row.pid);
			selected.push(row);
		}

		if (candidates.length < 4) {
			throw new Error(
				`Only found ${candidates.length} candidates for ${bucket.key}`,
			);
		}
	}

	return selected;
};

const addDebugModel = (rows, attrs) =>
	rows.map((row) => {
		const score = scoreTier(row);
		const range = tierRange(score.tier, row, attrs);
		return {
			...row,
			debugModelTier: score.tier,
			debugModelReason: score.reason,
			debugModelRangeText: range.modelRangeText,
			debugModelCapRangeText: range.modelCapRangeText,
		};
	});

const metricGrid = (items) =>
	`<div class="metric-grid">${items
		.map(
			([label, value, cls = ""]) =>
				`<div class="metric ${cls}"><span>${htmlEscape(label)}</span><strong>${htmlEscape(value)}</strong></div>`,
		)
		.join("")}</div>`;

const playerCard = (row, { debug }) => {
	const skillMargins = [
		["3", row.skill_3_margin],
		["Ps", row.skill_Ps_margin],
		["R", row.skill_R_margin],
		["Di", row.skill_Di_margin],
		["Dp", row.skill_Dp_margin],
		["A", row.skill_A_margin],
	]
		.map(([label, value]) => `${label}: ${display(value, 3)}`)
		.join(" | ");

	const debugDetails = debug
		? `<details class="debug-details">
		<summary>Debug model/proxy selection details</summary>
		<p>${htmlEscape(row.validationBucketReason)}</p>
		<p>Debug model tier: ${htmlEscape(row.debugModelTier)} (${htmlEscape(row.debugModelRangeText)}, ${htmlEscape(row.debugModelCapRangeText)})</p>
		<p>${htmlEscape(row.debugModelReason)}</p>
	</details>`
		: "";

	return `<article class="player-card" id="${htmlEscape(row.caseId)}" data-case-id="${htmlEscape(row.caseId)}" data-pid="${row.pid}" data-name="${htmlEscape(row.name)}" data-bucket="${htmlEscape(row.validationBucket)}">
	<header>
		<div>
			<h2>Case ${htmlEscape(row.caseId)}</h2>
			<p>${htmlEscape(row.validationBucketLabel)}</p>
			<details class="identity-details">
				<summary>Reveal player identity</summary>
				<p>${htmlEscape(row.name)} · pid ${row.pid}</p>
			</details>
		</div>
		<div class="contract-pill">${money(row.normalNoOptionContractAmount)} / ${htmlEscape(row.normalNoOptionContractYears)}y / ${pct(row.normalNoOptionContractCapPct)}</div>
	</header>

	<section>
		<h3>Market proxies</h3>
		${metricGrid([
			["Age", row.age],
			["Pos", row.pos],
			["OVR/POT", `${row.ovr}/${row.pot}`],
			["Value", display(row.value, 1)],
			["ValueNoPot", display(row.valueNoPot, 1)],
			["ContractValue", display(row.getContractValue, 1)],
			["Demand", money(row.estimatedDemandNoRandom)],
			["Eligible max", money(row.eligibleMax)],
			["Minimum", money(row.minContractForPlayer)],
		])}
	</section>

	<section>
		<h3>Regular season</h3>
		${metricGrid([
			["GP/GS", `${row.GP}/${row.GS}`],
			["MPG", display(row.MPG, 1)],
			["PTS", display(row.PTS, 1)],
			["TRB", display(row.TRB, 1)],
			["AST", display(row.AST, 1)],
			["STL", display(row.STL, 1)],
			["BLK", display(row.BLK, 1)],
			["TOV", display(row.TOV, 1)],
		])}
	</section>

	<section>
		<h3>Advanced stats</h3>
		${metricGrid([
			["TS", pct(row.TS)],
			["eFG", pct(row.eFG)],
			["PER", display(row.PER, 1)],
			["EWA", display(row.EWA, 1)],
			["VORP", display(row.VORP, 1)],
			["BPM", display(row.BPM, 1)],
			["OBPM", display(row.OBPM, 1)],
			["DBPM", display(row.DBPM, 1)],
			["On-Off", display(row["On-Off"], 1)],
			["USG", display(row.USG, 1)],
			["AST%", display(row["AST%"], 1)],
			["TRB%", display(row["TRB%"], 1)],
			["BLK%", display(row["BLK%"], 1)],
		])}
	</section>

	<section>
		<h3>Composite ratings</h3>
		${metricGrid([
			["Usage", display(row.comp_usage, 3)],
			["Passing", display(row.comp_passing, 3)],
			["Dribbling", display(row.comp_dribbling, 3)],
			["3pt", display(row.comp_shootingThreePointer, 3)],
			["Rebounding", display(row.comp_rebounding, 3)],
			["Interior D", display(row.comp_defenseInterior, 3)],
			["Perimeter D", display(row.comp_defensePerimeter, 3)],
			["Blocking", display(row.comp_blocking, 3)],
			["Athleticism", display(row.comp_athleticism, 3)],
		])}
		<p class="skills">Generated skills: ${htmlEscape(row.generatedSkills || "none")}</p>
		<p class="skills">Skill margins: ${htmlEscape(skillMargins)}</p>
	</section>

	<section class="review">
		<label for="review-${row.caseId}">Human target tier / amount judgment</label>
		<textarea id="review-${row.caseId}" data-field="humanNotes" rows="4" placeholder="Tier, amount range, years, rationale"></textarea>
	</section>

	${debugDetails}
</article>`;
};

const notesSeed = (rows) =>
	Object.fromEntries(
		rows.map((row) => [
			`validation20-${row.pid}`,
			{
				caseId: row.caseId,
				pid: row.pid,
				name: row.name,
				bucket: row.validationBucket,
				humanTargetTier: "",
				humanAmountRangeM: "",
				humanYears: "",
				humanNotes: "",
			},
		]),
	);

const buildHtml = (rows, { debug }) => `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>BBGM Contract Market Validation 20${debug ? " Debug" : " Blind"}</title>
	<style>
		:root {
			color-scheme: light;
			--border: #c9d1d9;
			--muted: #5f6b7a;
			--text: #17202a;
			--bg: #f6f8fa;
			--panel: #fff;
			--accent: #0f6b5f;
		}
		body {
			margin: 0;
			background: var(--bg);
			color: var(--text);
			font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		}
		.page-header {
			position: sticky;
			top: 0;
			z-index: 1;
			padding: 14px 20px;
			border-bottom: 1px solid var(--border);
			background: rgba(255, 255, 255, 0.96);
		}
		h1 {
			margin: 0;
			font-size: 20px;
		}
		.bucket-nav {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			margin-top: 8px;
		}
		.toolbar {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
			margin-top: 10px;
		}
		button {
			border: 1px solid var(--border);
			border-radius: 6px;
			background: #fff;
			color: var(--text);
			font: inherit;
			font-weight: 700;
			padding: 5px 9px;
			cursor: pointer;
		}
		button:hover {
			border-color: var(--accent);
			color: var(--accent);
		}
		#save-status {
			color: var(--muted);
		}
		.bucket-nav a {
			color: var(--accent);
			text-decoration: none;
			font-weight: 600;
		}
		main {
			display: grid;
			gap: 16px;
			padding: 20px;
		}
		.bucket-section {
			display: grid;
			gap: 12px;
		}
		.bucket-section > h2 {
			margin: 8px 0 0;
			font-size: 18px;
		}
		.player-card {
			background: var(--panel);
			border: 1px solid var(--border);
			border-radius: 8px;
			padding: 14px;
		}
		.player-card header {
			display: flex;
			justify-content: space-between;
			gap: 12px;
			align-items: start;
			border-bottom: 1px solid var(--border);
			padding-bottom: 10px;
			margin-bottom: 10px;
		}
		.player-card h2 {
			margin: 0;
			font-size: 18px;
		}
		.player-card h2 small {
			color: var(--muted);
			font-weight: 500;
		}
		.player-card header p {
			margin: 2px 0 0;
			color: var(--muted);
		}
		.contract-pill {
			white-space: nowrap;
			padding: 5px 8px;
			border: 1px solid var(--border);
			border-radius: 6px;
			font-weight: 700;
			color: var(--accent);
		}
		section {
			margin-top: 12px;
		}
		h3 {
			margin: 0 0 6px;
			font-size: 13px;
			text-transform: uppercase;
			letter-spacing: 0;
			color: var(--muted);
		}
		.metric-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
			gap: 6px;
		}
		.metric {
			min-height: 44px;
			border: 1px solid #d8dee4;
			border-radius: 6px;
			padding: 6px 8px;
			background: #fbfcfd;
		}
		.metric span {
			display: block;
			color: var(--muted);
			font-size: 12px;
		}
		.metric strong {
			display: block;
			font-size: 15px;
		}
		.skills {
			margin: 6px 0 0;
			color: var(--muted);
		}
		.review label {
			display: block;
			font-weight: 700;
			margin-bottom: 4px;
		}
		textarea {
			box-sizing: border-box;
			width: 100%;
			resize: vertical;
			border: 1px solid var(--border);
			border-radius: 6px;
			padding: 8px;
			font: inherit;
		}
		details {
			margin-top: 10px;
			color: var(--muted);
		}
		.identity-details {
			margin-top: 4px;
		}
		.identity-details p {
			margin: 4px 0 0;
		}
		.debug-details {
			border-top: 1px solid var(--border);
			padding-top: 8px;
		}
		@media (max-width: 700px) {
			.player-card header {
				display: block;
			}
			.contract-pill {
				display: inline-block;
				margin-top: 8px;
			}
		}
	</style>
</head>
<body>
	<header class="page-header">
		<h1>BBGM Contract Market Validation Set (${debug ? "Debug" : "Blind"})</h1>
		<nav class="bucket-nav">
			${bucketDefinitions
				.map(
					(bucket) =>
						`<a href="#${bucket.key}">${htmlEscape(bucket.label)}</a>`,
				)
				.join("")}
		</nav>
		<div class="toolbar">
			<button type="button" id="export-json">Export JSON</button>
			<button type="button" id="import-json">Import JSON</button>
			<button type="button" id="clear-notes">Clear local notes</button>
			<input type="file" id="import-file" accept="application/json,.json" hidden />
			<span id="save-status">Notes autosave locally.</span>
		</div>
	</header>
	<main>
		${bucketDefinitions
			.map((bucket) => {
				const bucketRows = rows.filter(
					(row) => row.validationBucket === bucket.key,
				);
				return `<section class="bucket-section" id="${bucket.key}">
					<h2>${htmlEscape(bucket.label)}</h2>
					${bucketRows.map((row) => playerCard(row, { debug })).join("\n")}
				</section>`;
			})
			.join("\n")}
	</main>
	<script>
		const STORAGE_KEY = "bbgm.contractMarket.validation20.${debug ? "debug" : "blind"}.notes";
		const EXPORT_FILENAME = "contract_market_validation20_human_notes.json";
		const seedNotes = ${JSON.stringify(notesSeed(rows))};
		const textareas = Array.from(document.querySelectorAll("textarea[data-field='humanNotes']"));
		const statusEl = document.getElementById("save-status");

		const cloneSeed = () => JSON.parse(JSON.stringify(seedNotes));
		const normalizeImported = (data) => {
			const next = cloneSeed();
			for (const [key, value] of Object.entries(data || {})) {
				if (!next[key]) continue;
				next[key] = {
					...next[key],
					humanTargetTier: value.humanTargetTier ?? "",
					humanAmountRangeM: value.humanAmountRangeM ?? "",
					humanYears: value.humanYears ?? "",
					humanNotes: value.humanNotes ?? value.note ?? "",
				};
			}
			return next;
		};
		const loadNotes = () => {
			try {
				const raw = localStorage.getItem(STORAGE_KEY);
				return raw ? normalizeImported(JSON.parse(raw)) : cloneSeed();
			} catch {
				return cloneSeed();
			}
		};
		let notes = loadNotes();
		const keyForTextarea = (textarea) => {
			const card = textarea.closest(".player-card");
			return "validation20-" + card.dataset.pid;
		};
		const render = () => {
			for (const textarea of textareas) {
				const key = keyForTextarea(textarea);
				textarea.value = notes[key]?.humanNotes ?? "";
			}
		};
		const persist = () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
			statusEl.textContent = "Saved locally " + new Date().toLocaleTimeString();
		};
		for (const textarea of textareas) {
			textarea.addEventListener("input", () => {
				const key = keyForTextarea(textarea);
				notes[key].humanNotes = textarea.value;
				persist();
			});
		}
		document.getElementById("export-json").addEventListener("click", () => {
			const blob = new Blob([JSON.stringify(notes, null, "\\t") + "\\n"], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = EXPORT_FILENAME;
			a.click();
			URL.revokeObjectURL(url);
		});
		const importFile = document.getElementById("import-file");
		document.getElementById("import-json").addEventListener("click", () => importFile.click());
		importFile.addEventListener("change", async () => {
			const file = importFile.files[0];
			if (!file) return;
			notes = normalizeImported(JSON.parse(await file.text()));
			render();
			persist();
			importFile.value = "";
		});
		document.getElementById("clear-notes").addEventListener("click", () => {
			if (!confirm("Clear all locally saved validation notes?")) return;
			notes = cloneSeed();
			render();
			localStorage.removeItem(STORAGE_KEY);
			statusEl.textContent = "Local notes cleared.";
		});
		render();
	</script>
</body>
</html>
`;

const main = () => {
	const save = readSave(savePath);
	fs.mkdirSync(artifactsDir, { recursive: true });
	const anchorTargets = readJsonIfExists(
		artifactAnchorsPath,
		readJsonIfExists(anchorsPath, []),
	);
	const anchorPids = new Set(anchorTargets.map((target) => target.pid));
	const eligibleEntries = save.players
		.filter((p) => {
			const ratings = p.ratings?.at(-1);
			return (
				p.tid >= -1 &&
				ratings?.season === save.gameAttributes.season &&
				!anchorPids.has(p.pid)
			);
		})
		.map((p) => ({
			key: `validation20-${p.pid}`,
			pid: p.pid,
			note: "",
		}));

	const { attrs, rows } = buildProxyRows({
		root,
		save,
		anchorEntries: eligibleEntries,
	});
	const selectedRows = addDebugModel(pickBucketRows(rows), attrs).map(
		(row, index) => ({
			...row,
			caseId: `V20-${String(index + 1).padStart(2, "0")}`,
		}),
	);

	const csvColumns = [
		"caseId",
		"validationBucket",
		"validationBucketLabel",
		"validationBucketReason",
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
		"generatedSkills",
		"skill_3_margin",
		"skill_Ps_margin",
		"skill_R_margin",
		"skill_Di_margin",
		"skill_Dp_margin",
		"skill_A_margin",
		"debugModelTier",
		"debugModelRangeText",
		"debugModelReason",
	];

	writeCsv(candidatesCsvPath, selectedRows, csvColumns);
	fs.writeFileSync(reviewBlindHtmlPath, buildHtml(selectedRows, { debug: false }));
	fs.writeFileSync(reviewDebugHtmlPath, buildHtml(selectedRows, { debug: true }));

	const notesTemplate = notesSeed(selectedRows);
	fs.writeFileSync(
		notesTemplatePath,
		`${JSON.stringify(notesTemplate, null, "\t")}\n`,
	);

	const reportRows = selectedRows.map((row) => ({
		bucket: row.validationBucketLabel,
		player: `${row.name} (${row.pid})`,
		reason: row.validationBucketReason,
	}));
	console.log(markdownTable(reportRows, [
		{ key: "bucket", label: "bucket" },
		{ key: "player", label: "player" },
		{ key: "reason", label: "why selected" },
	]));
	console.log(`Wrote ${path.relative(root, candidatesCsvPath)}`);
	console.log(`Wrote ${path.relative(root, reviewBlindHtmlPath)}`);
	console.log(`Wrote ${path.relative(root, reviewDebugHtmlPath)}`);
	console.log(`Wrote ${path.relative(root, notesTemplatePath)}`);
	console.log(
		`Human review export should be saved as ${path.relative(root, validationHumanNotesPath)}`,
	);
};

main();
