import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import type { Option } from "../../common/types.ts";
import { assignPlayMenuKeyboardShortcuts } from "../../common/playMenu.ts";

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(),
	realtimeUpdate: vi.fn(),
	toWorker: vi.fn(),
}));

vi.mock("../util/index.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../util/index.ts")>();
	return {
		...actual,
		confirm: mocks.confirm,
		realtimeUpdate: mocks.realtimeUpdate,
		toWorker: mocks.toWorker,
	};
});

import PlayMenu from "./PlayMenu.tsx";
import { local } from "../util/local.ts";

let container: HTMLDivElement;
let root: Root;

const makeOptions = (rows: [string, string, Option["keyboardShortcut"]?][]) =>
	assignPlayMenuKeyboardShortcuts(
		rows.map(([id, label, keyboardShortcut]) => ({
			id,
			label,
			...(keyboardShortcut === undefined ? {} : { keyboardShortcut }),
		})),
	);

const renderMenu = async (options: Option[]) => {
	await act(async () => {
		root.render(
			createElement(PlayMenu, {
				lid: 1,
				spectator: false,
				options,
			}),
		);
	});
};

const dispatchShortcut = async (key: string) => {
	await act(async () => {
		document.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				altKey: true,
				code: `Key${key.toUpperCase()}`,
				key,
			}),
		);
	});
};

const labelsForLetter = (letter: string) =>
	[...container.querySelectorAll<HTMLElement>(".kbd")].filter((label) =>
		label.textContent?.endsWith(letter),
	);

beforeEach(() => {
	(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	mocks.confirm.mockReset();
	mocks.realtimeUpdate.mockReset();
	mocks.toWorker.mockReset();
	local.getState().actions.update({
		keyboardShortcuts: undefined,
		liveGameInProgress: false,
	});
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

test("All-Star day shows one Alt+Y label and Alt+Y runs One day", async () => {
	const allStarOptions = makeOptions([
		["viewAllStar", "All-Star events"],
		["day", "One day", "secondary"],
		["dayLive", "One day (live)", "live"],
		["week", "One week", "week"],
		["month", "One month", "month"],
		["untilPlayoffs", "Until playoffs", "secondary"],
	]);
	allStarOptions[0]!.url = "/league/1/all_star";
	await renderMenu(allStarOptions);

	assert.strictEqual(labelsForLetter("Y").length, 1);
	assert.strictEqual(labelsForLetter("P").length, 1);
	assert.strictEqual(labelsForLetter("W").length, 1);
	await dispatchShortcut("p");
	assert.deepStrictEqual(mocks.realtimeUpdate.mock.calls[0], [
		[],
		"/league/1/all_star",
	]);
	await dispatchShortcut("y");
	assert.deepStrictEqual(mocks.toWorker.mock.calls, [
		["playMenu", "day", undefined],
	]);
});

test("customized colliding keys show only the action that actually receives the key", async () => {
	const sharedShortcut = {
		altKey: true,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		key: "y",
	};
	local.getState().actions.update({
		keyboardShortcuts: {
			playMenu: {
				primary: sharedShortcut,
				secondary: sharedShortcut,
			},
		},
	});
	await renderMenu([
		{
			id: "primaryAction",
			label: "Primary action",
			keyboardShortcut: "primary",
		},
		{
			id: "secondaryAction",
			label: "Secondary action",
			keyboardShortcut: "secondary",
		},
	]);

	assert.strictEqual(labelsForLetter("Y").length, 1);
	await dispatchShortcut("y");
	assert.deepStrictEqual(mocks.toWorker.mock.calls, [
		["playMenu", "primaryAction", undefined],
	]);
});

test("an inactive action cannot shadow the shortcut of a visible menu item", async () => {
	const sharedShortcut = {
		altKey: true,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		key: "y",
	};
	local.getState().actions.update({
		keyboardShortcuts: {
			playMenu: {
				secondary: sharedShortcut,
				allStarGame: sharedShortcut,
			},
		},
	});
	await renderMenu(
		makeOptions([["untilAllStarGame", "Until All-Star Game", "allStarGame"]]),
	);

	assert.strictEqual(labelsForLetter("Y").length, 1);
	await dispatchShortcut("y");
	assert.deepStrictEqual(mocks.toWorker.mock.calls, [
		["playMenu", "untilAllStarGame", undefined],
	]);
});

test("phase changes recalculate shortcuts; regular season keeps Alt+W on One week", async () => {
	const afterAllStar = makeOptions([
		["viewAllStar", "All-Star events"],
		["day", "One day", "secondary"],
		["untilPlayoffs", "Until playoffs", "secondary"],
	]);
	afterAllStar[0]!.url = "/league/1/all_star";
	await renderMenu(afterAllStar);
	await dispatchShortcut("p");
	assert.deepStrictEqual(mocks.realtimeUpdate.mock.calls[0], [
		[],
		"/league/1/all_star",
	]);

	mocks.realtimeUpdate.mockClear();
	await renderMenu(
		makeOptions([
			["day", "One day", "secondary"],
			["dayLive", "One day (live)", "live"],
			["week", "One week", "week"],
			["month", "One month", "month"],
			["untilPlayoffs", "Until playoffs", "secondary"],
		]),
	);

	assert.strictEqual(labelsForLetter("W").length, 1);
	assert.strictEqual(labelsForLetter("P").length, 1);
	await dispatchShortcut("p");
	assert.deepStrictEqual(mocks.toWorker.mock.calls[0], [
		"playMenu",
		"day",
		undefined,
	]);
	mocks.toWorker.mockClear();
	await dispatchShortcut("w");
	assert.deepStrictEqual(mocks.toWorker.mock.calls[0], [
		"playMenu",
		"week",
		undefined,
	]);

	mocks.toWorker.mockClear();
	await renderMenu(makeOptions([["stop", "Stop"]]));
	assert.strictEqual(labelsForLetter("P").length, 1);
	await dispatchShortcut("p");
	assert.deepStrictEqual(mocks.toWorker.mock.calls[0], [
		"playMenu",
		"stop",
		undefined,
	]);
});
