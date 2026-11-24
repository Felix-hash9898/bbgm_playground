import type { Player } from "../../../src/common/types.ts";
import type { PlayerRatings } from "../../../src/common/types.basketball.ts";
import type { R5Player } from "./formulas/r5.ts";
import { styleMemory163, type StyleMemory163 } from "./r163_style.ts";

// Natural three-point transition. R16 learns a player's choice from his own history and lost the link to ability: a
// yearly change of three-point skill moved the share with slope .05 (logit on logit), against .3-.5 in the modern NBA
// and .9 in the product. Both gains below come from NBA year-to-year slopes; there is no random term, no age or
// team-change constant (a move acts through the teammates' usage), and specialists and non-shooters keep their bounds.
export const SKILL_GAIN = .40;
export const ROLE_GAIN = .32; // NBA: -.08 three-share per log plays/36 near a .35 share, 2005-25
type StylePlayer = Pick<Player, "pid" | "tid" | "born" | "ratings" | "stats">;

const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
const logit = (q: number) => {
	const p = clamp(q, .004, .97);
	return Math.log(p / (1 - p));
};

export function respond(p: number, dSkill: number, dRole: number, oldShare: number, oldFga: number, tp: number) {
	const shock = SKILL_GAIN * clamp(dSkill, -.9, .9) - ROLE_GAIN * (Math.abs(dRole) < .04 ? 0 : clamp(dRole, -.55, .55));
	const q = 1 / (1 + Math.exp(-(logit(p) + shock)));
	const maxDown = oldShare >= .45 ? -.045 : -.08;
	// A non-shooter starts to shoot only when the skill is really there.
	const maxUp = oldShare <= .08 && (dSkill < .40 || tp < 50) ? .015 : oldShare >= .45 ? .045 : .08;
	return clamp(p + clamp((q - clamp(p, .004, .97)) * Math.min(1, oldFga / 250), maxDown, maxUp), 0, .97);
}

export function applyStyleResponse164(players: StylePlayer[], prepared: Map<number, R5Player>, previous: StyleMemory163 | undefined,
	season: number, factor: number): StyleMemory163 {
	const current = styleMemory163(players);
	if (!previous || factor < .8) return current;
	for (const p of players) {
		const before = previous.get(p.pid);
		const after = current.get(p.pid);
		const style = prepared.get(p.pid);
		const r = p.ratings.at(-1) as PlayerRatings | undefined;
		if (!before || !after || !r || !style || style.three === undefined) continue;
		const played = p.stats.filter(row => row.season === season - 1 && !row.playoffs);
		const fga = played.reduce((a, row) => a + (row.fga ?? 0), 0);
		const tpa = played.reduce((a, row) => a + (row.tpa ?? 0), 0);
		if (fga < 40) continue;
		style.three = respond(style.three * factor, after.skill - before.skill,
			Math.log(Math.max(.001, after.role) / Math.max(.001, before.role)), tpa / fga, fga, r.tp) / factor;
		style.choice = style.three;
	}
	return current;
}
