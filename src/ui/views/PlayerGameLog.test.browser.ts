import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@bugsnag/browser", () => {
	const getPlugin = () => ({
		createErrorBoundary:
			() =>
			({ children }: { children: unknown }) =>
				children,
	});
	return { default: { getPlugin }, getPlugin };
});
import { PLAYER_STATS_TABLES } from "../../common/index.ts";
import SeriesStats from "./PlayerGameLogSeriesStats.tsx";

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
	root?.unmount();
	root = undefined;
	document.body.innerHTML = "";
});

test("series comparison uses BBGM stat types and canonical table columns", async () => {
	document.body.innerHTML = '<div id="root"></div>';
	root = createRoot(document.getElementById("root")!);
	const regular = Object.fromEntries(
		PLAYER_STATS_TABLES.regular!.stats.map((stat) => [stat, 1]),
	);
	const advanced = Object.fromEntries(
		PLAYER_STATS_TABLES.advanced!.stats.map((stat) => [stat, 2]),
	);
	flushSync(() =>
		root!.render(
			createElement(SeriesStats, {
				seriesStats: [
					{
						key: "regular",
						label: "Regular Season",
						stats: { regular, advanced },
					},
					{
						key: "playoffs",
						label: "All Playoffs",
						stats: { regular, advanced },
					},
					{
						key: "0_1",
						label: "1st round vs. BOS",
						record: "Won 4-2",
						stats: {
							regular,
							advanced,
							gameHighs: { gp: 6, ptsMax: [33, 42, "BOS", 1, 2024] },
						},
					},
				] as any,
			}),
		),
	);
	await expect.poll(() => document.body.textContent).toContain("Series Stats");
	expect(document.body.textContent).toContain("1st round vs. BOS");
	expect(document.body.textContent).toContain("Won 4-2");
	expect(
		[...document.querySelectorAll("tbody tr")]
			.slice(0, 3)
			.map((row) => row.textContent),
	).toEqual([
		expect.stringContaining("Regular Season"),
		expect.stringContaining("All Playoffs"),
		expect.stringContaining("1st round vs. BOS"),
	]);
	const selector = document.querySelector<HTMLSelectElement>(
		'[aria-label="Series stat type"]',
	)!;
	expect([...selector.options].map((option) => option.textContent)).toEqual([
		"Per Game",
		"Per 36 Minutes",
		"Totals",
		"Shot Locations and Feats",
		"Advanced",
		"Game Highs",
	]);
	expect(document.querySelector(".datatable-search")).toBeNull();
	expect(document.querySelector(".datatable-menu")).toBeNull();
	selector.value = "advanced";
	selector.dispatchEvent(new Event("change", { bubbles: true }));
	await expect
		.poll(() => document.querySelectorAll("th").length)
		.toBeGreaterThan(PLAYER_STATS_TABLES.advanced!.stats.length);
	expect(document.body.textContent).toContain("Advanced");
	selector.value = "gameHighs";
	selector.dispatchEvent(new Event("change", { bubbles: true }));
	await expect
		.poll(() => document.querySelectorAll("th").length)
		.toBeGreaterThan(PLAYER_STATS_TABLES.gameHighs!.stats.length);
	await expect
		.poll(() =>
			[...document.querySelectorAll("tbody a")].some(
				(a) => a.textContent === "33",
			),
		)
		.toBe(true);
});
