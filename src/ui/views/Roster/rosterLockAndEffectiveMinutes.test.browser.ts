import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	logEvent: vi.fn(),
	toWorker: vi.fn(),
	useBasketballMinutesAutosave: vi.fn(),
}));

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

vi.mock("../../components/index.tsx", async () => {
	const { createElement } = await import("react");
	const getCellValue = (cell: any) =>
		cell !== null &&
		typeof cell === "object" &&
		!Array.isArray(cell) &&
		Object.hasOwn(cell, "value")
			? cell.value
			: cell;

	return {
		CountryFlag: ({ country }: { country: string }) => country,
		DataTable: ({ cols, rows }: { cols: any[]; rows: any[] }) =>
			createElement(
				"table",
				{},
				createElement(
					"thead",
					{},
					createElement(
						"tr",
						{},
						cols.map((col, index) =>
							createElement("th", { key: index }, col.titleReact ?? col.title),
						),
					),
				),
				createElement(
					"tbody",
					{},
					rows.map((row) =>
						createElement(
							"tr",
							{ key: row.key },
							row.data.map((cell: any, index: number) =>
								createElement("td", { key: index }, getCellValue(cell)),
							),
						),
					),
				),
			),
		HelpPopover: ({ children, title }: { children: unknown; title: string }) =>
			createElement("span", { title }, children as any),
		MoreLinks: () => null,
		SafeHtml: ({ dirty }: { dirty: string }) => dirty,
	};
});

vi.mock("../../hooks/useTitleBar.tsx", () => ({
	default: () => {},
}));

vi.mock("../../util/index.ts", async () => {
	const [{ default: getCols }, { default: helpers }] = await Promise.all([
		import("../../../common/getCols.ts"),
		import("../../util/helpers.ts"),
	]);
	return {
		confirm: vi.fn(),
		getCols,
		helpers,
		logEvent: mocks.logEvent,
		toWorker: mocks.toWorker,
		useLocalPartial: () => ({ gender: "male" }),
	};
});

vi.mock("../../components/contract.tsx", () => ({
	wrappedRosterContract: () => "Contract",
	wrappedRosterContractTerms: () => "Terms",
}));

vi.mock("../../components/Mood.tsx", () => ({
	dataTableWrappedMood: () => "Mood",
}));

vi.mock("../../components/PlayerNameLabels.tsx", () => ({
	wrappedPlayerNameLabels: ({
		firstName,
		lastName,
	}: {
		firstName: string;
		lastName: string;
	}) => ({
		value: `${firstName} ${lastName}`,
		sortValue: `${lastName} ${firstName}`,
		searchValue: `${firstName} ${lastName}`,
	}),
}));

vi.mock("../../components/RatingWithChange.tsx", () => ({
	wrappedRatingWithChange: (value: number) => value,
}));

vi.mock("./PlayingTime.tsx", () => ({
	default: () => null,
	ptStyles: {
		"0": {},
		"0.75": {},
		"1": {},
		"1.25": {},
		"1.5": {},
	},
}));

vi.mock("./UsageBias.tsx", () => ({
	default: () => null,
	usageBiasStyles: {
		"0.85": {},
		"1": {},
		"1.1": {},
		"1.25": {},
	},
}));

vi.mock("./TopStuff.tsx", () => ({
	default: () => null,
}));

vi.mock("./RosterBalance.tsx", () => ({
	default: () => null,
}));

vi.mock("./useBasketballMinutesAutosave.ts", () => ({
	useBasketballMinutesAutosave: mocks.useBasketballMinutesAutosave,
}));

import BasketballMinutesPopover from "./BasketballMinutesPopover.tsx";
import Roster from "./index.tsx";

const players = [
	{
		pid: 101,
		tid: 0,
		firstName: "John",
		firstNameShort: "J.",
		lastName: "Doe",
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
			ovr: 70,
			pos: "PG",
			pot: 75,
			skills: [],
		},
		stats: { jerseyNumber: "1", yearsWithTeam: 2 },
		untradable: false,
		watch: 0,
	},
	{
		pid: 102,
		tid: 0,
		firstName: "Jane",
		firstNameShort: "J.",
		lastName: "Roe",
		age: 24,
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
			ovr: 65,
			pos: "SG",
			pot: 70,
			skills: [],
		},
		stats: { jerseyNumber: "2", yearsWithTeam: 1 },
		untradable: false,
		watch: 0,
	},
];

const defaultBasketballMinutes = {
	mode: "custom" as const,
	minutesByPid: { 101: 36, 102: 12 },
	healthyMinutesByPid: { 101: 36, 102: 12 },
	effectiveMinutesByPid: { 101: 36, 102: 12 },
	currentMinutesOverrideByPid: {},
	noInjuryMinutesIncreasePids: [],
	unavailablePids: [],
	required: 48,
};

