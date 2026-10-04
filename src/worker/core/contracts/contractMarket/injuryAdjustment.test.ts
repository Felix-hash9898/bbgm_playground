import { assert, beforeEach, describe, it } from "vitest";
import { PHASE } from "../../../../common/index.ts";
import { resetG } from "../../../../test/helpers.ts";
import { g } from "../../../util/index.ts";
import {
	getIncumbentInjuredAsk,
	getBasketballSigningPriority,
} from "./injuryAdjustment.ts";

const makePlayer = ({
	age = 27,
	gamesRemaining = 0,
	value = 60,
	injuryType = "Sprained Ankle",
}: {
	age?: number;
	gamesRemaining?: number;
	value?: number;
	injuryType?: string;
} = {}) => ({
	born: { year: g.get("season") - age, loc: "USA" },
	draft: {
		round: 1,
		pick: 1,
		tid: 0,
		originalTid: 0,
		year: g.get("season") - 5,
		pot: 60,
		ovr: 60,
		skills: [],
	},
	injury: {
		type: gamesRemaining > 0 ? injuryType : "Healthy",
		gamesRemaining,
	},
	value,
	contract: {
		amount: 15000,
		exp: g.get("season") + 1,
	},
});

describe("injuryAdjustment - Incumbent B and External B short-horizon rules", () => {
	beforeEach(() => {
		resetG();
		g.setWithoutSavingToDB("season", 2026);
		g.setWithoutSavingToDB("numGames", 82);
		g.setWithoutSavingToDB("minContract", 1000);
		g.setWithoutSavingToDB("maxContract", 35000);
		g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	});

	describe("getIncumbentInjuredAsk", () => {
		it("returns healthy H when injury is zero or within grace period (14 days)", () => {
			const pHealthy = makePlayer({ gamesRemaining: 0 });
			assert.strictEqual(
				getIncumbentInjuredAsk({
					p: pHealthy,
					healthyH: 20000,
					contractYears: 1,
				}),
				20000,
			);

			const pGrace = makePlayer({ gamesRemaining: 14 });
			assert.strictEqual(
				getIncumbentInjuredAsk({
					p: pGrace,
					healthyH: 20000,
					contractYears: 1,
				}),
				20000,
			);
		});

		it("multi-year deal (2-5 yrs) caps discount at 20 equivalent days and 90% floor", () => {
			const pSevere = makePlayer({ gamesRemaining: 82 });
			const healthyH = 20000;
			const ask2Yr = getIncumbentInjuredAsk({
				p: pSevere,
				healthyH,
				contractYears: 2,
			});
			const ask4Yr = getIncumbentInjuredAsk({
				p: pSevere,
				healthyH,
				contractYears: 4,
			});

			// 90% of 20000 is 18000
			assert.isAtLeast(ask2Yr, 18000);
			assert.isAtLeast(ask4Yr, 18000);
			assert.isBelow(ask2Yr, healthyH);
		});

		it("1-year deal short-horizon correction scales floor down to 70% for major injury", () => {
			const p82 = makePlayer({ gamesRemaining: 82 }); // missing 100% of 1-year deal
			const healthyH = 20000;
			const ask1Yr = getIncumbentInjuredAsk({
				p: p82,
				healthyH,
				contractYears: 1,
			});

			// For 1-year missing all games, floor is 70% = 14000
			assert.isAtLeast(ask1Yr, 14000);
			assert.isBelow(ask1Yr, 18000); // lower than multi-year 90% floor
		});

		it("floor rounds UP to a legal salary increment", () => {
			const pSevere = makePlayer({ gamesRemaining: 82 });
			// healthyH that yields non-integer 90%
			const healthyH = 12345;
			const ask = getIncumbentInjuredAsk({
				p: pSevere,
				healthyH,
				contractYears: 4,
			});
			// Increment for minContract 1000 is 10
			assert.strictEqual(ask % 10, 0);
		});

		it("never drops below player legal minimum", () => {
			const pSevere = makePlayer({ gamesRemaining: 82 });
			const ask = getIncumbentInjuredAsk({
				p: pSevere,
				healthyH: 1050,
				contractYears: 1,
			});
			assert.isAtLeast(ask, g.get("minContract"));
		});
	});

	describe("getBasketballSigningPriority", () => {
		it("returns p.value without mutating player object", () => {
			const p = makePlayer({ value: 65, gamesRemaining: 40 });
			const originalValue = p.value;
			const priority = getBasketballSigningPriority(p as any);

			assert.strictEqual(p.value, originalValue);
			assert.isBelow(priority, originalValue);
		});

		it("returns p.value when injury is within grace period", () => {
			const p = makePlayer({ value: 65, gamesRemaining: 10 });
			assert.strictEqual(getBasketballSigningPriority(p as any), 65);
		});

		it("multi-year deal uses standard 7.5% max penalty", () => {
			const p = makePlayer({ value: 60, gamesRemaining: 82 });
			p.contract.exp = g.get("season") + 4; // 4-year deal
			const priority = getBasketballSigningPriority(p as any);

			// max penalty 7.5% -> min priority is 60 * (1 - 0.075) = 55.5
			assert.closeTo(priority, 60 * (1 - 0.075 * 0.5), 0.5);
		});

		it("1-year deal missing >50% scales penalty up to 15%", () => {
			const p = makePlayer({ value: 60, gamesRemaining: 82 });
			p.contract.exp = g.get("season") + 1; // 1-year deal
			const priority = getBasketballSigningPriority(p as any);

			// penalty scales up to 15%
			assert.isBelow(priority, 60 * (1 - 0.075));
			assert.isAtLeast(priority, 60 * (1 - 0.15));
		});

		it("midseason signing uses actual team schedule games remaining (Defect A fix)", () => {
			const p = makePlayer({ value: 60, gamesRemaining: 20 });
			p.contract.exp = g.get("season");
			const context = {
				numGames: 82,
				phase: PHASE.REGULAR_SEASON,
			};
			// With 25 schedule games remaining:
			// horizon=25, grace=round(14*25/82)=4, severity=(20-4)/(25-4)=16/21=0.762 > 0.5
			// maxPenalty=0.15, penalty = 0.15 * 0.762 = ~0.114 => priority is ~53.1
			const priority25Games = getBasketballSigningPriority(
				p as any,
				context as any,
				25, // 25 actual remaining schedule games
			);
			assert.isBelow(
				priority25Games,
				55,
				"20/25 horizon severity must yield significant penalty (>8%)",
			);

			// Contrast with full season horizon (no scheduleGames passed -> 82 games fallback):
			// horizon=82, grace=14, severity=(20-14)/(82-14)=6/68=0.088 < 0.5
			// maxPenalty=0.075, penalty = 0.075 * 0.088 = ~0.0066 => priority is ~59.6
			const priority82Games = getBasketballSigningPriority(
				p as any,
				context as any,
				undefined, // falls back to numGames = 82
			);
			assert.isAbove(
				priority82Games,
				59,
				"20/82 horizon severity must yield minor penalty (<1%)",
			);
			assert.isBelow(
				priority25Games,
				priority82Games - 4,
				"20/25 horizon must be much harsher than 20/82",
			);
		});

		it("PRESEASON is not treated as midseason (Defect A fix)", () => {
			const p = makePlayer({ value: 60, gamesRemaining: 50 });
			// Multi-year deal (3 years)
			p.contract.exp = g.get("season") + 3;
			const contextPreseason = {
				numGames: 82,
				phase: PHASE.PRESEASON,
			};
			const priorityPreseason = getBasketballSigningPriority(
				p as any,
				contextPreseason as any,
			);
			// In preseason, multi-year deal gets standard maxPenalty = 0.075, NOT 0.15
			const minPossiblePreseasonPriority = 60 * (1 - 0.075); // 55.5
			assert.isAtLeast(
				priorityPreseason,
				minPossiblePreseasonPriority - 0.01,
				"Preseason must not trigger short-horizon 15% penalty on multi-year FA",
			);
		});

		it("non-82 schedules scale horizon and grace correctly", () => {
			const p = makePlayer({ value: 60, gamesRemaining: 6 });
			p.contract.exp = g.get("season");
			const contextShortSeason = {
				numGames: 20,
				phase: PHASE.REGULAR_SEASON,
			};
			const priority = getBasketballSigningPriority(
				p as any,
				contextShortSeason as any,
				10, // 10 games left in 20-game season
			);
			assert.isBelow(priority, 60);
		});
	});
});
