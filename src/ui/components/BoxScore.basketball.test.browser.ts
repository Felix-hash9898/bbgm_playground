import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import BOX_SCORE_STATS from "../../common/boxScoreStats.basketball.ts";
import BoxScore from "./BoxScore.basketball.tsx";
import BoxScoreRow from "./BoxScoreRow.basketball.tsx";

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

vi.mock("./PlayerNameLabels.tsx", () => ({
	default: ({ legacyName }: { legacyName: string }) => legacyName,
	CountBadge: () => null,
	wrappedPlayerNameLabels: ({ legacyName }: { legacyName: string }) => ({
		value: legacyName,
		sortValue: legacyName,
		searchValue: legacyName,
	}),
}));

const makePlayer = (pid: number, min: number, bpmImpact?: number) => ({
	pid,
	name: `Player ${pid}`,
	pos: "PG",
	skills: [],
	injury:
		min > 0
			? {
					type: "Healthy",
					gamesRemaining: 0,
				}
			: {
					type: "Sprained ankle",
					gamesRemaining: 2,
				},
	min,
	fg: min > 0 ? 4 : 0,
	fga: min > 0 ? 8 : 0,
	fgAtRim: min > 0 ? pid : 0,
	fgaAtRim: min > 0 ? pid + 2 : 0,
	fgLowPost: min > 0 ? 1 : 0,
	fgaLowPost: min > 0 ? 2 : 0,
	fgMidRange: min > 0 ? 2 : 0,
	fgaMidRange: min > 0 ? 4 : 0,
	tp: 1,
	tpa: 3,
	ft: 2,
	fta: 2,
	orb: 1,
	drb: 3,
	ast: 5,
	tov: 1,
	stl: 2,
	blk: 1,
	ba: 0,
	pf: 2,
	pts: 11,
	bpmImpact,
	form: 1.2,
	gameForm: -0.4,
});

const makeTeam = (abbrev: string, tid: number, pid: number) => ({
	abbrev,
	tid,
	region: abbrev,
	name: "Test",
	players: [
		makePlayer(pid, 24, 2.5),
		makePlayer(pid + 1, 20, 4.5),
		makePlayer(pid + 2, 0, 1.5),
	],
	min: 48,
	fg: 10,
	fga: 20,
	fgAtRim: 6,
	fgaAtRim: 10,
	fgLowPost: 2,
	fgaLowPost: 5,
	fgMidRange: 4,
	fgaMidRange: 8,
	tp: 4,
	tpa: 10,
	ft: 8,
	fta: 10,
	orb: 5,
	drb: 15,
	ast: 12,
	tov: 6,
	stl: 4,
	blk: 3,
	ba: 2,
	pf: 8,
	pts: 32,
});

const makeBoxScore = ({
	gameOver,
	live,
}: {
	gameOver: boolean;
	live: boolean;
}) => {
	return {
		exhibition: true,
		gameOver,
		season: 2026,
		teams: [makeTeam("AAA", -1, 1), makeTeam("BBB", -2, 4)],
		...(live
			? {}
			: {
					won: {
						name: "Test",
					},
					lost: {
						name: "Test",
					},
				}),
	};
};

const renderBoxScore = (options: { gameOver: boolean; live: boolean }) => {
	const container = document.createElement("div");
	container.innerHTML = renderToStaticMarkup(
		createElement(BoxScore, {
			boxScore: makeBoxScore(options),
			Row: BoxScoreRow,
			forceRowUpdate: false,
		}),
	);

	return container;
};

const getCells = (row: Element) => {
	return Array.from(row.children).filter((cell) => {
		return cell.tagName === "TH" || cell.tagName === "TD";
	}) as HTMLElement[];
};

const getEffectiveColumnCount = (row: Element) => {
	return getCells(row).reduce((count, cell) => {
		return count + Number(cell.getAttribute("colspan") ?? 1);
	}, 0);
};

