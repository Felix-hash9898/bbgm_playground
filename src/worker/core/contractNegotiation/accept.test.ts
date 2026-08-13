import { afterEach, assert, beforeEach, test, vi } from "vitest";
import { contractNegotiation } from "../index.ts";
import { idb } from "../../db/index.ts";
import { g, helpers } from "../../util/index.ts";
import { beforeTests, givePlayerMinContract } from "./testHelpers.ts";
import {
	getContractCapHit,
	getMinContractForPlayer,
} from "../contracts/contractMinimum.ts";
import { getMidLevelExceptionAmount } from "../contracts/contractMidLevel.ts";
import { getRealAmountForEffectiveOffer } from "../contracts/contractOption.ts";
import { player, team } from "../index.ts";

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

const putUserTeamNearCap = async (capSpace: number) => {
	const teamPlayer = await idb.cache.players.get(3);
	if (!teamPlayer) {
		throw new Error("Invalid team player");
	}
	teamPlayer.contract.amount = g.get("salaryCap") - capSpace;
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
		amount: getMidLevelExceptionAmount() + 2,
		exp: g.get("season") + 1,
	});
	assert.strictEqual(
		error2,
		`You cannot go over the salary cap to sign free agents to contracts higher than the Mid-Level Exception (${helpers.formatCurrency(
			getMidLevelExceptionAmount() / 1000,
			"M",
		)}).`,
	);
});

test("under-cap signing succeeds without consuming MLE", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	const amount = getMidLevelExceptionAmount() + 500;

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);
	const error2 = await contractNegotiation.accept({
		pid,
		amount,
		exp: g.get("season") + 1,
	});
	assert.strictEqual(error2, undefined);

	const t = await idb.cache.teams.get(g.get("userTid"));
	assert.strictEqual(t?.midLevelExceptionUsedSeason, undefined);
});

test("cap-space-insufficient signing within MLE succeeds and consumes MLE", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await putUserTeamNearCap(4000);
	const amount = getMidLevelExceptionAmount() - 500;

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);
	const error2 = await contractNegotiation.accept({
		pid,
		amount,
		exp: g.get("season") + 1,
	});
	assert.strictEqual(error2, undefined);

	const t = await idb.cache.teams.get(g.get("userTid"));
	const signedPlayer = await idb.cache.players.get(pid);
	assert.strictEqual(t?.midLevelExceptionUsedSeason, g.get("season"));
	assert.strictEqual(signedPlayer?.contract.exception, "midLevel");
});

test("over-cap above-minimum signing above MLE fails", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await putUserTeamOverCap();
	const amount = getMidLevelExceptionAmount() + 500;

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);
	const error2 = await contractNegotiation.accept({
		pid,
		amount,
		exp: g.get("season") + 1,
		dryRun: true,
	});
	assert.strictEqual(
		error2,
		`You cannot go over the salary cap to sign free agents to contracts higher than the Mid-Level Exception (${helpers.formatCurrency(
			getMidLevelExceptionAmount() / 1000,
			"M",
		)}).`,
	);
});

test("MLE cannot be used twice in the same season", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await putUserTeamNearCap(4000);
	const amount = getMidLevelExceptionAmount() - 500;

	let error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);
	let error2 = await contractNegotiation.accept({
		pid,
		amount,
		exp: g.get("season") + 1,
	});
	assert.strictEqual(error2, undefined);

	const p2 = await idb.cache.players.get(0);
	if (!p2) {
		throw new Error("Invalid pid");
	}
	p2.contract.amount = g.get("minContract");
	await idb.cache.players.put(p2);

	error = await contractNegotiation.create(0, false);
	assert.strictEqual(error, undefined);
	error2 = await contractNegotiation.accept({
		pid: 0,
		amount,
		exp: g.get("season") + 1,
		dryRun: true,
	});
	assert.strictEqual(
		error2,
		"You have already used your Mid-Level Exception this season.",
	);
});

test("minimum exception does not consume MLE", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await putUserTeamOverCap();

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
	});
	assert.strictEqual(error2, undefined);

	const t = await idb.cache.teams.get(g.get("userTid"));
	assert.strictEqual(t?.midLevelExceptionUsedSeason, undefined);
});

test("two-way contracts do not consume MLE", async () => {
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
	await putUserTeamOverCap();

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
		type: "twoWay",
	});
	assert.strictEqual(error2, undefined);

	const t = await idb.cache.teams.get(g.get("userTid"));
	assert.strictEqual(t?.midLevelExceptionUsedSeason, undefined);
});

test("player option effective offer can satisfy contract demand while payroll uses real amount", async () => {
	const pid = 1;
	g.setWithoutSavingToDB("playersRefuseToNegotiate", false);
	g.setWithoutSavingToDB("salaryCap", 1000000);

	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}
	p.contract.amount = 20000;
	await idb.cache.players.put(p);

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);

	const demand = (await player.moodInfo(p, g.get("userTid"))).contractAmount;
	const amount = getRealAmountForEffectiveOffer(demand, "player");
	const error2 = await contractNegotiation.accept({
		pid,
		amount,
		exp: g.get("season") + 2,
		option: "player",
	});
	assert.strictEqual(error2, undefined);

	const signedPlayer = await idb.cache.players.get(pid);
	assert.strictEqual(signedPlayer?.contract.amount, amount);
	assert.strictEqual(signedPlayer?.contract.option, "player");

	const payroll = await team.getPayroll(g.get("userTid"));
	assert(payroll >= amount);
	assert(payroll < demand + g.get("salaryCap"));
});

