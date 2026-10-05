import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { freeAgents, player, team } from "../index.ts";
import { getMidLevelExceptionAmount } from "../contracts/contractMidLevel.ts";
import { getContractException } from "../contracts/contractLimits.ts";
import { getBasketballContractForMechanism } from "../contracts/contractTerm.ts";
import { getMinContractForPlayer } from "../contracts/contractMinimum.ts";
import {
	countStandardContracts,
	countTwoWayContracts,
	isTwoWayContract,
} from "../contracts/contractTwoWay.ts";

const makePlayer = ({
	tid,
	age = 30,
	draftRound = 2,
	draftYearsAgo = 8,
	ovr = 45,
	pot = 55,
	value = 45,
	valueNoPot = 42,
	contractAmount,
	contractType,
}: {
	tid: number;
	age?: number;
	draftRound?: number;
	draftYearsAgo?: number;
	ovr?: number;
	pot?: number;
	value?: number;
	valueNoPot?: number;
	contractAmount?: number;
	contractType?: "standard" | "twoWay";
}) => {
	const p = player.generate(
		tid,
		age,
		g.get("season") - draftYearsAgo,
		true,
		DEFAULT_LEVEL,
	);
	const ratings = p.ratings.at(-1)!;
	ratings.ovr = ovr;
	ratings.pot = pot;
	p.draft.round = draftRound;
	p.draft.pick = draftRound > 0 ? 45 : 0;
	p.value = value;
	p.valueNoPot = valueNoPot;
	if (contractAmount !== undefined) {
		p.contract.amount = contractAmount;
	}
	if (contractType !== undefined) {
		p.contract.type = contractType;
	}
	return p;
};

const makeEligibleTwoWayFreeAgent = (value = 45) =>
	makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 22,
		draftRound: 0,
		draftYearsAgo: 0,
		value,
		valueNoPot: 42,
		contractAmount: g.get("minContract"),
	});

const resetCacheForAutoSign = async ({
	aiStandardPlayers,
	aiTwoWayPlayers = 0,
	freeAgentPlayers,
}: {
	aiStandardPlayers: number;
	aiTwoWayPlayers?: number;
	freeAgentPlayers: ReturnType<typeof makePlayer>[];
}) => {
	const players = [
		...Array.from({ length: g.get("minRosterSize") }, () =>
			makePlayer({ tid: g.get("userTid") }),
		),
		...Array.from({ length: aiStandardPlayers }, () => makePlayer({ tid: 1 })),
		...Array.from({ length: aiTwoWayPlayers }, () =>
			makePlayer({
				tid: 1,
				age: 22,
				draftRound: 0,
				draftYearsAgo: 0,
				contractAmount: g.get("minContract"),
				contractType: "twoWay",
			}),
		),
		...freeAgentPlayers,
	];

	const teams = helpers.getTeamsDefault().slice(0, 2).map(team.generate);

	await resetCache({
		players,
		teams,
	});
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("numTeams", 2);
	g.setWithoutSavingToDB("numActiveTeams", 2);
});

afterEach(() => {
	vi.restoreAllMocks();
});

const autoSignWithoutRandomSkip = async () => {
	vi.spyOn(Math, "random")
		.mockImplementationOnce(() => 0.99)
		.mockImplementationOnce(() => 0.99);

	await freeAgents.autoSign();
};

test("AI team with available two-way slot can sign an eligible low-end young free agent to two-way", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		freeAgentPlayers: [makeEligibleTwoWayFreeAgent()],
	});

	await autoSignWithoutRandomSkip();

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	assert.strictEqual(countTwoWayContracts(players, 1), 1);
	assert.strictEqual(
		countStandardContracts(players, 1),
		g.get("maxRosterSize") - 2,
	);
	assert.strictEqual(
		players.some((p) => isTwoWayContract(p.contract)),
		true,
	);
});

