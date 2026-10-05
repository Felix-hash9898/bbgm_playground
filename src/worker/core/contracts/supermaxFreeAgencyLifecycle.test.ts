import "fake-indexeddb/auto";
import { deleteDB } from "@dumbmatter/idb";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetG } from "../../../test/helpers.ts";
import Cache, { STORES } from "../../db/Cache.ts";
import { connectLeague, idb } from "../../db/index.ts";
import { g, helpers, local } from "../../util/index.ts";
import updateFreeAgents from "../../views/freeAgents.ts";
import updateNegotiation from "../../views/negotiation.ts";
import { captureSigningContext } from "../capturedContext.ts";
import { contractNegotiation, freeAgents, player, team } from "../index.ts";
import newPhase from "../phase/newPhase.ts";
import * as playerMoodComponents from "../player/moodComponents.ts";
import { applySigningTransaction } from "../signingTransaction.ts";
import { getMaxContractForPlayerAndTerm } from "./contractLimits.ts";
import { getEffectiveOfferAmount } from "./contractOption.ts";
import {
	getContractExpirationForYears,
	getContractYearsFromExpiration,
} from "./contractTerm.ts";

let lid: number;
let pid: number;
let previousAutoSave: boolean;

const makePlayer = (tid: number, value = 40) => {
	const p = player.generate(tid, 27, 2018, true, DEFAULT_LEVEL);
	p.contract = { amount: 5000, exp: 2030 };
	p.ratings.at(-1)!.ovr = value;
	p.ratings.at(-1)!.pot = value;
	p.ratings.at(-1)!.season = 2026;
	p.value = value;
	p.valueNoPot = value;
	p.injury = { type: "Healthy", gamesRemaining: 0 };
	return p;
};

const readDurablePlayer = async () => {
	const tx = idb.league.transaction("players", "readonly");
	const p = await tx.store.get(pid);
	await tx.done;
	return p;
};

const prepareIncumbent = async (
	yos: number,
	{ tid = 0, value = 70 }: { tid?: number; value?: number } = {},
) => {
	const p = (await idb.cache.players.get(pid))!;
	p.tid = tid;
	p.draft.year = g.get("season") - yos;
	p.draft.originalTid = tid;
	p.draft.tid = tid;
	p.draft.round = 2;
	p.draft.pick = 45;
	p.firstNBAContract = {
		tid,
		season: p.draft.year,
		phase: PHASE.FREE_AGENCY,
	};
	// Real NBA service, original-team history, and a player contract in each of
	// the three immediately preceding cap years are explicit fixture evidence.
	p.stats = Array.from({ length: yos }, (_, i) => ({
		season: p.draft.year + 1 + i,
		tid,
		playoffs: false,
		gp: 82,
		min: 0,
	})) as typeof p.stats;
	p.salaries = p.stats.map((row) => ({ season: row.season, amount: 5000 }));
	p.transactions = [];
	p.awards = [{ season: g.get("season"), type: "Most Valuable Player" }];
	p.contract = { amount: 5000, exp: g.get("season") };
	p.ratings.at(-1)!.ovr = 70;
	p.ratings.at(-1)!.pot = 70;
	p.ratings.at(-1)!.fuzz = 0;
	p.value = value;
	p.valueNoPot = value;
	await idb.cache.players.put(p);
	return p;
};

const enterOpenFreeAgency = async () => {
	await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
	const atResigning = (await idb.cache.players.get(pid))!;
	assert.strictEqual(atResigning.tid, PLAYER.FREE_AGENT);
	assert.strictEqual(atResigning.priorContractTid, 0);
	assert.strictEqual((await idb.cache.negotiations.get(pid))?.resigning, true);

	// This calls newPhaseFreeAgency, cancels the old re-sign negotiation, and
	// performs the actual freeAgentsOnly normalization and durable phase flush.
	await newPhase(PHASE.FREE_AGENCY, {} as any);
	assert.strictEqual(g.get("phase"), PHASE.FREE_AGENCY);
	assert.isUndefined(await idb.cache.negotiations.get(pid));
	const p = (await idb.cache.players.get(pid))!;
	assert.strictEqual(p.tid, PLAYER.FREE_AGENT);
	assert.strictEqual(p.priorContractTid, 0);
	return p;
};

