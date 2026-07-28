import clsx from "clsx";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { useState } from "react";
import useTitleBar from "../hooks/useTitleBar.tsx";
import {
	confirm,
	helpers,
	logEvent,
	realtimeUpdate,
	toWorker,
	useLocalPartial,
} from "../util/index.ts";
import type { View } from "../../common/types.ts";
import {
	HelpPopover,
	Mood,
	PlayerPicture,
	RatingsStatsPopover,
} from "../components/index.tsx";
import { isSport, PHASE } from "../../common/index.ts";

// Show the negotiations list if there are more ongoing negotiations
const redirectNegotiationOrRoster = async (cancelled: boolean) => {
	const count = await toWorker("main", "countNegotiations", undefined);
	if (count > 0) {
		realtimeUpdate([], helpers.leagueUrl(["negotiation"]));
	} else if (cancelled || isSport("football")) {
		// After signing player in football, go back to free agents screen, cause you probably need more
		realtimeUpdate([], helpers.leagueUrl(["free_agents"]));
	} else {
		realtimeUpdate([], helpers.leagueUrl(["roster"]));
	}
};

const SignButton = ({
	pid,
	amount,
	exp,
	type,
	option,
	contractExceptionType,
	disabledReason,
	resigning,
	text,
}: {
	pid: number;
	amount: number;
	exp: number;
	type?: "standard" | "twoWay";
	option?: "player" | "team";
	contractExceptionType?: string;
	disabledReason: string | undefined;
	resigning: boolean;
	text: string;
}) => {
	const button = (
		<button
			className={`btn btn-sm ${disabledReason !== undefined ? "btn-secondary" : "btn-success"}`}
			disabled={disabledReason !== undefined}
			style={{ minWidth: 86 }}
			onClick={async () => {
				if (!resigning && contractExceptionType === "midLevel") {
					const proceed = await confirm(
						"Signing this contract will use your Mid-Level Exception for the current season. Continue?",
						{
							okText: "Use MLE",
						},
					);
					if (!proceed) {
						return;
					}
				}

				const errorMsg = await toWorker("main", "acceptContractNegotiation", {
					pid,
					amount: Math.round(amount * 1000),
					exp,
					type,
					option,
				});
				if (errorMsg !== undefined && errorMsg) {
					logEvent({
						type: "error",
						text: errorMsg,
						saveToDb: false,
					});
				}
				redirectNegotiationOrRoster(false);
			}}
		>
			{text}
		</button>
	);

	if (disabledReason === undefined) {
		return button;
	}

	// Wrapper div around button is because otherwise there is no hover over the disabled button and no tooltip is shown.
	return (
		<OverlayTrigger
			placement="top"
			overlay={<Tooltip>{disabledReason}</Tooltip>}
		>
			<div>{button}</div>
		</OverlayTrigger>
	);
};

const headerStyle = { maxWidth: 900 };
const offerListStyle = { maxWidth: 980 };

const contractExceptionLabels: Record<string, string> = {
	bird: "Bird",
	capSpace: "Cap Space",
	midLevel: "MLE",
	minimum: "Minimum",
	twoWay: "Two-Way",
};

type ContractOption = View<"negotiation">["contractOptions"][number];
type ContractStructureFilter = "all" | "standard" | "player" | "team" | "twoWay";

const contractStructureFilters: {
	key: ContractStructureFilter;
	label: string;
}[] = [
	{ key: "all", label: "All" },
	{ key: "standard", label: "Standard" },
	{ key: "player", label: "PO" },
	{ key: "team", label: "TO" },
	{ key: "twoWay", label: "Two-Way" },
];

const getContractStructure = (
	contract: ContractOption,
): Exclude<ContractStructureFilter, "all"> => {
	if (contract.type === "twoWay") {
		return "twoWay";
	}
	if (contract.option === "player") {
		return "player";
	}
	if (contract.option === "team") {
		return "team";
	}
	return "standard";
};

const contractMatchesStructureFilter = (
	contract: ContractOption,
	filter: ContractStructureFilter,
) => filter === "all" || getContractStructure(contract) === filter;

