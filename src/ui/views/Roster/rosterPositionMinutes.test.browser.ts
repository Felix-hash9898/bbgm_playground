import { createElement, type ComponentProps } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page } from "vitest/browser";

vi.hoisted(() => {
	// Every module the component loads is a resource entry. Keep all of them.
	performance.setResourceTimingBufferSize(100000);
});

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

import { localActions } from "../../util/local.ts";
import RosterPositionMinutes, {
	POSITION_MINUTES_SECTION_TITLE,
} from "./RosterPositionMinutes.tsx";

const setPeriods = (numPeriods: number, quarterLength: number) => {
	flushSync(() => {
		localActions.update({ numPeriods, quarterLength });
	});
};

// Set VITE_ROTATION_TIMELINE_SCREENSHOT_DIR to an absolute folder to save
// screenshots with the real light and dark stylesheets for visual review.
const screenshotDir = (
	import.meta as { env?: Record<string, string | undefined> }
).env?.VITE_ROTATION_TIMELINE_SCREENSHOT_DIR;

const roster = [
	["Karl-Anthony", "Towns", "C", 32],
	["Tyrese", "Maxey", "PG", 32],
	["Michael", "Porter", "SF", 32],
	["Nassir", "Little", "GF", 30],
	["Cooper", "Flagg", "F", 28],
	["Chet", "Holmgren", "FC", 28],
	["Tyrese", "Haliburton", "PG", 28],
	["Karlo", "Matkovic", "FC", 18],
	["KJ", "Martin", "F", 6],
	["Egor", "Demin", "G", 6],
	["Deep", "Reserve", "SG", 0],
	["Third", "Stringer", "PF", 0],
	["Last", "Bench", "C", 0],
] as const;

const players = roster.map(([firstName, lastName, pos], i) => ({
	pid: i + 1,
	firstName,
	lastName,
	ratings: { pos },
}));

const healthy = Object.fromEntries(
	roster.map(([, , , minutes], i) => [i + 1, minutes]),
) as Record<number, number>;

// Towns and Haliburton are out for the next game
const current: Record<number, number> = {
	...healthy,
	1: 0,
	7: 0,
	2: 36,
	3: 36,
	4: 34,
	5: 30,
	6: 34.5,
	8: 29.3,
	9: 12,
	10: 16.2,
	11: 12,
};

type Props = ComponentProps<typeof RosterPositionMinutes>;

const defaultProps: Props = {
	players,
	healthyMinutesByPid: healthy,
	currentMinutesByPid: current,
	currentPending: false,
	numPlayersOnCourt: 5,
};

let container: HTMLDivElement;
let root: Root;

const render = (props: Partial<Props> = {}) => {
	flushSync(() => {
		root.render(
			createElement(RosterPositionMinutes, { ...defaultProps, ...props }),
		);
	});
};

const settle = async () => {
	await new Promise((resolve) => setTimeout(resolve, 30));
};

const query = (testId: string) =>
	Array.from(
		container.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
	);

const OLD_SECTION_KEY = "show-roster-Rotation Timeline";
const NEW_SECTION_KEY = `show-roster-${POSITION_MINUTES_SECTION_TITLE}`;
const LEGACY_TEST_IDS = [
	"rotation-reference",
	"rotation-timeline-chart",
	"rotation-timeline-track",
	"rotation-timeline-stint",
	"rotation-timeline-cursor",
	"rotation-timeline-readout",
	"rotation-timeline-name",
	"rotation-timeline-period-line",
];
const expectNoLegacyTimeline = () => {
	for (const testId of LEGACY_TEST_IDS) {
		expect(query(testId), testId).toHaveLength(0);
	}
	expect(container.querySelector("details")).toBeNull();
	expect(container.querySelector('[role="slider"]')).toBeNull();
	expect(container.textContent).not.toContain("Reference court time");
	expect(container.textContent).not.toContain("Rotation Timeline");
	// The retired Stage 5 court-time walk is not even loaded by this component
	// tree, so it cannot run. rosterPositionMinutesEntry.test.browser.ts has the
	// positive control for this check.
	expect(
		performance
			.getEntriesByType("resource")
			.map((entry) => decodeURIComponent(entry.name))
			.filter((url) => /\/Roster\/rotationTimeline\.ts(\?|$)/.test(url)),
	).toEqual([]);
};

