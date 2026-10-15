export type ContractSigningStatus = "idle" | "pending" | "signed";
export type ContractSigningToken = symbol;

export type ContractSigningGuard = {
	statusFor: (pid: number) => ContractSigningStatus;
	tryStart: (pid: number) => ContractSigningToken | undefined;
	markSigned: (pid: number, token: ContractSigningToken) => void;
	release: (pid: number, token: ContractSigningToken) => void;
};

export const createContractSigningGuard = (
	onStatusChange: (
		pid: number,
		status: ContractSigningStatus,
	) => void = () => {},
): ContractSigningGuard => {
	const states = new Map<
		number,
		{ status: ContractSigningStatus; token?: ContractSigningToken }
	>();

	return {
		statusFor: (pid) => states.get(pid)?.status ?? "idle",
		tryStart: (pid) => {
			const status = states.get(pid)?.status;
			if (status !== undefined && status !== "idle") {
				return undefined;
			}

			const token = Symbol("contract-signing");
			states.set(pid, { status: "pending", token });
			onStatusChange(pid, "pending");
			return token;
		},
		markSigned: (pid, token) => {
			const current = states.get(pid);
			if (current?.status !== "pending" || current.token !== token) {
				return;
			}

			states.set(pid, { status: "signed", token });
			onStatusChange(pid, "signed");
		},
		release: (pid, token) => {
			const current = states.get(pid);
			if (current?.status !== "pending" || current.token !== token) {
				return;
			}

			states.set(pid, { status: "idle" });
			onStatusChange(pid, "idle");
		},
	};
};

export const isDirectSignDisabled = ({
	signing,
	standardRosterFull,
	simulationDisabled,
	canGoOverCap,
	capDisabled,
}: {
	signing: boolean;
	standardRosterFull: boolean;
	simulationDisabled: boolean;
	canGoOverCap?: boolean;
	capDisabled: boolean;
}) =>
	signing ||
	standardRosterFull ||
	simulationDisabled ||
	(!canGoOverCap && capDisabled);

export type ContractSigningOffer = {
	pid: number;
	amount: number;
	exp: number;
	type?: "standard" | "twoWay";
	option?: "player" | "team";
};

type ContractSigningPayload = Omit<ContractSigningOffer, "amount"> & {
	amount: number;
};

const getErrorMessage = (error: unknown) => {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	if (typeof error === "string" && error) {
		return error;
	}
	return "Unable to sign this contract. Please try again.";
};

export const submitContractOffer = async ({
	guard,
	offer,
	contractExceptionType,
	resigning,
	confirm,
	sign,
	logError,
	onSigned,
}: {
	guard: ContractSigningGuard;
	offer: ContractSigningOffer;
	contractExceptionType?: string;
	resigning: boolean;
	confirm: () => Promise<boolean>;
	sign: (payload: ContractSigningPayload) => Promise<string | undefined>;
	logError: (message: string) => void;
	onSigned: () => Promise<void>;
}) => {
	const token = guard.tryStart(offer.pid);
	if (token === undefined) {
		return false;
	}

	let signed = false;
	try {
		if (!resigning && contractExceptionType === "midLevel") {
			const proceed = await confirm();
			if (!proceed) {
				return false;
			}
		}

		const errorMsg = await sign({
			...offer,
			amount: Math.round(offer.amount * 1000),
		});
		if (errorMsg !== undefined && errorMsg) {
			logError(errorMsg);
			return false;
		}

		signed = true;
		guard.markSigned(offer.pid, token);
		try {
			await onSigned();
		} catch (error) {
			logError(
				`Contract signed, but the page could not be updated: ${getErrorMessage(error)}`,
			);
		}
		return true;
	} catch (error) {
		logError(getErrorMessage(error));
		return false;
	} finally {
		if (!signed) {
			guard.release(offer.pid, token);
		}
	}
};
