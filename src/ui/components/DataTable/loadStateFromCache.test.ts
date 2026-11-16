import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Col, SortBy } from "./index.tsx";
import loadStateFromCache from "./loadStateFromCache.ts";

const { safeLocalStorage, storage } = vi.hoisted(() => {
	const storage = new Map<string, string>();

	return {
		safeLocalStorage: {
			clear: () => storage.clear(),
			getItem: (key: string) => storage.get(key) ?? null,
			removeItem: (key: string) => {
				storage.delete(key);
			},
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			},
		},
		storage,
	};
});

vi.mock("../../util/index.ts", () => ({
	safeLocalStorage,
}));

beforeEach(() => {
	storage.clear();
});

const localStorage = {
	getItem: (key: string) => storage.get(key) ?? null,
	removeItem: (key: string) => {
		storage.delete(key);
	},
	setItem: (key: string, value: string) => {
		storage.set(key, value);
	},
};

const load = (cols: Col[], defaultSort: SortBy = [0, "asc"]) =>
	loadStateFromCache({
		cols,
		defaultSort,
		defaultStickyCols: 0,
		hideAllControls: false,
		name: "Test",
	});

const setCachedSort = (sortBys: SortBy[], cols?: Col[]) => {
	localStorage.setItem("DataTableSort:Test", JSON.stringify(sortBys));
	if (cols) {
		localStorage.setItem("DataTableSortCols:Test", JSON.stringify(cols));
	}
};

describe("cached sorting when columns change", () => {
	test("discards legacy index-only sorting that cannot be matched to a column", () => {
		setCachedSort([[1, "desc"]]);

		expect(load([{ title: "A" }, { title: "B" }]).sortBys).toEqual([
			[0, "asc"],
		]);
	});

	test.each([
		{
			label: "added",
			oldCols: [{ title: "A" }, { title: "B" }],
			newCols: [{ title: "New" }, { title: "A" }, { title: "B" }],
			expected: [[2, "desc"]],
		},
		{
			label: "deleted",
			oldCols: [{ title: "A" }, { title: "B" }, { title: "C" }],
			newCols: [{ title: "B" }, { title: "C" }],
			expected: [[0, "desc"]],
		},
		{
			label: "reordered",
			oldCols: [{ title: "A" }, { title: "B" }],
			newCols: [{ title: "B" }, { title: "A" }],
			expected: [[0, "desc"]],
		},
	] satisfies {
		label: string;
		oldCols: Col[];
		newCols: Col[];
		expected: SortBy[];
	}[])(
		"keeps sorting on the same logical column when columns are $label",
		({ expected, newCols, oldCols }) => {
			setCachedSort([[1, "desc"]], oldCols);

			expect(load(newCols).sortBys).toEqual(expected);
		},
	);

	test("falls back to default sorting when the sorted column is replaced", () => {
		const oldCols = [{ title: "A" }, { title: "B" }];
		setCachedSort([[1, "desc"]], oldCols);

		expect(load([{ title: "A" }, { title: "Replacement" }]).sortBys).toEqual([
			[0, "asc"],
		]);
	});
});

