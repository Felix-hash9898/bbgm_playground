import { assert, beforeEach, describe, it } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import { g } from "../../util/index.ts";
import {
	BASKETBALL_MECHANISM_MAX_YEARS,
	getBasketballContractScore,
	getBasketballContractTerm,
	getBasketballContractYears,
	getBasketballMechanismMaxContractLength,
	getContractExpirationForYears,
	getContractYearsFromExpiration,
} from "./contractTerm.ts";

const makePlayer = ({
	age = 27,
	ovr = 60,
	pot = ovr,
	tid = 0,
}: {
	age?: number;
	ovr?: number;
	pot?: number;
	tid?: number;
} = {}) => ({
	born: { year: g.get("season") - age, loc: "USA" },
	ratings: [{ ovr, pot, season: g.get("season") }],
	tid,
});

describe("contractTerm - S1 delayed-upper-clamp strong", () => {
	beforeEach(() => {
		resetG();
		g.setWithoutSavingToDB("season", 2026);
		g.setWithoutSavingToDB("minContractLength", 1);
		g.setWithoutSavingToDB("maxContractLength", 5);
	});

	it("mechanism legal maxes are exactly Bird 5, Cap 4, MLE 4, Min 2", () => {
		assert.strictEqual(BASKETBALL_MECHANISM_MAX_YEARS.bird, 5);
		assert.strictEqual(BASKETBALL_MECHANISM_MAX_YEARS.capSpace, 4);
		assert.strictEqual(BASKETBALL_MECHANISM_MAX_YEARS.midLevel, 4);
		assert.strictEqual(BASKETBALL_MECHANISM_MAX_YEARS.minimum, 2);

		assert.strictEqual(getBasketballMechanismMaxContractLength("bird", 5), 5);
		assert.strictEqual(getBasketballMechanismMaxContractLength("bird", 3), 3);
		assert.strictEqual(
			getBasketballMechanismMaxContractLength("capSpace", 5),
			4,
		);
		assert.strictEqual(
			getBasketballMechanismMaxContractLength("midLevel", 5),
			4,
		);
		assert.strictEqual(
			getBasketballMechanismMaxContractLength("minimum", 5),
			2,
		);
	});

	it("score calculation matches S1 formula precisely", () => {
		// OVR 70, POT 70, age 25: rawAbility = (70-40)/30 = 1.0, score = 1.0
		const youngStar = makePlayer({ age: 25, ovr: 70 });
		assert.strictEqual(getBasketballContractScore(youngStar), 1.0);

		// OVR 40, POT 40, age 25: rawAbility = 0, score = 0
		const youngFringe = makePlayer({ age: 25, ovr: 40 });
		assert.strictEqual(getBasketballContractScore(youngFringe), 0.0);

		// Age penalty kicks in after age 29 (-0.075/yr) and accelerates after 34 (-0.050/yr)
		// OVR 70, POT 70, age 32: score = 1.0 - 0.075 * 3 = 0.775
		const veteran32 = makePlayer({ age: 32, ovr: 70 });
		assert.closeTo(getBasketballContractScore(veteran32), 0.775, 1e-6);

		// OVR 70, POT 70, age 36: score = 1.0 - 0.075 * 7 - 0.05 * 2 = 1.0 - 0.525 - 0.10 = 0.375
		const veteran36 = makePlayer({ age: 36, ovr: 70 });
		assert.closeTo(getBasketballContractScore(veteran36), 0.375, 1e-6);

		// POT bonus: +0.015 * (pot - ovr)
		const youngProspect = makePlayer({ age: 21, ovr: 50, pot: 70 });
		// rawAbility = (50-40)/30 = 0.333333, pot bonus = 0.015 * 20 = 0.30 -> score = 0.633333
		assert.closeTo(
			getBasketballContractScore(youngProspect),
			10 / 30 + 0.3,
			1e-6,
		);
	});

	it("deterministic rounding with no fuzziness or random terms", () => {
		const p = makePlayer({ age: 30, ovr: 68 });
		const term1 = getBasketballContractYears(p, { mechanism: "bird" });
		const term2 = getBasketballContractYears(p, { mechanism: "bird" });
		const term3 = getBasketballContractYears(p, { mechanism: "bird" });
		assert.strictEqual(term1, term2);
		assert.strictEqual(term2, term3);
	});

	it("respects mechanism maximums: Bird 5, Cap Space 4, MLE 4, Minimum 2", () => {
		const superstar = makePlayer({ age: 25, ovr: 80 });
		assert.strictEqual(
			getBasketballContractYears(superstar, { mechanism: "bird" }),
			5,
		);
		assert.strictEqual(
			getBasketballContractYears(superstar, { mechanism: "capSpace" }),
			4,
		);
		assert.strictEqual(
			getBasketballContractYears(superstar, { mechanism: "midLevel" }),
			4,
		);
		assert.strictEqual(
			getBasketballContractYears(superstar, { mechanism: "minimum" }),
			2,
		);
	});

	it("no hard age ceilings: high OVR veterans get longer deals than low OVR peers", () => {
		const oldStar = makePlayer({ age: 35, ovr: 75 });
		const oldRole = makePlayer({ age: 35, ovr: 50 });
		assert(
			getBasketballContractYears(oldStar, { mechanism: "bird" })! >
				getBasketballContractYears(oldRole, { mechanism: "bird" })!,
		);
	});

	it("honors custom minContractLength and maxContractLength league settings", () => {
		g.setWithoutSavingToDB("minContractLength", 2);
		g.setWithoutSavingToDB("maxContractLength", 3);
		const superstar = makePlayer({ age: 25, ovr: 80 });
		assert.strictEqual(
			getBasketballContractYears(superstar, { mechanism: "bird" }),
			3,
		);

		const scrub = makePlayer({ age: 35, ovr: 40 });
		assert.strictEqual(
			getBasketballContractYears(scrub, { mechanism: "bird" }),
			2,
		);
	});

	it("returns null when minContractLength exceeds mechanism legal max (mechanism unavailable)", () => {
		// minContractLength=3 > minimum mechanism max (2): mechanism unavailable
		g.setWithoutSavingToDB("minContractLength", 3);
		g.setWithoutSavingToDB("maxContractLength", 5);
		const player = makePlayer({ age: 25, ovr: 75 });
		assert.strictEqual(
			getBasketballContractYears(player, { mechanism: "minimum" }),
			null,
			"minimum mechanism unavailable when minContractLength=3 > max 2",
		);
		// Bird (max 5) should still work
		assert(
			getBasketballContractYears(player, { mechanism: "bird" }) !== null,
			"bird should be available when minContractLength=3",
		);
		// capSpace (max 4) should still work
		assert(
			getBasketballContractYears(player, { mechanism: "capSpace" }) !== null,
			"capSpace should be available when minContractLength=3",
		);

		// minContractLength=5 > capSpace max (4): both capSpace and MLE unavailable
		g.setWithoutSavingToDB("minContractLength", 5);
		assert.strictEqual(
			getBasketballContractYears(player, { mechanism: "capSpace" }),
			null,
			"capSpace unavailable when minContractLength=5",
		);
		assert.strictEqual(
			getBasketballContractYears(player, { mechanism: "midLevel" }),
			null,
			"midLevel unavailable when minContractLength=5",
		);
		// Bird can still be 5 if configured max >= 5
		assert.strictEqual(
			getBasketballContractYears(player, { mechanism: "bird" }),
			5,
			"bird can be 5 years when minContractLength=5 and max=5",
		);
	});

	it("getBasketballContractTerm propagates null for unavailable mechanisms", () => {
		g.setWithoutSavingToDB("minContractLength", 3);
		g.setWithoutSavingToDB("maxContractLength", 5);
		const player = makePlayer({ age: 25, ovr: 75 });
		assert.strictEqual(
			getBasketballContractTerm(player, { mechanism: "minimum" }),
			null,
			"term propagates null for unavailable minimum mechanism",
		);
		assert(
			getBasketballContractTerm(player, { mechanism: "bird" }) !== null,
			"term returns non-null for available bird mechanism",
		);
	});

	it("bidirectional expiration conversion maintains exact term", () => {
		for (const years of [1, 2, 3, 4, 5]) {
			const expiration = getContractExpirationForYears({ years });
			const roundTripYears = getContractYearsFromExpiration({ expiration });
			assert.strictEqual(roundTripYears, years);
		}
	});
});
