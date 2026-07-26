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
