import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, assert, beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	logEvent: vi.fn(),
	toWorker: vi.fn(),
}));

vi.mock("../util/index.ts", () => ({
	logEvent: mocks.logEvent,
	toWorker: mocks.toWorker,
}));

import NegotiateButtons from "./NegotiateButtons.tsx";

let container: HTMLDivElement;
let root: Root;

const renderButtons = async (numRosterSpots: number) => {
	await act(async () => {
		root.render(
			createElement(NegotiateButtons, {
				canGoOverCap: false,
				canSign: true,
				capSpace: 100,
				numRosterSpots,
				minContract: 1200,
				spectator: false,
				p: {
					pid: 7,
					contract: { amount: 1200, exp: 2027 },
					mood: { user: { contractAmount: 1200 } },
				},
				willingToNegotiate: true,
			}),
		);
	});
};

beforeEach(() => {
	(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	mocks.logEvent.mockReset();
	mocks.toWorker.mockReset();
	mocks.toWorker.mockResolvedValue(undefined);
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

test("a full standard roster disables direct Sign but leaves Negotiate available", async () => {
	await renderButtons(0);
	const buttons = [...container.querySelectorAll("button")];
	const negotiate = buttons.find(
		(button) => button.textContent === "Negotiate",
	);
	const sign = buttons.find((button) => button.textContent === "Sign");

	assert(negotiate);
	assert(sign);
	assert.strictEqual(negotiate.disabled, false);
	assert.strictEqual(sign.disabled, true);
	assert.match(
		sign.getAttribute("aria-label") ?? "",
		/no standard roster spots/,
	);
	assert.match(sign.parentElement?.getAttribute("title") ?? "", /Two-Way/);
});

test("an open standard roster slot enables direct Sign", async () => {
	await renderButtons(1);
	const sign = [...container.querySelectorAll("button")].find(
		(button) => button.textContent === "Sign",
	);
	assert(sign);
	assert.strictEqual(sign.disabled, false);
	assert.strictEqual(sign.getAttribute("aria-label"), null);
});

test("both returned sign errors and rejected promises are logged visibly", async () => {
	await renderButtons(1);
	const sign = [...container.querySelectorAll("button")].find(
		(button) => button.textContent === "Sign",
	);
	assert(sign);

	mocks.toWorker.mockResolvedValueOnce("Roster limit changed before signing");
	await act(async () => {
		sign.click();
	});
	assert.strictEqual(
		mocks.logEvent.mock.calls[0]?.[0]?.text,
		"Roster limit changed before signing",
	);
	assert.strictEqual(sign.disabled, false);

	mocks.toWorker.mockRejectedValueOnce(new Error("Worker validation rejected"));
	await act(async () => {
		sign.click();
	});
	assert.strictEqual(
		mocks.logEvent.mock.calls[1]?.[0]?.text,
		"Worker validation rejected",
	);
	assert.strictEqual(sign.disabled, false);
});
