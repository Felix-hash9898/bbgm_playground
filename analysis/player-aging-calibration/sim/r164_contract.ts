import { PHASE, PLAYER } from "../../../src/common/index.ts";
import type { Player } from "../../../src/common/types.ts";
import type { CapturedSigningContext } from "../../../src/worker/core/capturedContext.ts";
import { g } from "../../../src/worker/util/index.ts";
import { ordinaryRights } from "./r163_market.ts";

/** One rule for AI and user teams: a proven incumbent may re-sign its own player over the cap in the last week. */
export const lateIncumbentRights = (p: Player, tid: number, context: CapturedSigningContext) =>
	g.get("daysLeft") <= 8 && ordinaryRights(p, tid, context);

/**
 * A healthy regular of the last season who is still unsigned in the closing week of free agency, or once games have
 * started, lowers the market price everybody sees. The player minimum and the ordinary clamps still apply afterwards.
 */
export function lateAskCut(p: Player) {
	if (p.tid !== PLAYER.FREE_AGENT || p.yearsFreeAgent > 0 || p.numDaysFreeAgent < 23 || p.injury.gamesRemaining > 0) return 0;
	const phase = g.get("phase");
	const offseason = phase === PHASE.FREE_AGENCY;
	const inSeason = phase === PHASE.REGULAR_SEASON || phase === PHASE.AFTER_TRADE_DEADLINE;
	if (!inSeason && !(offseason && g.get("daysLeft") <= 8)) return 0;
	const last = offseason ? g.get("season") : g.get("season") - 1;
	const minutes = p.stats.reduce((sum, s) => sum + (!s.playoffs && s.season === last ? s.min : 0), 0);
	return minutes >= 1000 ? (offseason ? .05 : .02) * p.contract.amount : 0;
}
