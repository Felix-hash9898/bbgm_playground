import { assert, describe, test } from "vitest";
import getMinutesLimitFactor, {
	getMinutesSoftCap,
} from "./getMinutesLimitFactor.ts";

describe("getMinutesLimitFactor", () => {
	test("does not penalize starters before their soft cap", () => {
		const softCap = getMinutesSoftCap({
			availablePlayers: 10,
			endurance: 0.55,
			playoffs: false,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 0,
		});

		assert(softCap > 34);
		assert.strictEqual(
			getMinutesLimitFactor({
				availablePlayers: 10,
				endurance: 0.55,
				lateGame: false,
				minutes: softCap - 0.25,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 0,
			}),
			1,
		);
	});

	test("penalizes overloaded regular-season minutes more than playoff minutes", () => {
		const regular = getMinutesLimitFactor({
			availablePlayers: 10,
			endurance: 0.5,
			lateGame: false,
			minutes: 41,
			playoffs: false,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 0,
		});
		const playoffs = getMinutesLimitFactor({
			availablePlayers: 10,
			endurance: 0.5,
			lateGame: false,
			minutes: 41,
			playoffs: true,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 0,
		});

		assert(regular < 1);
		assert(playoffs > regular);
	});

	test("loosens the cap for short-handed teams and explicit playing-time boosts", () => {
		const capped = getMinutesLimitFactor({
			availablePlayers: 10,
			endurance: 0.5,
			lateGame: false,
			minutes: 38,
			playoffs: false,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 5,
		});
		const shortHanded = getMinutesLimitFactor({
			availablePlayers: 7,
			endurance: 0.5,
			lateGame: false,
			minutes: 38,
			playoffs: false,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 5,
		});
		const boosted = getMinutesLimitFactor({
			availablePlayers: 10,
			endurance: 0.5,
			lateGame: false,
			minutes: 38,
			playoffs: false,
			ptModifier: 1.5,
			regulationMinutes: 48,
			rosterIndex: 5,
		});

		assert(shortHanded > capped);
		assert(boosted > capped);
	});

	test("keeps some late-game flexibility instead of hard-capping stars", () => {
		const regular = getMinutesLimitFactor({
			availablePlayers: 10,
			endurance: 0.5,
			lateGame: false,
			minutes: 42,
			playoffs: false,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 0,
		});
		const lateGame = getMinutesLimitFactor({
			availablePlayers: 10,
			endurance: 0.5,
			lateGame: true,
			minutes: 42,
			playoffs: false,
			ptModifier: 1,
			regulationMinutes: 48,
			rosterIndex: 0,
		});

		assert(lateGame > regular);
		assert(lateGame > 0.55);
	});

	describe("targetMinutes support", () => {
		test("targetMinutes undefined behaves identical to original softCap", () => {
			const originalCap = getMinutesSoftCap({
				availablePlayers: 10,
				endurance: 0.5,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 2,
			});
			const capWithUndefined = getMinutesSoftCap({
				availablePlayers: 10,
				endurance: 0.5,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 2,
				targetMinutes: undefined,
			});

			assert.strictEqual(capWithUndefined, originalCap);
		});

		test("targetMinutes=26 produces softCap of 26 in a 48 min game", () => {
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

		test("targetMinutes scales with regulationMinutes", () => {
			const cap40 = getMinutesSoftCap({
				availablePlayers: 10,
				endurance: 0.5,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 40,
				rosterIndex: 2,
				targetMinutes: 26,
			});

			// 26 * 40 / 48 = 21.666666666666668
			assert.strictEqual(cap40, (26 * 40) / 48);
		});

		test("targetMinutes acts as a soft cap (penalty when exceeded)", () => {
			const underTargetFactor = getMinutesLimitFactor({
				availablePlayers: 10,
				endurance: 0.5,
				lateGame: false,
				minutes: 25,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 2,
				targetMinutes: 26,
			});
			const overTargetFactor = getMinutesLimitFactor({
				availablePlayers: 10,
				endurance: 0.5,
				lateGame: false,
				minutes: 30,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 2,
				targetMinutes: 26,
			});

			assert.strictEqual(underTargetFactor, 1);
			assert(overTargetFactor < 1);
		});

		test("lateGame relaxes penalty even when targetMinutes is set", () => {
			const regularOverTarget = getMinutesLimitFactor({
				availablePlayers: 10,
				endurance: 0.5,
				lateGame: false,
				minutes: 32,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 2,
				targetMinutes: 26,
			});
			const lateGameOverTarget = getMinutesLimitFactor({
				availablePlayers: 10,
				endurance: 0.5,
				lateGame: true,
				minutes: 32,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 2,
				targetMinutes: 26,
			});

			assert(lateGameOverTarget > regularOverTarget);
		});

		test("targetMinutes=0 sets softCap to 0 and penalizes excess minutes, but does not hard-prevent starting", () => {
			const capZero = getMinutesSoftCap({
				availablePlayers: 10,
				endurance: 0.5,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 0,
				targetMinutes: 0,
			});
			const factorZero = getMinutesLimitFactor({
				availablePlayers: 10,
				endurance: 0.5,
				lateGame: false,
				minutes: 5,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 0,
				targetMinutes: 0,
			});

			assert.strictEqual(capZero, 0);
			assert(factorZero < 1);
			assert(factorZero >= 0.35);
		});

		test("targetMinutes=60 is clamped to max regulation soft cap in getMinutesSoftCap", () => {
			const capSixty = getMinutesSoftCap({
				availablePlayers: 10,
				endurance: 0.5,
				playoffs: false,
				ptModifier: 1,
				regulationMinutes: 48,
				rosterIndex: 0,
				targetMinutes: 60,
			});

			// 48 * 0.86 = 41.28
			assert.strictEqual(capSixty, 48 * 0.86);
		});
	});
});
