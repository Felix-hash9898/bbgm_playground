import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Player, Team } from "../../../src/common/types.ts";
import { PHASE, PLAYER } from "../../../src/common/index.ts";
import { resetCache, resetG } from "../../../src/test/helpers.ts";
import { contractNegotiation, league, team } from "../../../src/worker/core/index.ts";
import { captureSigningContext } from "../../../src/worker/core/capturedContext.ts";
import { hasDesignatedVeteranContractRights } from "../../../src/worker/core/contracts/contractLimits.ts";
import moodInfo from "../../../src/worker/core/player/moodInfo.ts";
import { idb } from "../../../src/worker/db/index.ts";
import { g, local } from "../../../src/worker/util/index.ts";
import { prepare, resolveR5Arm } from "./formulas/r5.ts";
import { lateAskCut, lateIncumbentRights } from "./r164_contract.ts";
import { carriedShift, installFinishing, openingMarks, type FinishingPlayer } from "./r164_finishing.ts";
import { classRule, fileLift, liftFileClasses, RULE, readyClass } from "./r164_classes.ts";
import { COMPOSITION, composed, composedCalm, CORRECTION, corrected } from "./r164_growth.ts";
import { V9 } from "./formulas/v9.ts";
import { planYoungMinutes } from "./r164_rookies.ts";
import { respond } from "./r164_style.ts";

const R = "analysis/player-aging-calibration";
const save = (name: string) => JSON.parse(gunzipSync(readFileSync(`${R}/sim/r5_inputs/${name}`)).toString());
const arm = resolveR5Arm("r16_midrange", 1)!;
const mark = (players: Player[], season: number) => openingMarks(players, season, arm, 1, prepare);

describe.skipIf(process.env.R164_UNIT !== "1")("R16.4 opening finishing", () => {
	const file = save("R5_2025_r16_static.json.gz");
	const players: Player[] = file.players.filter((p: Player) => p.tid >= -1);
	const season = 2025;

	it("uses only the record before the opening, with a box fallback when no zone table exists", () => {
		const zone = mark(players, season);
		expect([...zone.values()].filter(m => m.source === "zone").length).toBeGreaterThan(250);
		for (const m of zone.values()) {
			expect(m.season).toBe(season);
			expect(Math.abs(m.atRim)).toBeLessThanOrEqual(.04);
			expect(Math.abs(m.lowPost)).toBeLessThanOrEqual(.04);
		}
		// Rows of the simulated season and later change nothing.
		const polluted = structuredClone(players);
		for (const p of polluted) p.stats.push({ ...(p.stats.at(-1) ?? {}), season, playoffs: false, fg: 900, fga: 900, tp: 0, tpa: 0 } as never);
		expect([...mark(polluted, season)]).toEqual([...zone]);
		// A league opened past the research tables has no zone record and still runs on its own history.
		const future = structuredClone(players);
		for (const p of future) {
			p.born.year += 15;
			p.draft.year += 15;
			for (const s of p.stats) s.season += 15;
		}
		const box = mark(future, season + 15);
		expect([...box.values()].every(m => m.source === "box")).toBe(true);
		expect(box.size).toBeGreaterThan(200);
		const pairs = [...box].filter(([pid]) => zone.get(pid)?.source === "zone").map(([pid, m]) => [m.atRim, zone.get(pid)!.atRim] as const);
		const mean = (i: 0 | 1) => pairs.reduce((a, p) => a + p[i], 0) / pairs.length;
		const cov = (i: 0 | 1, j: 0 | 1) => pairs.reduce((a, p) => a + (p[i] - mean(i)) * (p[j] - mean(j)), 0);
		expect(cov(0, 1) / Math.sqrt(cov(0, 0) * cov(1, 1))).toBeGreaterThan(.35);
	});

	it("never marks players who arrive after the opening, and survives an empty history", () => {
		const late = structuredClone(players);
		for (const p of late) p.draft.year = season;
		expect(mark(late, season).size).toBe(0);
		const none = structuredClone(players);
		for (const p of none) { p.stats = []; p.srID = undefined; }
		expect(mark(none, season).size).toBe(0);
	});

	it("carries a fading identity without NaN for in-season signings", () => {
		const own = { season, source: "zone" as const, atRim: .04, lowPost: -.02 };
		expect(carriedShift(own, season, "atRim")).toBe(.04);
		expect(carriedShift(own, season + 6, "atRim")).toBeCloseTo(.04 * .95 ** 6, 10);
		expect(carriedShift(own, season, "midRange")).toBe(0);
		expect(carriedShift(undefined, season, "atRim")).toBe(0);
		const hooks = globalThis as any;
		hooks.r5MakeShift = (_kind: string, pid: number) => (pid === 1 ? .01 : undefined);
		installFinishing([{ pid: 1, r164Finishing: own }, { pid: 2 }] as FinishingPlayer[], season);
		expect(hooks.r5MakeShift("atRim", 1)).toBeCloseTo(.05, 10);
		expect(hooks.r5MakeShift("midRange", 1)).toBeCloseTo(.01, 10);
		expect(hooks.r5MakeShift("atRim", 2)).toBeUndefined();
		delete hooks.r5MakeShift;
	});
});

