import { assert, beforeEach, test, vi } from "vitest";

vi.mock("./getTradeReputation.ts", () => ({
	getTradeReputationByTid: vi.fn(),
}));

import addToFreeAgents from "./addToFreeAgents.ts";
import { getTradeReputationByTid } from "./getTradeReputation.ts";

const makePlayer = () =>
	({
		tid: 0,
		numDaysFreeAgent: 4,
		ptModifier: 0.5,
		usageBias: 0,
		targetMinutes: 20,
	}) as any;

beforeEach(() => {
	vi.mocked(getTradeReputationByTid).mockReset();
	vi.mocked(getTradeReputationByTid).mockResolvedValue({ 0: 2 });
});

test("batch worker entry uses one supplied snapshot and copies it per player", async () => {
	const snapshot = { 0: 2 };
	const first = makePlayer();
	const second = makePlayer();
	await addToFreeAgents(first, snapshot);
	await addToFreeAgents(second, snapshot);
	assert.strictEqual((getTradeReputationByTid as any).mock.calls.length, 0);
	assert.notStrictEqual(
		first.tradeReputationByTid,
		second.tradeReputationByTid,
	);
	first.tradeReputationByTid[0] = 99;
	assert.strictEqual(second.tradeReputationByTid[0], 2);
	assert.strictEqual(first.targetMinutes, undefined);
	assert.strictEqual(second.usageBias, 1);
});
