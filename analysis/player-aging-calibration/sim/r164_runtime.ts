// Binds the R16.4 components to one freshly loaded product module graph (open league or static harness).
import { appendFileSync } from "node:fs";
import path from "node:path";
import type { Player } from "../../../src/common/types.ts";
import { PLAYER } from "../../../src/common/index.ts";
import { DEFAULT_LEVEL } from "../../../src/common/budgetLevels.ts";
import { player } from "../../../src/worker/core/index.ts";
import potEstimator from "../../../src/worker/core/player/potEstimator.ts";
import getPayroll from "../../../src/worker/core/team/getPayroll.ts";
import { idb } from "../../../src/worker/db/index.ts";
import { g } from "../../../src/worker/util/index.ts";
import { prepare, type R5Arm, type R5Player } from "./formulas/r5.ts";
import { installFinishing, openingMarks, type FinishingPlayer } from "./r164_finishing.ts";
import { estimateOpeningPotential, potentialSeed } from "./r164_potential.ts";
import type { PlayerRatings } from "../../../src/common/types.basketball.ts";
import { liftFileClasses } from "./r164_classes.ts";
import { planYoungMinutes, type YoungDecision } from "./r164_rookies.ts";
import { applyStyleResponse164 } from "./r164_style.ts";
import type { StyleMemory163 } from "./r163_style.ts";

type StylePlayer = Player & { r164Style?: { season: number; skill: number; role: number; tid: number } };
export const COMPONENTS = ["finish", "rookies", "market", "style", "prospects", "classes", "growth", "files", "composition", "calm", "openingPot"] as const;
export const enabled = () => new Set((process.env.R164 ?? "").split(",").map(x => x.trim()).filter(Boolean));
for (const name of enabled()) if (!(COMPONENTS as readonly string[]).includes(name)) throw new Error(`Unknown R16.4 component ${name}`);

const note = (file: string, row: object) => {
	if (process.env.FULL_OUT) appendFileSync(path.join(process.env.FULL_OUT, file), JSON.stringify(row) + "\n");
};

export async function recalculateOpeningPotential(season: number) {
	const changed = [];
	for (const p of await idb.cache.players.getAll()) {
		const age = season - p.born.year;
		const rating = p.ratings.at(-1)!;
		if (!p.real || p.tid < PLAYER.FREE_AGENT || p.draft.year >= season || rating.locked || age < 19 || age > 26) {
			continue;
		}
		const before = rating.pot;
		const valueBefore = p.value;
		const potential = estimateOpeningPotential(rating as PlayerRatings, age, potentialSeed(`${p.srID ?? p.pid}/${season}`));
		if (potential !== before) {
			rating.pot = potential;
			await player.updateValues(p);
			await idb.cache.players.put(p);
		}
		changed.push({ pid: p.pid, age, ovr: rating.ovr, before, after: potential, valueBefore, valueAfter: p.value });
	}
	return changed;
}

/** Open league, opening season only: raise the speculative real draft classes of the file (r164_classes.ts). */
export async function openingClasses(season: number, start: number) {
	if (season !== start) return undefined;
	const list = (await idb.cache.players.getAll()).filter(p => p.tid === PLAYER.UNDRAFTED);
	const out = await liftFileClasses(list, start, async (p: Player) => {
		await player.develop(p, 0, false, DEFAULT_LEVEL);
		await player.updateValues(p);
		await idb.cache.players.put(p);
	});
	note("files.jsonl", { season, classes: out });
	return out;
}

/** After prepare(): move the three-point choice with last season's saved role/skill snapshot. */
export function seasonStyle(players: Player[], prepared: Map<number, R5Player>, season: number, factor: number) {
	const previous: StyleMemory163 = new Map();
	for (const p of players as StylePlayer[]) {
		const s = p.r164Style;
		if (s && s.season === season - 1) previous.set(p.pid, { skill: s.skill, role: s.role, tid: s.tid });
	}
	const before = new Map([...prepared].map(([pid, x]) => [pid, x.three]));
	const current = applyStyleResponse164(players, prepared, previous.size ? previous : undefined, season, factor);
	for (const p of players as StylePlayer[]) {
		const now = current.get(p.pid);
		if (now) p.r164Style = { season, ...now };
	}
	const shifts = [...prepared].map(([pid, x]) => Math.abs((x.three ?? 0) - (before.get(pid) ?? 0))).filter(x => x > 1e-9);
	const moved = [...previous].filter(([pid, s]) => current.has(pid) && current.get(pid)!.tid !== s.tid).length;
	return { adjusted: shifts.length, meanShift: shifts.reduce((a, b) => a + b, 0) / Math.max(1, shifts.length), moved };
}

