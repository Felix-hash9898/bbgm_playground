import { assert, beforeEach, test } from "vitest";
import { PHASE, PLAYER } from "../../../../common/index.ts";
import type { Player } from "../../../../common/types.ts";
import { resetG } from "../../../../test/helpers.ts";
import { g, helpers } from "../../../util/index.ts";
import { player } from "../../index.ts";
import {
	getBasketballContractMarketDemand,
	getBasketballExpectedBpm,
	getBasketballSalaryCapPercentage,
	getBpmCorrection,
	getBpmReliability,
} from "./index.ts";
import { getRegularSeasonStatsBySeason } from "./seasonStats.ts";
import {
	getBasketballContractYears,
	getContractYearsFromExpiration,
	getBasketballContractTerm,
} from "../contractTerm.ts";
import { getMinContractForPlayer } from "../contractMinimum.ts";
import { getMaxContractForPlayer } from "../contractLimits.ts";
import { getAIContractWithOption } from "../contractOption.ts";
import { getTermAdjustedContractOffer } from "./injuryAdjustment.ts";
import { getContractDemandResults } from "../../freeAgents/contractDemands.ts";
import genContract from "../../player/genContract.ts";

const closeTo = (actual: number, expected: number, epsilon = 0.000001) =>
	assert(
		Math.abs(actual - expected) < epsilon,
		`Expected ${actual} to be close to ${expected}`,
	);

const makePlayer = ({
	age = 27,
	value = 55,
	valueNoPot = value,
	ovr = 55,
	stats = [],
	injury = { type: "Healthy", gamesRemaining: 0 },
}: {
	age?: number;
	value?: number;
	valueNoPot?: number;
	ovr?: number;
	stats?: Record<string, unknown>[];
	injury?: { type: string; gamesRemaining: number };
} = {}) => {
	const p = player.generate(
		PLAYER.FREE_AGENT,
		age,
		g.get("season") - 5,
		true,
		0,
	);
	p.value = value;
	p.valueNoPot = valueNoPot;
	p.ratings.at(-1)!.ovr = ovr;
	p.stats = stats as typeof p.stats;
	p.injury = injury;
	return p;
};

const statsRow = (overrides: Record<string, unknown> = {}) => ({
	season: g.get("season"),
	tid: 0,
	playoffs: false,
	gp: 10,
	min: 200,
	bpm: 1,
	...overrides,
});

const withSeed = <T>(seed: number, callback: () => T) => {
	let state = seed >>> 0;
	const originalRandom = Math.random;
	Math.random = () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
	try {
		return callback();
	} finally {
		Math.random = originalRandom;
	}
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("salaryCap", 150000);
	g.setWithoutSavingToDB("draftPickAutoContract", false);
});

test("continuous salary-cap curve has exact knots, interpolation, and endpoints", () => {
	for (const [value, percentage] of [
		[40, 0.01],
		[45, 0.015],
		[50, 0.03],
		[55, 0.06],
		[60, 0.16],
		[65, 0.26],
		[70, 0.33],
	] as const) {
		closeTo(getBasketballSalaryCapPercentage(value), percentage);
	}
	closeTo(getBasketballSalaryCapPercentage(57.5), 0.11);
	closeTo(getBasketballSalaryCapPercentage(62.5), 0.21);
	closeTo(getBasketballSalaryCapPercentage(10), 0.01);
	closeTo(getBasketballSalaryCapPercentage(90), 0.33);
});

test("BPM correction uses weighted reliability and is bounded to plus or minus 1.6 value", () => {
	assert.strictEqual(getBasketballExpectedBpm(55), -0.66);
	assert.strictEqual(getBpmReliability(600), 0.5);
	assert.strictEqual(getBpmReliability(2400), 1);
	assert.strictEqual(getBpmReliability(-10), 0);

	const season = g.get("season");
	const stats = new Map([
		[season, { bpm: 9.34, bpmMinutes: 1200 }],
		[season - 1, { bpm: 9.34, bpmMinutes: 600 }],
		[season - 2, { bpm: 9.34, bpmMinutes: 2400 }],
	]);
	const result = getBpmCorrection(55, season, stats);
	closeTo(result.weightedResidual, 8.75);
	closeTo(result.boundedResidual, 4);
	closeTo(result.correction, 1.6);
	assert.strictEqual(result.seasons.length, 3);
});

