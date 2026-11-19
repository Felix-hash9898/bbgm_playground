// Round 13.1 preflight for the modern open-league workflow (aging-calibration-r13m). Exit 1 on failure.
// usage (repo root): node analysis/player-aging-calibration/sim/check_r13m_overlay.mjs <gs arm>[,<gs arm>...]
// 1. every research module reachable from full_league.test.ts and r5.config.ts (static AND dynamic relative imports,
//    JSON included) exists inside analysis/player-aging-calibration -> the overlay cannot silently miss a file;
// 2. every GameSim / loadTeams replacement of r5.config.ts matches the product source exactly once;
// 3. the requested GameSim arms exist in sim/formulas/r5_arms.json.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const R = "analysis/player-aging-calibration";
const arms = (process.argv[2] ?? "").split(",").filter(Boolean);
const fails = [];
const seen = new Set();
const walk = (file) => {
	if (seen.has(file)) return;
	seen.add(file);
	if (!existsSync(file)) { fails.push(`missing module ${file}`); return; }
	if (!/\.(ts|mjs|js)$/.test(file)) return;
	const src = readFileSync(file, "utf8");
	const re = /(?:import\s[^"']*?from\s*|import\s*\(\s*|^import\s*)["'](\.{1,2}\/[^"']+)["']/gm;
	for (const m of src.matchAll(re)) {
		const target = path.normalize(path.join(path.dirname(file), m[1]));
		if (target.startsWith(R)) walk(target); // product (src/) imports come from the branch base
	}
	// data files read next to the module at run time (candidates.ts / v9.ts spec files)
	for (const m of src.matchAll(/path\.join\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\),\s*"([^"]+)"\)/g)) walk(path.join(path.dirname(file), m[1]));
};
walk(`${R}/sim/full_league.test.ts`);
walk(`${R}/sim/r5.config.ts`);
walk(`${R}/sim/validate_full_output.mjs`);
walk(`${R}/sim/validate_gs_hooks.mjs`);

const cfg = readFileSync(`${R}/sim/r5.config.ts`, "utf8");
const block = cfg.slice(cfg.indexOf("const replacements"), cfg.indexOf("];\n\n// round 6") + 2).replace(/^const replacements: \[string, string\]\[\] = /, "");
const reps = new Function(`return ${block}`)();
const gs = readFileSync("src/worker/core/GameSim.basketball/index.ts", "utf8");
for (const [before] of reps) {
	const n = gs.split(before).length - 1;
	if (n !== 1) fails.push(`GameSim anchor matched ${n}x: ${JSON.stringify(before.slice(0, 60))}`);
}
const lt = readFileSync("src/worker/core/game/loadTeams.ts", "utf8");
if (lt.split("p2.compositeRating.usage = p2.compositeRating.usage ** 1.9;").length !== 2) fails.push("loadTeams usage anchor");
if (reps.length !== 10) fails.push(`expected 10 GameSim replacements, found ${reps.length}`);

const A = JSON.parse(readFileSync(`${R}/sim/formulas/r5_arms.json`, "utf8"));
for (const a of arms) if (!A[a]) fails.push(`unknown GameSim arm ${a}`);

const local = [...seen].filter((f) => f.startsWith(R)).sort();
console.log(JSON.stringify({ modules: local.length, files: local, replacements: reps.length, arms, ok: fails.length === 0, fails }, null, 1));
if (fails.length) process.exit(1);
