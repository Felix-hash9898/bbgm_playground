import { afterEach, assert, beforeEach, test } from "vitest";
import { contractNegotiation } from "../index.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { beforeTests, givePlayerMinContract } from "./testHelpers.ts";
import {
	getContractCapHit,
	getMinContractForPlayer,
} from "../contracts/contractMinimum.ts";

beforeEach(beforeTests);
afterEach(() => idb.cache.negotiations.clear());

const putUserTeamOverCap = async () => {
	const teamPlayer = await idb.cache.players.get(3);
	if (!teamPlayer) {
		throw new Error("Invalid team player");
	}
	teamPlayer.contract.amount = g.get("salaryCap");
	await idb.cache.players.put(teamPlayer);
};

const makeFreeAgentVeteran = async (pid: number) => {
	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}

	p.born.year = g.get("season") - 34;
	p.draft.year = g.get("season") - 10;
	p.contract.amount = getMinContractForPlayer(p);
	await idb.cache.players.put(p);

	return p;
};

test("signing minimum contracts over the salary cap is allowed", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await putUserTeamOverCap();

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
		dryRun: true,
	});
	assert.strictEqual(error2, undefined);
});

test("no signing non-minimum contracts that cause team to exceed the salary cap", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await putUserTeamOverCap();

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract") + 2,
		exp: g.get("season") + 1,
	});
	assert.strictEqual(
		error2,
		"You cannot go over the salary cap to sign free agents to contracts higher than the minimum salary.",
	);
});

test("reject offers below the player's veteran minimum", async () => {
	const pid = 1;
	const p = await makeFreeAgentVeteran(pid);
	const veteranMinimum = getMinContractForPlayer(p);

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: veteranMinimum - 10,
		exp: g.get("season"),
		dryRun: true,
	});
	assert.strictEqual(
		error2,
		"You cannot offer this player a contract lower than their minimum salary.",
	);
});

test("allow offers at the player's veteran minimum", async () => {
	const pid = 1;
	const p = await makeFreeAgentVeteran(pid);
	const veteranMinimum = getMinContractForPlayer(p);

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: veteranMinimum,
		exp: g.get("season"),
		dryRun: true,
	});
	assert.strictEqual(error2, undefined);
});

test("over-cap team can sign a veteran at the player-specific minimum", async () => {
	const pid = 1;
	const p = await makeFreeAgentVeteran(pid);
	const veteranMinimum = getMinContractForPlayer(p);
	await putUserTeamOverCap();

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: veteranMinimum,
		exp: g.get("season"),
	});
	assert.strictEqual(error2, undefined);

	const signedPlayer = await idb.cache.players.get(pid);
	assert.strictEqual(signedPlayer?.contract.amount, veteranMinimum);
	assert(signedPlayer && getContractCapHit(signedPlayer.contract) < veteranMinimum);
});

test("over-cap team cannot sign a veteran above the player-specific minimum", async () => {
	const pid = 1;
	const p = await makeFreeAgentVeteran(pid);
	const veteranMinimum = getMinContractForPlayer(p);
	await putUserTeamOverCap();

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: veteranMinimum + 10,
		exp: g.get("season"),
		dryRun: true,
	});
	assert.strictEqual(
		error2,
		"You cannot go over the salary cap to sign free agents to contracts higher than the minimum salary.",
	);
});

test("reject offers above the player's dynamic max", async () => {
	const pid = 0;
	await givePlayerMinContract(pid);

	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}
	p.draft.year = g.get("season") - 10;
	await idb.cache.players.put(p);

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: 52501,
		exp: g.get("season") + 1,
	});
	assert.strictEqual(
		error2,
		"You cannot offer this player a contract higher than their maximum salary.",
	);
});

test("eligible young low-end free agents can sign two-way contracts", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);

	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}
	p.born.year = g.get("season") - 22;
	p.draft.year = g.get("season");
	p.draft.round = 0;
	p.draft.pick = 0;
	p.value = 45;
	p.valueNoPot = 42;
	p.ratings.at(-1)!.ovr = 42;
	await idb.cache.players.put(p);

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
		type: "twoWay",
	});
	assert.strictEqual(error2, undefined);

	const signedPlayer = await idb.cache.players.get(pid);
	assert.strictEqual(signedPlayer?.contract.type, "twoWay");
	assert.strictEqual(signedPlayer?.contract.amount, g.get("minContract"));
});

test("first-round players cannot sign two-way contracts", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);

	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}
	p.born.year = g.get("season") - 22;
	p.draft.year = g.get("season");
	p.draft.round = 1;
	p.draft.pick = 20;
	p.value = 45;
	p.valueNoPot = 42;
	p.ratings.at(-1)!.ovr = 42;
	await idb.cache.players.put(p);

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
		type: "twoWay",
	});
	assert.strictEqual(error2, "This player is not eligible for a two-way contract.");
});

test("normal rotation young players cannot sign two-way contracts", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);

	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}
	p.born.year = g.get("season") - 22;
	p.draft.year = g.get("season") - 2;
	p.draft.round = 2;
	p.draft.pick = 45;
	p.value = 62;
	p.valueNoPot = 52;
	p.ratings.at(-1)!.ovr = 52;
	await idb.cache.players.put(p);

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
		type: "twoWay",
	});
	assert.strictEqual(error2, "This player is not eligible for a two-way contract.");
});

test("reject a fourth two-way contract", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);

	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}
	p.born.year = g.get("season") - 22;
	p.draft.year = g.get("season");
	p.draft.round = 0;
	p.draft.pick = 0;
	p.value = 45;
	p.valueNoPot = 42;
	p.ratings.at(-1)!.ovr = 42;
	await idb.cache.players.put(p);

	const userPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		g.get("userTid"),
	);
	for (const userPlayer of userPlayers.slice(0, 3)) {
		userPlayer.contract.type = "twoWay";
		await idb.cache.players.put(userPlayer);
	}

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
		type: "twoWay",
	});
	assert.strictEqual(
		error2,
		"Your team already has the maximum number of two-way contracts.",
	);
});
