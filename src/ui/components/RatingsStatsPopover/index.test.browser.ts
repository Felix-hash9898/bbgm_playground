import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@bugsnag/browser", () => {
	const getPlugin = () => ({
		createErrorBoundary:
			() =>
			({ children }: { children: unknown }) =>
				children,
	});
	return {
		default: { getPlugin },
		getPlugin,
	};
});

vi.mock("../../util/crossTabEmitter.ts", () => ({
	crossTabEmitter: {
		on: () => () => {},
	},
}));

import { promiseWorker } from "../../util/index.ts";
import RatingsStatsPopover from "./index.tsx";

describe("RatingsStatsPopover", () => {
	let root: ReturnType<typeof createRoot> | undefined;
	let postMessageSpy: any;

	beforeEach(() => {
		document.body.innerHTML = '<div id="root"></div>';
		const container = document.getElementById("root")!;
		root = createRoot(container);

		postMessageSpy = vi
			.spyOn(promiseWorker, "postMessage")
			.mockImplementation((message: any) => {
				const [_channel, action, payload] = message;
				if (action === "getPlayerWatch") {
					return Promise.resolve(0);
				}
				if (action === "ratingsStatsPopoverInfo") {
					return Promise.resolve({
						name: "Test Player",
						jerseyNumber: "23",
						abbrev: "BOS",
						tid: 1,
						age: 25,
						ratings: { pos: "SG", ovr: 70, pot: 75, season: payload.season },
						stats: {
							pts: payload.playoffsCombined === "playoffs" ? 28.5 : 22.0,
							trb: 6.0,
							ast: 5.0,
						},
						type: payload.season,
					});
				}
				return Promise.resolve();
			});
	});

	afterEach(() => {
		postMessageSpy.mockRestore();
		root?.unmount();
		root = undefined;
		document.body.innerHTML = "";
	});

	test("does not render toggle buttons when allowPlayoffsToggle is not set", async () => {
		flushSync(() => {
			root!.render(
				createElement(RatingsStatsPopover, {
					pid: 1,
					season: 2024,
					playoffsCombined: "regularSeason",
				}),
			);
		});

		const icon = document.querySelector(".glyphicon-stats") as HTMLElement;
		icon.click();

		await vi.waitFor(() => {
			const popover = document.body.querySelector(".popover");
			expect(popover).not.toBeNull();
		});

		const toggleGroup = document.body.querySelector(
			'[aria-label="Season type"]',
		);
		expect(toggleGroup).toBeNull();
	});

	test("renders toggle with correct default and allows switching Regular <-> Playoffs", async () => {
		// Playoff context default
		flushSync(() => {
			root!.render(
				createElement(RatingsStatsPopover, {
					pid: 1,
					season: 2024,
					playoffsCombined: "playoffs",
					allowPlayoffsToggle: true,
				}),
			);
		});

		// Click the popover icon to open popover
		const icon = document.querySelector(".glyphicon-stats") as HTMLElement;
		icon.click();

		await vi.waitFor(() => {
			const toggleGroup = document.body.querySelector(
				'[aria-label="Season type"]',
			);
			expect(toggleGroup).not.toBeNull();
		});

		const toggleGroup = document.body.querySelector(
			'[aria-label="Season type"]',
		)!;
		const buttons = toggleGroup.querySelectorAll("button");
		expect(buttons).toHaveLength(2);
		expect(buttons[0]!.textContent).toBe("Regular");
		expect(buttons[1]!.textContent).toBe("Playoffs");

		// Playoffs is active by default in playoff context
		expect(buttons[1]!.classList.contains("btn-primary")).toBe(true);
		expect(buttons[0]!.classList.contains("btn-primary")).toBe(false);

		// Switch to Regular Season
		buttons[0]!.click();

		await vi.waitFor(() => {
			expect(postMessageSpy).toHaveBeenCalledWith([
				"main",
				"ratingsStatsPopoverInfo",
				{
					pid: 1,
					playoffsCombined: "regularSeason",
					season: 2024,
				},
			]);
		});

		expect(buttons[0]!.classList.contains("btn-primary")).toBe(true);
		expect(buttons[1]!.classList.contains("btn-primary")).toBe(false);

		// Switch back to Playoffs
		buttons[1]!.click();

		await vi.waitFor(() => {
			expect(postMessageSpy).toHaveBeenCalledWith([
				"main",
				"ratingsStatsPopoverInfo",
				{
					pid: 1,
					playoffsCombined: "playoffs",
					season: 2024,
				},
			]);
		});

		expect(buttons[1]!.classList.contains("btn-primary")).toBe(true);
		expect(buttons[0]!.classList.contains("btn-primary")).toBe(false);
	});

	test("resets selection when player or season or context changes", async () => {
		flushSync(() => {
			root!.render(
				createElement(RatingsStatsPopover, {
					pid: 1,
					season: 2024,
					playoffsCombined: "regularSeason",
					allowPlayoffsToggle: true,
				}),
			);
		});

		const icon = document.querySelector(".glyphicon-stats") as HTMLElement;
		icon.click();

		await vi.waitFor(() => {
			const toggleGroup = document.body.querySelector(
				'[aria-label="Season type"]',
			);
			expect(toggleGroup).not.toBeNull();
		});

		const toggleGroup = document.body.querySelector(
			'[aria-label="Season type"]',
		)!;
		const buttons = toggleGroup.querySelectorAll("button");
		expect(buttons[0]!.classList.contains("btn-primary")).toBe(true);

		// Change prop to playoffs and different pid
		flushSync(() => {
			root!.render(
				createElement(RatingsStatsPopover, {
					pid: 2,
					season: 2024,
					playoffsCombined: "playoffs",
					allowPlayoffsToggle: true,
				}),
			);
		});

		const nextIcon = document.querySelector(".glyphicon-stats") as HTMLElement;
		nextIcon.click();

		await vi.waitFor(() => {
			const tg = document.body.querySelector('[aria-label="Season type"]');
			expect(tg).not.toBeNull();
			const b = tg!.querySelectorAll("button");
			expect(b[1]!.classList.contains("btn-primary")).toBe(true);
		});
	});

	test("stale out-of-order request resolution cannot overwrite newer selected season type data", async () => {
		let resolvePlayoffsReq: ((val: any) => void) | undefined;
		let resolveRegularReq: ((val: any) => void) | undefined;

		postMessageSpy.mockRestore();
		postMessageSpy = vi
			.spyOn(promiseWorker, "postMessage")
			.mockImplementation((message: any) => {
				const [_channel, action, payload] = message;
				if (action === "getPlayerWatch") {
					return Promise.resolve(0);
				}
				if (action === "ratingsStatsPopoverInfo") {
					if (payload.playoffsCombined === "playoffs") {
						return new Promise((resolve) => {
							resolvePlayoffsReq = () =>
								resolve({
									name: "Test Player",
									jerseyNumber: "23",
									abbrev: "BOS",
									tid: 1,
									age: 25,
									ratings: { pos: "SG", ovr: 70, pot: 75, season: 2024 },
									stats: { pts: 35.0 },
									type: 2024,
								});
						});
					}
					if (payload.playoffsCombined === "regularSeason") {
						return new Promise((resolve) => {
							resolveRegularReq = () =>
								resolve({
									name: "Test Player",
									jerseyNumber: "23",
									abbrev: "BOS",
									tid: 1,
									age: 25,
									ratings: { pos: "SG", ovr: 70, pot: 75, season: 2024 },
									stats: { pts: 20.0 },
									type: 2024,
								});
						});
					}
				}
				return Promise.resolve();
			});

		// Start with regular season
		flushSync(() => {
			root!.render(
				createElement(RatingsStatsPopover, {
					pid: 1,
					season: 2024,
					playoffsCombined: "regularSeason",
					allowPlayoffsToggle: true,
				}),
			);
		});

		const icon = document.querySelector(".glyphicon-stats") as HTMLElement;
		icon.click();

		await vi.waitFor(() => {
			const toggleGroup = document.body.querySelector(
				'[aria-label="Season type"]',
			);
			expect(toggleGroup).not.toBeNull();
		});

		const toggleGroup = document.body.querySelector(
			'[aria-label="Season type"]',
		)!;
		const buttons = toggleGroup.querySelectorAll("button");

		// Click Playoffs (request 1: playoffs started)
		buttons[1]!.click();

		// Click Regular Season (request 2: regularSeason started)
		buttons[0]!.click();

		// Resolve Regular Season FIRST (request 2)
		expect(resolveRegularReq).toBeDefined();
		resolveRegularReq!({});

		await vi.waitFor(() => {
			const popover = document.body.querySelector(".popover");
			expect(popover?.textContent).toContain("20.0");
		});

		// Resolve Playoffs LATER (request 1)
		expect(resolvePlayoffsReq).toBeDefined();
		resolvePlayoffsReq!({});

		// Ensure that even after waiting, the stale playoffs response did NOT overwrite regular season
		await new Promise((r) => setTimeout(r, 50));
		const popover = document.body.querySelector(".popover");
		expect(popover?.textContent).toContain("20.0");
		expect(popover?.textContent).not.toContain("35.0");
		expect(buttons[0]!.classList.contains("btn-primary")).toBe(true);
	});
});
