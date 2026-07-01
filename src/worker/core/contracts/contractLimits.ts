import { AWARD_NAMES, isSport } from "../../../common/index.ts";
import type { Player, PlayerContract } from "../../../common/types.ts";
import { g, helpers } from "../../util/index.ts";
import {
	getContractCapHit,
	getMinContractForPlayer,
	isMinimumContractForPlayer,
} from "./contractMinimum.ts";

type AwardLike = {
	season: number;
	type: string;
};

type PlayerWithAwards = Pick<Player, "awards" | "born" | "draft">;

export const getMinContract = () => g.get("minContract");

export const getMaxContract = () => g.get("maxContract");

export const clampContractAmount = (amount: number) => {
	return helpers.bound(amount, getMinContract(), getMaxContract());
};

export const isMinimumContract = (amount: number) => {
	return amount <= getMinContract() + 1;
};

export const canGoOverCapToSignMinimumContract = (
	p: PlayerWithAwards,
	amount: number,
) => {
	return isMinimumContractForPlayer(p, amount);
};

export const canSignContractUnderSalaryCapRules = ({
	birdException,
	contract,
	p,
	payroll,
}: {
	birdException: boolean;
	contract: PlayerContract;
	p: PlayerWithAwards;
	payroll: number;
}) => {
	const salaryCapType = g.get("salaryCapType");
	if (salaryCapType === "none" || birdException) {
		return true;
	}

	const capHit = getContractCapHit(contract);
	if (payroll + capHit - 1 <= g.get("salaryCap")) {
		return true;
	}

	return canGoOverCapToSignMinimumContract(p, contract.amount);
};

export const getYearsOfService = (p: PlayerWithAwards) => {
	return Math.max(0, g.get("season") - p.draft.year);
};

const hasRecentAwards = (awards: AwardLike[], seasonWindow: number) => {
	const season = g.get("season");
	return awards.some((award) => season - award.season <= seasonWindow);
};

const hasAtLeastNRecentAwards = (
	awards: AwardLike[],
	seasonWindow: number,
	minimumCount: number,
) => {
	const season = g.get("season");
	return (
		awards.filter((award) => season - award.season <= seasonWindow).length >=
		minimumCount
	);
};

const hasAllLeagueRecentForm = (awards: AwardLike[]) => {
	const allLeagueAwards = awards.filter((award) =>
		award.type.includes("All-League"),
	);

	return (
		hasRecentAwards(allLeagueAwards, 1) ||
		hasAtLeastNRecentAwards(allLeagueAwards, 3, 2)
	);
};

const hasRoseOrHigherMaxQualification = (p: PlayerWithAwards) => {
	return (
		hasRecentAwards(
			p.awards.filter(
				(award) =>
					award.type === AWARD_NAMES.mvp ||
					award.type === AWARD_NAMES.dpoy,
			),
			1,
		) ||
		hasAllLeagueRecentForm(p.awards)
	);
};

export const getMaxSalaryTier = (p: PlayerWithAwards) => {
	if (!isSport("basketball")) {
		return Math.round((getMaxContract() / g.get("salaryCap")) * 100);
	}

	const yearsOfService = getYearsOfService(p);
	if (yearsOfService >= 10) {
		return 35;
	}

	if (yearsOfService >= 7) {
		return 30;
	}

	return hasRoseOrHigherMaxQualification(p) ? 30 : 25;
};

export const getDynamicMaxContractAmount = (p: PlayerWithAwards) => {
	if (!isSport("basketball")) {
		return getMaxContract();
	}

	return Math.round((g.get("salaryCap") * getMaxSalaryTier(p)) / 100);
};

export const getMaxContractForPlayer = (p: PlayerWithAwards) => {
	if (!isSport("basketball")) {
		return getMaxContract();
	}

	return getDynamicMaxContractAmount(p);
};

export const clampContractAmountForPlayer = (
	p: PlayerWithAwards,
	amount: number,
) => {
	return helpers.bound(
		amount,
		getMinContractForPlayer(p),
		getMaxContractForPlayer(p),
	);
};