describe("cached column layout when columns change", () => {
	// Mirrors the Roster table losing its Form column: every column after Form shifts left by one index
	const oldCols: Col[] = [
		{ title: "Name" },
		{ title: "Pos" },
		{ title: "Age" },
		{ title: "Form", sortType: "number" },
		{ title: "Contract", sortType: "number" },
		{ title: "Exp" },
	];
	const newCols: Col[] = oldCols.filter((col) => col.title !== "Form");

	const setCachedLayout = (
		colOrder: { colIndex: number; hidden?: boolean }[],
		cols?: Col[],
		filters?: string[],
	) => {
		localStorage.setItem("DataTableColOrder:Test", JSON.stringify(colOrder));
		if (cols) {
			localStorage.setItem("DataTableSortCols:Test", JSON.stringify(cols));
		}
		if (filters) {
			localStorage.setItem("DataTableFilters:Test", JSON.stringify(filters));
		}
	};

	const titles = (cols: Col[], colOrder: { colIndex: number }[]) =>
		colOrder.map(({ colIndex }) => cols[colIndex]!.title);

	const hiddenTitles = (
		cols: Col[],
		colOrder: { colIndex: number; hidden?: boolean }[],
	) =>
		colOrder
			.filter(({ hidden }) => hidden)
			.map(({ colIndex }) => cols[colIndex]!.title);

	test("hidden columns follow the column, not the old index, when a column is removed", () => {
		// User hid Exp (old index 5) and Age (old index 2)
		setCachedLayout(
			[
				{ colIndex: 0 },
				{ colIndex: 1 },
				{ colIndex: 2, hidden: true },
				{ colIndex: 3 },
				{ colIndex: 4 },
				{ colIndex: 5, hidden: true },
			],
			oldCols,
		);

		const { colOrder } = load(newCols);

		expect(titles(newCols, colOrder)).toEqual([
			"Name",
			"Pos",
			"Age",
			"Contract",
			"Exp",
		]);
		expect(hiddenTitles(newCols, colOrder)).toEqual(["Age", "Exp"]);
	});

	test("a hidden removed column does not hide the column that moves into its index", () => {
		// User hid Form (old index 3); Contract moves into index 3 after removal
		setCachedLayout(
			[
				{ colIndex: 0 },
				{ colIndex: 1 },
				{ colIndex: 2 },
				{ colIndex: 3, hidden: true },
				{ colIndex: 4 },
				{ colIndex: 5 },
			],
			oldCols,
		);

		const { colOrder } = load(newCols);

		expect(hiddenTitles(newCols, colOrder)).toEqual([]);
		expect(titles(newCols, colOrder)).toEqual(newCols.map((col) => col.title));
	});

	test("custom column order is preserved by column identity", () => {
		// User moved Contract to the front and Form right after Name
		setCachedLayout(
			[
				{ colIndex: 4 },
				{ colIndex: 0 },
				{ colIndex: 3 },
				{ colIndex: 1 },
				{ colIndex: 5, hidden: true },
				{ colIndex: 2 },
			],
			oldCols,
		);

		const { colOrder } = load(newCols);

		expect(titles(newCols, colOrder)).toEqual([
			"Contract",
			"Name",
			"Pos",
			"Exp",
			"Age",
		]);
		expect(hiddenTitles(newCols, colOrder)).toEqual(["Exp"]);
	});

	test("the reconciled layout is persisted with current indexes and stays stable on reload", () => {
		setCachedLayout(
			[
				{ colIndex: 4 },
				{ colIndex: 0 },
				{ colIndex: 3 },
				{ colIndex: 1 },
				{ colIndex: 5, hidden: true },
				{ colIndex: 2 },
			],
			oldCols,
		);

		const first = load(newCols).colOrder;
		expect(
			JSON.parse(localStorage.getItem("DataTableColOrder:Test")!),
		).toEqual(first);

		const second = load(newCols).colOrder;
		expect(second).toEqual(first);
		expect(hiddenTitles(newCols, second)).toEqual(["Exp"]);
	});

	test("added columns are appended without disturbing the saved layout", () => {
		setCachedLayout(
			[
				{ colIndex: 1 },
				{ colIndex: 0, hidden: true },
				{ colIndex: 2 },
			],
			[{ title: "A" }, { title: "B" }, { title: "C" }],
		);

		const cols: Col[] = [
			{ title: "New" },
			{ title: "A" },
			{ title: "B" },
			{ title: "C" },
		];
		const { colOrder } = load(cols);

		expect(titles(cols, colOrder)).toEqual(["B", "A", "C", "New"]);
		expect(hiddenTitles(cols, colOrder)).toEqual(["A"]);
	});

	test("legacy layout without a column snapshot is reset when the column count changed", () => {
		setCachedLayout([
			{ colIndex: 0 },
			{ colIndex: 1 },
			{ colIndex: 2 },
			{ colIndex: 3, hidden: true },
			{ colIndex: 4 },
			{ colIndex: 5 },
		]);

		const { colOrder } = load(newCols);

		expect(colOrder).toEqual(newCols.map((col, i) => ({ colIndex: i })));
	});

	test("legacy layout without a column snapshot is kept when the column count is unchanged", () => {
		const saved = [
			{ colIndex: 1 },
			{ colIndex: 0, hidden: true },
			{ colIndex: 2 },
		];
		setCachedLayout(saved);

		expect(load([{ title: "A" }, { title: "B" }, { title: "C" }]).colOrder).toEqual(
			saved,
		);
	});

	test("filters follow their column when a column is removed", () => {
		setCachedLayout(
			[0, 1, 2, 3, 4, 5].map((colIndex) => ({ colIndex })),
			oldCols,
			["", "", "", ">2", ">10", "1"],
		);

		const { filters } = load(newCols);

		expect(filters).toEqual(["", "", "", ">10", "1"]);
	});
});
