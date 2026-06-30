import { afterEach, assert, beforeAll, test } from "vitest";
import { contractNegotiation } from "../index.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { beforeTests, givePlayerMinContract } from "./testHelpers.ts";

beforeAll(beforeTests);
afterEach(() => idb.cache.negotiations.clear());

test("no signing non-minimum contracts that cause team to exceed the salary cap", async () => {
	const pid = 1;
	await givePlayerMinContract(pid);

	const teamPlayer = await idb.cache.players.get(3);
	if (!teamPlayer) {
		throw new Error("Invalid team player");
	}
	teamPlayer.contract.amount = g.get("salaryCap");
	await idb.cache.players.put(teamPlayer);

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
