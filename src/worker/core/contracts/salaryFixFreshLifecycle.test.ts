import "fake-indexeddb/auto";
import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { mockIDBLeague, resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { captureSigningContext } from "../capturedContext.ts";
import { applySigningTransaction } from "../signingTransaction.ts";
import {
	player,
	team,
	freeAgents,
	contractNegotiation,
	draft,
	finances,
	realRosters,
	league,
} from "../index.ts";
import { getContractDemandResults } from "../freeAgents/contractDemands.ts";
import {
	getBasketballContractForMechanism,
	getBasketballContractYears,
	getContractYearsFromExpiration,
} from "./contractTerm.ts";
import {
	getEffectiveOfferAmount,
	getRealAmountForEffectiveOffer,
} from "./contractOption.ts";
import {
	getContractCapHit,
	getMinContractForPlayer,
} from "./contractMinimum.ts";
import {
	clampContractAmountForPlayer,
	getMaxContractForPlayer,
} from "./contractLimits.ts";
import { getContractException } from "./contractLimits.ts";
import { getMidLevelExceptionAmount } from "./contractMidLevel.ts";
import { getBasketballContractMarketDemand } from "./contractMarket/index.ts";
import { getIncumbentInjuredAsk } from "./contractMarket/injuryAdjustment.ts";
import updateNegotiation from "../../views/negotiation.ts";
import newPhaseResignPlayers from "../phase/newPhaseResignPlayers.ts";
import newPhasePreseason from "../phase/newPhasePreseason.ts";
import * as rotationReconciliation from "../team/reconcileBasketballRotation.ts";
import * as signingTransaction from "../signingTransaction.ts";

const makePlayer = ({
	tid,
	age = 24,
	draftYearsAgo = 4,
	ovr = 60,
	pot = 60,
	value = 60,
	contractAmount = 1000,
	exp,
	injuryGames = 0,
}: {
	tid: number;
	age?: number;
	draftYearsAgo?: number;
	ovr?: number;
	pot?: number;
	value?: number;
	contractAmount?: number;
	exp?: number;
	injuryGames?: number;
}) => {
	const p = player.generate(
		tid,
		age,
		g.get("season") - draftYearsAgo,
		true,
		DEFAULT_LEVEL,
	);
	p.ratings.at(-1)!.ovr = ovr;
	p.ratings.at(-1)!.pot = pot;
	p.ratings.at(-1)!.season = g.get("season");
	p.draft.year = g.get("season") - draftYearsAgo;
	p.draft.round = 2;
	p.draft.pick = 45;
	p.value = value;
	p.valueNoPot = value;
	p.contract = {
		amount: contractAmount,
		exp: exp ?? g.get("season") + 4,
	};
	p.injury =
		injuryGames > 0
			? { type: "Knee Injury", gamesRemaining: injuryGames }
			: { type: "Healthy", gamesRemaining: 0 };
	return p;
};

const resetLeague = async (players: ReturnType<typeof makePlayer>[]) => {
	const teams = helpers
		.getTeamsDefault()
		.slice(0, 2)
		.map((row) => team.generate(row));
	await resetCache({ players, teams });
};

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("season", 2026);
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	g.setWithoutSavingToDB("salaryCapType", "soft");
	g.setWithoutSavingToDB("minContract", 1000);
	g.setWithoutSavingToDB("maxContract", 35000);
	g.setWithoutSavingToDB("salaryCap", 100000);
	g.setWithoutSavingToDB("minContractLength", 1);
	g.setWithoutSavingToDB("maxContractLength", 5);
	g.setWithoutSavingToDB("numGames", 82);
	g.setWithoutSavingToDB("numTeams", 2);
	g.setWithoutSavingToDB("numActiveTeams", 2);
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB("userTids", [0]);
	await resetLeague([
		makePlayer({ tid: 0, age: 30, draftYearsAgo: 8, ovr: 60, value: 60 }),
		makePlayer({ tid: 0, age: 28, draftYearsAgo: 6, ovr: 55, value: 55 }),
		makePlayer({ tid: PLAYER.FREE_AGENT, value: 50 }),
	]);
});

afterEach(() => {
	vi.restoreAllMocks();
});

test.each(["player", "team"] as const)(
	"mechanism re-derivation preserves an existing %s option's real salary",
	async (option) => {
		g.setWithoutSavingToDB("salaryCapType", "hard");
		const p = await idb.cache.players.get(2);
		assert.isDefined(p);
		p!.ratings.at(-1)!.ovr = 75;
		p!.ratings.at(-1)!.pot = 75;
		p!.value = 75;
		p!.born.year = 2000;
		p!.contract = {
			amount: 11000,
			exp: 2031,
			option,
		};
		await idb.cache.players.put(p!);

		const quote = getBasketballContractForMechanism(p!, "capSpace", {
			context: captureSigningContext(),
			realAmount: p!.contract.amount,
		});

		assert.isDefined(quote);
		assert.strictEqual(
			quote!.amount,
			11000,
			"p.contract.amount is already the real annual salary",
		);
		assert.strictEqual(quote!.option, option);
		assert.strictEqual(
			getContractYearsFromExpiration({
				expiration: quote!.exp,
				context: captureSigningContext(),
			}),
			4,
			"a five-year stored ask must be re-derived at the capSpace four-year maximum",
		);
		assert.strictEqual(quote!.exp, 2030);
		const effective = getEffectiveOfferAmount(quote!.amount, quote!.option);
		assert.strictEqual(
			getRealAmountForEffectiveOffer(effective, quote!.option),
			quote!.amount,
			"effective -> real -> effective round-trip preserves the real quote",
		);
	},
);

test("minimum mechanism drops a player option that would price real salary below player minimum", async () => {
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	p!.born.year = 1996;
	p!.draft.year = 2018;
	p!.ratings.at(-1)!.ovr = 80;
	p!.ratings.at(-1)!.pot = 80;
	p!.contract = {
		amount: getMinContractForPlayer(p!),
		exp: 2028,
		option: "player",
	};
	await idb.cache.players.put(p!);

	const minimum = getMinContractForPlayer(p!);
	const quote = getBasketballContractForMechanism(p!, "minimum", {
		context: captureSigningContext(),
	});

	assert.isDefined(quote);
	assert.isUndefined(
		quote!.option,
		"a minimum exception quote cannot retain an option that changes its legal real salary",
	);
	assert.isAtLeast(quote!.amount, minimum);
	assert.strictEqual(quote!.amount, minimum);
});

test("a one-year minimum quote cannot carry a PO or TO", async () => {
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	p!.born.year = g.get("season") - 25;
	p!.ratings.at(-1)!.ovr = 40;
	p!.ratings.at(-1)!.pot = 40;
	p!.contract = { amount: 1000, exp: 2028, option: "team" };
	await idb.cache.players.put(p!);

	const quote = getBasketballContractForMechanism(p!, "minimum", {
		context: captureSigningContext(),
	});

	assert.isDefined(quote);
	assert.strictEqual(
		getContractYearsFromExpiration({ expiration: quote!.exp }),
		1,
	);
	assert.isUndefined(quote!.option);
});

test("no-cap S1 honors a configured seven-year maximum without capped-mechanism limits", async () => {
	g.setWithoutSavingToDB("salaryCapType", "none");
	g.setWithoutSavingToDB("maxContractLength", 7);
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	p!.ratings.at(-1)!.ovr = 80;
	p!.ratings.at(-1)!.pot = 80;
	await idb.cache.players.put(p!);

	const first = getBasketballContractYears(p!);
	const second = getBasketballContractYears(p!);
	assert.strictEqual(first, 7);
	assert.strictEqual(second, first);
});