const negotiationRows = async () => {
	const view = await updateNegotiation({ pid }, ["firstRun"], {});
	assert.isDefined(view);
	assert.isTrue("contractOptions" in view!);
	return view as {
		playerMaxContract: number;
		maxSalaryTier: number;
		contractOptions: {
			years: number;
			amount: number;
			smallestAmount: boolean;
			option?: "player" | "team";
			disabledReason?: string;
			contractExceptionType?: string;
		}[];
	};
};

const freeAgencyRow = async () => {
	const view = await updateFreeAgents(
		{ season: "current", type: "available" },
		["firstRun"],
		{},
	);
	assert.isDefined(view);
	const row = view!.players.find((p) => p.pid === pid);
	assert.isDefined(row);
	return row!;
};

beforeEach(async () => {
	resetG();
	lid = 900_000 + Math.floor(Math.random() * 90_000);
	g.setWithoutSavingToDB("lid", lid);
	g.setWithoutSavingToDB("season", 2026);
	g.setWithoutSavingToDB("phase", PHASE.AFTER_DRAFT);
	g.setWithoutSavingToDB("salaryCapType", "soft");
	g.setWithoutSavingToDB("salaryCap", 100000);
	g.setWithoutSavingToDB("maxContract", 35000);
	g.setWithoutSavingToDB("minContract", 1000);
	g.setWithoutSavingToDB("minContractLength", 1);
	g.setWithoutSavingToDB("maxContractLength", 5);
	g.setWithoutSavingToDB("minRosterSize", 1);
	g.setWithoutSavingToDB("maxRosterSize", 5);
	g.setWithoutSavingToDB("numTeams", 2);
	g.setWithoutSavingToDB("numActiveTeams", 2);
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB("userTids", [0]);
	g.setWithoutSavingToDB("playersRefuseToNegotiate", false);
	g.setWithoutSavingToDB("repeatSeason", {
		type: "players",
		startingSeason: g.get("season"),
	});
	previousAutoSave = local.autoSave;
	local.autoSave = true;
	idb.league = await connectLeague(lid);
	idb.cache = new Cache();
	for (const store of STORES) {
		idb.cache._data[store] = {};
		idb.cache._deletes[store] = new Set();
		idb.cache._dirtyRecords[store] = new Set();
		idb.cache._maxIds[store] = -1;
		idb.cache._markDirtyIndexes(store);
	}
	idb.cache._status = "full";
	for (const row of helpers.getTeamsDefault().slice(0, 2)) {
		await idb.cache.teams.add(team.generate(row));
	}
	pid = await idb.cache.players.add(makePlayer(0, 70));
	await idb.cache.players.add(makePlayer(0));
	await idb.cache.players.add(makePlayer(1));
	// Enough real players for ensureEnoughPlayers without generating a new pool.
	for (let i = 0; i < 9; i++) {
		await idb.cache.players.add(makePlayer(PLAYER.FREE_AGENT));
	}
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	// Keep real moodInfo/moodInfos (including team-specific legal clamping), and
	// isolate only sentiment from legal/market/term/signing behavior.
	vi.spyOn(playerMoodComponents, "default").mockResolvedValue({
		marketSize: 0,
		facilities: 0,
		teamPerformance: 0,
		hype: 0,
		loyalty: 0,
		trades: 0,
		playingTime: 0,
		rookieContract: 0,
		difficulty: 0,
		relatives: 0,
	});
	vi.spyOn(Math, "random").mockReturnValue(0.99);
});

afterEach(async () => {
	vi.restoreAllMocks();
	idb.cache.stopAutoFlush();
	idb.league.close();
	await deleteDB(`league${lid}`);
	local.autoSave = previousAutoSave;
});

