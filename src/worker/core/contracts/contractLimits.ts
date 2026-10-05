import { AWARD_NAMES, PHASE, isSport } from "../../../common/index.ts";
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

type PlayerWithAwards = Pick<Player, "awards" | "born" | "draft"> &
	Partial<
		Pick<
			Player,
			| "transactions"
			| "salaries"
			| "tid"
			| "priorContractTid"
			| "stats"
			| "firstNBAContract"
		>
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
	if (!isSport("basketball")) {
		return Math.max(0, g.get("season") - p.draft.year);
	}
	// Stats rows record roster membership, including seasons with no games played.
	// Salary logs are a fallback for imports without roster rows; never count
	// future guaranteed salaries or infer unsigned years from draft metadata.
	// Prefer roster rows because salary logs can retain pay after release. When
	// both logs are absent, transactions establish only their individual seasons.
	const lastSeason = getLastCompletedSeason();
	const rosterSeasons = (p.stats ?? [])
		.filter((row) => row.tid >= 0 && !row.playoffs)
		.map((row) => row.season);
	const salarySeasons = (p.salaries ?? []).map((row) => row.season);
	const seasons = (p.stats ?? []).some((row) => row.tid >= 0)
		? rosterSeasons
		: salarySeasons.length > 0
			? salarySeasons
			: (p.transactions ?? [])
					.filter((row) => row.tid >= 0 && row.type !== "draft")
					.map((row) =>
						row.type === "freeAgent" ? firstCoveredSeason(row) : row.season,
					);
	return new Set(seasons.filter((season) => season <= lastSeason)).size;
};

// newPhaseBeforeDraft finalizes the season (awards and completed_season) before
// DRAFT_LOTTERY. DRAFT and AFTER_DRAFT retain that completed season label, and
// re-signing runs while still in AFTER_DRAFT. Count it throughout this offseason;
// preseason advances the label. Special draft phases do not complete a season.
const getLastCompletedSeason = () =>
	g.get("season") - (g.get("phase") > PHASE.PLAYOFFS ? 0 : 1);

export const hasRoseOrHigherMaxQualification = (p: PlayerWithAwards) => {
	const lastSeason = getLastCompletedSeason();
	const awards = p.awards.filter(
		(award) => award.season <= lastSeason && award.season >= lastSeason - 2,
	);
	const isAllNBAOrDPOY = (award: AwardLike) =>
		award.type === AWARD_NAMES.dpoy || award.type.includes("All-League");
	return (
		awards.some((award) => award.type === AWARD_NAMES.mvp) ||
		awards.some(
			(award) => award.season === lastSeason && isAllNBAOrDPOY(award),
		) ||
		new Set(awards.filter(isAllNBAOrDPOY).map((award) => award.season)).size >=
			2
	);
};

const firstCoveredSeason = (contract: { season: number; phase: number }) =>
	contract.season + (contract.phase > PHASE.AFTER_TRADE_DEADLINE ? 1 : 0);

const hasQualifyingVeteranFreeAgentContinuity = (p: PlayerWithAwards) => {
	// Salary logs include future guarantees and retained pay after release, so
	// they cannot establish whether a Player Contract covered a particular year.
	// Roster rows (even with zero games), executed signings, and trades establish
	// their individual cap years. Never infer an unknown term or fill a gap.
	const contractedSeasons = new Set([
		...(p.stats ?? []).filter((row) => row.tid >= 0).map((row) => row.season),
		...(p.transactions ?? [])
			.filter((row) => row.tid >= 0 && row.type !== "draft")
			.map(firstCoveredSeason),
		...(p.firstNBAContract && p.firstNBAContract.tid >= 0
			? [firstCoveredSeason(p.firstNBAContract)]
			: []),
	]);
	const lastSeason = getLastCompletedSeason();
	return [lastSeason, lastSeason - 1, lastSeason - 2].every((season) =>
		contractedSeasons.has(season),
	);
};

