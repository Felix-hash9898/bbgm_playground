import { assert, beforeEach, test, vi } from "vitest";
import { PLAYER } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { player, team } from "../index.ts";
import * as contractDemands from "../freeAgents/contractDemands.ts";
import { getMinContractForPlayer } from "./contractMinimum.ts";
import {
	decideUserTeamOption,
	getPendingUserTeamOptions,
	processContractOptions,
} from "./contractOptionDecisions.ts";

const makePlayer = ({
	amount,
	option,
	pid,
	tid,
	value,
}: {
	amount: number;
	option: "player" | "team";
	pid: number;
	tid: number;
	value: number;
}) => {
	const p = player.generate(tid, 27, g.get("season") - 5, true, 0);
	p.pid = pid;
	p.value = value;
	p.valueNoPot = value;
	p.valueFuzz = value;
	p.ratings.at(-1)!.ovr = value;
	p.ratings.at(-1)!.pot = value;
	p.contract = {
		amount,
		exp: g.get("season") + 1,
		option,
	};
	return p;
};

const makeTeams = () =>
	helpers.getTeamsDefault()
		.slice(0, 2)
		.map((t) => team.generate(t));

const seedOptionSalaryHistory = async (pid: number) => {
	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}

	p.salaries = [
		{
			season: g.get("season"),
			amount: p.contract.amount,
		},
		{
			season: g.get("season") + 1,
			amount: p.contract.amount,
		},
	];
	await idb.cache.players.put(p);
};

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("playersRefuseToNegotiate", false);
	await resetCache({
		players: [
			makePlayer({
				amount: g.get("maxContract"),
				option: "player",
				pid: 1,
				tid: 0,
				value: 35,
			}),
			makePlayer({
				amount: g.get("minContract"),
				option: "player",
				pid: 2,
				tid: 0,
				value: 90,
			}),
			makePlayer({
				amount: g.get("minContract"),
				option: "team",
				pid: 3,
				tid: 1,
				value: 90,
			}),
			makePlayer({
				amount: g.get("maxContract"),
				option: "team",
				pid: 4,
				tid: 1,
				value: 35,
			}),
			makePlayer({
				amount: g.get("minContract"),
				option: "team",
				pid: 5,
				tid: 0,
				value: 90,
			}),
		],
		teams: makeTeams(),
	});
});

test("processContractOptions resolves player options and AI team options but leaves user team options pending", async () => {
	await processContractOptions();

	const exercisedPO = await idb.cache.players.get(1);
	const declinedPO = await idb.cache.players.get(2);
	const exercisedAITO = await idb.cache.players.get(3);
	const declinedAITO = await idb.cache.players.get(4);
	const pendingUserTO = await idb.cache.players.get(5);

	assert.strictEqual(exercisedPO?.contract.option, undefined);
	assert.strictEqual(exercisedPO?.contract.exp, g.get("season") + 1);
	assert.strictEqual(declinedPO?.contract.option, undefined);
	assert.strictEqual(declinedPO?.contract.exp, g.get("season"));

	assert.strictEqual(exercisedAITO?.contract.option, undefined);
	assert.strictEqual(exercisedAITO?.contract.exp, g.get("season") + 1);
	assert.strictEqual(declinedAITO?.contract.option, undefined);
	assert.strictEqual(declinedAITO?.contract.exp, g.get("season"));

	assert.strictEqual(pendingUserTO?.contract.option, "team");
	assert.strictEqual(pendingUserTO?.contract.exp, g.get("season") + 1);
	assert.strictEqual((await getPendingUserTeamOptions()).length, 1);
});

test("declined player and AI team options remove the option-year salary row", async () => {
	await seedOptionSalaryHistory(2);
	await seedOptionSalaryHistory(4);

	await processContractOptions();

	const declinedPO = await idb.cache.players.get(2);
	const declinedAITO = await idb.cache.players.get(4);

	assert.deepStrictEqual(declinedPO?.salaries, [
		{
			season: g.get("season"),
			amount: g.get("minContract"),
		},
	]);
	assert.deepStrictEqual(declinedAITO?.salaries, [
		{
			season: g.get("season"),
			amount: g.get("maxContract"),
		},
	]);
});

test("exercised option keeps the option-year salary row", async () => {
	await seedOptionSalaryHistory(1);
	await seedOptionSalaryHistory(3);

	await processContractOptions();

	const exercisedPO = await idb.cache.players.get(1);
	const exercisedAITO = await idb.cache.players.get(3);

	assert.deepStrictEqual(exercisedPO?.salaries, [
		{
			season: g.get("season"),
			amount: g.get("maxContract"),
		},
		{
			season: g.get("season") + 1,
			amount: g.get("maxContract"),
		},
	]);
	assert.deepStrictEqual(exercisedAITO?.salaries, [
		{
			season: g.get("season"),
			amount: g.get("minContract"),
		},
		{
			season: g.get("season") + 1,
			amount: g.get("minContract"),
		},
	]);
});

