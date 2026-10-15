import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { confirm, logEvent, toWorker } from "../util/index.ts";
import {
	submitContractOffer,
	type ContractSigningGuard,
	type ContractSigningStatus,
} from "../util/signing.ts";

const ContractSignButton = ({
	pid,
	amount,
	exp,
	type,
	option,
	contractExceptionType,
	disabledReason,
	resigning,
	text,
	onSigned,
	signingGuard,
	signingStatus,
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
	onSigned: () => Promise<void>;
	signingGuard: ContractSigningGuard;
	signingStatus: ContractSigningStatus;
}) => {
	const button = (
		<button
			className={`btn btn-sm ${disabledReason !== undefined ? "btn-secondary" : "btn-success"}`}
			disabled={disabledReason !== undefined || signingStatus !== "idle"}
			style={{ minWidth: 86 }}
			onClick={() => {
				void submitContractOffer({
					guard: signingGuard,
					offer: { pid, amount, exp, type, option },
					contractExceptionType,
					resigning,
					confirm: () =>
						confirm(
							"Signing this contract will use your Mid-Level Exception for the current season. Continue?",
							{ okText: "Use MLE" },
						),
					sign: async (offer) =>
						await toWorker("main", "acceptContractNegotiation", offer),
					logError: (text) =>
						logEvent({ type: "error", text, saveToDb: false }),
					onSigned,
				});
			}}
		>
			{signingStatus === "pending"
				? "Signing..."
				: signingStatus === "signed"
					? "Signed"
					: text}
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

export default ContractSignButton;