test("regular-season BPM and minutes aggregate traded team stints once", () => {
	const season = g.get("season");
	const p = makePlayer({
		stats: [
			statsRow({ min: 200, gp: 10, bpm: 1 }),
			statsRow({ tid: 1, min: 600, gp: 20, bpm: 3 }),
			statsRow({ tid: PLAYER.TOT, min: 800, gp: 30, bpm: 2.5 }),
			statsRow({ tid: 2, min: 3000, gp: 82, playoffs: true, bpm: 20 }),
			statsRow({ season: season - 1, tid: 3, min: 500, bpm: -1 }),
		],
	});
	const current = getRegularSeasonStatsBySeason(p).get(season)!;
	assert.strictEqual(current.games, 30);
	assert.strictEqual(current.minutes, 800);
	closeTo(current.bpm!, 2.5);
	assert.strictEqual(current.bpmMinutes, 800);
});

test("uses a single stored total row when team stints are absent", () => {
	const season = g.get("season");
	const p = makePlayer({
		stats: [
			statsRow({ tid: PLAYER.TOT, gp: 30, min: 700, bpm: 2 }),
			statsRow({ tid: PLAYER.TOT, gp: 30, min: 700, bpm: 2 }),
		],
	});
	const current = getRegularSeasonStatsBySeason(p).get(season)!;
	assert.strictEqual(current.games, 30);
	assert.strictEqual(current.minutes, 700);
	assert.strictEqual(current.bpm, 2);
});

test("derives BPM from offensive and defensive components when needed", () => {
	const season = g.get("season");
	const p = makePlayer({
		stats: [
			statsRow({ min: 200, bpm: undefined, obpm: 1, dbpm: 1 }),
			statsRow({
				tid: 1,
				min: 600,
				bpm: undefined,
				obpm: 2,
				dbpm: 4,
			}),
		],
	});
	const current = getRegularSeasonStatsBySeason(p).get(season)!;

	assert.strictEqual(current.bpm, 5);
	assert.strictEqual(current.bpmMinutes, 800);
});

test("missing stats contribute no BPM correction and keep the V4 base blend", () => {
	const p = makePlayer({ age: 27, value: 60, valueNoPot: 50, stats: [] });
	const result = getBasketballContractMarketDemand(p, 1);
	assert.strictEqual(result.bpmCorrection, 0);
	assert.strictEqual(result.baseContractValue, 52);
	assert.strictEqual(result.latentValue, 52);
});

test("BPM season weights remain anchored when current-season stats are absent", () => {
	const season = g.get("season");
	const p = makePlayer({
		value: 55,
		valueNoPot: 55,
		stats: [statsRow({ season: season - 1, min: 1200, bpm: 9.34 })],
	});
	const result = getBasketballContractMarketDemand(p, 1);

	assert.strictEqual(result.baseContractValue, 55);
	closeTo(result.weightedBpmResidual, 2.5);
	closeTo(result.bpmCorrection, 1);
});

test("young upside and established-veteran base blends follow frozen V4", () => {
	const young = makePlayer({ age: 24, value: 75, valueNoPot: 55, stats: [] });
	const veteran = makePlayer({ age: 34, value: 70, valueNoPot: 60, stats: [] });
	closeTo(getBasketballContractMarketDemand(young, 1).baseContractValue, 60.6);
	closeTo(
		getBasketballContractMarketDemand(veteran, 1).baseContractValue,
		61.2,
	);
});

test("young-player eligibility uses same-season minutes summed across team stints", () => {
	const p = makePlayer({
		age: 24,
		value: 70,
		valueNoPot: 60,
		stats: [
			statsRow({ tid: 0, gp: 35, min: 800, bpm: undefined }),
			statsRow({ tid: 1, gp: 35, min: 800, bpm: undefined }),
			statsRow({ tid: PLAYER.TOT, gp: 70, min: 1600, bpm: undefined }),
		],
	});
	closeTo(getBasketballContractMarketDemand(p, 1).baseContractValue, 62);
});

test("BPM correction uses current and two prior regular seasons with reliability shrinkage", () => {
	const season = g.get("season");
	const p = makePlayer({
		value: 55,
		valueNoPot: 55,
		stats: [
			statsRow({ season: season - 2, min: 600, bpm: 9.34 }),
			statsRow({ season: season - 1, min: 1200, bpm: 9.34 }),
			statsRow({ season, min: 1200, bpm: 9.34 }),
		],
	});
	const result = getBasketballContractMarketDemand(p, 2);
	const expected = 0.6 * 1 * 10 + 0.25 * 1 * 10 + 0.15 * 0.5 * 10;
	closeTo(result.weightedBpmResidual, expected);
	closeTo(result.bpmCorrection, 1.6);
});