test.each(["player", "team"] as const)(
	"a queued one-year %s option is rejected before any signing mutation",
	async (option) => {
		const p = await idb.cache.players.get(2);
		const currentTeam = await idb.cache.teams.get(1);
		assert.isDefined(p);
		assert.isDefined(currentTeam);
		const context = captureSigningContext();
		assert.isUndefined(
			await contractNegotiation.create(p!.pid, true, 1, context),
		);
		const originalPlayer = structuredClone(p);
		const originalTeam = structuredClone(currentTeam);
		const originalNegotiation = await idb.cache.negotiations.get(p!.pid);
		assert.isDefined(originalNegotiation);
		const originalEvents = await idb.cache.events.getAll();
		let error: unknown;
		try {
			await applySigningTransaction({
				context,
				player: p!,
				tid: 1,
				contract: {
					amount: 5000,
					exp: context.season + 1,
					option,
				},
				phase: context.phase,
				durability: "deferred",
			});
		} catch (error_) {
			error = error_;
		}

		const after = await idb.cache.players.get(p!.pid);
		const eventsAfter = await idb.cache.events.getAll();
		const rejectedWithoutMutation =
			error instanceof Error &&
			after?.tid === originalPlayer.tid &&
			JSON.stringify(after?.contract) ===
				JSON.stringify(originalPlayer.contract) &&
			JSON.stringify(await idb.cache.teams.get(currentTeam!.tid)) ===
				JSON.stringify(originalTeam) &&
			JSON.stringify(await idb.cache.negotiations.get(p!.pid)) ===
				JSON.stringify(originalNegotiation) &&
			JSON.stringify(eventsAfter) === JSON.stringify(originalEvents);
		assert.isTrue(
			rejectedWithoutMutation,
			`invalid one-year ${option} option must be rejected and leave player/events unchanged`,
		);
	},
);

test("a stale five-year MLE contract is rejected before player, team, or event mutation", async () => {
	g.setWithoutSavingToDB("salaryCapType", "soft");
	g.setWithoutSavingToDB("maxContractLength", 7);
	const p = await idb.cache.players.get(2);
	const currentTeam = await idb.cache.teams.get(1);
	assert.isDefined(p);
	assert.isDefined(currentTeam);
	const originalPlayer = structuredClone(p);
	const originalTeam = structuredClone(currentTeam);
	const context = captureSigningContext();
	assert.isUndefined(
		await contractNegotiation.create(p!.pid, true, currentTeam!.tid, context),
	);
	const originalNegotiation = await idb.cache.negotiations.get(p!.pid);
	assert.isDefined(originalNegotiation);
	const originalEvents = await idb.cache.events.getAll();
	let error: unknown;
	try {
		await applySigningTransaction({
			context,
			player: p!,
			tid: 1,
			team: currentTeam!,
			negotiation: originalNegotiation!,
			contract: {
				amount: 5000,
				exp: context.season + 5,
				exception: "midLevel",
			},
			phase: context.phase,
			durability: "deferred",
		});
	} catch (error_) {
		error = error_;
	}

	assert.isTrue(
		error instanceof Error &&
			JSON.stringify(await idb.cache.players.get(p!.pid)) ===
				JSON.stringify(originalPlayer) &&
			JSON.stringify(await idb.cache.teams.get(currentTeam!.tid)) ===
				JSON.stringify(originalTeam) &&
			JSON.stringify(await idb.cache.negotiations.get(p!.pid)) ===
				JSON.stringify(originalNegotiation) &&
			JSON.stringify(await idb.cache.events.getAll()) ===
				JSON.stringify(originalEvents),
		"an MLE mechanism may not commit a term longer than its frozen four-year maximum",
	);
});

test("a stale five-year hard-cap capSpace contract is rejected before mutation", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("maxContractLength", 7);
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	const context = captureSigningContext();
	assert.isUndefined(
		await contractNegotiation.create(p!.pid, true, 1, context),
	);
	const originalPlayer = structuredClone(p);
	const originalNegotiation = await idb.cache.negotiations.get(p!.pid);
	assert.isDefined(originalNegotiation);
	const originalEvents = await idb.cache.events.getAll();
	let error: unknown;
	try {
		await applySigningTransaction({
			context,
			player: p!,
			tid: 1,
			negotiation: originalNegotiation!,
			contract: { amount: 5000, exp: context.season + 5 },
			phase: context.phase,
			durability: "deferred",
			exceptionValidator: {
				expected: "capSpace",
				validate: async () => "capSpace",
			},
		});
	} catch (error_) {
		error = error_;
	}

	assert.isTrue(
		error instanceof Error &&
			JSON.stringify(await idb.cache.players.get(p!.pid)) ===
				JSON.stringify(originalPlayer) &&
			JSON.stringify(await idb.cache.negotiations.get(p!.pid)) ===
				JSON.stringify(originalNegotiation) &&
			JSON.stringify(await idb.cache.events.getAll()) ===
				JSON.stringify(originalEvents),
		"a capped capSpace exception cannot carry a stale five-year term",
	);
});

test.each([
	"option salary below the player minimum",
	"team option salary above the player maximum",
	"player option removes the only healthy year",
] as const)(
	"queued transaction rejects %s before mutation",
	async (invalidity) => {
		const p = await idb.cache.players.get(2);
		const currentTeam = await idb.cache.teams.get(1);
		assert.isDefined(p);
		assert.isDefined(currentTeam);
		let option: "player" | "team";
		let amount: number;
		if (invalidity === "option salary below the player minimum") {
			option = "player";
			amount = getMinContractForPlayer(p!) - 1;
		} else if (invalidity === "team option salary above the player maximum") {
			option = "team";
			amount = getMaxContractForPlayer(p!) + 1;
		} else {
			option = "player";
			amount = getMinContractForPlayer(p!) + 1000;
			p!.injury = { type: "Knee Injury", gamesRemaining: 82 };
			await idb.cache.players.put(p!);
		}
		const context = captureSigningContext();
		assert.isUndefined(
			await contractNegotiation.create(p!.pid, true, currentTeam!.tid, context),
		);
		const originalPlayer = structuredClone(await idb.cache.players.get(p!.pid));
		const originalTeam = structuredClone(
			await idb.cache.teams.get(currentTeam!.tid),
		);
		const originalNegotiation = await idb.cache.negotiations.get(p!.pid);
		const originalEvents = await idb.cache.events.getAll();
		assert.isDefined(originalNegotiation);
		let error: unknown;
		try {
			await applySigningTransaction({
				context,
				player: p!,
				tid: currentTeam!.tid,
				team: currentTeam!,
				negotiation: originalNegotiation!,
				contract: {
					amount,
					exp: context.season + 2,
					option,
				},
				phase: context.phase,
				durability: "deferred",
			});
		} catch (error_) {
			error = error_;
		}

		assert.isTrue(
			error instanceof Error &&
				JSON.stringify(await idb.cache.players.get(p!.pid)) ===
					JSON.stringify(originalPlayer) &&
				JSON.stringify(await idb.cache.teams.get(currentTeam!.tid)) ===
					JSON.stringify(originalTeam) &&
				JSON.stringify(await idb.cache.negotiations.get(p!.pid)) ===
					JSON.stringify(originalNegotiation) &&
				JSON.stringify(await idb.cache.events.getAll()) ===
					JSON.stringify(originalEvents),
			`the queued signer must reject ${invalidity} before any durable mutation`,
		);
	},
);

test("a signing queued under a stale season context is rejected before mutation", async () => {
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	const context = captureSigningContext();
	assert.isUndefined(
		await contractNegotiation.create(p!.pid, true, 1, context),
	);
	const originalPlayer = structuredClone(p);
	const originalNegotiation = await idb.cache.negotiations.get(p!.pid);
	assert.isDefined(originalNegotiation);
	const originalEvents = await idb.cache.events.getAll();
	g.setWithoutSavingToDB("season", context.season + 1);
	let error: unknown;
	try {
		await applySigningTransaction({
			context,
			player: p!,
			tid: 1,
			negotiation: originalNegotiation!,
			contract: { amount: 5000, exp: context.season + 2 },
			phase: context.phase,
			durability: "deferred",
		});
	} catch (error_) {
		error = error_;
	}

	assert.isTrue(
		error instanceof Error &&
			JSON.stringify(await idb.cache.players.get(p!.pid)) ===
				JSON.stringify(originalPlayer) &&
			JSON.stringify(await idb.cache.negotiations.get(p!.pid)) ===
				JSON.stringify(originalNegotiation) &&
			JSON.stringify(await idb.cache.events.getAll()) ===
				JSON.stringify(originalEvents),
		"a queue captured for an earlier season must not commit after the live season changes",
	);
});

