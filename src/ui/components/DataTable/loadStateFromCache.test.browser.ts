import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import DataTable, { type Col, type DataTableRow } from "./index.tsx";

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

const records = [
	{
		A: "row 1",
		B: 2,
		New: "new 1",
		Replacement: "replacement 1",
	},
	{
		A: "row 2",
		B: 1,
		New: "new 2",
		Replacement: "replacement 2",
	},
];

const makeRows = (cols: Col[]): DataTableRow[] =>
	records.map((record, i) => ({
		data: cols.map((col) => record[col.title as keyof typeof record]),
		key: i,
	}));

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
	root?.unmount();
	container?.remove();
	localStorage.removeItem("DataTableSort:Dynamic cols test");
	localStorage.removeItem("DataTableSortCols:Dynamic cols test");
	root = undefined;
	container = undefined;
	vi.restoreAllMocks();
});

const renderTable = (cols: Col[]) => {
	flushSync(() => {
		root!.render(
			createElement(DataTable, {
				cols,
				defaultSort: [0, "asc"],
				hideAllControls: true,
				hideMenuToo: true,
				name: "Dynamic cols test",
				rows: makeRows(cols),
			}),
		);
	});
};

const getHeader = (title: string) =>
	Array.from(container!.querySelectorAll("thead th")).find(
		(element) => element.textContent === title,
	) as HTMLTableCellElement;

describe("DataTable sorting across column changes", () => {
	test("keeps the same logical sort without repeated state resets", () => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);

		const originalSetItem = Storage.prototype.setItem;
		let sortColsWrites = 0;
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(
			function (key, value) {
				if (key === "DataTableSortCols:Dynamic cols test") {
					sortColsWrites += 1;
				}
				return originalSetItem.call(this, key, value);
			},
		);

		renderTable([{ title: "A" }, { title: "B", sortType: "number" }]);
		expect(sortColsWrites).toBe(1);

		flushSync(() => {
			getHeader("B").dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(getHeader("B").classList.contains("sorting_asc")).toBe(true);

		for (const cols of [
			[{ title: "New" }, { title: "A" }, { title: "B", sortType: "number" }],
			[{ title: "New" }, { title: "B", sortType: "number" }],
			[{ title: "Replacement" }, { title: "B", sortType: "number" }],
			[{ title: "B", sortType: "number" }, { title: "Replacement" }],
		] satisfies Col[][]) {
			const writesBeforeRender = sortColsWrites;
			renderTable(cols);

			expect(sortColsWrites).toBe(writesBeforeRender + 1);
			expect(getHeader("B").classList.contains("sorting_asc")).toBe(true);
			expect(
				container.querySelector("tbody tr:first-child")!.textContent,
			).toContain("1");
		}
	});
});

describe("DataTable column layout across column removal", () => {
	const name = "Removed col layout test";
	const layoutRecords = [
		{ Name: "A", Age: 25, Form: 3, Contract: "$5M", Exp: 2027 },
		{ Name: "B", Age: 31, Form: -1, Contract: "$9M", Exp: 2026 },
	];
	const oldCols: Col[] = [
		{ title: "Name" },
		{ title: "Age", sortType: "number" },
		{ title: "Form", sortType: "number" },
		{ title: "Contract", sortType: "number" },
		{ title: "Exp", sortType: "number" },
	];
	const newCols = oldCols.filter((col) => col.title !== "Form");

	const render = (cols: Col[]) => {
		flushSync(() => {
			root!.render(
				createElement(DataTable, {
					cols,
					defaultSort: [0, "asc"],
					hideAllControls: true,
					hideMenuToo: true,
					name,
					rows: layoutRecords.map((record, i) => ({
						data: cols.map(
							(col) => record[col.title as keyof typeof record],
						),
						key: i,
					})),
				}),
			);
		});
	};

	const headerTitles = () =>
		Array.from(container!.querySelectorAll("thead th")).map(
			(element) => element.textContent,
		);

	afterEach(() => {
		for (const key of [
			"DataTableColOrder",
			"DataTableFilters",
			"DataTableSort",
			"DataTableSortCols",
			"DataTableStickyCols",
		]) {
			localStorage.removeItem(`${key}:${name}`);
		}
	});

	test("hidden and reordered columns keep their identity after an old column is removed", () => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);

		// Saved by a previous version of the table that still had a Form column: Exp moved first, Form hidden
		localStorage.setItem(`DataTableSortCols:${name}`, JSON.stringify(oldCols));
		localStorage.setItem(
			`DataTableColOrder:${name}`,
			JSON.stringify([
				{ colIndex: 4 },
				{ colIndex: 0 },
				{ colIndex: 1 },
				{ colIndex: 2, hidden: true },
				{ colIndex: 3 },
			]),
		);

		render(newCols);

		// Contract moved into Form's old index, but must not be hidden
		expect(headerTitles()).toEqual(["Exp", "Name", "Age", "Contract"]);
		expect(container.querySelector("tbody tr")!.textContent).toContain("$5M");

		// Remounting with the same cols keeps the migrated layout
		root.unmount();
		root = createRoot(container);
		render(newCols);
		expect(headerTitles()).toEqual(["Exp", "Name", "Age", "Contract"]);
	});
});
