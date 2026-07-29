import { assert, test } from "vitest";
import oldAbbrevTo2020BBGMAbbrev from "./oldAbbrevTo2020BBGMAbbrev.ts";

test("supports current and expansion-compatible abbreviations", () => {
	for (const abbrev of ["LV", "SET", "_LV", "_SET"]) {
		assert.include(["LV", "SET"], oldAbbrevTo2020BBGMAbbrev(abbrev));
	}
});
