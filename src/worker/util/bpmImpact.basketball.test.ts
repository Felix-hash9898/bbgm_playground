import { describe, expect, test } from "vitest";
import { possessionContinues } from "../core/GameSim.basketball/index.ts";
import { calculateBPMImpact } from "./advStats.basketball.ts";

describe("single-game BPM impact", () => {
	test("scales BPM by average on-court possessions", () => {
		expect(calculateBPMImpact(40, 2.0833, 2.0833)).toBeCloseTo(0.8333, 4);
		expect(calculateBPMImpact(6, 75, 75)).toBe(4.5);
		expect(calculateBPMImpact(6, 75, 75)!).toBeGreaterThan(
			calculateBPMImpact(40, 2.0833, 2.0833)!,
		);
	});

	test("returns empty for DNP or invalid values", () => {
		expect(calculateBPMImpact(40, 0, 0)).toBeUndefined();
		expect(calculateBPMImpact(Number.NaN, 10, 10)).toBeUndefined();
		expect(
			calculateBPMImpact(Number.POSITIVE_INFINITY, 10, 10),
		).toBeUndefined();
	});

	test("does not count continuation plays as new possessions", () => {
		expect(possessionContinues("orb")).toBe(true);
		expect(possessionContinues("nonShootingFoul")).toBe(true);
		expect(possessionContinues("timeout")).toBe(true);
		expect(possessionContinues("outOfBoundsDefense")).toBe(true);
		expect(possessionContinues("ft")).toBe(false);
		expect(possessionContinues("fg")).toBe(false);
		expect(possessionContinues(undefined)).toBe(false);
	});
});
