import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// This renders the real Roster page with its real table, minutes inputs,
// autosave hook and position minutes section. Local module mocks are not used:
// the page must work as shipped, and the retired Stage 5 court-time walk is
// detected from what the browser actually loaded.
vi.hoisted(() => {
	// Every module the page loads is a resource entry. Keep all of them.
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
		default: { getPlugin, notify: () => {} },
		getPlugin,
		notify: () => {},
	};
});

// Loading the UI utilities first gives the same module order as the app
import "../../util/index.ts";
import Roster from "./index.tsx";

const loadedModules = () =>
	performance
		.getEntriesByType("resource")
		.map((entry) => decodeURIComponent(entry.name));
const LEGACY_MODULE = /\/Roster\/rotationTimeline\.ts(\?|$)/;

const OLD_SECTION_KEY = "show-roster-Rotation Timeline";
const NEW_SECTION_KEY = "show-roster-Position Minutes";

// name, pos, healthy minutes, hgt, handling (drb/pss), tp, inside (reb/stre/ins/dnk)
const rosterData = [
	["Ada", "Point", "PG", 34, 32, 78, 62, 30],
	["Ben", "Guard", "SG", 32, 40, 58, 72, 35],
	["Cal", "Wing", "SF", 32, 50, 50, 60, 48],
	["Dan", "Four", "PF", 30, 58, 38, 45, 66],
	["Eli", "Five", "C", 30, 70, 28, 25, 80],
	["Fin", "Combo", "G", 22, 36, 66, 64, 32],
	["Gus", "Swing", "GF", 20, 46, 52, 62, 44],
	["Hal", "Stretch", "F", 18, 55, 42, 55, 58],
	["Ian", "Big", "FC", 22, 64, 30, 30, 74],
	["Jay", "Deep", "SG", 0, 41, 55, 60, 36],
] as const;

const makePlayers = (tid: number, pidOffset: number) =>
	rosterData.map(
		([firstName, lastName, pos, , hgt, handling, tp, inside], i) => ({
			pid: pidOffset + i,
			tid,
			firstName,
			firstNameShort: `${firstName[0]}.`,
			lastName: pidOffset === 100 ? lastName : `Other${lastName}`,
			age: 25,
			awards: [],
			born: { loc: "USA" },
			canRelease: true,
			contract: { amount: 1000, exp: 2027, type: "rookie" },
			hof: false,
			injury: { type: "Healthy", gamesRemaining: 0 },
			latestTransaction: "",
			ratings: {
				dovr: 0,
				dpot: 0,
				ovr: 60,
				pos,
				pot: 65,
				skills: [],
				drb: handling,
				pss: handling,
				oiq: 55,
				spd: 100 - hgt,
				hgt,
				reb: inside,
				diq: 55,
				stre: inside,
				tp,
				jmp: 50,
				dnk: inside,
				ins: inside,
			},
			stats: { jerseyNumber: String(i), yearsWithTeam: 2 },
			untradable: false,
			watch: 0,
		}),
	);

const healthyByPid = (pidOffset: number) =>
	Object.fromEntries(
		rosterData.map(([, , , minutes], i) => [pidOffset + i, minutes]),
	) as Record<number, number>;

// The starting point guard is out; his minutes go to the two reserve guards
const currentByPid = (pidOffset: number) => ({
	...healthyByPid(pidOffset),
	[pidOffset]: 0,
	[pidOffset + 5]: 36,
	[pidOffset + 9]: 20,
});