test("hard-cap demand generation propagates unavailable terms instead of inventing the configured minimum", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("minContractLength", 5);
	g.setWithoutSavingToDB("maxContractLength", 7);
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	p!.ratings.at(-1)!.ovr = 80;
	p!.ratings.at(-1)!.pot = 80;
	p!.value = 80;
	await idb.cache.players.put(p!);

	const results = getContractDemandResults({
		type: "freeAgentsOnly",
		playersAll: [p!],
		teams: [
			{ tid: 0, payroll: 0 },
			{ tid: 1, payroll: 0 },
		],
	});

	assert.isFalse(
		results.has(p!.pid),
		"hard-cap capSpace/minimum mechanisms are unavailable when min term is five",
	);
});

test.each(["soft", "hard", "none"] as const)(
	"updateNegotiation prices default-term PO/TO from healthy H before injury for %s incumbents",
	async (salaryCapType) => {
		g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
		g.setWithoutSavingToDB("salaryCapType", salaryCapType);
		g.setWithoutSavingToDB("salaryCap", 200000);
		g.setWithoutSavingToDB("maxContract", 100000);
		const p = await idb.cache.players.get(0);
		assert.isDefined(p);
		p!.tid = 0;
		p!.contract = { amount: 1000, exp: 2026 };
		p!.born.year = 2002;
		p!.ratings.at(-1)!.ovr = 60;
		p!.ratings.at(-1)!.pot = 60;
		p!.value = 60;
		p!.valueNoPot = 60;
		p!.injury = { type: "Knee Injury", gamesRemaining: 50 };
		await idb.cache.players.put(p!);

		await freeAgents.normalizeContractDemands({
			type: "includeExpiringContracts",
		});
		const incumbent = await idb.cache.players.get(p!.pid);
		assert.isDefined(incumbent);
		assert.isUndefined(
			incumbent!.contract.option,
			"fixture is a no-option incumbent ask before the user chooses an option",
		);
		const years = getContractYearsFromExpiration({
			expiration: incumbent!.contract.exp,
		});
		assert.isAtLeast(years, 2);
		const negotiationPlayer = structuredClone(incumbent!);
		negotiationPlayer.tid = PLAYER.FREE_AGENT;
		await idb.cache.players.put(negotiationPlayer);
		const createError = await contractNegotiation.create(
			negotiationPlayer.pid,
			true,
			0,
		);
		assert.isUndefined(createError);

		const view = await updateNegotiation(
			{ pid: negotiationPlayer.pid },
			["firstRun"],
			{},
		);
		assert.isDefined(view);
		assert.isTrue("contractOptions" in view!, JSON.stringify(view));
		const rows = (
			view as {
				contractOptions: Array<{
					years: number;
					amount: number;
					option?: "player" | "team";
					smallestAmount: boolean;
				}>;
			}
		).contractOptions;
		const defaultYears = rows.find((row) => row.smallestAmount)!.years;
		const defaultBaseRow = rows.find(
			(row) => row.years === defaultYears && row.option === undefined,
		);
		assert.isDefined(defaultBaseRow);
		const defaultOptionRows = rows.filter(
			(row) =>
				row.years === defaultYears &&
				(row.option === "player" || row.option === "team"),
		);
		assert.deepStrictEqual(
			defaultOptionRows.map((row) => row.option).sort(),
			["player", "team"],
			"the default term must expose both legal option choices",
		);

		const healthyH = clampContractAmountForPlayer(
			incumbent!,
			helpers.roundContract(
				Math.max(
					getMinContractForPlayer(incumbent!),
					getBasketballContractMarketDemand(incumbent!, defaultYears)
						.pointAmount,
				),
			),
		);
		const expectedDefault =
			getIncumbentInjuredAsk({
				p: incumbent!,
				healthyH,
				contractYears: defaultYears,
			}) / 1000;
		assert.strictEqual(defaultBaseRow!.amount, expectedDefault);
		const expectedByOption = new Map(
			(["player", "team"] as const).map((option) => [
				option,
				getIncumbentInjuredAsk({
					p: incumbent!,
					healthyH: getRealAmountForEffectiveOffer(healthyH, option),
					contractYears: defaultYears,
				}) / 1000,
			]),
		);
		for (const row of defaultOptionRows) {
			assert.strictEqual(
				row.amount,
				expectedByOption.get(row.option!)!,
				row.option + " must be applied to healthy H before the injury ask",
			);
		}

		const alternateYears = defaultYears === 5 ? 4 : defaultYears + 1;
		const viewOvr = (view as { p: { ratings: { ovr: number } } }).p.ratings.ovr;
		const growthFactor = 0.15 + (viewOvr % 10) * 0.01 - 0.05;
		const alternateFactor =
			1 + Math.abs(defaultYears - alternateYears) * growthFactor;
		const alternateHealthyH = clampContractAmountForPlayer(
			incumbent!,
			helpers.roundContract(
				Math.max(
					getMinContractForPlayer(incumbent!),
					getBasketballContractMarketDemand(incumbent!, alternateYears)
						.pointAmount * alternateFactor,
				),
			),
		);
		const alternateOptionRows = rows.filter(
			(row) =>
				row.years === alternateYears &&
				(row.option === "player" || row.option === "team"),
		);
		assert.isAtLeast(alternateOptionRows.length, 2);
		for (const row of alternateOptionRows) {
			const expectedAmount =
				getIncumbentInjuredAsk({
					p: incumbent!,
					healthyH: getRealAmountForEffectiveOffer(
						alternateHealthyH,
						row.option,
					),
					contractYears: alternateYears,
				}) / 1000;
			assert.strictEqual(
				row.amount,
				expectedAmount,
				JSON.stringify({
					option: row.option,
					defaultYears,
					alternateYears,
					growthFactor,
					alternateFactor,
					alternateHealthyH,
					expectedAmount,
				}),
			);
		}
	},
);

