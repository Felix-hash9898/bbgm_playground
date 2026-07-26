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

	let colOrder = settingsCache.get("DataTableColOrder");
	if (!colOrder) {
		colOrder = cols.map((col, i) => ({
			colIndex: i,
		}));
	}
	if (colOrder.length < cols.length) {
		// Add cols
		for (let i = 0; i < cols.length; i++) {
			if (!colOrder.some((x: any) => x && x.colIndex === i)) {
				colOrder.push({
					colIndex: i,
				});
			}
		}
	}
	// If too many cols... who cares, will get filtered out

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
