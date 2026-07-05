#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { csvParse } from "d3-dsv";
import { money, pct, readSave, round } from "./contract-market-proxy-core.mjs";

const root = process.cwd();
const savePath = path.join(
	root,
	"real_saves/BBGM_League_3_2025_re_sign_players.json.gz",
);
const candidatesCsvPath = path.join(
	root,
	"contract_market_artifacts/contract_market_validation20_candidates.csv",
);
const reviewBlindHtmlPath = path.join(
	root,
	"contract_market_artifacts/contract_market_validation20_review_blind.html",
);
const reviewDebugHtmlPath = path.join(
	root,
	"contract_market_artifacts/contract_market_validation20_review_debug.html",
);
const notesTemplatePath = path.join(
	root,
	"contract_market_artifacts/contract_market_validation20_notes_template.json",
);
const validationHumanNotesPath = path.join(
	root,
	"temp/contract_market_validation20_human_notes.json",
);

const bucketDefinitions = [
	{
		key: "max_near_max_high_star",
		label: "Max / near-max / high-star candidate",
	},
	{
		key: "young_proven_young_starter",
		label: "Young proven / young starter candidate",
	},
	{
		key: "low_end_starter_good_rotation",
		label: "Low-end starter / good rotation candidate",
	},
	{
		key: "specialist_low_rotation",
		label: "Specialist / low rotation candidate",
	},
	{
		key: "veteran_minimum_fringe_negative",
		label: "Veteran minimum / fringe / negative candidate",
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

const toneForRating = (value) => {
	const parsed = num(value);
	if (!Number.isFinite(parsed)) return "low";
	if (parsed >= 75) return "good";
	if (parsed >= 55) return "mid";
	return "low";
};

const teamLabelByTid = (teamsByTid, tid) => {
	if (!Number.isFinite(tid) || tid < 0) {
		return "Free Agent";
	}
	const team = teamsByTid.get(tid);
	return team?.abbrev ?? team?.name ?? `T${tid}`;
};

const latestRegularSeasonStats = (player) =>
	player.stats?.filter((row) => !row.playoffs)?.at(-1) ?? null;

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

const notesSeed = (rows) =>
	Object.fromEntries(
		rows.map((row) => {
			const pid = num(row.pid);
			return [
				`validation20-${pid}`,
				{
					caseId: row.caseId,
					pid,
					humanTargetTier: "",
					humanAmountRangeM: "",
					humanYears: "",
					humanNotes: "",
				},
			];
		}),
	);

const normalizeImported = (data, seedNotes) => {
	const next = JSON.parse(JSON.stringify(seedNotes));
	const applyRecord = (key, value) => {
		if (!next[key]) return;
		const base = next[key];
		next[key] = {
			...base,
			caseId: value?.caseId ?? base.caseId,
			pid: num(value?.pid ?? base.pid),
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
					: `validation20-${num(value.pid)}`;
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
					: `validation20-${num(data.pid)}`;
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
					)}">${htmlEscape(display)}</td></tr>`;
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
	const player = row.player;
	const ratings = player?.ratings?.at(-1) ?? {};
	const identityLine = debug
		? `${htmlEscape(row.name)} <small>pid ${row.pid} · Case ${htmlEscape(
				row.caseId,
			)}</small>`
		: `Case ${htmlEscape(row.caseId)} <small>${htmlEscape(
				row.validationBucketLabel,
			)}</small>`;
	const bucketPill = debug
		? row.validationBucketLabel
		: row.validationBucketLabel;
	const team = row.teamLabel;
	const awards = renderAwardsPanel(row.awardGroups);

	return `<article class="card" id="${htmlEscape(row.caseId)}" data-case-id="${htmlEscape(
		row.caseId,
	)}" data-note-key="${htmlEscape(row.noteKey)}" data-bucket="${htmlEscape(row.validationBucket)}">
		<div class="title-row">
			<div>
				<h3>${identityLine}</h3>
				<div class="muted">${htmlEscape(
					debug
						? `${row.validationBucketLabel} · ${row.validationBucketReason}`
						: row.validationBucketLabel,
				)}</div>
			</div>
			<div class="verdict">${htmlEscape(bucketPill)}</div>
		</div>

		<div class="pill-grid">
			${[
				[
					"Contract",
					`${money(num(row.normalNoOptionContractAmount))} / ${htmlEscape(
						row.normalNoOptionContractYears,
					)}y`,
				],
				["OVR/POT", `${ratings.ovr ?? "--"}/${ratings.pot ?? "--"}`],
				["Age / Pos", `${htmlEscape(row.age)} / ${htmlEscape(row.pos)}`],
				["Team", team],
				[
					"PTS/TRB/AST",
					`${displayNumber(row.PTS, 1)} / ${displayNumber(row.TRB, 1)} / ${displayNumber(
						row.AST,
						1,
					)}`,
				],
				[
					"MPG / PER",
					`${displayNumber(row.MPG, 1)} / ${displayNumber(row.PER, 1)}`,
				],
				[
					"TS% / BPM / EWA",
					`${pct(num(row.TS))} / ${displayNumber(row.BPM, 1)} / ${displayNumber(
						row.EWA,
						1,
					)}`,
				],
				[
					"Value / ValueNoPot",
					`${displayNumber(row.value, 1)} / ${displayNumber(row.valueNoPot, 1)}`,
				],
				[
					"Demand / Eligible Max",
					`${money(num(row.estimatedDemandNoRandom))} / ${money(num(row.eligibleMax))}`,
				],
			]
				.map(
					([label, value]) =>
						`<div class="pill${label === "Contract" ? " primary" : ""}"><span>${htmlEscape(
							label,
						)}</span><b>${htmlEscape(value)}</b></div>`,
				)
				.join("")}
		</div>

		<details class="why" open>
			<summary>Selection rationale</summary>
			<p>${htmlEscape(row.validationBucketReason)}</p>
		</details>

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
			${awards}
		</details>

		${
			debug
				? `<details class="extra"><summary>Model internals / debug</summary>
			<div class="debug-grid">
				<div><span>Case</span><b>${htmlEscape(row.caseId)}</b></div>
				<div><span>pid</span><b>${row.pid}</b></div>
				<div><span>Bucket</span><b>${htmlEscape(row.validationBucketLabel)}</b></div>
				<div><span>Debug tier</span><b>${htmlEscape(row.debugModelTier)}</b></div>
				<div><span>Debug range</span><b>${htmlEscape(row.debugModelRangeText)}</b></div>
				<div><span>Eligible Max</span><b>${money(num(row.eligibleMax))}</b></div>
				<div><span>Normal contract</span><b>${money(num(row.normalNoOptionContractAmount))} / ${htmlEscape(
					row.normalNoOptionContractYears,
				)}y</b></div>
				<div><span>ContractValue</span><b>${displayNumber(row.getContractValue, 1)}</b></div>
				<div><span>Value / ValueNoPot</span><b>${displayNumber(row.value, 1)} / ${displayNumber(
					row.valueNoPot,
					1,
				)}</b></div>
			</div>
			<p class="debug-reason">${htmlEscape(row.debugModelReason)}</p>
			<div class="subhead">Composite ratings</div>
			${renderDebugComposite(row)}
			<div class="subhead">Skill margins</div>
			<p class="skills">${htmlEscape(
				`3: ${displayNumber(row.skill_3_margin, 3)} | Ps: ${displayNumber(
					row.skill_Ps_margin,
					3,
				)} | R: ${displayNumber(row.skill_R_margin, 3)} | Di: ${displayNumber(
					row.skill_Di_margin,
					3,
				)} | Dp: ${displayNumber(row.skill_Dp_margin, 3)} | A: ${displayNumber(
					row.skill_A_margin,
					3,
				)}`,
			)}</p>
			<p class="skills">Generated skills: ${htmlEscape(row.generatedSkills || "none")}</p>
		</details>`
				: ""
		}

		<section class="review">
			<div class="review-grid">
				<label class="review-field">
					<span>humanTargetTier</span>
					<input type="text" data-field="humanTargetTier" data-note-key="${htmlEscape(
						row.noteKey,
					)}" placeholder="e.g. max / starter / minimum" />
				</label>
				<label class="review-field">
					<span>humanAmountRangeM</span>
					<input type="text" data-field="humanAmountRangeM" data-note-key="${htmlEscape(
						row.noteKey,
					)}" placeholder="e.g. 10-14" />
				</label>
				<label class="review-field">
					<span>humanYears</span>
					<input type="text" data-field="humanYears" data-note-key="${htmlEscape(
						row.noteKey,
					)}" placeholder="e.g. 3" />
				</label>
			</div>
			<label class="note-label" for="note-${htmlEscape(row.caseId)}">humanNotes</label>
			<textarea id="note-${htmlEscape(row.caseId)}" data-field="humanNotes" data-note-key="${htmlEscape(
				row.noteKey,
			)}" rows="4" placeholder="Tier, amount range, years, rationale"></textarea>
		</section>
	</article>`;
};

const buildClientScript = ({ storageKey, seedNotes }) => `
(function () {
	const STORAGE_KEY = ${JSON.stringify(storageKey)};
	const EXPORT_FILENAME = "contract_market_validation20_human_notes.json";
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
				pid: Number.isFinite(Number(value?.pid ?? base.pid))
					? Number(value?.pid ?? base.pid)
					: base.pid,
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
						: "validation20-" + Number(value.pid);
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
						: "validation20-" + Number(data.pid);
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

	const keyForField = (field) => field.dataset.noteKey;
	const fieldNameForField = (field) => field.dataset.field;

	const render = () => {
		for (const field of fields) {
			const key = keyForField(field);
			const fieldName = fieldNameForField(field);
			field.value = notes[key]?.[fieldName] ?? "";
		}
	};

	const persist = () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
		statusEl.textContent = "Saved locally " + new Date().toLocaleTimeString();
	};

	for (const field of fields) {
		field.addEventListener("input", () => {
			const key = keyForField(field);
			const fieldName = fieldNameForField(field);
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
		if (!confirm("Clear all locally saved validation notes?")) return;
		notes = cloneSeed();
		render();
		localStorage.removeItem(STORAGE_KEY);
		statusEl.textContent = "Local notes cleared.";
	});

	render();
})();
`;

const buildHtml = (rows, { debug, save }) => {
	const storageKey = `bbgm.contractMarket.validation20.${debug ? "debug" : "blind"}.notes`;
	const seedNotes = notesSeed(rows);

	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BBGM Contract Review Validation 20 ${debug ? "Debug" : "Blind"}</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#172033;--muted:#667085;--line:#e5e7eb;--soft:#f8fafc;--blue:#eef4ff;--green:#ecfdf3;--red:#fef3f2;}
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
		<h1>BBGM Contract Review Sample v3${debug ? " Debug" : ""}</h1>
		<p>Season ${save.gameAttributes.season}, phase ${save.gameAttributes.phase} re-sign players, salary cap ${money(save.gameAttributes.salaryCap)}</p>
		<p>合同显示为 normal/no-option comparison，避免 PO/TO 名义价格混淆。Blind 版隐藏真实身份，debug 版只在折叠区展示模型内部信息。</p>
	</header>
	<main>
		<div class="toolbar">
			<button type="button" id="export-json">Export JSON</button>
			<button type="button" id="import-json">Import JSON</button>
			<button type="button" id="clear-notes">Clear local notes</button>
			<input type="file" id="import-file" accept="application/json,.json" hidden />
			<span id="save-status">Notes autosave locally.</span>
	</div>
		<div class="notice"><b>这版改动：</b>完全沿用 v3 的卡片结构和保存体验，只把数据源替换为 validation20 的 20 个 case；awards 默认按年份分组展示，blind 版不直接暴露真实姓名和 pid。</div>
		${bucketDefinitions
			.map((bucket) => {
				const bucketRows = rows.filter(
					(row) => row.validationBucket === bucket.key,
				);
				return `<section class="section" id="${htmlEscape(bucket.key)}">
					<h2>${htmlEscape(bucket.label)} <small>4 cases</small></h2>
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

const loadCandidateRows = () => {
	const csv = fs.readFileSync(candidatesCsvPath, "utf8");
	const rows = csvParse(csv);
	if (rows.length !== 20) {
		throw new Error(`Expected 20 validation rows, found ${rows.length}`);
	}
	const bucketCounts = Object.fromEntries(
		bucketDefinitions.map((bucket) => [bucket.key, 0]),
	);
	for (const row of rows) {
		if (!(row.validationBucket in bucketCounts)) {
			throw new Error(`Unexpected validation bucket ${row.validationBucket}`);
		}
		bucketCounts[row.validationBucket] += 1;
	}
	for (const [bucket, count] of Object.entries(bucketCounts)) {
		if (count !== 4) {
			throw new Error(`Bucket ${bucket} expected 4 cases, found ${count}`);
		}
	}
	return rows;
};

const enrichRows = (rows, save) => {
	const playersByPid = new Map(
		save.players.map((player) => [player.pid, player]),
	);
	const teamsByTid = new Map(
		(save.teams ?? []).map((team) => [team.tid, team]),
	);

	return rows.map((row) => {
		const pid = num(row.pid);
		const player = playersByPid.get(pid);
		if (!player) {
			throw new Error(`Missing player pid ${pid} for ${row.caseId}`);
		}
		return {
			...row,
			pid,
			player,
			noteKey: `validation20-${pid}`,
			teamLabel: teamLabelByTid(teamsByTid, player.tid),
			awardGroups: groupedAwards(player.awards),
		};
	});
};

const writeNotesTemplate = (rows) => {
	const template = notesSeed(rows);
	fs.writeFileSync(
		notesTemplatePath,
		`${JSON.stringify(template, null, "\t")}\n`,
	);
};

const main = () => {
	const save = readSave(savePath);
	const rows = enrichRows(loadCandidateRows(), save);
	fs.mkdirSync(path.dirname(reviewBlindHtmlPath), { recursive: true });

	fs.writeFileSync(
		reviewBlindHtmlPath,
		buildHtml(rows, { debug: false, save }),
	);
	fs.writeFileSync(reviewDebugHtmlPath, buildHtml(rows, { debug: true, save }));
	writeNotesTemplate(rows);

	console.log(
		`Using candidate template: ${path.relative(root, candidatesCsvPath)}`,
	);
	console.log(`Wrote ${path.relative(root, reviewBlindHtmlPath)}`);
	console.log(`Wrote ${path.relative(root, reviewDebugHtmlPath)}`);
	console.log(`Wrote ${path.relative(root, notesTemplatePath)}`);
	console.log(
		`Human review export should be saved as ${path.relative(
			root,
			validationHumanNotesPath,
		)}`,
	);
};

main();
