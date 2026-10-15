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
import { PLAYER } from "../../../common/index.ts";
import api from "../../api/index.ts";
import updateNegotiationView from "../../views/negotiation.ts";

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
	p.stats = Array.from(
		{ length: Math.max(0, g.get("season") - p.draft.year) },
		(_, i) => ({ season: p.draft.year + 1 + i, tid: p.tid >= 0 ? p.tid : 1 }),
	) as typeof p.stats;
	p.contract.amount = getMinContractForPlayer(p);
	await idb.cache.players.put(p);

	return p;
};

const fillLastStandardRosterSpot = async () => {
	const p = await idb.cache.players.get(0);
	if (!p) {
		throw new Error("Invalid roster filler");
	}
	p.tid = g.get("userTid");
	p.contract.type = "standard";
	await idb.cache.players.put(p);
};

const makeEligibleTwoWayFreeAgent = async (pid: number) => {
	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid two-way free agent");
	}
	p.born.year = g.get("season") - 22;
	p.draft.year = g.get("season");
	p.draft.round = 0;
	p.draft.pick = 0;
	p.value = 45;
	p.valueNoPot = 42;
	p.ratings.at(-1)!.ovr = 42;
	await idb.cache.players.put(p);
};

const setupApiSigningReconcileFailure = async () => {
	const userPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		g.get("userTid"),
	);
	const userTeam = await idb.cache.teams.get(g.get("userTid"));
	if (!userTeam) {
		throw new Error("Invalid user team");
	}
	userTeam.basketballRotation = {
		version: 1,
		mode: "custom",
		minutesByPid: Object.fromEntries(
			userPlayers.map((p, index) => [p.pid, index < 5 ? 48 : 0]),
		),
		numPlayersOnCourtAtSave: g.get("numPlayersOnCourt"),
	};
	await idb.cache.teams.put(userTeam);

	const malformedPlayer = await idb.cache.players.get(2);
	if (!malformedPlayer) {
		throw new Error("Invalid malformed player");
	}
	malformedPlayer.ratings.splice(0);
	await idb.cache.players.put(malformedPlayer);
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

	const roster = await idb.cache.players.indexGetAll(
		"playersByTid",
		g.get("userTid"),
	);
	assert.strictEqual(
		roster.filter((rosterPlayer) => rosterPlayer.contract.type !== "twoWay")
			.length,
		15,
	);
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

