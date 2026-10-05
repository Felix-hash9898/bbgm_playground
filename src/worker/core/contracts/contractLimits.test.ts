import { beforeEach, assert, test } from "vitest";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { player } from "../index.ts";
import { g } from "../../util/index.ts";
import { resetG } from "../../../test/helpers.ts";
import {
	getDynamicMaxContractAmount,
	getMaxContractForPlayerAndTerm,
	getMaxContractForPlayer,
	getMaxSalaryTier,
	hasRoseOrHigherMaxQualification,
} from "./contractLimits.ts";

const makePlayer = ({
	awards = [],
	draftYear,
	yearsOfService,
}: {
	awards?: { season: number; type: string }[];
	draftYear?: number;
	yearsOfService?: number;
}) => {
	const p = player.generate(
		PLAYER.FREE_AGENT,
		25,
		draftYear ?? g.get("season"),
		true,
		0,
	);
	p.awards = awards;
	p.draft.year = draftYear ?? g.get("season") - (yearsOfService ?? 0);
	p.draft.originalTid = 0;
	p.tid = 0;
	p.transactions = [];
	return p;
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("season", 2026);
	g.setWithoutSavingToDB("salaryCap", 100000);
});

test("0-6 years of service without awards gets 25% max tier", () => {
	const p = makePlayer({ yearsOfService: 3 });
	assert.strictEqual(getMaxSalaryTier(p), 25);
	assert.strictEqual(getDynamicMaxContractAmount(p), 25000);
});

test("0-6 years of service with a qualifying award gets 30% max tier", () => {
	const p = makePlayer({
		awards: [{ season: g.get("season") - 1, type: "Most Valuable Player" }],
		yearsOfService: 4,
	});
	assert.strictEqual(getMaxSalaryTier(p), 30);
	assert.strictEqual(getDynamicMaxContractAmount(p), 30000);
});

test("0-6 years of service with recent All-League gets 30% max tier", () => {
	const p = makePlayer({
		awards: [{ season: g.get("season") - 1, type: "First Team All-League" }],
		yearsOfService: 4,
	});
	assert.strictEqual(getMaxSalaryTier(p), 30);
	assert.strictEqual(getDynamicMaxContractAmount(p), 30000);
});

test("All-Defensive alone does not qualify for Rose/Higher Max", () => {
	const p = makePlayer({
		awards: [{ season: g.get("season"), type: "First Team All-Defensive" }],
		yearsOfService: 2,
	});
	assert.strictEqual(getMaxSalaryTier(p), 25);
	assert.strictEqual(getDynamicMaxContractAmount(p), 25000);
});

test("7-9 years of service gets 30% max tier", () => {
	for (const yearsOfService of [7, 8, 9]) {
		const p = makePlayer({ yearsOfService });
		assert.strictEqual(getMaxSalaryTier(p), 30);
		assert.strictEqual(getDynamicMaxContractAmount(p), 30000);
	}
});

test("10+ years of service gets 35% max tier", () => {
	const p = makePlayer({ yearsOfService: 10 });
	assert.strictEqual(getMaxSalaryTier(p), 35);
	assert.strictEqual(getDynamicMaxContractAmount(p), 35000);
});

test("10+ years of service can exceed the old global maxContract when salary cap is higher", () => {
	const p = makePlayer({ yearsOfService: 10 });
	g.setWithoutSavingToDB("salaryCap", 150000);
	g.setWithoutSavingToDB("maxContract", 50000);
	assert.strictEqual(getDynamicMaxContractAmount(p), 52500);
	assert.strictEqual(getMaxContractForPlayer(p), 52500);
});

test("dynamic max contract amount tracks salary cap changes", () => {
	const p = makePlayer({ yearsOfService: 3 });
	g.setWithoutSavingToDB("salaryCap", 120000);
	assert.strictEqual(getDynamicMaxContractAmount(p), 30000);
	g.setWithoutSavingToDB("salaryCap", 90000);
	assert.strictEqual(getDynamicMaxContractAmount(p), 22500);
});

test("ordinary max service boundaries are 6/25%, 7/30%, 9/30%, 10/35%", () => {
	for (const [yos, tier] of [
		[6, 25],
		[7, 30],
		[9, 30],
		[10, 35],
	] as const) {
		assert.strictEqual(
			getMaxSalaryTier(makePlayer({ yearsOfService: yos })),
			tier,
		);
	}
});