test("updateNegotiation keeps user mood pricing before options and injury on every incumbent term", async () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	g.setWithoutSavingToDB("salaryCapType", "soft");
	g.setWithoutSavingToDB("salaryCap", 200000);
	g.setWithoutSavingToDB("maxContract", 100000);
	const p = await idb.cache.players.get(0);
	assert.isDefined(p);
	p!.tid = 0;
	p!.contract = { amount: 1000, exp: 2026 };
	p!.born.year = 2002;
	p!.ratings.at(-1)!.ovr = 60;
	p!.ratings.at(-1)!.pot = 60;
	p!.value = 60;
	p!.injury = { type: "Knee Injury", gamesRemaining: 50 };
	p!.customMoodItems = [
		{ tid: 0, amount: -10, text: "Deterministic negative mood test" },
	];
	await idb.cache.players.put(p!);

	await freeAgents.normalizeContractDemands({
		type: "includeExpiringContracts",
	});
	const incumbent = await idb.cache.players.get(p!.pid);
	assert.isDefined(incumbent);
	assert.isUndefined(incumbent!.contract.option);
	const negotiationPlayer = structuredClone(incumbent!);
	negotiationPlayer.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(negotiationPlayer);
	assert.isUndefined(
		await contractNegotiation.create(negotiationPlayer.pid, true, 0),
	);

	const view = await updateNegotiation(
		{ pid: negotiationPlayer.pid },
		["firstRun"],
		{},
	);
	assert.isDefined(view);
	assert.isTrue("contractOptions" in view!, JSON.stringify(view));
	const rows = (
		view as {
			contractOptions: Array<{
				years: number;
				amount: number;
				option?: "player" | "team";
				smallestAmount: boolean;
			}>;
		}
	).contractOptions;
	const userMoodContractAmount = (
		view as {
			p: { mood: { user: { contractAmount: number } } };
		}
	).p.mood.user.contractAmount;
	assert.isAbove(
		userMoodContractAmount,
		incumbent!.contract.amount,
		"actual updateNegotiation must expose the custom negative mood premium for the user's team",
	);
	const defaultYears = rows.find((row) => row.smallestAmount)!.years;
	const alternateYears =
		defaultYears === 5 ? defaultYears - 1 : defaultYears + 1;
	const viewOvr = (view as { p: { ratings: { ovr: number } } }).p.ratings.ovr;
	const growthFactor = 0.15 + (viewOvr % 10) * 0.01 - 0.05;

	for (const years of [defaultYears, alternateYears]) {
		const termFactor = 1 + Math.abs(defaultYears - years) * growthFactor;
		const healthyV4 = clampContractAmountForPlayer(
			negotiationPlayer,
			helpers.roundContract(
				Math.max(
					getMinContractForPlayer(negotiationPlayer),
					getBasketballContractMarketDemand(negotiationPlayer, years)
						.pointAmount * termFactor,
				),
			),
		);
		const mood = await player.moodInfo(negotiationPlayer, 0, {
			contractAmount: healthyV4,
		});
		const healthyMoodH = mood.contractAmount;
		assert.isAbove(
			healthyMoodH,
			healthyV4,
			`the deterministic negative custom mood item must increase the healthy ${years}-year ask`,
		);

		const noOption = rows.find(
			(row) => row.years === years && row.option === undefined,
		);
		assert.isDefined(noOption, `${years}-year no-option row must be present`);
		const expectedNoOption =
			getIncumbentInjuredAsk({
				p: negotiationPlayer,
				healthyH: healthyMoodH,
				contractYears: years,
			}) / 1000;
		const moodNeutralNoOption =
			getIncumbentInjuredAsk({
				p: negotiationPlayer,
				healthyH: healthyV4,
				contractYears: years,
			}) / 1000;
		assert.isAbove(expectedNoOption, moodNeutralNoOption);
		assert.strictEqual(
			noOption!.amount,
			expectedNoOption,
			`${years}-year no-option ask must use mood-adjusted healthy H before the single injury adjustment`,
		);

		for (const option of ["player", "team"] as const) {
			const optionRow = rows.find(
				(row) => row.years === years && row.option === option,
			);
			assert.isDefined(
				optionRow,
				`${years}-year ${option} row must be present`,
			);
			const optionAdjustedHealthyH = getRealAmountForEffectiveOffer(
				healthyMoodH,
				option,
			);
			assert.strictEqual(
				optionRow!.amount,
				getIncumbentInjuredAsk({
					p: negotiationPlayer,
					healthyH: optionAdjustedHealthyH,
					contractYears: years,
				}) / 1000,
				`${years}-year ${option} must apply option economics to mood-adjusted healthy H before injury`,
			);
		}
	}
});

const onlyAIteamCanSign = async () => {
	const teams = await idb.cache.teams.getAll();
	for (const current of teams) {
		current.disabled = current.tid !== 1;
		await idb.cache.teams.put(current);
	}
	vi.spyOn(Math, "random").mockReturnValue(0.99);
};

test.each([
	{ games: 25, expectedWinner: "healthy" },
	{ games: 82, expectedWinner: "injured" },
])(
	"autoSign uses the signing team's real $games-game horizon and signs the expected FA",
	async ({ games, expectedWinner }) => {
		g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
		g.setWithoutSavingToDB("salaryCapType", "none");
		const injured = makePlayer({
			tid: PLAYER.FREE_AGENT,
			age: 25,
			ovr: 70,
			pot: 70,
			value: 80,
			contractAmount: 10000,
			exp: 2030,
			injuryGames: 20,
		});
		const healthy = makePlayer({
			tid: PLAYER.FREE_AGENT,
			age: 25,
			ovr: 65,
			pot: 65,
			value: 77,
			contractAmount: 10000,
			exp: 2030,
		});
		await resetLeague([injured, healthy]);
		await onlyAIteamCanSign();
		vi.spyOn(team, "rosterAutoSort").mockResolvedValue(undefined as any);
		for (let day = 0; day < games; day += 1) {
			await idb.cache.schedule.add({
				day,
				homeTid: 1,
				awayTid: 0,
			});
		}
		const freeAgentsBefore = await idb.cache.players.indexGetAll(
			"playersByTid",
			PLAYER.FREE_AGENT,
		);
		const injuredBefore = freeAgentsBefore.find((p) => p.value === 80)!;
		const healthyBefore = freeAgentsBefore.find((p) => p.value === 77)!;
		assert.isDefined(injuredBefore);
		assert.isDefined(healthyBefore);
		const injuredValue = injuredBefore.value;
		const healthyValue = healthyBefore.value;
		const injuredAsk = injuredBefore.contract.amount;
		const healthyAsk = healthyBefore.contract.amount;
		assert.strictEqual(
			(await idb.cache.schedule.getAll()).filter(
				(game) => game.homeTid === 1 || game.awayTid === 1,
			).length,
			games,
		);

		await freeAgents.autoSign();

		const signedInjured = await idb.cache.players.get(injuredBefore.pid);
		const signedHealthy = await idb.cache.players.get(healthyBefore.pid);
		const expected =
			expectedWinner === "injured" ? signedInjured : signedHealthy;
		const other = expectedWinner === "injured" ? signedHealthy : signedInjured;
		assert.strictEqual(
			expected?.tid,
			1,
			"autoSign must complete the signing selected by the team-specific priority",
		);
		assert.strictEqual(
			other?.tid,
			PLAYER.FREE_AGENT,
			"the alternative FA must not be signed",
		);
		assert.strictEqual(signedInjured?.value, injuredValue);
		assert.strictEqual(signedHealthy?.value, healthyValue);
		assert.strictEqual(signedInjured?.contract.amount, injuredAsk);
		assert.strictEqual(signedHealthy?.contract.amount, healthyAsk);
	},
);

test("an old four-year FA ask decaying to minimum is actually signed through the minimum exception", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	const overCapPlayer = makePlayer({
		tid: 1,
		age: 28,
		contractAmount: 120000,
		exp: 2030,
	});
	const oldAsk = makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 22,
		draftYearsAgo: 0,
		ovr: 50,
		pot: 55,
		value: 60,
		contractAmount: 1050,
		exp: 2030,
	});
	await resetLeague([overCapPlayer, oldAsk]);
	const oldFA = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;
	const oldFAContract = structuredClone(oldFA.contract);
	assert.strictEqual(
		getContractYearsFromExpiration({
			expiration: oldFA.contract.exp,
		}),
		4,
		"fixture begins with a cached four-year ask",
	);

	await freeAgents.decreaseDemands();
	const decayed = await idb.cache.players.get(oldFA.pid);
	assert.isDefined(decayed);
	assert.strictEqual(
		decayed!.contract.amount,
		getMinContractForPlayer(decayed!),
	);
	assert.strictEqual(decayed!.contract.exp, oldFAContract.exp);

	await onlyAIteamCanSign();
	await freeAgents.autoSign();

	const signed = await idb.cache.players.get(oldFA.pid);
	assert.strictEqual(
		signed?.tid,
		1,
		"the old cached ask must actually be signed",
	);
	assert.strictEqual(signed?.contract.amount, getMinContractForPlayer(signed!));
	assert.isAtMost(
		getContractYearsFromExpiration({
			expiration: signed!.contract.exp,
		}),
		2,
		"over-cap minimum signing must be no longer than two years",
	);
	assert.strictEqual(signed?.contract.option, undefined);
	assert.isTrue(
		(await idb.cache.events.getAll()).some((event) =>
			event.pids?.includes(oldFA.pid),
		),
		"successful selection must create a signing event",
	);
});

test("autoSign actually commits a cap-space quote", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	const capSpaceRosterPlayer = makePlayer({
		tid: 1,
		age: 28,
		contractAmount: 20000,
		exp: 2030,
	});
	const capSpaceFA = makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 24,
		draftYearsAgo: 4,
		ovr: 60,
		pot: 60,
		value: 60,
		contractAmount: 15000,
		exp: 2029,
	});
	await resetLeague([capSpaceRosterPlayer, capSpaceFA]);
	await onlyAIteamCanSign();
	const capSpaceFreeAgent = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;
	const payroll = await team.getPayroll(1);
	const capSpaceException = getContractException({
		birdException: false,
		contract: capSpaceFreeAgent.contract,
		p: capSpaceFreeAgent,
		payroll,
		team: await idb.cache.teams.get(1),
	});
	assert.strictEqual(capSpaceException.type, "capSpace");
	await freeAgents.autoSign();
	const signedCapSpace = await idb.cache.players.get(capSpaceFreeAgent.pid);
	assert.strictEqual(signedCapSpace?.tid, 1);
	assert.deepStrictEqual(signedCapSpace?.contract, capSpaceFreeAgent.contract);
});

