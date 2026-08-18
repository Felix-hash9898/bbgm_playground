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

const planInvalidTotal = {
	...planA,
	1: 39,
};

const makePlan = (
	mode: BasketballMinutesView["mode"],
	minutesByPid: Record<number, number>,
	autoFilledPids?: number[],
): BasketballMinutesView => ({
	mode,
	minutesByPid,
	autoMinutesByPid: planA,
	autoFilledPids,
	required: 240,
});

type PendingRequest = {
	payload: Record<number, number>;
	resolve: () => void;
};

type HarnessProps = {
	serverPlan: BasketballMinutesView;
	players?: typeof players;
	saveCustomPlan: (
		tid: number,
		minutesByPid: Record<number, number>,
		explicitPids?: number[],
	) => Promise<unknown>;
	resetToAuto: (tid: number) => Promise<unknown>;
	onError: (error: unknown) => void;
};

const Harness = ({
	serverPlan,
	players: harnessPlayers = players,
	saveCustomPlan,
	resetToAuto,
	onError,
}: HarnessProps) => {
	const {
		minutesDraft,
		autoFilledPids,
		handleMinutesChange,
		handleAutoMinutesFocus,
		handleAutoMinutesBlur,
		handleAutoMinutes,
	} = useBasketballMinutesAutosave({
		basketballMinutes: serverPlan,
		players: harnessPlayers,
		editable: true,
		tid: 0,
		saveCustomPlan,
		resetToAuto,
		onError,
	});

	return createElement(
		"div",
		{},
		harnessPlayers.map(({ pid }) =>
			createElement("input", {
				key: pid,
				"data-pid": pid,
				value: autoFilledPids.has(pid) ? "Auto" : (minutesDraft[pid] ?? ""),
				onChange: (event: Event) =>
					handleMinutesChange(pid, (event.target as HTMLInputElement).value),
				onFocus: () => {
					if (autoFilledPids.has(pid)) {
						handleAutoMinutesFocus(pid);
					}
				},
				onBlur: () => {
					if (autoFilledPids.has(pid)) {
						handleAutoMinutesBlur(pid);
					}
				},
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

test("a complete invalid-total draft autosaves and survives a server refresh", async () => {
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
				serverPlan: makePlan("custom", planA),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});

	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("40");
	});
	setInputValue(1, "39");
	await vi.waitFor(() => {
		expect(requests).toHaveLength(1);
	});
	expect(requests[0]!.payload).toEqual(planInvalidTotal);
	requests[0]!.resolve();

	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planInvalidTotal),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});
	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("39");
	});
});

test("an immediate unmount flushes a complete invalid-total draft", async () => {
	let persistedPlan: Record<number, number> = planA;
	const saveCustomPlan = vi.fn(
		(_tid: number, payload: Record<number, number>) => {
			persistedPlan = payload;
			return Promise.resolve();
		},
	);
	const resetToAuto = vi.fn(() => Promise.resolve());
	const onError = vi.fn();

	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planA),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});

	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("40");
	});
	setInputValue(1, "39");

	// This is intentionally before the 300ms debounce fires. The pre-fix hook
	// cleared the timer during unmount and never dispatched planInvalidTotal.
	root!.unmount();
	root = undefined;

	await vi.waitFor(() => {
		expect(saveCustomPlan).toHaveBeenCalledTimes(1);
	});
	expect(persistedPlan).toEqual(planInvalidTotal);

	root = createRoot(container);
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", persistedPlan),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});
	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("39");
	});
});

test("an immediate same-roster reorder preserves a pending invalid-total draft", async () => {
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
				serverPlan: makePlan("custom", planA),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});

	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("40");
	});
	setInputValue(1, "39");

	const reorderedPlayers = [players[1]!, ...players.filter((p) => p.pid !== 2)];
	// No timer advancement or debounce wait occurs before this same-membership
	// source refresh. The pre-fix hook reset the local 39 back to server 40 and
	// its playerPidsKey cleanup cancelled the pending save.
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planA),
				players: reorderedPlayers,
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(getInputValue(1)).toBe("39");

	await vi.waitFor(() => {
		expect(requests).toHaveLength(1);
	});
	expect(requests[0]!.payload).toEqual(planInvalidTotal);
	requests[0]!.resolve();

	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planInvalidTotal),
				players: reorderedPlayers,
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});
	await vi.waitFor(() => {
		expect(getInputValue(1)).toBe("39");
	});
});

test("editing an Auto-filled incoming player makes it explicit immediately", async () => {
	let savedExplicitPids: number[] | undefined;
	const saveCustomPlan = vi.fn(
		(
			_tid: number,
			_payload: Record<number, number>,
			explicitPids?: number[],
		) => {
			savedExplicitPids = explicitPids;
			return Promise.resolve();
		},
	);
	const resetToAuto = vi.fn(() => Promise.resolve());
	const onError = vi.fn();

	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planA, [8]),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});

	await vi.waitFor(() => {
		expect(getInputValue(8)).toBe("Auto");
	});
	setInputValue(8, "18");
	await vi.waitFor(() => {
		expect(getInputValue(8)).toBe("18");
		expect(saveCustomPlan).toHaveBeenCalledTimes(1);
	});
	expect(savedExplicitPids).toEqual([8]);
});

test("focusing an Auto-filled player without editing restores Auto", async () => {
	const saveCustomPlan = vi.fn(() => Promise.resolve());
	const resetToAuto = vi.fn(() => Promise.resolve());
	const onError = vi.fn();

	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	flushSync(() => {
		root!.render(
			createElement(Harness, {
				serverPlan: makePlan("custom", planA, [8]),
				saveCustomPlan,
				resetToAuto,
				onError,
			}),
		);
	});

	await vi.waitFor(() => {
		expect(getInputValue(8)).toBe("Auto");
	});
	const input = container!.querySelector<HTMLInputElement>(
		'input[data-pid="8"]',
	)!;
	input.focus();
	await new Promise((resolve) => setTimeout(resolve, 0));
	input.blur();
	await vi.waitFor(() => {
		expect(getInputValue(8)).toBe("Auto");
	});
	expect(saveCustomPlan).not.toHaveBeenCalled();
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
