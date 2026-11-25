// R16.4 isolated candidate: V9 growth + R16 shots + opening finishing + young rotation + late market + natural style.
// No injury mechanism is changed. R164=finish,rookies,market,style selects components; an empty value is plain R16.
import type { Plugin } from "vite";
import base from "./r5.config.ts";

const once = (code: string, before: string, after: string) => {
	if (code.split(before).length !== 2) throw new Error(`R16.4 source anchor: ${before}`);
	return code.replace(before, () => after);
};
const SIM = "../../../../analysis/player-aging-calibration/sim";
const on = (name: string) => (process.env.R164 ?? "").split(",").includes(name);

const plugin = {
	name: "r164-candidate",
	enforce: "pre",
	transform(code, id) {
		if (id.endsWith("/sim/full_league.test.ts")) {
			code = once(code, "await loadProduct(ARM);", 'await loadProduct(ARM);\n\t\tr164 = await import("./r164_runtime.ts");');
			code = once(code, "const candidate = V9[arm];", 'const candidate = arm === "v9s_l4g" ? (await import("./r164_growth.ts")).tilted : arm === "v9s_l4j" ? (await import("./r164_growth.ts")).corrected : arm === "v9s_l4l" ? (await import("./r164_growth.ts")).composed : arm === "v9s_l4m" ? (await import("./r164_growth.ts")).composedCalm : V9[arm];');
			code = once(code, "const calls: Record<string, number> = {};\n\tconst choiceLog", `const r164Season: Record<string, unknown> = { season, factor };
	if (r164!.enabled().has("style")) r164Season.style = r164!.seasonStyle(all, prepared, season, factor);
	const calls: Record<string, number> = {};
	const choiceLog`);
			code = once(code, "gsState.choice = choiceLog; gsState.calls = calls;", `if (r164!.enabled().has("files")) r164Season.files = await r164!.openingClasses(season, START);
	if (r164!.enabled().has("finish")) r164Season.finish = await r164!.seasonFinishing(all, armDef, season, START, factor);
	if (r164!.enabled().size) for (const p of all) if ((p as any).r164Finishing || (p as any).r164Style) await idb.cache.players.put(p);
	r164!.noteSeason(r164Season);
	gsState.choice = choiceLog; gsState.calls = calls;`);
			code = once(code, 'async function preseasonSnapshot() {\n\tconst season = g.get("season");',
				'async function preseasonSnapshot() {\n\tconst season = g.get("season");\n\tawait r164!.payrollSnapshot(season);');
			return 'let r164: typeof import("./r164_runtime.ts") | undefined;\n' + code;
		}
		if (id.endsWith("/src/worker/core/GameSim.basketball/index.ts") && process.env.AGING_RUN === "1") {
			// Pregame-free expected make probability per zone: far less sampling noise than a 55-day make rate.
			const at = "\t\treturn {\n\t\t\tblocked,\n\t\t\tdesperation: forceThreePointer || rushed,";
			return once(code, at, `if (type === "atRim" || type === "lowPost" || type === "midRange") globalThis.r164Observe?.(type, p.id, blocked, probMake);
			${at}`);
		}
		if (id.endsWith("/src/worker/core/game/loadTeams.ts")) {
			const attach = "for (const p of t.player) {\n\t\t\tp.plannedMinutes = effective[p.id] ?? 0;";
			return once(code, attach, `if (!userControlled && !playoffs && !allStarGame && !exhibitionGame) {
				globalThis.r164Rookies?.(teamInput, players, minutesPlayers, available, effective, teamSeason);
			}
			${attach}`);
		}
		// Generated classes: real draftees are about 1.3-2 years older than product prospects (see r164_prospects.ts).
		if (id.endsWith("/src/worker/core/draft/genPlayersWithoutSaving.ts") && (on("prospects") || process.env.R164_PROSPECTS_TEST)) {
			code = once(code, "return defaultFractionPerYear;", "return globalThis.r164Prospects?.stay ?? DECLARE;");
			code = once(code, "for (const p of enteringDraft) {\n\t\tdelete p.fudgeFactor;", `if (existingPlayers.length === 0 && !forceScrubs) await readyClass(enteringDraft, async (p) => player.develop(p, 0, false, DEFAULT_LEVEL, false, context), globalThis.r164Prospects?.ready);
	for (const p of enteringDraft) {\n\t\tdelete p.fudgeFactor;`);
			return `import { DECLARE, readyClass } from "${SIM}/r164_prospects.ts";\n` + code;
		}
		// Second version: who declares early, ability by draft age and skill profile (see r164_classes.ts).
		if (id.endsWith("/src/worker/core/draft/genPlayersWithoutSaving.ts") && (on("classes") || process.env.R164_CLASSES_TEST)) {
			code = once(code, "return defaultFractionPerYear;", "return classRule().stay;");
			code = once(code, "random.randInt(-50, 50)", "random.randInt(-classRule().noise, classRule().noise)");
			code = once(code, "for (const p of enteringDraft) {\n\t\tdelete p.fudgeFactor;", `if (existingPlayers.length === 0 && !forceScrubs) await readyClass(enteringDraft, async (p) => player.develop(p, 0, false, DEFAULT_LEVEL, false, context));
	for (const p of enteringDraft) {\n\t\tdelete p.fudgeFactor;`);
			return `import { classRule, readyClass } from "${SIM}/r164_classes.ts";\n` + code;
		}
		if (id.endsWith("/src/worker/core/freeAgents/autoSign.ts") && on("market")) {
			code = once(code, "const context = captureSigningContext();", `const context = captureSigningContext();
				const ordinaryIncumbents = new Map();
				const pilotRights = (p, tid) => ordinaryIncumbents.get(p.pid) === tid && ordinaryRights(p, tid, context);`);
			for (const name of ["p", "currentPlayer"]) {
				const before = `hasDesignatedVeteranContractRights(${name}, tid)`;
				code = once(code, before, `(${before} || pilotRights(${name}, tid))`);
			}
			code = once(code, "\n};\n\nexport default autoSign;", `
				await clearLateMarket(context, completeSigning, (p, tid) => ordinaryIncumbents.set(p.pid, tid),
					globalThis.r163MarketArm ?? "baseline", (event, p, detail) => globalThis.r164MarketLog?.(event, p, detail));
};

export default autoSign;`);
			return `import { clearLateMarket, ordinaryRights } from "${SIM}/r163_market.ts";\n` + code;
		}
		if (id.endsWith("/src/worker/core/freeAgents/decreaseDemands.ts") && on("market")) {
			code = once(code, "p.contract.amount = helpers.roundContract(p.contract.amount);",
				"p.contract.amount -= lateAskCut(p);\n\t\tp.contract.amount = helpers.roundContract(p.contract.amount);");
			return `import { lateAskCut } from "${SIM}/r164_contract.ts";\n` + code;
		}
		// The user plays by the same late incumbent rule. Term and salary limits stay those of an ordinary free agent.
		if (id.endsWith("/src/worker/core/contractNegotiation/accept.ts") && on("market")) {
			code = once(code, "hasDesignatedVeteranContractRights(p, context.userTid));",
				"hasDesignatedVeteranContractRights(p, context.userTid) || lateIncumbentRights(p, context.userTid, context));");
			code = once(code, "hasDesignatedVeteranContractRights(\n\t\t\t\t\t\t\t\t\t\t\t\t\tcurrentPlayer,\n\t\t\t\t\t\t\t\t\t\t\t\t\tcontext.userTid,\n\t\t\t\t\t\t\t\t\t\t\t\t)),",
				"hasDesignatedVeteranContractRights(currentPlayer, context.userTid) || lateIncumbentRights(currentPlayer, context.userTid, context)),");
			return `import { lateIncumbentRights } from "${SIM}/r164_contract.ts";\n` + code;
		}
		if (id.endsWith("/sim/aging_arms.test.ts")) {
			// Static check: r164_<components joined by +> runs R16 plus those components on the fixed opening file.
			const begin = code.indexOf("async function roundFive() {"), end = code.indexOf("async function roundSix()", begin);
			let body = code.slice(begin, end);
			body = once(body, "async function roundFive() {", `async function roundFive() {
				const r164 = await import("./r164_runtime.ts");
				const r164Of = (name) => name.startsWith("r164") ? new Set(name.slice(5).split("+")) : new Set();
				for (const name of list(process.env.AGING_ARMS, "")) if (name.startsWith("r164")) R5_ARMS[name] = R5_ARMS.r16_midrange;`);
			body = once(body, 'const arm = resolveR5Arm(armName, g.get("threePointTendencyFactor"))!;',
				'const arm = resolveR5Arm(armName.startsWith("r164") ? "r16_midrange" : armName, g.get("threePointTendencyFactor"))!;');
			const install = 'r5Install(arm, prepared, calls, g.get("threePointTendencyFactor"));';
			body = once(body, install, install + `
				globalThis.r164RookiesOff = !r164Of(armName).has("rookies");
				r164.rotationReport();
				const r164Context = r164.startContext();
				if (r164Of(armName).has("finish")) console.log(JSON.stringify(await r164.seasonFinishing(players, arm, season, season, g.get("threePointTendencyFactor"))));
			`);
			const write = 'writeOnce(name, rows.join("\\n") + "\\n");';
			body = once(body, write, write + '\n\t\t\t\t\twriteOnce(name.replace(/\\.csv$/, ".rotation.json"), JSON.stringify({ ...r164.rotationReport(), context: r164Context() }));');
			return code.slice(0, begin) + body + code.slice(end);
		}
	},
} satisfies Plugin;

export default { ...base, plugins: [...(base.plugins ?? []), plugin] };