test("autoSign skips an unavailable cached minimum ask and continues to a legal two-way candidate", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("salaryCap", 100000);
	g.setWithoutSavingToDB("minContractLength", 5);
	g.setWithoutSavingToDB("maxContractLength", 5);
	g.setWithoutSavingToDB("minRosterSize", 12);
	g.setWithoutSavingToDB("maxRosterSize", 15);
	const impossibleFA = makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 30,
		draftRound: 2,
		draftYearsAgo: 8,
		ovr: 70,
		pot: 70,
		value: 90,
		contractAmount: g.get("minContract"),
	});
	impossibleFA.contract.amount = getMinContractForPlayer(impossibleFA);
	const twoWayFA = makeEligibleTwoWayFreeAgent(45);
	await resetCacheForAutoSign({
		aiStandardPlayers: 12,
		freeAgentPlayers: [impossibleFA, twoWayFA],
	});
	const freeAgentPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	const impossibleFreeAgent = freeAgentPlayers.find((p) => p.value === 90)!;
	const legalTwoWayFreeAgent = freeAgentPlayers.find((p) => p.value === 45)!;

	const teamPlayersBefore = await idb.cache.players.indexGetAll(
		"playersByTid",
		1,
	);
	assert.strictEqual(teamPlayersBefore.length, 12);
	teamPlayersBefore[0]!.contract.amount = 120000;
	await idb.cache.players.put(teamPlayersBefore[0]!);
	const rosterContractsBefore = new Map(
		teamPlayersBefore.map((p) => [p.pid, structuredClone(p.contract)]),
	);
	const impossibleBefore = await idb.cache.players.get(impossibleFreeAgent.pid);
	const twoWayBefore = await idb.cache.players.get(legalTwoWayFreeAgent.pid);
	const teamBefore = await idb.cache.teams.get(1);
	const eventsBefore = await idb.cache.events.getAll();
	assert.isDefined(impossibleBefore);
	assert.isDefined(twoWayBefore);
	assert.isDefined(teamBefore);
	assert.strictEqual(
		impossibleBefore!.contract.amount,
		getMinContractForPlayer(impossibleBefore!),
	);
	assert.isAbove(await team.getPayroll(1), g.get("salaryCap"));

	let error: unknown;
	try {
		await autoSignWithoutRandomSkip();
	} catch (error_) {
		error = error_;
	}

	assert.isUndefined(
		error,
		`an unavailable capSpace/minimum term must be skipped without aborting autoSign: ${String(error)}`,
	);
	const skippedAfter = await idb.cache.players.get(impossibleFreeAgent.pid);
	const legalAfter = await idb.cache.players.get(legalTwoWayFreeAgent.pid);
	assert.strictEqual(skippedAfter?.tid, PLAYER.FREE_AGENT);
	assert.deepStrictEqual(
		skippedAfter,
		impossibleBefore,
		"the impossible cached free agent must remain unchanged",
	);
	assert.strictEqual(legalAfter?.tid, 1);
	assert.isTrue(isTwoWayContract(legalAfter!.contract));
	assert.strictEqual(
		countTwoWayContracts(
			await idb.cache.players.indexGetAll("playersByTid", 1),
			1,
		),
		1,
	);
	for (const [pid, contract] of rosterContractsBefore) {
		assert.deepStrictEqual(
			(await idb.cache.players.get(pid))?.contract,
			contract,
			"skipping the unavailable quote must not alter an existing roster contract",
		);
	}
	assert.strictEqual(
		(await idb.cache.teams.get(1))?.midLevelExceptionUsedSeason,
		teamBefore!.midLevelExceptionUsedSeason,
		"a skipped cached quote must not consume a team exception marker",
	);
	const eventsAfter = await idb.cache.events.getAll();
	assert.deepStrictEqual(
		eventsAfter.filter((event) =>
			event.pids?.includes(impossibleFreeAgent.pid),
		),
		eventsBefore.filter((event) =>
			event.pids?.includes(impossibleFreeAgent.pid),
		),
		"the unavailable FA must not produce a signing event",
	);
	assert.isTrue(
		eventsAfter.some((event) => event.pids?.includes(legalTwoWayFreeAgent.pid)),
		"autoSign must continue and commit the legal two-way candidate",
	);
});

