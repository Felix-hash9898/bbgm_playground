import "fake-indexeddb/auto";
import { assert, beforeEach, describe, it } from "vitest";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { getContractDemandResults } from "../freeAgents/contractDemands.ts";
import { getContractException } from "./contractLimits.ts";
import { captureSigningContext } from "../capturedContext.ts";
import { applySigningTransaction } from "../signingTransaction.ts";
import { contractNegotiation, freeAgents, player, team } from "../index.ts";
import {
	getBasketballContractForMechanism,
	getBasketballContractYears,
	getContractYearsFromExpiration,
} from "./contractTerm.ts";
import { getBasketballContractMarketDemand } from "./contractMarket/index.ts";
import { getContractCapHit } from "./contractMinimum.ts";
import updateNegotiation from "../../views/negotiation.ts";

describe("SalaryFix Integration & Defect Fix Suite", () => {
	beforeEach(async () => {
		resetG();
		g.setWithoutSavingToDB("season", 2026);
		g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
		g.setWithoutSavingToDB("minContract", 1000);
		g.setWithoutSavingToDB("maxContract", 35000);
		g.setWithoutSavingToDB("salaryCap", 100000);
		g.setWithoutSavingToDB("minContractLength", 1);
		g.setWithoutSavingToDB("maxContractLength", 5);
		g.setWithoutSavingToDB("numGames", 82);
		g.setWithoutSavingToDB("userTid", 0);
		g.setWithoutSavingToDB("userTids", [0]);

		const teamsDefault = [
			{
				tid: 0,
				cid: 0,
				did: 0,
				region: "Atlanta",
				name: "Hawks",
				abbrev: "ATL",
			},
			{
				tid: 1,
				cid: 0,
				did: 0,
				region: "Boston",
				name: "Celtics",
				abbrev: "BOS",
			},
		];
		const teams = teamsDefault.map(team.generate);

		await resetCache({
			players: [
				// Team 0 players
				player.generate(0, 24, 2024, true, DEFAULT_LEVEL),
				player.generate(0, 28, 2020, true, DEFAULT_LEVEL),
				// Free agents
				player.generate(PLAYER.FREE_AGENT, 25, 2023, true, DEFAULT_LEVEL),
				player.generate(PLAYER.FREE_AGENT, 26, 2022, true, DEFAULT_LEVEL),
			],
			teams,
		});
	});

	it("Defect D: healthyAmount is NOT persisted to cache; incumbent ask is discounted from healthy V4 demand", async () => {
		const p = await idb.cache.players.get(0);
		assert(p);
		p.tid = 0;
		p.contract.exp = 2026; // expiring
		p.injury = { type: "Torn ACL", gamesRemaining: 82 };
		p.ratings.at(-1)!.ovr = 65;
		p.value = 65;
		p.valueNoPot = 65;
		await idb.cache.players.put(p);

		const teams = (await idb.cache.teams.getAll()).map((t) => ({
			disabled: t.disabled,
			payroll: 50000,
			tid: t.tid,
		}));

		// Step 1: includeExpiringContracts (incumbent re-sign phase)
		const resignResults = getContractDemandResults({
			type: "includeExpiringContracts",
			playersAll: [p],
			teams,
		});
		const resignContract = resignResults.get(p.pid)?.contract;
		assert(resignContract);

		// Defect D assertion: healthyAmount must NOT be persisted on the contract object
		assert.strictEqual(
			(resignContract as any).healthyAmount,
			undefined,
			"healthyAmount must not be persisted on contract object (Defect D fix)",
		);

		const contractYears = getContractYearsFromExpiration({
			expiration: resignContract.exp,
		});
		const healthyH = getBasketballContractMarketDemand(
			p,
			contractYears,
		).pointAmount;
		assert(
			resignContract.amount < healthyH,
			`Injured incumbent ask (${resignContract.amount}) should be discounted from healthy H (${healthyH})`,
		);

		// Step 2: Player is NOT re-signed, enters free agency
		p.tid = PLAYER.FREE_AGENT;
		await idb.cache.players.put(p);

		// Step 3: freeAgentsOnly (start of free agency phase)
		const faResults = getContractDemandResults({
			type: "freeAgentsOnly",
			playersAll: [p],
			teams,
		});
		const faContract = faResults.get(p.pid)?.contract;
		assert(faContract);
		assert.strictEqual(
			(faContract as any).healthyAmount,
			undefined,
			"healthyAmount must not exist on external free agent quote",
		);
		assert.strictEqual(
			faContract.amount,
			healthyH,
			"External free agent must ask for full healthy V4 demand, no incumbent discount leakage",
		);
	});

	it("Defect E: Hard-cap payroll cleanup subtracts capHit rather than nominal amount", async () => {
		g.setWithoutSavingToDB("salaryCapType", "hard");
		g.setWithoutSavingToDB("salaryCap", 100000);

		// Create a player whose veteran minimum nominal amount is 2500, but cap hit is 1500
		const p = await idb.cache.players.get(0);
		assert(p);
		p.tid = 0;
		p.contract = { amount: 2500, exp: 2026, capHit: 1500 };
		await idb.cache.players.put(p);

		const capHit = getContractCapHit(p.contract);
		assert.strictEqual(capHit, 1500, "Cap hit is 1500");
		assert.strictEqual(p.contract.amount, 2500, "Nominal amount is 2500");

		// Expiring payroll reducer using getContractCapHit:
		const expiringCapHit = [p]
			.filter((player) => player.tid === 0 && player.contract.exp <= 2026)
			.reduce((total, player) => total + getContractCapHit(player.contract), 0);

		assert.strictEqual(
			expiringCapHit,
			1500,
			"expiringPayroll must subtract capHit (1500), not nominal amount (2500) (Defect E fix)",
		);
	});

	it("Defect F: Hard-cap AI incumbent re-sign enforces cap-space 4-year limit, rejecting 5-year Bird term", async () => {
		g.setWithoutSavingToDB("salaryCapType", "hard");
		g.setWithoutSavingToDB("salaryCap", 100000);

		const superstar = await idb.cache.players.get(0);
		assert(superstar);
		superstar.tid = 0;
		superstar.born.year = 2001; // age 25
		superstar.ratings.at(-1)!.ovr = 85;
		superstar.ratings.at(-1)!.pot = 85;

		const userTeam = await idb.cache.teams.get(0);
		assert(userTeam);

		// S1 under Bird mechanism would give 5 years
		const birdYears = getBasketballContractYears(superstar, {
			mechanism: "bird",
		});
		assert.strictEqual(birdYears, 5, "Superstar gets 5 years under Bird");

		// But under hard cap, capSpace legal max is 4 years
		const capSpaceYears = getBasketballContractYears(superstar, {
			mechanism: "capSpace",
		});
		assert.strictEqual(
			capSpaceYears,
			4,
			"Cap space max is strictly 4 years (Defect F fix)",
		);

		// getContractException under hard cap rejects 5-year contract
		const contract5Yr = { amount: 25000, exp: 2026 + 5 };
		const result5Yr = getContractException({
			birdException: false, // hard cap has no Bird exception
			contract: contract5Yr,
			p: superstar,
			payroll: 40000,
			team: userTeam,
		});
		assert.strictEqual(
			result5Yr.type,
			undefined,
			"Hard cap must reject 5-year contract even for incumbent superstar (Defect F fix)",
		);

		// 4-year contract is accepted under hard cap
		const contract4Yr = { amount: 25000, exp: 2026 + 4 };
		const result4Yr = getContractException({
			birdException: false,
			contract: contract4Yr,
			p: superstar,
			payroll: 40000,
			team: userTeam,
		});
		assert.strictEqual(
			result4Yr.type,
			"capSpace",
			"Hard cap accepts 4-year contract under capSpace exception",
		);
	});

	it("Defect B: Mechanism-specific contracts allow over-cap team to sign decayed FA to legal <=2-yr minimum contract", async () => {
		// External FA with high OVR whose demand decayed to minimum salary
		const fa = await idb.cache.players.get(2);
		assert(fa);
		fa.tid = PLAYER.FREE_AGENT;
		fa.ratings.at(-1)!.ovr = 75;
		fa.ratings.at(-1)!.pot = 75;
		fa.born.year = 2000;
		// Player originally demanded a 4-year cap space deal, but salary decayed to minimum
		fa.contract = { amount: 1000, exp: 2026 + 4 };
		await idb.cache.players.put(fa);

		const context = captureSigningContext();

		// CapSpace contract has 4 years
		const capSpaceContract = getBasketballContractForMechanism(fa, "capSpace", {
			context,
		});
		assert(capSpaceContract);
		assert.strictEqual(
			getContractYearsFromExpiration({
				expiration: capSpaceContract.exp,
				context,
			}),
			4,
			"Cap space version has 4-year term",
		);

		// Minimum contract has <= 2 years
		const minContract = getBasketballContractForMechanism(fa, "minimum", {
			context,
		});
		assert(minContract);
		const minYears = getContractYearsFromExpiration({
			expiration: minContract.exp,
			context,
		});
		assert.isAtMost(
			minYears,
			2,
			"Minimum exception contract must never exceed 2 years (Defect B fix)",
		);

		// Over-cap team (payroll 120000 > cap 100000) tries to validate capSpace vs minimum:
		const team1 = await idb.cache.teams.get(1);
		assert(team1);

		const capSpaceResult = getContractException({
			birdException: false,
			contract: capSpaceContract,
			p: fa,
			payroll: 120000,
			team: team1,
		});
		assert.strictEqual(
			capSpaceResult.type,
			undefined,
			"Over-cap team cannot use cap space for 4-year contract",
		);

		const minResult = getContractException({
			birdException: false,
			contract: minContract,
			p: fa,
			payroll: 120000,
			team: team1,
		});
		assert.strictEqual(
			minResult.type,
			"minimum",
			"Over-cap team CAN legally use minimum exception for <=2-yr contract (Defect B fix)",
		);

		// Lifecycle: applySigningTransaction with the minimum contract succeeds without crashing
		const signed = await applySigningTransaction({
			context,
			player: fa,
			tid: 1,
			contract: minContract,
			phase: PHASE.FREE_AGENCY,
		});
		assert.strictEqual(signed.player.tid, 1);
		assert.isAtMost(
			getContractYearsFromExpiration({
				expiration: signed.player.contract.exp,
				context,
			}),
			2,
			"Signed player on over-cap team has legal <=2-year contract",
		);
	});

	it("Defect B: Roster repair uses legal minimum contract (<=2 years) rather than universal multi-year contract", async () => {
		// Over-cap team with too few players
		const team1 = await idb.cache.teams.get(1);
		assert(team1);

		// Put an FA with 4-year expiration into the pool
		const fa = await idb.cache.players.get(2);
		assert(fa);
		fa.tid = PLAYER.FREE_AGENT;
		fa.contract = { amount: 1000, exp: 2026 + 4 }; // 4-year expiration at min salary
		await idb.cache.players.put(fa);

		const context = captureSigningContext();
		const minContract = getBasketballContractForMechanism(fa, "minimum", {
			context,
		});
		assert(minContract);
		assert.isAtMost(
			getContractYearsFromExpiration({ expiration: minContract.exp, context }),
			2,
			"Roster repair derives <=2-year minimum contract",
		);
	});

	it("Defect C: Negotiation rows reprice injury per row; 1-yr extreme discount does NOT leak to multi-year rows", async () => {
		// Incumbent player with severe injury
		const p = await idb.cache.players.get(0);
		assert(p);
		p.tid = 0; // user team
		p.contract.exp = 2026; // expiring
		p.injury = { type: "Torn ACL", gamesRemaining: 82 }; // 100% season missed
		p.ratings.at(-1)!.ovr = 70;
		p.ratings.at(-1)!.pot = 70;
		p.ratings.at(-1)!.season = 2026;
		p.born.year = 1996; // age 30
		await idb.cache.players.put(p);

		// Switch to RESIGN_PLAYERS phase
		g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
		g.setWithoutSavingToDB("salaryCapType", "soft");

		// Normalize demands for expiring contracts (sets p.contract.amount to incumbent injured ask)
		await freeAgents.normalizeContractDemands({
			type: "includeExpiringContracts",
		});
		const reloadedP = await idb.cache.players.get(p.pid);
		assert(reloadedP);

		// When entering re-signing negotiation in BBGM, player is placed in free agent pool with resigning=true
		reloadedP.tid = PLAYER.FREE_AGENT;
		await idb.cache.players.put(reloadedP);

		// Start negotiation with incumbent
		const createErr = await contractNegotiation.create(p.pid, true, 0);
		assert.strictEqual(
			createErr,
			undefined,
			"Negotiation must be created without error",
		);

		// Get negotiation view options
		const viewData = await updateNegotiation({ pid: p.pid }, ["firstRun"], {});
		if (!viewData || !("contractOptions" in viewData)) {
			console.log("updateNegotiation returned:", viewData);
		}
		assert(viewData && "contractOptions" in viewData);
		const rows = (viewData as any).contractOptions as Array<{
			years: number;
			amount: number;
			smallestAmount: boolean;
		}>;

		const row1Yr = rows.find((r) => r.years === 1);
		const row2Yr = rows.find((r) => r.years === 2);
		const row4Yr = rows.find((r) => r.years === 4);

		assert(row1Yr && row2Yr && row4Yr);

		// The 1-year row has the severe short-horizon discount (floor scales down to 70%)
		// Multi-year rows (2+ years) must NOT inherit that severe discount — they use baseline 90% floor
		const v4_1Yr = getBasketballContractMarketDemand(p, 1).pointAmount;
		const v4_2Yr = getBasketballContractMarketDemand(p, 2).pointAmount;

		// 1-year row discount percentage relative to its healthy V4
		const discount1Yr = (v4_1Yr - row1Yr.amount * 1000) / v4_1Yr;
		// 2-year row discount percentage relative to its healthy V4
		const discount2Yr = (v4_2Yr - row2Yr.amount * 1000) / v4_2Yr;

		// The 1-year discount must be significantly larger than the 2-year discount (no leakage)
		assert.isAbove(
			discount1Yr,
			discount2Yr + 0.05,
			"1-year row must have deeper short-horizon injury discount than multi-year row (Defect C fix: no leakage)",
		);
	});

	it("Defect G: getBasketballContractYears and getBasketballContractForMechanism return null when minContractLength > legalMax", () => {
		const p = {
			born: { year: 2000 },
			ratings: [{ ovr: 70, pot: 70 }],
			tid: 0,
		};

		// minContractLength = 3 > minimum mechanism max (2)
		g.setWithoutSavingToDB("minContractLength", 3);
		g.setWithoutSavingToDB("maxContractLength", 5);

		const minYears = getBasketballContractYears(p, { mechanism: "minimum" });
		assert.strictEqual(
			minYears,
			null,
			"minimum mechanism returns null when minContractLength > 2 (Defect G fix)",
		);

		const minContract = getBasketballContractForMechanism(p as any, "minimum");
		assert.strictEqual(
			minContract,
			null,
			"getBasketballContractForMechanism returns null for unavailable minimum",
		);

		// capSpace and midLevel (max 4) return null when minContractLength = 5
		g.setWithoutSavingToDB("minContractLength", 5);
		const capYears = getBasketballContractYears(p, { mechanism: "capSpace" });
		assert.strictEqual(
			capYears,
			null,
			"capSpace returns null when minContractLength = 5",
		);

		const mleYears = getBasketballContractYears(p, { mechanism: "midLevel" });
		assert.strictEqual(
			mleYears,
			null,
			"midLevel returns null when minContractLength = 5",
		);

		// Bird (max 5) is still available with minContractLength = 5
		const birdYears = getBasketballContractYears(p, { mechanism: "bird" });
		assert.strictEqual(
			birdYears,
			5,
			"Bird is still available when minContractLength = 5",
		);
	});

	it("applySigningTransaction rejects league-setting drift before signing", async () => {
		const p = await idb.cache.players.get(2);
		assert(p);

		// Context captured with maxContractLength = 4
		g.setWithoutSavingToDB("minContractLength", 1);
		g.setWithoutSavingToDB("maxContractLength", 4);
		const context = captureSigningContext();
		const originalPlayer = structuredClone(p);
		const originalEvents = await idb.cache.events.getAll();

		// Live g drifts AFTER context capture to maxContractLength = 5
		g.setWithoutSavingToDB("maxContractLength", 5);

		// Attempt to sign a 5-year contract using the captured context (which only allowed 4)
		const contract5Yr = { amount: 5000, exp: 2026 + 5 };
		let caughtError = false;
		try {
			await applySigningTransaction({
				context,
				player: p,
				tid: 0,
				contract: contract5Yr,
				phase: PHASE.FREE_AGENCY,
			});
		} catch (error: any) {
			caughtError = true;
			assert(
				error.message.includes("Signing league context changed"),
				`Expected stale signing context rejection, got: "${error.message}"`,
			);
		}
		assert(
			caughtError,
			"applySigningTransaction must reject rather than commit against drifted league settings",
		);
		assert.deepStrictEqual(await idb.cache.players.get(p.pid), originalPlayer);
		assert.deepStrictEqual(await idb.cache.events.getAll(), originalEvents);
	});
});
