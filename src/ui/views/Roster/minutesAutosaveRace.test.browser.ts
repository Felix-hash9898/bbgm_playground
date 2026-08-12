import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
	useBasketballMinutesAutosave,
	type BasketballMinutesView,
} from "./useBasketballMinutesAutosave.ts";

const players = Array.from({ length: 8 }, (_, index) => ({ pid: index + 1 }));

const planA = {
	1: 40,
	2: 36,
	3: 34,
	4: 32,
	5: 30,
	6: 26,
	7: 24,
	8: 18,
};

const planAEdited = {
	...planA,
	1: 41,
	2: 35,
};

const planB = {
	...planAEdited,
	1: 42,
	2: 34,
};

const makePlan = (
	mode: BasketballMinutesView["mode"],
	minutesByPid: Record<number, number>,
): BasketballMinutesView => ({
	mode,
	minutesByPid,
	autoMinutesByPid: planA,
	required: 240,
});

type PendingRequest = {
	payload: Record<number, number>;
	resolve: () => void;
};

type HarnessProps = {
	serverPlan: BasketballMinutesView;
	saveCustomPlan: (
		tid: number,
		minutesByPid: Record<number, number>,
	) => Promise<unknown>;
	resetToAuto: (tid: number) => Promise<unknown>;
	onError: (error: unknown) => void;
};

const Harness = ({
	serverPlan,
	saveCustomPlan,
	resetToAuto,
	onError,
}: HarnessProps) => {
	const { minutesDraft, handleMinutesChange, handleAutoMinutes } =
		useBasketballMinutesAutosave({
			basketballMinutes: serverPlan,
			players,
			editable: true,
			tid: 0,
			saveCustomPlan,
			resetToAuto,
			onError,
		});

	return createElement(
		"div",
		{},
		players.map(({ pid }) =>
			createElement("input", {
				key: pid,
				"data-pid": pid,
				value: minutesDraft[pid] ?? "",
				onChange: (event: Event) =>
					handleMinutesChange(pid, (event.target as HTMLInputElement).value),
			}),
		),
		createElement(
			"button",
			{ type: "button", onClick: handleAutoMinutes },
			"Auto Minutes",
		),
	);
};

let container: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
	root?.unmount();
	container?.remove();
	root = undefined;
	container = undefined;
});

const setInputValue = (pid: number, value: string) => {
	const input = container!.querySelector<HTMLInputElement>(
		`input[data-pid="${pid}"]`,
	)!;
	const setter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)!.set!;
	setter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
};

const getInputValue = (pid: number) =>
	container!.querySelector<HTMLInputElement>(`input[data-pid="${pid}"]`)!.value;

test("an older in-flight minutes save cannot overwrite a newer local draft", async () => {
	const requests: PendingRequest[] = [];
	const saveCustomPlan = vi.fn(
		(_tid: number, payload: Record<number, number>) =>
			new Promise<void>((resolve) => {
				requests.push({ payload, resolve });
			}),
	);
	const resetToAuto = vi.fn(() => Promise.resolve());
	const onError = vi.fn();

	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("auto", planA),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});

	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("40");
	});

	setInputValue(1, "41");
	setInputValue(2, "35");
	await vi.waitFor(() => {
		expect(requests).toHaveLength(1);
	});
	expect(requests[0]!.payload).toEqual(planAEdited);

	// B is a newer valid plan while A is still in flight.
	setInputValue(1, "42");
	setInputValue(2, "34");

	// A resolves and the realtime view refreshes with A. B must remain visible.
	requests[0]!.resolve();
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planAEdited),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});

	expect(getInputValue(1)).toBe("42");
	expect(getInputValue(2)).toBe("34");

	await vi.waitFor(() => {
		expect(requests).toHaveLength(2);
	});
	expect(requests[1]!.payload).toEqual(planB);

	requests[1]!.resolve();
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planB),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});
	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("42");
		expect(getInputValue(2)).toBe("34");
	});
});

test("Auto Minutes remains authoritative while a stale Custom refresh is in flight", async () => {
	let resolveReset!: () => void;
	const resetPromise = new Promise<void>((resolve) => {
		resolveReset = resolve;
	});
	const saveCustomPlan = vi.fn(() => Promise.resolve());
	const resetToAuto = vi.fn(() => resetPromise);
	const onError = vi.fn();

	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planB),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});

	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("42");
	});
	container
		.querySelector("button")!
		.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	await vi.waitFor(() => {
		expect(resetToAuto).toHaveBeenCalledTimes(1);
		expect(getInputValue(1)).toBe("40");
	});

	// A stale Custom response must not restore B while the Auto request is pending.
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planB),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});
	expect(getInputValue(1)).toBe("40");

	resolveReset();
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("auto", planA),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});
	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("40");
	});
	expect(saveCustomPlan).not.toHaveBeenCalled();
});
