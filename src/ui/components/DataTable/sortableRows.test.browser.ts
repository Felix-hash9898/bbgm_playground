import { createElement, Fragment, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import type { DataTableRow } from "./index.tsx";
import {
	DraggableRow,
	getId,
	MyDragOverlay,
	SortableContextWrappers,
	SortableHandle,
	type RenderRowProps,
} from "./sortableRows.tsx";

const rows: DataTableRow[] = ["a", "b", "c"].map((key) => ({
	data: [key],
	key,
}));

const renderRow = (props: RenderRowProps) =>
	createElement(
		"tr",
		{
			"data-overlay": props.overlay ? "true" : undefined,
			"data-row-key": props.row.key,
			ref: props.setNodeRef,
			style: props.style,
		},
		createElement(SortableHandle, props),
		createElement("td", undefined, `${props.row.key} name`),
		createElement("td", undefined, `${props.row.key} rating`),
		createElement("td", undefined, `${props.row.key} contract`),
		createElement("td", undefined, `${props.row.key} acquired`),
	);

const TestTable = ({
	onChange = () => {},
}: {
	onChange?: (change: { oldIndex: number; newIndex: number }) => void;
}) => {
	const tableRef = useRef<HTMLTableElement>(null);

	return createElement(
		Fragment,
		undefined,
		createElement(
			"style",
			undefined,
			`
				[data-test-scroll-wrapper] {
					overflow-x: auto;
					width: 320px;
				}

				[data-test-sortable-table] {
					border-collapse: collapse;
					table-layout: fixed;
					width: 936px;
				}

				[data-test-sortable-table] td {
					box-sizing: border-box;
					height: 30px;
					min-width: 180px;
					width: 180px;
				}

				[data-test-sortable-table] td.roster-handle {
					min-width: 36px;
					width: 36px;
				}

				[data-test-sortable-table] tr > td:first-child {
					left: 0;
					position: sticky;
					z-index: 10;
				}

				[data-test-sortable-table] tr > td:nth-child(2) {
					left: 36px;
					position: sticky;
					z-index: 10;
				}
			`,
		),
		createElement(
			"div",
			{ "data-test-scroll-wrapper": true },
			createElement(
				SortableContextWrappers,
				{
					highlightHandle: () => true,
					onChange,
					onSwap: () => {},
					renderRow,
					rows,
					tableRef,
				},
				createElement(
					"table",
					{ "data-test-sortable-table": true, ref: tableRef },
					createElement(
						"tbody",
						undefined,
						rows.map((row) =>
							createElement(DraggableRow, {
								id: getId(row),
								key: row.key,
								row,
							}),
						),
					),
					createElement(MyDragOverlay),
				),
			),
		),
	);
};

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
	root?.unmount();
	container?.remove();
	root = undefined;
	container = undefined;
});

const nextFrame = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});

describe("sortable row DragOverlay", () => {
	test.each([0, 240])(
		"stays aligned with sticky columns at scrollLeft=$scrollLeft",
		async (scrollLeft) => {
			container = document.createElement("div");
			document.body.append(container);
			root = createRoot(container);
			flushSync(() => {
				root!.render(createElement(TestTable));
			});
			await nextFrame();

			const scrollWrapper = container.querySelector<HTMLElement>(
				"[data-test-scroll-wrapper]",
			)!;
			scrollWrapper.scrollLeft = scrollLeft;
			await nextFrame();
			expect(scrollWrapper.scrollLeft).toBe(scrollLeft);

			const sourceRow = container.querySelector<HTMLTableRowElement>(
				'tbody tr[data-row-key="b"]',
			)!;
			const sourceCells = Array.from(sourceRow.cells);
			const handle = sourceCells[0]!.querySelector("button")!;
			const handleRect = handle.getBoundingClientRect();

			handle.dispatchEvent(
				new MouseEvent("mousedown", {
					bubbles: true,
					buttons: 1,
					clientX: handleRect.left + handleRect.width / 2,
					clientY: handleRect.top + handleRect.height / 2,
				}),
			);
			document.dispatchEvent(
				new MouseEvent("mousemove", {
					bubbles: true,
					buttons: 1,
					clientX: handleRect.left + handleRect.width / 2,
					clientY: handleRect.top + handleRect.height / 2 + 1,
				}),
			);
			await nextFrame();

			try {
				const overlayRow = container.querySelector<HTMLTableRowElement>(
					'tr[data-overlay="true"]',
				)!;
				expect(overlayRow).not.toBeNull();

				const overlayCells = Array.from(overlayRow.cells);
				expect(overlayCells).toHaveLength(sourceCells.length);

				for (let i = 0; i < sourceCells.length; i++) {
					expect(overlayCells[i]!.getBoundingClientRect().left).toBeCloseTo(
						sourceCells[i]!.getBoundingClientRect().left,
						0,
					);
				}
			} finally {
				document.dispatchEvent(
					new MouseEvent("mouseup", {
						bubbles: true,
						clientX: handleRect.left + handleRect.width / 2,
						clientY: handleRect.top + handleRect.height / 2 + 1,
					}),
				);
			}
		},
	);

	test.each([
		["Space", " "],
		["Enter", "Enter"],
	])("moves a focused row with the %s keyboard control", async (code, key) => {
		const changes: { oldIndex: number; newIndex: number }[] = [];
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		flushSync(() => {
			root!.render(
				createElement(TestTable, {
					onChange: (change) => changes.push(change),
				}),
			);
		});
		await nextFrame();

		const handle = container.querySelector<HTMLButtonElement>(
			'tbody tr[data-row-key="b"] button',
		)!;
		handle.focus();
		handle.dispatchEvent(
			new KeyboardEvent("keydown", { bubbles: true, code, key }),
		);
		await nextFrame();
		handle.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				code: "ArrowDown",
				key: "ArrowDown",
			}),
		);
		await nextFrame();
		handle.dispatchEvent(
			new KeyboardEvent("keydown", { bubbles: true, code, key }),
		);
		await nextFrame();

		expect(changes).toEqual([{ oldIndex: 1, newIndex: 2 }]);
	});

	test("cancels keyboard sorting with Escape", async () => {
		const changes: { oldIndex: number; newIndex: number }[] = [];
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		flushSync(() => {
			root!.render(
				createElement(TestTable, {
					onChange: (change) => changes.push(change),
				}),
			);
		});
		await nextFrame();

		const handle = container.querySelector<HTMLButtonElement>(
			'tbody tr[data-row-key="b"] button',
		)!;
		handle.focus();
		handle.dispatchEvent(
			new KeyboardEvent("keydown", { bubbles: true, code: "Space", key: " " }),
		);
		await nextFrame();
		handle.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				code: "ArrowDown",
				key: "ArrowDown",
			}),
		);
		await nextFrame();
		handle.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				code: "Escape",
				key: "Escape",
			}),
		);
		await nextFrame();

		expect(changes).toEqual([]);
	});
});
