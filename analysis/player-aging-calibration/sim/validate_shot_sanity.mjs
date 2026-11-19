// R13-M: harness sanity of the league shot structure in every simulated season of one full-league output (exit 1 on
// failure).  Wide bounds that only catch a broken research hook (e.g. NaN two-point mix -> every two-pointer midRange,
// cloud smoke run 44560536244 season 2: mid 0.999, FT rate 0.095, TS 0.463); NOT a research criterion.
// usage: node validate_shot_sanity.mjs <full__*.json.gz>
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const d = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString("utf8"));
const K = ["fga", "tpa", "fta", "pts", "fgaAtRim", "fgaLowPost", "fgaMidRange"];
const by = new Map();
for (const p of d.players) for (const s of p.stats) {
	if (s.playoffs || s.season < d.start) continue;
	const t = by.get(s.season) ?? Object.fromEntries(K.map((k) => [k, 0]));
	for (const k of K) t[k] += s[k] ?? 0;
	by.set(s.season, t);
}
const bounds = { tpar: [0.05, 0.6], rim: [0.05, 0.8], post: [0.03, 0.6], mid: [0.05, 0.8], ftr: [0.15, 0.45], ts: [0.48, 0.65] };
const rows = [], fails = [];
for (const [season, t] of [...by.entries()].sort((a, b) => a[0] - b[0])) {
	const two = t.fgaAtRim + t.fgaLowPost + t.fgaMidRange;
	const r = { season, tpar: t.tpa / t.fga, rim: t.fgaAtRim / two, post: t.fgaLowPost / two, mid: t.fgaMidRange / two, ftr: t.fta / t.fga, ts: t.pts / (2 * (t.fga + 0.44 * t.fta)) };
	for (const [k, [lo, hi]] of Object.entries(bounds)) if (!(r[k] >= lo && r[k] <= hi)) fails.push(`${season} ${k}=${r[k]}`);
	rows.push(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "season" ? v : +v.toFixed(3)])));
}
if (rows.length !== d.years) fails.push(`seasons ${rows.length} != years ${d.years}`);
console.log(JSON.stringify({ file: process.argv[2].split("/").at(-1), rows, ok: fails.length === 0, fails }));
if (fails.length) process.exit(1);