test("autoSign actually commits an MLE quote with its marker", async () => {
	g.setWithoutSavingToDB("salaryCapType", "soft");
	const mle = getMidLevelExceptionAmount();
	const overCapRosterPlayer = makePlayer({
		tid: 1,
		age: 28,
		contractAmount: 120000,
		exp: 2030,
	});
	const mleFA = makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 24,
		draftYearsAgo: 4,
		ovr: 60,
		pot: 60,
		value: 60,
		contractAmount: mle - 500,
		exp: 2029,
	});
	await resetLeague([overCapRosterPlayer, mleFA]);
	await onlyAIteamCanSign();
	const mleFreeAgent = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;
	const mleQuote = getBasketballContractForMechanism(mleFreeAgent, "midLevel", {
		context: captureSigningContext(),
	});
	assert.isDefined(mleQuote);
	assert.isAtMost(mleQuote!.amount, mle);
	await freeAgents.autoSign();

	const signedMLE = await idb.cache.players.get(mleFreeAgent.pid);
	assert.strictEqual(
		signedMLE?.tid,
		1,
		"MLE candidate must actually be signed",
	);
	assert.strictEqual(signedMLE?.contract.exception, "midLevel");
	assert.strictEqual(signedMLE?.contract.amount, mleQuote!.amount);
	assert.isAtMost(
		getContractYearsFromExpiration({
			expiration: signedMLE!.contract.exp,
		}),
		4,
	);
	assert.strictEqual(
		(await idb.cache.teams.get(1))?.midLevelExceptionUsedSeason,
		captureSigningContext().mleSeason,
		"the actual MLE signing must consume the team marker",
	);
});

test("MLE derivation preserves a legal player-option real salary when effective demand exceeds the cap", async () => {
	const mle = getMidLevelExceptionAmount();
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	p!.born.year = 2002;
	p!.ratings.at(-1)!.ovr = 60;
	p!.ratings.at(-1)!.pot = 60;
	p!.value = 60;
	const sourceReal = helpers.roundContract(mle * 0.95);
	p!.contract = {
		amount: sourceReal,
		exp: g.get("season") + 4,
		option: "player",
	};
	await idb.cache.players.put(p!);
	const sourceEffective = getEffectiveOfferAmount(sourceReal, "player");
	assert.isBelow(sourceReal, mle);
	assert.isAbove(sourceEffective, mle);
	assert.strictEqual(
		getRealAmountForEffectiveOffer(sourceEffective, "player"),
		sourceReal,
		"rounded player-option real/effective conversion must round-trip exactly",
	);

	const quote = getBasketballContractForMechanism(p!, "midLevel", {
		context: captureSigningContext(),
	});
	assert.isDefined(
		quote,
		"a legal target real salary below MLE must be quotable",
	);
	assert.strictEqual(quote!.amount, sourceReal);
	assert.strictEqual(quote!.option, "player");
	assert.isAtMost(quote!.amount, mle);
	assert.strictEqual(
		getEffectiveOfferAmount(quote!.amount, quote!.option),
		sourceEffective,
		"MLE must preserve source economic demand instead of clipping effective demand to its real-salary cap",
	);
	assert.isAtMost(
		getContractYearsFromExpiration({
			expiration: quote!.exp,
			context: captureSigningContext(),
		}),
		4,
	);
});

test("MLE derivation drops an over-cap source team option when its effective demand has a legal no-option quote", async () => {
	const mle = getMidLevelExceptionAmount();
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	p!.born.year = 2002;
	p!.ratings.at(-1)!.ovr = 60;
	p!.ratings.at(-1)!.pot = 60;
	p!.value = 60;
	p!.valueNoPot = 60;
	const sourceReal = helpers.roundContract(mle * 1.05);
	p!.contract = {
		amount: sourceReal,
		exp: g.get("season") + 4,
		option: "team",
	};
	await idb.cache.players.put(p!);
	const sourceEffective = getEffectiveOfferAmount(sourceReal, "team");
	assert.isAbove(sourceReal, mle);
	assert.isBelow(sourceEffective, mle);
	assert.strictEqual(
		getRealAmountForEffectiveOffer(sourceEffective, "team"),
		sourceReal,
		"rounded team-option real/effective conversion must round-trip exactly",
	);

	const quote = getBasketballContractForMechanism(p!, "midLevel", {
		context: captureSigningContext(),
	});
	assert.isNotNull(
		quote,
		"source real salary above MLE must not reject a legal effective-demand target quote",
	);
	assert.isUndefined(
		quote!.option,
		"the source TO would require a target real salary above MLE, so use its legal no-option equivalent",
	);
	assert.strictEqual(quote!.amount, sourceEffective);
	assert.isAtMost(quote!.amount, mle);
	assert.strictEqual(
		getEffectiveOfferAmount(quote!.amount, quote!.option),
		sourceEffective,
	);
});

test("MLE derivation returns null when no target real salary can satisfy an above-cap no-option ask", async () => {
	const mle = getMidLevelExceptionAmount();
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	p!.contract = {
		amount: mle + 1000,
		exp: g.get("season") + 4,
	};
	await idb.cache.players.put(p!);

	assert.isNull(
		getBasketballContractForMechanism(p!, "midLevel", {
			context: captureSigningContext(),
		}),
		"an MLE quote cannot meet an unoptioned real-salary ask above its real salary limit",
	);
});

test("MLE can reselect a legal PO when an above-cap no-option ask has a legal target real salary", async () => {
	const mle = getMidLevelExceptionAmount();
	const p = await idb.cache.players.get(2);
	assert.isDefined(p);
	p!.born.year = 2002;
	p!.ratings.at(-1)!.ovr = 80;
	p!.ratings.at(-1)!.pot = 80;
	p!.value = 80;
	const sourceEffective = helpers.roundContract(mle * 1.05);
	p!.contract = {
		amount: sourceEffective,
		exp: g.get("season") + 4,
	};
	await idb.cache.players.put(p!);
	assert.isAbove(sourceEffective, mle);

	const quote = getBasketballContractForMechanism(p!, "midLevel", {
		context: captureSigningContext(),
	});
	assert.isNotNull(
		quote,
		"the player's legal PO may convert an above-cap effective demand into a legal target real salary",
	);
	assert.strictEqual(quote!.option, "player");
	assert.isAtMost(quote!.amount, mle);
	assert.strictEqual(
		getEffectiveOfferAmount(quote!.amount, quote!.option),
		sourceEffective,
		"the target PO must preserve the source economic demand exactly",
	);
});

test("autoSign commits an option-bearing cached ask through MLE without clipping its real salary", async () => {
	g.setWithoutSavingToDB("salaryCapType", "soft");
	const mle = getMidLevelExceptionAmount();
	const overCapRosterPlayer = makePlayer({
		tid: 1,
		age: 28,
		contractAmount: 120000,
		exp: 2030,
	});
	const sourceReal = helpers.roundContract(mle * 0.95);
	const mleFA = makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 24,
		draftYearsAgo: 4,
		ovr: 80,
		pot: 80,
		value: 80,
		contractAmount: sourceReal,
		exp: 2030,
	});
	mleFA.contract.option = "player";
	await resetLeague([overCapRosterPlayer, mleFA]);
	await onlyAIteamCanSign();
	const mleFreeAgent = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;
	const sourceEffective = getEffectiveOfferAmount(
		mleFreeAgent.contract.amount,
		mleFreeAgent.contract.option,
	);
	assert.isBelow(mleFreeAgent.contract.amount, mle);
	assert.isAbove(sourceEffective, mle);

	await freeAgents.autoSign();

	const signedMLE = await idb.cache.players.get(mleFreeAgent.pid);
	assert.strictEqual(
		signedMLE?.tid,
		1,
		"the option-bearing FA must sign via MLE",
	);
	assert.strictEqual(signedMLE?.contract.amount, sourceReal);
	assert.strictEqual(signedMLE?.contract.option, "player");
	assert.strictEqual(signedMLE?.contract.exception, "midLevel");
	assert.isAtMost(
		getContractYearsFromExpiration({
			expiration: signedMLE!.contract.exp,
		}),
		4,
	);
	assert.strictEqual(
		(await idb.cache.teams.get(1))?.midLevelExceptionUsedSeason,
		captureSigningContext().mleSeason,
		"the actual MLE signing must consume the team marker",
	);
});

