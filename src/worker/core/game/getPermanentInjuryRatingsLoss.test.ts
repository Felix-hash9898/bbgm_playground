import { assert, test } from "vitest";
import { getPermanentInjuryRatingsLoss } from "./writePlayerStats.ts";

const sequence = (...values: number[]) => {
	let index = 0;
	return () => {
		const value = values[index];
		if (value === undefined) {
			throw new Error("Random sequence exhausted");
		}
		index += 1;
		return value;
	};
};

const throwIfCalled = () => {
	throw new Error("RNG should not be consumed");
};

const getLoss = (
	isBasketball: boolean,
	injuryType: string,
	overrides?: Partial<{
		isReaggravation: boolean;
		ratingsLocked: boolean;
		gamesRemaining: number;
		randomUniform: () => number;
		randomInt: (a: number, b: number) => number;
	}>,
) =>
	getPermanentInjuryRatingsLoss({
		isBasketball,
		injuryType,
		isReaggravation: false,
		ratingsLocked: false,
		gamesRemaining: 82,
		randomInt: throwIfCalled,
		...overrides,
	});

test("studied zero-profile injuries produce no loss and never fall through to the legacy duration route", () => {
	// gamesRemaining 82 and probability roll 0 would trigger the legacy route,
	// so a defined result here would prove an illegal fallthrough.
	assert.isUndefined(
		getLoss(true, "Sprained Ankle", { randomUniform: sequence(0) }),
	);
	assert.isUndefined(
		getLoss(true, "Fractured Foot", { randomUniform: sequence(0) }),
	);
});

test("unstudied basketball injuries use the legacy duration route", () => {
	for (const injuryType of [
		"Fractured Hand",
		"Herniated Disc",
		"Custom Injury",
	]) {
		assert.deepStrictEqual(
			getLoss(true, injuryType, {
				randomUniform: sequence(0),
				randomInt: () => 7,
			}),
			[
				["spd", 7],
				["endu", 7],
				["jmp", 7],
			],
		);
	}
});

test("profiled studied injuries use the new mechanism, never legacy RNG", () => {
	assert.deepStrictEqual(
		getLoss(true, "Torn Achilles Tendon", {
			randomUniform: sequence(0, 0, 0, 0),
		}),
		[
			["spd", 3],
			["jmp", 3],
			["endu", 1],
		],
	);
});

test("reaggravation and locked ratings short-circuit before any RNG", () => {
	assert.isUndefined(
		getLoss(true, "Torn Achilles Tendon", {
			isReaggravation: true,
			randomUniform: throwIfCalled,
		}),
	);
	assert.isUndefined(
		getLoss(true, "Torn Achilles Tendon", {
			ratingsLocked: true,
			randomUniform: throwIfCalled,
		}),
	);
});

test("legacy duration route keeps its original duration threshold and probability", () => {
	assert.isUndefined(
		getLoss(true, "Fractured Hand", {
			gamesRemaining: 20,
			randomUniform: sequence(0),
			randomInt: () => 7,
		}),
	);
	assert.isUndefined(
		getLoss(true, "Fractured Hand", {
			gamesRemaining: 82,
			randomUniform: sequence(1),
			randomInt: () => 7,
		}),
	);
});

test("legacy duration route preserves reduced-impact max 10 and max 20", () => {
	const ints: Array<[number, number]> = [];
	const captureInt = (a: number, b: number) => {
		ints.push([a, b]);
		return 1;
	};

	getLoss(true, "Fractured Hand", {
		randomUniform: sequence(0),
		randomInt: captureInt,
	});
	assert.deepStrictEqual(ints, [
		[1, 20],
		[1, 20],
		[1, 20],
	]);

	ints.length = 0;
	getLoss(true, "Torn MCL", {
		randomUniform: sequence(0),
		randomInt: captureInt,
	});
	assert.deepStrictEqual(ints, [
		[1, 10],
		[1, 10],
		[1, 10],
	]);
});

test("legacy duration route keeps its no-rating-drop exclusions and locked protection", () => {
	assert.isUndefined(
		getLoss(false, "Torn Meniscus", {
			randomUniform: sequence(0),
			randomInt: () => 7,
		}),
	);
	assert.isUndefined(
		getLoss(false, "Fractured Foot", {
			randomUniform: sequence(0),
			randomInt: () => 7,
		}),
	);
	assert.isUndefined(
		getLoss(false, "Fractured Hand", {
			ratingsLocked: true,
			randomUniform: sequence(0),
			randomInt: () => 7,
		}),
	);
});
