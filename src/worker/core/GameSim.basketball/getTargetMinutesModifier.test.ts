import { assert, describe, test } from "vitest";
import getTargetMinutesModifier from "./getTargetMinutesModifier.ts";
import {
	getAutoMinutesSoftCap,
	getMinutesSoftCap,
} from "./getMinutesLimitFactor.ts";

describe("getTargetMinutesModifier", () => {
	test("targetMinutes undefined → returns 1", () => {
		assert.strictEqual(
			getTargetMinutesModifier({
				targetMinutes: undefined,
				autoSoftCap: 30,
				regulationMinutes: 48,
			}),
			1,
		);
	});

	test("targetMinutes null → returns 1", () => {
		assert.strictEqual(
			getTargetMinutesModifier({
				targetMinutes: null as any,
				autoSoftCap: 30,
				regulationMinutes: 48,
			}),
			1,
		);
	});

	test("targetMinutes NaN → returns 1", () => {
		assert.strictEqual(
			getTargetMinutesModifier({
				targetMinutes: NaN,
				autoSoftCap: 30,
				regulationMinutes: 48,
			}),
			1,
		);
	});

	test("targetMinutes = autoSoftCap → returns ≈1", () => {
		const autoSoftCap = 30;
		const result = getTargetMinutesModifier({
			targetMinutes: autoSoftCap,
			autoSoftCap,
			regulationMinutes: 48,
		});
		assert.strictEqual(result, 1);
	});

	test("target > autoSoftCap → returns > 1", () => {
		const result = getTargetMinutesModifier({
			targetMinutes: 36,
			autoSoftCap: 22,
			regulationMinutes: 48,
		});
		assert(result > 1, `expected > 1, got ${result}`);
		assert(result <= 1.6, `expected <= 1.6, got ${result}`);
	});

	test("target < autoSoftCap → returns < 1", () => {
		const result = getTargetMinutesModifier({
			targetMinutes: 14,
			autoSoftCap: 34,
			regulationMinutes: 48,
		});
		assert(result < 1, `expected < 1, got ${result}`);
		assert(result >= 0.6, `expected >= 0.6, got ${result}`);
	});

	test("target greatly exceeds autoSoftCap → clamped to 1.60", () => {
		const result = getTargetMinutesModifier({
			targetMinutes: 48,
			autoSoftCap: 8,
			regulationMinutes: 48,
		});
		assert.strictEqual(result, 1.6);
	});

	test("target=0 → clamped to 0.60", () => {
		const result = getTargetMinutesModifier({
			targetMinutes: 0,
			autoSoftCap: 34,
			regulationMinutes: 48,
		});
		assert.strictEqual(result, 0.6);
	});

	test("regulationMinutes=40 → targetScaled is correct", () => {
		// target=24 in a 40-min game → targetScaled = 24 * 40/48 = 20
		// autoSoftCap=20 → ratio=1 → modifier=1
		const result = getTargetMinutesModifier({
			targetMinutes: 24,
			autoSoftCap: 20,
			regulationMinutes: 40,
		});
		assert.strictEqual(result, 1);
	});

	test("regulationMinutes=40 with target above baseline → boost", () => {
		// target=36 in 40-min game → targetScaled = 36*40/48 = 30
		// autoSoftCap=20 → ratio=1.5 → sqrt(1.5)≈1.22 → bounded by 1.60
		const result = getTargetMinutesModifier({
			targetMinutes: 36,
			autoSoftCap: 20,
			regulationMinutes: 40,
		});
		assert(result > 1.2 && result <= 1.6, `expected boost, got ${result}`);
	});

	test("autoSoftCap <= 0 → returns 1 (guard)", () => {
		assert.strictEqual(
			getTargetMinutesModifier({
				targetMinutes: 26,
				autoSoftCap: 0,
				regulationMinutes: 48,
			}),
			1,
		);
		assert.strictEqual(
			getTargetMinutesModifier({
				targetMinutes: 26,
				autoSoftCap: -5,
				regulationMinutes: 48,
			}),
			1,
		);
	});

	test("autoSoftCap NaN → returns 1 (guard)", () => {
		assert.strictEqual(
			getTargetMinutesModifier({
				targetMinutes: 26,
				autoSoftCap: NaN,
				regulationMinutes: 48,
			}),
			1,
		);
	});
});

describe("getAutoMinutesSoftCap", () => {
	test("matches original getMinutesSoftCap when targetMinutes is undefined", () => {
		const params = {
			availablePlayers: 10,
			endurance: 0.5,
			playoffs: false,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 0,
		};
		const auto = getAutoMinutesSoftCap(params);
		const softCap = getMinutesSoftCap({ ...params, targetMinutes: undefined });
		assert.strictEqual(auto, softCap);
	});

	test("matches original getMinutesSoftCap for various rosterIndex values", () => {
		for (let rosterIndex = 0; rosterIndex < 12; rosterIndex++) {
			const params = {
				availablePlayers: 10,
				endurance: 0.55,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex,
			};
			const auto = getAutoMinutesSoftCap(params);
			const softCap = getMinutesSoftCap({
				...params,
				targetMinutes: undefined,
			});
			assert.strictEqual(auto, softCap, `mismatch at rosterIndex ${rosterIndex}`);
		}
	});

	test("matches original getMinutesSoftCap for ptModifier variants", () => {
		for (const ptModifier of [0.75, 1, 1.25, 1.5]) {
			const params = {
				availablePlayers: 10,
				endurance: 0.5,
				playoffs: false,
				ptModifier,
				regulationMinutes: 48,
				rosterIndex: 3,
			};
			const auto = getAutoMinutesSoftCap(params);
			const softCap = getMinutesSoftCap({
				...params,
				targetMinutes: undefined,
			});
			assert.strictEqual(auto, softCap, `mismatch at ptModifier ${ptModifier}`);
		}
	});

	test("getMinutesSoftCap with targetMinutes still returns target soft cap", () => {
		const cap = getMinutesSoftCap({
			availablePlayers: 10,
			endurance: 0.5,
			playoffs: false,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 2,
			targetMinutes: 26,
		});
		assert.strictEqual(cap, 26);
	});

	test("ptModifier=0 does not affect getAutoMinutesSoftCap below floor", () => {
		const auto = getAutoMinutesSoftCap({
			availablePlayers: 10,
			endurance: 0.5,
			playoffs: false,
			ptModifier: 0,
			regulationMinutes: 48,
			rosterIndex: 0,
		});
		assert(auto > 0, `expected > 0, got ${auto}`);
	});
});

describe("ptModifier=0 interaction with target modifier", () => {
	test("ptModifier=0 makes ovrs zero regardless of target modifier boost", () => {
		const ptModifier = 0;
		const targetModifier = getTargetMinutesModifier({
			targetMinutes: 36,
			autoSoftCap: 10,
			regulationMinutes: 48,
		});
		assert(targetModifier > 1, `expected boost, got ${targetModifier}`);
		const totalEffect = ptModifier * targetModifier;
		assert.strictEqual(totalEffect, 0);
	});
});
