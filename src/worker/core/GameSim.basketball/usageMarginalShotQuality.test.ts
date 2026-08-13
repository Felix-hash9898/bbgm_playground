import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import GameSim, {
	applyUsageMarginalShotQuality,
	USAGE_MARGINAL_MAKE_PENALTY_2P,
	USAGE_MARGINAL_MAKE_PENALTY_3P,
} from "./index.ts";

beforeEach(() => {
	resetG();
	vi.restoreAllMocks();
});

describe("marginal shot quality", () => {
	test("zero incremental share is an exact no-op", () => {
		const probabilities = {
			probAndOne: 0.2,
			probMake: 0.6,
			probMissAndFoul: 0.3,
		};

		expect(
			applyUsageMarginalShotQuality({
				...probabilities,
				incrementalFraction: 0,
				penalty: USAGE_MARGINAL_MAKE_PENALTY_2P,
			}),
		).toEqual(probabilities);
	});

	test.each([
		[USAGE_MARGINAL_MAKE_PENALTY_2P, 0.25],
		[USAGE_MARGINAL_MAKE_PENALTY_3P, 0.4],
	])(
		"penalty %s preserves unconditional and-one and miss-foul masses",
		(penalty, incrementalFraction) => {
			const original = {
				probAndOne: 0.2,
				probMake: 0.6,
				probMissAndFoul: 0.3,
			};
			const adjusted = applyUsageMarginalShotQuality({
				...original,
				incrementalFraction,
				penalty,
			});

			expect(adjusted.probMake).toBeCloseTo(
				original.probMake - incrementalFraction * penalty,
				14,
			);
			expect(adjusted.probMake * adjusted.probAndOne).toBeCloseTo(
				original.probMake * original.probAndOne,
				14,
			);
			expect((1 - adjusted.probMake) * adjusted.probMissAndFoul).toBeCloseTo(
				(1 - original.probMake) * original.probMissAndFoul,
				14,
			);
		},
	);

	test("bounds pathological requests while retaining valid outcome masses", () => {
		const adjusted = applyUsageMarginalShotQuality({
			probAndOne: 1,
			probMake: 0.02,
			probMissAndFoul: 0.5,
			incrementalFraction: 1,
			penalty: 0.04,
		});

		expect(adjusted.probMake).toBe(0.02);
		expect(adjusted.probAndOne).toBe(1);
		expect(adjusted.probMissAndFoul).toBe(0.5);
	});
});

const makeShotHarness = (incrementalFraction: number) => {
	const sim = Object.create(GameSim.prototype) as GameSim;
	const shooter = {
		compositeRating: {
			drawingFouls: 0.5,
			shootingAtRim: 0.8,
			shootingLowPost: 0.65,
			shootingMidRange: 0.7,
			shootingThreePointer: 0.8,
		},
	} as never;
	Object.assign(sim, {
		allStarGame: false,
		d: 1,
		numPeriods: 4,
		o: 0,
		possessionLength: 10,
		probBlk: () => 0,
		sideOutOfBounds: () => false,
		synergyFactor: 0,
		t: 500,
		team: [
			{ stat: { pts: 0, ptsQtrs: [0] }, synergy: { off: 0, def: 0 } },
			{
				stat: { pts: 0, ptsQtrs: [0] },
				compositeRating: { defense: 0 },
				synergy: { off: 0, def: 0 },
			},
		],
	});
	vi.spyOn(sim, "getPlayerShotPriorityContext").mockReturnValue({
		baselineShare: 0.2,
		adjustedShare: 0.25,
		shareRatio: 1.25,
		excessShare: 0.05,
		incrementalFraction,
	});

	return { shooter, sim };
};

const runWithRandomSequence = (
	sim: GameSim,
	shooter: never,
	values: number[],
) => {
	let index = 0;
	vi.spyOn(Math, "random").mockImplementation(() => values[index++] ?? 0.99);
	return sim.getShotInfo({
		currentFatigue: 1,
		lateGamePutBack: false,
		p: shooter,
		passer: undefined,
		tipInFromOutOfBounds: false,
		putBack: false,
	});
};

describe("GameSim shot integration", () => {
	test("incremental 2P cost changes quality without changing zone choice", () => {
		const normal = makeShotHarness(0);
		const normalInfo = runWithRandomSequence(
			normal.sim,
			normal.shooter,
			[0.99, 0.2, 0.9, 0.1, 0.9],
		);
		vi.restoreAllMocks();
		const overloaded = makeShotHarness(0.25);
		const overloadedInfo = runWithRandomSequence(
			overloaded.sim,
			overloaded.shooter,
			[0.99, 0.2, 0.9, 0.1, 0.9],
		);

		expect(normalInfo.type).toBe("atRim");
		expect(overloadedInfo.type).toBe(normalInfo.type);
		expect(overloadedInfo.fgaLogType).toBe(normalInfo.fgaLogType);
		expect(overloadedInfo.probMake).toBeCloseTo(
			normalInfo.probMake - 0.25 * USAGE_MARGINAL_MAKE_PENALTY_2P,
			14,
		);
		expect(overloadedInfo.probMake * overloadedInfo.probAndOne).toBeCloseTo(
			normalInfo.probMake * normalInfo.probAndOne,
			14,
		);
		expect(
			(1 - overloadedInfo.probMake) * overloadedInfo.probMissAndFoul,
		).toBeCloseTo((1 - normalInfo.probMake) * normalInfo.probMissAndFoul, 14);
	});

	test("incremental 3P cost applies after selection", () => {
		const normal = makeShotHarness(0);
		const normalInfo = runWithRandomSequence(
			normal.sim,
			normal.shooter,
			[0, 0.9],
		);
		vi.restoreAllMocks();
		const overloaded = makeShotHarness(0.4);
		const overloadedInfo = runWithRandomSequence(
			overloaded.sim,
			overloaded.shooter,
			[0, 0.9],
		);

		expect(normalInfo.type).toBe("threePointer");
		expect(overloadedInfo.type).toBe("threePointer");
		expect(overloadedInfo.probMake).toBeCloseTo(
			normalInfo.probMake - 0.4 * USAGE_MARGINAL_MAKE_PENALTY_3P,
			14,
		);
	});

	test("blocked ordinary shots do not receive the quality transform", () => {
		const { shooter, sim } = makeShotHarness(0.5);
		sim.probBlk = () => 1;
		const info = runWithRandomSequence(sim, shooter, [0, 0]);

		expect(info.type).toBe("threePointer");
		expect(info.blocked).toBe(true);
		expect(info.probMake).toBeCloseTo(0.575);
	});
});
