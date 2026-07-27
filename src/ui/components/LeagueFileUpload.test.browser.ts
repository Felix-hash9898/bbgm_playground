import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@bugsnag/browser", () => {
	const getPlugin = () => ({
		createErrorBoundary:
			() =>
			({ children }: { children: unknown }) =>
				children,
	});

	return {
		default: {
			getPlugin,
		},
		getPlugin,
	};
});

vi.mock("../util/toWorker.ts", () => {
	return {
		default: vi.fn(),
	};
});

import toWorker from "../util/toWorker.ts";
import LeagueFileUpload from "./LeagueFileUpload.tsx";

let container: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
	root?.unmount();
	container?.remove();
	vi.mocked(toWorker).mockReset();
	root = undefined;
	container = undefined;
});

const enter = (input: HTMLInputElement) => {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		code: "Enter",
		key: "Enter",
	});
	input.dispatchEvent(event);
	return event;
};

const setInputValue = (input: HTMLInputElement, value: string) => {
	const setter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)!.set!;
	setter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
};

test("URL Enter submits once, ignores empty/loading Enter, and retries after failure", async () => {
	let rejectFirst!: (error: Error) => void;
	const firstRequest = new Promise<never>((_resolve, reject) => {
		rejectFirst = reject;
	});
	vi.mocked(toWorker)
		.mockReturnValueOnce(firstRequest)
		.mockResolvedValueOnce({
			basicInfo: undefined,
			schemaErrors: [],
		} as any);

	const onDone = vi.fn();
	const unrelatedSubmit = vi.fn((event: SubmitEvent) => {
		event.preventDefault();
	});
	const form = document.createElement("form");
	form.addEventListener("submit", unrelatedSubmit);
	container = document.createElement("div");
	form.append(container);
	document.body.append(form);
	root = createRoot(container);
	flushSync(() => {
		root!.render(
			createElement(LeagueFileUpload, {
				enterURL: true,
				onDone,
			}),
		);
	});

	const input = container.querySelector<HTMLInputElement>(
		'input[placeholder="URL"]',
	)!;

	expect(enter(input).defaultPrevented).toBe(true);
	expect(toWorker).not.toHaveBeenCalled();
	expect(unrelatedSubmit).not.toHaveBeenCalled();

	setInputValue(input, "https://example.com/league.json");
	await vi.waitFor(() => {
		expect(input.value).toBe("https://example.com/league.json");
	});

	expect(enter(input).defaultPrevented).toBe(true);
	expect(enter(input).defaultPrevented).toBe(true);
	expect(toWorker).toHaveBeenCalledTimes(1);
	expect(unrelatedSubmit).not.toHaveBeenCalled();

	rejectFirst(new Error("network failed"));
	await vi.waitFor(() => {
		expect(onDone).toHaveBeenCalledTimes(1);
	});

	expect(enter(input).defaultPrevented).toBe(true);
	await vi.waitFor(() => {
		expect(toWorker).toHaveBeenCalledTimes(2);
		expect(onDone).toHaveBeenCalledTimes(2);
	});

	form.remove();
});
