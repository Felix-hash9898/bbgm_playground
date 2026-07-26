import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	liveGameInProgress: false,
	notify: vi.fn(),
	toWorker: vi.fn(),
}));

vi.mock("./index.ts", () => ({
	local: {
		getState: () => ({
			liveGameInProgress: mocks.liveGameInProgress,
			showLeagueTopBar: false,
		}),
	},
	notify: mocks.notify,
	toWorker: mocks.toWorker,
}));

import logEvent from "./logEvent.ts";

const logInjuredList = async (persistent: boolean) => {
	await logEvent({
		type: "injuredList",
		text: "PG Test Player - Sprained Ankle, 5 games",
		showNotification: true,
		persistent,
		hideInLiveGame: true,
		saveToDb: false,
	});
};

describe("injuredList notifications during Live Game", () => {
	beforeEach(() => {
		mocks.liveGameInProgress = false;
		mocks.notify.mockReset();
		mocks.toWorker.mockReset();
		mocks.toWorker.mockResolvedValue(undefined);
		(window as any).location = {
			pathname: "/l/1",
		};
	});

	afterEach(() => {
		(window as any).location = {
			pathname: "/",
		};
	});

	test("hides a persistent stop-on-injury notification during replay", async () => {
		(window as any).location.pathname = "/l/1/live_game/123";
		mocks.liveGameInProgress = true;

		await logInjuredList(true);

		expect(mocks.notify).not.toHaveBeenCalled();
		expect(mocks.toWorker).not.toHaveBeenCalled();
	});

	test("shows the same persistent notification and stops a direct sim", async () => {
		await logInjuredList(true);

		expect(mocks.notify).toHaveBeenCalledOnce();
		expect(mocks.notify).toHaveBeenCalledWith(
			"PG Test Player - Sprained Ankle, 5 games",
			"Injured this game",
			expect.objectContaining({
				persistent: true,
			}),
		);
		await vi.waitFor(() => {
			expect(mocks.toWorker).toHaveBeenCalledWith("main", "lockSet", [
				"stopGameSim",
				true,
			]);
		});
	});

	test("keeps a below-threshold direct-sim notification non-persistent", async () => {
		await logInjuredList(false);

		expect(mocks.notify).toHaveBeenCalledOnce();
		expect(mocks.notify).toHaveBeenCalledWith(
			"PG Test Player - Sprained Ankle, 5 games",
			"Injured this game",
			expect.objectContaining({
				persistent: false,
			}),
		);
		expect(mocks.toWorker).not.toHaveBeenCalled();
	});

	test("continues hiding a below-threshold notification during replay", async () => {
		(window as any).location.pathname = "/l/1/live_game/123";
		mocks.liveGameInProgress = true;

		await logInjuredList(false);

		expect(mocks.notify).not.toHaveBeenCalled();
		expect(mocks.toWorker).not.toHaveBeenCalled();
	});
});