const makeProps = (overrides: Record<string, unknown> = {}) =>
	({
		abbrev: "ATL",
		basketballMinutes: {
			mode: "custom" as const,
			minutesByPid: healthyByPid(100),
			healthyMinutesByPid: healthyByPid(100),
			effectiveMinutesByPid: currentByPid(100),
			currentMinutesOverrideByPid: {},
			noInjuryMinutesIncreasePids: [],
			unavailablePids: [100],
			required: 240,
		},
		budget: true,
		challengeNoRatings: false,
		currentSeason: 2026,
		editable: true,
		godMode: false,
		luxuryPayroll: 0,
		luxuryTaxAmount: 0,
		maxRosterSize: 15,
		minPayroll: 0,
		minPayrollAmount: 0,
		numPlayersOnCourt: 5,
		payroll: 0,
		phase: 1,
		players: makePlayers(0, 100),
		playoffs: "regularSeason",
		playoffsByConf: true,
		salaryCap: 0,
		salaryCapType: "soft",
		season: 2026,
		showSpectatorWarning: false,
		showRelease: false,
		showTradeFor: false,
		showTradingBlock: false,
		stats: [],
		t: {
			name: "Hawks",
			region: "Atlanta",
			keepRosterSorted: false,
			ovr: 50,
			ovrCurrent: 50,
			strategy: "contending",
			stats: { gp: 0, pts: 0, oppPts: 0 },
			seasonAttrs: {
				name: "Hawks",
				region: "Atlanta",
				won: 0,
				lost: 0,
				otl: 0,
				tied: 0,
				profit: 0,
			},
		},
		tid: 0,
		usePts: false,
		userTid: 0,
		...overrides,
	}) as any;

