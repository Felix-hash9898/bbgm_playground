import { PLAYER } from "../../../common/index.ts";
import type {
	MinimalPlayerRatings,
	Player,
	PlayerWithoutKey,
} from "../../../common/types.ts";
import { getTradeReputationByTid } from "./getTradeReputation.ts";

/**
 * Adds player to the free agents list.
 *
 * This should be THE ONLY way that players are added to the free agents
 * list, because this will also calculate their demanded contract and mood.
 *
 * @memberOf core.player
 * @param {Object} p Player object.
 */
const addToFreeAgents = async (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
	tradeReputationByTid?: Record<number, number>,
) => {
	p.tid = PLAYER.FREE_AGENT;
	p.numDaysFreeAgent = 0;
	p.ptModifier = 1;
	delete p.targetMinutes;
	p.usageBias = 1;
	p.tradeReputationByTid = {
		...(tradeReputationByTid ?? (await getTradeReputationByTid())),
	};
};

export default addToFreeAgents;