const sectionButton = () =>
	Array.from(container.querySelectorAll("button")).find(
		(element) =>
			element.textContent === "Hide" || element.textContent === "Show",
	)!;

const clickPlan = async (label: string) => {
	const button = Array.from(container.querySelectorAll("button")).find(
		(element) => element.textContent === label,
	)!;
	button.click();
	await settle();
};

const pressedPlan = () =>
	Array.from(container.querySelectorAll("button"))
		.filter((element) => element.getAttribute("aria-pressed") === "true")
		.map((element) => element.textContent);

const loadStylesheet = async (theme: "light" | "dark") => {
	document.querySelector("#rotation-timeline-test-css")?.remove();
	// Built stylesheets, if this checkout has been built. ?raw keeps the dev
	// server from treating the CSS as a module.
	let css: string;
	try {
		css = (await import(/* @vite-ignore */ `/build/gen/${theme}.css?raw`))
			.default;
	} catch {
		return false;
	}
	const style = document.createElement("style");
	style.id = "rotation-timeline-test-css";
	style.textContent = css;
	document.head.append(style);
	await settle();
	return true;
};

beforeEach(() => {
	localStorage.clear();
	setPeriods(4, 12);
	container = document.createElement("div");
	container.style.padding = "8px";
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	flushSync(() => {
		root.unmount();
	});
	container.remove();
	document.querySelector("#rotation-timeline-test-css")?.remove();
	await page.viewport(1024, 768);
});

