import { assert, beforeEach, test } from "vitest";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { freeAgents, player } from "../index.ts";
import {
	getContractCapHit,
	getMinContractForPlayer,
} from "../contracts/contractMinimum.ts";

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);

	const p = player.generate(
		PLAYER.FREE_AGENT,
		34,
		g.get("season") - 10,
		true,
		0,
	);
	p.draft.year = g.get("season") - 10;
	p.contract.amount = getMinContractForPlayer(p) + 10;
	p.contract.exp = g.get("season") + 1;

	await resetCache({
		players: [p],
	});
});

test("veteran minimum free agents request current-season contracts after demands fall to their minimum", async () => {
	await freeAgents.decreaseDemands();

	const players = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	const p = players[0]!;
	const playerMinimum = getMinContractForPlayer(p);

	assert.strictEqual(p.contract.amount, playerMinimum);
	assert.strictEqual(p.contract.exp, g.get("season"));
	assert(getContractCapHit(p.contract) < p.contract.amount);
});