const getContractStructureLabel = (contract: ContractOption) => {
	const structure = getContractStructure(contract);

	if (structure === "twoWay") {
		return "Two-Way";
	}
	if (structure === "player") {
		return "PO";
	}
	if (structure === "team") {
		return "TO";
	}
	return "Standard";
};

const getSignButtonText = (contract: ContractOption) => {
	const structure = getContractStructure(contract);

	if (structure === "twoWay") {
		return "Sign 2-Way";
	}
	if (structure === "player") {
		return "Sign PO";
	}
	if (structure === "team") {
		return "Sign TO";
	}
	return "Sign";
};

const getContractTypeSortValue = (contract: ContractOption) => {
	if (contract.type === "twoWay") {
		return 3;
	}
	if (contract.option === "player") {
		return 1;
	}
	if (contract.option === "team") {
		return 2;
	}
	return 0;
};

const sortContractOptions = (contracts: ContractOption[]) =>
	contracts.toSorted((a, b) => {
		const typeDiff = getContractTypeSortValue(a) - getContractTypeSortValue(b);
		if (typeDiff !== 0) {
			return typeDiff;
		}

		return a.amount - b.amount;
	});

const groupContractOptionsByYears = ({
	availableContracts,
	unavailableContracts,
	showUnavailable,
}: {
	availableContracts: ContractOption[];
	unavailableContracts: ContractOption[];
	showUnavailable: boolean;
}) => {
	const years = new Set(availableContracts.map((contract) => contract.years));
	if (showUnavailable) {
		for (const contract of unavailableContracts) {
			years.add(contract.years);
		}
	}

	return [...years]
		.toSorted((yearsA, yearsB) => yearsA - yearsB)
		.map((years) => {
			const available = sortContractOptions(
				availableContracts.filter((contract) => contract.years === years),
			);
			const unavailable = showUnavailable
				? sortContractOptions(
						unavailableContracts.filter(
							(contract) => contract.years === years,
						),
					)
				: [];
			const firstContract = available[0] ?? unavailable[0]!;

			return {
				years,
				exp: firstContract.exp,
				available,
				unavailable,
			};
		});
};

const ContractBadges = ({
	contract,
	resigning,
}: {
	contract: ContractOption;
	resigning: boolean;
}) => {
	const contractExceptionType =
		resigning && contract.contractExceptionType === "midLevel"
			? undefined
			: contract.contractExceptionType;
	const contractExceptionLabel =
		contractExceptionType !== undefined
			? contractExceptionLabels[contractExceptionType]
			: undefined;

	return (
		<div className="d-flex flex-wrap align-items-center gap-2">
			<span
				className={clsx("badge", {
					"text-bg-info": contract.type === "twoWay",
					"text-bg-secondary": contract.type !== "twoWay",
				})}
			>
				{getContractStructureLabel(contract)}
			</span>
			{contractExceptionLabel !== undefined &&
			contractExceptionType !== "twoWay" ? (
				<span
					className={clsx("badge", {
						"text-bg-warning": contractExceptionType === "midLevel",
						"text-bg-success": contractExceptionType !== "midLevel",
					})}
				>
					{contractExceptionLabel}
				</span>
			) : null}
		</div>
	);
};

