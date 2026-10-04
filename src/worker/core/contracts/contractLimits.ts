import { AWARD_NAMES, isSport } from "../../../common/index.ts";
import type { Player, PlayerContract, Team } from "../../../common/types.ts";
import { g, helpers } from "../../util/index.ts";
import { getMinContractForPlayer } from "./contractMinimum.ts";
import {
	getContractExceptionResult,
	type ContractExceptionResult,
} from "./contractMidLevel.ts";

type AwardLike = {
	season: number;
	type: string;
};

type PlayerWithAwards = Pick<
	Player,
	"awards" | "born" | "draft" | "transactions" | "salaries" | "tid" | "contract"
>;

export const getMinContract = () => g.get("minContract");

export const getMaxContract = () => g.get("maxContract");

export const clampContractAmount = (amount: number) => {
	return helpers.bound(amount, getMinContract(), getMaxContract());
};

export const isMinimumContract = (amount: number) => {
	return amount <= getMinContract() + 1;
};

export const canSignContractUnderSalaryCapRules = ({
	birdException,
	contract,
	p,
	payroll,
	team,
}: {
	birdException: boolean;
	contract: PlayerContract;
	p: PlayerWithAwards;
	payroll: number;
	team?: Pick<Team, "midLevelExceptionUsedSeason" | "tid">;
}) => {
	return (
		getContractExceptionResult({
			birdException,
			contract,
			p,
			payroll,
			team,
		}).type !== undefined
	);
};

export const getContractException = ({
	birdException,
	contract,
	p,
	payroll,
	team,
}: {
	birdException: boolean;
	contract: PlayerContract;
	p: PlayerWithAwards;
	payroll: number;
	team?: Pick<Team, "midLevelExceptionUsedSeason" | "tid">;
}): ContractExceptionResult => {
	return getContractExceptionResult({
		birdException,
		contract,
		p,
		payroll,
		team,
	});
};

export const getYearsOfService = (p: PlayerWithAwards) => {
	return Math.max(0, g.get("season") - p.draft.year);
};

export const hasRoseOrHigherMaxQualification = (p: PlayerWithAwards) => {
	const season = g.get("season");
	const qualifyingAwards = p.awards.filter(
		(award) =>
			award.season < season &&
			season - award.season <= 3 &&
			(award.type === AWARD_NAMES.mvp ||
				award.type === AWARD_NAMES.dpoy ||
				award.type.includes("All-League")),
	);
	const hasPreviousSeasonQualifyingAward = qualifyingAwards.some(
		(award) =>
			season - award.season === 1 &&
			(award.type === AWARD_NAMES.mvp ||
				award.type === AWARD_NAMES.dpoy ||
				award.type.includes("All-League")),
	);
	return (
		hasPreviousSeasonQualifyingAward ||
		new Set(
			qualifyingAwards
				.filter((award) => award.type.includes("All-League"))
				.map((award) => award.season),
		).size >= 2 ||
		qualifyingAwards.some(
			(award) => award.type === AWARD_NAMES.mvp && season - award.season <= 3,
		)
	);
};

const hasDesignatedVeteranTeamHistory = (
	p: PlayerWithAwards,
	teamTid: number,
) => {
	const draftTid = p.draft.originalTid;
	if (draftTid < 0) {
		return false;
	}

	// An early trade in the first four cap years preserves designation eligibility.
	// A later trade or voluntary signing with another team breaks continuity.
	const firstTeamChange = (p.transactions ?? [])
		.filter(
			(transaction) =>
				(transaction.type === "trade" || transaction.type === "freeAgent") &&
				transaction.season >= p.draft.year,
		)
		.sort((a, b) => a.season - b.season || a.phase - b.phase)[0];

	if (firstTeamChange) {
		if (
			firstTeamChange.season - p.draft.year <= 4 &&
			firstTeamChange.type === "trade"
		) {
			return firstTeamChange.tid === teamTid;
		}
		return false;
	}

	return (
		teamTid === draftTid ||
		p.transactions?.some(
			(transaction) =>
				transaction.type === "draft" && transaction.tid === teamTid,
		) === true ||
		(p.transactions ?? []).length === 0
	);
};

const getOrdinaryMaxTier = (yearsOfService: number) => {
	if (yearsOfService >= 10) {
		return 35;
	}
	if (yearsOfService >= 7) {
		return 30;
	}
	return 25;
};

const getPriorSalary = (p: PlayerWithAwards) => {
	const finalSalarySeason = g.get("season") - 1;
	const prior = (p.salaries ?? [])
		.filter((salary) => salary.season === finalSalarySeason)
		.sort((a, b) => b.amount - a.amount)[0];
	return prior?.amount;
};

const getOrdinaryMaxAmount = (p: PlayerWithAwards, yearsOfService: number) => {
	const salaryCap = g.get("salaryCap");
	const ordinaryTier = getOrdinaryMaxTier(yearsOfService);
	const percentageAmount = (salaryCap * ordinaryTier) / 100;
	const priorSalary = getPriorSalary(p);
	return Math.round(
		Math.max(percentageAmount, priorSalary ? priorSalary * 1.05 : 0),
	);
};

export const getMaxSalaryTier = (p: PlayerWithAwards) => {
	if (!isSport("basketball")) {
		return Math.round((getMaxContract() / g.get("salaryCap")) * 100);
	}

	const yearsOfService = getYearsOfService(p);
	const ordinaryTier = getOrdinaryMaxTier(yearsOfService);
	if (
		yearsOfService === 4 &&
		p.tid >= 0 &&
		p.tid === p.draft.originalTid &&
		hasRoseOrHigherMaxQualification(p)
	) {
		return 30;
	}
	return ordinaryTier;
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
	const yearsOfService = getYearsOfService(p);
	const ordinaryAmount = getOrdinaryMaxAmount(p, yearsOfService);
	const tier = getMaxSalaryTier(p);
	const percentageAmount = Math.round((g.get("salaryCap") * tier) / 100);
	return Math.max(percentageAmount, ordinaryAmount);
};

export const getMaxContractForPlayerAndTerm = (
	p: PlayerWithAwards,
	teamTid: number,
	contractYears: number,
) => {
	if (!isSport("basketball")) {
		return getMaxContract();
	}
	const yearsOfService = getYearsOfService(p);
	const supermaxEligible =
		(yearsOfService === 8 || yearsOfService === 9) &&
		teamTid >= 0 &&
		hasDesignatedVeteranTeamHistory(p, teamTid) &&
		hasRoseOrHigherMaxQualification(p) &&
		contractYears === 5;
	if (supermaxEligible) {
		return Math.round((g.get("salaryCap") * 35) / 100);
	}
	if (yearsOfService === 8 || yearsOfService === 9) {
		return Math.max(
			Math.round((g.get("salaryCap") * 30) / 100),
			getOrdinaryMaxAmount(p, yearsOfService),
		);
	}
	return getMaxContractForPlayer(p);
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
