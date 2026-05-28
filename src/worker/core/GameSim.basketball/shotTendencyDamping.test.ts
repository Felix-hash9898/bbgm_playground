import { assert, describe, test } from "vitest";
import { getShotTendencyEffect } from "../../../common/shotTendencies.basketball.ts";
import GameSim from "./index.ts";

const makePlayer = ({
	atRimTendency,
	lowPostTendency,
	threePointTendency,
	usage = 0.2,
	shootingThreePointer = 0.45,
}: {
	atRimTendency?: number;
	lowPostTendency?: number;
	threePointTendency?: number;
	usage?: number;
	shootingThreePointer?: number;
} = {}) => ({
	compositeRating: {
		shootingThreePointer,
		usage,
	},
	atRimTendency,
	lowPostTendency,
	threePointTendency,
});

const makeSim = (players: ReturnType<typeof makePlayer>[]) => {
	const sim = Object.create(GameSim.prototype) as GameSim & {
		o: 0;
		playersOnCourt: any;
	};
	sim.o = 0;
	sim.playersOnCourt = [players, []];
	return sim;
};

describe("paint congestion damping", () => {
	test("is a strict no-op for default shot tendencies", () => {
		const sim = makeSim([
			makePlayer(),
			makePlayer(),
			makePlayer(),
			makePlayer(),
			makePlayer(),
		]);

		assert.strictEqual(sim.getLineupPaintPressure(), 0);
		assert.strictEqual(sim.getPaintDamping(), 1);
		assert.strictEqual(getShotTendencyEffect(undefined), 1);
		assert.strictEqual(sim.getAdjustedPaintTendencyEffect(1, 0.4), 1);
		assert.strictEqual(
			sim.getAdjustedPaintTendencyEffect(getShotTendencyEffect(undefined), 1),
			1,
		);
	});

	test("does not pull sub-neutral rim or post effects back toward 1", () => {
		const sim = makeSim([makePlayer()]);

		assert.strictEqual(sim.getAdjustedPaintTendencyEffect(0.86, 0.4), 0.86);
		assert.strictEqual(sim.getAdjustedPaintTendencyEffect(1, 0.4), 1);
		assert.strictEqual(sim.getAdjustedPaintTendencyEffect(0.93, 0.9), 0.93);
	});

	test("keeps paint damping near 1 for one slasher surrounded by shooting", () => {
		const slasher = makePlayer({
			atRimTendency: 1.36,
			lowPostTendency: 0.9,
			threePointTendency: 0.82,
			usage: 0.24,
			shootingThreePointer: 0.28,
		});
		const shooter = makePlayer({
			shootingThreePointer: 0.78,
		});
		const sim = makeSim([slasher, shooter, shooter, shooter, shooter]);

		assert(sim.getLineupSpacingGravity() > 0.65);
		assert(sim.getLineupPaintPressure() > 0);
		assert(sim.getPaintDamping() > 0.95);
	});

	test("applies much stronger damping to paint-heavy lineups with weak spacing", () => {
		const slasher = makePlayer({
			atRimTendency: 1.36,
			lowPostTendency: 0.9,
			threePointTendency: 0.82,
			usage: 0.24,
			shootingThreePointer: 0.28,
		});
		const sim = makeSim([slasher, slasher, slasher, slasher, slasher]);

		assert(sim.getLineupSpacingGravity() < 0.35);
		assert(sim.getLineupPaintPressure() > 0.12);
		assert(sim.getPaintDamping() < 0.85);

		const personalEffect = getShotTendencyEffect(1.36);
		const adjustedEffect = sim.getAdjustedPaintTendencyEffect(
			personalEffect,
			sim.getPaintDamping(),
		);
		assert(adjustedEffect > 1);
		assert(adjustedEffect < personalEffect);
	});

	test("dampens post-up boosts for cramped lineups without flipping them below neutral", () => {
		const postScorer = makePlayer({
			atRimTendency: 1.08,
			lowPostTendency: 1.42,
			threePointTendency: 0.74,
			usage: 0.22,
			shootingThreePointer: 0.2,
		});
		const poorSpacer = makePlayer({
			threePointTendency: 0.82,
			usage: 0.18,
			shootingThreePointer: 0.18,
		});
		const sim = makeSim([
			postScorer,
			postScorer,
			poorSpacer,
			poorSpacer,
			poorSpacer,
		]);

		assert(sim.getLineupSpacingGravity() < 0.25);
		assert(sim.getPaintDamping() < 0.9);

		const personalLowPostEffect = getShotTendencyEffect(1.42);
		const adjustedLowPostEffect = sim.getAdjustedPaintTendencyEffect(
			personalLowPostEffect,
			sim.getPaintDamping(),
		);
		assert(adjustedLowPostEffect > 1);
		assert(adjustedLowPostEffect < personalLowPostEffect);
	});

	test("leaves five spacers with no paint penalty", () => {
		const spacer = makePlayer({
			atRimTendency: 0.95,
			lowPostTendency: 0.72,
			threePointTendency: 1.38,
			shootingThreePointer: 0.72,
		});
		const sim = makeSim([spacer, spacer, spacer, spacer, spacer]);

		assert(sim.getLineupSpacingGravity() > 0.7);
		assert.strictEqual(sim.getLineupPaintPressure(), 0);
		assert.strictEqual(sim.getPaintDamping(), 1);
	});
});
