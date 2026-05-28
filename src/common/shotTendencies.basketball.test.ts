import { assert, describe, test } from "vitest";
import {
	getShotTendencies,
	getShotTendenciesForProfile,
	getShotTendencyEffect,
	getShotTendencyProfileId,
	getShotTendenciesFromObservedStats,
} from "./shotTendencies.basketball.ts";

describe("shot tendencies", () => {
	test("clamps extreme values before applying effects", () => {
		const tendencies = getShotTendencies({
			atRimTendency: 99,
			lowPostTendency: -99,
			midRangeTendency: 1,
			threePointTendency: 1,
		});

		assert.strictEqual(tendencies.atRimTendency, 1.8);
		assert.strictEqual(tendencies.lowPostTendency, 0.5);
		assert.strictEqual(getShotTendencyEffect(1), 1);
	});

	test("recognizes presets and marks other combinations as custom", () => {
		const spacer = getShotTendenciesForProfile("spacer");
		assert.strictEqual(getShotTendencyProfileId(spacer), "spacer");

		assert.strictEqual(
			getShotTendencyProfileId({
				...spacer,
				threePointTendency: spacer.threePointTendency + 0.01,
			}),
			"custom",
		);
	});

	test("shrinks observed stats toward the prior when sample size is small", () => {
		const prior = getShotTendenciesForProfile("balanced");
		const smallSample = getShotTendenciesFromObservedStats(
			{
				fga: 20,
				tpa: 12,
				fgaAtRim: 2,
				fgaMidRange: 2,
				fgaLowPost: 1,
			},
			prior,
		);
		const largeSample = getShotTendenciesFromObservedStats(
			{
				fga: 800,
				tpa: 480,
				fgaAtRim: 80,
				fgaMidRange: 80,
				fgaLowPost: 40,
			},
			prior,
		);

		assert(largeSample.threePointTendency > smallSample.threePointTendency);
		assert(smallSample.threePointTendency > prior.threePointTendency);
	});
});
