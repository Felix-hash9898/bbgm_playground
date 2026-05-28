import { afterAll, assert, beforeAll, test } from "vitest";
import { getDraftTids, loadTeamSeasons } from "./testHelpers.ts";
import { mockIDBLeague, resetG } from "../../../test/helpers.ts";
import { getDraftLotteryProbs } from "../../../common/draftLottery.ts";
import { draft } from "../index.ts";
import { idb } from "../../db/index.ts";

beforeAll(async () => {
	resetG();
	idb.league = mockIDBLeague();

	await loadTeamSeasons();
});
afterAll(() => {
	// @ts-expect-error
	idb.league = undefined;
});

test("schedule 60 draft picks", async () => {
	const draftTids = await getDraftTids();
	assert.strictEqual(draftTids.length, 60);
});

test("give the 3 teams with the lowest win percentage picks not lower than 6", async () => {
	const draftTids = await getDraftTids();
	const tids = [16, 28, 21]; // teams with lowest winp

	for (const [i, tid] of tids.entries()) {
		assert(draftTids.indexOf(tid) >= 0);
		assert(draftTids.indexOf(tid) <= i + 3);
		assert.strictEqual(draftTids.lastIndexOf(tid), 30 + i);
	}
});

test("give lottery team with better record than playoff teams a pick based on actual record for round 2", async () => {
	const draftTids = await getDraftTids();
	const pofteams = [23, 10, 18, 24, 14]; // good record lottery team

	assert(draftTids.indexOf(17) >= 0);
	assert(draftTids.indexOf(17) <= 13);
	assert.strictEqual(draftTids.lastIndexOf(17), 48); // bad record playoff team

	for (const tid of pofteams) {
		assert(draftTids.indexOf(tid) > draftTids.indexOf(17));
		assert(draftTids.lastIndexOf(tid) < draftTids.lastIndexOf(17));
	}
});

test("give reverse round 2 order for teams with the same record", async () => {
	const draftTids = await getDraftTids();
	const sameRec = [
		[3, 15, 25],
		[10, 18],
		[13, 26],
	];

	// First set of tids can fail because all 3 teams are in the lottery, although with low odds
	const lotteryTids = draftTids.slice(0, 3);
	for (const tid of sameRec[0]!) {
		if (lotteryTids.includes(tid)) {
			// Skip this test, it will fail otherwise
			sameRec.shift();
			break;
		}
	}

	for (const tids of sameRec) {
		const r1picks = draftTids.filter((tid, i) => tids.includes(tid) && i < 30);
		const r2picks = draftTids.filter((tid, i) => tids.includes(tid) && i >= 30);
		assert.deepStrictEqual(r1picks, r2picks.reverse());
	}
});

test("nba321 uses the expected 3-2-1 lottery chance tiers", async () => {
	const { draftLotteryResult } = await draft.genOrder(
		true,
		undefined,
		"nba321",
	);
	assert(draftLotteryResult);
	assert.strictEqual(draftLotteryResult.result.length, 16);
	assert.deepStrictEqual(
		draftLotteryResult.result.map((row) => row.chances),
		[2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 1, 1],
	);
});

test("nba321 keeps the three worst teams inside the top 12", async () => {
	const { draftPicks } = await draft.genOrder(true, undefined, "nba321");
	const firstRound = draftPicks
		.filter((dp) => dp.round === 1)
		.sort((a, b) => a.pick - b.pick);

	for (const tid of [16, 28, 21]) {
		const pick = firstRound.find((dp) => dp.originalTid === tid)?.pick;
		assert.strictEqual(typeof pick, "number");
		assert(pick! <= 12);
	}
});

test("nba321 uses an exact precomputed probability matrix", async () => {
	const { draftLotteryResult } = await draft.genOrder(
		true,
		undefined,
		"nba321",
	);
	assert(draftLotteryResult);

	const { tooSlow, probs } = getDraftLotteryProbs(
		draftLotteryResult.result,
		"nba321",
		16,
	);

	assert.strictEqual(tooSlow, false);
	assert(probs);
	assert.strictEqual(probs[0]?.[11], 0.250649664389266);
	assert.strictEqual(probs[3]?.[0], 0.08108108108108109);
	assert.strictEqual(probs[14]?.[15], 0.2652305869491766);
});
