import { afterEach, assert, test } from "vitest";
import { mockIDBLeague, resetCache, resetG } from "../../../test/helpers.ts";
import { Cache, idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import {
	getTradeReputation,
	getTradeReputationByTid,
	getTradeReputationByTidFromData,
} from "./getTradeReputation.ts";
import addToFreeAgents from "./addToFreeAgents.ts";

afterEach(() => {
	// @ts-expect-error -- tests intentionally model a freshly reset g
	delete g.season;
	// @ts-expect-error
	idb.league = undefined;
});

test("trade reputation uses the three-season weighted snapshot", () => {
	assert.strictEqual(
		getTradeReputation(
			[
				{ season: 2024, numPlayersTradedAway: 4 } as any,
				{ season: 2025, numPlayersTradedAway: 2 } as any,
				{ season: 2026, numPlayersTradedAway: 8 } as any,
			],
			2026,
		),
		8,
	);
});

test("new-league data snapshot does not require an initialized Cache", () => {
	resetG();
	// Model createStream before its Cache is initialized. The data-only path must
	// remain synchronous and independent of the empty global idb.cache.
	idb.cache = new Cache();
	assert.strictEqual((idb.cache as any)._status, "empty");

	assert.deepStrictEqual(
		getTradeReputationByTidFromData(
			[0, 1],
			[
				{ tid: 0, season: 2024, numPlayersTradedAway: 4 },
				{ tid: 0, season: 2025, numPlayersTradedAway: 2 },
				{ tid: 0, season: 2026, numPlayersTradedAway: 8 },
			] as any,
			2026,
		),
		{ 0: 8, 1: 0 },
	);
});

test("batch free-agent entry copies one snapshot per player", async () => {
	const snapshot = { 0: 1.5, 1: 0.25 };
	const p1 = { tid: 0, usageBias: 0, ratings: [], contract: {} } as any;
	const p2 = { tid: 1, usageBias: 0, ratings: [], contract: {} } as any;
	await addToFreeAgents(p1, snapshot);
	await addToFreeAgents(p2, snapshot);
	assert.deepStrictEqual(p1.tradeReputationByTid, snapshot);
	assert.deepStrictEqual(p2.tradeReputationByTid, snapshot);
	assert.notStrictEqual(p1.tradeReputationByTid, p2.tradeReputationByTid);
	p1.tradeReputationByTid[0] = 99;
	assert.strictEqual(p2.tradeReputationByTid[0], 1.5);
});

test("explicit create/import season works before g.season is installed", async () => {
	resetG();
	// createStream resets g and only restores the lid before this calculation.
	// @ts-expect-error -- intentionally verify the missing attribute path
	delete g.season;
	g.setWithoutSavingToDB("lid", 1);
	idb.league = mockIDBLeague();
	await resetCache({
		teams: [{ tid: 0, disabled: false }] as any,
		teamSeasons: [
			{ tid: 0, season: 2024, numPlayersTradedAway: 4 },
			{ tid: 0, season: 2025, numPlayersTradedAway: 2 },
			{ tid: 0, season: 2026, numPlayersTradedAway: 8 },
		] as any,
	});

	assert.deepStrictEqual(await getTradeReputationByTid(2026), { 0: 8 });
});