const Negotiation = ({
	capSpace,
	challengeNoRatings,
	contractOptions,
	midLevelExceptionAmount,
	midLevelExceptionAvailable,
	minimumCapHit,
	maxSalaryTier,
	payroll,
	p,
	phase,
	playerMinimum,
	playerMaxContract,
	resigning,
	salaryCap,
	salaryCapType,
	t,
}: View<"negotiation">) => {
	useTitleBar({ title: "Contract Negotiation" });

	const [showUnavailableOffers, setShowUnavailableOffers] = useState(false);
	const [contractStructureFilter, setContractStructureFilter] =
		useState<ContractStructureFilter>("all");
	const { gender } = useLocalPartial(["gender"]);

	let message;
	if (salaryCapType === "soft") {
		if (resigning) {
			message = (
				<>
					You are allowed to go over the salary cap when re-signing players.{" "}
					<b>
						If you do not come to an agreement here,{" "}
						<a href={helpers.leagueUrl(["player", p.pid])}>{p.name}</a> will
						become a free agent.
					</b>{" "}
					{helpers.pronoun(gender, "He")} will then be able to sign with any
					team, and you won't be able to go over the salary cap to sign{" "}
					{helpers.pronoun(gender, "him")} unless{" "}
					{helpers.pronoun(gender, "he")}'s asking for a minimum contract.
				</>
			);
		} else {
			message =
				"You are not allowed to go over the salary cap to sign free agents, unless it's for a minimum contract or another available exception.";
		}
	} else if (salaryCapType === "hard") {
		message =
			"You are not allowed to go over the salary cap to sign players, unless it's for a minimum contract.";
	}

	// Why is the phase check needed? Ideally it wouldn't be, but somehow if a re-signing player is in the negotiations database some other time, it's good to still show the "cancel" button, otherwise there is no way to cancel. One way this could happen is if advancing to the re-signing phase fails before completing, so negotiations are starting but you're not in the re-signing phase yet.
	const resigningAndResigningPhase =
		resigning && phase === PHASE.RESIGN_PLAYERS;
	const filteredContractOptions = contractOptions.filter((contract) =>
		contractMatchesStructureFilter(contract, contractStructureFilter),
	);
	const availableContractOptions = filteredContractOptions.filter(
		(contract) => contract.disabledReason === undefined,
	);
	const unavailableContractOptions = filteredContractOptions.filter(
		(contract) => contract.disabledReason !== undefined,
	);
	const contractOptionGroups = groupContractOptionsByYears({
		availableContracts: availableContractOptions,
		unavailableContracts: unavailableContractOptions,
		showUnavailable: showUnavailableOffers,
	});

	return (
		<>
			<div className="d-flex gap-2 mb-2" style={headerStyle}>
				<div
					style={{
						maxHeight: 90,
						width: 60,
						marginTop: p.imgURL ? 0 : -10,
					}}
					className="minimal-ui-player-picture-container flex-shrink-0 d-flex justify-content-center align-items-center"
				>
					<PlayerPicture
						face={p.face}
						imgURL={p.imgURL}
						colors={t.colors}
						jersey={t.jersey}
						lazy
					/>
				</div>
				<div className="d-flex flex-column justify-content-end">
					<div className="d-flex flex-wrap gap-2">
						<h1 className="mb-0 text-nowrap">
							<a href={helpers.leagueUrl(["player", p.pid])}>{p.name}</a>
						</h1>
						<div className="d-flex align-items-center">
							<Mood defaultType="user" p={p} />
							<RatingsStatsPopover pid={p.pid} defaultWatch={p.watch} />
						</div>
					</div>
					<div>
						{p.age} years old
						{!challengeNoRatings
							? `; Overall: ${p.ratings.ovr}; Potential: ${p.ratings.pot}`
							: null}
					</div>
					<div>
						{resigning ? "Re-signing" : "Free Agent"}
						{message ? (
							<HelpPopover className="ms-1">{message}</HelpPopover>
						) : null}
					</div>
				</div>
				<div className="ms-auto d-none d-sm-flex flex-column justify-content-end align-items-end text-nowrap">
					<div>Payroll: {helpers.formatCurrency(payroll, "M")}</div>
					{salaryCapType !== "none" ? (
						<>
							<div>Salary Cap: {helpers.formatCurrency(salaryCap, "M")}</div>
							<div>Cap Space: {helpers.formatCurrency(capSpace, "M")}</div>
							{playerMaxContract !== undefined &&
							maxSalaryTier !== undefined ? (
								<div>
									Player Max: {helpers.formatCurrency(playerMaxContract, "M")} (
									{maxSalaryTier}%)
								</div>
							) : null}
							{playerMinimum !== undefined ? (
								<div>
									Player Minimum: {helpers.formatCurrency(playerMinimum, "M")}
								</div>
							) : null}
							{minimumCapHit !== undefined &&
							playerMinimum !== undefined &&
							minimumCapHit < playerMinimum ? (
								<div>
									Minimum Cap Hit: {helpers.formatCurrency(minimumCapHit, "M")}
								</div>
							) : null}
							{midLevelExceptionAmount !== undefined ? (
								<div>
									Mid-Level Exception:{" "}
									{helpers.formatCurrency(midLevelExceptionAmount, "M")} (
									{midLevelExceptionAvailable ? "Available" : "Used"})
								</div>
							) : null}
						</>
					) : null}
				</div>
			</div>
			<div className="d-flex flex-wrap gap-1 mb-2" style={offerListStyle}>
				{contractStructureFilters.map(({ key, label }) => (
					<button
						key={key}
						type="button"
						className={clsx("btn btn-sm", {
							"btn-secondary": contractStructureFilter === key,
							"btn-outline-secondary": contractStructureFilter !== key,
						})}
						onClick={() => {
							setContractStructureFilter(key);
						}}
					>
						{label}
					</button>
				))}
			</div>
			<div className="row g-2" style={offerListStyle}>
				{contractOptionGroups.map((group) => (
					<div key={group.years} className="col-12 col-lg-6">
						<div className="list-group-item h-100">
							<div className="fw-bold mb-2">
								{group.years} {helpers.plural("year", group.years)}{" "}
								<span className="text-body-secondary fw-normal">
									through {group.exp}
								</span>
							</div>
							<div className="vstack gap-2">
								{group.available.map((contract) => (
									<div
										key={`${contract.exp}-${contract.amount}-${contract.type ?? "standard"}-${contract.option ?? "none"}`}
										className={clsx(
											"d-flex align-items-center gap-2 rounded border px-2 py-1",
											{
												"border-success": contract.smallestAmount,
											},
										)}
									>
										<div className="flex-grow-1 overflow-hidden">
											<div className="d-flex flex-wrap align-items-center gap-2">
												<b className="text-nowrap">
													{helpers.formatCurrency(contract.amount, "M")}
												</b>
												<span className="text-body-secondary text-nowrap">
													/ year
												</span>
												<ContractBadges
													contract={contract}
													resigning={resigning}
												/>
											</div>
										</div>
										<SignButton
											pid={p.pid}
											amount={contract.amount}
											exp={contract.exp}
											type={contract.type}
											option={contract.option}
											contractExceptionType={
												resigning &&
												contract.contractExceptionType === "midLevel"
													? undefined
													: contract.contractExceptionType
											}
											disabledReason={undefined}
											resigning={resigning}
											text={getSignButtonText(contract)}
										/>
									</div>
								))}
								{group.unavailable.map((contract) => (
									<div
										key={`${contract.exp}-${contract.amount}-${contract.type ?? "standard"}-${contract.option ?? "none"}`}
										className="d-flex align-items-center gap-2 rounded border px-2 py-1 bg-body-tertiary text-body-secondary"
										style={{ opacity: 0.85 }}
									>
										<div className="flex-grow-1 overflow-hidden">
											<div className="d-flex flex-wrap align-items-center gap-2">
												<b className="text-nowrap">
													{helpers.formatCurrency(contract.amount, "M")}
												</b>
												<span className="text-nowrap">/ year</span>
												<ContractBadges
													contract={contract}
													resigning={resigning}
												/>
											</div>
											<div className="small">{contract.disabledReason}</div>
										</div>
										<button
											type="button"
											className="btn btn-sm btn-outline-secondary"
											disabled
											style={{ minWidth: 86 }}
										>
											Unavailable
										</button>
									</div>
								))}
							</div>
						</div>
					</div>
				))}
			</div>
			{unavailableContractOptions.length > 0 ? (
				<div className="mt-2 small" style={offerListStyle}>
					<button
						type="button"
						className="btn btn-link btn-sm p-0"
						onClick={() => {
							setShowUnavailableOffers((show) => !show);
						}}
					>
						Unavailable offers ({unavailableContractOptions.length})
					</button>
				</div>
			) : null}

			<div className="mt-3">
				{resigningAndResigningPhase ? (
					<a
						className="btn btn-secondary"
						href={helpers.leagueUrl(["negotiation"])}
					>
						Return to Re-Sign Players page
					</a>
				) : (
					<button
						className="minimal-ui-end-negotiation btn btn-danger"
						onClick={async () => {
							await toWorker("main", "cancelContractNegotiation", p.pid);
							redirectNegotiationOrRoster(true);
						}}
					>
						Can't reach a deal? End negotiation
					</button>
				)}
			</div>
		</>
	);
};

export default Negotiation;
