import { assert, test } from "vitest";
import { getDraftLotteryProbs } from "./draftLottery.ts";

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
	assert.deepStrictEqual(zero.probs?.[0], [0.25, 0.25, 0.25, 0.25]);

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

test("NBA 3-2-1 golden matrix remains exact", () => {
	const lottery = getDraftLotteryProbs(
		result([2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1]),
		"nba321",
		16,
	);
	assert.strictEqual(lottery.tooSlow, false);
	assert.strictEqual(lottery.probs?.[0]?.[11], 0.250649664389266);
});
