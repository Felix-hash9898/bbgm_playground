import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, assert, beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(),
	logEvent: vi.fn(),
	toWorker: vi.fn(),
	onSigned: vi.fn(),
}));

vi.mock("../util/index.ts", () => ({
	confirm: mocks.confirm,
	logEvent: mocks.logEvent,
	toWorker: mocks.toWorker,
}));

import ContractSignButton from "./ContractSignButton.tsx";
import {
	createContractSigningGuard,
	type ContractSigningStatus,
} from "../util/signing.ts";

let container: HTMLDivElement;
let root: Root;

const ButtonHarness = () => {
	const [signingStatus, setSigningStatus] =
		useState<ContractSigningStatus>("idle");
	const [signingGuard] = useState(() =>
		createContractSigningGuard((_pid, status) => setSigningStatus(status)),
	);
	return createElement(ContractSignButton, {
		pid: 12,
		amount: 12.5,
		exp: 2027,
		type: "standard",
		option: "player",
		contractExceptionType: "midLevel",
		disabledReason: undefined,
		resigning: false,
		text: "Sign PO",
		onSigned: mocks.onSigned,
		signingGuard,
		signingStatus,
	});
};

const renderSignButton = async () => {
	await act(async () => {
		root.render(createElement(ButtonHarness));
	});
	return container.querySelector("button")!;
};

beforeEach(() => {
	(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	mocks.confirm.mockReset();
	mocks.logEvent.mockReset();
	mocks.toWorker.mockReset();
	mocks.onSigned.mockReset();
	mocks.confirm.mockResolvedValue(true);
	mocks.toWorker.mockResolvedValue(undefined);
	mocks.onSigned.mockResolvedValue(undefined);
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
});

test("cancelling Use MLE does not submit and releases the button", async () => {
	mocks.confirm.mockResolvedValueOnce(false);
	const button = await renderSignButton();

	await act(async () => {
		button.click();
	});

	assert.strictEqual(mocks.confirm.mock.calls.length, 1);
	assert.strictEqual(mocks.confirm.mock.calls[0]?.[1]?.okText, "Use MLE");
	assert.strictEqual(mocks.toWorker.mock.calls.length, 0);
	assert.strictEqual(mocks.onSigned.mock.calls.length, 0);
	assert.strictEqual(button.disabled, false);
});

test("an MLE sign submits once and redirects only after success", async () => {
	const button = await renderSignButton();

	await act(async () => {
		button.click();
	});

	assert.strictEqual(mocks.toWorker.mock.calls.length, 1);
	assert.deepStrictEqual(mocks.toWorker.mock.calls[0], [
		"main",
		"acceptContractNegotiation",
		{
			pid: 12,
			amount: 12500,
			exp: 2027,
			type: "standard",
			option: "player",
		},
	]);
	assert.strictEqual(mocks.onSigned.mock.calls.length, 1);
	assert.strictEqual(button.disabled, true);
	assert.strictEqual(button.textContent, "Signed");
});

test("domain errors and rejected requests stay on the negotiation and notify", async () => {
	const button = await renderSignButton();
	mocks.toWorker.mockResolvedValueOnce(
		"Team roster limit is no longer available",
	);

	await act(async () => {
		button.click();
	});

	assert.strictEqual(
		mocks.logEvent.mock.calls[0]?.[0]?.text,
		"Team roster limit is no longer available",
	);
	assert.strictEqual(mocks.onSigned.mock.calls.length, 0);
	assert.strictEqual(button.disabled, false);

	mocks.toWorker.mockRejectedValueOnce(
		new Error("Signing transaction rejected"),
	);
	await act(async () => {
		button.click();
	});

	assert.strictEqual(
		mocks.logEvent.mock.calls[1]?.[0]?.text,
		"Signing transaction rejected",
	);
	assert.strictEqual(mocks.onSigned.mock.calls.length, 0);
	assert.strictEqual(button.disabled, false);
});

test("duplicate clicks cannot submit the same MLE offer twice", async () => {
	let resolveRequest: ((value: undefined) => void) | undefined;
	mocks.toWorker.mockImplementation(
		() =>
			new Promise<undefined>((resolve) => {
				resolveRequest = resolve;
			}),
	);
	const button = await renderSignButton();

	await act(async () => {
		button.click();
	});
	assert.strictEqual(button.disabled, true);
	button.click();
	assert.strictEqual(mocks.toWorker.mock.calls.length, 1);

	await act(async () => {
		resolveRequest?.(undefined);
	});
	assert.strictEqual(mocks.onSigned.mock.calls.length, 1);
	assert.strictEqual(button.disabled, true);
	assert.strictEqual(button.textContent, "Signed");
});