test("Rose max requires exact recent seasons and a 4-YOS prior-team re-sign", () => {
	const season = g.get("season");
	const eligible = makePlayer({
		yearsOfService: 4,
		awards: [{ season: season - 1, type: "Most Valuable Player" }],
	});
	eligible.tid = eligible.draft.originalTid;
	eligible.transactions = [];
	assert.strictEqual(getMaxContractForPlayer(eligible), 30000);

	const currentAward = makePlayer({
		yearsOfService: 4,
		awards: [{ season, type: "Most Valuable Player" }],
	});
	currentAward.tid = currentAward.draft.originalTid;
	currentAward.transactions = [];
	assert.strictEqual(getMaxContractForPlayer(currentAward), 25000);

	const stale = makePlayer({
		yearsOfService: 4,
		awards: [{ season: season - 4, type: "Most Valuable Player" }],
	});
	stale.tid = stale.draft.originalTid;
	stale.transactions = [];
	assert.strictEqual(getMaxContractForPlayer(stale), 25000);

	const external = { ...eligible, tid: PLAYER.FREE_AGENT, priorContractTid: 0 };
	assert.strictEqual(getMaxContractForPlayer(external, 1), 25000);
	assert.strictEqual(
		getMaxContractForPlayer(
			makePlayer({
				yearsOfService: 5,
				awards: [{ season: season - 1, type: "Most Valuable Player" }],
			}),
		),
		25000,
	);
});

test("supermax ceiling requires qualifying 8/9-YOS player, prior team, awards, and five years", () => {
	const season = g.get("season");
	for (const yos of [8, 9]) {
		const p = makePlayer({
			yearsOfService: yos,
			awards: [{ season: season - 1, type: "Most Valuable Player" }],
		});
		const originalTid = p.draft.originalTid;
		p.tid = PLAYER.FREE_AGENT;
		const earlyTradeTid = originalTid + 1;
		p.transactions = [
			{
				season: p.draft.year + 3,
				phase: 0,
				tid: earlyTradeTid,
				type: "trade",
				fromTid: originalTid,
			},
		];
		assert.strictEqual(
			getMaxContractForPlayerAndTerm(p, earlyTradeTid, 5),
			35000,
		);
		assert.strictEqual(
			getMaxContractForPlayerAndTerm(p, earlyTradeTid, 4),
			30000,
		);
		assert.strictEqual(
			getMaxContractForPlayerAndTerm(p, originalTid, 5),
			30000,
		);
		assert.strictEqual(
			getMaxContractForPlayerAndTerm(p, earlyTradeTid, 1),
			30000,
		);
	}

	const noAward = makePlayer({ yearsOfService: 8 });
	noAward.tid = noAward.draft.originalTid;
	noAward.transactions = [];
	assert.strictEqual(
		getMaxContractForPlayerAndTerm(noAward, noAward.tid, 5),
		30000,
	);

	const lateMove = makePlayer({
		yearsOfService: 8,
		awards: [{ season: season - 1, type: "Most Valuable Player" }],
	});
	lateMove.tid = lateMove.draft.originalTid;
	lateMove.transactions = [
		{
			season: lateMove.draft.year + 5,
			phase: 0,
			tid: lateMove.tid,
			type: "trade",
			fromTid: lateMove.draft.originalTid,
		},
	];
	assert.strictEqual(
		getMaxContractForPlayerAndTerm(lateMove, lateMove.tid, 5),
		30000,
	);

	const seven = makePlayer({
		yearsOfService: 7,
		awards: [{ season: season - 1, type: "Most Valuable Player" }],
	});
	seven.tid = seven.draft.originalTid;
	assert.strictEqual(
		getMaxContractForPlayerAndTerm(seven, seven.tid, 5),
		30000,
	);
	assert.strictEqual(
		getMaxContractForPlayerAndTerm(makePlayer({ yearsOfService: 10 }), 0, 4),
		35000,
	);
});

test("ordinary max also includes 105% of prior season salary", () => {
	const p = makePlayer({ yearsOfService: 6 });
	p.salaries.push({ season: g.get("season") - 1, amount: 30000 });
	assert.strictEqual(getMaxContractForPlayer(p), 31500);
});