describe("shot zones", () => {
	test.each([
		{ gameOver: false, live: true },
		{ gameOver: true, live: true },
		{ gameOver: true, live: false },
	])("shows shared shot-zone columns in %#", (options) => {
		const container = renderBoxScore(options);

		for (const [tableIndex, table] of Array.from(
			container.querySelectorAll("table"),
		).entries()) {
			const headerCells = getCells(table.querySelector("thead tr")!);
			const headerLabels = headerCells.map((cell) => cell.textContent);
			const rimIndex = headerLabels.indexOf("Rim");
			expect(headerLabels.slice(rimIndex, rimIndex + 4)).toEqual([
				"Rim",
				"Post",
				"Mid",
				"3P",
			]);
			expect(headerCells[rimIndex]!.title).toContain("Made-Attempted");

			const firstPlayerCells = getCells(table.querySelector("tbody tr")!);
			const firstPid = tableIndex === 0 ? 1 : 4;
			expect(
				firstPlayerCells
					.slice(rimIndex, rimIndex + 4)
					.map((cell) => cell.textContent),
			).toEqual([`${firstPid}-${firstPid + 2}`, "1-2", "2-4", "1-3"]);

			const footerRows = table.querySelectorAll("tfoot tr");
			expect(
				getCells(footerRows[0]!)
					.slice(rimIndex, rimIndex + 4)
					.map((cell) => cell.textContent),
			).toEqual(["6-10", "2-5", "4-8", "4-10"]);
			expect(
				getCells(footerRows[1]!)
					.slice(rimIndex, rimIndex + 4)
					.map((cell) => cell.textContent),
			).toEqual(["60.0%", "40.0%", "50.0%", "40.0%"]);
		}
	});

	test("keeps legacy rows aligned when shot-zone fields are missing", () => {
		const value = makeBoxScore({ gameOver: true, live: false });
		for (const team of value.teams) {
			for (const key of [
				"fgAtRim",
				"fgaAtRim",
				"fgLowPost",
				"fgaLowPost",
				"fgMidRange",
				"fgaMidRange",
			] as const) {
				delete (team as any)[key];
				delete (team.players[0] as any)[key];
			}
		}
		const container = document.createElement("div");
		container.innerHTML = renderToStaticMarkup(
			createElement(BoxScore, {
				boxScore: value,
				Row: BoxScoreRow,
				forceRowUpdate: false,
			}),
		);

		for (const table of container.querySelectorAll("table")) {
			const headerCells = getCells(table.querySelector("thead tr")!);
			const headerLabels = headerCells.map((cell) => cell.textContent);
			const rimIndex = headerLabels.indexOf("Rim");
			const firstPlayerCells = getCells(table.querySelector("tbody tr")!);
			expect(
				firstPlayerCells
					.slice(rimIndex, rimIndex + 3)
					.map((cell) => cell.textContent),
			).toEqual(["", "", ""]);
			expect(getEffectiveColumnCount(firstPlayerCells[0]!.parentElement!)).toBe(
				headerCells.length,
			);
			for (const footerRow of table.querySelectorAll("tfoot tr")) {
				expect(
					getCells(footerRow)
						.slice(rimIndex, rimIndex + 3)
						.map((cell) => cell.textContent),
				).toEqual(["", "", ""]);
				expect(getEffectiveColumnCount(footerRow)).toBe(headerCells.length);
			}
		}
	});

	test("sorts a shot-zone column with the existing made-attempted rule", () => {
		const container = document.createElement("div");
		const root = createRoot(container);
		flushSync(() => {
			root.render(
				createElement(BoxScore, {
					boxScore: makeBoxScore({ gameOver: true, live: false }),
					Row: BoxScoreRow,
					forceRowUpdate: false,
				}),
			);
		});

		try {
			const table = container.querySelector("table")!;
			const rimHeader = Array.from(table.querySelectorAll("thead th")).find(
				(cell) => cell.textContent === "Rim",
			)!;
			flushSync(() => {
				rimHeader.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(
				Array.from(table.querySelectorAll("tbody tr")).map(
					(row) => getCells(row)[0]!.textContent,
				),
			).toEqual(["Player 2", "Player 1", expect.stringContaining("Player 3")]);
		} finally {
			flushSync(() => root.unmount());
		}
	});
});

describe("BPMI sign colors", () => {
	test.each([
		[2.5, "+2.50", "text-success"],
		[-2.5, "-2.50", "text-danger"],
		[0, "0.00", undefined],
		[undefined, "", undefined],
	] as const)(
		"renders %s with only the expected number color",
		(value, text, className) => {
			const container = document.createElement("tbody");
			container.innerHTML = renderToStaticMarkup(
				createElement(BoxScoreRow, {
					p: makePlayer(1, 24, value),
					season: 2026,
				}),
			);
			const row = container.querySelector("tr")!;
			const bpmIndex = 2 + BOX_SCORE_STATS.indexOf("bpmImpact");
			const bpmCell = getCells(row)[bpmIndex]!;
			expect(bpmCell.textContent).toBe(text);
			expect(bpmCell.classList).not.toContain("text-success");
			expect(bpmCell.classList).not.toContain("text-danger");
			const number = bpmCell.querySelector("span");
			if (className) {
				expect(number?.classList).toContain(className);
			} else if (value === undefined) {
				expect(number).toBeNull();
			} else {
				expect(number).not.toBeNull();
				expect(number!.classList).not.toContain("text-success");
				expect(number!.classList).not.toContain("text-danger");
			}
		},
	);
});

describe("BPMI Box Score column visibility", () => {
	test.each([false, true])(
		"hides the whole column throughout a Live Game (gameOver=%s)",
		(gameOver) => {
			const container = renderBoxScore({
				gameOver,
				live: true,
			});

			for (const table of container.querySelectorAll("table")) {
				const headerCells = getCells(table.querySelector("thead tr")!);
				const headerLabels = headerCells.map((cell) => cell.textContent);
				expect(headerLabels).not.toContain("BPMI");
				expect(headerLabels.slice(-4)).toEqual([
					"GmSc",
					"Form",
					"GForm",
					"FormTot",
				]);

				const expectedColumnCount = headerCells.length;
				const bodyRows = table.querySelectorAll("tbody tr");
				expect(bodyRows).toHaveLength(3);
				const firstPlayerCells = getCells(bodyRows[0]!);
				for (const [label, expectedValue] of [
					["GmSc", "13.0"],
					["Form", "1.2"],
					["GForm", "-0.4"],
					["FormTot", "0.8"],
				] as const) {
					const index = headerLabels.indexOf(label);
					expect(index).toBeGreaterThan(-1);
					expect(firstPlayerCells[index]!.textContent).toBe(expectedValue);
				}
				expect(getEffectiveColumnCount(bodyRows[0]!)).toBe(expectedColumnCount);
				expect(getEffectiveColumnCount(bodyRows[1]!)).toBe(expectedColumnCount);
				expect(getEffectiveColumnCount(bodyRows[2]!)).toBe(expectedColumnCount);
				expect(
					Number(
						bodyRows[2]!.querySelector("[colspan]")!.getAttribute("colspan"),
					),
				).toBe(BOX_SCORE_STATS.length - 1);

				for (const footerRow of table.querySelectorAll("tfoot tr")) {
					expect(getEffectiveColumnCount(footerRow)).toBe(expectedColumnCount);
				}
			}
		},
	);

	test("keeps BPMI visible and sortable in completed non-live box scores", () => {
		const container = renderBoxScore({
			gameOver: true,
			live: false,
		});

		for (const table of container.querySelectorAll("table")) {
			const headerCells = getCells(table.querySelector("thead tr")!);
			const headerLabels = headerCells.map((cell) => cell.textContent);
			expect(headerLabels.slice(-5)).toEqual([
				"GmSc",
				"BPMI",
				"Form",
				"GForm",
				"FormTot",
			]);

			const bpmiIndex = headerLabels.indexOf("BPMI");
			expect(bpmiIndex).toBeGreaterThan(-1);
			expect(headerCells[bpmiIndex]!.classList.contains("sorting")).toBe(true);

			const expectedColumnCount = headerCells.length;
			const bodyRows = table.querySelectorAll("tbody tr");
			expect(getCells(bodyRows[0]!)[bpmiIndex]!.textContent).toBe("+2.50");
			expect(getEffectiveColumnCount(bodyRows[0]!)).toBe(expectedColumnCount);
			expect(getEffectiveColumnCount(bodyRows[1]!)).toBe(expectedColumnCount);
			expect(getEffectiveColumnCount(bodyRows[2]!)).toBe(expectedColumnCount);
			expect(
				Number(
					bodyRows[2]!.querySelector("[colspan]")!.getAttribute("colspan"),
				),
			).toBe(BOX_SCORE_STATS.length);

			for (const footerRow of table.querySelectorAll("tfoot tr")) {
				expect(getEffectiveColumnCount(footerRow)).toBe(expectedColumnCount);
			}
		}
	});

	test("sorts completed non-live box scores by BPMI", () => {
		const container = document.createElement("div");
		const root = createRoot(container);

		flushSync(() => {
			root.render(
				createElement(BoxScore, {
					boxScore: makeBoxScore({
						gameOver: true,
						live: false,
					}),
					Row: BoxScoreRow,
					forceRowUpdate: false,
				}),
			);
		});

		try {
			const table = container.querySelector("table")!;
			const bpmiHeader = Array.from(table.querySelectorAll("thead th")).find(
				(cell) => cell.textContent === "BPMI",
			)!;
			flushSync(() => {
				bpmiHeader.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			const playerNames = Array.from(table.querySelectorAll("tbody tr")).map(
				(row) => getCells(row)[0]!.textContent,
			);
			expect(playerNames.slice(0, 2)).toEqual(["Player 2", "Player 1"]);
			expect(playerNames[2]).toContain("Player 3");
		} finally {
			flushSync(() => {
				root.unmount();
			});
		}
	});
});
