import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { freeAgents, player, team } from "../index.ts";
import { getMidLevelExceptionAmount } from "../contracts/contractMidLevel.ts";
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
