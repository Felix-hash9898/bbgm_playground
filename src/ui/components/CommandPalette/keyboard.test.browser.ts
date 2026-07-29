import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { CommandPaletteWrapper } from "./index.tsx";

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

let container: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
	root?.unmount();
	container?.remove();
	document.querySelectorAll(".modal-backdrop").forEach((element) => {
		element.remove();
	});
	document.body.classList.remove("modal-open");
	root = undefined;
	container = undefined;
});

const dispatchKey = (
	target: EventTarget,
	key: string,
	options: KeyboardEventInit = {},
) => {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		code: key,
		key,
		...options,
	});
	target.dispatchEvent(event);
	return event;
};

test("only intercepts navigation while the command palette is open", async () => {
	Element.prototype.scrollIntoView = vi.fn();

	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	flushSync(() => {
		root!.render(createElement(CommandPaletteWrapper));
	});

	const input = document.createElement("input");
	const textarea = document.createElement("textarea");
	const contentEditable = document.createElement("div");
	contentEditable.contentEditable = "true";
	document.body.append(input, textarea, contentEditable);

	for (const element of [input, textarea, contentEditable]) {
		expect(dispatchKey(element, "ArrowUp").defaultPrevented).toBe(false);
		expect(dispatchKey(element, "ArrowDown").defaultPrevented).toBe(false);
	}

	// One of these is the platform shortcut; the other is ignored.
	dispatchKey(document, "k", { ctrlKey: true });
	dispatchKey(document, "k", { metaKey: true });

	await vi.waitFor(() => {
		expect(
			document.querySelector<HTMLInputElement>(
				'input[placeholder^="Search pages"]',
			),
		).not.toBeNull();
	});
	const paletteInput = document.querySelector<HTMLInputElement>(
		'input[placeholder^="Search pages"]',
	)!;

	const down = dispatchKey(paletteInput, "ArrowDown");
	expect(down.defaultPrevented).toBe(true);
	await vi.waitFor(() => {
		expect(document.querySelectorAll(".table-bg-striped")).toHaveLength(1);
	});

	const up = dispatchKey(paletteInput, "ArrowUp");
	expect(up.defaultPrevented).toBe(true);
	await vi.waitFor(() => {
		expect(document.querySelectorAll(".table-bg-striped")).toHaveLength(1);
	});

	dispatchKey(document, "Escape");
	await vi.waitFor(() => {
		expect(
			document.querySelector('input[placeholder^="Search pages"]'),
		).toBeNull();
	});

	for (const element of [input, textarea, contentEditable]) {
		expect(dispatchKey(element, "ArrowUp").defaultPrevented).toBe(false);
		expect(dispatchKey(element, "ArrowDown").defaultPrevented).toBe(false);
	}

	dispatchKey(document, "k", { ctrlKey: true });
	dispatchKey(document, "k", { metaKey: true });
	await vi.waitFor(() => {
		expect(
			document.querySelector<HTMLInputElement>(
				'input[placeholder^="Search pages"]',
			),
		).not.toBeNull();
		expect(document.querySelectorAll(".table-bg-striped")).toHaveLength(0);
	});

	input.remove();
	textarea.remove();
	contentEditable.remove();
});
