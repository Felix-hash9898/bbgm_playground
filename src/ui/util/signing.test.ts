import { assert, test } from "vitest";
import {
	createContractSigningGuard,
	isDirectSignDisabled,
	submitContractOffer,
} from "./signing.ts";
import type { ContractSigningOffer } from "./signing.ts";

const offerA: ContractSigningOffer = {
	pid: 12,
	amount: 12.5,
	exp: 2027,
	option: "player",
};
const offerB: ContractSigningOffer = {
	pid: 12,
	amount: 8.75,
	exp: 2026,
	type: "standard",
	option: "team",
};

test("direct Sign keeps simulation-disabled independent of cap exceptions", () => {
	const isDisabled = (
		overrides: Partial<Parameters<typeof isDirectSignDisabled>[0]>,
	) =>
		isDirectSignDisabled({
			signing: false,
			standardRosterFull: false,
			simulationDisabled: false,
			canGoOverCap: false,
			capDisabled: false,
			...overrides,
		});

	assert.strictEqual(
		isDisabled({ canGoOverCap: true, simulationDisabled: true }),
		true,
	);
	assert.strictEqual(isDisabled({ canGoOverCap: true }), false);
	assert.strictEqual(
		isDisabled({ canGoOverCap: false, capDisabled: true }),
		true,
	);
	assert.strictEqual(isDisabled({ canGoOverCap: false }), false);
	assert.strictEqual(isDisabled({ signing: true }), true);
	assert.strictEqual(isDisabled({ standardRosterFull: true }), true);
});

test("cross-click during MLE confirmation is ignored; cancel unlocks another offer", async () => {
	const changes: string[] = [];
	const guard = createContractSigningGuard((_pid, status) => {
		changes.push(status);
	});
	let resolveConfirmation!: (proceed: boolean) => void;
	const confirmation = new Promise<boolean>((resolve) => {
		resolveConfirmation = resolve;
	});
	let confirmCalls = 0;
	const submitted: {
		pid: number;
		amount: number;
		exp: number;
		type?: "standard" | "twoWay";
		option?: string;
	}[] = [];
	let signedCalls = 0;
	const common = {
		guard,
		resigning: false,
		confirm: async () => true,
		logError: (_message: string) => {},
		onSigned: async () => {
			signedCalls += 1;
		},
	};

	const firstButton = submitContractOffer({
		...common,
		offer: offerA,
		contractExceptionType: "midLevel",
		confirm: () => {
			confirmCalls += 1;
			return confirmation;
		},
		sign: async (payload) => {
			submitted.push(payload);
			return undefined;
		},
	});
	assert.strictEqual(guard.statusFor(offerA.pid), "pending");

	const secondButton = submitContractOffer({
		...common,
		offer: offerB,
		sign: async (payload) => {
			submitted.push(payload);
			return undefined;
		},
	});
	await secondButton;
	assert.strictEqual(confirmCalls, 1);
	assert.strictEqual(submitted.length, 0);

	resolveConfirmation(false);
	await firstButton;
	assert.strictEqual(guard.statusFor(offerA.pid), "idle");
	assert.strictEqual(submitted.length, 0);

	await submitContractOffer({
		...common,
		offer: offerB,
		sign: async (payload) => {
			submitted.push(payload);
			return undefined;
		},
	});
	assert.deepStrictEqual(submitted, [
		{ pid: 12, amount: 8750, exp: 2026, type: "standard", option: "team" },
	]);
	assert.strictEqual(signedCalls, 1);
	assert.strictEqual(guard.statusFor(offerA.pid), "signed");
	assert.deepStrictEqual(changes, ["pending", "idle", "pending", "signed"]);
});

test("confirming an MLE offer submits and locks every offer after success", async () => {
	const guard = createContractSigningGuard();
	let confirmCalls = 0;
	let signCalls = 0;
	let signedCalls = 0;
	let payload:
		| { pid: number; amount: number; exp: number; option?: string }
		| undefined;

	await submitContractOffer({
		guard,
		offer: offerA,
		contractExceptionType: "midLevel",
		resigning: false,
		confirm: async () => {
			confirmCalls += 1;
			return true;
		},
		sign: async (offer) => {
			signCalls += 1;
			payload = offer;
			return undefined;
		},
		logError: () => {},
		onSigned: async () => {
			signedCalls += 1;
		},
	});

	await submitContractOffer({
		guard,
		offer: offerB,
		resigning: false,
		confirm: async () => true,
		sign: async () => {
			signCalls += 1;
			return undefined;
		},
		logError: () => {},
		onSigned: async () => {
			signedCalls += 1;
		},
	});

	assert.strictEqual(confirmCalls, 1);
	assert.strictEqual(signCalls, 1);
	assert.deepStrictEqual(payload, {
		pid: 12,
		amount: 12500,
		exp: 2027,
		option: "player",
	});
	assert.strictEqual(signedCalls, 1);
	assert.strictEqual(guard.statusFor(offerA.pid), "signed");
});

test("returned errors and rejected requests release the shared guard for retry", async () => {
	const guard = createContractSigningGuard();
	const errors: string[] = [];
	const submitted: ContractSigningOffer[] = [];
	let signedCalls = 0;
	const common = {
		guard,
		resigning: false,
		confirm: async () => true,
		logError: (message: string) => errors.push(message),
		onSigned: async () => {
			signedCalls += 1;
		},
	};

	await submitContractOffer({
		...common,
		offer: offerA,
		sign: async (payload) => {
			submitted.push({ ...payload, amount: payload.amount / 1000 });
			return "Roster changed before signing";
		},
	});
	assert.strictEqual(guard.statusFor(offerA.pid), "idle");
	assert.strictEqual(errors[0], "Roster changed before signing");
	assert.strictEqual(signedCalls, 0);

	await submitContractOffer({
		...common,
		offer: offerB,
		sign: async (payload) => {
			submitted.push({ ...payload, amount: payload.amount / 1000 });
			throw new Error("Worker request rejected");
		},
	});
	assert.strictEqual(guard.statusFor(offerA.pid), "idle");
	assert.strictEqual(errors[1], "Worker request rejected");
	assert.strictEqual(signedCalls, 0);

	await submitContractOffer({
		...common,
		offer: offerA,
		sign: async () => undefined,
	});
	assert.strictEqual(guard.statusFor(offerA.pid), "signed");
	assert.strictEqual(signedCalls, 1);
	assert.strictEqual(submitted.length, 2);
});

test("durable success stays locked and reports navigation failure", async () => {
	const guard = createContractSigningGuard();
	const errors: string[] = [];
	let signCalls = 0;
	let onSignedCalls = 0;
	const common = {
		guard,
		offer: offerA,
		resigning: false,
		confirm: async () => true,
		sign: async () => {
			signCalls += 1;
			return undefined;
		},
		logError: (message: string) => errors.push(message),
		onSigned: async () => {
			onSignedCalls += 1;
			throw new Error("Router unavailable");
		},
	};

	await submitContractOffer(common);
	await submitContractOffer({ ...common, offer: offerB });

	assert.strictEqual(guard.statusFor(offerA.pid), "signed");
	assert.strictEqual(signCalls, 1);
	assert.strictEqual(onSignedCalls, 1);
	assert.deepStrictEqual(errors, [
		"Contract signed, but the page could not be updated: Router unavailable",
	]);
});
