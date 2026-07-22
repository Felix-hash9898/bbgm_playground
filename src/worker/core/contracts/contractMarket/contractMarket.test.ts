import { assert, beforeEach, test } from "vitest";
import { g, helpers } from "../../../util/index.ts";
import { resetG } from "../../../../test/helpers.ts";
import { getBasketballContractMarketDemand } from "./index.ts";
import { placeContractMarketAmount } from "./placement.ts";
import { getContractMarketRange, selectContractMarketTier } from "./tiers.ts";
import type { ContractMarketFeatures, ContractMarketPlayer } from "./types.ts";
import genContract from "../../player/genContract.ts";

// The tool is JavaScript by design; this test imports only its pure scoring function.
import {
	scoreContractMarketPlacement as scoreFormalPlacement,
	scoreTier as scoreFormalTier,
	tierRange as formalTierRange,
} from "../../../../../tools/contract-market-tier-score.mjs";

const makeFeatures = (
	overrides: Partial<ContractMarketFeatures> = {},
): ContractMarketFeatures => ({
	age: 23,
	pos: "PG",
	ovr: 60,
	pot: 72,
	value: 62,
	valueNoPot: 57,
	potentialPremium: 5,
	contractValue: 57,
	minutes: 2000,
	games: 70,
	starts: 60,
	minutesPerGame: 28,
	starterShare: 0.85,
	per: 16,
	ewa: 5,
	vorp: 1,
	bpm: 1,
	obpm: 1,
	dbpm: 0,
	onOff: 0,
	pts: 15,
	trb: 5,
	ast: 4,
	stl: 1,
	blk: 0.4,
	tov: 2,
	trueShooting: 0.56,
	effectiveFg: 0.53,
	usage: 22,
	compUsage: 0.62,
	astPct: 18,
	compPassing: 0.65,
	compShootingThree: 0.62,
	compRebounding: 0.55,
	compDefense: 0.62,
	compDefenseInterior: 0.55,
	compDefensePerimeter: 0.64,
	compBlocking: 0.5,
	skillThreeMargin: 0.03,
	skillReboundingMargin: 0,
	skillDefenseInteriorMargin: 0,
	minContract: 1500,
	salaryCap: 150000,
	eligibleMax: 37500,
	maxContractLength: 5,
	normalContractYears: 1,
	...overrides,
});

const formalRow = (f: ContractMarketFeatures) => ({
	age: f.age,
	pos: f.pos,
	ovr: f.ovr,
	pot: f.pot,
	value: f.value,
	valueNoPot: f.valueNoPot,
	potentialPremium: f.potentialPremium,
	getContractValue: f.contractValue,
	GP: f.games,
	MPG: f.minutesPerGame,
	GS: f.starts,
	starterShare: f.starterShare,
	PER: f.per,
	EWA: f.ewa,
	VORP: f.vorp,
	BPM: f.bpm,
	OBPM: f.obpm,
	DBPM: f.dbpm,
	"On-Off": f.onOff,
	PTS: f.pts,
	TRB: f.trb,
	AST: f.ast,
	BLK: f.blk,
	STL: f.stl,
	TOV: f.tov,
	TS: f.trueShooting,
	eFG: f.effectiveFg,
	USG: f.usage,
	"AST%": f.astPct,
	comp_usage: f.compUsage,
	comp_passing: f.compPassing,
	comp_shootingThreePointer: f.compShootingThree,
	comp_rebounding: f.compRebounding,
	comp_defense: f.compDefense,
	comp_defenseInterior: f.compDefenseInterior,
	comp_defensePerimeter: f.compDefensePerimeter,
	comp_blocking: f.compBlocking,
	skill_3_margin: f.skillThreeMargin,
	skill_R_margin: f.skillReboundingMargin,
	skill_Di_margin: f.skillDefenseInteriorMargin,
	minContractForPlayer: f.minContract,
	eligibleMax: f.eligibleMax,
});

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("salaryCap", 150000);
});

test.each([
	["HIGH_END_ROTATION", 0.07, 0.12],
	["SOLID_STARTER", 0.12, 0.17],
	["YOUNG_PROVEN_STARTER", 0.17, 0.225],
] as const)(
	"%s uses its formal cap percentage range",
	(tier, minPct, maxPct) => {
		const features = makeFeatures();
		const range = getContractMarketRange(tier, features);
		assert.strictEqual(range.minCapPct, minPct);
		assert.strictEqual(range.maxCapPct, maxPct);
		const result = placeContractMarketAmount(features, tier, range);
		assert(result.pointCapPct >= minPct);
		assert(result.pointCapPct <= maxPct);
	},
);