const makeProps = (basketballMinutesOverrides: Record<string, unknown> = {}) =>
	({
		abbrev: "ATL",
		basketballMinutes: {
			...defaultBasketballMinutes,
			...basketballMinutesOverrides,
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
		numPlayersOnCourt: 1,
		payroll: 0,
		phase: 1,
		players,
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
		t: { seasonAttrs: { profit: 0 } },
		tid: 0,
		usePts: false,
		userTid: 0,
	}) as any;

describe("Roster Lock and effective minutes", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		mocks.logEvent.mockReset();
		mocks.toWorker.mockReset().mockResolvedValue(undefined);
		mocks.useBasketballMinutesAutosave.mockReset();
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		document.body.innerHTML = "";
	});

	const renderRoster = (
		basketballMinutesOverrides: Record<string, unknown> = {},
	) => {
		const props = makeProps(basketballMinutesOverrides);
		mocks.useBasketballMinutesAutosave.mockReturnValue({
			minutesDraft: Object.fromEntries(
				Object.entries(props.basketballMinutes.minutesByPid).map(
					([pid, minutes]) => [Number(pid), String(minutes)],
				),
			),
			plannedMinutesTotal: 48,
			plannedMinutesValid: true,
			plannedMinutesChanged: false,
			minutesSaveStatus: "idle",
			autoFilledPids: new Set<number>(),
			autoResetPending: false,
			handleMinutesChange: vi.fn(),
			handleAutoMinutesFocus: vi.fn(),
			handleAutoMinutesBlur: vi.fn(),
			handleAutoMinutes: vi.fn(),
		});

		flushSync(() => {
			root.render(createElement(Roster, props));
		});
	};

	test("does not show equal effective minutes across a healthy roster", () => {
		renderRoster();

		expect(
			container.querySelector(
				'[aria-label^="Current injury-effective planned minutes"]',
			),
		).toBeNull();
	});

	test("shows an equal baseline and current value in an injury context", () => {
		renderRoster({
			effectiveMinutesByPid: { 101: 36, 102: 0 },
			unavailablePids: [102],
		});

		expect(
			container.querySelector(
				'[aria-label="Current injury-effective planned minutes: 36"]',
			),
		).not.toBeNull();
	});

	test("shows an equal current override even when the roster is healthy", () => {
		renderRoster({
			currentMinutesOverrideByPid: { 101: 36 },
		});

		expect(
			container.querySelector(
				'[aria-label="Current injury-effective planned minutes: 36"]',
			),
		).not.toBeNull();
	});

	test("renders Lock as a separate control and reports worker rejection", async () => {
		renderRoster();
		const headers = Array.from(container.querySelectorAll("th")).map((header) =>
			header.textContent?.trim(),
		);
		expect(headers.some((header) => header?.startsWith("Lock"))).toBe(true);

		const checkbox = container.querySelector(
			'[aria-label="Prevent injury minutes increase for John Doe"]',
		) as HTMLInputElement;
		expect(checkbox).not.toBeNull();
		mocks.toWorker.mockRejectedValueOnce(new Error("Lock save failed"));

		checkbox.click();

		expect(mocks.toWorker).toHaveBeenCalledWith(
			"main",
			"updateBasketballNoInjuryMinutesIncrease",
			{
				tid: 0,
				pid: 101,
				protectedFromIncrease: true,
			},
		);
		await vi.waitFor(() => {
			expect(mocks.logEvent).toHaveBeenCalledWith({
				type: "error",
				text: "Error: Lock save failed",
				saveToDb: false,
			});
		});
	});
});

describe("BasketballMinutesPopover", () => {
	let container: HTMLDivElement;
	let root: ReturnType<typeof createRoot>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		root.unmount();
		container.remove();
		document.body.innerHTML = "";
	});

	test("renders minute details without a duplicate Lock checkbox", async () => {
		flushSync(() => {
			root.render(
				createElement(BasketballMinutesPopover, {
					pid: 101,
					playerName: "John Doe",
					baseLabel: "36",
					rosterDelta: 0,
					injuryDelta: 2,
					currentMinutes: 38,
					currentOverride: undefined,
					unavailable: true,
					onCurrentOverrideChange: vi.fn().mockResolvedValue(undefined),
				}),
			);
		});

		const helpButton = container.querySelector(
			"button.help-icon",
		) as HTMLButtonElement;
		expect(helpButton.classList.contains("d-inline-flex")).toBe(true);
		expect(helpButton.classList.contains("align-items-center")).toBe(true);
		const helpIcon = helpButton.querySelector<HTMLElement>(
			".glyphicon-question-sign",
		);
		expect(helpIcon?.style.top).toBe("0px");
		helpButton.click();

		await vi.waitFor(() => {
			expect(document.body.querySelector(".popover")).not.toBeNull();
		});
		const popover = document.body.querySelector(".popover")!;
		expect(popover.textContent).toContain("Base");
		expect(popover.textContent).toContain("Injury");
		expect(popover.textContent).toContain("Current");
		expect(popover.textContent).toContain("Override");
		expect(popover.textContent).toContain("Out (injury)");
		expect(popover.textContent).not.toContain("Unavailable");
		expect(popover.textContent).not.toContain("Prevent injury increase");
		expect(popover.querySelector('input[type="checkbox"]')).toBeNull();
	});
});
