import { describe, expect, test } from "vitest";
import defaultGameAttributes, {
	baseballOverrides,
	footballOverrides,
	hockeyOverrides,
} from "./defaultGameAttributes.ts";
import reachesStopOnInjuryThreshold from "./reachesStopOnInjuryThreshold.ts";

describe("stop on injury defaults", () => {
	test("new basketball leagues stop for injuries of at least 15 games", () => {
		expect(defaultGameAttributes.stopOnInjuryGames).toBe(15);
		expect(reachesStopOnInjuryThreshold(14, 15)).toBe(false);
		expect(reachesStopOnInjuryThreshold(15, 15)).toBe(true);
	});

	test("other sports retain their existing defaults", () => {
		expect(footballOverrides.stopOnInjuryGames).toBe(1);
		expect(hockeyOverrides.stopOnInjuryGames).toBe(5);
		expect(baseballOverrides.stopOnInjuryGames).toBe(5);
	});
});
