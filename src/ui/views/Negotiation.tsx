import clsx from "clsx";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import useTitleBar from "../hooks/useTitleBar.tsx";
import {
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
	disabledReason,
}: {
	pid: number;
	amount: number;
	exp: number;
	type?: "standard" | "twoWay";
	option?: "player" | "team";
	disabledReason: string | undefined;
}) => {
	const button = (
		<button
			className={`btn ${disabledReason !== undefined ? "btn-secondary" : "btn-success"}`}
			disabled={disabledReason !== undefined}
			onClick={async () => {
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
			Sign
			<span className="d-none d-sm-inline"> Contract</span>
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

const widthStyle = { maxWidth: 575 };

const contractExceptionLabels: Record<string, string> = {
	bird: "Bird",
	capSpace: "Cap Space",
	midLevel: "Uses MLE",
	minimum: "Minimum",
	twoWay: "Two-Way",
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

	return (
		<>
			<div className="d-flex gap-2 mb-2" style={widthStyle}>
				<div
					style={{
						maxHeight: 90,
						width: 60,
						marginTop: p.imgURL ? 0 : -10,
					}}
					className="flex-shrink-0 d-flex justify-content-center align-items-center"
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
			<div className="list-group" style={widthStyle}>
				{contractOptions.map((contract, i) => {
					const contractExceptionLabel =
						contract.contractExceptionType !== undefined
							? contractExceptionLabels[contract.contractExceptionType]
							: undefined;

					return (
						<div
							key={i}
							className={clsx("d-flex align-items-center list-group-item", {
								"list-group-item-success": contract.smallestAmount,
							})}
						>
							<div className="flex-grow-1">
								<b>{helpers.formatCurrency(contract.amount, "M")}</b>/year for{" "}
								{contract.years} {helpers.plural("year", contract.years)}{" "}
								(through {contract.exp})
								{contract.type === "twoWay" &&
								contractExceptionLabel === undefined ? (
									<span className="badge text-bg-info ms-2">Two-Way</span>
								) : null}
								{contract.option === "player" ? (
									<span className="badge text-bg-secondary ms-2">PO</span>
								) : contract.option === "team" ? (
									<span className="badge text-bg-secondary ms-2">TO</span>
								) : null}
								{contractExceptionLabel !== undefined ? (
									<span
										className={clsx("badge ms-2", {
											"text-bg-warning":
												contract.contractExceptionType === "midLevel",
											"text-bg-info":
												contract.contractExceptionType === "twoWay",
											"text-bg-success":
												contract.contractExceptionType !== "midLevel" &&
												contract.contractExceptionType !== "twoWay",
										})}
									>
										{contractExceptionLabel}
									</span>
								) : null}
							</div>

							<SignButton
								pid={p.pid}
								amount={contract.amount}
								exp={contract.exp}
								type={contract.type}
								option={contract.option}
								disabledReason={contract.disabledReason}
							/>
						</div>
					);
				})}
			</div>

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
						className="btn btn-danger"
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