test("checkRosterSizes actually repairs an under-minimum AI roster with a legal minimum quote", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("minRosterSize", 2);
	g.setWithoutSavingToDB("maxRosterSize", 5);
	const existing = makePlayer({
		tid: 1,
		age: 29,
		contractAmount: 120000,
		exp: 2030,
	});
	const minimumFA = makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 24,
		draftYearsAgo: 4,
		ovr: 60,
		pot: 60,
		value: 55,
		contractAmount: 1000,
		exp: 2030,
	});
	await resetLeague([existing, minimumFA]);
	const candidate = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;

	await team.checkRosterSizes("other");

	const repaired = await idb.cache.players.get(candidate.pid);
	assert.strictEqual(
		repaired?.tid,
		1,
		"roster repair must sign the required player",
	);
	assert.strictEqual(
		repaired?.contract.amount,
		getMinContractForPlayer(repaired!),
	);
	assert.isAtMost(
		getContractYearsFromExpiration({
			expiration: repaired!.contract.exp,
		}),
		2,
	);
	assert.isTrue(
		(await idb.cache.events.getAll()).some((event) =>
			event.pids?.includes(candidate.pid),
		),
		"the roster repair must commit a signing event",
	);
});

test("checkRosterSizes leaves an unavailable hard-cap minimum mechanism uncommitted", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("minContractLength", 5);
	g.setWithoutSavingToDB("maxContractLength", 7);
	g.setWithoutSavingToDB("minRosterSize", 2);
	g.setWithoutSavingToDB("maxRosterSize", 5);
	const existing = makePlayer({
		tid: 1,
		contractAmount: 10000,
		exp: 2030,
	});
	const unavailableFA = makePlayer({
		tid: PLAYER.FREE_AGENT,
		contractAmount: 1000,
		exp: 2030,
	});
	await resetLeague([existing, unavailableFA]);
	const candidate = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;
	const originalContract = structuredClone(candidate.contract);
	const eventsBefore = await idb.cache.events.getAll();

	await team.checkRosterSizes("other");

	const after = await idb.cache.players.get(candidate.pid);
	const roster = await idb.cache.players.indexGetAll("playersByTid", 1);
	assert.strictEqual(after?.tid, PLAYER.FREE_AGENT);
	assert.deepStrictEqual(after?.contract, originalContract);
	assert.strictEqual(roster.length, 1);
	assert.deepStrictEqual(await idb.cache.events.getAll(), eventsBefore);
});

const runResignPhase = async (players: ReturnType<typeof makePlayer>[]) => {
	await resetLeague(players);
	vi.spyOn(player, "moodInfo").mockResolvedValue({ willing: true } as any);
	vi.spyOn(team, "valueChange").mockResolvedValue(-1);
	vi.spyOn(draft, "genPlayers").mockResolvedValue(undefined as any);
	vi.spyOn(Math, "random").mockReturnValue(0.99);
	return idb.cache.players.indexGetAll("playersByTid", 1);
};

test("newPhaseResignPlayers actually re-signs a willing hard-cap incumbent on a legal cap-space term", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const incumbent = makePlayer({
		tid: 1,
		age: 27,
		draftYearsAgo: 7,
		ovr: 80,
		pot: 80,
		value: 90,
		contractAmount: 1000,
		exp: 2026,
	});
	await runResignPhase([incumbent]);
	const before = (await idb.cache.players.indexGetAll("playersByTid", 1))[0]!;

	await newPhaseResignPlayers({} as any);

	const signed = await idb.cache.players.get(before.pid);
	assert.strictEqual(
		signed?.tid,
		1,
		"the willing incumbent must actually re-sign",
	);
	assert.isAtMost(
		getContractYearsFromExpiration({
			expiration: signed!.contract.exp,
		}),
		4,
		"hard-cap incumbent must use a capSpace term",
	);
	assert.isTrue(
		(await idb.cache.events.getAll()).some(
			(event) => event.type === "reSigned" && event.pids?.includes(before.pid),
		),
	);
});

test("hard-cap re-sign payroll subtracts a veteran-minimum contract's capHit", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	g.setWithoutSavingToDB("salaryCap", 11000);
	const existing = makePlayer({
		tid: 1,
		age: 28,
		draftYearsAgo: 8,
		ovr: 55,
		value: 50,
		contractAmount: 10000,
		exp: 2030,
	});
	const veteranMinimum = makePlayer({
		tid: 1,
		age: 38,
		draftYearsAgo: 10,
		ovr: 40,
		pot: 40,
		value: 40,
		contractAmount: 10000,
		exp: 2026,
	});
	veteranMinimum.contract.capHit = 5000;
	assert.strictEqual(getContractCapHit(veteranMinimum.contract), 5000);
	await runResignPhase([existing, veteranMinimum]);
	const veteranBefore = await idb.cache.players.get(veteranMinimum.pid!);
	assert.isDefined(veteranBefore);

	let phaseError: unknown;
	try {
		await newPhaseResignPlayers({} as any);
	} catch (error) {
		phaseError = error;
	}

	const after = await idb.cache.players.get(veteranMinimum.pid!);
	assert.isUndefined(
		phaseError,
		"capHit-aware payroll should decline the re-sign before the hard-cap commit validator throws",
	);
	assert.strictEqual(after?.tid, PLAYER.FREE_AGENT);
	assert.isFalse(
		(await idb.cache.events.getAll()).some(
			(event) =>
				event.type === "reSigned" && event.pids?.includes(veteranBefore!.pid),
		),
		"a veteran minimum cannot be signed past the cap by subtracting nominal salary instead of capHit",
	);
});

