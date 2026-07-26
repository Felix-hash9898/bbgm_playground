import { assert, beforeAll, test } from "vitest";

let getExportValue: typeof import("./getExportValue.tsx").default;

beforeAll(async () => {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: () => null,
			removeItem: () => {},
			setItem: () => {},
		},
	});
	getExportValue = (await import("./getExportValue.tsx")).default;
});

test("prefers an explicit visible export value over sort/search encodings", () => {
	assert.equal(
		getExportValue(
			{
				exportValue: 73,
				searchValue: "73 (+4)",
				sortValue: 73.504,
				value: "formatted rating",
			},
			"number",
		),
		73,
	);
});

test("preserves an explicit zero export value", () => {
	assert.equal(
		getExportValue(
			{
				exportValue: 0,
				sortValue: 10,
				value: "0",
			},
			"number",
		),
		0,
	);
});

test("falls back to existing numeric and text export behavior", () => {
	assert.equal(getExportValue("1,234", "number"), 1234);
	assert.equal(
		getExportValue({ searchValue: "visible" }, undefined),
		"visible",
	);
});