test("remaining unavailability is divided by actual contract horizon", () => {
	const healthy = makePlayer({ value: 55, valueNoPot: 55 });
	const ten = makePlayer({
		value: 55,
		valueNoPot: 55,
		injury: { type: "Knee soreness", gamesRemaining: 10 },
	});
	const forty = makePlayer({
		value: 55,
		valueNoPot: 55,
		injury: { type: "Torn ACL", gamesRemaining: 40 },
	});
	const eighty = makePlayer({
		value: 55,
		valueNoPot: 55,
		injury: { type: "Torn Achilles Tendon", gamesRemaining: 80 },
	});
	const healthyPrice = getBasketballContractMarketDemand(healthy, 1);
	const tenPrice = getBasketballContractMarketDemand(ten, 1);
	const fortyOneYear = getBasketballContractMarketDemand(forty, 1);
	const fortyFourYear = getBasketballContractMarketDemand(forty, 4);
	const eightyOneYear = getBasketballContractMarketDemand(eighty, 1);
	const eightyFourYear = getBasketballContractMarketDemand(eighty, 4);
	const oneYearGameSlots = healthyPrice.contractGames;
	const longInjury = makePlayer({
		value: 55,
		valueNoPot: 55,
		injury: { type: "Torn ACL", gamesRemaining: 150 },
	});
	const veryLongInjury = makePlayer({
		value: 55,
		valueNoPot: 55,
		injury: { type: "Torn ACL", gamesRemaining: 200 },
	});
	const longOneYear = getBasketballContractMarketDemand(longInjury, 1);
	const longTwoYears = getBasketballContractMarketDemand(longInjury, 2);
	const veryLongTwoYears = getBasketballContractMarketDemand(veryLongInjury, 2);
	const veryLongFiveYears = getBasketballContractMarketDemand(
		veryLongInjury,
		5,
	);

	closeTo(healthyPrice.availabilityFactor, 1);
	closeTo(tenPrice.unavailableShare, 10 / oneYearGameSlots);
	closeTo(fortyOneYear.availabilityFactor, 1 - 40 / oneYearGameSlots);
	closeTo(fortyFourYear.availabilityFactor, 1 - 40 / (4 * oneYearGameSlots));
	closeTo(eightyOneYear.availabilityFactor, 1 - 80 / oneYearGameSlots);
	closeTo(eightyFourYear.availabilityFactor, 1 - 80 / (4 * oneYearGameSlots));
	// V4 healthy pricing is preserved: rawAmount is not multiplied by availabilityFactor
	assert.strictEqual(fortyFourYear.rawAmount, fortyOneYear.rawAmount);
	assert.strictEqual(eightyFourYear.rawAmount, eightyOneYear.rawAmount);
	assert.strictEqual(tenPrice.rawAmount, healthyPrice.rawAmount);
	assert.equal(healthyPrice.playoffGamesPerSeason, 30);
	assert.equal(
		healthyPrice.pricedPostseasonGamesPerSeason,
		oneYearGameSlots - 82,
	);
	assert.equal(healthyPrice.pricedPostseasonGamesPerSeason, 7);
	assert.equal(healthyPrice.offseasonHealingGames, 82);
	assert.equal(healthyPrice.contractGames, oneYearGameSlots);

	// Once the season's games are over, BBGM heals another 82 days before the
	// next season. That reduces the remaining missed-game count on longer deals.
	assert.equal(longOneYear.unavailableGames, oneYearGameSlots);
	assert.equal(longTwoYears.unavailableGames, oneYearGameSlots);
	closeTo(longTwoYears.availabilityFactor, 0.5);
	assert.equal(veryLongTwoYears.unavailableGames, oneYearGameSlots + 6);
	closeTo(
		veryLongTwoYears.availabilityFactor,
		1 - (oneYearGameSlots + 6) / (2 * oneYearGameSlots),
	);
	assert.equal(veryLongFiveYears.unavailableGames, oneYearGameSlots + 6);
	closeTo(
		veryLongFiveYears.availabilityFactor,
		1 - (oneYearGameSlots + 6) / (5 * oneYearGameSlots),
	);
});