describe.skipIf(process.env.R164_UNIT !== "1")("R16.4 young rotation", () => {
	const season = 2025;
	type Row = { min: number; tid: number; pts?: number };
	const man = (pid: number, over: Record<string, unknown> = {}, rows: Row[] = []) => ({ pid, rosterOrder: pid, tid: 1,
		born: { year: 1995 }, draft: { year: 2016, round: 1, pick: 20 }, injury: { type: "Healthy", gamesRemaining: 0 },
		ratings: [{ ovr: 50, pot: 50 }], valueNoPot: 60 - pid,
		stats: rows.map(r => ({ season, playoffs: false, pts: 0, fga: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, ...r })), ...over }) as unknown as Player;
	const rookie = (pid: number, over = {}, rows: Row[] = []) => man(pid, { born: { year: 2004 }, draft: { year: 2024, round: 1, pick: 8 },
		ratings: [{ ovr: 46, pot: 60 }], valueNoPot: 46, ...over }, rows);
	const run = (players: Player[], strategy: string, won = 10, lost = 10, minutes?: Record<number, number>) => {
		const profiles = players.map(p => ({ pid: p.pid, rosterOrder: p.rosterOrder, endurance: .5, position: "W",
			roleScores: { handler: .3, interior: .3, wing: .4 } }));
		const plan = minutes ?? Object.fromEntries(players.map(p => [p.pid, p.pid < 5 ? 32 : p.pid < 10 ? 16 : 0]));
		const before = Object.values(plan).reduce((a, b) => a + b, 0);
		const out = planYoungMinutes({ tid: 1, strategy }, players, profiles, players.map(() => true), plan, { won, lost }, { season });
		expect(Object.values(plan).reduce((a, b) => a + b, 0)).toBeCloseTo(before, 9);
		expect(Object.values(plan).every(x => x >= 0)).toBe(true);
		return { out, plan };
	};
	const vets = (rows: Row[] = []) => Array.from({ length: 10 }, (_, i) => man(i, {}, rows));

	it("auditions up to three players on a rebuilding club and two on a contender, never out of the top five", () => {
		const players = [...vets(), rookie(10), rookie(11), rookie(12), rookie(13)];
		expect(run(players, "rebuilding").out).toHaveLength(3);
		expect(run(players, "contending").out).toHaveLength(2);
		expect(run(players, "rebuilding").out.every(d => d.donor >= 5)).toBe(true);
	});
	it("passes the audition to a teammate after a weak one, an injury or a trade, without a lock", () => {
		const weak: Row[] = [{ tid: 1, min: 460, pts: 18 }];
		const proven: Row[] = [{ tid: 1, min: 300, pts: 130 }];
		const others = vets(proven);
		expect(run([...others, rookie(10, {}, weak), rookie(11)], "contending").out.map(d => d.pid)).toEqual([11]);
		expect(run([...others, rookie(10, { injury: { type: "Knee", gamesRemaining: 9 } }), rookie(11)], "contending").out.map(d => d.pid)).toEqual([11]);
		expect(run([...others, rookie(11)], "contending").out.map(d => d.pid)).toEqual([11]);
		// Minutes already earned at a previous club still count after a trade.
		expect(run([...others, rookie(10, {}, [{ tid: 4, min: 460, pts: 18 }])], "contending").out).toEqual([]);
		expect(run([...others, rookie(10, {}, [{ tid: 4, min: 460, pts: 260 }])], "contending").out[0]).toMatchObject({ pid: 10, phase: "earned" });
	});
	it("gives a losing rebuilding club a late look, and nobody a place by potential alone", () => {
		const others = vets([{ tid: 1, min: 300, pts: 130 }]);
		const fair: Row[] = [{ tid: 1, min: 720, pts: 245 }];
		expect(run([...others, rookie(10, {}, fair)], "rebuilding", 20, 20).out).toEqual([]);
		expect(run([...others, rookie(10, {}, fair)], "rebuilding", 20, 40).out[0]).toMatchObject({ pid: 10, phase: "late look" });
		expect(run([...others, rookie(10, { valueNoPot: 20 })], "rebuilding").out).toEqual([]);
		expect(run([...others, man(10, { draft: { year: 2024, round: 0, pick: 0 }, born: { year: 2004 } })], "rebuilding").out).toEqual([]);
	});
});

