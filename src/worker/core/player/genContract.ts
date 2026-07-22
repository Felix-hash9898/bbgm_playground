import { g, helpers, random } from "../../util/index.ts";
import type {
	MinimalPlayerRatings,
	Player,
	PlayerContract,
	PlayerWithoutKey,
} from "../../../common/types.ts";
import { isSport } from "../../../common/index.ts";
import { clampContractDemandForPlayer } from "../contracts/contractLowEnd.ts";
import {
	getMinContractForPlayer,
	withContractCapHitForPlayer,
} from "../contracts/contractMinimum.ts";
import { getContractValue } from "../contracts/contractValue.ts";
import { getBasketballContractMarketDemand } from "../contracts/contractMarket/index.ts";

const getLegacyContractAmount = (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
	contractValue: number,
) => {
	const ratings = p.ratings.at(-1)!;
	let factor = g.get("salaryCapType") === "hard" ? 1.6 : 2;
	let factor2 = 1;

	if (isSport("football")) {
		if (ratings.pos === "QB") {
			if (contractValue >= 75) {
				factor2 *= 1.25;
			} else if (contractValue >= 50) {
				factor2 *= 0.75 + ((contractValue - 50) * 0.5) / 25;
			}
		} else if (ratings.pos === "K" || ratings.pos === "P") {
			factor *= 0.25;
		}
	}

	if (isSport("baseball") || isSport("hockey")) {
		factor *= 1.4;
	}

	return (
		((factor2 * contractValue) / 100 - 0.47) *
			factor *
			(g.get("maxContract") - g.get("minContract")) +
		g.get("minContract")
	);
};

/**
 * Generate a contract for a player.
 *
 * @memberOf core.player
 * @param {Object} ratings Player object. At a minimum, this must have one entry in the ratings array.
 * @param {boolean} randomizeExp If true, then it is assumed that some random amount of years has elapsed since the contract was signed, thus decreasing the expiration date. This is used when generating players in a new league.
 * @return {Object.<string, number>} Object containing two properties with integer values, "amount" with the contract amount in thousands of dollars and "exp" with the contract expiration year.
 */
const genContract = (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
	randomizeAmount: boolean = true,
	noLimit: boolean = false,
): PlayerContract => {
	const contractValue = getContractValue(p);
	let amount = isSport("basketball")
		? getBasketballContractMarketDemand(p).pointAmount
		: getLegacyContractAmount(p, contractValue);

	if (randomizeAmount) {
		amount *= helpers.bound(random.realGauss(1, 0.1), 0, 2); // Randomize
	}

	const playerMinimum = getMinContractForPlayer(p);
	if (!noLimit) {
		if (amount < playerMinimum * 1.1) {
			amount = playerMinimum;
		} else {
			amount = clampContractDemandForPlayer(p, amount);
		}
	} else if (amount < 0) {
		// Well, at least keep it positive
		amount = 0;
	}

	amount = helpers.roundContract(amount);

	return withContractCapHitForPlayer(p, {
		amount,
		exp: g.get("season"),
	});
};

export default genContract;