test("team option effective offer must satisfy contract demand", async () => {
	const pid = 1;
	g.setWithoutSavingToDB("playersRefuseToNegotiate", false);
	g.setWithoutSavingToDB("salaryCap", 1000000);

	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}
	p.contract.amount = 20000;
	await idb.cache.players.put(p);

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);

	const demand = (await player.moodInfo(p, g.get("userTid"))).contractAmount;
	const error2 = await contractNegotiation.accept({
		pid,
		amount: demand,
		exp: g.get("season") + 2,
		option: "team",
		dryRun: true,
	});
	assert.strictEqual(error2, "Player will not accept this contract.");
});

test("MLE max contract length is enforced", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await putUserTeamOverCap();

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: getMidLevelExceptionAmount() - 500,
		exp: g.get("season") + 5,
		dryRun: true,
	});
	assert.strictEqual(
		error2,
		"You cannot use the Mid-Level Exception on a contract longer than 4 years.",
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
	assert(
		signedPlayer && getContractCapHit(signedPlayer.contract) < veteranMinimum,
	);
});

test("over-cap team cannot sign a veteran above the player-specific minimum", async () => {
	const pid = 1;
	await makeFreeAgentVeteran(pid);
	await putUserTeamOverCap();

	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(
		error,
		undefined,
		`Unexpected error message from contractNegotiation.create: "${error}"`,
	);
	const error2 = await contractNegotiation.accept({
		pid,
		amount: getMidLevelExceptionAmount() + 10,
		exp: g.get("season"),
		dryRun: true,
	});
	assert.strictEqual(
		error2,
		`You cannot go over the salary cap to sign free agents to contracts higher than the Mid-Level Exception (${helpers.formatCurrency(
			getMidLevelExceptionAmount() / 1000,
			"M",
		)}).`,
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
	assert.strictEqual(
		error2,
		"This player is not eligible for a two-way contract.",
	);
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
	assert.strictEqual(
		error2,
		"This player is not eligible for a two-way contract.",
	);
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

test("concurrent accepts consume one negotiation and sign once", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);

	const params = {
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
	};
	const results = await Promise.all([
		contractNegotiation.accept(params),
		contractNegotiation.accept(params),
	]);

	assert.strictEqual(
		results.filter((result) => result === undefined).length,
		1,
	);
	assert.strictEqual(
		results.filter((result) => typeof result === "string").length,
		1,
	);
	assert.strictEqual(await idb.cache.negotiations.get(pid), undefined);
	assert.strictEqual((await idb.cache.events.getAll()).length, 1);
	const signed = await idb.cache.players.get(pid);
	assert.strictEqual(signed?.tid, g.get("userTid"));
	assert.strictEqual(signed?.contract.amount, g.get("minContract"));
	// This signing path records the contract on the player but does not append a
	// transaction row; the negotiation deletion and final contract are the
	// durable effects observable here.
});

test("rosterAutoSort failure does not roll back a durable core signing", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);
	const rosterError = new Error("roster sort failed");
	const rosterAutoSort = vi
		.spyOn(team, "rosterAutoSort")
		.mockRejectedValueOnce(rosterError);
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

	const result = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
	});
	assert.strictEqual(result, undefined);
	assert.strictEqual(warning.mock.calls.length, 1);
	warning.mockRestore();
	rosterAutoSort.mockRestore();

	assert.strictEqual(await idb.cache.negotiations.get(pid), undefined);
	assert.strictEqual((await idb.cache.events.getAll()).length, 1);
	assert.strictEqual((await idb.cache.players.get(pid))?.tid, g.get("userTid"));
});

test("accept passes the signed player tid to keepRosterSorted decisions", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);

	const userTeam = await idb.cache.teams.get(g.get("userTid"));
	assert.isDefined(userTeam);
	userTeam!.keepRosterSorted = false;
	await idb.cache.teams.put(userTeam!);
	const rosterAutoSort = vi
		.spyOn(team, "rosterAutoSort")
		.mockResolvedValueOnce(undefined);

	await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
	});

	assert.strictEqual(rosterAutoSort.mock.calls[0]?.[0], g.get("userTid"));
	assert.strictEqual(rosterAutoSort.mock.calls[0]?.[1], true);
	rosterAutoSort.mockRestore();
});

test("different players can accept concurrently without duplicate events", async () => {
	for (const pid of [0, 1]) {
		await givePlayerMinContract(pid);
		const error = await contractNegotiation.create(pid, true);
		assert.strictEqual(error, undefined);
	}

	const results = await Promise.all(
		[0, 1].map((pid) =>
			contractNegotiation.accept({
				pid,
				amount: g.get("minContract"),
				exp: g.get("season") + 1,
			}),
		),
	);

	assert.deepStrictEqual(results, [undefined, undefined]);
	assert.strictEqual((await idb.cache.events.getAll()).length, 2);
	for (const pid of [0, 1]) {
		assert.strictEqual(await idb.cache.negotiations.get(pid), undefined);
	}
});

test("concurrent dry runs do not use the accept submission lock", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	const error = await contractNegotiation.create(pid, false);
	assert.strictEqual(error, undefined);

	const results = await Promise.all([
		contractNegotiation.accept({
			pid,
			amount: g.get("minContract"),
			exp: g.get("season") + 1,
			dryRun: true,
		}),
		contractNegotiation.accept({
			pid,
			amount: g.get("minContract"),
			exp: g.get("season") + 1,
			dryRun: true,
		}),
	]);

	assert.deepStrictEqual(results, [undefined, undefined]);
	assert.isDefined(await idb.cache.negotiations.get(pid));
});