test("minimum-level amount respects player minimum", () => {
	const features = makeFeatures({ minContract: 3000, salaryCap: 100000 });
	const range = getContractMarketRange("MINIMUM_LEVEL", features);
	const result = placeContractMarketAmount(features, "MINIMUM_LEVEL", range);
	assert(result.pointAmount >= 3000);
});

test("formal gates do not accept the previously relaxed tier inputs", () => {
	assert.notStrictEqual(
		selectContractMarketTier(
			makeFeatures({
				age: 22,
				pot: 70,
				value: 56,
				potentialPremium: 6,
				games: 30,
				minutesPerGame: 14,
			}),
		),
		"YOUNG_UPSIDE_SUSPECT",
	);
	assert.notStrictEqual(
		selectContractMarketTier(
			makeFeatures({
				age: 27,
				games: 55,
				minutesPerGame: 12,
				compShootingThree: 0.67,
				skillThreeMargin: 0.07,
				compUsage: 0.49,
			}),
		),
		"SPECIALIST_ROTATION",
	);
	assert.notStrictEqual(
		selectContractMarketTier(
			makeFeatures({
				age: 31,
				pos: "C",
				valueNoPot: 52,
				per: 12,
				compRebounding: 0.55,
				compDefenseInterior: 0.55,
				skillReboundingMargin: 0.04,
				skillDefenseInteriorMargin: 0.04,
			}),
		),
		"VETERAN_MINIMUM_PLUS",
	);
	assert.notStrictEqual(
		selectContractMarketTier(
			makeFeatures({
				age: 27,
				games: 45,
				minutesPerGame: 10,
				valueNoPot: 50,
				per: 9,
				ewa: -1,
				bpm: -2.5,
			}),
		),
		"LOW_ROTATION_PLUS",
	);
});

test.each([
	makeFeatures({
		age: 22,
		pot: 70,
		value: 57,
		valueNoPot: 51,
		potentialPremium: 6,
		contractValue: 52,
		games: 30,
		minutesPerGame: 14,
	}),
	makeFeatures({
		age: 27,
		pot: 60,
		value: 55,
		valueNoPot: 50,
		potentialPremium: 5,
		games: 55,
		minutesPerGame: 12,
		compShootingThree: 0.69,
		skillThreeMargin: 0.09,
		compUsage: 0.55,
	}),
] as const)(
	"matches tools placement score for a typical formal sample",
	(features) => {
		const runtimeTier = selectContractMarketTier(features);
		const runtimeRange = getContractMarketRange(runtimeTier, features);
		const formalScore = scoreFormalTier(formalRow(features));
		const formalRange = formalTierRange(formalScore.tier, formalRow(features), {
			salaryCap: features.salaryCap,
		});
		const formalPlacement = scoreFormalPlacement(
			formalRow(features),
			{ salaryCap: features.salaryCap },
			{ score: formalScore, range: formalRange },
		);
		const runtimePlacement = placeContractMarketAmount(
			features,
			runtimeTier,
			runtimeRange,
		);
		assert.strictEqual(runtimeTier, formalScore.tier);
		assert.strictEqual(runtimeRange.minAmount, formalRange.modelRangeMin);
		assert.strictEqual(runtimeRange.maxAmount, formalRange.modelRangeMax);
		assert(
			Math.abs(
				runtimePlacement.placementScore - formalPlacement.tierPlacementScore,
			) < 0.000001,
			JSON.stringify({
				runtimeTier,
				formalTier: formalScore.tier,
				runtimeScore: runtimePlacement.placementScore,
				formalScore: formalPlacement.tierPlacementScore,
				runtimeFlags: runtimePlacement.riskFlags,
				formalFlags: formalPlacement.riskFlags,
				formalComponents: formalPlacement.modelComponents,
			}),
		);
		assert.strictEqual(
			runtimePlacement.pointAmount,
			formalPlacement.modelPointAmount,
			JSON.stringify({
				runtimePoint: runtimePlacement.pointAmount,
				formalPoint: formalPlacement.modelPointAmount,
			}),
		);
	},
);

