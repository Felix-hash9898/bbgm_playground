import { expect, test } from "vitest";
import getGameSimPresetUpdate, {
	getCanonicalGameSimPresetYear,
} from "./getGameSimPresetUpdate.ts";

test.each([
	[2023, "2020"],
	[2020, "2020"],
	[2015, "2015"],
	[9999, "2020"],
	[1900, "1947"],
])("resolves season %s to canonical preset %s", (season, expected) => {
	expect(getCanonicalGameSimPresetYear(season)).toBe(expected);
});

test("restores the canonical preset for the current league season", () => {
	const update = getGameSimPresetUpdate("default", 2023);

	expect(update?.gameSimPreset).toBe("default");
	expect(update?.settings.pace).toBe("100.2");
	expect(update?.settings.threePointTendencyFactor).toBe("1");
});

test("applies an explicitly selected historical preset", () => {
	const update = getGameSimPresetUpdate("2015", 2023);

	expect(update?.gameSimPreset).toBe("2015");
	expect(update?.settings.pace).toBe("93.9");
	expect(update?.settings.threePointTendencyFactor).toBe("0.705");
});

test("ignores default without a league season and invalid presets", () => {
	expect(getGameSimPresetUpdate("default")).toBeUndefined();
	expect(getGameSimPresetUpdate("invalid", 2023)).toBeUndefined();
});
