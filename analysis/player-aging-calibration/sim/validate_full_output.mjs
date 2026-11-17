// Validate a full-league output file (memory + Auto Play correctness). Exit 1 on failure.
// usage: node validate_full_output.mjs <full__*.json.gz> <progress.jsonl> <expectedYears> <heapLimitMB>
import { readFileSync, appendFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const [file, progress, yearsArg, heapArg] = process.argv.slice(2);
const years = Number(yearsArg);
const heapLimit = Number(heapArg);
const d = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
const prog = readFileSync(progress, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const start = d.start;
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

check("formula swap self-test passed", d.selfTest?.ok === true, JSON.stringify(d.selfTest ?? null));
check("years in file", d.years === years && d.timings.length === years, `years=${d.years} timings=${d.timings.length}`);
check("timing seasons", d.timings.every((t, i) => t.season === start + 1 + i), d.timings.map((t) => t.season).join(","));
const maxHeap = Math.max(...prog.map((p) => p.heapMB ?? 0));
check("heap below limit with margin", maxHeap < 0.75 * heapLimit, `max heapUsed ${maxHeap} MB (limit ${heapLimit})`);
const heaps = prog.map((p) => p.heapMB);
check("post-GC heap not growing season over season", heaps.length < 2 || heaps.at(-1) < 1.5 * heaps[0] + 300, `post-GC heap by season: ${heaps.join(", ")} MB; transactions before prune: ${prog.map((p) => p.maxTransactionsBeforePrune).join(", ")}`);
check("historical salary environment (real season gameAttributes applied)", d.settingsUsed && d.settingsUsed.salaryCap < 80000,
	`salaryCap=${d.settingsUsed?.salaryCap} minContract=${d.settingsUsed?.minContract} maxContract=${d.settingsUsed?.maxContract}`);
const gpBySeason = {};
for (const p of d.players) {
	for (const s of p.stats) {
		gpBySeason[s.season] = (gpBySeason[s.season] ?? 0) + s.gp;
	}
}
for (let s = start; s < start + years; s++) {
	check(`regular season ${s} played`, (gpBySeason[s] ?? 0) > 20000, `sum gp ${gpBySeason[s] ?? 0}`);
}
const lastPre = start + years;
const withNewRatings = d.players.filter((p) => p.tid >= -1 && p.ratings.some((r) => r.season === lastPre)).length;
check(`preseason ${lastPre} development ran`, withNewRatings > 400, `${withNewRatings} active players with ${lastPre} ratings`);
const rookies = d.players.filter((p) => p.draft.year >= start && p.draft.year < start + years - 0 && p.stats.some((s) => s.season === p.draft.year + 1 && s.gp > 0)).length;
check("draft classes entered and played", rookies > 30, `${rookies} drafted players with games the next season`);
const retired = d.players.filter((p) => p.retiredYear !== null && p.retiredYear >= start && p.retiredYear < start + years).length;
check("retirements happened", retired > 10, `${retired} retirements in window`);
// offseason team changes: last stats row of season s vs first row of season s+1 (user saves: 16-28% per offseason)
let moved = 0;
let cont = 0;
for (const p of d.players) {
	for (let s = start; s < start + years - 1; s++) {
		const a = p.stats.filter((x) => x.season === s);
		const b = p.stats.filter((x) => x.season === s + 1);
		if (a.length && b.length) {
			cont++;
			moved += a.at(-1).tid !== b[0].tid ? 1 : 0;
		}
	}
}
check("offseason team changes (FA/trades) >= 8% of continuing players", years < 2 || moved >= 0.08 * cont, `${moved}/${cont}`);
// rotation players left unsigned: 1000+ min in season s, 0 min in s+1, not retired (user saves: 0.7-1.3%)
let rot = 0;
let idle = 0;
for (const p of d.players) {
	for (let s = start; s < start + years - 1; s++) {
		const m0 = p.stats.filter((x) => x.season === s).reduce((a, x) => a + x.min, 0);
		const m1 = p.stats.filter((x) => x.season === s + 1).reduce((a, x) => a + x.min, 0);
		if (m0 >= 1000) {
			rot++;
			idle += m1 === 0 && !(p.retiredYear !== null && p.retiredYear <= s + 1) ? 1 : 0;
		}
	}
}
check("rotation players not left unsigned (< 5%)", years < 2 || idle < 0.05 * rot, `${idle}/${rot}`);
const inj = d.players.reduce((a, p) => a + p.injuries.filter((i) => i.season >= start).length, 0);
check("injuries recorded", inj > 100, `${inj} injuries`);
const lossRows = d.players.reduce((a, p) => a + p.injuries.filter((i) => i.season >= start && i.ovrDrop > 0).length, 0);
check("permanent injury losses observed (informational)", true, `${lossRows} injuries with ovrDrop > 0`);

const failed = checks.filter((c) => !c.ok);
const lines = [`### ${file.split("/").pop()}`, "| check | ok | detail |", "|---|---|---|",
	...checks.map((c) => `| ${c.name} | ${c.ok ? "yes" : "**NO**"} | ${c.detail} |`)];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n\n`);
}
process.exit(failed.length ? 1 : 0);
