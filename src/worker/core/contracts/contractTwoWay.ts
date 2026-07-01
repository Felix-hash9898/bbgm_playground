import { PHASE, isSport } from "../../../common/index.ts";
import type {
	MinimalPlayerRatings,
	Player,
	PlayerContract,
} from "../../../common/types.ts";
import { g } from "../../util/index.ts";
import {
	isLowEndYoungFreeAgent,
	isUndraftedRookieLike,
} from "./contractLowEnd.ts";
import { getMinContract } from "./contractLimits.ts";

type PlayerForTwoWay = Pick<
	Player<MinimalPlayerRatings>,
	| "awards"
	| "born"
	| "contract"
	| "draft"
	| "ratings"
	| "tid"
	| "value"
	| "valueNoPot"
>;

export const getContractType = (contract: PlayerContract) =>
	contract.type ?? "standard";

export const isTwoWayContract = (contract: PlayerContract) =>
	getContractType(contract) === "twoWay";

export const isStandardContract = (contract: PlayerContract) =>
	getContractType(contract) === "standard";

export const getTwoWayContractAmount = () => getMinContract();

export const makeTwoWayContract = (): PlayerContract => ({
	amount: getTwoWayContractAmount(),
	exp:
		g.get("phase") <= PHASE.AFTER_TRADE_DEADLINE
			? g.get("season")
			: g.get("season") + 1,
	type: "twoWay",
});

const isYoungNonFirstRoundPlayer = (p: PlayerForTwoWay) => {
	return g.get("season") - p.born.year <= 24 && p.draft.round !== 1;
};

export const canOfferTwoWay = (p: PlayerForTwoWay) => {
	if (!isSport("basketball")) {
		return false;
	}

	return (
		isYoungNonFirstRoundPlayer(p) &&
		(isUndraftedRookieLike(p) || isLowEndYoungFreeAgent(p))
	);
};

export const countTwoWayContracts = (
	players: PlayerForTwoWay[],
	tid: number,
) => {
	return players.filter(
		(p) => p.tid === tid && isTwoWayContract(p.contract),
	).length;
};

export const canTeamAddTwoWay = (
	players: PlayerForTwoWay[],
	tid: number,
) => {
	if (!isSport("basketball")) {
		return false;
	}

	return countTwoWayContracts(players, tid) < 3;
};

export const countStandardContracts = (
	players: PlayerForTwoWay[],
	tid: number,
) => {
	return players.filter(
		(p) => p.tid === tid && isStandardContract(p.contract),
	).length;
};
