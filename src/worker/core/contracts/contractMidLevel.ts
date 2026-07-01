import { PHASE, isSport } from "../../../common/index.ts";
import type { Player, PlayerContract, Team } from "../../../common/types.ts";
import { g, helpers } from "../../util/index.ts";
import { getContractCapHit, isMinimumContractForPlayer } from "./contractMinimum.ts";

export type ContractExceptionType =
	| "capSpace"
	| "bird"
	| "minimum"
	| "midLevel";

export type MidLevelFailureReason = "amount" | "length" | "used" | "ineligible";

export type ContractExceptionResult =
	| {
			type: ContractExceptionType;
	  }
	| {
			type: undefined;
			midLevelFailureReason?: MidLevelFailureReason;
	  };

type PlayerForMidLevel = Pick<Player, "born" | "draft">;
type TeamForMidLevel = Pick<Team, "midLevelExceptionUsedSeason" | "tid">;

const isStandardContract = (contract: PlayerContract) =>
	(contract.type ?? "standard") === "standard";

const getContractLength = (contract: Pick<PlayerContract, "exp">) => {
	const offset = g.get("phase") <= PHASE.PLAYOFFS ? 1 : 0;
	return contract.exp - g.get("season") + offset;
};

export const getMidLevelExceptionAmount = () => {
	return helpers.roundContract(g.get("salaryCap") * 0.0912);
};

export const getMidLevelExceptionMaxContractLength = () => {
	return Math.min(4, g.get("maxContractLength"));
};

export const isMidLevelExceptionAvailable = (
	team: TeamForMidLevel | undefined,
) => {
	return (
		team !== undefined &&
		isSport("basketball") &&
		g.get("salaryCapType") === "soft" &&
		team.midLevelExceptionUsedSeason !== g.get("season")
	);
};

export const canUseMidLevelException = ({
	contract,
	p,
	team,
}: {
	contract: PlayerContract;
	p: PlayerForMidLevel;
	team: TeamForMidLevel | undefined;
}) => {
	if (
		!isSport("basketball") ||
		g.get("salaryCapType") !== "soft" ||
		!isStandardContract(contract) ||
		isMinimumContractForPlayer(p, contract) ||
		!isMidLevelExceptionAvailable(team)
	) {
		return false;
	}

	if (contract.amount > getMidLevelExceptionAmount()) {
		return false;
	}

	return getContractLength(contract) <= getMidLevelExceptionMaxContractLength();
};

export const getMidLevelFailureReason = ({
	contract,
	p,
	team,
}: {
	contract: PlayerContract;
	p: PlayerForMidLevel;
	team: TeamForMidLevel | undefined;
}): MidLevelFailureReason => {
	if (
		!isSport("basketball") ||
		g.get("salaryCapType") !== "soft" ||
		!isStandardContract(contract) ||
		isMinimumContractForPlayer(p, contract)
	) {
		return "ineligible";
	}

	if (team === undefined) {
		return "ineligible";
	}

	if (!isMidLevelExceptionAvailable(team)) {
		return "used";
	}

	if (contract.amount > getMidLevelExceptionAmount()) {
		return "amount";
	}

	if (getContractLength(contract) > getMidLevelExceptionMaxContractLength()) {
		return "length";
	}

	return "ineligible";
};

export const getContractExceptionResult = ({
	birdException,
	contract,
	p,
	payroll,
	team,
}: {
	birdException: boolean;
	contract: PlayerContract;
	p: PlayerForMidLevel;
	payroll: number;
	team: TeamForMidLevel | undefined;
}): ContractExceptionResult => {
	const salaryCapType = g.get("salaryCapType");
	if (salaryCapType === "none") {
		return { type: "capSpace" };
	}

	if (birdException) {
		return { type: "bird" };
	}

	if (payroll + getContractCapHit(contract) - 1 <= g.get("salaryCap")) {
		return { type: "capSpace" };
	}

	if (isMinimumContractForPlayer(p, contract)) {
		return { type: "minimum" };
	}

	if (canUseMidLevelException({ contract, p, team })) {
		return { type: "midLevel" };
	}

	return {
		type: undefined,
		midLevelFailureReason: getMidLevelFailureReason({ contract, p, team }),
	};
};
