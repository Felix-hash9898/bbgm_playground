import { useState } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { isSport } from "../../common/index.ts";
import { getStandardRosterFullReason } from "../util/rosterFullMessage.ts";
import { isDirectSignDisabled } from "../util/signing.ts";
import { logEvent, toWorker } from "../util/index.ts";

const getErrorMessage = (error: unknown) => {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	if (typeof error === "string" && error) {
		return error;
	}
	return "Unable to sign player. Please try again.";
};

// season is just needed during re-signing, because it's used to make sure drafted players in hard cap leagues always
// are willing to sign.
const SignButton = ({
	contractAmount,
	disabled,
	exp,
	pid,
	setSigning,
	ariaLabel,
}: {
	contractAmount: number;
	disabled: boolean;
	exp: number;
	pid: number;
	setSigning: (signing: boolean) => void;
	ariaLabel?: string;
}) => (
	<button
		className="btn btn-light-bordered btn-xs"
		disabled={disabled}
		aria-label={ariaLabel}
		onClick={async () => {
			setSigning(true);
			try {
				const errorMsg = await toWorker("main", "sign", {
					pid,
					amount: contractAmount,
					exp,
				});

				if (errorMsg) {
					logEvent({
						type: "error",
						text: errorMsg,
						saveToDb: false,
					});
				}
			} catch (error) {
				logEvent({
					type: "error",
					text: getErrorMessage(error),
					saveToDb: false,
				});
			} finally {
				setSigning(false);
			}
		}}
	>
		Sign
	</button>
);

const NegotiateButtons = ({
	canGoOverCap,
	canSign,
	capSpace,
	numRosterSpots,
	disabled,
	minContract,
	spectator,
	p,
	willingToNegotiate,
}: {
	canGoOverCap?: boolean;
	canSign?: boolean;
	capSpace: number;
	numRosterSpots?: number;
	disabled?: boolean;
	minContract: number;
	spectator: boolean;
	p: any;
	willingToNegotiate: boolean;
}) => {
	const [signing, setSigning] = useState(false);

	if (spectator) {
		return null;
	}

	if (!willingToNegotiate) {
		return "Refuses!";
	}

	const contractAmount = p.mood.user.contractAmount;
	const standardRosterFull =
		numRosterSpots !== undefined && numRosterSpots <= 0;

	const capDisabled =
		canSign !== undefined
			? !canSign
			: contractAmount / 1000 > capSpace + 1 / 1000 &&
				contractAmount / 1000 > (minContract + 1) / 1000;
	const signDisabled = isDirectSignDisabled({
		signing,
		standardRosterFull,
		simulationDisabled: !!disabled,
		canGoOverCap,
		capDisabled,
	});
	const standardRosterFullReason = getStandardRosterFullReason(
		isSport("basketball"),
	);
	return (
		<div className="btn-group">
			<button
				className="btn btn-light-bordered btn-xs"
				disabled={!!disabled}
				onClick={() => toWorker("actions", "negotiate", p.pid)}
			>
				Negotiate
			</button>
			{standardRosterFull ? (
				<OverlayTrigger
					placement="top"
					overlay={<Tooltip>{standardRosterFullReason}</Tooltip>}
				>
					<span className="d-inline-block" title={standardRosterFullReason}>
						<SignButton
							disabled={signDisabled}
							contractAmount={contractAmount}
							exp={p.contract.exp}
							pid={p.pid}
							setSigning={setSigning}
							ariaLabel={standardRosterFullReason}
						/>
					</span>
				</OverlayTrigger>
			) : (
				<SignButton
					disabled={signDisabled}
					contractAmount={contractAmount}
					exp={p.contract.exp}
					pid={p.pid}
					setSigning={setSigning}
				/>
			)}
		</div>
	);
};

export default NegotiateButtons;
