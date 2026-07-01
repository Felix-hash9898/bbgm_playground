import { assert, beforeEach, test } from "vitest";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { player, team } from "../index.ts";
import { g, helpers } from "../../util/index.ts";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { idb } from "../../db/index.ts";
import {
	getContractCapHit,
	getMinContractForPlayer,
	withContractCapHitForPlayer,
} from "../contracts/contractMinimum.ts";

beforeEach(async () => {
	resetG();

	const standard = player.generate(0, 30, 2017, true, DEFAULT_LEVEL);
	standard.contract.amount = 10000;

	const twoWay = player.generate(0, 22, g.get("season"), true, DEFAULT_LEVEL);
	twoWay.contract.amount = g.get("minContract");
	twoWay.contract.type = "twoWay";

	const teams = helpers.getTeamsDefault().slice(0, 1).map(team.generate);

	await resetCache({
		players: [standard, twoWay],
		teams,
	});
});

test("two-way contracts do not count toward payroll", async () => {
	assert.strictEqual(await team.getPayroll(0), 10000);
});

test("two-way contracts from contract list do not count toward payroll", async () => {
	const contracts = await team.getContracts(0);

	assert.strictEqual(await team.getPayroll(contracts), 10000);
});

test("veteran minimum contracts count toward payroll at cap hit", async () => {
	const veteran = player.generate(0, 34, g.get("season") - 10, true, DEFAULT_LEVEL);
	veteran.draft.year = g.get("season") - 10;
	const veteranMinimum = getMinContractForPlayer(veteran);
	veteran.contract = withContractCapHitForPlayer(veteran, {
		amount: veteranMinimum,
		exp: g.get("season"),
	});
	await idb.cache.players.put(veteran);

	const expectedPayroll = 10000 + getContractCapHit(veteran.contract);

	assert(veteranMinimum > getContractCapHit(veteran.contract));
	assert.strictEqual(await team.getPayroll(0), expectedPayroll);
	assert.strictEqual(await team.getPayroll(await team.getContracts(0)), expectedPayroll);
});