test.each([8, 9])(
	"%s-YOS qualifying incumbent keeps a market-priced five-year supermax through open FA and actual signing",
	async (yos) => {
		await prepareIncumbent(yos);
		const p = await enterOpenFreeAgency();
		assert.strictEqual(p.contract.exp, 2031);
		assert.strictEqual(
			getEffectiveOfferAmount(p.contract.amount, p.contract.option),
			33000,
		);
		assert.isBelow(p.contract.amount, 35000);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35000);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 4), 30000);

		// Fresh open-FA negotiation must retain rights without resigning=true.
		assert.isUndefined(await contractNegotiation.create(pid, false, 0));
		assert.strictEqual(
			(await idb.cache.negotiations.get(pid))?.resigning,
			false,
		);
		const view = await negotiationRows();
		const five = view.contractOptions.find(
			(row) => row.years === 5 && !row.option,
		);
		assert.isDefined(five);
		assert.strictEqual(five!.amount, 33);
		assert.isUndefined(five!.disabledReason);
		assert.strictEqual(view.playerMaxContract, 35);
		assert.strictEqual(view.maxSalaryTier, 35);
		assert.isUndefined(
			await contractNegotiation.accept({ pid, amount: 33000, exp: 2031 }),
		);
		const signed = (await readDurablePlayer())!;
		assert.strictEqual(signed.tid, 0);
		assert.strictEqual(signed.contract.amount, 33000);
		assert.strictEqual(signed.contract.exp, 2031);
		assert.isUndefined(await idb.cache.negotiations.get(pid));
		assert.isTrue(
			(await idb.cache.events.getAll()).some(
				(event) => event.type === "freeAgent" && event.pids?.includes(pid),
			),
		);
	},
);

test("an external team's open-FA display and accept stay at ordinary max and four years", async () => {
	await prepareIncumbent(8);
	const p = await enterOpenFreeAgency();
	g.setWithoutSavingToDB("userTid", 1);
	g.setWithoutSavingToDB("userTids", [1]);
	assert.isUndefined(await contractNegotiation.create(pid, false, 1));
	assert.strictEqual((await player.moodInfo(p, 1)).contractAmount, 30000);
	const view = await negotiationRows();
	assert.strictEqual(view.playerMaxContract, 30);
	assert.strictEqual(view.maxSalaryTier, 30);
	const four = view.contractOptions.find(
		(row) => row.years === 4 && !row.option,
	);
	assert.isDefined(four);
	assert.isAtMost(four!.amount, 30);
	assert.isUndefined(four!.disabledReason);
	assert.isTrue(
		view.contractOptions.every(
			(row) => row.years <= 4 || row.disabledReason !== undefined,
		),
	);
	assert.isTrue(
		view.contractOptions.every(
			(row) => row.amount <= 30 || row.disabledReason !== undefined,
		),
	);
	assert.isDefined(
		await contractNegotiation.accept({
			pid,
			amount: 33000,
			exp: 2031,
			dryRun: true,
		}),
	);
	assert.isDefined(
		await contractNegotiation.accept({
			pid,
			amount: 30000,
			exp: 2031,
			dryRun: true,
		}),
	);
	assert.isDefined(
		await contractNegotiation.accept({
			pid,
			amount: 33000,
			exp: 2030,
			dryRun: true,
		}),
	);
	assert.isUndefined(
		await contractNegotiation.accept({ pid, amount: 30000, exp: 2030 }),
	);
	const signed = (await readDurablePlayer())!;
	assert.strictEqual(signed.tid, 1);
	assert.strictEqual(signed.contract.amount, 30000);
	assert.strictEqual(signed.contract.exp, 2030);
});

test("an eligible player's lower market ask survives open-FA normalization without a supermax floor", async () => {
	await prepareIncumbent(8, { value: 65 });
	const p = await enterOpenFreeAgency();
	assert.strictEqual(
		getEffectiveOfferAmount(p.contract.amount, p.contract.option),
		26000,
	);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35000);
	assert.isUndefined(await contractNegotiation.create(pid, false, 0));
	const view = await negotiationRows();
	const five = view.contractOptions.find(
		(row) => row.years === 5 && !row.option,
	);
	assert.strictEqual(five?.amount, 26);
	assert.isUndefined(five?.disabledReason);
	assert.isUndefined(
		await contractNegotiation.accept({ pid, amount: 26000, exp: 2031 }),
	);
	assert.strictEqual((await readDurablePlayer())?.contract.amount, 26000);
});