test("cheap-player gate uses healthy H and consumes RNG only below the true threshold", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	g.setWithoutSavingToDB("minContract", 1000);
	g.setWithoutSavingToDB("maxContract", 35000);
	const cheap = makePlayer({
		tid: 1,
		age: 22,
		draftYearsAgo: 0,
		ovr: 40,
		pot: 40,
		value: 0,
		contractAmount: 1000,
		exp: 2026,
	});
	let injured: ReturnType<typeof makePlayer> | undefined;
	let injuredHealthyH = 0;
	let injuredAsk = 0;
	const observed: Array<{
		ovr: number;
		years: number | null;
		healthyH: number;
		injuredAsk: number;
	}> = [];
	for (let value = 0; value <= 100; value += 1) {
		const candidate = makePlayer({
			tid: 1,
			age: 22,
			draftYearsAgo: 0,
			ovr: 44,
			pot: 44,
			value,
			contractAmount: 1000,
			exp: 2026,
			injuryGames: 82,
		});
		const years = getBasketballContractYears(candidate, {
			mechanism: "capSpace",
		});
		if (years !== 1) {
			continue;
		}
		const healthyH = clampContractAmountForPlayer(
			candidate,
			helpers.roundContract(
				getBasketballContractMarketDemand(candidate, years).pointAmount,
			),
		);
		const injuredAskValue = getIncumbentInjuredAsk({
			p: candidate,
			healthyH,
			contractYears: years,
		});
		observed.push({ ovr: value, years, healthyH, injuredAsk: injuredAskValue });
		if (healthyH > 2000 && injuredAskValue < 2000) {
			injured = candidate;
			injuredHealthyH = healthyH;
			injuredAsk = injuredAskValue;
			break;
		}
	}
	assert.isDefined(injured, JSON.stringify({ observed }));
	const cheapYears = getBasketballContractYears(cheap, {
		mechanism: "capSpace",
	});
	assert.strictEqual(cheapYears, 1);
	const cheapHealthyH = clampContractAmountForPlayer(
		cheap,
		helpers.roundContract(
			getBasketballContractMarketDemand(cheap, cheapYears!).pointAmount,
		),
	);
	assert.isBelow(cheapHealthyH, 2000);
	assert.isBelow(injuredAsk, 2000);
	assert.isAbove(injuredHealthyH, 2000);
	await runResignPhase([cheap, injured!]);
	const randomSpy = vi.spyOn(Math, "random").mockClear();
	const commit = signingTransaction.applySigningTransaction;
	const submittedContracts: Array<{
		pid: number;
		contract: { rookie?: boolean; option?: "player" | "team" };
	}> = [];
	vi.spyOn(signingTransaction, "applySigningTransaction").mockImplementation(
		async (input) => {
			submittedContracts.push({
				pid: input.player.pid,
				contract: input.contract,
			});
			return commit(input);
		},
	);
	try {
		await newPhaseResignPlayers({} as any);
	} catch (error) {
		assert.fail(JSON.stringify({ submittedContracts, error: String(error) }));
	}

	assert.strictEqual(
		(await idb.cache.players.get(cheap.pid!))?.tid,
		1,
		"the truly cheap incumbent's random gate allows this seeded result",
	);
	const cheapSubmission = submittedContracts.find(
		(submission) => submission.pid === cheap.pid,
	);
	assert.isDefined(cheapSubmission);
	assert.isTrue(cheapSubmission!.contract.rookie);
	assert.isUndefined(
		cheapSubmission!.contract.option,
		"a rookie contract must not carry a PO or TO",
	);
	assert.strictEqual(
		(await idb.cache.players.get(injured!.pid!))?.tid,
		1,
		"injury-discounted ask must not send healthy-H player through the cheap gate",
	);
	assert.strictEqual(
		randomSpy.mock.calls.length,
		3,
		"one below-threshold gate plus two hard-cap RNG decisions consumes three draws",
	);
});

test("newPhaseResignPlayers bases the next hard-cap decision on the actual prior signing", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const existing = makePlayer({
		tid: 1,
		age: 28,
		draftYearsAgo: 8,
		ovr: 55,
		pot: 55,
		value: 50,
		contractAmount: 1000,
		exp: 2030,
	});
	const first = makePlayer({
		tid: 1,
		age: 27,
		draftYearsAgo: 7,
		ovr: 80,
		pot: 80,
		value: 95,
		contractAmount: 1000,
		exp: 2026,
	});
	const second = makePlayer({
		tid: 1,
		age: 27,
		draftYearsAgo: 7,
		ovr: 80,
		pot: 80,
		value: 90,
		contractAmount: 1000,
		exp: 2026,
	});
	await runResignPhase([existing, first, second]);
	const teamPlayers = await idb.cache.players.indexGetAll("playersByTid", 1);
	const firstBefore = teamPlayers.find((p) => p.value === 95);
	const secondBefore = teamPlayers.find((p) => p.value === 90);
	assert.isDefined(firstBefore);
	assert.isDefined(secondBefore);
	await freeAgents.normalizeContractDemands({
		type: "includeExpiringContracts",
	});
	const normalizedFirst = await idb.cache.players.get(firstBefore!.pid);
	const normalizedSecond = await idb.cache.players.get(secondBefore!.pid);
	assert.isDefined(normalizedFirst);
	assert.isDefined(normalizedSecond);
	const firstOldAsk = normalizedFirst!.contract.amount;
	const secondAsk = normalizedSecond!.contract.amount;
	assert.isAbove(firstOldAsk, 10000);
	for (const p of [normalizedFirst!, normalizedSecond!]) {
		p.contract.exp = 2026;
		await idb.cache.players.put(p);
	}
	const existingPlayer = await idb.cache.players.get(existing.pid!);
	assert.isDefined(existingPlayer);
	existingPlayer!.contract.amount =
		g.get("salaryCap") - firstOldAsk - secondAsk;
	await idb.cache.players.put(existingPlayer!);
	const commit = signingTransaction.applySigningTransaction;
	const submittedAmounts: Array<{ pid: number; amount: number }> = [];
	vi.spyOn(signingTransaction, "applySigningTransaction").mockImplementation(
		async (input) => {
			submittedAmounts.push({
				pid: input.player.pid,
				amount: input.contract.amount,
			});
			const transactionInput =
				input.player.pid === firstBefore!.pid
					? {
							...input,
							contract: { ...input.contract, amount: 35000 },
						}
					: input;
			return commit(transactionInput);
		},
	);
	let phaseError: unknown;
	try {
		await newPhaseResignPlayers({} as any);
	} catch (error) {
		phaseError = error;
	}

	const firstSigned = await idb.cache.players.get(firstBefore!.pid);
	const secondSigned = await idb.cache.players.get(secondBefore!.pid);
	assert.isUndefined(
		phaseError,
		JSON.stringify({
			phaseError,
			submittedAmounts,
			first: firstSigned?.contract,
			second: secondSigned?.contract,
		}),
	);
	assert.strictEqual(firstSigned?.tid, 1);
	assert.strictEqual(
		firstSigned?.contract.amount,
		35000,
		"the transaction's actual first contract has the adjusted amount",
	);
	assert.deepStrictEqual(
		submittedAmounts.map((entry) => entry.pid),
		[firstBefore!.pid],
		"the second signing must be stopped before queueing when the actual prior deal uses the remaining cap",
	);
	assert.strictEqual(
		secondSigned?.tid,
		PLAYER.FREE_AGENT,
		"the second contract must not overrun the hard cap based on stale payroll",
	);
});

test("newPhaseResignPlayers completes the unavailable hard-cap path without a fake term or illegal signing", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	g.setWithoutSavingToDB("minContractLength", 5);
	g.setWithoutSavingToDB("maxContractLength", 7);
	const incumbent = makePlayer({
		tid: 1,
		age: 27,
		draftYearsAgo: 7,
		ovr: 80,
		pot: 80,
		value: 90,
		contractAmount: 1000,
		exp: 2026,
	});
	await runResignPhase([incumbent]);
	const before = (await idb.cache.players.indexGetAll("playersByTid", 1))[0]!;
	let phaseError: unknown;
	try {
		await newPhaseResignPlayers({} as any);
	} catch (error) {
		phaseError = error;
	}

	const after = await idb.cache.players.get(before.pid);
	const events = await idb.cache.events.getAll();
	const completedWithoutCommit =
		phaseError === undefined &&
		after?.tid === PLAYER.FREE_AGENT &&
		after.contract.exp === 2026 &&
		!events.some(
			(event) => event.type === "reSigned" && event.pids?.includes(before.pid),
		);
	assert.isTrue(
		completedWithoutCommit,
		"unavailable hard-cap mechanism must take the coherent non-re-sign path",
	);
});

test("newPhaseResignPlayers releases a soft-cap incumbent when every term mechanism is unavailable", async () => {
	g.setWithoutSavingToDB("salaryCapType", "soft");
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	g.setWithoutSavingToDB("minContractLength", 6);
	g.setWithoutSavingToDB("maxContractLength", 7);
	const incumbent = makePlayer({
		tid: 1,
		age: 27,
		draftYearsAgo: 7,
		ovr: 80,
		pot: 80,
		value: 90,
		contractAmount: 1000,
		exp: 2026,
	});
	await runResignPhase([incumbent]);
	const before = (await idb.cache.players.indexGetAll("playersByTid", 1))[0]!;
	const context = captureSigningContext();
	for (const mechanism of ["bird", "capSpace", "minimum"] as const) {
		assert.isNull(
			getBasketballContractYears(before, { mechanism, context }),
			`${mechanism} must be unavailable with a six-year configured minimum`,
		);
	}
	const teamBefore = await idb.cache.teams.get(1);
	const negotiationBefore = await idb.cache.negotiations.getAll();
	const signingSpy = vi.spyOn(signingTransaction, "applySigningTransaction");
	const randomSpy = vi.spyOn(Math, "random").mockClear();
	let phaseError: unknown;
	try {
		await newPhaseResignPlayers({} as any);
	} catch (error) {
		phaseError = error;
	}

	const after = await idb.cache.players.get(before.pid);
	const events = await idb.cache.events.getAll();
	assert.isUndefined(
		phaseError,
		`unavailable soft-cap mechanisms must not abort re-signing: ${String(phaseError)}`,
	);
	assert.strictEqual(after?.tid, PLAYER.FREE_AGENT);
	assert.strictEqual(after?.contract.exp, 2026);
	assert.strictEqual(after?.contract.amount, before.contract.amount);
	assert.isFalse(
		events.some(
			(event) => event.type === "reSigned" && event.pids?.includes(before.pid),
		),
		"an unavailable Bird term must not produce a re-sign event",
	);
	assert.strictEqual(signingSpy.mock.calls.length, 0);
	assert.strictEqual(
		randomSpy.mock.calls.length,
		0,
		"unavailable re-signing must not consume the AI skip-decision randomness",
	);
	assert.strictEqual(
		(await idb.cache.teams.get(1))?.midLevelExceptionUsedSeason,
		teamBefore?.midLevelExceptionUsedSeason,
	);
	assert.deepStrictEqual(
		await idb.cache.negotiations.getAll(),
		negotiationBefore,
		"an AI release must not leave negotiation state behind",
	);
});

