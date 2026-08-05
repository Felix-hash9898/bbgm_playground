import { assert, test } from "vitest";
import getBasketballPermanentInjuryRatingLoss, {
	basketballPermanentInjuryRollout,
} from "./getBasketballPermanentInjuryRatingLoss.ts";

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
	injuryType: string,
	random: () => number,
	overrides?: Partial<{
		isReaggravation: boolean;
		ratingsLocked: boolean;
	}>,
) =>
	getBasketballPermanentInjuryRatingLoss({
		injuryType,
		isReaggravation: false,
		ratingsLocked: false,
		random,
		...overrides,
	});

test("rollout boundary covers exactly the 29 studied basketball injuries", () => {
	assert.equal(basketballPermanentInjuryRollout.size, 29);
	for (const name of [
		"Sprained Ankle",
		"Knee Soreness",
		"Strained Hamstring",
		"Strained Calf",
		"Ankle Soreness",
		"Strained Groin",
		"Foot Soreness",
		"Hip Soreness",
		"Bruised Knee",
		"Sprained Knee",
		"Achilles Soreness",
		"Bruised Hip",
		"Bruised Quadriceps",
		"Patellar Tendinitis",
		"Sprained Toe",
		"Sprained Foot",
		"Bruised Leg",
		"Plantar Fasciitis",
		"Bruised Foot",
		"Quadriceps Soreness",
		"Strained Quadriceps",
		"Torn ACL",
		"Fractured Ankle",
		"Fractured Foot",
		"Toe Soreness",
		"Torn Meniscus",
		"Torn Achilles Tendon",
		"Ankle Contusion",
		"Fractured Toe",
	]) {
		assert.isTrue(basketballPermanentInjuryRollout.has(name));
	}
});

test("unstudied upper-body, torso, and custom injuries are not in the rollout boundary", () => {
	for (const name of [
		"Fractured Hand",
		"Herniated Disc",
		"Concussion",
		"Sprained Wrist",
		"Back Soreness",
		"Shoulder Soreness",
		"Custom Lower Body Injury",
	]) {
		assert.isFalse(basketballPermanentInjuryRollout.has(name));
	}
});

test("every studied injury is decided by the new mechanism, with no loss for the 25 without profiles", () => {
	const profiled = new Set([
		"Torn Achilles Tendon",
		"Torn ACL",
		"Torn Meniscus",
		"Fractured Ankle",
	]);
	for (const name of basketballPermanentInjuryRollout) {
		if (profiled.has(name)) {
			assert.isDefined(getLoss(name, sequence(0, 0, 0, 0)));
		} else {
			assert.isUndefined(getLoss(name, sequence(0)));
		}
	}
});

test("uses the configured probability boundary for every profile", () => {
	assert.isUndefined(getLoss("Torn Achilles Tendon", sequence(0.65)));
	assert.deepStrictEqual(
		getLoss("Torn Achilles Tendon", sequence(0.649999, 0, 0, 0)),
		{
			spd: 3,
			jmp: 3,
			endu: 1,
		},
	);
	assert.isUndefined(getLoss("Torn ACL", sequence(0.25)));
	assert.deepStrictEqual(getLoss("Torn ACL", sequence(0.249999, 0, 0, 0)), {
		spd: 3,
		jmp: 3,
		endu: 1,
	});
	assert.isUndefined(getLoss("Torn Meniscus", sequence(0.075)));
	assert.deepStrictEqual(getLoss("Torn Meniscus", sequence(0.074999, 0)), {
		jmp: 1,
	});
	assert.isUndefined(getLoss("Fractured Ankle", sequence(0.05)));
	assert.deepStrictEqual(
		getLoss("Fractured Ankle", sequence(0.049999, 0, 0, 0)),
		{
			spd: 1,
			jmp: 1,
		},
	);
});

test("returns minimum and maximum losses for Achilles and ACL", () => {
	assert.deepStrictEqual(
		getLoss("Torn Achilles Tendon", sequence(0, 0, 0, 0)),
		{
			spd: 3,
			jmp: 3,
			endu: 1,
		},
	);
	assert.deepStrictEqual(
		getLoss("Torn Achilles Tendon", sequence(0, 0.999999, 0.999999, 0.999999)),
		{
			spd: 10,
			jmp: 11,
			endu: 9,
		},
	);
	assert.deepStrictEqual(getLoss("Torn ACL", sequence(0, 0, 0, 0)), {
		spd: 3,
		jmp: 3,
		endu: 1,
	});
	assert.deepStrictEqual(
		getLoss("Torn ACL", sequence(0, 0.999999, 0.999999, 0.999999)),
		{
			spd: 10,
			jmp: 12,
			endu: 6,
		},
	);
});

test("Meniscus only lowers jumping", () => {
	assert.deepStrictEqual(getLoss("Torn Meniscus", sequence(0, 0)), {
		jmp: 1,
	});
	assert.deepStrictEqual(getLoss("Torn Meniscus", sequence(0, 0.999999)), {
		jmp: 3,
	});
});

test("Fractured Ankle allows zero endurance loss but always has an effective loss", () => {
	assert.deepStrictEqual(getLoss("Fractured Ankle", sequence(0, 0, 0, 0)), {
		spd: 1,
		jmp: 1,
	});
	assert.deepStrictEqual(
		getLoss("Fractured Ankle", sequence(0, 0.999999, 0.999999, 0.999999)),
		{
			spd: 2,
			jmp: 2,
			endu: 1,
		},
	);
});

test("does not affect unknown injuries, reaggravations, or locked ratings", () => {
	assert.isUndefined(getLoss("Custom Lower Body Injury", sequence(0)));
	assert.isUndefined(
		getLoss("Torn Achilles Tendon", throwIfCalled, {
			isReaggravation: true,
		}),
	);
	assert.isUndefined(
		getLoss("Torn Achilles Tendon", throwIfCalled, {
			ratingsLocked: true,
		}),
	);
});
