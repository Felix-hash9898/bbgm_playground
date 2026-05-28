import { g, helpers, random } from "../../util/index.ts";
import type {
	MinimalPlayerRatings,
	Player,
	PlayerContract,
	PlayerWithoutKey,
} from "../../../common/types.ts";
import { isSport } from "../../../common/index.ts";

const getMostRecentRegularSeasonMinutes = (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
) => {
	for (let i = p.stats.length - 1; i >= 0; i--) {
		const ps = p.stats[i]!;
		if (!ps.playoffs) {
			return ps.min ?? 0;
		}
	}

	return 0;
};

const getBasketballSalaryAgeFactor = (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
) => {
	const age = g.get("season") - p.born.year;
	const recentMin = getMostRecentRegularSeasonMinutes(p);

	// Young players with limited NBA minutes tend to get paid for projection in the
	// current model. Pull them down a bit unless they are already established.
	if (age <= 20 && recentMin < 1500) {
		return 0.8;
	}
	if (age <= 21 && recentMin < 1500) {
		return 0.84;
	}
	if (age <= 22 && recentMin < 1500) {
		return 0.88;
	}
	if (age <= 23 && recentMin < 1500) {
		return 0.92;
	}
	if (age <= 24 && recentMin < 1500) {
		return 0.96;
	}

	// Established veterans were coming in too cheap. Add a moderate premium that
	// peaks in the early 30s, but only for players with a real rotation sample.
	if (recentMin >= 1200) {
		if (age <= 28) {
			return 1;
		}
		if (age === 29) {
			return 1.03;
		}
		if (age === 30) {
			return 1.06;
		}
		if (age === 31) {
			return 1.08;
		}
		if (age === 32) {
			return 1.1;
		}
		if (age === 33) {
			return 1.1;
		}
		if (age === 34) {
			return 1.08;
		}
		if (age === 35) {
			return 1.05;
		}
		if (age === 36) {
			return 1.02;
		}
	}

	return 1;
};

export const getContractValue = (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
) => {
	if (!isSport("basketball")) {
		return p.value;
	}

	const age = g.get("season") - p.born.year;
	const recentMin = getMostRecentRegularSeasonMinutes(p);
	const currentValue = p.valueNoPot ?? p.value;
	const futureValue = p.value;

	// Top-end current stars should still price like top-end current stars, even if
	// they are older. Younger and less established players keep some upside premium,
	// but not enough to make contract value look like trade value.
	if (currentValue >= 78) {
		return 0.9 * currentValue + 0.1 * futureValue;
	}
	if (currentValue >= 70) {
		return 0.82 * currentValue + 0.18 * futureValue;
	}
	if (age <= 24 && recentMin < 1500) {
		return 0.72 * currentValue + 0.28 * futureValue;
	}
	if (age <= 28) {
		return 0.8 * currentValue + 0.2 * futureValue;
	}

	return 0.88 * currentValue + 0.12 * futureValue;
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
	const ratings = p.ratings.at(-1)!;
	const contractValue = getContractValue(p);
	let factor = g.get("salaryCapType") === "hard" ? 1.6 : 2;
	let factor2 = 1;

	if (isSport("basketball")) {
		factor *= 1.7;
	}

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

	if (isSport("baseball")) {
		factor *= 1.4;
	}

	if (isSport("hockey")) {
		factor *= 1.4;
	}

	let amount =
		((factor2 * contractValue) / 100 - 0.47) *
			factor *
			(g.get("maxContract") - g.get("minContract")) +
		g.get("minContract");

	if (isSport("basketball")) {
		amount *= getBasketballSalaryAgeFactor(p);
	}

	if (randomizeAmount) {
		amount *= helpers.bound(random.realGauss(1, 0.1), 0, 2); // Randomize
	}

	if (!noLimit) {
		if (amount < g.get("minContract") * 1.1) {
			amount = g.get("minContract");
		} else if (amount > g.get("maxContract")) {
			amount = g.get("maxContract");
		}
	} else if (amount < 0) {
		// Well, at least keep it positive
		amount = 0;
	}

	amount = helpers.roundContract(amount);

	return {
		amount,
		exp: g.get("season"),
	};
};

export default genContract;
