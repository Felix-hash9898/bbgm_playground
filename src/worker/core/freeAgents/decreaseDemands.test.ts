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
import { getMaxContractForPlayerAndTerm } from "../contracts/contractLimits.ts";

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

test("open-FA demand decay preserves a valid prior-team five-year DVP ceiling", async () => {
	g.setWithoutSavingToDB("season", 2026);
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	g.setWithoutSavingToDB("salaryCap", 100000);
	const p = player.generate(0, 27, 2018, true, 0);
	p.draft.tid = 0;
	p.firstNBAContract = { season: 2018, phase: PHASE.FREE_AGENCY, tid: 0 };
	p.transactions = [];
	p.stats = Array.from({ length: 8 }, (_, i) => ({
		season: 2019 + i,
		tid: 0,
		playoffs: false,
		gp: 0,
		min: 0,
	})) as typeof p.stats;
	p.salaries = p.stats.map((row) => ({ season: row.season, amount: 20000 }));
	p.awards = [{ season: 2026, type: "Most Valuable Player" }];
	p.contract = { amount: 33000, exp: 2031 };
	await player.addToFreeAgents(p, {});
	await resetCache({ players: [p] });

	await freeAgents.decreaseDemands();
	const current = (await idb.cache.players.getAll())[0]!;
	assert.strictEqual(current.priorContractTid, 0);
	assert.strictEqual(current.contract.exp, 2031);
	assert.isAbove(current.contract.amount, 30000);
	assert.isBelow(current.contract.amount, 33000);
	assert.strictEqual(getMaxContractForPlayerAndTerm(current, 0, 5), 35000);
	assert.strictEqual(getMaxContractForPlayerAndTerm(current, 1, 5), 30000);
});