test("injury pricing credits league-wide playoff opportunity but heals across the full postseason calendar", () => {
	const eighty = makePlayer({
		value: 70,
		valueNoPot: 70,
		injury: { type: "Torn ACL", gamesRemaining: 80 },
	});
	const hundred = makePlayer({
		value: 70,
		valueNoPot: 70,
		injury: { type: "Torn ACL", gamesRemaining: 100 },
	});
	const oneYearEighty = getBasketballContractMarketDemand(eighty, 1);
	const oneYearHundred = getBasketballContractMarketDemand(hundred, 1);
	closeTo(oneYearEighty.availabilityFactor, (2 + 7) / (82 + 7));
	closeTo(oneYearHundred.availabilityFactor, (7 * 12) / 30 / (82 + 7));
	assert(oneYearEighty.availabilityFactor < 32 / 112);
	assert(oneYearHundred.availabilityFactor < 12 / 112);
	const twoYearLong = getBasketballContractMarketDemand(
		makePlayer({
			value: 70,
			valueNoPot: 70,
			injury: { type: "Torn ACL", gamesRemaining: 150 },
		}),
		2,
	);
	closeTo(twoYearLong.availabilityFactor, 0.5);
});

test("negotiation offer amount uses term adjustment for each offered term", () => {
	const injured = makePlayer({
		value: 67,
		valueNoPot: 67,
		ovr: 70,
		injury: { type: "Torn ACL", gamesRemaining: 150 },
	});
	const oneYear = getBasketballContractMarketDemand(injured, 1);
	const fiveYears = getBasketballContractMarketDemand(injured, 5);
	const minimum = getMinContractForPlayer(injured);
	const offer = getTermAdjustedContractOffer({
		baseOfferAmount: oneYear.pointAmount,
		referenceRawAmount: oneYear.rawAmount,
		offeredRawAmount: fiveYears.rawAmount,
		factor: 1.4,
		minimumAmount: minimum,
	});
	const fixedFactorOnly = helpers.roundContract(oneYear.pointAmount * 1.4);

	assert.strictEqual(offer, fixedFactorOnly);
	assert(offer >= minimum);
	closeTo(
		offer,
		Math.max(
			minimum,
			helpers.roundContract(
				(oneYear.pointAmount + fiveYears.rawAmount - oneYear.rawAmount) * 1.4,
			),
		),
	);

	const healthy = makePlayer({ value: 67, valueNoPot: 67, ovr: 70 });
	const healthyOneYear = getBasketballContractMarketDemand(healthy, 1);
	const healthyFiveYears = getBasketballContractMarketDemand(healthy, 5);
	const healthyOffer = getTermAdjustedContractOffer({
		baseOfferAmount: healthyOneYear.pointAmount,
		referenceRawAmount: healthyOneYear.rawAmount,
		offeredRawAmount: healthyFiveYears.rawAmount,
		factor: 1.4,
		minimumAmount: getMinContractForPlayer(healthy),
	});
	closeTo(
		healthyOffer,
		helpers.roundContract(healthyOneYear.pointAmount * 1.4),
	);
});

test("injury name and age add no penalty beyond remaining unavailable games", () => {
	const lowerRatingsAcl = makePlayer({
		age: 34,
		value: 50,
		valueNoPot: 50,
		injury: { type: "Torn ACL", gamesRemaining: 40 },
	});
	const sameRatingsOtherInjury = makePlayer({
		age: 22,
		value: 50,
		valueNoPot: 50,
		injury: { type: "Torn Achilles Tendon", gamesRemaining: 40 },
	});
	const sameRatingsHealthyType = makePlayer({
		age: 34,
		value: 50,
		valueNoPot: 50,
		injury: { type: "Healthy", gamesRemaining: 40 },
	});
	const higherRatings = makePlayer({
		age: 34,
		value: 55,
		valueNoPot: 55,
		injury: { type: "Healthy", gamesRemaining: 40 },
	});
	const a = getBasketballContractMarketDemand(lowerRatingsAcl, 2);
	const b = getBasketballContractMarketDemand(sameRatingsOtherInjury, 2);
	const c = getBasketballContractMarketDemand(sameRatingsHealthyType, 2);
	assert.strictEqual(a.rawAmount, b.rawAmount);
	assert.strictEqual(a.rawAmount, c.rawAmount);
	assert.strictEqual(a.availabilityFactor, b.availabilityFactor);
	assert(
		a.rawAmount < getBasketballContractMarketDemand(higherRatings, 2).rawAmount,
	);
});

test("legal minimum and dynamic maximum clamp the continuous market price", () => {
	g.setWithoutSavingToDB("salaryCap", 10000);
	const low = makePlayer({ value: 0, valueNoPot: 0 });
	const lowPrice = getBasketballContractMarketDemand(low, 1);
	assert.strictEqual(lowPrice.pointAmount, getMinContractForPlayer(low));

	g.setWithoutSavingToDB("salaryCap", 150000);
	const high = makePlayer({ value: 100, valueNoPot: 100 });
	const highPrice = getBasketballContractMarketDemand(high, 1);
	assert.strictEqual(highPrice.pointAmount, getMaxContractForPlayer(high));
});

