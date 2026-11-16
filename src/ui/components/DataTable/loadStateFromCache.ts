import { safeLocalStorage } from "../../util/index.ts";
import type { Props, SortBy, StickyCols } from "./index.tsx";
import SettingsCache from "./SettingsCache.ts";

type PersistedSortCol = Pick<
	Props["cols"][number],
	"desc" | "sortSequence" | "sortType" | "title"
>;

export type State = {
	colOrder: {
		colIndex: number;
		hidden?: boolean;
	}[];
	currentPage: number;
	enableFilters: boolean;
	filters: string[];
	hideAllControls: boolean;
	prevColKeys: string[];
	prevName: string;
	perPage: number;
	searchText: string;
	showSelectColumnsModal: boolean;
	sortBys: SortBy[] | undefined;
	stickyCols: StickyCols;
	settingsCache: SettingsCache;
};

export type LoadStateFromCacheProps = Pick<
	Props,
	"cols" | "disableSettingsCache" | "defaultSort" | "defaultStickyCols" | "name"
> &
	Pick<State, "hideAllControls">;

const getPersistedSortCols = (cols: Props["cols"]): PersistedSortCol[] =>
	cols.map(({ desc, sortSequence, sortType, title }) => ({
		desc,
		sortSequence,
		sortType,
		title,
	}));

export const getColKeys = (cols: Props["cols"]) => {
	const counts = new Map<string, number>();

	return getPersistedSortCols(cols).map((col) => {
		const key = JSON.stringify(col);
		const count = counts.get(key) ?? 0;
		counts.set(key, count + 1);
		return `${key}:${count}`;
	});
};

const getCachedColKeys = (value: unknown) => {
	if (
		!Array.isArray(value) ||
		!value.every(
			(col) =>
				col !== null &&
				typeof col === "object" &&
				typeof (col as { title?: unknown }).title === "string",
		)
	) {
		return;
	}

	return getColKeys(value as Props["cols"]);
};

const reconcileSortBys = ({
	cols,
	sortBys,
	sortCols,
}: {
	cols: Props["cols"];
	sortBys: unknown;
	sortCols: unknown;
}) => {
	if (!Array.isArray(sortBys)) {
		return;
	}

	const oldColKeys = getCachedColKeys(sortCols);
	if (!oldColKeys) {
		return;
	}

	const colKeys = getColKeys(cols);
	const reconciledSortBys: SortBy[] = [];

	for (const sortBy of sortBys) {
		if (
			!Array.isArray(sortBy) ||
			!Number.isInteger(sortBy[0]) ||
			sortBy[0] < 0 ||
			(sortBy[1] !== "asc" && sortBy[1] !== "desc")
		) {
			continue;
		}

		const oldColKey = oldColKeys[sortBy[0]];
		const colIndex = oldColKey ? colKeys.indexOf(oldColKey) : -1;
		const col = cols[colIndex];

		if (
			colIndex >= 0 &&
			!(col?.sortSequence && col.sortSequence.length === 0)
		) {
			reconciledSortBys.push([colIndex, sortBy[1]]);
		}
	}

	return reconciledSortBys;
};

// Map each old column index to its index in the current cols, or -1 if that column no longer exists. Returns undefined if the cached column snapshot is missing or invalid, in which case old indexes can't be trusted when the column count changed.
const getColIndexMap = ({
	cols,
	sortCols,
}: {
	cols: Props["cols"];
	sortCols: unknown;
}) => {
	const oldColKeys = getCachedColKeys(sortCols);
	if (!oldColKeys) {
		return;
	}

	const colKeys = getColKeys(cols);
	return oldColKeys.map((key) => colKeys.indexOf(key));
};

const getDefaultColOrder = (cols: Props["cols"]): State["colOrder"] =>
	cols.map((col, i) => ({
		colIndex: i,
	}));