test("autoSign skips a stale five-year ask when all hard-cap mechanisms are unavailable", async () => {
	g.setWithoutSavingToDB("salaryCapType", "hard");
	g.setWithoutSavingToDB("salaryCap", 1000000);
	g.setWithoutSavingToDB("minContractLength", 5);
	g.setWithoutSavingToDB("maxContractLength", 5);
	g.setWithoutSavingToDB("minRosterSize", 12);
	g.setWithoutSavingToDB("maxRosterSize", 15);
	const staleCapSpaceFA = makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 25,
		draftRound: 2,
		draftYearsAgo: 3,
		ovr: 70,
		pot: 70,
		value: 90,
		contractAmount: 20000,
	});
	staleCapSpaceFA.contract.exp = g.get("season") + 5;
	await resetCacheForAutoSign({
		aiStandardPlayers: 12,
		freeAgentPlayers: [staleCapSpaceFA],
	});
	const candidate = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	).find((p) => p.value === 90)!;
	const candidateContractBefore = structuredClone(candidate.contract);
	const teamBefore = await idb.cache.teams.get(1);
	const eventsBefore = await idb.cache.events.getAll();
	const payroll = await team.getPayroll(1);
	const candidateTeam = await idb.cache.teams.get(1);
	assert.isUndefined(
		getContractException({
			birdException: false,
			contract: candidate.contract,
			p: candidate,
			payroll,
			team: candidateTeam,
		}).type,
		"the cached five-year term does not qualify for any capped exception despite available payroll",
	);
	assert.isNull(
		getBasketballContractForMechanism(candidate, "capSpace"),
		"the capSpace mechanism must be unavailable with a five-year configured minimum",
	);

	let error: unknown;
	try {
		await autoSignWithoutRandomSkip();
	} catch (error_) {
		error = error_;
	}

	assert.isUndefined(
		error,
		`autoSign must not pass its affordable but mechanism-illegal cached term to signing: ${String(error)}`,
	);
	const after = await idb.cache.players.get(candidate.pid);
	assert.strictEqual(after?.tid, PLAYER.FREE_AGENT);
	assert.deepStrictEqual(after?.contract, candidateContractBefore);
	assert.strictEqual(
		(await idb.cache.teams.get(1))?.midLevelExceptionUsedSeason,
		teamBefore?.midLevelExceptionUsedSeason,
	);
	assert.deepStrictEqual(
		(await idb.cache.events.getAll()).filter((event) =>
			event.pids?.includes(candidate.pid),
		),
		eventsBefore.filter((event) => event.pids?.includes(candidate.pid)),
	);
});

test("AI team with three existing two-way contracts does not sign a fourth two-way", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		aiTwoWayPlayers: 3,
		freeAgentPlayers: [makeEligibleTwoWayFreeAgent()],
	});

	await autoSignWithoutRandomSkip();

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	const freeAgentPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	assert.strictEqual(countTwoWayContracts(players, 1), 3);
	assert.strictEqual(freeAgentPlayers.length, 1);
});

test("AI does not sign first-round or normal rotation young players to two-way", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		freeAgentPlayers: [
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				age: 22,
				draftRound: 1,
				draftYearsAgo: 0,
				contractAmount: g.get("minContract"),
			}),
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				age: 22,
				draftRound: 2,
				draftYearsAgo: 2,
				ovr: 52,
				pot: 63,
				value: 62,
				valueNoPot: 52,
				contractAmount: g.get("minContract"),
			}),
		],
	});

	await autoSignWithoutRandomSkip();

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	const freeAgentPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	assert.strictEqual(countTwoWayContracts(players, 1), 0);
	assert.strictEqual(freeAgentPlayers.length, 2);
});

test("AI two-way signing does not fill standard minimum roster size", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("minRosterSize") - 1,
		freeAgentPlayers: [makeEligibleTwoWayFreeAgent()],
	});

	await autoSignWithoutRandomSkip();

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	assert.strictEqual(countTwoWayContracts(players, 1), 0);
	assert.strictEqual(
		countStandardContracts(players, 1),
		g.get("minRosterSize"),
	);
});