test.each([
	[
		"HIGH_END_ROTATION",
		makeFeatures({
			age: 24,
			pot: 60,
			potentialPremium: 3,
			value: 57,
			valueNoPot: 55,
			contractValue: 55,
			games: 50,
			minutesPerGame: 22,
			usage: 22,
			pts: 15,
			ewa: 2,
			per: 14,
			bpm: 0,
		}),
	],
	[
		"SOLID_STARTER",
		makeFeatures({
			age: 27,
			pot: 65,
			potentialPremium: 4,
			value: 59,
			valueNoPot: 60,
			contractValue: 60,
			games: 60,
			starts: 50,
			minutesPerGame: 30,
			starterShare: 0.83,
			per: 16,
			ewa: 5,
			vorp: 1,
			bpm: 1,
		}),
	],
	[
		"YOUNG_PROVEN_STARTER",
		makeFeatures({
			age: 25,
			value: 62,
			valueNoPot: 60,
			contractValue: 60,
			games: 60,
			minutesPerGame: 28,
			starterShare: 0.8,
			per: 18,
			ewa: 5,
			vorp: 1,
			bpm: 1,
		}),
	],
	[
		"YOUNG_UPSIDE_SUSPECT",
		makeFeatures({
			age: 22,
			pot: 70,
			value: 57,
			valueNoPot: 51,
			potentialPremium: 6,
			contractValue: 52,
			games: 30,
			minutesPerGame: 14,
		}),
	],
	[
		"SPECIALIST_ROTATION",
		makeFeatures({
			age: 27,
			pot: 60,
			value: 55,
			valueNoPot: 50,
			potentialPremium: 5,
			games: 55,
			minutesPerGame: 12,
			compShootingThree: 0.69,
			skillThreeMargin: 0.09,
			compUsage: 0.55,
		}),
	],
] as const)("selects %s for its formal archetype", (expected, features) => {
	assert.strictEqual(selectContractMarketTier(features), expected);
	assert.strictEqual(scoreFormalTier(formalRow(features)).tier, expected);
});

test("young potential-only profile receives a low placement and short-term hint", () => {
	const features = makeFeatures({
		age: 21,
		ovr: 48,
		pot: 72,
		value: 55,
		valueNoPot: 48,
		potentialPremium: 7,
		contractValue: 50,
		minutesPerGame: 10,
		games: 35,
		per: 11,
		ewa: 0,
		bpm: -2.5,
	});
	const range = getContractMarketRange("YOUNG_UPSIDE_SUSPECT", features);
	const result = placeContractMarketAmount(
		features,
		"YOUNG_UPSIDE_SUSPECT",
		range,
	);
	assert(result.riskFlags.includes("young_pot_only"));
	assert(result.placementScore < 0.7);
	assert.strictEqual(result.yearsHint, "1-2");
});

test("runtime demand is deterministic and returns a point inside its formal range", () => {
	const p = {
		born: { year: g.get("season") - 23 },
		draft: { year: g.get("season") - 2, round: 1, pick: 1 },
		ratings: [
			{
				ovr: 60,
				pot: 70,
				fuzz: 0,
				pos: "PG",
				skills: [],
				season: g.get("season"),
				hgt: 75,
				spd: 70,
				endu: 70,
				ins: 65,
				jmp: 70,
				oiq: 65,
				pss: 65,
				reb: 45,
				drb: 50,
				fg: 60,
				ft: 75,
				tp: 65,
				stre: 55,
				diq: 60,
				dnk: 45,
			},
		],
		stats: [
			{
				playoffs: false,
				gp: 70,
				gs: 50,
				min: 1900,
				per: 15,
				ewa: 4,
				vorp: 1,
				obpm: 1,
				dbpm: 0,
				pts: 1000,
				trb: 350,
				ast: 300,
				fga: 700,
				fta: 200,
				fg: 350,
				tp: 150,
				usgp: 21,
				astp: 18,
			},
		],
		awards: [],
		contract: { amount: 1500, exp: g.get("season") + 1 },
		value: 60,
		valueNoPot: 55,
	} as unknown as ContractMarketPlayer;
	const first = getBasketballContractMarketDemand(p);
	const second = getBasketballContractMarketDemand(p);
	assert.deepStrictEqual(first, second);
	assert(first.pointAmount >= first.range.minAmount);
	assert(first.pointAmount <= first.range.maxAmount);
	assert(first.pointAmount > g.get("minContract") * 1.1);
	assert.strictEqual(
		genContract(p, false).amount,
		helpers.roundContract(first.pointAmount),
	);
});
