import { assert, test } from "vitest";
import { lotteryProbabilityProps } from "./draftLottery.ts";

const result = [0, 1, 2, 3, 4, 5].map((tid, index) => ({
	tid,
	originalTid: tid,
	chances: index < 3 ? 2 : 3,
	pick: index + 1,
	dpid: index,
}));

test("worker draft lottery view computes probabilities from the complete result", () => {
	const viewData = lotteryProbabilityProps(
		{
			season: 2027,
			draftType: "nba2027",
			result,
			nba2027: { restricted1: [0], restricted5: [1] },
		},
		"nba2027",
		6,
	);
	assert(viewData.lotteryProbs);
	assert.strictEqual(viewData.lotteryProbs[0]?.[0], 0);
	assert.strictEqual(viewData.lotteryProbs[1]?.[0], 0);
	assert.strictEqual(viewData.lotteryProbsTooSlow, false);
});