test("AI can use MLE once when cap space is insufficient", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		freeAgentPlayers: [
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				contractAmount: getMidLevelExceptionAmount() - 500,
				value: 80,
				valueNoPot: 80,
			}),
		],
	});

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	players[0]!.contract.amount = g.get("salaryCap") - 4000;
	await idb.cache.players.put(players[0]!);

	await autoSignWithoutRandomSkip();

	const teamAfter = await idb.cache.teams.get(1);
	const roster = await idb.cache.players.indexGetAll("playersByTid", 1);
	assert.strictEqual(teamAfter?.midLevelExceptionUsedSeason, g.get("season"));
	assert.strictEqual(
		roster.some((p) => p.contract.exception === "midLevel"),
		true,
	);
});

test("AI may temporarily exceed the standard roster limit, then real roster repair keeps the signing and cuts the worst player", async () => {
	g.setWithoutSavingToDB("salaryCapType", "none");
	const candidate = makePlayer({
		tid: PLAYER.FREE_AGENT,
		ovr: 90,
		pot: 90,
		value: 100,
		valueNoPot: 100,
		contractAmount: g.get("minContract") + 5000,
	});
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize"),
		freeAgentPlayers: [candidate],
	});

	const rosterBefore = await idb.cache.players.indexGetAll("playersByTid", 1);
	const worstPlayer = rosterBefore[0]!;
	worstPlayer.value = -100;
	await idb.cache.players.put(worstPlayer);
	const candidatePid = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!.pid;
	// Keep the fixture's explicit values deterministic. checkRosterSizes itself is
	// real and still performs the actual release and post-repair roster sort.
	vi.spyOn(team, "rosterAutoSort").mockResolvedValue();

	await autoSignWithoutRandomSkip();

	const overLimitRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		1,
	);
	assert.strictEqual(
		countStandardContracts(overLimitRoster, 1),
		g.get("maxRosterSize") + 1,
	);
	assert.strictEqual(
		overLimitRoster.some((p) => p.pid === candidatePid),
		true,
	);
	const signingEvent = (await idb.cache.events.getAll()).find((event) =>
		event.pids?.includes(candidatePid),
	);
	assert.isDefined(signingEvent);

	assert.isUndefined(await team.checkRosterSizes("other"));

	const repairedRoster = await idb.cache.players.indexGetAll("playersByTid", 1);
	assert.strictEqual(
		countStandardContracts(repairedRoster, 1),
		g.get("maxRosterSize"),
	);
	const signedPlayer = await idb.cache.players.get(candidatePid);
	assert.strictEqual(signedPlayer?.tid, 1);
	assert.strictEqual(
		signedPlayer?.contract.amount,
		g.get("minContract") + 5000,
	);
	const releasedPlayer = await idb.cache.players.get(worstPlayer.pid);
	assert.strictEqual(releasedPlayer?.tid, PLAYER.FREE_AGENT);
	assert.strictEqual(
		(await idb.cache.events.get(signingEvent!.eid))?.pids?.includes(
			candidatePid,
		),
		true,
	);
});

test("AI MLE signing also remains atomic when a full standard roster temporarily goes over the limit", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize"),
		freeAgentPlayers: [
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				contractAmount: getMidLevelExceptionAmount() - 500,
				value: 80,
				valueNoPot: 80,
			}),
		],
	});
	const roster = await idb.cache.players.indexGetAll("playersByTid", 1);
	roster[0]!.contract.amount = g.get("salaryCap") - 4000;
	await idb.cache.players.put(roster[0]!);

	await autoSignWithoutRandomSkip();

	const overLimitRoster = await idb.cache.players.indexGetAll(
		"playersByTid",
		1,
	);
	assert.strictEqual(
		countStandardContracts(overLimitRoster, 1),
		g.get("maxRosterSize") + 1,
	);
	assert.strictEqual(
		overLimitRoster.some((p) => p.contract.exception === "midLevel"),
		true,
	);
	assert.strictEqual(
		(await idb.cache.teams.get(1))?.midLevelExceptionUsedSeason,
		g.get("season"),
	);
});