describe("Roster entry: position minutes after the timeline retirement", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		localStorage.clear();
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		document.body.innerHTML = "";
	});

	const settle = async () => {
		await new Promise((resolve) => setTimeout(resolve, 30));
	};

	const renderRoster = async (overrides: Record<string, unknown> = {}) => {
		flushSync(() => {
			root.render(createElement(Roster, makeProps(overrides)));
		});
		await settle();
	};

	const query = (testId: string) =>
		Array.from(
			container.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
		);
	const rowPids = () =>
		query("rotation-position-row").map((row) => Number(row.dataset.pid));
	const columnSeconds = () =>
		query("rotation-position-total").map((cell) =>
			Number(cell.dataset.seconds),
		);
	const playerTotal = (pid: number) =>
		container.querySelector<HTMLElement>(
			`[data-testid="rotation-position-row"][data-pid="${pid}"] [data-testid="rotation-position-player-total"]`,
		)!.textContent;
	const clickButton = async (label: string) => {
		Array.from(container.querySelectorAll("button"))
			.find((button) => button.textContent === label)!
			.click();
		await settle();
	};
	// Type into the page's own planned-minutes input
	const typeMinutes = async (name: string, value: string) => {
		const input = container.querySelector<HTMLInputElement>(
			`input[aria-label="Planned minutes for ${name}"]`,
		)!;
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)!.set!.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await settle();
	};
	const expectNoLegacyTimeline = () => {
		for (const testId of [
			"rotation-reference",
			"rotation-timeline-chart",
			"rotation-timeline-track",
			"rotation-timeline-stint",
			"rotation-timeline-cursor",
		]) {
			expect(query(testId), testId).toHaveLength(0);
		}
		expect(container.querySelector('[role="slider"]')).toBeNull();
		expect(container.textContent).not.toContain("Rotation Timeline");
		expect(container.textContent).not.toContain("Reference court time");
		// The archived algorithm was never even loaded, so it cannot have run
		expect(loadedModules().filter((url) => LEGACY_MODULE.test(url))).toEqual(
			[],
		);
	};

	test("first Roster visit after upgrading with the old section hidden shows the table", async () => {
		localStorage.setItem(OLD_SECTION_KEY, "false");
		await renderRoster();

		const headings = Array.from(container.querySelectorAll("h2")).map(
			(heading) => heading.textContent,
		);
		expect(headings).toContain("Position Minutes");
		expect(query("rotation-position-minutes")).toHaveLength(1);
		expect(query("rotation-position-minutes")[0]!.checkVisibility()).toBe(true);
		expect(rowPids()).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108]);
		expect(columnSeconds()).toEqual(Array(5).fill(2880));
		expect(query("rotation-position-minutes")[0]!.textContent).toContain(
			"visible ratings",
		);
		expect(query("rotation-position-preview")).toHaveLength(0);
		expect(localStorage.getItem(OLD_SECTION_KEY)).toBe("false");
		expect(localStorage.getItem(NEW_SECTION_KEY)).toBe("true");
		expectNoLegacyTimeline();

		// Current plan: the injured starter drops out, the game still adds up
		await clickButton("Current plan");
		expect(rowPids()).not.toContain(100);
		expect(rowPids()).toContain(109);
		expect(columnSeconds()).toEqual(Array(5).fill(2880));
		expectNoLegacyTimeline();
	});

	test("typing planned minutes updates the healthy table and holds back the current plan", async () => {
		await renderRoster();
		expect(playerTotal(104)).toBe("30");
		expect(playerTotal(108)).toBe("22");

		// Mid-edit: six minutes taken from the starting C, total is 234
		await typeMinutes("Eli Five", "24");
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-unavailable")[0]!.textContent).toBe(
			"Planned minutes total 234, but position estimates need exactly 240.",
		);

		// Edit finished: the backup big gets them, before anything is saved
		await typeMinutes("Ian Big", "28");
		expect(query("rotation-position-unavailable")).toHaveLength(0);
		expect(playerTotal(104)).toBe("24");
		expect(playerTotal(108)).toBe("28");
		expect(columnSeconds()).toEqual(Array(5).fill(2880));

		// An emptied input is reported, not guessed
		await typeMinutes("Ian Big", "");
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-unavailable")[0]!.textContent).toContain(
			"Enter valid planned minutes",
		);
		await typeMinutes("Ian Big", "28");
		expect(query("rotation-position-minutes")).toHaveLength(1);

		// The saved current plan is out of date while the edit is pending
		await clickButton("Current plan");
		expect(query("rotation-position-minutes")).toHaveLength(0);
		expect(query("rotation-position-pending")[0]!.textContent).toBe(
			"Current plan updates when the minutes plan is saved.",
		);
		await clickButton("Healthy plan");
		expect(playerTotal(104)).toBe("24");
		expectNoLegacyTimeline();
	});

	test("No Ratings challenge and read-only teams stay on their safe paths", async () => {
		localStorage.setItem(OLD_SECTION_KEY, "false");
		await renderRoster();
		const informed = query("rotation-position-minutes")[0]!.textContent;

		// challengeNoRatings: label-only estimate, no rating-based wording
		await renderRoster({ challengeNoRatings: true });
		const labelOnly = query("rotation-position-minutes")[0]!.textContent!;
		expect(labelOnly).toContain("Listed-position estimates");
		expect(labelOnly).not.toContain("visible ratings");
		expect(labelOnly).not.toBe(informed);
		expect(columnSeconds()).toEqual(Array(5).fill(2880));

		// Another team: read-only preview, no editable plan
		const otherTeam = {
			abbrev: "BOS",
			tid: 3,
			editable: false,
			basketballMinutes: undefined,
			basketballPositionPreview: {
				healthyMinutesByPid: healthyByPid(200),
				effectiveMinutesByPid: currentByPid(200),
			},
			players: makePlayers(3, 200),
		};
		await renderRoster(otherTeam);
		expect(query("rotation-position-preview")[0]!.textContent).toContain(
			"Read-only plan preview",
		);
		expect(
			container.querySelector('input[aria-label^="Planned minutes for"]'),
		).toBeNull();
		expect(rowPids()).toEqual([200, 201, 202, 203, 204, 205, 206, 207, 208]);
		expect(query("rotation-position-minutes")[0]!.textContent).toContain(
			"OtherPoint",
		);
		expect(query("rotation-position-minutes")[0]!.textContent).toContain(
			"visible ratings",
		);
		expect(columnSeconds()).toEqual(Array(5).fill(2880));
		await clickButton("Current plan");
		expect(rowPids()).not.toContain(200);
		expect(columnSeconds()).toEqual(Array(5).fill(2880));

		// Spectating with No Ratings: read-only and label-only
		await renderRoster({ ...otherTeam, challengeNoRatings: true });
		expect(query("rotation-position-minutes")[0]!.textContent).toContain(
			"Listed-position estimates",
		);

		// Back to the user's team: its own rows again
		await renderRoster();
		expect(rowPids()).not.toContain(200);
		expect(rowPids()).toContain(109);
		expect(query("rotation-position-preview")).toHaveLength(0);
		expectNoLegacyTimeline();
	});

	test("the loaded-module check would notice the archived timeline", async () => {
		await renderRoster();
		expectNoLegacyTimeline();
		// Positive control, last in this file: loading it on purpose is detected
		await import("./rotationTimeline.ts");
		await settle();
		expect(
			loadedModules().filter((url) => LEGACY_MODULE.test(url)),
		).toHaveLength(1);
	});
});
