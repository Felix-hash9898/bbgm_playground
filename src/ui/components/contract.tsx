import clsx from "clsx";
import type { PlayerContract } from "../../common/types.ts";
import { helpers, useLocal, useLocalPartial } from "../util/index.ts";
import {
	getRosterContractSearchValue,
	getRosterContractTerms,
} from "./rosterContractTerms.ts";

export { getRosterContractTerms } from "./rosterContractTerms.ts";

type ContractPlayer = {
	draft: {
		year: number;
	};
	contract: PlayerContract;
};

const useJustDrafted = (p: ContractPlayer) => {
	const { phase, season } = useLocalPartial(["phase", "season"]);

	return helpers.justDrafted(p, phase as any, season);
};

const isTwoWayContract = (contract: PlayerContract) =>
	contract.type === "twoWay";

const TwoWayBadge = ({ contract }: { contract: PlayerContract }) => {
	if (!isTwoWayContract(contract)) {
		return null;
	}

	return <span className="badge text-bg-info ms-1">Two-Way</span>;
};

const OptionBadge = ({ contract }: { contract: PlayerContract }) => {
	if (contract.option === "player") {
		return <span className="badge text-bg-secondary ms-1">PO</span>;
	}
	if (contract.option === "team") {
		return <span className="badge text-bg-secondary ms-1">TO</span>;
	}

	return null;
};

const NON_GUARANTEED_CONTRACT_TEXT =
	"Contracts for drafted players are not guaranteed until the regular season. If you release a drafted player before then, you pay nothing.";

export const ContractAmount = ({
	p,
	override,
	showTerms = true,
}: {
	p: ContractPlayer;
	override?: number;
	showTerms?: boolean;
}) => {
	const justDrafted = useJustDrafted(p);

	return (
		<span
			className={justDrafted ? "fst-italic" : undefined}
			title={justDrafted ? NON_GUARANTEED_CONTRACT_TEXT : undefined}
		>
			{helpers.formatCurrency(override ?? p.contract.amount, "M")}
			{override === undefined && showTerms ? (
				<>
					<TwoWayBadge contract={p.contract} />
					<OptionBadge contract={p.contract} />
				</>
			) : null}
		</span>
	);
};

export const wrappedContractAmount = (p: ContractPlayer, override?: number) => {
	const formatted = helpers.formatCurrency(override ?? p.contract.amount, "M");

	return {
		value: <ContractAmount p={p} override={override} />,
		sortValue: p.contract.amount,
		searchValue: formatted,
	};
};

export const ContractExp = ({
	p,
	override,
}: {
	p: ContractPlayer;
	override?: number;
}) => {
	const justDrafted = useJustDrafted(p);

	const season = useLocal((state) => state.season);
	const expiring = season === p.contract.exp;

	return (
		<span
			className={clsx({
				"fst-italic": justDrafted,
				"fw-bold": expiring,
			})}
			title={
				justDrafted
					? NON_GUARANTEED_CONTRACT_TEXT
					: expiring
						? "Expiring contract"
						: undefined
			}
		>
			{override ?? p.contract.exp}
		</span>
	);
};

export const wrappedContractExp = (p: ContractPlayer, override?: number) => {
	const formatted = override ?? p.contract.exp;

	return {
		value: <ContractExp p={p} override={override} />,
		sortValue: formatted,
		searchValue: formatted,
	};
};

export const Contract = ({ p }: { p: ContractPlayer }) => {
	const justDrafted = useJustDrafted(p);

	return (
		<>
			<ContractAmount p={p} />
			<span
				className={justDrafted ? "fst-italic" : undefined}
				title={justDrafted ? NON_GUARANTEED_CONTRACT_TEXT : undefined}
			>
				{" "}
				thru{" "}
			</span>
			<ContractExp p={p} />
		</>
	);
};

export const wrappedContract = (p: ContractPlayer) => {
	const formattedAmount = helpers.formatCurrency(p.contract.amount, "M");
	const formatted = `${formattedAmount}${
		isTwoWayContract(p.contract) ? " Two-Way" : ""
	}${p.contract.option === "player" ? " PO" : ""}${
		p.contract.option === "team" ? " TO" : ""
	} thru ${p.contract.exp}`;

	return {
		value: <Contract p={p} />,
		sortValue: p.contract.amount,
		searchValue: formatted,
	};
};

const RosterContract = ({ p }: { p: ContractPlayer }) => {
	const justDrafted = useJustDrafted(p);

	return (
		<>
			<ContractAmount p={p} showTerms={false} />
			<span
				className={justDrafted ? "fst-italic" : undefined}
				title={justDrafted ? NON_GUARANTEED_CONTRACT_TEXT : undefined}
			>
				{" "}
				thru{" "}
			</span>
			<ContractExp p={p} />
		</>
	);
};

const RosterContractTerms = ({ p }: { p: ContractPlayer }) => (
	<span style={{ whiteSpace: "nowrap" }}>
		{getRosterContractTerms(p.contract).map((term) => (
			<span className="badge text-bg-secondary ms-1" key={term}>
				{term}
			</span>
		))}
	</span>
);

export const wrappedRosterContract = (p: ContractPlayer) => {
	const formattedAmount = helpers.formatCurrency(p.contract.amount, "M");
	const formatted = getRosterContractSearchValue({
		amount: formattedAmount,
		exp: p.contract.exp,
		terms: [],
	});

	return {
		value: <RosterContract p={p} />,
		sortValue: p.contract.amount,
		searchValue: formatted,
	};
};

export const wrappedRosterContractTerms = (p: ContractPlayer) => {
	const terms = getRosterContractTerms(p.contract);
	const formatted = terms.join(" ");

	return {
		value: <RosterContractTerms p={p} />,
		sortValue: formatted,
		searchValue: formatted,
	};
};
