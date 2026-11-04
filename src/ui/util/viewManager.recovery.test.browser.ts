import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@bugsnag/browser", () => {
	const getPlugin = () => ({
		createErrorBoundary:
			() =>
			({ children }: { children: unknown }) =>
				children,
	});
	return { default: { getPlugin, notify: () => {} }, getPlugin };
});
const mocks = vi.hoisted(() => ({ worker: vi.fn() }));
import { promiseWorker } from "./index.ts";
vi.mock("../hooks/useTitleBar.tsx", () => ({ default: () => {} }));
import { useViewData, viewManager } from "./viewManager.tsx";
import router from "../router/index.ts";

beforeEach(() => {
	vi.restoreAllMocks();
	mocks.worker.mockReset();
	vi.spyOn(promiseWorker, "postMessage").mockImplementation(
		([category, action, param]: any) => mocks.worker(category, action, param),
	);
	viewManager.queue = [];
	viewManager.processingAction = false;
	viewManager.idLoaded = undefined;
	viewManager.viewData = {};
});

const update = () =>
	viewManager.fromRealtimeUpdate({
		url: "/l/10/game_log/NYK_20/2019",
		refresh: true,
		updateEvents: ["gameSim"],
	});

test("a rejected view load releases the queue and the next refresh can update Game Log", async () => {
	mocks.worker.mockImplementation(async (_category: string, name: string) => {
		if (name === "runBefore") {
			return { boxScore: { gid: 6037, pts: [120, 110] } };
		}
	});
	mocks.worker.mockRejectedValueOnce(new Error("beforeView failed"));
	vi.spyOn(router, "navigate").mockImplementation(async (_url, options) => {
		await viewManager.fromRouter({
			id: "gameLog",
			inLeague: true,
			Component: () => null,
			context: { path: "", params: { lid: "10" }, state: options?.state ?? {} },
		});
	});
	const first = expect(update()).rejects.toThrow("beforeView failed");
	await first;
	expect(viewManager.processingAction).toBe(false);
	expect(useViewData.getState().loading).toBe(false);
	await update();
	expect(useViewData.getState().data.boxScore).toEqual({
		gid: 6037,
		pts: [120, 110],
	});
	expect(viewManager.processingAction).toBe(false);
});

test("a failed router request rejects its caller and drains an already queued refresh", async () => {
	let reject!: (error: Error) => void;
	vi.spyOn(router, "navigate")
		.mockImplementationOnce(
			() =>
				new Promise<void>((_, rejectGate) => {
					reject = rejectGate;
				}),
		)
		.mockImplementationOnce(async () => {
			viewManager.initNextAction();
		});
	const first = expect(update()).rejects.toThrow("router failed");
	const second = update();
	reject(new Error("router failed"));
	await first;
	await second;
	expect(viewManager.queue).toHaveLength(0);
	expect(viewManager.processingAction).toBe(false);
});