test("auto-signing reports core success when roster refresh fails", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		freeAgentPlayers: [
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				value: 80,
				valueNoPot: 80,
				contractAmount: getMidLevelExceptionAmount() - 500,
			}),
		],
	});
	const roster = await idb.cache.players.indexGetAll("playersByTid", 1);
	roster[0]!.contract.amount = g.get("salaryCap") - 4000;
	await idb.cache.players.put(roster[0]!);

	const rosterError = new Error("roster refresh failed");
	vi.spyOn(team, "rosterAutoSort").mockRejectedValue(rosterError);
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
	await autoSignWithoutRandomSkip();

	assert.strictEqual(warning.mock.calls.length > 0, true);
	const signed = await idb.cache.players.indexGetAll("playersByTid", 1);
	assert.strictEqual(signed.length, g.get("maxRosterSize") - 1);
});

test("auto-signing stages mutations for the outer day flush", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		freeAgentPlayers: [
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				value: 80,
				valueNoPot: 80,
				contractAmount: getMidLevelExceptionAmount() - 500,
			}),
		],
	});
	const roster = await idb.cache.players.indexGetAll("playersByTid", 1);
	roster[0]!.contract.amount = g.get("salaryCap") - 4000;
	await idb.cache.players.put(roster[0]!);
	const flush = vi.spyOn(idb.cache, "flush");

	await autoSignWithoutRandomSkip();

	assert.strictEqual(flush.mock.calls.length, 0);
	assert.strictEqual(idb.cache._dirty, true);
});

test("AI does not use MLE twice in the same season", async () => {
	await resetCacheForAutoSign({
		aiStandardPlayers: g.get("maxRosterSize") - 2,
		freeAgentPlayers: [
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				contractAmount: getMidLevelExceptionAmount() - 500,
				value: 80,
				valueNoPot: 80,
			}),
			makePlayer({
				tid: PLAYER.FREE_AGENT,
				contractAmount: getMidLevelExceptionAmount() - 400,
				value: 79,
				valueNoPot: 79,
			}),
		],
	});

	const players = await idb.cache.players.indexGetAll("playersByTid", 1);
	players[0]!.contract.amount = g.get("salaryCap") - 4000;
	await idb.cache.players.put(players[0]!);

	await autoSignWithoutRandomSkip();
	await autoSignWithoutRandomSkip();

	const teamAfter = await idb.cache.teams.get(1);
	const freeAgentPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	assert.strictEqual(teamAfter?.midLevelExceptionUsedSeason, g.get("season"));
	assert.strictEqual(freeAgentPlayers.length, 1);
});

test("AI free agency requotes a cached supermax ask using the signing team's four-year ceiling", async () => {
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	g.setWithoutSavingToDB("salaryCap", 100000);
	g.setWithoutSavingToDB("salaryCapType", "soft");
	const p = makePlayer({
		tid: PLAYER.FREE_AGENT,
		age: 27,
		draftYearsAgo: 8,
		ovr: 70,
		pot: 70,
		value: 70,
		valueNoPot: 70,
		contractAmount: 33000,
	});
	p.draft.originalTid = 1;
	p.stats = Array.from({ length: 8 }, (_, i) => ({
		season: g.get("season") - 7 + i,
		tid: 1,
	})) as typeof p.stats;
	p.transactions = [];
	p.salaries = [];
	p.awards = [{ season: g.get("season"), type: "Most Valuable Player" }];
	p.contract.exp = g.get("season") + 5;
	await resetCacheForAutoSign({ aiStandardPlayers: 0, freeAgentPlayers: [p] });
	const candidate = (
		await idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT)
	)[0]!;
	await autoSignWithoutRandomSkip();
	const signed = (await idb.cache.players.get(candidate.pid))!;
	assert.strictEqual(signed.tid, 1);
	assert.strictEqual(signed.contract.exp, g.get("season") + 4);
	assert.isAtMost(signed.contract.amount, 30000);
	assert.isAtLeast(signed.contract.amount, 27000);
});
