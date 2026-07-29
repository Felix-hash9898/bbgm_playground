import { PLAYER } from "../../../../common/index.ts";
import type { PlayerWithoutKey } from "../../../../common/types.ts";
import { getTradeReputationByTid } from "../../player/getTradeReputation.ts";

/**
 * Imports run before the new league's game attributes are installed in `g`.
 * Keep the season explicit here so the free-agent snapshot is calculated from
 * the imported league data rather than the previous league (or no league).
 */
const backfillImportedFreeAgentTradeReputation = async (
	activePlayers: PlayerWithoutKey[],
	season: number,
) => {
	const tradeReputationByTid = await getTradeReputationByTid(season);
	for (const p of activePlayers) {
		if (p.tid === PLAYER.FREE_AGENT && p.tradeReputationByTid === undefined) {
			p.tradeReputationByTid = { ...tradeReputationByTid };
		}
	}
};

export default backfillImportedFreeAgentTradeReputation;
