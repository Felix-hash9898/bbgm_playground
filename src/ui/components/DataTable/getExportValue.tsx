import type { SortType } from "../../../common/types.ts";
import getSearchVal from "./getSearchVal.tsx";
import getSortVal from "./getSortVal.tsx";

const getExportValue = (value: any, sortType: SortType | undefined) => {
	if (value != null && Object.hasOwn(value, "exportValue")) {
		return value.exportValue;
	}

	if (sortType === "number") {
		return getSortVal(value, sortType);
	}

	return getSearchVal(value, false);
};

export default getExportValue;
