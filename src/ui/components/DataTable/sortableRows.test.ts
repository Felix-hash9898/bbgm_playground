import { describe, expect, test } from "vitest";
import type { DataTableRow } from "./index.tsx";
import { getId, getRowIndex } from "./sortableRows.tsx";

const row = (key: string): DataTableRow => ({
	data: [key],
	key,
});

describe("sortable row identity", () => {
	test("keeps a clicked or dragged row attached to its key when rows reorder", () => {
		const rows = [row("a"), row("b"), row("c")];
		const activeId = getId(rows[1]!);
		const reorderedRows = [rows[1]!, rows[2]!, rows[0]!];

		expect(getRowIndex(reorderedRows, activeId)).toBe(0);
	});
});
