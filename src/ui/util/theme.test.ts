import { describe, expect, test } from "vitest";
import { parseThemeSetting } from "./theme.ts";

describe("parseThemeSetting", () => {
	test.each(["dark", "light", "minimal"] as const)(
		"accepts the persisted %s theme",
		(theme) => {
			expect(parseThemeSetting(theme)).toBe(theme);
		},
	);

	test.each([null, "", "default", "invalid"])("uses Auto for %s", (value) => {
		expect(parseThemeSetting(value)).toBe("default");
	});
});
