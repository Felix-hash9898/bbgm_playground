import { assert, afterEach, beforeEach, test } from "vitest";
import { PLAYER } from "../../../../common/index.ts";
import { mockIDBLeague, resetCache, resetG } from "../../../../test/helpers.ts";
import { idb } from "../../../db/index.ts";
import { g } from "../../../util/index.ts";

import backfillImportedFreeAgentTradeReputation from "./backfillImportedFreeAgentTradeReputation.ts";

const makeFreeAgent = () => ({ tid: PLAYER.FREE_AGENT }) as any;

beforeEach(() => {
	resetG();
	// Model createStream after resetG: only its new league ID has been restored.
	// @ts-expect-error -- the missing global is the bug this integration covers
	delete g.season;
	g.setWithoutSavingToDB("lid", 1);
	idb.league = mockIDBLeague();
});

afterEach(() => {
	// @ts-expect-error
	delete g.season;
	// @ts-expect-error
	idb.league = undefined;
});

test("create/import backfill uses its explicit season once and preserves imported snapshots", async () => {
	await resetCache({
		teams: [
			{ tid: 0, disabled: false },
			{ tid: 1, disabled: false },
		] as any,
		teamSeasons: [
			{ tid: 0, season: 2024, numPlayersTradedAway: 4 },
			{ tid: 0, season: 2025, numPlayersTradedAway: 2 },
			{ tid: 0, season: 2026, numPlayersTradedAway: 8 },
		] as any,
	});
	const first = makeFreeAgent();
	const second = makeFreeAgent();
	const imported = {
		...makeFreeAgent(),
		tradeReputationByTid: { 4: 9 },
	};

	await backfillImportedFreeAgentTradeReputation(
		[first, second, imported],
		2026,
	);

	assert.deepStrictEqual(first.tradeReputationByTid, { 0: 8, 1: 0 });
	assert.deepStrictEqual(second.tradeReputationByTid, { 0: 8, 1: 0 });
	assert.notStrictEqual(
		first.tradeReputationByTid,
		second.tradeReputationByTid,
	);
	first.tradeReputationByTid[0] = 99;
	assert.strictEqual(second.tradeReputationByTid[0], 8);
	assert.deepStrictEqual(imported.tradeReputationByTid, { 4: 9 });
});