test("player option decisions use the market contract effective value rather than the lower raw PO salary", async () => {
	const marketDemands = new Map([
		[
			1,
			{
				contract: {
					amount: 10010,
					exp: g.get("season") + 2,
					option: "player" as const,
				},
			},
		],
	]);
	const getContractDemandResultsSpy = vi
		.spyOn(contractDemands, "getContractDemandResults")
		.mockReturnValue(marketDemands);

	try {
		const p = await idb.cache.players.get(1);
		if (!p) {
			throw new Error("Invalid pid");
		}
		p.contract.amount = 10000;
		await idb.cache.players.put(p);

		await processContractOptions();

		const updated = await idb.cache.players.get(1);
		assert.strictEqual(updated?.contract.option, undefined);
		assert.strictEqual(updated?.contract.exp, g.get("season"));
	} finally {
		getContractDemandResultsSpy.mockRestore();
	}
});

test("team option decisions use the market contract effective value rather than the higher raw TO salary", async () => {
	const marketDemands = new Map([
		[
			3,
			{
				contract: {
					amount: 9900,
					exp: g.get("season") + 2,
					option: "team" as const,
				},
			},
		],
	]);
	const getContractDemandResultsSpy = vi
		.spyOn(contractDemands, "getContractDemandResults")
		.mockReturnValue(marketDemands);

	try {
		const p = await idb.cache.players.get(3);
		if (!p) {
			throw new Error("Invalid pid");
		}
		p.contract.amount = 10000;
		await idb.cache.players.put(p);

		await processContractOptions();

		const updated = await idb.cache.players.get(3);
		assert.strictEqual(updated?.contract.option, undefined);
		assert.strictEqual(updated?.contract.exp, g.get("season"));
	} finally {
		getContractDemandResultsSpy.mockRestore();
	}
});

test("minimum player options still exercise after the floor rises above the old salary", async () => {
	const p = await idb.cache.players.get(2);
	if (!p) {
		throw new Error("Invalid pid");
	}

	const oldOptionSalary = getMinContractForPlayer(p);
	p.contract.amount = oldOptionSalary;
	await idb.cache.players.put(p);
	g.setWithoutSavingToDB("minContract", oldOptionSalary + 5000);
	const updatedMarketFloor = getMinContractForPlayer(p);

	const marketDemands = new Map([
		[
			2,
			{
				contract: {
					amount: updatedMarketFloor,
					exp: g.get("season") + 2,
				},
			},
		],
	]);
	const getContractDemandResultsSpy = vi
		.spyOn(contractDemands, "getContractDemandResults")
		.mockReturnValue(marketDemands);

	try {
		await processContractOptions();

		const updated = await idb.cache.players.get(2);
		assert.strictEqual(updated?.contract.option, undefined);
		assert.strictEqual(updated?.contract.exp, g.get("season") + 1);
		assert.strictEqual(updated?.contract.amount, oldOptionSalary);
	} finally {
		getContractDemandResultsSpy.mockRestore();
	}
});

test("user can manually exercise a team option", async () => {
	const error = await decideUserTeamOption({ exercise: true, pid: 5 });
	assert.strictEqual(error, undefined);

	const p = await idb.cache.players.get(5);
	assert.strictEqual(p?.contract.option, undefined);
	assert.strictEqual(p?.contract.exp, g.get("season") + 1);
	assert.strictEqual(p?.tid, 0);
});

test("user can manually decline a team option into the re-sign flow", async () => {
	const error = await decideUserTeamOption({ exercise: false, pid: 5 });
	assert.strictEqual(error, undefined);

	const p = await idb.cache.players.get(5);
	assert.strictEqual(p?.tid, PLAYER.FREE_AGENT);

	const negotiation = await idb.cache.negotiations.get(5);
	assert.strictEqual(negotiation?.resigning, true);
	assert.strictEqual(negotiation?.tid, 0);
});

test("user can manually decline a team option and remove the option-year salary row", async () => {
	await seedOptionSalaryHistory(5);

	const error = await decideUserTeamOption({ exercise: false, pid: 5 });
	assert.strictEqual(error, undefined);

	const p = await idb.cache.players.get(5);
	assert.deepStrictEqual(p?.salaries, [
		{
			season: g.get("season"),
			amount: g.get("minContract"),
		},
	]);
});

test("spectator mode auto-resolves user team options and leaves none pending", async () => {
	g.setWithoutSavingToDB("spectator", true);
	await seedOptionSalaryHistory(5);

	await processContractOptions();

	const pending = await getPendingUserTeamOptions();
	const p = await idb.cache.players.get(5);

	assert.strictEqual(pending.length, 0);
	assert.strictEqual(p?.contract.option, undefined);
	assert.strictEqual(p?.tid, 0);
});