describe.skipIf(process.env.R164_UNIT !== "1")("R16.4 late incumbent rule", () => {
	it("lets only a healthy proven player who is still unsigned come down faster", () => {
		resetG();
		g.setWithoutSavingToDB("season", 2026);
		const p = { numDaysFreeAgent: 25, yearsFreeAgent: 0, tid: PLAYER.FREE_AGENT, injury: { type: "Healthy", gamesRemaining: 0 },
			contract: { amount: 24000, exp: 2028 }, stats: [{ season: 2026, playoffs: false, min: 1800 }] } as unknown as Player;
		g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
		g.setWithoutSavingToDB("daysLeft", 8);
		expect(lateAskCut(p)).toBeCloseTo(1200, 6);
		g.setWithoutSavingToDB("daysLeft", 9);
		expect(lateAskCut(p)).toBe(0);
		g.setWithoutSavingToDB("season", 2027);
		g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
		expect(lateAskCut(p)).toBeCloseTo(480, 6);
		expect(lateAskCut({ ...p, injury: { type: "Knee", gamesRemaining: 20 } })).toBe(0);
		expect(lateAskCut({ ...p, stats: [{ season: 2026, playoffs: false, min: 700 }] } as unknown as Player)).toBe(0);
		expect(lateAskCut({ ...p, numDaysFreeAgent: 10 })).toBe(0);
	});

	it("gives the user the same late right, and only that right", async () => {
		const input = JSON.parse(gunzipSync(readFileSync(process.env.R164_MARKET_SNAPSHOT!)).toString());
		resetG();
		await resetCache({ players: input.players, teams: input.teams, teamSeasons: input.teamSeasons });
		for (const row of input.attributes) await idb.cache.gameAttributes.put(row);
		for (const row of input.releasedPlayers) await idb.cache.releasedPlayers.put(row);
		await league.loadGameAttributes();
		g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
		g.setWithoutSavingToDB("season", input.season);
		g.setWithoutSavingToDB("spectator", false);
		local.autoPlayUntil = undefined;
		const p: Player = (await idb.cache.players.getAll()).find(x => x.srID === "doncilu01" && x.tid === PLAYER.FREE_AGENT)!;
		const tid = p.priorContractTid!;
		g.setWithoutSavingToDB("userTid", tid as any);
		g.setWithoutSavingToDB("userTids", [tid] as any);
		p.numDaysFreeAgent = 25;
		// Reduce the prior roster to two-way free slots; keep the club over the cap.
		const roster = (await idb.cache.players.indexGetAll("playersByTid", tid)).sort((a: Player, b: Player) => a.contract.amount - b.contract.amount);
		for (const x of roster.slice(0, 3)) { x.tid = PLAYER.FREE_AGENT; await idb.cache.players.put(x); }
		await idb.cache.players.put(p);
		const payroll = await team.getPayroll(tid);
		expect(payroll + 30000).toBeGreaterThan(g.get("salaryCap"));
		expect(hasDesignatedVeteranContractRights(p, tid)).toBe(false);
		const context = captureSigningContext();
		g.setWithoutSavingToDB("daysLeft", 4);
		expect(lateIncumbentRights(p, tid, context)).toBe(true);
		expect(lateIncumbentRights(p, (tid + 1) % 30, context)).toBe(false);
		g.setWithoutSavingToDB("daysLeft", 20);
		expect(lateIncumbentRights(p, tid, context)).toBe(false);

		const mood = await moodInfo(p, tid);
		expect(mood.willing).toBe(true);
		const offer = async (daysLeft: number, exp: number) => {
			g.setWithoutSavingToDB("daysLeft", daysLeft);
			await idb.cache.negotiations.put({ pid: p.pid, tid, resigning: false, rookie: false } as any);
			return contractNegotiation.accept({ pid: p.pid, amount: mood.contractAmount, exp, dryRun: true } as any);
		};
		const early = await offer(20, input.season + 2);
		const late = await offer(4, input.season + 2);
		expect(String(early)).toMatch(/salary cap/);
		// The offer clears the cap. Whether this player accepts is still the ordinary mood decision.
		expect(late).toBe(mood.willing ? undefined : "Player is no longer willing to negotiate.");
	}, 60_000);
});

