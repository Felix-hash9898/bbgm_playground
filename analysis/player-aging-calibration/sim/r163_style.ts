import { COMPOSITE_WEIGHTS } from "../../../src/common/constants.basketball.ts";
import type { Player } from "../../../src/common/types.ts";
import type { PlayerRatings } from "../../../src/common/types.basketball.ts";
import compositeRating from "../../../src/worker/core/player/compositeRating.ts";
import { playgroundThreeChoice, type R5Player } from "./formulas/r5.ts";

export type StyleMemory163 = Map<number, { skill: number; role: number; tid: number }>;
type StylePlayer = Pick<Player, "pid" | "tid" | "born" | "ratings" | "stats">;

const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
const logit = (q: number) => {
	const p = clamp(q, .004, .97);
	return Math.log(p / (1 - p));
};

function usage(r: PlayerRatings) {
	const { ratings, weights } = COMPOSITE_WEIGHTS.usage;
	return compositeRating(r, ratings, weights, false) ** 1.9;
}

/** Build per-player skill, team-relative role share, and team ID snapshot for natural style transitions. */
export function styleMemory163(players: StylePlayer[]): StyleMemory163 {
	const byTeam = new Map<number, { pid: number; ovr: number; usage: number; skill: number; tid: number }[]>();
	for (const player of players) {
		if (player.tid < 0) continue;
		const r = player.ratings.at(-1) as PlayerRatings | undefined;
		if (!r) continue;
		const team = byTeam.get(player.tid) ?? [];
		team.push({ pid: player.pid, ovr: r.ovr, usage: usage(r), skill: logit(playgroundThreeChoice(r)), tid: player.tid });
		byTeam.set(player.tid, team);
	}
	const out: StyleMemory163 = new Map();
	for (const teammates of byTeam.values()) {
		const rotation = teammates.sort((a, b) => b.ovr - a.ovr || a.pid - b.pid).slice(0, 8);
		const teamUsage = rotation.reduce((sum, r) => sum + r.usage, 0) / rotation.length;
		for (const player of teammates) {
			out.set(player.pid, { skill: player.skill, role: player.usage / Math.max(.001, teamUsage), tid: player.tid });
		}
	}
	return out;
}

/** Compute bounded 3PAr adjustment driven by age/move-gated skill, role changes, and identity protection. */
export function adjustThreeProbability163(
	p: number, dSkill: number, dRole: number, oldShare: number, oldFga: number,
	age: number, moved: boolean, tp: number,
) {
	const skillGain = age <= 24 ? .34 : moved ? .14 : .06;
	const roleGain = moved ? .48 : .32;
	const effectiveRole = Math.abs(dRole) < .04 ? 0 : dRole;
	const midTierBoost = age <= 24 && oldShare >= .15 && oldShare <= .42 && tp >= 48 && dSkill >= 0 ? .025 : 0;
	const shock = skillGain * clamp(dSkill, -.9, .9) - roleGain * clamp(effectiveRole, -.55, .55) + midTierBoost;
	const q = 1 / (1 + Math.exp(-(logit(p) + shock)));
	const maxDown = oldShare >= .45 ? -.045 : -.08;
	const maxUp = oldShare <= .08 && (dSkill < .40 || tp < 50) ? .015 : oldShare >= .45 ? .045 : .075;
	return clamp(p + clamp((q - clamp(p, .004, .97)) * Math.min(1, oldFga / 250), maxDown, maxUp), 0, .97);
}

/** Update prepared shot-mix probabilities from prior-season style memory with zero extra RNG calls. */
export function applyStyleResponse163(
	team: StylePlayer[], prepared: Map<number, R5Player>, previous: StyleMemory163 | undefined,
	season: number, factor: number,
): StyleMemory163 {
	const current = styleMemory163(team);
	if (!previous || factor < .8) return current;
	for (const p of team) {
		const before = previous.get(p.pid);
		const after = current.get(p.pid);
		const style = prepared.get(p.pid);
		if (!before || !after || !style || style.three === undefined) continue;
		const r = p.ratings.at(-1) as PlayerRatings | undefined;
		const played = p.stats.filter(row => row.season === season - 1 && !row.playoffs);
		const fga = played.reduce((a, row) => a + (row.fga ?? 0), 0);
		const tpa = played.reduce((a, row) => a + (row.tpa ?? 0), 0);
		if (fga < 40 || !r) continue;
		const age = season - (p.born?.year ?? season - 26);
		const moved = after.tid !== before.tid;
		style.three = adjustThreeProbability163(
			style.three * factor,
			after.skill - before.skill,
			Math.log(Math.max(.001, after.role) / Math.max(.001, before.role)),
			tpa / fga,
			fga,
			age,
			moved,
			r.tp ?? 50,
		) / factor;
		style.choice = style.three;
	}
	return current;
}