// These windows use BBGM's season label, which stays unchanged throughout offseason.
test.each([PHASE.RESIGN_PLAYERS, PHASE.FREE_AGENCY])(
	"award windows in offseason phase %s include the just-completed season",
	(phase) => {
		g.setWithoutSavingToDB("phase", phase);
		const season = g.get("season");
		for (const type of [
			"Most Valuable Player",
			"Defensive Player of the Year",
			"First Team All-League",
		]) {
			const p = makePlayer({ yearsOfService: 8, awards: [{ season, type }] });
			assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35000);
			p.awards = [{ season: season - 3, type }];
			assert.isFalse(hasRoseOrHigherMaxQualification(p));
		}
	},
);

test.each([
	["Defensive Player of the Year", "Defensive Player of the Year"],
	["First Team All-League", "Defensive Player of the Year"],
])("two-of-three counts qualifying seasons for %s + %s", (first, second) => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const season = g.get("season");
	const p = makePlayer({
		yearsOfService: 8,
		awards: [
			{ season: season - 1, type: first },
			{ season: season - 2, type: second },
		],
	});
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35000);
	p.awards[1]!.season = season - 1;
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 30000);
});

test("missing history does not authorize arbitrary teams, and later moves break continuity", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: g.get("season"), type: "Most Valuable Player" }],
	});
	p.tid = PLAYER.FREE_AGENT;
	p.transactions = undefined;
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35000);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 30000);
	const earlyTrade = {
		type: "trade" as const,
		season: p.draft.year + 2,
		phase: PHASE.REGULAR_SEASON,
		tid: 1,
		fromTid: 0,
	};
	p.transactions = [
		earlyTrade,
		{
			type: "freeAgent",
			season: p.draft.year + 6,
			phase: PHASE.FREE_AGENCY,
			tid: 2,
		},
	];
	for (const tid of [0, 1, 2]) {
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, tid, 5), 30000);
	}
	p.transactions = [
		earlyTrade,
		{
			type: "trade",
			season: p.draft.year + 6,
			phase: PHASE.REGULAR_SEASON,
			tid: 2,
			fromTid: 1,
		},
	];
	for (const tid of [1, 2]) {
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, tid, 5), 30000);
	}
	// The fourth under-contract cap year is draft.year + 4.
	p.transactions = [{ ...earlyTrade, season: p.draft.year + 4 }];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 35000);
	p.transactions = [{ ...earlyTrade, season: p.draft.year + 5 }];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 30000);
});

test("105% reads the final signed salary through normalization and preseason", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({ yearsOfService: 8 });
	p.salaries = [];
	player.setContract(p, { amount: 32000, exp: g.get("season") }, true, {
		phase: PHASE.REGULAR_SEASON,
	});
	p.salaries.unshift({ season: g.get("season") - 1, amount: 30000 });
	player.setContract(p, { amount: 1000, exp: g.get("season") + 5 }, false);
	p.tid = PLAYER.FREE_AGENT;
	for (const phase of [PHASE.RESIGN_PLAYERS, PHASE.FREE_AGENCY]) {
		g.setWithoutSavingToDB("phase", phase);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4), 33600);
	}
	g.setWithoutSavingToDB("season", g.get("season") + 1);
	g.setWithoutSavingToDB("phase", PHASE.PRESEASON);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4), 33600);
});

test("traded rookie Higher Max uses prior contract team and four non-option seasons", async () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 4,
		awards: [{ season: g.get("season"), type: "Most Valuable Player" }],
	});
	p.tid = 1;
	p.transactions = [
		{
			type: "trade",
			season: p.draft.year + 4,
			phase: PHASE.REGULAR_SEASON,
			tid: 1,
			fromTid: 0,
		},
	];
	p.salaries = [];
	await player.addToFreeAgents(p, {});
	assert.strictEqual(p.priorContractTid, 1);
	for (const years of [1, 2, 3]) {
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, years), 25000);
	}
	for (const option of ["player", "team"] as const) {
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4, option), 25000);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5, option), 30000);
	}
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4), 30000);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 4), 25000);
	delete p.priorContractTid;
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4), 30000);
	p.salaries = [{ season: g.get("season"), amount: 28000 }];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 1), 29400);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4, "player"), 29400);
});