/** Open-league start of season, after the base arm installed its hooks. Marks are written once and then saved with the player. */
export async function seasonFinishing(players: Player[], arm: R5Arm, season: number, start: number, factor: number) {
	const list = players as FinishingPlayer[];
	if (season === start) {
		const marks = openingMarks(players, season, arm, factor, prepare);
		for (const p of list) {
			const mark = marks.get(p.pid);
			if (mark) p.r164Finishing = mark;
		}
	} else if (list.some(p => p.r164Finishing && p.r164Finishing.season !== start)) {
		throw new Error("Finishing identity was learned after the opening");
	}
	const marked = list.filter(p => p.r164Finishing);
	return { installed: installFinishing(list, season), zone: marked.filter(p => p.r164Finishing!.source === "zone").length,
		box: marked.filter(p => p.r164Finishing!.source === "box").length, late: marked.filter(p => p.draft.year >= start).length };
}

type Summary = { teamGames: number; minutes: Map<string, { minutes: number; games: number; last: YoungDecision }> };
const rotation: Summary = { teamGames: 0, minutes: new Map() };
export function rotationReport(clear = true) {
	const rows = [...rotation.minutes.values()].map(x => ({ ...x.last, games: x.games, minutes: x.minutes }));
	const out = { teamGames: rotation.teamGames, rows };
	if (clear) { rotation.teamGames = 0; rotation.minutes.clear(); }
	return out;
}

const hooks = globalThis as typeof globalThis & Record<string, unknown>;
if (enabled().has("rookies") || process.env.R164_ROOKIE_LOG === "1") {
	hooks.r164Rookies = (club: Parameters<typeof planYoungMinutes>[0], players: Player[],
		profiles: Parameters<typeof planYoungMinutes>[2], playable: boolean[], minutes: Record<number, number>,
		record: Parameters<typeof planYoungMinutes>[5]) => {
		rotation.teamGames++;
		if (!enabled().has("rookies") || hooks.r164RookiesOff) return;
		const total = Object.values(minutes).reduce((a, b) => a + b, 0);
		// Static files have no potential. Open leagues always use the player's own POT.
		const potFallback = process.env.R164_STATIC_POT === "1" ? (ovr: number, age: number) => Math.round(potEstimator(ovr, age)) : undefined;
		for (const d of planYoungMinutes(club, players, profiles, playable, minutes, record, { season: g.get("season"), potFallback })) {
			const key = `${d.tid},${d.pid},${d.phase}`;
			const row = rotation.minutes.get(key) ?? { minutes: 0, games: 0, last: d };
			row.minutes += d.minutes;
			row.games++;
			row.last = d;
			rotation.minutes.set(key, row);
		}
		if (Math.abs(Object.values(minutes).reduce((a, b) => a + b, 0) - total) > 1e-6) throw new Error("Young rotation changed team minutes");
	};
}
hooks.r163MarketArm = enabled().has("market") ? "late-term" : "baseline";
hooks.r164MarketLog = (event: string, p: Player, detail: Record<string, unknown>) => {
	if (event !== "lateSign" && !(event === "lateBid" && ["player declined", "player declined price", "team declined price"].includes(String(detail.reason)))) return;
	note("market.jsonl", { event, season: g.get("season"), daysLeft: g.get("daysLeft"), pid: p.pid, sid: p.srID ?? `generated_${p.pid}`,
		age: g.get("season") - p.born.year, ovr: p.ratings.at(-1)!.ovr, injury: p.injury.gamesRemaining, ...detail });
};

/** Static probe: expected two-point make probability by player and zone, blocked attempts counted as zero. */
export function startContext() {
	const rows = new Map<string, [number, number]>();
	hooks.r164Observe = (kind: string, pid: number, blocked: boolean, prob: number) => {
		const key = `${pid},${kind}`;
		const row = rows.get(key) ?? [0, 0];
		row[0]++;
		row[1] += blocked ? 0 : Math.max(0, Math.min(1, prob));
		rows.set(key, row);
	};
	return () => {
		delete hooks.r164Observe;
		if (rows.size < 100) throw new Error("No two-point context");
		return [...rows];
	};
}

export async function payrollSnapshot(season: number) {
	const teams = (await idb.cache.teams.getAll()).filter(t => !t.disabled);
	const payroll = await Promise.all(teams.map(async t => [t.tid, await getPayroll(t.tid, season), t.strategy]));
	note("team_payroll.jsonl", { season, cap: g.get("salaryCap"), luxuryPayroll: g.get("luxuryPayroll"), payroll });
	note("rotation.jsonl", { season: season - 1, ...rotationReport() });
}
export const noteSeason = (row: object) => note("components.jsonl", row);
