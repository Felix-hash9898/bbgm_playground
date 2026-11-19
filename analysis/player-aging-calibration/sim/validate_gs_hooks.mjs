// Round 13.1: validate the GameSim research-arm bookkeeping of one full-league output. Exit 1 on failure.
// usage: node validate_gs_hooks.mjs <full__*.json.gz> <gamesim_hooks.jsonl | -> <expected gs arm or ""> <expectedYears>
// GameSim arm: one hook record per simulated season (file gsLog AND the jsonl), seasons start..start+years-1, candidate
//   three-point calls > 0 every season, production fallbacks (late signings) < 5% of calls, prepared players >= 360,
//   anchor constant finite in (0.5, 2) and exactly 1 in the start season (anchor3rel); era factor = file's season factor.
// Control (""): the file says gs null, has no hook records, and the jsonl (if given) has no line for this arm / seed.
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const [file, hooks, gsArg, yearsArg] = process.argv.slice(2);
const years = Number(yearsArg);
const d = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
const lines = hooks && hooks !== "-" && existsSync(hooks)
	? readFileSync(hooks, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.arm === d.arm && l.seed === d.seed && l.gs === (gsArg || undefined))
	: [];
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
if (!gsArg) {
	check("control: file gs null", d.gs === null || d.gs === undefined, `gs=${d.gs}`);
	check("control: no hook records in file", !d.gsLog || d.gsLog.length === 0, `gsLog=${d.gsLog?.length}`);
} else {
	const L = d.gsLog ?? [];
	check("file gs arm", d.gs === gsArg, `gs=${d.gs}`);
	check("one hook record per season (file)", L.length === years, `gsLog=${L.length}`);
	check("one hook record per season (jsonl)", lines.length === years, `jsonl=${lines.length}`);
	check("hook seasons", L.every((x, i) => x.season === d.start + i), L.map((x) => x.season).join(","));
	for (const x of L) {
		const c = x.calls ?? {};
		const miss = (c.three_missing ?? 0) / Math.max(1, c.three ?? 0);
		check(`${x.season}: candidate three calls > 0`, c.three > 0, `three=${c.three}`);
		check(`${x.season}: production fallback < 5%`, miss < 0.05, `three_missing=${c.three_missing ?? 0} (${(100 * miss).toFixed(2)}%)`);
		check(`${x.season}: prepared players >= 360`, x.prepared >= 360, `prepared=${x.prepared}`);
		check(`${x.season}: era factor in (0, 1.5]`, x.factor > 0 && x.factor <= 1.5, `factor=${x.factor}`);
		if (c.anchor_c !== undefined) {
			check(`${x.season}: anchor constant in (0.5, 2)`, c.anchor_c > 0.5 && c.anchor_c < 2, `anchor_c=${c.anchor_c}`);
			if (x.season === d.start) check(`${x.season}: anchor constant 1 in the start season`, Math.abs(c.anchor_c - 1) < 1e-9, `anchor_c=${c.anchor_c}`);
		}
	}
}
const ok = checks.every((c) => c.ok);
for (const c of checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}: ${c.detail}`);
console.log(JSON.stringify({ file, gs: gsArg || null, ok }));
if (!ok) process.exit(1);