test("manual negotiation rejects a player option that removes the healthy year funding an injury discount", async () => {
	const p = await makeFreeAgentVeteran(1);
	p.injury = { type: "Torn ACL", gamesRemaining: 150 };
	await idb.cache.players.put(p);
	const createError = await contractNegotiation.create(1, false);
	assert.strictEqual(createError, undefined);
	const error = await contractNegotiation.accept({
		pid: 1,
		amount: getMinContractForPlayer(p),
		exp: g.get("season") + 2,
		option: "player",
		dryRun: true,
	});
	assert.match(error ?? "", /healthy year used to price this injured contract/);
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
	p.stats = Array.from(
		{ length: Math.max(0, g.get("season") - p.draft.year) },
		(_, i) => ({ season: p.draft.year + 1 + i, tid: p.tid >= 0 ? p.tid : 1 }),
	) as typeof p.stats;
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

test("forged five-year supermax offer without designation eligibility is rejected", async () => {
	g.setWithoutSavingToDB("salaryCapType", "soft");
	g.setWithoutSavingToDB("maxContractLength", 8);
	g.setWithoutSavingToDB("salaryCap", 100000);
	const pid = 0;
	await givePlayerMinContract(pid);
	const p = await idb.cache.players.get(pid);
	assert(p);
	p.draft.year = g.get("season") - 8;
	p.stats = Array.from(
		{ length: Math.max(0, g.get("season") - p.draft.year) },
		(_, i) => ({ season: p.draft.year + 1 + i, tid: p.tid >= 0 ? p.tid : 1 }),
	) as typeof p.stats;
	p.draft.originalTid = g.get("userTid");
	p.tid = PLAYER.FREE_AGENT;
	p.awards = [];
	await idb.cache.players.put(p);
	assert.strictEqual(await contractNegotiation.create(pid, true), undefined);
	const error = await contractNegotiation.accept({
		pid,
		amount: 40000,
		exp: g.get("season") + 5,
	});
	assert.strictEqual(
		error,
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
	p.stats = Array.from(
		{ length: Math.max(0, g.get("season") - p.draft.year) },
		(_, i) => ({ season: p.draft.year + 1 + i, tid: p.tid >= 0 ? p.tid : 1 }),
	) as typeof p.stats;
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

test("API negotiated signing survives a post-signing rotation reconcile failure", async () => {
	const pid = 0;
	await setupApiSigningReconcileFailure();
	await givePlayerMinContract(pid);
	const createError = await contractNegotiation.create(pid, false);
	assert.strictEqual(createError, undefined);
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

	try {
		const result = await api.main.acceptContractNegotiation({
			pid,
			amount: g.get("minContract"),
			exp: g.get("season") + 1,
		});
		assert.strictEqual(result, undefined);
		assert.strictEqual(
			(await idb.cache.players.get(pid))?.tid,
			g.get("userTid"),
		);
		assert.strictEqual(await idb.cache.negotiations.get(pid), undefined);
		assert.isTrue(
			warning.mock.calls.some(
				([message]) =>
					message ===
					"Signing succeeded; post-signing basketball rotation reconciliation failed",
			),
		);
	} finally {
		warning.mockRestore();
	}
});

test("API direct signing survives a post-signing rotation reconcile failure", async () => {
	const pid = 0;
	await setupApiSigningReconcileFailure();
	await givePlayerMinContract(pid);
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

	try {
		const result = await api.main.sign({
			pid,
			amount: g.get("minContract"),
			exp: g.get("season") + 1,
		});
		assert.strictEqual(result, undefined);
		assert.strictEqual(
			(await idb.cache.players.get(pid))?.tid,
			g.get("userTid"),
		);
		assert.strictEqual(await idb.cache.negotiations.get(pid), undefined);
		assert.isTrue(
			warning.mock.calls.some(
				([message]) =>
					message ===
					"Signing succeeded; post-signing basketball rotation reconciliation failed",
			),
		);
	} finally {
		warning.mockRestore();
	}
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

test("direct free-agent signing uses the fifteenth standard roster spot", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	const before = await idb.cache.players.indexGetAll(
		"playersByTid",
		g.get("userTid"),
	);
	assert.strictEqual(
		before.filter((rosterPlayer) => rosterPlayer.contract.type !== "twoWay")
			.length,
		14,
	);

	const result = await api.main.sign({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
	});
	assert.strictEqual(result, undefined);

	const after = await idb.cache.players.indexGetAll(
		"playersByTid",
		g.get("userTid"),
	);
	assert.strictEqual(
		after.filter((rosterPlayer) => rosterPlayer.contract.type !== "twoWay")
			.length,
		15,
	);
	assert.strictEqual((await idb.cache.players.get(pid))?.tid, g.get("userTid"));
});

test("direct Sign failure at a full roster is reported and leaves no temporary negotiation", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await fillLastStandardRosterSpot();
	const playerBefore = helpers.deepCopy(await idb.cache.players.get(pid));
	const teamBefore = helpers.deepCopy(
		await idb.cache.teams.get(g.get("userTid")),
	);
	const payrollBefore = await team.getPayroll(g.get("userTid"));
	const eventCountBefore = (await idb.cache.events.getAll()).length;

	const result = await api.main.sign({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
	});
	assert.strictEqual(
		result,
		"Your team has no standard roster spots available.",
	);
	assert.deepStrictEqual(await idb.cache.players.get(pid), playerBefore);
	assert.deepStrictEqual(
		await idb.cache.teams.get(g.get("userTid")),
		teamBefore,
	);
	assert.strictEqual(await team.getPayroll(g.get("userTid")), payrollBefore);
	assert.strictEqual(
		(await idb.cache.events.getAll()).length,
		eventCountBefore,
	);
	assert.strictEqual(await idb.cache.negotiations.get(pid), undefined);
});

test("rejected direct Sign is propagated without leaving a temporary negotiation", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	const playerBefore = helpers.deepCopy(await idb.cache.players.get(pid));
	const teamBefore = helpers.deepCopy(
		await idb.cache.teams.get(g.get("userTid")),
	);
	const payrollBefore = await team.getPayroll(g.get("userTid"));
	const eventCountBefore = (await idb.cache.events.getAll()).length;
	const accept = vi
		.spyOn(contractNegotiation, "accept")
		.mockRejectedValueOnce(new Error("Signing transaction rejected"));

	try {
		let caughtError: unknown;
		try {
			await api.main.sign({
				pid,
				amount: g.get("minContract"),
				exp: g.get("season") + 1,
			});
		} catch (error) {
			caughtError = error;
		}
		assert(caughtError instanceof Error);
		assert.strictEqual(caughtError.message, "Signing transaction rejected");
	} finally {
		accept.mockRestore();
	}

	assert.deepStrictEqual(await idb.cache.players.get(pid), playerBefore);
	assert.deepStrictEqual(
		await idb.cache.teams.get(g.get("userTid")),
		teamBefore,
	);
	assert.strictEqual(await team.getPayroll(g.get("userTid")), payrollBefore);
	assert.strictEqual(
		(await idb.cache.events.getAll()).length,
		eventCountBefore,
	);
	assert.strictEqual(await idb.cache.negotiations.get(pid), undefined);
});

test("full standard roster disables standard offers but preserves eligible Two-Way signing", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await makeEligibleTwoWayFreeAgent(pid);
	await putUserTeamNearCap(4000);

	const createError = await contractNegotiation.create(pid, false);
	assert.strictEqual(createError, undefined);
	const mleAmount = getMidLevelExceptionAmount() - 500;
	assert.strictEqual(
		await contractNegotiation.accept({
			pid,
			amount: mleAmount,
			exp: g.get("season") + 1,
			dryRun: true,
		}),
		undefined,
	);
	await fillLastStandardRosterSpot();
	const playerBefore = helpers.deepCopy(await idb.cache.players.get(pid));
	const teamBefore = helpers.deepCopy(
		await idb.cache.teams.get(g.get("userTid")),
	);
	const payrollBefore = await team.getPayroll(g.get("userTid"));
	const eventCountBefore = (await idb.cache.events.getAll()).length;
	const negotiationBefore = await idb.cache.negotiations.get(pid);
	const rosterError = "Your team has no standard roster spots available.";

	assert.strictEqual(
		await contractNegotiation.accept({
			pid,
			amount: g.get("minContract"),
			exp: g.get("season") + 1,
			dryRun: true,
		}),
		rosterError,
	);
	assert.strictEqual(
		await contractNegotiation.accept({
			pid,
			amount: g.get("minContract"),
			exp: g.get("season") + 1,
		}),
		rosterError,
	);
	assert.strictEqual(
		await contractNegotiation.accept({
			pid,
			amount: mleAmount,
			exp: g.get("season") + 1,
		}),
		rosterError,
	);
	assert.deepStrictEqual(await idb.cache.players.get(pid), playerBefore);
	assert.deepStrictEqual(
		await idb.cache.teams.get(g.get("userTid")),
		teamBefore,
	);
	assert.strictEqual(await team.getPayroll(g.get("userTid")), payrollBefore);
	assert.strictEqual(
		(await idb.cache.events.getAll()).length,
		eventCountBefore,
	);
	assert.deepStrictEqual(
		await idb.cache.negotiations.get(pid),
		negotiationBefore,
	);

	const view = await updateNegotiationView({ pid }, ["firstRun"], {});
	assert(view && "contractOptions" in view);
	const standardOptions = view.contractOptions.filter(
		(contract) => contract.type !== "twoWay",
	);
	assert(standardOptions.length > 0);
	assert(
		standardOptions.every((contract) => contract.disabledReason !== undefined),
	);
	assert(
		standardOptions.some((contract) => contract.disabledReason === rosterError),
	);
	assert(standardOptions.some((contract) => contract.option === "player"));
	assert(standardOptions.some((contract) => contract.option === "team"));
	const twoWayOption = view.contractOptions.find(
		(contract) => contract.type === "twoWay",
	);
	assert(twoWayOption);
	assert.strictEqual(twoWayOption.disabledReason, undefined);

	const twoWayResult = await contractNegotiation.accept({
		pid,
		amount: g.get("minContract"),
		exp: g.get("season") + 1,
		type: "twoWay",
	});
	assert.strictEqual(twoWayResult, undefined);
	const signedPlayer = await idb.cache.players.get(pid);
	assert.strictEqual(signedPlayer?.contract.type, "twoWay");
	const rosterAfterTwoWay = await idb.cache.players.indexGetAll(
		"playersByTid",
		g.get("userTid"),
	);
	assert.strictEqual(
		rosterAfterTwoWay.filter(
			(rosterPlayer) => rosterPlayer.contract.type !== "twoWay",
		).length,
		g.get("maxRosterSize"),
	);
});

test("negotiation offers refresh after a roster spot is freed without a page reload", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);
	await fillLastStandardRosterSpot();
	assert.strictEqual(await contractNegotiation.create(pid, false), undefined);

	const fullRosterView = await updateNegotiationView({ pid }, ["firstRun"], {});
	assert(fullRosterView && "contractOptions" in fullRosterView);
	const unavailableStandardOffers = fullRosterView.contractOptions.filter(
		(contract) => contract.type !== "twoWay",
	);
	assert(
		unavailableStandardOffers.every(
			(contract) => contract.disabledReason !== undefined,
		),
	);
	assert(
		unavailableStandardOffers.some(
			(contract) =>
				contract.disabledReason ===
				"Your team has no standard roster spots available.",
		),
	);

	const rosterFiller = await idb.cache.players.get(0);
	assert(rosterFiller);
	rosterFiller.tid = PLAYER.FREE_AGENT;
	await idb.cache.players.put(rosterFiller);

	const availableView = await updateNegotiationView(
		{ pid },
		["playerMovement"],
		fullRosterView,
	);
	assert(availableView && "contractOptions" in availableView);
	assert(
		availableView.contractOptions.some(
			(contract) =>
				contract.type !== "twoWay" && contract.disabledReason === undefined,
		),
	);
});

test("concurrent free-agent signings cannot overfill the last standard roster spot", async () => {
	for (const pid of [0, 1]) {
		await givePlayerMinContract(pid);
		const error = await contractNegotiation.create(pid, true);
		assert.strictEqual(error, undefined);
		const negotiation = await idb.cache.negotiations.get(pid);
		assert(negotiation);
		negotiation.resigning = false;
		await idb.cache.negotiations.put(negotiation);
	}

	const results = await Promise.allSettled(
		[0, 1].map((pid) =>
			contractNegotiation.accept({
				pid,
				amount: g.get("minContract"),
				exp: g.get("season") + 1,
			}),
		),
	);

	assert.strictEqual(
		results.filter(
			(result) => result.status === "fulfilled" && result.value === undefined,
		).length,
		1,
	);
	assert.strictEqual((await idb.cache.events.getAll()).length, 1);
	const roster = await idb.cache.players.indexGetAll(
		"playersByTid",
		g.get("userTid"),
	);
	assert.strictEqual(
		roster.filter((rosterPlayer) => rosterPlayer.contract.type !== "twoWay")
			.length,
		g.get("maxRosterSize"),
	);
	const negotiationsRemaining = await Promise.all(
		[0, 1].map((pid) => idb.cache.negotiations.get(pid)),
	);
	assert.strictEqual(negotiationsRemaining.filter(Boolean).length, 1);
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