test("decreaseDemands preserves the cached >30% ask and prior-team ceiling in open FA", async () => {
	await prepareIncumbent(8);
	const before = structuredClone(await enterOpenFreeAgency());
	await freeAgents.decreaseDemands();
	const after = (await idb.cache.players.get(pid))!;
	const effectiveAmount = getEffectiveOfferAmount(
		after.contract.amount,
		after.contract.option,
	);
	assert.isBelow(
		effectiveAmount,
		getEffectiveOfferAmount(before.contract.amount, before.contract.option),
	);
	assert.isAbove(effectiveAmount, 30000);
	assert.strictEqual(after.contract.exp, 2031);
	assert.strictEqual(after.priorContractTid, 0);
	assert.strictEqual(getMaxContractForPlayerAndTerm(after, 0, 5), 35000);
	assert.strictEqual(getMaxContractForPlayerAndTerm(after, 1, 4), 30000);
	assert.isUndefined(await contractNegotiation.create(pid, false, 0));
	assert.isUndefined(
		await contractNegotiation.accept({
			pid,
			amount: effectiveAmount,
			exp: 2031,
		}),
	);
	assert.strictEqual(
		(await readDurablePlayer())?.contract.amount,
		effectiveAmount,
	);
});

test.each([
	{ value: 65, cachedAmount: 26000, fiveYearAmount: 30940 },
	{ value: 70, cachedAmount: 30000, fiveYearAmount: 35000 },
])(
	"a qualifying prior-team FA with a four-year cached preference can offer a legal five-year contract at $fiveYearAmount",
	async ({ value, cachedAmount, fiveYearAmount }) => {
		const incumbent = await prepareIncumbent(8, { value });
		incumbent.born.year = g.get("season") - 31;
		incumbent.ratings.at(-1)!.ovr = 69;
		incumbent.ratings.at(-1)!.pot = 69;
		await idb.cache.players.put(incumbent);
		const p = await enterOpenFreeAgency();
		assert.strictEqual(
			getContractYearsFromExpiration({ expiration: p.contract.exp }),
			4,
		);
		assert.strictEqual(
			getEffectiveOfferAmount(p.contract.amount, p.contract.option),
			cachedAmount,
		);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35000);
		assert.isUndefined(await contractNegotiation.create(pid, false, 0));
		const view = await negotiationRows();
		const five = view.contractOptions.find(
			(row) => row.years === 5 && !row.option,
		);
		assert.isDefined(five);
		assert.strictEqual(five!.amount * 1000, fiveYearAmount);
		assert.isAbove(five!.amount, 30);
		assert.isUndefined(five!.disabledReason);
		assert.isUndefined(
			await contractNegotiation.accept({
				pid,
				amount: fiveYearAmount,
				exp: getContractExpirationForYears({ years: 5 }),
			}),
		);
		const signed = (await readDurablePlayer())!;
		assert.strictEqual(signed.tid, 0);
		assert.strictEqual(signed.contract.amount, fiveYearAmount);
		assert.strictEqual(
			getContractYearsFromExpiration({ expiration: signed.contract.exp }),
			5,
		);
	},
);

