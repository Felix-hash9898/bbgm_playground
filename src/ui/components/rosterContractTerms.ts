import type { PlayerContract } from "../../common/types.ts";

export const getRosterContractTerms = (contract: PlayerContract) => {
	const terms: string[] = [];
	if (contract.option === "player") {
		terms.push("PO");
	}
	if (contract.option === "team") {
		terms.push("TO");
	}
	if (contract.type === "twoWay") {
		terms.push("2W");
	}
	if (contract.exception === "midLevel") {
		terms.push("MLE");
	}
	return terms;
};

export const getRosterContractSearchValue = ({
	amount,
	exp,
	terms,
}: {
	amount: string;
	exp: number;
	terms: string[];
}) => `${amount} thru ${exp}${terms.length > 0 ? ` ${terms.join(" ")}` : ""}`;
