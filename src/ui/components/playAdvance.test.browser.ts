import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@bugsnag/browser", () => {
	const getPlugin = () => ({
		createErrorBoundary:
			() =>
			({ children }: { children: unknown }) =>
				children,
	});
	return { default: { getPlugin, notify: () => {} }, getPlugin };
});
const mocks = vi.hoisted(() => ({
	worker: vi.fn(),
	notification: vi.fn(),
	refresh: vi.fn(),
}));
import { promiseWorker } from "../util/index.ts";
import { emitter } from "../util/notify.ts";
import { viewManager } from "../util/viewManager.tsx";
import NextButton from "./BoxScoreNextButton.tsx";
import PlayMenu from "./PlayMenu.tsx";
import LeagueTopBar from "./LeagueTopBar.tsx";
import runPlayMenuAction from "../util/runPlayMenuAction.ts";
import { localActions } from "../util/local.ts";
import { PHASE } from "../../common/index.ts";

let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let unsubscribe: () => void;
beforeEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
	vi.spyOn(promiseWorker, "postMessage").mockImplementation(
		async ([category, action, param]: any) => {
			if (category === "playMenu") {
				return mocks.worker(category, action, param);
			}
		},
	);
	vi.spyOn(viewManager, "fromRealtimeUpdate").mockImplementation((action) =>
		mocks.refresh(action.updateEvents, action.url),
	);
	unsubscribe = emitter.on("notification", (message) =>
		mocks.notification({
			type: "error",
			text: message.message,
			persistent: message.persistent,
		}),
	);
	mocks.notification.mockResolvedValue(undefined);
	mocks.refresh.mockResolvedValue(undefined);
	localActions.update({
		lid: 10,
		phase: PHASE.REGULAR_SEASON,
		season: 2019,
		playMenuOptions: [
			{ id: "day", label: "One day", keyboardShortcut: "primary" },
		],
		keyboardShortcuts: undefined,
	});
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});
afterEach(() => {
	root.unmount();
	container.remove();
	unsubscribe();
	vi.restoreAllMocks();
});

const renderNext = (nextGid?: number) =>
	flushSync(() =>
		root.render(
			createElement(NextButton, {
				abbrev: "NYK",
				boxScore: { season: 2019 },
				currentGidInList: true,
				tid: 20,
				nextGid,
			}),
		),
	);

test("Sim Next observes failure, resets its button, and allows retry", async () => {
	mocks.worker
		.mockRejectedValueOnce(
			new Error("Contract option is not legal for this term"),
		)
		.mockResolvedValue(undefined);
	renderNext();
	container.querySelector("button")!.click();
	await expect.poll(() => mocks.notification.mock.calls.length).toBe(1);
	await expect
		.poll(() => container.querySelector("button")?.disabled)
		.toBe(false);
	expect(mocks.refresh).not.toHaveBeenCalled();
	container.querySelector("button")!.click();
	await expect.poll(() => mocks.worker.mock.calls.length).toBe(2);
	await expect
		.poll(() => container.querySelector("button")?.disabled)
		.toBe(false);
});

test("Sim Next waits for the worker refresh before navigating and suppresses repeated requests", async () => {
	let finish!: () => void;
	mocks.worker.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	renderNext();
	container.querySelector("button")!.click();
	container.querySelector("button")!.click();
	await expect.poll(() => mocks.worker.mock.calls.length).toBe(1);
	expect(mocks.refresh).not.toHaveBeenCalled();
	// The gameSim view refresh arrives while the worker request is still active.
	renderNext(6037);
	expect(mocks.refresh).not.toHaveBeenCalled();
	finish();
	await expect.poll(() => mocks.refresh.mock.calls.length).toBe(1);
	expect(mocks.refresh).toHaveBeenCalledWith(
		[],
		"/l/10/game_log/NYK_20/2019/6037",
	);
});

test("keyboard advances report errors and recover through the same action boundary", async () => {
	mocks.worker
		.mockRejectedValueOnce(new Error("daily settlement failed"))
		.mockResolvedValue(undefined);
	flushSync(() =>
		root.render(
			createElement(PlayMenu, {
				lid: 10,
				spectator: false,
				options: [{ id: "day", label: "One day", keyboardShortcut: "primary" }],
			}),
		),
	);
	document.dispatchEvent(
		new KeyboardEvent("keydown", { key: "p", altKey: true, bubbles: true }),
	);
	await expect.poll(() => mocks.notification.mock.calls.length).toBe(1);
	document.dispatchEvent(
		new KeyboardEvent("keydown", { key: "p", altKey: true, bubbles: true }),
	);
	await expect.poll(() => mocks.worker.mock.calls.length).toBe(2);
});

test("ordinary Play observes rejection and Stop remains usable during an advance", async () => {
	let reject!: (error: Error) => void;
	mocks.worker.mockImplementation((_category: string, action: string) =>
		action === "stop"
			? Promise.resolve()
			: new Promise<void>((_, rejectGate) => {
					reject = rejectGate;
				}),
	);
	const playing = runPlayMenuAction("week");
	expect(await runPlayMenuAction("day")).toBe(false);
	expect(await runPlayMenuAction("stop")).toBe(true);
	reject(new Error("write failed"));
	expect(await playing).toBe(false);
	expect(mocks.notification).toHaveBeenCalledWith(
		expect.objectContaining({
			type: "error",
			text: "write failed",
			persistent: true,
		}),
	);
});

test("ordinary Play menu click reports a rejected advance", async () => {
	mocks.worker.mockRejectedValueOnce(new Error("save failed"));
	flushSync(() =>
		root.render(
			createElement(PlayMenu, {
				lid: 10,
				spectator: false,
				options: [{ id: "day", label: "One day" }],
			}),
		),
	);
	container.querySelector<HTMLElement>("#play-button")!.click();
	await expect
		.poll(() => container.querySelector(".dropdown-item"))
		.not.toBeNull();
	container.querySelector<HTMLElement>(".dropdown-item")!.click();
	await expect.poll(() => mocks.notification.mock.calls.length).toBe(1);
	expect(mocks.notification.mock.calls[0]![0].text).toBe("save failed");
});

test("LeagueTopBar replaces the pregame NYK–CHA spread with 120–110 and the upcoming DEN game", async () => {
	const t = (tid: number, abbrev: string, pts?: number) => ({
		tid,
		ovr: 50,
		pts,
		branding: { region: abbrev, name: abbrev, abbrev },
	});
	localActions.update({
		showLeagueTopBar: true,
		liveGameInProgress: false,
		games: [{ gid: 6036, teams: [t(20, "NYK"), t(4, "CHA")] }],
	});
	flushSync(() => root.render(createElement(LeagueTopBar)));
	expect(container.textContent).toContain("NYK");
	expect(container.textContent).toContain("CHA");
	expect(container.textContent).not.toContain("120");
	flushSync(() =>
		localActions.mergeGames([
			{ gid: 6036, teams: [t(20, "NYK", 120), t(4, "CHA", 110)] },
			{ gid: 6037, teams: [t(20, "NYK"), t(7, "DEN")] },
		]),
	);
	await expect.poll(() => container.textContent).toContain("120");
	expect(container.textContent).toContain("110");
	expect(container.textContent).toContain("DEN");
});
