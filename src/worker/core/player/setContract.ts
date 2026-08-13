import { PHASE } from "../../../common/index.ts";
import { g } from "../../util/index.ts";
import type {
	Phase,
	PlayerContract,
	PlayerWithoutKey,
} from "../../../common/types.ts";

/**
 * Store a contract in a player object.
 *
 * @memberOf core.player
 * @param {Object} p Player object.
 * @param {Object} contract Contract object with two properties,    exp (year) and amount (thousands of dollars).
 * @param {boolean} signed Is this an official signed contract (true), or just part of a negotiation (false)?
 * @return {Object} Updated player object.
 */
const setContract = (
	p: Pick<PlayerWithoutKey, "contract" | "salaries">,
	contract: PlayerContract,
	signed: boolean,
	options?: {
		season?: number;
		phase?: Phase;
		minContract?: number;
	},
) => {
	// Sigh, don't know why this is needed, but people tell me that sometimes the #1 pick has a massively negative contract
	if (contract.amount < 0) {
		contract.amount = options?.minContract ?? g.get("minContract");
	}

	p.contract = contract;

	// Only write to salary log if the player is actually signed. Otherwise, we're just generating a value for a negotiation.
	if (signed) {
		// Is this contract beginning with an in-progress season, or next season?
		let start = options?.season ?? g.get("season");

		if ((options?.phase ?? g.get("phase")) > PHASE.AFTER_TRADE_DEADLINE) {
			start += 1;
		}

		for (let i = start; i <= p.contract.exp; i++) {
			p.salaries.push({
				season: i,
				amount: contract.amount,
			});
		}
	}
};

export default setContract;
