import { COMPOSITE_WEIGHTS } from "../../../src/common/constants.basketball.ts";
import type { Player } from "../../../src/common/types.ts";
import type { PlayerRatings } from "../../../src/common/types.basketball.ts";
import compositeRating from "../../../src/worker/core/player/compositeRating.ts";
import { playgroundThreeChoice, type R5Player } from "./formulas/r5.ts";

export type StyleMemory = Map<number, { skill: number; role: number }>;
type StylePlayer = Pick<Player, "pid" | "tid" | "ratings" | "stats">;

const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
const logit = (q: number) => {
	const p = clamp(q, .004, .97);
	return Math.log(p / (1 - p));
};

function usage(r: PlayerRatings) {
	const { ratings, weights } = COMPOSITE_WEIGHTS.usage;
	return compositeRating(r, ratings, weights, false) ** 1.9;
}

// Preseason role proxy from production usage weights and an eight-man depth chart.
export function styleMemory(players: StylePlayer[]): StyleMemory {
	const byTeam = new Map<number, { pid: number; ovr: number; usage: number; skill: number }[]>();
	for (const player of players) {
		if (player.tid < 0) continue;
		const r = player.ratings.at(-1) as PlayerRatings | undefined;
		if (!r) continue;
		const team = byTeam.get(player.tid) ?? [];
		team.push({ pid: player.pid, ovr: r.ovr, usage: usage(r), skill: logit(playgroundThreeChoice(r)) });
		byTeam.set(player.tid, team);
	}
	const out: StyleMemory = new Map();
	for (const teammates of byTeam.values()) {
		const rotation = teammates.sort((a, b) => b.ovr - a.ovr || a.pid - b.pid).slice(0, 8);
		const teamUsage = rotation.reduce((sum, r) => sum + r.usage, 0) / rotation.length;
		for (const player of teammates) {
			out.set(player.pid, { skill: player.skill, role: player.usage / Math.max(.001, teamUsage) });
		}
	}
	return out;
}

export function adjustThreeProbability(
	p: number, dSkill: number, dRole: number, oldShare: number, oldFga: number,
	skillGain = .52, roleGain = .35,
) {
	const shock = skillGain * clamp(dSkill, -.9, .9) - roleGain * clamp(dRole, -.55, .55);
	const q = 1 / (1 + Math.exp(-(logit(p) + shock)));
	const limit = oldShare <= .08 && dSkill < .30 ? .03 : .09;
	return clamp(p + clamp((q - clamp(p, .004, .97)) * Math.min(1, oldFga / 250), -.09, limit), 0, .97);
}

export function applyStyleResponse(
	team: StylePlayer[], prepared: Map<number, R5Player>, previous: StyleMemory | undefined,
	season: number, factor: number,
) {
	const current = styleMemory(team);
	if (!previous || factor < .8) return current;
	for (const p of team) {
		const before = previous.get(p.pid);
		const after = current.get(p.pid);
		const style = prepared.get(p.pid);
		if (!before || !after || !style || style.three === undefined) continue;
		const played = p.stats.filter(r => r.season === season - 1 && !r.playoffs);
		const fga = played.reduce((a, r) => a + (r.fga ?? 0), 0);
		const tpa = played.reduce((a, r) => a + (r.tpa ?? 0), 0);
		if (fga === 0) continue;
		style.three = adjustThreeProbability(style.three * factor, after.skill - before.skill,
			Math.log(Math.max(.001, after.role) / Math.max(.001, before.role)), tpa / fga, fga) / factor;
		style.choice = style.three;
	}
	return current;
}
