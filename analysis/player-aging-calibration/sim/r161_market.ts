import { PHASE, PLAYER } from "../../../src/common/index.ts";
import type { Player } from "../../../src/common/types.ts";
import type { CapturedSigningContext } from "../../../src/worker/core/capturedContext.ts";
import moodInfo from "../../../src/worker/core/player/moodInfo.ts";

// Research probe. A waiting, proven incumbent can re-enter the ordinary
// same-team market. The designated-veteran maximum salary tiers are untouched.
type ReturnEvaluation = { eligible: boolean; reason: string; floor?: number; willing?: boolean; probWilling?: number };

export async function incumbentReturn(
	p: Player, tid: number, roster: Player[], context: CapturedSigningContext,
): Promise<ReturnEvaluation> {
	const lastSeason = context.phase >= PHASE.RESIGN_PLAYERS ? context.season : context.season - 1;
	const prior = p.stats.filter(s => !s.playoffs && s.tid === tid);
	if (context.salaryCapType !== "soft" || context.phase !== PHASE.FREE_AGENCY ||
		p.tid !== PLAYER.FREE_AGENT || p.priorContractTid !== tid || p.yearsFreeAgent > 0 ||
		p.numDaysFreeAgent < 14 || p.injury.gamesRemaining > 14 ||
		!prior.some(s => s.season === lastSeason - 1) ||
		prior.filter(s => s.season === lastSeason).reduce((min, row) => min + (row.min ?? 0), 0) < 500) {
		return { eligible: false, reason: "continuity, recent role, availability, or timing" };
	}

	const depth = roster.filter(q => q.contract.type !== "twoWay" && q.injury.gamesRemaining <= 14)
		.map(q => q.valueNoPot).sort((a, b) => b - a);
	const floor = depth.at(Math.min(7, depth.length - 1));
	if (floor !== undefined && p.valueNoPot <= floor) {
		return { eligible: false, reason: "no rotation upgrade", floor };
	}
	const { willing, probWilling } = await moodInfo(p, tid, { contractAmount: p.contract.amount });
	return { eligible: willing, reason: willing ? "eligible incumbent return" : "player declines", floor, willing, probWilling };
}