test("the FA list displays a legal term for each viewing team without overwriting the shared five-year ask", async () => {
	await prepareIncumbent(8);
	const cached = structuredClone(await enterOpenFreeAgency());
	const prior = await freeAgencyRow();
	assert.strictEqual(
		getContractYearsFromExpiration({ expiration: prior.contract.exp }),
		5,
	);
	assert.isTrue(prior.canAffordNow);
	assert.deepStrictEqual(
		(await idb.cache.players.get(pid))?.contract,
		cached.contract,
	);

	g.setWithoutSavingToDB("userTid", 1);
	g.setWithoutSavingToDB("userTids", [1]);
	const external = await freeAgencyRow();
	assert.strictEqual(
		getContractYearsFromExpiration({ expiration: external.contract.exp }),
		4,
	);
	assert.isTrue(external.canAffordNow);
	assert.deepStrictEqual(
		(await idb.cache.players.get(pid))?.contract,
		cached.contract,
	);
	assert.strictEqual(
		getContractYearsFromExpiration({
			expiration: (await idb.cache.players.get(pid))!.contract.exp,
		}),
		5,
	);
});

test("no-cap negotiation preserves a cached two-year market anchor", async () => {
	await prepareIncumbent(8);
	const p = await enterOpenFreeAgency();
	g.setWithoutSavingToDB("salaryCapType", "none");
	p.contract = {
		amount: 18000,
		exp: getContractExpirationForYears({ years: 2 }),
	};
	await idb.cache.players.put(p);
	const cached = structuredClone(p.contract);
	assert.isUndefined(await contractNegotiation.create(pid, false, 0));
	const view = await negotiationRows();
	const two = view.contractOptions.find(
		(row) => row.years === 2 && !row.option,
	);
	assert.isDefined(two);
	assert.isTrue(two!.smallestAmount);
	assert.strictEqual(two!.amount, 18);
	assert.isUndefined(two!.disabledReason);
	assert.deepStrictEqual((await idb.cache.players.get(pid))?.contract, cached);
});

test.each([6, 7])(
	"no-cap young free agent generates, offers, and durably signs above the ordinary young maximum for %s configured years",
	async (years) => {
		await prepareIncumbent(3);
		const p = await enterOpenFreeAgency();
		g.setWithoutSavingToDB("salaryCapType", "none");
		g.setWithoutSavingToDB("maxContract", 50000);
		g.setWithoutSavingToDB("minContractLength", years);
		g.setWithoutSavingToDB("maxContractLength", years);
		p.awards = [];
		await idb.cache.players.put(p);
		assert.strictEqual(
			player.genContract(p, false, false, years, 0).amount,
			33000,
		);
		await freeAgents.normalizeContractDemands({ type: "freeAgentsOnly" });
		const current = (await idb.cache.players.get(pid))!;
		assert.strictEqual(
			getContractYearsFromExpiration({ expiration: current.contract.exp }),
			years,
		);
		assert.strictEqual(
			getEffectiveOfferAmount(current.contract.amount, current.contract.option),
			33000,
		);
		assert.isUndefined(await contractNegotiation.create(pid, false, 0));
		const view = await negotiationRows();
		assert.strictEqual(view.playerMaxContract, 50);
		const row = view.contractOptions.find(
			(row) => row.years === years && !row.option,
		);
		assert.isDefined(row);
		assert.isAbove(row!.amount, 25);
		assert.isUndefined(row!.disabledReason);
		const exp = current.contract.exp;
		assert.isUndefined(
			await contractNegotiation.accept({
				pid,
				amount: 40000,
				exp,
				dryRun: true,
			}),
		);
		assert.isUndefined(
			await contractNegotiation.accept({ pid, amount: 40000, exp }),
		);
		const signed = (await readDurablePlayer())!;
		assert.strictEqual(signed.contract.amount, 40000);
		assert.strictEqual(
			getContractYearsFromExpiration({ expiration: signed.contract.exp }),
			years,
		);
		assert.strictEqual(signed.tid, 0);
	},
);

