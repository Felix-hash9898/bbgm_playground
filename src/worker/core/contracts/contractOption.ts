import { PHASE, isSport } from "../../../common/index.ts";
import type { MinimalPlayerRatings, Player, PlayerContract } from "../../../common/types.ts";
import { g, helpers } from "../../util/index.ts";
import { isLowEndYoungFreeAgent } from "./contractLowEnd.ts";
import { getMaxContractForPlayer } from "./contractLimits.ts";
import {
	getMinContractForPlayer,
	isMinimumContractForPlayer,
} from "./contractMinimum.ts";
import { isStandardContract } from "./contractTwoWay.ts";

export const OPTION_VALUE_RATE = 0.1;

export type ContractOption = NonNullable<PlayerContract["option"]>;

export const getContractOptionLabel = (
	option: ContractOption | undefined,
) => {
	if (option === "player") {
		return "PO";
	}
	if (option === "team") {
		return "TO";
	}
};

export const getContractOptionDisplayText = (
	contract: Pick<PlayerContract, "exp" | "option">,
) => {
	const label = getContractOptionLabel(contract.option);
	if (label === undefined) {
		return "";
	}

	return ` (${contract.exp} ${label})`;
};

export const getContractLength = (contract: Pick<PlayerContract, "exp">) => {
	const offset = g.get("phase") <= PHASE.PLAYOFFS ? 1 : 0;
	return contract.exp - g.get("season") + offset;
};

export const canContractHaveOption = (
	contract: Pick<PlayerContract, "exp" | "rookie" | "type">,
) => {
	return (
		isSport("basketball") &&
		isStandardContract(contract as PlayerContract) &&
		!contract.rookie &&
		getContractLength(contract) >= 2
	);
};

export const getOptionValue = (amount: number) =>
	helpers.roundContract(amount * OPTION_VALUE_RATE);

export const getEffectiveOfferAmount = (
	amount: number,
	option: ContractOption | undefined,
) => {
	if (option === "player") {
		return amount + getOptionValue(amount);
	}
	if (option === "team") {
		return amount - getOptionValue(amount);
	}
	return amount;
};

export const getRealAmountForEffectiveOffer = (
	effectiveAmount: number,
	option: ContractOption | undefined,
) => {
	if (option === "player") {
		return helpers.roundContract(effectiveAmount / (1 + OPTION_VALUE_RATE));
	}
	if (option === "team") {
		return helpers.roundContract(effectiveAmount / (1 - OPTION_VALUE_RATE));
	}
	return helpers.roundContract(effectiveAmount);
};

type PlayerForAIOption = Pick<
	Player<MinimalPlayerRatings>,
	"awards" | "born" | "draft" | "ratings" | "value" | "valueNoPot"
>;

const isHighValuePlayer = (p: PlayerForAIOption) =>
	p.value >= 65 || p.ratings.at(-1)!.ovr >= 65;

const isVeteranPlayer = (p: PlayerForAIOption) => g.get("season") - p.born.year >= 28;

const isEligibleOptionAmount = (
	p: PlayerForAIOption,
	contract: Pick<
		PlayerContract,
		"amount" | "exp" | "option" | "rookie" | "type"
	>,
	option: ContractOption,
) => {
	const realAmount = getRealAmountForEffectiveOffer(contract.amount, option);
	if (realAmount < getMinContractForPlayer(p)) {
		return false;
	}

	if (option === "team" && realAmount > getMaxContractForPlayer(p)) {
		return false;
	}

	return true;
};

const isMinimumMarketDemand = (
	p: PlayerForAIOption,
	marketDemand: number,
) => {
	return isMinimumContractForPlayer(p, marketDemand);
};

export const getAIContractOption = (
	p: PlayerForAIOption,
	contract: Pick<
		PlayerContract,
		"amount" | "exp" | "option" | "rookie" | "type"
	>,
) => {
	if (contract.option !== undefined || !canContractHaveOption(contract)) {
		return undefined;
	}

	if (
		isLowEndYoungFreeAgent(p) &&
		isEligibleOptionAmount(p, contract, "team")
	) {
		return "team";
	}

	if (
		(isHighValuePlayer(p) || isVeteranPlayer(p)) &&
		isEligibleOptionAmount(p, contract, "player")
	) {
		return "player";
	}

	return undefined;
};

export const getAIContractWithOption = (
	p: PlayerForAIOption,
	contract: PlayerContract,
): PlayerContract => {
	const option = getAIContractOption(p, contract);
	if (option === undefined) {
		return contract;
	}

	return {
		...contract,
		amount: getRealAmountForEffectiveOffer(contract.amount, option),
		option: option as ContractOption,
	};
};

export const shouldExercisePlayerOption = ({
	p,
	marketDemand,
	optionSalary,
}: {
	p: PlayerForAIOption;
	marketDemand: number;
	optionSalary: number;
}) => {
	if (isMinimumMarketDemand(p, marketDemand)) {
		return true;
	}

	return getEffectiveOfferAmount(optionSalary, "player") >= marketDemand;
};

export const shouldExerciseTeamOption = ({
	marketDemand,
	optionSalary,
}: {
	marketDemand: number;
	optionSalary: number;
}) => {
	return getEffectiveOfferAmount(optionSalary, "team") <= marketDemand;
};