describe("Roster position minutes section", () => {
	test("is its own default-visible section and never runs the retired timeline", async () => {
		render();
		await settle();
		expect(container.querySelector("h2")!.textContent).toBe("Position Minutes");
		expect(query("rotation-position-minutes")[0]!.checkVisibility()).toBe(true);
		expect(pressedPlan()).toEqual(["Healthy plan"]);
		expectNoLegacyTimeline();
		await clickPlan("Current plan");
		expect(query("rotation-position-minutes")[0]!.checkVisibility()).toBe(true);
		setPeriods(2, 24);
		await settle();
		await clickPlan("Healthy plan");
		render({ healthyMinutesByPid: { ...healthy, 1: 30, 11: 2 } });
		await settle();
		expectNoLegacyTimeline();
		expect(localStorage.getItem(NEW_SECTION_KEY)).toBe("true");
		expect(localStorage.getItem(OLD_SECTION_KEY)).toBeNull();
	});

	test("a hidden old Rotation Timeline section does not hide the table after the upgrade", async () => {
		// State left behind by a player who hid the retired Stage 5 chart
		localStorage.setItem(OLD_SECTION_KEY, "false");
		render();
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(1);
		expect(query("rotation-position-minutes")[0]!.checkVisibility()).toBe(true);
		expect(query("rotation-position-row")).toHaveLength(10);
		expect(sectionButton().textContent).toBe("Hide");
		expect(sectionButton().getAttribute("aria-expanded")).toBe("true");
		// The old preference is left alone, not migrated or overwritten
		expect(localStorage.getItem(OLD_SECTION_KEY)).toBe("false");
		expect(localStorage.getItem(NEW_SECTION_KEY)).toBe("true");

		// The new section has its own remembered choice
		sectionButton().click();
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("roster-position-minutes-section")).toHaveLength(0);
		expect(localStorage.getItem(NEW_SECTION_KEY)).toBe("false");
		expect(localStorage.getItem(OLD_SECTION_KEY)).toBe("false");
		flushSync(() => {
			root.unmount();
		});
		root = createRoot(container);
		render();
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(sectionButton().textContent).toBe("Show");
		sectionButton().click();
		await settle();
		expect(query("rotation-position-minutes")[0]!.checkVisibility()).toBe(true);
		expect(localStorage.getItem(NEW_SECTION_KEY)).toBe("true");

		// And an old "shown" value cannot force it open either way
		localStorage.clear();
		localStorage.setItem(OLD_SECTION_KEY, "true");
		localStorage.setItem(NEW_SECTION_KEY, "false");
		flushSync(() => {
			root.unmount();
		});
		root = createRoot(container);
		render();
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expectNoLegacyTimeline();
	});

	test("position table assigns every planned minute exactly once", async () => {
		render();
		await settle();
		const matrix = query("rotation-position-minutes")[0]!;
		expect(matrix.textContent).toContain("Estimated position minutes");
		expect(matrix.textContent).toContain("balanced rounding");
		const rows = query("rotation-position-row");
		expect(rows).toHaveLength(10);
		const columns = [0, 0, 0, 0, 0];
		const displayedColumns = [0, 0, 0, 0, 0];
		for (const row of rows) {
			const pid = Number(row.dataset.pid);
			const cells = [...row.querySelectorAll<HTMLElement>("[data-position]")];
			let rowSeconds = 0;
			let displayedTotal = 0;
			for (const [i, cell] of cells.entries()) {
				const text = cell.textContent!.replace(/[*?]/g, "");
				const shown = text === "—" ? 0 : Number(text);
				expect(shown).toBe(Number(cell.dataset.minutes));
				displayedTotal += shown;
				displayedColumns[i]! += shown;
				const value = Number(cell.dataset.seconds);
				rowSeconds += value;
				columns[i]! += value;
			}
			expect(rowSeconds).toBe(healthy[pid]! * 60);
			expect(displayedTotal).toBe(
				Number(
					row.querySelector('[data-testid="rotation-position-player-total"]')!
						.textContent,
				),
			);
		}
		expect(columns).toEqual([2880, 2880, 2880, 2880, 2880]);
		expect(displayedColumns).toEqual(
			query("rotation-position-total").map((e) => Number(e.textContent)),
		);
		expect(displayedColumns.reduce((s, x) => s + x, 0)).toBe(
			Number(query("rotation-position-team-total")[0]!.textContent),
		);
		expect(query("rotation-position-team-total")[0]!.textContent).toBe("240");
		const original = matrix.textContent;
		// Period settings do not change a 48-minute healthy allocation.
		setPeriods(3, 16);
		await settle();
		expect(query("rotation-position-minutes")[0]!.textContent).toBe(original);
		expectNoLegacyTimeline();
	});

	test("real Knicks position allocation shows explicit flex instead of double coverage", async () => {
		const data = [
			[1956, "Karl-Anthony", "Towns", "C", 34],
			[1582, "Tyrese", "Maxey", "G", 34],
			[1529, "Nassir", "Little", "GF", 32],
			[1659, "Collin", "Murray-Boyles", "PF", 30],
			[1761, "Michael", "Porter Jr.", "F", 30],
			[1317, "Tyrese", "Haliburton", "G", 28],
			[2077, "Rocco", "Zikarsky", "C", 20],
			[1581, "Karlo", "Matković", "PF", 18],
			[903, "Egor", "Dёmin", "PG", 14],
		] as const;
		render({
			players: data.map(([pid, firstName, lastName, pos]) => ({
				pid,
				firstName,
				lastName,
				ratings: { pos },
			})),
			healthyMinutesByPid: Object.fromEntries(
				data.map(([pid, , , , minutes]) => [pid, minutes]),
			),
		});
		await settle();
		const cell = (pid: number, pos: string) =>
			container.querySelector<HTMLElement>(
				`[data-testid="rotation-position-row"][data-pid="${pid}"] [data-position="${pos}"]`,
			)!;
		expect(cell(1956, "C").textContent).toBe("30");
		expect(cell(1317, "PG").textContent).toBe("15");
		expect(cell(1582, "SG").textContent).toBe("15");
		expect(cell(2077, "PF").textContent).toBe("2*");
		expect(cell(1581, "SF").textContent).toBe("2*");
		expect(query("rotation-position-uncertainty")[0]!.textContent).toContain(
			"12 min outside listed positions",
		);
		expect(query("rotation-position-total").map((e) => e.textContent)).toEqual(
			Array(5).fill("48"),
		);
		// Per-position off-label row: where the flex is needed, counted once
		const outsideCells = query("rotation-position-outside");
		expect(outsideCells.map((e) => e.dataset.position)).toEqual([
			"PG",
			"SG",
			"SF",
			"PF",
			"C",
		]);
		const outsideValues = outsideCells.map((e) =>
			e.textContent === "—" ? 0 : Number(e.textContent),
		);
		expect(outsideValues.reduce((s, x) => s + x, 0)).toBe(12);
		expect(query("rotation-position-outside-total")[0]!.textContent).toBe("12");
		// Each position's off-label minutes are exactly its starred cells
		for (const [i, position] of ["PG", "SG", "SF", "PF", "C"].entries()) {
			const starred = Array.from(
				container.querySelectorAll<HTMLElement>(
					`[data-testid="rotation-position-row"] [data-position="${position}"]`,
				),
			)
				.filter((cell) => cell.textContent!.endsWith("*"))
				.reduce((s, cell) => s + Number(cell.textContent!.slice(0, -1)), 0);
			expect(outsideValues[i], position).toBe(starred);
		}
		expect(outsideValues[3]).toBeGreaterThan(0);
		expectNoLegacyTimeline();
		if (screenshotDir) {
			for (const [theme, width, name] of [
				["light", 1024, "desktop"],
				["dark", 360, "mobile"],
			] as const) {
				await loadStylesheet(theme);
				await page.viewport(width, 900);
				await settle();
				await page.screenshot({
					path: `${screenshotDir}/nyk-${theme}-${name}.png`,
					fullPage: true,
				});
			}
		}
	});

	test("visible role estimates update independently and hidden/spectator states fall back safely", async () => {
		const visiblePlayers = players.map((p, i) => ({
			...p,
			ratings: {
				...p.ratings,
				drb: i === 1 ? 85 : 55,
				pss: i === 1 ? 90 : 45,
				oiq: 65,
				spd: 60,
				hgt: 55,
				reb: 55,
				diq: 55,
				stre: 55,
				tp: i === 1 ? 25 : 75,
				jmp: 50,
				dnk: 50,
				ins: 50,
			},
		}));
		render({
			players: visiblePlayers,
			ratingsVisible: false,
			readonlyPreview: true,
		});
		await settle();
		const baseline = query("rotation-position-minutes")[0]!.textContent;
		expect(container.textContent).toContain("Read-only plan preview");
		render({
			players: visiblePlayers,
			ratingsVisible: true,
			readonlyPreview: true,
		});
		await settle();
		expect(query("rotation-position-minutes")[0]!.textContent).toContain(
			"visible ratings",
		);
		await clickPlan("Current plan");
		expect(query("rotation-position-minutes")[0]!.textContent).toContain(
			"visible ratings",
		);
		expect(
			query("rotation-position-row").map((e) => e.dataset.pid),
		).not.toContain("1");
		render({
			players: visiblePlayers,
			ratingsVisible: true,
			currentPending: true,
		});
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		render({
			players: visiblePlayers,
			ratingsVisible: true,
			readonlyPreview: true,
		});
		await settle();
		await clickPlan("Healthy plan");
		const originalShares = query("rotation-position-minutes")[0]!.textContent;
		const changed = visiblePlayers.map((p, i) => ({
			...p,
			ratings: { ...p.ratings, pss: i === 1 ? 10 : p.ratings.pss },
		}));
		render({ players: changed, ratingsVisible: true, readonlyPreview: true });
		await settle();
		expect(query("rotation-position-minutes")[0]!.textContent).not.toBe(
			originalShares,
		);
		render({ players: changed, ratingsVisible: false, readonlyPreview: true });
		await settle();
		expect(query("rotation-position-minutes")[0]!.textContent).toBe(baseline);
		const hidden = players.map((p) => ({
			...p,
			ratings: new Proxy(
				{ pos: p.ratings.pos },
				{
					get(target, key) {
						if (
							[
								"drb",
								"pss",
								"oiq",
								"spd",
								"hgt",
								"reb",
								"diq",
								"stre",
								"tp",
								"jmp",
								"dnk",
								"ins",
							].includes(String(key))
						) {
							throw Error("hidden numeric rating read");
						}
						// React's development prop inspector reads metadata
						// such as $$typeof; those are not rating attributes.
						return Reflect.get(target, key);
					},
				},
			),
		}));
		render({ players: hidden, ratingsVisible: false, readonlyPreview: true });
		await settle();
		expect(query("rotation-position-minutes")[0]!.textContent).toBe(baseline);
		render({ players, ratingsVisible: true, readonlyPreview: true });
		await settle();
		expect(query("rotation-position-minutes")[0]!.textContent).toBe(baseline);
		expectNoLegacyTimeline();
	});

	test("saved Knicks visible ratings produce conservative player-specific minutes", async () => {
		const names = [
			["Karl-Anthony", "Towns", "C"],
			["Tyrese", "Maxey", "G"],
			["Nassir", "Little", "GF"],
			["Collin", "Murray-Boyles", "PF"],
			["Michael", "Porter Jr.", "F"],
			["Tyrese", "Haliburton", "G"],
			["Rocco", "Zikarsky", "C"],
			["Karlo", "Matković", "PF"],
			["Egor", "Dёmin", "PG"],
		] as const;
		const ids = [1956, 1582, 1529, 1659, 1761, 1317, 2077, 1581, 903];
		// playersPlus(fuzz:true) output of the read-only League 10 export.
		const data = [
			[59, 60, 79, 43, 70, 85, 66, 82, 76, 45, 75, 88],
			[72, 62, 70, 74, 33, 63, 59, 53, 59, 62, 81, 71],
			[49, 45, 61, 67, 47, 44, 68, 72, 55, 68, 82, 52],
			[53, 51, 73, 55, 54, 71, 78, 72, 42, 56, 60, 60],
			[50, 49, 73, 41, 61, 66, 54, 65, 73, 45, 62, 67],
			[65, 62, 69, 41, 41, 41, 46, 42, 67, 35, 57, 58],
			[32, 32, 40, 43, 76, 68, 48, 58, 37, 44, 74, 54],
			[38, 42, 56, 47, 59, 76, 47, 66, 49, 58, 70, 50],
			[45, 66, 57, 41, 53, 54, 40, 22, 62, 40, 39, 27],
		];
		const keys = [
			"drb",
			"pss",
			"oiq",
			"spd",
			"hgt",
			"reb",
			"diq",
			"stre",
			"tp",
			"jmp",
			"dnk",
			"ins",
		];
		const typed = names.map(([firstName, lastName, pos], i) => ({
			pid: ids[i]!,
			firstName,
			lastName,
			ratings: {
				pos,
				...Object.fromEntries(keys.map((key, j) => [key, data[i]![j]])),
			},
		}));
		render({
			players: typed,
			healthyMinutesByPid: Object.fromEntries(
				ids.map((pid, i) => [pid, [34, 34, 32, 30, 30, 28, 20, 18, 14][i]!]),
			),
			ratingsVisible: true,
		});
		await settle();
		const cell = (pid: number, position: string) =>
			container.querySelector<HTMLElement>(
				`[data-testid="rotation-position-row"][data-pid="${pid}"] [data-position="${position}"]`,
			)!;
		expect(Number(cell(1582, "PG").dataset.minutes)).toBeGreaterThan(10);
		// The two guards have different handling, speed, size and shooting. A
		// minimum PG quota for each would require the old pooled role sharing.
		expect(Number(cell(1582, "PG").dataset.minutes)).toBeGreaterThan(
			Number(cell(1317, "PG").dataset.minutes),
		);
		expect(Number(cell(1317, "SG").dataset.minutes)).toBeGreaterThan(
			Number(cell(1317, "PG").dataset.minutes),
		);
		expect(Number(cell(1956, "C").dataset.minutes)).toBeGreaterThan(20);
		expect(Number(cell(2077, "C").dataset.minutes)).toBeGreaterThan(15);
		expect(query("rotation-position-total").map((e) => e.textContent)).toEqual(
			Array(5).fill("48"),
		);
		expect(query("rotation-position-team-total")[0]!.textContent).toBe("240");
		if (screenshotDir) {
			for (const [theme, width, name] of [
				["light", 1024, "desktop"],
				["dark", 360, "mobile"],
			] as const) {
				await loadStylesheet(theme);
				await page.viewport(width, 900);
				await settle();
				await page.screenshot({
					path: `${screenshotDir}/nyk-role-${theme}-${name}.png`,
					fullPage: true,
				});
			}
		}
	});

	test("zero-minute players get no row and never distort the totals", async () => {
		const plan = Object.fromEntries(
			players.map((p, i) => [p.pid, i < 5 ? 48 : 0]),
		);
		render({ healthyMinutesByPid: plan });
		await settle();
		expect(query("rotation-position-row").map((e) => e.dataset.pid)).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
		]);
		expect(
			query("rotation-position-player-total").map((e) => e.textContent),
		).toEqual(Array(5).fill("48"));
		expect(query("rotation-position-total").map((e) => e.textContent)).toEqual(
			Array(5).fill("48"),
		);
		expect(query("rotation-position-team-total")[0]!.textContent).toBe("240");
		// C, PG, SF, GF and F cover all five positions within their labels:
		// nothing is filled off-label, so no shortage row is shown.
		expect(query("rotation-position-outside-row")).toHaveLength(0);
		expect(query("rotation-position-uncertainty")).toHaveLength(0);
	});

	test("three-player games explain why there are no five positions", async () => {
		render({
			numPlayersOnCourt: 3,
			healthyMinutesByPid: Object.fromEntries(
				players.map((p, i) => [p.pid, i < 3 ? 48 : 0]),
			),
		});
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		const message = query("rotation-position-unavailable")[0]!;
		expect(message.textContent).toContain("five-player lineups");
		expect(message.classList.contains("text-danger")).toBe(false);
		expectNoLegacyTimeline();
	});

	test("switches between the healthy and current plans and remembers the choice", async () => {
		render();
		await settle();
		await clickPlan("Current plan");

		expect(pressedPlan()).toEqual(["Current plan"]);
		const pids = () => query("rotation-position-row").map((e) => e.dataset.pid);
		// Towns and Haliburton are out; a deep reserve fills in
		expect(pids()).not.toContain("1");
		expect(pids()).not.toContain("7");
		expect(pids()).toContain("11");
		expect(
			query("rotation-position-player-total").map((e) => e.textContent),
		).toContain("35");
		expect(query("rotation-position-total").map((e) => e.textContent)).toEqual(
			Array(5).fill("48"),
		);

		flushSync(() => {
			root.unmount();
		});
		root = createRoot(container);
		render();
		await settle();
		expect(pressedPlan()).toEqual(["Current plan"]);

		await clickPlan("Healthy plan");
		expect(pressedPlan()).toEqual(["Healthy plan"]);
		expect(pids()).toContain("1");
		expect(pids()).not.toContain("11");
		expectNoLegacyTimeline();
	});

	test("never shows a stale or invented current plan", async () => {
		render();
		await settle();
		await clickPlan("Current plan");
		expect(query("rotation-position-minutes")).toHaveLength(1);

		// An unsaved edit makes the saved current plan out of date
		render({ currentPending: true });
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-pending")[0]!.textContent).toBe(
			"Current plan updates when the minutes plan is saved.",
		);

		render({ currentMinutesByPid: undefined });
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-pending")[0]!.textContent).toBe(
			"No current plan is available for the next game.",
		);

		// A current plan that does not add up is not shown either
		render({ currentMinutesByPid: { ...current, 2: 20 } });
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-unavailable")[0]!.textContent).toBe(
			"Planned minutes total 224, but position estimates need exactly 240.",
		);
		expectNoLegacyTimeline();
	});

	test("follows the live healthy draft and rejects invalid totals", async () => {
		render();
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(1);

		// Mid-edit: total is 238
		render({ healthyMinutesByPid: { ...healthy, 1: 30 } });
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		const message = query("rotation-position-unavailable")[0]!;
		expect(message.textContent).toBe(
			"Planned minutes total 238, but position estimates need exactly 240.",
		);
		expect(message.classList.contains("text-danger")).toBe(true);

		// Edit finished: two minutes moved from Towns to a reserve
		render({ healthyMinutesByPid: { ...healthy, 1: 30, 11: 2 } });
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(1);
		expect(query("rotation-position-unavailable")).toHaveLength(0);
		expect(query("rotation-position-row").map((e) => e.dataset.pid)).toContain(
			"11",
		);
		expect(
			container.querySelector(
				'[data-testid="rotation-position-row"][data-pid="1"] [data-testid="rotation-position-player-total"]',
			)!.textContent,
		).toBe("30");

		// Empty input
		render({ healthyMinutesByPid: { ...healthy, 1: Number.NaN } });
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-unavailable")[0]!.textContent).toContain(
			"Enter valid planned minutes",
		);

		// More than a full game for one player
		render({ healthyMinutesByPid: { ...healthy, 1: 50, 2: 14 } });
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-unavailable")[0]!.textContent).toContain(
			"Enter valid planned minutes",
		);

		// Auto Minutes reset in flight
		render({ healthyMinutesByPid: undefined });
		await settle();
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-pending")[0]!.textContent).toBe(
			"Updating the plan…",
		);
		expectNoLegacyTimeline();
	});

	test("current plans follow 32, 40, 48 and 60 minute league settings", async () => {
		render();
		await settle();
		await clickPlan("Current plan");
		for (const [numPeriods, quarterLength] of [
			[4, 8],
			[2, 20],
			[4, 12],
			[4, 15],
		] as const) {
			const gameMinutes = numPeriods * quarterLength;
			setPeriods(numPeriods, quarterLength);
			render({
				currentMinutesByPid: Object.fromEntries(
					Object.entries(healthy).map(([pid, minutes]) => [
						pid,
						(minutes * gameMinutes) / 48,
					]),
				),
			});
			await settle();
			expect(
				query("rotation-position-total").map((e) => Number(e.dataset.seconds)),
				`${gameMinutes} minute game`,
			).toEqual(Array(5).fill(gameMinutes * 60));
			expect(
				query("rotation-position-total").map((e) => e.textContent),
			).toEqual(Array(5).fill(String(gameMinutes)));
			expect(query("rotation-position-team-total")[0]!.textContent).toBe(
				String(5 * gameMinutes),
			);
			for (const row of query("rotation-position-row")) {
				const cells = [...row.querySelectorAll<HTMLElement>("[data-position]")];
				expect(
					cells.reduce((sum, cell) => sum + Number(cell.dataset.seconds), 0),
				).toBe(
					Number(
						row.querySelector<HTMLElement>(
							'[data-testid="rotation-position-player-total"]',
						)!.dataset.seconds,
					),
				);
			}
		}
		// Healthy plans are always entered on the 48 minute scale
		setPeriods(2, 20);
		await clickPlan("Healthy plan");
		expect(query("rotation-position-total").map((e) => e.textContent)).toEqual(
			Array(5).fill("48"),
		);
		expectNoLegacyTimeline();
	});

	test("fits desktop and mobile widths in light and dark themes", async () => {
		for (const theme of ["light", "dark"] as const) {
			await loadStylesheet(theme);
			for (const [name, width] of [
				["desktop", 1024],
				["mobile", 360],
			] as const) {
				await page.viewport(width, 700);
				render();
				await settle();

				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
				const matrix = query("rotation-position-minutes")[0]!;
				expect(matrix.scrollWidth).toBeLessThanOrEqual(matrix.clientWidth);
				for (const cell of matrix.querySelectorAll<HTMLElement>(
					"td, th:not(.text-truncate)",
				)) {
					expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth);
				}
				// Compact: about one line of small text per player
				expect(
					matrix.querySelector("tbody")!.getBoundingClientRect().height,
				).toBeLessThan(10 * 26);
				if (screenshotDir) {
					await page.screenshot({
						path: `${screenshotDir}/position-minutes-${theme}-${name}.png`,
						fullPage: true,
					});
				}
			}
		}
	});
});