test("no-cap senior free agent cannot offer or finalize more than configured max even when 35% and 105% are higher", async () => {
	await prepareIncumbent(10);
	const p = await enterOpenFreeAgency();
	g.setWithoutSavingToDB("salaryCapType", "none");
	g.setWithoutSavingToDB("salaryCap", 200000);
	g.setWithoutSavingToDB("maxContract", 30000);
	g.setWithoutSavingToDB("minContractLength", 7);
	g.setWithoutSavingToDB("maxContractLength", 7);
	p.awards = [];
	p.salaries.at(-1)!.amount = 100000;
	await idb.cache.players.put(p);
	assert.strictEqual(player.genContract(p, false, false, 7, 0).amount, 30000);
	await freeAgents.normalizeContractDemands({ type: "freeAgentsOnly" });
	const current = (await idb.cache.players.get(pid))!;
	assert.strictEqual(
		getEffectiveOfferAmount(current.contract.amount, current.contract.option),
		30000,
	);
	assert.isUndefined(await contractNegotiation.create(pid, false, 0));
	assert.strictEqual((await negotiationRows()).playerMaxContract, 30);
	const exp = current.contract.exp;
	assert.strictEqual(
		await contractNegotiation.accept({ pid, amount: 40000, exp, dryRun: true }),
		"You cannot offer this player a contract higher than their maximum salary.",
	);
	const before = structuredClone({
		player: current,
		events: await idb.cache.events.getAll(),
		negotiation: await idb.cache.negotiations.get(pid),
	});
	let error: unknown;
	try {
		await applySigningTransaction({
			context: captureSigningContext(),
			player: current,
			tid: 0,
			contract: { amount: 40000, exp },
			phase: PHASE.FREE_AGENCY,
			durability: "immediate",
		});
	} catch (error_) {
		error = error_;
	}
	assert.instanceOf(error, Error);
	assert.deepStrictEqual(await idb.cache.players.get(pid), before.player);
	assert.deepStrictEqual(await idb.cache.events.getAll(), before.events);
	assert.deepStrictEqual(
		await idb.cache.negotiations.get(pid),
		before.negotiation,
	);
	assert.isUndefined(
		await contractNegotiation.accept({ pid, amount: 30000, exp }),
	);
	const signed = (await readDurablePlayer())!;
	assert.strictEqual(signed.contract.amount, 30000);
	assert.strictEqual(
		getContractYearsFromExpiration({ expiration: signed.contract.exp }),
		7,
	);
});

test.each([
	{ tid: 0, years: 6, phase: PHASE.FREE_AGENCY },
	{ tid: 1, years: 5, phase: PHASE.PRESEASON },
])(
	"final signing rejects an ordinary-max $years-year FA contract from team $tid in phase $phase",
	async ({ tid, years, phase }) => {
		await prepareIncumbent(8);
		const p = await enterOpenFreeAgency();
		g.setWithoutSavingToDB("maxContractLength", 6);
		if (phase === PHASE.PRESEASON) {
			g.setWithoutSavingToDB("season", 2027);
		}
		g.setWithoutSavingToDB("phase", phase);
		const expiration = getContractExpirationForYears({ years });
		assert.strictEqual(getContractYearsFromExpiration({ expiration }), years);
		const before = structuredClone({
			players: await idb.cache.players.getAll(),
			teams: await idb.cache.teams.getAll(),
			negotiations: await idb.cache.negotiations.getAll(),
			events: await idb.cache.events.getAll(),
		});
		let error: unknown;
		try {
			await applySigningTransaction({
				context: captureSigningContext(),
				player: p,
				tid,
				contract: { amount: 30000, exp: expiration },
				phase,
				durability: "immediate",
			});
		} catch (error_) {
			error = error_;
		}
		assert.instanceOf(error, Error);
		assert.deepStrictEqual(await idb.cache.players.getAll(), before.players);
		assert.deepStrictEqual(await idb.cache.teams.getAll(), before.teams);
		assert.deepStrictEqual(
			await idb.cache.negotiations.getAll(),
			before.negotiations,
		);
		assert.deepStrictEqual(await idb.cache.events.getAll(), before.events);
		assert.deepStrictEqual(await readDurablePlayer(), p);
	},
);