const hasDesignatedVeteranTeamHistory = (
	p: PlayerWithAwards,
	teamTid: number,
) => {
	const transactions = [...(p.transactions ?? [])]
		.filter((transaction) => transaction.season >= p.draft.year)
		.sort((a, b) => a.season - b.season || a.phase - b.phase);
	// Legacy saves: chronological roster evidence is stronger than draft metadata.
	// A trade identifies the contracted team before the move. Draft transaction
	// tid is the selecting team, unlike originalTid (the original pick owner).
	const evidence = [
		...transactions
			.filter((transaction) => transaction.type !== "draft")
			.map((transaction) => ({
				season: transaction.season,
				phase: transaction.phase,
				tid:
					transaction.type === "trade" ? transaction.fromTid : transaction.tid,
			})),
		...(p.stats ?? [])
			.filter((row) => row.tid >= 0)
			.map((row) => ({
				season: row.season,
				phase: PHASE.PRESEASON,
				tid: row.tid,
			})),
	]
		.filter((row) => row.tid >= 0)
		.sort((a, b) => a.season - b.season || a.phase - b.phase);
	const firstContract =
		p.firstNBAContract ??
		evidence[0] ??
		transactions.find((row) => row.type === "draft");
	// Stats already name covered seasons. Transaction/snapshot dates name the
	// signing season, which may precede the first salary season by one year.
	const coveredSeasons = [
		...(p.salaries ?? []).map((row) => row.season),
		...(p.stats ?? []).filter((row) => row.tid >= 0).map((row) => row.season),
		...(p.transactions ?? [])
			.filter((row) => row.type === "freeAgent")
			.map(firstCoveredSeason),
	];
	if (p.firstNBAContract) {
		coveredSeasons.push(firstCoveredSeason(p.firstNBAContract));
	}
	// Count only evidenced contracted cap years, never fill unsigned gaps. A
	// signing establishes its first covered year, not an unknown contract term.
	const contractedSeasons = [...new Set(coveredSeasons)].sort((a, b) => a - b);
	// Sparse legacy histories cannot establish four contracted years. Fail closed
	// for trades rather than treating a late isolated move as a rookie trade.
	const lastEarlyTradeSeason = contractedSeasons[3];
	const isEarlyTradeSeason = (season: number) =>
		lastEarlyTradeSeason !== undefined &&
		season <= lastEarlyTradeSeason &&
		contractedSeasons.includes(season);
	let eligibleTid = firstContract?.tid ?? p.draft.tid;
	if (eligibleTid < 0) {
		return false;
	}
	for (const transaction of transactions) {
		if (
			firstContract &&
			(transaction.season < firstContract.season ||
				(transaction.season === firstContract.season &&
					transaction.phase < firstContract.phase))
		) {
			continue;
		}
		if (transaction.type === "draft") {
			continue;
		}
		if (transaction.type === "trade") {
			// Every move must preserve continuity, including moves after an early trade.
			if (
				transaction.fromTid !== eligibleTid ||
				!isEarlyTradeSeason(firstCoveredSeason(transaction))
			) {
				return false;
			}
			eligibleTid = transaction.tid;
		} else if (transaction.tid !== eligibleTid) {
			return false;
		}
	}
	// Stats can expose moves omitted from imported transaction histories.
	if (
		(p.stats ?? []).some(
			(row) =>
				row.tid >= 0 &&
				row.tid !== eligibleTid &&
				!isEarlyTradeSeason(row.season),
		)
	) {
		return false;
	}
	return teamTid === eligibleTid;
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
	// Unsigned demands overwrite p.contract. The signed salary log retains the
	// expiring contract's final salary even after normalization/addToFreeAgents.
	const lastSeason = getLastCompletedSeason();
	return [...(p.salaries ?? [])]
		.reverse()
		.filter((salary) => salary.season <= lastSeason)
		.sort((a, b) => b.season - a.season)[0]?.amount;
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

export const getPriorContractTid = (p: PlayerWithAwards) => {
	if (p.tid !== undefined && p.tid >= 0) {
		return p.tid;
	}
	if (p.priorContractTid !== undefined) {
		return p.priorContractTid;
	}
	// Legacy saves lack the free-agency snapshot. Prefer actual transaction
	// history, including rookie trades, over the drafting team.
	const lastTransaction = p.transactions?.at(-1);
	return lastTransaction?.tid ?? p.stats?.at(-1)?.tid ?? -1;
};

export const hasDesignatedVeteranContractRights = (
	p: PlayerWithAwards,
	teamTid: number,
) => {
	if (!isSport("basketball")) {
		return false;
	}
	const yearsOfService = getYearsOfService(p);
	return (
		(yearsOfService === 8 || yearsOfService === 9) &&
		teamTid >= 0 &&
		teamTid === getPriorContractTid(p) &&
		hasDesignatedVeteranTeamHistory(p, teamTid) &&
		hasQualifyingVeteranFreeAgentContinuity(p) &&
		hasRoseOrHigherMaxQualification(p)
	);
};

export const getMaxSalaryTier = (
	p: PlayerWithAwards,
	teamTid: number = p.tid ?? -1,
) => {
	if (!isSport("basketball") || g.get("salaryCapType") === "none") {
		return Math.round((getMaxContract() / g.get("salaryCap")) * 100);
	}

	const yearsOfService = getYearsOfService(p);
	const ordinaryTier = getOrdinaryMaxTier(yearsOfService);
	if (
		yearsOfService === 4 &&
		teamTid >= 0 &&
		teamTid === getPriorContractTid(p) &&
		hasRoseOrHigherMaxQualification(p)
	) {
		return 30;
	}
	return ordinaryTier;
};

export const getDynamicMaxContractAmount = (p: PlayerWithAwards) => {
	if (!isSport("basketball") || g.get("salaryCapType") === "none") {
		return getMaxContract();
	}

	return Math.round((g.get("salaryCap") * getMaxSalaryTier(p)) / 100);
};

export const getMaxContractForPlayer = (
	p: PlayerWithAwards,
	teamTid: number = p.tid ?? -1,
) => {
	if (!isSport("basketball") || g.get("salaryCapType") === "none") {
		return getMaxContract();
	}
	const yearsOfService = getYearsOfService(p);
	const ordinaryAmount = getOrdinaryMaxAmount(p, yearsOfService);
	const tier = getMaxSalaryTier(p, teamTid);
	const percentageAmount = Math.round((g.get("salaryCap") * tier) / 100);
	return Math.max(percentageAmount, ordinaryAmount);
};

export const getMaxContractForPlayerAndTerm = (
	p: PlayerWithAwards,
	teamTid: number,
	contractYears: number,
	option?: PlayerContract["option"],
) => {
	// No-cap leagues use the configured salary ceiling for every team and term;
	// NBA percentage, designation, and prior-salary rules apply only with a cap.
	if (!isSport("basketball") || g.get("salaryCapType") === "none") {
		return getMaxContract();
	}
	const yearsOfService = getYearsOfService(p);
	// Fifth Year Eligible players need four non-option seasons for any maximum
	// above 25%, including the ordinary 105%-of-prior-salary maximum.
	if (yearsOfService === 4 && contractYears - (option ? 1 : 0) < 4) {
		return Math.round(g.get("salaryCap") * 0.25);
	}
	const supermaxEligible =
		contractYears === 5 && hasDesignatedVeteranContractRights(p, teamTid);
	if (supermaxEligible) {
		return Math.max(
			Math.round((g.get("salaryCap") * 35) / 100),
			getOrdinaryMaxAmount(p, yearsOfService),
		);
	}
	if (yearsOfService === 8 || yearsOfService === 9) {
		return Math.max(
			Math.round((g.get("salaryCap") * 30) / 100),
			getOrdinaryMaxAmount(p, yearsOfService),
		);
	}
	return getMaxContractForPlayer(p, teamTid);
};

export const clampContractAmountForPlayer = (
	p: PlayerWithAwards,
	amount: number,
	teamTid: number = p.tid ?? -1,
	contractYears?: number,
) => {
	return helpers.bound(
		amount,
		getMinContractForPlayer(p),
		contractYears === undefined
			? getMaxContractForPlayer(p, teamTid)
			: getMaxContractForPlayerAndTerm(p, teamTid, contractYears),
	);
};
