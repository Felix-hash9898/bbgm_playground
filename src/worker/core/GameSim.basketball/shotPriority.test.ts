import { describe, expect, test } from "vitest";
import {
	getShotPriorityContext,
	getUsageSelectionWeights,
} from "./shotPriority.ts";

const usages = [0.95, 0.72, 0.54, 0.38, 0.03];
const fatigueFactors = [0.98, 0.91, 0.86, 0.8, 0.74];

const makeContext = (biases: number[]) =>
	getShotPriorityContext(
		usages.map((usage, index) => ({
			usage,
			usageBias: biases[index]!,
			fatigueFactor: fatigueFactors[index]!,
		})),
	);

describe("Shot Priority", () => {
	test("common scaling leaves floored shares and downstream inputs unchanged", () => {
		const contexts = [0.85, 1, 1.1, 1.25].map((bias) =>
			makeContext(Array(5).fill(bias)),
		);
		const baseline = contexts[1]!;

		for (const context of contexts) {
			for (let i = 0; i < context.players.length; i++) {
				expect(context.players[i]!.adjustedShare).toBeCloseTo(
					baseline.players[i]!.adjustedShare,
					14,
				);
			}
			expect(context.players.map((p) => p.overload)).toEqual([0, 0, 0, 0, 0]);
			expect(context.players.map((p) => p.relief)).toEqual([0, 0, 0, 0, 0]);
			expect(context.players.map((p) => p.shareRatio)).toEqual([1, 1, 1, 1, 1]);
			expect(context.teamUsageOverload).toBe(0);
			expect(1 + 0.35 * context.teamUsageOverload).toBe(1);
		}
	});

	test("Normal preserves the existing shooter weights and downstream defaults", () => {
		const context = makeContext(Array(5).fill(1));
		const rawShooterWeights = usages.map(
			(usage, index) => (usage * fatigueFactors[index]!) ** 1.25,
		);
		const rawTotal = rawShooterWeights.reduce((sum, weight) => sum + weight, 0);
		const floor = 0.05 * rawTotal;
		const shooterWeights = rawShooterWeights.map((weight) =>
			Math.max(weight, floor),
		);
		const totalShooterWeight = shooterWeights.reduce(
			(sum, weight) => sum + weight,
			0,
		);

		expect(context.adjustedWeights).toEqual(shooterWeights);
		for (let i = 0; i < context.players.length; i++) {
			const playerContext = context.players[i]!;
			expect(playerContext.adjustedShare).toBeCloseTo(
				shooterWeights[i]! / totalShooterWeight,
			);
			expect(playerContext.shareRatio).toBe(1);
			expect(playerContext.overload).toBe(0);
			expect(playerContext.relief).toBe(0);
			expect(usages[i]! * playerContext.shareRatio).toBe(usages[i]);
			expect(
				1 + 0.75 * playerContext.overload - 0.2 * playerContext.relief,
			).toBe(1);
			expect(
				1 - 0.32 * playerContext.overload + 0.08 * playerContext.relief,
			).toBe(1);
			expect(
				1 - 0.2 * playerContext.overload + 0.05 * playerContext.relief,
			).toBe(1);
		}
		expect(1 + 0.35 * context.teamUsageOverload).toBe(1);
	});

	test("context shares exactly match the shared usage selection algorithm", () => {
		const biases = [1.25, 0.85, 1.1, 1, 1.25];
		const inputs = usages.map((usage, index) => ({
			usage,
			usageBias: biases[index]!,
			fatigueFactor: fatigueFactors[index]!,
		}));
		const context = getShotPriorityContext(inputs);
		const baselineSelection = getUsageSelectionWeights(
			inputs.map((input) => ({ ...input, usageBias: 1 })),
		);
		const adjustedSelection = getUsageSelectionWeights(inputs);

		expect(context.baselineWeights).toEqual(baselineSelection.weights);
		expect(context.adjustedWeights).toEqual(adjustedSelection.weights);
		expect(context.players.map((p) => p.baselineShare)).toEqual(
			baselineSelection.shares,
		);
		expect(context.players.map((p) => p.adjustedShare)).toEqual(
			adjustedSelection.shares,
		);
	});

	test("a very low-usage player gets only the small real change while remaining floored", () => {
		const normal = makeContext([1, 1, 1, 1, 1]);
		const featured = makeContext([1, 1, 1, 1, 1.25]);
		const lowUsage = featured.players[4]!;
		const rawAdjustedWeight = (usages[4]! * 1.25 * fatigueFactors[4]!) ** 1.25;

		expect(rawAdjustedWeight).toBeLessThan(featured.adjustedWeights[4]!);
		expect(lowUsage.adjustedShare).toBeGreaterThan(
			normal.players[4]!.adjustedShare,
		);
		expect(lowUsage.shareRatio).toBeLessThan(1.01);
		expect(lowUsage.overload).toBeLessThan(0.01);
	});

	test("overload follows the actual share increase when a player crosses the floor", () => {
		const crossoverUsages = [0.95, 0.72, 0.54, 0.38, 0.2];
		const makeCrossoverContext = (lastBias: number) =>
			getShotPriorityContext(
				crossoverUsages.map((usage, index) => ({
					usage,
					usageBias: index === 4 ? lastBias : 1,
					fatigueFactor: fatigueFactors[index]!,
				})),
			);
		const normal = makeCrossoverContext(1);
		const featured = makeCrossoverContext(1.25);
		const player = featured.players[4]!;
		const rawNormalWeight = (crossoverUsages[4]! * fatigueFactors[4]!) ** 1.25;
		const rawFeaturedWeight =
			(crossoverUsages[4]! * 1.25 * fatigueFactors[4]!) ** 1.25;

		expect(normal.baselineWeights[4]).toBeGreaterThan(rawNormalWeight);
		expect(featured.adjustedWeights[4]).toBeCloseTo(rawFeaturedWeight);
		expect(player.adjustedShare).toBeGreaterThan(player.baselineShare);
		expect(player.overload).toBeGreaterThan(0.09);
		expect(crossoverUsages[4]! * player.shareRatio).toBeGreaterThan(
			crossoverUsages[4]!,
		);
	});

	test("lowering teammates further charges a featured star for added concentration", () => {
		const featuredWithNormal = makeContext([1.25, 1, 1, 1, 1]);
		const featuredWithLow = makeContext([1.25, 0.85, 0.85, 0.85, 0.85]);
		const starA = featuredWithNormal.players[0]!;
		const starB = featuredWithLow.players[0]!;

		expect(starB.adjustedShare).toBeGreaterThan(starA.adjustedShare);
		expect(starB.relativeIncrease).toBeGreaterThan(starA.relativeIncrease);
		expect(featuredWithLow.teamUsageOverload).toBeGreaterThan(
			featuredWithNormal.teamUsageOverload,
		);
		expect(usages[0]! * starB.shareRatio).toBeGreaterThan(
			usages[0]! * starA.shareRatio,
		);
	});

	test("has safe fallbacks for empty, zero, and non-finite inputs", () => {
		expect(getUsageSelectionWeights([])).toEqual({
			weights: [],
			shares: [],
		});
		const context = getShotPriorityContext(
			Array.from({ length: 5 }, () => ({
				usage: Number.NaN,
				usageBias: Number.POSITIVE_INFINITY,
				fatigueFactor: 0,
			})),
		);

		expect(context.adjustedWeights).toEqual(Array(5).fill(0));
		expect(context.players.map((p) => p.adjustedShare)).toEqual(
			Array(5).fill(0.2),
		);
		expect(context.players.map((p) => p.shareRatio)).toEqual(Array(5).fill(1));
		expect(context.teamUsageOverload).toBe(0);
	});
});