test.each([
	{ tid: 1, years: 5, amount: 33000 },
	{ tid: 1, years: 4, amount: 33000 },
	{ tid: 1, years: 5, amount: 30000 },
	{ tid: 0, years: 4, amount: 33000 },
])(
	"final signing rejects forged $amount/$years-year offer from team $tid without mutation",
	async ({ tid, years, amount }) => {
		await prepareIncumbent(8);
		const p = await enterOpenFreeAgency();
		const before = structuredClone({
			players: await idb.cache.players.getAll(),
			teams: await idb.cache.teams.getAll(),
			negotiations: await idb.cache.negotiations.getAll(),
			events: await idb.cache.events.getAll(),
		});
		let error: unknown;
		try {
			await applySigningTransaction({
				context: captureSigningContext(),
				player: p,
				tid,
				contract: { amount, exp: g.get("season") + years },
				phase: PHASE.FREE_AGENCY,
				durability: "immediate",
			});
		} catch (error_) {
			error = error_;
		}
		assert.instanceOf(error, Error);
		assert.deepStrictEqual(await idb.cache.players.getAll(), before.players);
		assert.deepStrictEqual(await idb.cache.teams.getAll(), before.teams);
		assert.deepStrictEqual(
			await idb.cache.negotiations.getAll(),
			before.negotiations,
		);
		assert.deepStrictEqual(await idb.cache.events.getAll(), before.events);
		assert.deepStrictEqual(await readDurablePlayer(), p);
	},
);

test("final signing rechecks continuity from the current player rather than a stale eligible snapshot", async () => {
	await prepareIncumbent(9);
	const stale = await enterOpenFreeAgency();
	const context = captureSigningContext();
	const current = structuredClone(stale);
	current.stats = current.stats.filter((row) => row.season !== 2025);
	current.salaries = current.salaries.filter((row) => row.season !== 2025);
	await idb.cache.players.put(current);
	await idb.cache.flush(undefined, {
		league: idb.league,
		updateLastPlayed: false,
	});
	const beforeEvents = structuredClone(await idb.cache.events.getAll());
	let error: unknown;
	try {
		await applySigningTransaction({
			context,
			player: stale,
			tid: 0,
			contract: { amount: 33000, exp: 2031 },
			phase: PHASE.FREE_AGENCY,
			durability: "immediate",
		});
	} catch (error_) {
		error = error_;
	}
	assert.instanceOf(error, Error);
	assert.deepStrictEqual(await idb.cache.players.get(pid), current);
	assert.deepStrictEqual(await readDurablePlayer(), current);
	assert.deepStrictEqual(await idb.cache.events.getAll(), beforeEvents);
});

test.each([false, true])(
	"AI qualifying prior team can sign its open-FA five-year market ask (over cap: %s)",
	async (overCap) => {
		await prepareIncumbent(8, { tid: 1 });
		// Real re-sign phase releases him because the AI chooses to test the market.
		const valueChange = vi.spyOn(team, "valueChange").mockResolvedValue(1);
		await newPhase(PHASE.RESIGN_PLAYERS, {} as any);
		valueChange.mockRestore();
		const released = (await idb.cache.players.get(pid))!;
		assert.strictEqual(released.tid, PLAYER.FREE_AGENT);
		assert.strictEqual(released.priorContractTid, 1);
		await newPhase(PHASE.FREE_AGENCY, {} as any);
		const cached = (await idb.cache.players.get(pid))!;
		assert.strictEqual(cached.contract.exp, 2031);
		assert.strictEqual(
			getEffectiveOfferAmount(cached.contract.amount, cached.contract.option),
			33000,
		);
		if (overCap) {
			const teammate = (
				await idb.cache.players.indexGetAll("playersByTid", 1)
			)[0]!;
			teammate.contract.amount = 98000;
			await idb.cache.players.put(teammate);
		}
		await freeAgents.autoSign();
		await idb.cache.flush(undefined, {
			league: idb.league,
			updateLastPlayed: false,
		});
		const signed = (await readDurablePlayer())!;
		assert.strictEqual(signed.tid, 1);
		assert.strictEqual(signed.contract.exp, 2031);
		assert.strictEqual(
			getEffectiveOfferAmount(signed.contract.amount, signed.contract.option),
			33000,
		);
		assert.isBelow(signed.contract.amount, 35000);
	},
);
