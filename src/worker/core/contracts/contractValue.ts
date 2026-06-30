import { isSport } from "../../../common/index.ts";
import type {
	MinimalPlayerRatings,
	Player,
	PlayerWithoutKey,
} from "../../../common/types.ts";
import { g } from "../../util/index.ts";

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

export const getBasketballSalaryAgeFactor = (
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
