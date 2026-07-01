import { assert, beforeEach, test } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { player, team } from "../index.ts";
import { getContractDemandResults } from "./contractDemands.ts";
import normalizeContractDemands from "./normalizeContractDemands.ts";

const makePlayer = (
	pid: number,
	{
		amount = 12000 + pid * 1000,
		age = 27,
		draftPick = 45,
		draftRound = 2,
		draftYearsAgo = 5,
		exp = g.get("season"),
		ovr = 50,
		pot = 55,
		value = 45,
		valueNoPot = 42,
		tid = PLAYER.FREE_AGENT,
	}: {
		amount?: number;
		age?: number;
		draftPick?: number;
		draftRound?: number;
		draftYearsAgo?: number;
		exp?: number;
		ovr?: number;
		pot?: number;
		value?: number;
		valueNoPot?: number;
		tid?: number;
	} = {},
) => {
	const p = player.generate(tid, age, g.get("season") - draftYearsAgo, true, 0);
	p.pid = pid;
	p.contract.amount = amount;
	p.contract.exp = exp;
	p.draft.round = draftRound;
	p.draft.pick = draftPick;
	p.ratings.at(-1)!.ovr = ovr;
	p.ratings.at(-1)!.pot = pot;
	p.value = value;
	p.valueNoPot = valueNoPot;
	return p;
};

const makeTeams = () =>
	helpers.getTeamsDefault()
		.slice(0, 2)
		.map((t) => team.generate(t));

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("numActiveTeams", 999);
	await resetCache({
		players: [makePlayer(1), makePlayer(2)],
		teams: makeTeams(),
	});
});

test("contract demand helper does not mutate original player objects", async () => {
	const playersAll = await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);
	const before = helpers.deepCopy(playersAll);

	getContractDemandResults({
		type: "freeAgentsOnly",
		playersAll,
		teams: [
			{ payroll: 0, tid: 0 },
			{ payroll: 0, tid: 1 },
		],
	});

	assert.deepStrictEqual(playersAll, before);
});

test("normalizeContractDemands writes the helper result", async () => {
	const playersAll = await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);
	const expected = getContractDemandResults({
		type: "freeAgentsOnly",
		playersAll,
		teams: [
			{ payroll: 0, tid: 0 },
			{ payroll: 0, tid: 1 },
		],
	});

	await normalizeContractDemands({ type: "freeAgentsOnly" });

	for (const [pid, result] of expected) {
		const p = await idb.cache.players.get(pid);
		assert.deepStrictEqual(p?.contract, result.contract);
	}
});

test("freeAgentsOnly updates only free agents", async () => {
	await resetCache({
		players: [
			makePlayer(1),
			makePlayer(2),
			makePlayer(3, { tid: 0, exp: g.get("season") }),
			makePlayer(4, { tid: 1, exp: g.get("season") }),
		],
		teams: makeTeams(),
	});

	const playersAll = await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);
	const results = getContractDemandResults({
		type: "freeAgentsOnly",
		playersAll,
		teams: [
			{ payroll: 0, tid: 0 },
			{ payroll: 0, tid: 1 },
		],
	});

	assert.deepStrictEqual([...results.keys()].sort((a, b) => a - b), [1, 2]);
});

test("includeExpiringContracts includes expiring players and free agents", async () => {
	await resetCache({
		players: [
			makePlayer(1),
			makePlayer(2, { tid: 0, exp: g.get("season") }),
			makePlayer(3, { tid: 1, exp: g.get("season") }),
			makePlayer(4, { tid: 0, exp: g.get("season") + 1 }),
		],
		teams: makeTeams(),
	});

	const playersAll = await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);
	const results = getContractDemandResults({
		type: "includeExpiringContracts",
		playersAll,
		teams: [
			{ payroll: 0, tid: 0 },
			{ payroll: 0, tid: 1 },
		],
	});

	assert.deepStrictEqual([...results.keys()].sort((a, b) => a - b), [1, 2, 3]);
});

test("pids filtering only updates targeted players", async () => {
	await resetCache({
		players: [makePlayer(1), makePlayer(2), makePlayer(3)],
		teams: makeTeams(),
	});

	const playersAll = await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);
	const results = getContractDemandResults({
		type: "freeAgentsOnly",
		playersAll,
		pids: [2],
		teams: [
			{ payroll: 0, tid: 0 },
			{ payroll: 0, tid: 1 },
		],
	});

	assert.deepStrictEqual([...results.keys()], [2]);
});

test("normalizeContractDemands can attach a player option to a high-value veteran", async () => {
	await resetCache({
		players: [
			makePlayer(1, {
				age: 30,
				draftYearsAgo: 10,
				ovr: 80,
				pot: 82,
				value: 82,
				valueNoPot: 80,
			}),
		],
		teams: makeTeams(),
	});

	await normalizeContractDemands({ type: "freeAgentsOnly" });

	const p = await idb.cache.players.get(1);
	assert.strictEqual(p?.contract.option, "player");
});

test("normalizeContractDemands can attach a team option to a low-end young free agent", async () => {
	await resetCache({
		players: [
			makePlayer(1, {
				age: 22,
				draftYearsAgo: 1,
				ovr: 45,
				pot: 48,
				value: 47,
				valueNoPot: 44,
			}),
		],
		teams: makeTeams(),
	});

	await normalizeContractDemands({ type: "freeAgentsOnly" });

	const p = await idb.cache.players.get(1);
	assert.strictEqual(p?.contract.option, "team");
});

test("dummyExpiringContracts only updates targeted dummy players", async () => {
	await resetCache({
		players: [
			makePlayer(1, { tid: 0, exp: g.get("season") }),
			makePlayer(2, { tid: 1, exp: g.get("season") }),
			makePlayer(3),
		],
		teams: makeTeams(),
	});

	const playersAll = await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);
	const results = getContractDemandResults({
		type: "dummyExpiringContracts",
		playersAll,
		pids: [2],
		teams: [
			{ payroll: 0, tid: 0 },
			{ payroll: 0, tid: 1 },
		],
	});

	assert.deepStrictEqual([...results.keys()], [2]);
});