test("basketball contract terms are monotonic with OVR and bounded by age", () => {
	for (const [age, ovr, expectedBird, expectedCap] of [
		[23, 70, 5, 4], // young star
		[23, 40, 1, 1], // young role player
		[27, 40, 1, 1], // low-end player
		[28, 70, 5, 4], // prime star
		[31, 65, 4, 3], // prime starter
		[32, 70, 4, 3],
		[35, 70, 3, 3], // older veteran
		[38, 70, 2, 1], // age 37+
	] as const) {
		const incumbent = makePlayer({ age, ovr });
		incumbent.tid = 0;
		incumbent.ratings.at(-1)!.pot = ovr;
		assert.strictEqual(
			getBasketballContractYears(incumbent),
			expectedBird,
			`incumbent age ${age}, OVR ${ovr}`,
		);
		const fa = makePlayer({ age, ovr });
		fa.tid = PLAYER.FREE_AGENT;
		fa.ratings.at(-1)!.pot = ovr;
		assert.strictEqual(
			getBasketballContractYears(fa),
			expectedCap,
			`FA age ${age}, OVR ${ovr}`,
		);
	}
	assert(
		getBasketballContractYears(makePlayer({ age: 25, ovr: 60 }))! >=
			getBasketballContractYears(makePlayer({ age: 25, ovr: 50 }))!,
	);
});

test("expiration conversion preserves phase and next-season term semantics", () => {
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	const p = makePlayer({ age: 28, ovr: 70 });
	const term = getBasketballContractTerm(p, { nextSeason: true })!;
	assert.strictEqual(
		getContractYearsFromExpiration({
			expiration: term.expiration,
			nextSeason: true,
		}),
		term.years,
	);
});

test("basketball initial free-agent demand bypasses reset-round bidding", () => {
	const p = makePlayer({ age: 28, value: 65, valueNoPot: 60, ovr: 65 });
	p.pid = 101;
	const term = getBasketballContractTerm(p)!;
	const years = term.years;
	const expected = getAIContractWithOption(p, {
		amount: helpers.roundContract(genContract(p, false, false, years).amount),
		exp: term.expiration,
	}).amount;
	p.contract.amount = g.get("maxContract");
	const result = getContractDemandResults({
		type: "freeAgentsOnly",
		playersAll: [p as Player],
		teams: [{ tid: 0, payroll: 0 }],
	});
	assert.strictEqual(result.get(p.pid!)?.contract.amount, expected);
	assert.strictEqual(result.get(p.pid!)?.contract.exp, term.expiration);
});

test("basketball dummy-expiring demand keeps the direct V4 price", () => {
	const p = makePlayer({ age: 28, value: 65, valueNoPot: 60, ovr: 65 });
	p.pid = 303;
	const term = getBasketballContractTerm(p)!;
	const expected = getAIContractWithOption(p, {
		amount: helpers.roundContract(
			genContract(p, false, false, term.years).amount,
		),
		exp: term.expiration,
	}).amount;
	const result = getContractDemandResults({
		type: "dummyExpiringContracts",
		playersAll: [p as Player],
		pids: [p.pid],
		teams: [{ tid: 0, payroll: 0 }],
	});

	assert.strictEqual(result.get(p.pid)?.contract.amount, expected);
	assert.strictEqual(result.get(p.pid)?.contract.exp, term.expiration);
});

test("new-league basketball demand generates the term before randomized salary", () => {
	const p = makePlayer({ age: 30, value: 72, valueNoPot: 70, ovr: 70 });
	p.pid = 202;
	p.contract.amount = 1000;
	const first = withSeed(24680, () =>
		getContractDemandResults({
			type: "newLeague",
			playersAll: [p as Player],
			teams: [],
		}),
	);
	p.contract.amount = 100000;
	const second = withSeed(24680, () =>
		getContractDemandResults({
			type: "newLeague",
			playersAll: [p as Player],
			teams: [],
		}),
	);
	const firstResult = first.get(p.pid!)!;
	const secondResult = second.get(p.pid!)!;
	assert.deepStrictEqual(firstResult, secondResult);
	const phaseOffset = g.get("phase") <= PHASE.PLAYOFFS ? 1 : 0;
	const years = firstResult.contract.exp - g.get("season") + phaseOffset;
	assert(years >= 1 && years <= getBasketballContractYears(p)!);
	assert(firstResult.contract.amount >= getMinContractForPlayer(p));
	assert(firstResult.contract.amount <= getMaxContractForPlayer(p));
});
