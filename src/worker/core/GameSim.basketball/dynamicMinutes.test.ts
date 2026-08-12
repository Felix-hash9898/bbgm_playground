import { assert, test } from "vitest";
import getDynamicMinutesMultiplier, {
	DYNAMIC_MINUTES_CONFIG,
	PLAN_AWARE_COURT_TIMER_BLEND,
	getPlanAwareCourtTimer,
} from "./dynamicMinutes.ts";

test("production Dynamic minutes keeps the frozen configuration and representative outputs", () => {
	assert.deepEqual(DYNAMIC_MINUTES_CONFIG, {
		gain: 4,
		stabilityFloorMinutes: 4,
		minMultiplier: 0.35,
		maxMultiplier: 2.4,
		fatigueEnergySoft: 0.68,
		fatigueEnergyHard: 0.5,
		continuousStintSoft: 10,
		continuousStintHard: 14,
		fatiguePositiveCapSoft: 1.75,
		fatiguePositiveCapHard: 1.1,
		tinyTargetMaxMinutes: 6,
		tinyCompletionToleranceMinutes: 0.75,
		tinyReentryMaxMultiplier: 0.2,
	});

	const cases = [
		{
			input: {
				targetMinutes: 36,
				regulationMinutes: 48,
				elapsed: 18,
				playedMinutes: 12,
				energy: 0.9,
				onCourt: true,
				continuousStintMinutes: 5,
				completedPositiveStint: false,
			},
			expected: Math.exp(0.2),
		},
		{
			input: {
				targetMinutes: 44,
				regulationMinutes: 48,
				elapsed: 38,
				playedMinutes: 31,
				energy: 0.54,
				onCourt: true,
				continuousStintMinutes: 13,
				completedPositiveStint: true,
			},
			expected: 1.2444444444444445,
		},
		{
			input: {
				targetMinutes: 3,
				regulationMinutes: 48,
				elapsed: 30,
				playedMinutes: 2.6,
				energy: 0.95,
				onCourt: false,
				continuousStintMinutes: 0,
				completedPositiveStint: true,
			},
			expected: 0.2,
		},
		{
			input: {
				targetMinutes: 0,
				regulationMinutes: 40,
				elapsed: 8,
				playedMinutes: 5,
				energy: 0.8,
				onCourt: false,
				continuousStintMinutes: 0,
				completedPositiveStint: false,
			},
			expected: 0.35,
		},
	];

	for (const { input, expected } of cases) {
		assert.closeTo(getDynamicMinutesMultiplier(input), expected, 1e-12);
	}
});

test("symmetric court-removal timer blends both plan directions at the frozen 0.75", () => {
	assert.strictEqual(PLAN_AWARE_COURT_TIMER_BLEND, 0.75);

	const longerWait = getPlanAwareCourtTimer({
		legacyRequiredWait: 2,
		remainingGame: 36,
		remainingNeed: 40,
		restShare: 8,
		completedBench: 12,
		plannedMinutes: 40,
	});
	assert.strictEqual(longerWait.desiredWait, 36);
	assert.strictEqual(longerWait.blendedWait, 27.5);
	assert.strictEqual(longerWait.courtTime, -25.5);

	const shorterWait = getPlanAwareCourtTimer({
		legacyRequiredWait: 2,
		remainingGame: 36,
		remainingNeed: 4,
		restShare: 44,
		completedBench: 12,
		plannedMinutes: 4,
	});
	assert.closeTo(shorterWait.desiredWait, 12 / 11, 1e-12);
	assert.closeTo(shorterWait.blendedWait, 1.3181818181818181, 1e-12);
	assert.closeTo(shorterWait.courtTime, 0.6818181818181819, 1e-12);
	assert(shorterWait.desiredWait < shorterWait.blendedWait);
	assert(shorterWait.blendedWait < 2);
});
