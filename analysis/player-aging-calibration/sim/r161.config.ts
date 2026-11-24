// In-memory probes on the frozen R16 worker. The trace branch does not consume randomness.
import config from "./r5.config.ts";
import type { Plugin } from "vite";

const trace: Record<string, [string, string][]> = {
	"contracts/contractOptionDecisions.ts": [
		["if (exercise) {\n\t\t\tawait exerciseOption(p);", 'globalThis.r161Trace?.("option", p, { option, marketDemand, exercise });\nif (exercise) {\n\t\t\tawait exerciseOption(p);'],
	],
	"phase/newPhaseResignPlayers.ts": [
		["const mood = await player.moodInfo(p, p.tid, {", 'globalThis.r161Trace?.("renewAsk", p, { payroll, cap: signingContext.salaryCap, draftPick });\nconst mood = await player.moodInfo(p, p.tid, {'],
		["if (!mood.willing) {", 'globalThis.r161Trace?.("renewMood", p, { mood });\nif (!mood.willing) {'],
		["const dv = await team.valueChange(p.tid, [], [p.pid], [], []);", 'const dv = await team.valueChange(p.tid, [], [p.pid], [], []);\nglobalThis.r161Trace?.("renewValue", p, { dv });'],
		["if (!reSignPlayer) {\n\t\t\t\tdelete", 'globalThis.r161Trace?.("renewOutcome", p, { reSignPlayer });\nif (!reSignPlayer) {\n\t\t\t\tdelete'],
	],
	"freeAgents/autoSign.ts": [
		["const context = captureSigningContext();", "const context = captureSigningContext();\nawait globalThis.r161CaptureMarket?.(context);"],
		["const p = quote && playersSortedForTeam.find((p) => p.pid === quote.pid);", `const p = quote && playersSortedForTeam.find((p) => p.pid === quote.pid);
if (globalThis.r161Trace) for (const target of playersSortedForTeam) {
	if (!globalThis.r161Trace("watches", target)) continue;
	const q = quotes.find(x => x.pid === target.pid);
	const bird = hasDesignatedVeteranContractRights(target, t.tid);
	globalThis.r161Trace("teamQuote", target, { tid: t.tid, payroll, cap: context.salaryCap,
		mleUsed: t.midLevelExceptionUsedSeason === context.mleSeason, roster: standardPlayersOnRoster.length,
		bird, quote: q?.contract, exception: q && getContractException({
			birdException: bird, contract: q.contract, p: q, payroll, team: t,
		}).type, selected: quote?.srID ?? quote?.pid, rankOnBoard: playersSortedForTeam.indexOf(target),
		rankOnQuotedBoard: q ? quotes.indexOf(q) : -1 });
}`],
		["if (!mleContract) {", 'globalThis.r161Trace?.("mleQuote", p2, { tid: t.tid, payroll, mleContract, mleUsed: t.midLevelExceptionUsedSeason === context.mleSeason });\nif (!mleContract) {'],
		["return result.player;", 'globalThis.r161Trace?.("sign", p, { tid, contract, exception: expectedContractException });\nreturn result.player;'],
	],
	"freeAgents/decreaseDemands.ts": [
		["p.numDaysFreeAgent += 1;", 'p.numDaysFreeAgent += 1;\nglobalThis.r161Trace?.("askDecay", p, { minimum: playerMinimum });'],
	],
	"player/addToFreeAgents.ts": [
		["if (p.tid >= 0) {", 'globalThis.r161Trace?.("toFA", p);\nif (p.tid >= 0) {'],
	],
	"phase/newPhaseBeforeDraft.ts": [
		["if (await player.shouldRetire(p)) {", 'const r161Retire = await player.shouldRetire(p);\nglobalThis.r161Trace?.("retireCheck", p, { retire: r161Retire });\nif (r161Retire) {'],
	],
};

