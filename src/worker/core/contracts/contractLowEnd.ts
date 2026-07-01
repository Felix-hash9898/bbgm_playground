import { isSport } from "../../../common/index.ts";
import type { MinimalPlayerRatings, Player } from "../../../common/types.ts";
import { g, helpers } from "../../util/index.ts";
import { getMaxContractForPlayer } from "./contractLimits.ts";
import { getMinContractForPlayer } from "./contractMinimum.ts";

type PlayerForLowEnd = Pick<
	Player<MinimalPlayerRatings>,
	"awards" | "born" | "draft" | "ratings" | "value" | "valueNoPot"
>;

const getAge = (p: PlayerForLowEnd) => {
	return g.get("season") - p.born.year;
};

const getYearsSinceDraft = (p: PlayerForLowEnd) => {
	return g.get("season") - p.draft.year;
};

const getCurrentValue = (p: PlayerForLowEnd) => {
	return p.valueNoPot ?? p.value;
};

const getOvr = (p: PlayerForLowEnd) => {
	return p.ratings.at(-1)!.ovr;
};

const isUndrafted = (p: PlayerForLowEnd) => {
	return p.draft.round <= 0 || p.draft.pick <= 0;
};

export const isUndraftedRookieLike = (p: PlayerForLowEnd) => {
	if (!isSport("basketball")) {
		return false;
	}

	return (
		isUndrafted(p) &&
		getAge(p) <= 23 &&
		getYearsSinceDraft(p) <= 1
	);
};

export const isLowEndYoungFreeAgent = (p: PlayerForLowEnd) => {
	if (!isSport("basketball")) {
		return false;
	}

	return (
		p.draft.round !== 1 &&
		getAge(p) <= 24 &&
		getYearsSinceDraft(p) <= 3 &&
		getOvr(p) <= 47 &&
		getCurrentValue(p) <= 47 &&
		p.value <= 52
	);
};

export const getLowEndContractTarget = (p: PlayerForLowEnd) => {
	const playerMinimum = getMinContractForPlayer(p);

	if (isUndraftedRookieLike(p)) {
		return playerMinimum;
	}

	if (isLowEndYoungFreeAgent(p)) {
		return helpers.roundContract(playerMinimum * 1.25);
	}
};

export const getMaxContractDemandForPlayer = (p: PlayerForLowEnd) => {
	const lowEndTarget = getLowEndContractTarget(p);
	const maxContract = getMaxContractForPlayer(p);

	return lowEndTarget === undefined
		? maxContract
		: Math.min(maxContract, lowEndTarget);
};

export const clampContractDemandForPlayer = (
	p: PlayerForLowEnd,
	amount: number,
) => {
	return helpers.bound(
		amount,
		getMinContractForPlayer(p),
		getMaxContractDemandForPlayer(p),
	);
};