describe.skipIf(process.env.R164_UNIT !== "1")("R16.4 style response", () => {
	it("follows ability and role, and keeps specialists and non-shooters inside their bounds", () => {
		expect(respond(.35, 0, 0, .35, 400, 55)).toBeCloseTo(.35, 10);
		const up = respond(.35, .3, 0, .35, 400, 60), down = respond(.35, -.3, 0, .35, 400, 50);
		expect(up).toBeGreaterThan(.37);
		expect(down).toBeLessThan(.33);
		expect(respond(.35, 0, .3, .35, 400, 55)).toBeLessThan(.34); // more usage, fewer threes
		expect(respond(.65, -.9, .5, .66, 500, 70)).toBeGreaterThanOrEqual(.605); // a specialist cannot collapse in a year
		expect(respond(.03, .3, 0, .03, 400, 40)).toBeLessThanOrEqual(.0451); // no spill without skill
		expect(respond(.03, .9, 0, .03, 400, 58)).toBeGreaterThan(.04);
		for (const p of [0, .004, .5, .97]) for (const d of [-9, 0, 9]) expect(respond(p, d, -d, p, 500, 50)).toBeGreaterThanOrEqual(0);
	});
});

describe.skipIf(process.env.R164_UNIT !== "1")("R16.4 growth correction and draft classes", () => {
	it("moves only the mean of the corrected ages and leaves the other ages on V9", () => {
		const mean = (develop: typeof corrected, age: number) => {
			let sum = 0;
			for (let i = 0; i < 4000; i++) {
				const r: any = Object.fromEntries(["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"].map(k => [k, 50]));
				develop(r, age, 50);
				sum += r.stre;
			}
			return sum / 4000;
		};
		for (const [age, expected] of [[19, 0], [21, -1.5], [24, -1.8], [27, -1.2], [32, -1], [40, 0]] as const) {
			expect(mean(corrected, age) - mean(V9.v9s_l4!, age)).toBeGreaterThan(expected - .35);
			expect(mean(corrected, age) - mean(V9.v9s_l4!, age)).toBeLessThan(expected + .35);
		}
		for (const [lo, hi] of CORRECTION) expect(lo).toBeLessThanOrEqual(hi);
	});
	it("changes what declines without changing OVR, and calms only players of 29 and more", () => {
		const weight: Record<string, number> = { stre: .0777, spd: .123, jmp: .051, endu: .0632, ins: .0126, dnk: .0286, ft: .0202, tp: .0726, oiq: .133, diq: .159, drb: .059, pss: .062, fg: .01, reb: .01 };
		for (const [, , shift] of COMPOSITION) expect(Math.abs(Object.entries(shift).reduce((s, [k, d]) => s + weight[k]! * d, 0))).toBeLessThan(.021);
		const run = (develop: typeof corrected, age: number, key: string) => {
			const v: number[] = [];
			for (let i = 0; i < 5000; i++) {
				const r: any = Object.fromEntries(["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"].map(k => [k, 60]));
				develop(r, age, 50);
				v.push(r[key] - 60);
			}
			const m = v.reduce((a, b) => a + b, 0) / v.length;
			return { m, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) };
		};
		for (const [age, key, expected] of [[21, "diq", -1.2], [27, "diq", 0], [30, "spd", .6], [33, "jmp", .9], [33, "fg", -.9], [41, "spd", 0]] as const) {
			const a = run(corrected, age, key), b = run(composed, age, key);
			expect(Math.abs(b.m - a.m - expected)).toBeLessThan(.35);
			expect(Math.abs(b.sd - a.sd)).toBeLessThan(.25);
		}
		expect(Math.abs(run(composedCalm, 27, "drb").sd - run(composed, 27, "drb").sd)).toBeLessThan(.15);
		expect(run(composedCalm, 30, "drb").sd / run(composed, 30, "drb").sd).toBeLessThan(.9);
		expect(run(composedCalm, 34, "drb").sd / run(composed, 34, "drb").sd).toBeLessThan(.87);
	});
	it("brings generated prospects to the spread of real draftees without moving the class", async () => {
		const players = [...Array(70).keys()].map(i => ({ draft: { year: 2031 }, born: { year: 2011 }, ratings: [{ ovr: 60 - i / 4, ...Object.fromEntries(["stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"].map(k => [k, 30 + (i % 10) * 4])) }] }));
		await readyClass(players, async () => {}, { stay: .2, noise: 8, points: {}, profile: {}, spread: { diq: .5 } });
		const diq = players.map(p => (p.ratings[0] as any).diq), tp = players.map(p => (p.ratings[0] as any).tp);
		expect(Math.max(...diq) - Math.min(...diq)).toBe(18);
		expect(Math.max(...tp) - Math.min(...tp)).toBe(36);
		expect(Math.abs(diq.reduce((a, b) => a + b, 0) - tp.reduce((a, b) => a + b, 0)) / 70).toBeLessThan(.6);
	});
	it("keeps the earlier class rule unless the growth component is on", () => {
		const old = process.env.R164;
		expect(classRule()).toEqual(RULE);
		process.env.R164 = "classes,growth";
		expect(classRule().points[20]).toBe(4);
		process.env.R164 = old;
	});
	it("lifts only speculative real classes, by one number per class", async () => {
		expect(fileLift(Array(70).fill(40))).toBe(4);
		expect(fileLift(Array(70).fill(43))).toBe(1);
		expect(fileLift(Array(70).fill(50))).toBe(0);
		expect(fileLift(Array(17).fill(30))).toBe(0);
		const make = (draft: number, ovr: number, real = true) => ({ real, draft: { year: draft }, ratings: [{ ...Object.fromEntries(["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"].map(k => [k, ovr])), ovr }] });
		const players = [...Array(70).keys()].flatMap(() => [make(2025, 40), make(2027, 40), make(2028, 40, false)]);
		const done: any[] = [];
		expect(await liftFileClasses(players, 2024, async p => { done.push(p); })).toEqual([{ draft: 2027, n: 70, lift: 4 }]);
		expect(done.length).toBe(70);
		expect(players.filter(p => p.draft.year !== 2027).every(p => p.ratings[0]!.tp === 40)).toBe(true);
		expect(players.filter(p => p.draft.year === 2027).every(p => p.ratings[0]!.tp === 44 && p.ratings[0]!.hgt === 40)).toBe(true);
	});
});