const instrumentation = {
	name: "r161-frozen-market-observation",
	enforce: "pre",
	transform(code, id) {
		if (id.endsWith("/sim/full_league.test.ts")) {
			const anchor = "await loadProduct(ARM);";
			if (code.split(anchor).length !== 2) throw new Error("R16.1 full-league trace entry");
			let transformed = code.replace(anchor,
				anchor + '\nglobalThis.r161ReadRng = () => rngState;\nawait import("./r161_market_trace.ts");\nif (process.env.R161_OPEN === "1") await import("./r161_open_output.ts");');
			const resolve = "r5.resolveR5Arm(GS, factor)";
			const prepare = "const calls: Record<string, number> = {};";
			if (transformed.split(resolve).length !== 2 || transformed.split(prepare).length !== 2) throw new Error("R16.1 full-league style anchors");
			transformed = transformed.replace(resolve, 'r5.resolveR5Arm(GS === "r161_adapt" ? "r16_midrange" : GS, factor)')
				.replace(prepare, `if (GS === "r161_adapt") {
					const { applyStyleResponse } = await import("./r161_style.ts");
					const before = globalThis.r161OpenStyle && new Map([...prepared].map(([pid, x]) => [pid, x.three]));
					r161Previous = applyStyleResponse(all, prepared, r161Previous, season, factor);
					if (before) {
						const adjusted = [...prepared].filter(([pid, x]) => Math.abs((x.three ?? 0) - (before.get(pid) ?? 0)) > 1e-9).length;
						globalThis.r161OpenStyle(season, factor, adjusted);
					}
				}
				${prepare}`);
			const snapshot = 'async function preseasonSnapshot() {\n\tconst season = g.get("season");';
			if (transformed.split(snapshot).length !== 2) throw new Error("R16.1 payroll snapshot entry");
			transformed = transformed.replace(snapshot, snapshot + "\nawait globalThis.r161OpenPayroll?.(season);");
			return 'let r161Previous: import("./r161_style.ts").StyleMemory | undefined;\n' + transformed;
		}
		if (id.endsWith("/sim/aging_arms.test.ts") && process.env.R161_STYLE_TEST === "1") {
			const label = "async function roundSix() {";
			const read = 'const arm = resolveR5Arm(armName, factor)!;';
			const cycle = "const choiceLog = new Map<number, number[]>();";
			const clear = "const rows = [header.join(\",\")];";
			const at = code.indexOf(label);
			if (at < 0) throw new Error("R16.1 style test entry");
			const head = code.slice(0, at);
			let body = code.slice(at);
			for (const [anchor, repl] of [
				[label, label + '\nR5_ARMS.r161_adapt = R5_ARMS.r16_midrange;\nR5_ARMS.r161_playground = R5_ARMS.unchanged;'],
				[clear, clear + "\nlet r161Previous: StyleMemory | undefined;"],
				['FORMULAS[devArm]!;', 'FORMULAS[armName === "r161_playground" ? "playground" : devArm]!;'],
				[read, 'const arm = resolveR5Arm(armName === "r161_adapt" ? "r16_midrange" : armName, factor)!;'],
				[cycle, 'if (armName === "r161_adapt") r161Previous = applyStyleResponse(players, prepared, r161Previous, vseason, factor);\n' + cycle],
			]) {
				if (body.split(anchor).length !== 2) throw new Error(`R16.1 fixed-roster style anchor: ${anchor}`);
				body = body.replace(anchor, repl);
			}
			return 'import { applyStyleResponse, type StyleMemory } from "./r161_style.ts";\n' + head + body;
		}
		for (const [file, edits] of Object.entries(trace)) {
			if (!id.endsWith("/src/worker/core/" + file)) continue;
			for (const [before, after] of edits) {
				if (code.split(before).length !== 2) throw new Error(`R16.1 market trace anchor: ${file}: ${before}`);
				code = code.replace(before, after);
			}
			if (file === "freeAgents/autoSign.ts" && (process.env.R161_MARKET_TEST === "1" || process.env.R161_RETURN_MARKET === "1")) {
				const rights = /hasDesignatedVeteranContractRights\((p|target|currentPlayer), (tid|t\.tid)\)/g;
				const matches = [...code.matchAll(rights)].length;
				if (matches !== 6) throw new Error(`R16.1 market quote/validation anchors: ${matches}`);
				code = code.replace(rights, "r161Bird($1, $2)");
				const gate = "let playersSortedForTeam = playersSorted;";
				if (code.split(gate).length !== 2) throw new Error("R16.1 team market gate");
				const enabled = process.env.R161_RETURN_MARKET === "1" ? "true" : 'globalThis.r161MarketArm === "incumbent"';
				code = code.replace(gate, `if (${enabled}) {
					for (const prospect of playersSorted) {
						if (prospect.priorContractTid !== t.tid || prospect.numDaysFreeAgent < 14) continue;
						const check = await incumbentReturn(prospect, t.tid, playersOnRoster, context);
						globalThis.r161MarketChecks?.(prospect, t.tid, payroll, check);
						if (check.eligible) r161Returns.add(prospect.pid);
					}
				}
				${gate}`);
				const capture = "const context = captureSigningContext();";
				code = code.replace(capture, `${capture}
					const r161Returns = new Set<number>();
					const r161Bird = (p, tid) => hasDesignatedVeteranContractRights(p, tid) ||
						(r161Returns.has(p.pid) && p.priorContractTid === tid);
				`);
				const signing = "const result = await applySigningTransaction({";
				if (code.split(signing).length !== 2) throw new Error("R16.1 return signing audit entry");
				code = code.replace(signing, `const r161AuditedReturn = globalThis.r161OpenSigning &&
					expectedContractException === "bird" && r161Returns.has(p.pid) &&
					!hasDesignatedVeteranContractRights(p, tid);
					const r161Before = r161AuditedReturn ? await team.getPayroll(tid, undefined, context.cache) : undefined;
					${signing}`)
					.replace("return result.player;", `if (r161AuditedReturn) {
						globalThis.r161OpenSigning(p, tid, contract, r161Before,
							await team.getPayroll(tid, undefined, context.cache));
					}
					return result.player;`);
				code = 'import { incumbentReturn } from "../../../../analysis/player-aging-calibration/sim/r161_market.ts";\n' + code;
			}
			return code;
		}
	},
} satisfies Plugin;

export default {
	...config,
	plugins: [...(config.plugins ?? []), instrumentation],
};
