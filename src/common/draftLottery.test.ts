import { assert, test } from "vitest";
import { getDraftLotteryProbs, simLottery } from "./draftLottery.ts";

const result = (chances: number[]) =>
	chances.map((chances, i) => ({
		tid: i,
		originalTid: i,
		chances,
		dpid: i,
	}));

test("draft lottery probabilities handle all-zero and repeated weights", () => {
	const zero = getDraftLotteryProbs(result([0, 0, 0, 0]), "custom", 2);
	assert.strictEqual(zero.tooSlow, false);
	assert.deepStrictEqual(zero.probs?.[0], [1, 0, 0, 0]);

	const repeated = getDraftLotteryProbs(result([3, 1, 3, 1]), "custom", 2);
	assert(repeated.probs);
	for (const row of repeated.probs) {
		assert.closeTo(
			row.reduce<number>((sum, value) => sum + (value ?? 0), 0),
			1,
			1e-9,
		);
	}
});

test("nba2027 restrictions defer rather than remove a team", () => {
	const restrictions = { restricted1: [0], restricted5: [1] };
	const order = simLottery(
		"nba2027",
		[2, 2, 2, 3, 3, 3],
		6,
		restrictions,
		undefined,
		() => 0,
	);
	assert.notStrictEqual(order[0], 0);
	assert(order.indexOf(0) > 0);
	assert(order.indexOf(1) >= 5);
});

test("rigged nba2027 picks override restrictions and remain deterministic", () => {
	const order = simLottery(
		"nba2027",
		[2, 2, 2, 3, 3, 3],
		6,
		{
			restricted1: [0],
			restricted5: [0, 1],
		},
		[0],
		() => 0,
	);
	assert.strictEqual(order[0], 0);
});

test("full lottery result restrictions affect displayed first-pick probabilities", () => {
	const lottery = getDraftLotteryProbs(
		{
			season: 2027,
			draftType: "nba2027",
			result: result([2, 2, 2, 3, 3, 3]),
			nba2027: { restricted1: [0], restricted5: [1] },
		},
		"nba2027",
		6,
	);
	assert(lottery.probs);
	assert.strictEqual(lottery.probs[0]?.[0], 0);
	assert.strictEqual(lottery.probs[1]?.[0], 0);
	assert.closeTo(
		lottery.probs.reduce((sum, row) => sum + (row[0] ?? 0), 0),
		1,
		1e-9,
	);
});

test("positive weights fewer than picks use the actual deterministic fallback", () => {
	const lottery = getDraftLotteryProbs(result([4, 0, 0]), "custom", 3);
	assert(lottery.probs);
	assert.strictEqual(lottery.probs[0]?.[0], 1);
	assert.strictEqual(lottery.probs[1]?.[1], 1);
	assert.strictEqual(lottery.probs[2]?.[2], 1);
});

test("NBA 3-2-1 golden matrix remains exact", () => {
	const lottery = getDraftLotteryProbs(
		result([2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1]),
		"nba321",
		16,
	);
	assert.strictEqual(lottery.tooSlow, false);
	assert.strictEqual(lottery.probs?.[0]?.[11], 0.250649664389266);
});
