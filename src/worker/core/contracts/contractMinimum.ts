import { PHASE, isSport } from "../../../common/index.ts";
import type { Player, PlayerContract } from "../../../common/types.ts";
import { g, helpers } from "../../util/index.ts";

const REAL_MINIMUM_SALARY_SCALE = [
	1017781, 1637966, 1836090, 1902133, 1968175, 2133278, 2298385, 2463490,
	2628597, 2641682, 2905851,
];

type PlayerForMinimum = Pick<Player, "born" | "draft">;

const isTwoWayContract = (contract: PlayerContract) =>
	contract.type === "twoWay";

const getCurrentAge = (p: PlayerForMinimum) => g.get("season") - p.born.year;

export const getYearsOfExperience = (p: PlayerForMinimum) => {
	if (!isSport("basketball")) {
		return 0;
	}

	let years = g.get("season") - p.draft.year;
	if (!Number.isFinite(years)) {
		years = getCurrentAge(p) - 19;
	}

	return helpers.bound(Math.floor(years), 0, 10);
};

export const getMinimumSalaryForYearsExperience = (years: number) => {
	const yearsBounded = helpers.bound(Math.floor(years), 0, 10);
	const ratio =
		REAL_MINIMUM_SALARY_SCALE[yearsBounded]! / REAL_MINIMUM_SALARY_SCALE[0]!;

	return helpers.roundContract(g.get("minContract") * ratio);
};

export const getMinContractForPlayer = (p: PlayerForMinimum) => {
	if (!isSport("basketball")) {
		return g.get("minContract");
	}

	return getMinimumSalaryForYearsExperience(getYearsOfExperience(p));
};

export const isMinimumContractForPlayer = (
	p: PlayerForMinimum,
	contractOrAmount: PlayerContract | number,
) => {
	const amount =
		typeof contractOrAmount === "number"
			? contractOrAmount
			: contractOrAmount.amount;

	return amount <= getMinContractForPlayer(p) + 1;
};

export const clampToPlayerMinimum = (
	p: PlayerForMinimum,
	amount: number,
) => {
	return Math.max(amount, getMinContractForPlayer(p));
};

export const getContractCapHit = (contract: PlayerContract) => {
	if (isTwoWayContract(contract)) {
		return 0;
	}

	return contract.capHit ?? contract.amount;
};

const isOneYearContract = (contract: Pick<PlayerContract, "exp">) => {
	const offset = g.get("phase") <= PHASE.PLAYOFFS ? -1 : 0;
	return contract.exp - g.get("season") - offset === 1;
};

export const getMinimumSalaryCapHitForPlayer = (
	p: PlayerForMinimum,
	contract?: Pick<PlayerContract, "exp">,
) => {
	const minimum = getMinContractForPlayer(p);
	if (!isSport("basketball")) {
		return minimum;
	}

	if (contract && !isOneYearContract(contract)) {
		return minimum;
	}

	return Math.min(minimum, getMinimumSalaryForYearsExperience(2));
};

export const withContractCapHitForPlayer = (
	p: PlayerForMinimum,
	contract: PlayerContract,
): PlayerContract => {
	if (
		isTwoWayContract(contract) ||
		!isMinimumContractForPlayer(p, contract) ||
		!isOneYearContract(contract)
	) {
		const { capHit: _capHit, ...contractWithoutCapHit } = contract;
		return contractWithoutCapHit;
	}

	const capHit = getMinimumSalaryCapHitForPlayer(p, contract);
	if (capHit >= contract.amount) {
		const { capHit: _capHit, ...contractWithoutCapHit } = contract;
		return contractWithoutCapHit;
	}

	return {
		...contract,
		capHit,
	};
};