const reconcileColOrder = ({
	colIndexMap,
	cols,
	colOrder,
}: {
	colIndexMap: number[] | undefined;
	cols: Props["cols"];
	colOrder: unknown;
}): {
	colOrder: State["colOrder"];
	changed: boolean;
} => {
	if (!Array.isArray(colOrder)) {
		return {
			colOrder: getDefaultColOrder(cols),
			changed: colOrder !== undefined,
		};
	}

	const valid = colOrder.filter(
		(x): x is State["colOrder"][number] =>
			x !== null &&
			typeof x === "object" &&
			Number.isInteger(x.colIndex) &&
			x.colIndex >= 0,
	);

	let reconciled: State["colOrder"] = [];
	if (colIndexMap) {
		// Cached colOrder references indexes of the cols from the last time this table was rendered, so translate them by column identity. Otherwise, after a column is removed, hidden/reordered settings would silently apply to whatever column moved into that index.
		const seen = new Set<number>();
		for (const x of valid) {
			const colIndex = colIndexMap[x.colIndex] ?? -1;
			if (colIndex >= 0 && !seen.has(colIndex)) {
				seen.add(colIndex);
				reconciled.push(
					x.hidden ? { colIndex, hidden: true } : { colIndex },
				);
			}
		}
	} else if (valid.length === cols.length) {
		// Legacy cache with no column snapshot. Same number of columns, so assume the columns did not change.
		reconciled = valid;
	} else {
		// Legacy cache with no column snapshot and a different number of columns. Old indexes can't be matched to columns, so drop the customization rather than apply it to the wrong columns.
		return {
			colOrder: getDefaultColOrder(cols),
			changed: true,
		};
	}

	// Add new cols at the end
	let added = false;
	for (let i = 0; i < cols.length; i++) {
		if (!reconciled.some((x) => x.colIndex === i)) {
			reconciled.push({
				colIndex: i,
			});
			added = true;
		}
	}

	const changed =
		added ||
		reconciled.length !== colOrder.length ||
		reconciled.some(
			(x, i) =>
				x.colIndex !== colOrder[i]?.colIndex ||
				!!x.hidden !== !!colOrder[i]?.hidden,
		);

	return {
		colOrder: reconciled,
		changed,
	};
};

const loadStateFromCache = ({
	cols,
	disableSettingsCache,
	defaultSort,
	defaultStickyCols,
	hideAllControls,
	name,
}: LoadStateFromCacheProps): State => {
	const settingsCache = new SettingsCache(name, !!disableSettingsCache);

	// @ts-expect-error
	let perPage = Number.parseInt(safeLocalStorage.getItem("perPage"));

	if (Number.isNaN(perPage)) {
		perPage = 10;
	}

	const sortBysFromStorage = settingsCache.get("DataTableSort");
	const sortColsFromStorage = settingsCache.get("DataTableSortCols");
	const colIndexMap = getColIndexMap({
		cols,
		sortCols: sortColsFromStorage,
	});
	let sortBys: SortBy[] | undefined;

	if (defaultSort !== "disableSort") {
		if (sortBysFromStorage === undefined) {
			sortBys = [defaultSort];
		} else {
			sortBys = reconcileSortBys({
				cols,
				sortBys: sortBysFromStorage,
				sortCols: sortColsFromStorage,
			});

			if (sortBys && sortBys.length > 0) {
				settingsCache.set("DataTableSort", sortBys);
			} else {
				settingsCache.clear("DataTableSort");
				sortBys = [defaultSort];
			}
		}
	}
	settingsCache.set("DataTableSortCols", getPersistedSortCols(cols));

	const defaultFilters: string[] = cols.map(() => "");
	const filtersFromStorage = settingsCache.get("DataTableFilters");
	let filters;

	if (filtersFromStorage === undefined) {
		filters = defaultFilters;
	} else {
		try {
			filters = filtersFromStorage;

			// Translate filters from the cached cols to the current cols by column identity
			if (
				colIndexMap &&
				Array.isArray(filters) &&
				filters.length === colIndexMap.length &&
				filters.every((filter) => typeof filter === "string")
			) {
				const remappedFilters = cols.map(() => "");
				for (const [oldIndex, filter] of filters.entries()) {
					const colIndex = colIndexMap[oldIndex]!;
					if (colIndex >= 0) {
						remappedFilters[colIndex] = filter;
					}
				}
				filters = remappedFilters;
				settingsCache.set("DataTableFilters", filters);
			}

			// Confirm valid filters
			if (!Array.isArray(filters) || filters.length !== cols.length) {
				filters = defaultFilters;
			} else {
				for (const filter of filters) {
					if (typeof filter !== "string") {
						filters = defaultFilters;
						break;
					}
				}
			}
		} catch {
			filters = defaultFilters;
		}
	}

	const reconciledColOrder = reconcileColOrder({
		colIndexMap,
		cols,
		colOrder: settingsCache.get("DataTableColOrder"),
	});
	const colOrder = reconciledColOrder.colOrder;
	if (reconciledColOrder.changed) {
		// Persist, because DataTableSortCols now describes the current cols, so the cached colOrder must use current indexes too
		settingsCache.set("DataTableColOrder", colOrder);
	}

	const stickyCols =
		settingsCache.get("DataTableStickyCols") ?? defaultStickyCols;

	return {
		colOrder,
		currentPage: 1,
		enableFilters: !hideAllControls && filters !== defaultFilters,
		filters,
		hideAllControls, // So we can know if this changes and reset state
		perPage,
		prevColKeys: getColKeys(cols),
		prevName: name,
		searchText: "",
		showSelectColumnsModal: false,
		sortBys,
		stickyCols,
		settingsCache,
	};
};

export default loadStateFromCache;