test("newPhaseResignPlayers can re-sign a soft-cap Bird incumbent at a five-year minimum", async () => {
	g.setWithoutSavingToDB("salaryCapType", "soft");
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	g.setWithoutSavingToDB("minContractLength", 5);
	g.setWithoutSavingToDB("maxContractLength", 7);
	const incumbent = makePlayer({
		tid: 1,
		age: 27,
		draftYearsAgo: 7,
		ovr: 80,
		pot: 80,
		value: 90,
		contractAmount: 1000,
		exp: 2026,
	});
	await runResignPhase([incumbent]);
	const before = (await idb.cache.players.indexGetAll("playersByTid", 1))[0]!;
	const context = captureSigningContext();
	assert.strictEqual(
		getBasketballContractYears(before, { mechanism: "bird", context }),
		5,
	);
	assert.isNull(
		getBasketballContractYears(before, { mechanism: "capSpace", context }),
	);
	assert.isNull(
		getBasketballContractYears(before, { mechanism: "minimum", context }),
	);

	await newPhaseResignPlayers({} as any);

	const after = await idb.cache.players.get(before.pid);
	assert.strictEqual(after?.tid, 1);
	assert.strictEqual(
		getContractYearsFromExpiration({
			expiration: after!.contract.exp,
			context,
		}),
		5,
		"the legal Bird deal should retain the configured five-year minimum",
	);
	assert.isTrue(
		(await idb.cache.events.getAll()).some(
			(event) => event.type === "reSigned" && event.pids?.includes(before.pid),
		),
	);
});

test("newPhaseResignPlayers can use a configured six-year term in a no-cap league", async () => {
	g.setWithoutSavingToDB("salaryCapType", "none");
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	g.setWithoutSavingToDB("minContractLength", 6);
	g.setWithoutSavingToDB("maxContractLength", 6);
	const incumbent = makePlayer({
		tid: 1,
		age: 27,
		draftYearsAgo: 7,
		ovr: 80,
		pot: 80,
		value: 90,
		contractAmount: 1000,
		exp: 2026,
	});
	await runResignPhase([incumbent]);
	const before = (await idb.cache.players.indexGetAll("playersByTid", 1))[0]!;
	const context = captureSigningContext();
	assert.strictEqual(
		getBasketballContractYears(before, { context }),
		6,
		"no-cap term derivation must use the configured six-year minimum",
	);

	await newPhaseResignPlayers({} as any);

	const after = await idb.cache.players.get(before.pid);
	assert.strictEqual(after?.tid, 1);
	assert.strictEqual(
		getContractYearsFromExpiration({
			expiration: after!.contract.exp,
			context,
		}),
		6,
	);
	assert.isTrue(
		(await idb.cache.events.getAll()).some(
			(event) => event.type === "reSigned" && event.pids?.includes(before.pid),
		),
	);
});

const runForceHistoricalPreseason = async ({
	salaryCapType,
	minContractLength = 1,
	maxContractLength = 7,
}: {
	salaryCapType: "soft" | "hard" | "none";
	minContractLength?: number;
	maxContractLength?: number;
}) => {
	g.setWithoutSavingToDB("season", 2026);
	g.setWithoutSavingToDB("phase", PHASE.PRESEASON);
	g.setWithoutSavingToDB("salaryCapType", salaryCapType);
	g.setWithoutSavingToDB("minContractLength", minContractLength);
	g.setWithoutSavingToDB("maxContractLength", maxContractLength);
	g.setWithoutSavingToDB("forceHistoricalRosters", true);
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB("userTids", [0]);
	const historical = makePlayer({
		tid: 0,
		age: 26,
		draftYearsAgo: 6,
		ovr: 80,
		pot: 80,
		value: 80,
		contractAmount: 12345,
		exp: 2026,
	});
	historical.srID = "fresh-audit-player";
	historical.draft.year = 2020;
	await resetLeague([historical]);
	idb.league = mockIDBLeague();
	vi.spyOn(idb.meta, "get").mockResolvedValue(undefined);
	vi.spyOn(league, "setGameAttributes").mockImplementation(
		async (attributes) => {
			if (attributes.season !== undefined) {
				g.setWithoutSavingToDB("season", attributes.season);
			}
		},
	);
	vi.spyOn(finances, "getLevelLastThree").mockResolvedValue(1);
	vi.spyOn(finances, "defaultBudgetLevel").mockReturnValue(DEFAULT_LEVEL);
	vi.spyOn(team, "resetTicketPrice").mockResolvedValue();
	vi.spyOn(idb.getCopies, "teamSeasons").mockResolvedValue([] as any);
	vi.spyOn(player, "addRatingsRow").mockImplementation(() => {});
	vi.spyOn(player, "genContract").mockImplementation(
		() => ({ amount: 30000, exp: g.get("season") }) as any,
	);
	vi.spyOn(player, "develop").mockImplementation(async () => {});
	vi.spyOn(player, "updateValues").mockResolvedValue(undefined as any);
	vi.spyOn(freeAgents, "normalizeContractDemands").mockResolvedValue(undefined);
	vi.spyOn(rotationReconciliation, "default").mockResolvedValue(undefined);
	vi.spyOn(realRosters, "getPlayerActiveSeasons").mockImplementation(
		async () => {
			return {
				[historical.srID!]: { 2027: 0 },
			} as any;
		},
	);
	vi.spyOn(
		realRosters,
		"checkDisableForceHistoricalRosters",
	).mockResolvedValue();
	vi.spyOn(Math, "random").mockReturnValue(0.99);

	await newPhasePreseason({} as any);
	return idb.cache.players.get(historical.pid!);
};

test.each([
	{ salaryCapType: "hard" as const, expectedExpiration: 2030 },
	{ salaryCapType: "soft" as const, expectedExpiration: 2031 },
	{ salaryCapType: "none" as const, expectedExpiration: 2033 },
])(
	"forceHistoricalRosters uses $salaryCapType's actual mechanism term",
	async ({ salaryCapType, expectedExpiration }) => {
		const beforeAmount = 12345;
		const resignedHistorical = await runForceHistoricalPreseason({
			salaryCapType,
		});

		assert.strictEqual(resignedHistorical?.tid, 0);
		assert.strictEqual(
			resignedHistorical?.contract.exp,
			expectedExpiration,
			"the generated expiration must reflect capSpace 4 / Bird 5 / configured no-cap 7",
		);
		assert.notStrictEqual(resignedHistorical?.contract.amount, beforeAmount);
	},
);

test("forceHistoricalRosters does not invent a no-cap term when hard-cap capSpace is unavailable", async () => {
	const historical = await runForceHistoricalPreseason({
		salaryCapType: "hard",
		minContractLength: 5,
	});

	assert.strictEqual(historical?.tid, 0);
	assert.strictEqual(historical?.contract.exp, 2026);
	assert.strictEqual(historical?.contract.amount, 12345);
});
