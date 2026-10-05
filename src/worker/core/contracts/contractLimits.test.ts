import { beforeEach, assert, test } from "vitest";
import { PHASE, PLAYER } from "../../../common/index.ts";
import { player } from "../index.ts";
import { g } from "../../util/index.ts";
import { resetG } from "../../../test/helpers.ts";
import {
	getYearsOfService,
	clampContractAmountForPlayer,
	getDynamicMaxContractAmount,
	getMaxContractForPlayerAndTerm,
	getMaxContractForPlayer,
	getMaxSalaryTier,
	hasDesignatedVeteranContractRights,
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
	p.draft.tid = 0;
	p.tid = 0;
	p.transactions = [];
	p.stats = [];
	p.salaries = Array.from({ length: yearsOfService ?? 0 }, (_, i) => ({
		season: p.draft.year + i + (g.get("phase") > PHASE.PLAYOFFS ? 1 : 0),
		amount: 1000,
	}));
	p.stats = p.salaries.map(({ season }) => ({
		season,
		tid: 0,
		playoffs: false,
		gp: 0,
	})) as typeof p.stats;
	return p;
};

const setRosterHistory = (
	p: ReturnType<typeof makePlayer>,
	tid: number,
	tradeSeason?: number,
	originalTid = 0,
) => {
	p.stats = p.salaries.map(({ season }) => ({
		season,
		tid: tradeSeason !== undefined && season < tradeSeason ? originalTid : tid,
		playoffs: false,
		gp: 0,
	})) as typeof p.stats;
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

test.each([3, 4, 8, 9, 10])(
	"no-cap %s-YOS max helpers use configured limits regardless of awards, team, term, or prior salary",
	(yearsOfService) => {
		g.setWithoutSavingToDB("salaryCapType", "none");
		const p = makePlayer({
			yearsOfService,
			awards: [{ season: 2025, type: "Most Valuable Player" }],
		});
		p.salaries.at(-1)!.amount = 100000;
		for (const maxContract of [20000, 50000]) {
			g.setWithoutSavingToDB("maxContract", maxContract);
			assert.strictEqual(getMaxSalaryTier(p), maxContract / 1000);
			assert.strictEqual(getDynamicMaxContractAmount(p), maxContract);
			for (const tid of [0, 1]) {
				assert.strictEqual(getMaxContractForPlayer(p, tid), maxContract);
				for (const years of [1, 4, 5, 6, 7]) {
					for (const option of [undefined, "player", "team"] as const) {
						assert.strictEqual(
							getMaxContractForPlayerAndTerm(p, tid, years, option),
							maxContract,
						);
					}
					assert.strictEqual(
						clampContractAmountForPlayer(p, maxContract + 1, tid, years),
						maxContract,
					);
				}
			}
		}
		g.setWithoutSavingToDB("salaryCap", 200000);
		assert.strictEqual(getDynamicMaxContractAmount(p), 50000);
	},
);

test.each(["soft", "hard"] as const)(
	"%s-cap ordinary max tiers and independent 105 percent remain dynamic even above configured maxContract",
	(salaryCapType) => {
		g.setWithoutSavingToDB("salaryCapType", salaryCapType);
		g.setWithoutSavingToDB("maxContract", 20000);
		for (const [yearsOfService, amount] of [
			[3, 25000],
			[7, 30000],
			[10, 35000],
		]) {
			const p = makePlayer({ yearsOfService });
			assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 4), amount);
			p.salaries.at(-1)!.amount = 40000;
			assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4), 42000);
		}
	},
);

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
		setRosterHistory(p, earlyTradeTid, p.draft.year + 3, originalTid);
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

test.each([PHASE.RESIGN_PLAYERS, PHASE.FREE_AGENCY, PHASE.PRESEASON])(
	"Designated Veteran needs contracts in each immediately preceding cap year in phase %s",
	(phase) => {
		g.setWithoutSavingToDB("phase", phase);
		const lastSeason = g.get("season") - (phase > PHASE.PLAYOFFS ? 0 : 1);
		for (const yearsOfService of [8, 9]) {
			const p = makePlayer({
				yearsOfService,
				awards: [{ season: lastSeason, type: "Most Valuable Player" }],
			});
			p.tid = PLAYER.FREE_AGENT;
			p.priorContractTid = 0;
			assert.isTrue(hasDesignatedVeteranContractRights(p, 0));
			assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35000);
			assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 30000);
			for (const gap of [lastSeason, lastSeason - 1, lastSeason - 2]) {
				const interrupted = structuredClone(p);
				interrupted.draft.year -= 1;
				// Keep service unchanged by moving the missing roster year earlier.
				// The retained salary entry must not hide the contract gap.
				interrupted.stats.find((row) => row.season === gap)!.season =
					interrupted.draft.year;
				assert.strictEqual(getYearsOfService(interrupted), yearsOfService);
				assert.isFalse(hasDesignatedVeteranContractRights(interrupted, 0));
				assert.strictEqual(
					getMaxContractForPlayerAndTerm(interrupted, 0, 5),
					30000,
				);
			}
		}
	},
);

test("legacy salary-only history and isolated first signing fail closed for Designated Veteran", () => {
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.stats = [];
	p.tid = PLAYER.FREE_AGENT;
	p.priorContractTid = 0;
	assert.strictEqual(getYearsOfService(p), 8);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 30000);
	p.firstNBAContract = { tid: 0, season: 2018, phase: PHASE.FREE_AGENCY };
	p.transactions = [{ type: "freeAgent", ...p.firstNBAContract }];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 30000);
});

test("executed signing evidence establishes only its covered cap year, including offseason offset", () => {
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.draft.year = 2015;
	p.firstNBAContract = { tid: 0, season: 2015, phase: PHASE.FREE_AGENCY };
	p.stats.forEach((row, i) => {
		row.season = 2016 + i;
	});
	p.transactions = [2023, 2024, 2025].map((season) => ({
		type: "freeAgent",
		tid: 0,
		season,
		phase: PHASE.FREE_AGENCY,
	}));
	assert.strictEqual(getYearsOfService(p), 8);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35000);
	for (const gap of [2023, 2024, 2025]) {
		const interrupted = structuredClone(p);
		interrupted.transactions = interrupted.transactions!.filter(
			(row) => row.season !== gap,
		);
		assert.strictEqual(getYearsOfService(interrupted), 8);
		assert.strictEqual(
			getMaxContractForPlayerAndTerm(interrupted, 0, 5),
			30000,
		);
	}
	p.transactions[2]!.phase = PHASE.REGULAR_SEASON;
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 30000);
});

test("Designated Veteran rights require the actual prior team independently of the 105% maximum", () => {
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.tid = PLAYER.FREE_AGENT;
	p.priorContractTid = 1;
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 30000);
	p.priorContractTid = 0;
	p.salaries.at(-1)!.amount = 34000;
	assert.isTrue(hasDesignatedVeteranContractRights(p, 0));
	assert.isFalse(hasDesignatedVeteranContractRights(p, 1));
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 35700);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4), 35700);
});

test("10+ YOS ordinary 35% does not need recent contract continuity, prior team, or awards", () => {
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	const p = makePlayer({ yearsOfService: 10 });
	p.stats.at(-1)!.season = p.draft.year;
	p.tid = PLAYER.FREE_AGENT;
	p.priorContractTid = 0;
	assert.strictEqual(getYearsOfService(p), 10);
	for (const tid of [0, 1]) {
		for (const years of [1, 4, 5]) {
			assert.strictEqual(getMaxContractForPlayerAndTerm(p, tid, years), 35000);
		}
	}
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
	setRosterHistory(p, 1, earlyTrade.season);
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
	setRosterHistory(p, 1, p.draft.year + 4);
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
	p.stats = p.salaries.map((row) => ({
		season: row.season,
		tid: 1,
	})) as typeof p.stats;
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
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 1), 25000);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 4, "player"), 25000);
});

test("4-YOS 105% above 25% requires four seasons excluding options", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({ yearsOfService: 4 });
	p.stats = p.salaries.map((row) => ({
		season: row.season,
		tid: 0,
	})) as typeof p.stats;
	p.salaries = [{ season: g.get("season"), amount: 30000 }];
	for (const years of [1, 2, 3]) {
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, years), 25000);
	}
	for (const option of ["player", "team"] as const) {
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 4, option), 25000);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5, option), 31500);
	}
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 4), 31500);
});

test.each([false, true])(
	"undrafted first-contract team qualifies and moves preserve or break continuity (snapshot %s)",
	(snapshot) => {
		g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
		const p = makePlayer({
			yearsOfService: 8,
			awards: [{ season: 2026, type: "Most Valuable Player" }],
		});
		p.draft.tid = -1;
		p.draft.originalTid = -1;
		p.draft.round = 0;
		const first = { season: p.draft.year, phase: PHASE.FREE_AGENCY, tid: 2 };
		if (snapshot) {
			p.firstNBAContract = first;
		}
		p.transactions = [{ ...first, type: "freeAgent" }];
		p.tid = 2;
		setRosterHistory(p, 2);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 2, 5), 35000);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 30000);
		p.transactions.push({
			type: "trade",
			season: p.draft.year + 3,
			phase: PHASE.REGULAR_SEASON,
			tid: 1,
			fromTid: 2,
		});
		p.tid = 1;
		setRosterHistory(p, 1, p.draft.year + 3, 2);
		assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 35000);
		p.transactions.push({
			type: "trade",
			season: p.draft.year + 6,
			phase: PHASE.REGULAR_SEASON,
			tid: 0,
			fromTid: 1,
		});
		for (const tid of [0, 1, 2]) {
			assert.strictEqual(getMaxContractForPlayerAndTerm(p, tid, 5), 30000);
		}
	},
);

test("drafted first contract follows selecting team rather than original pick owner", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 9,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.draft.tid = 2;
	p.draft.originalTid = 0;
	p.tid = 2;
	setRosterHistory(p, 2);
	p.transactions = [
		{
			type: "draft",
			season: p.draft.year,
			phase: PHASE.DRAFT,
			tid: 2,
			pickNum: 1,
		},
	];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 2, 5), 35000);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 30000);
});

test("legacy undrafted stats identify first contracted team before a later free-agent move", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.draft.tid = -1;
	p.draft.originalTid = -1;
	p.tid = 2;
	p.stats = p.salaries.map((row) => ({
		season: row.season,
		tid: 2,
	})) as typeof p.stats;
	p.transactions = [];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 2, 5), 35000);
	p.transactions = [
		{
			type: "freeAgent",
			season: p.draft.year + 6,
			phase: PHASE.FREE_AGENCY,
			tid: 1,
		},
	];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 30000);
});

test("first signing snapshot overrides an unsigned draft team's history", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.firstNBAContract = {
		tid: 2,
		season: p.draft.year,
		phase: PHASE.FREE_AGENCY,
	};
	p.tid = 2;
	setRosterHistory(p, 2);
	p.transactions = [
		{
			type: "draft",
			season: p.draft.year,
			phase: PHASE.DRAFT,
			tid: 0,
			pickNum: 1,
		},
		{ type: "freeAgent", ...p.firstNBAContract },
	];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 2, 5), 35000);
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 0, 5), 30000);
});

test.each([PHASE.DRAFT, PHASE.FREE_AGENCY, PHASE.REGULAR_SEASON])(
	"first signing phase %s anchors four covered salary seasons independently of draft age",
	(phase) => {
		g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
		const p = makePlayer({
			yearsOfService: 8,
			awards: [{ season: 2026, type: "Most Valuable Player" }],
		});
		p.draft.year = 2016;
		p.firstNBAContract = {
			tid: 0,
			season: phase === PHASE.REGULAR_SEASON ? 2019 : 2018,
			phase,
		};
		const firstSalary = 2019;
		for (const offset of [3, 4]) {
			p.tid = 1;
			setRosterHistory(p, 1, firstSalary + offset);
			p.transactions = [
				{
					type: "trade",
					fromTid: 0,
					tid: 1,
					season: firstSalary + offset,
					phase: PHASE.REGULAR_SEASON,
				},
			];
			assert.strictEqual(
				getMaxContractForPlayerAndTerm(p, 1, 5),
				offset === 3 ? 35000 : 30000,
			);
		}
	},
);

test.each(["snapshot", "transactions", "stats"] as const)(
	"delayed undrafted signing uses the same salary boundary with %s history",
	(history) => {
		g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
		const p = makePlayer({
			yearsOfService: 8,
			awards: [{ season: 2026, type: "Most Valuable Player" }],
		});
		p.draft.year = 2016;
		p.draft.tid = -1;
		const first = { season: 2018, phase: PHASE.FREE_AGENCY, tid: 0 };
		if (history === "snapshot") {
			p.firstNBAContract = first;
		}
		for (const season of [2022, 2023]) {
			p.tid = 1;
			p.stats = p.salaries.map((row) => ({
				season: row.season,
				tid: row.season < season ? 0 : 1,
			})) as typeof p.stats;
			p.transactions =
				history === "stats"
					? []
					: [
							{ ...first, type: "freeAgent" },
							{
								season,
								phase: PHASE.REGULAR_SEASON,
								type: "trade",
								fromTid: 0,
								tid: 1,
							},
						];
			assert.strictEqual(
				getMaxContractForPlayerAndTerm(p, 1, 5),
				history === "stats" ? 30000 : season === 2022 ? 35000 : 30000,
			);
		}
	},
);

test("service counts distinct roster seasons, excludes unsigned gaps, and all max rules share it", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	for (const yos of [4, 7, 8, 9, 10]) {
		const p = makePlayer({
			yearsOfService: yos,
			awards: [{ season: 2026, type: "Most Valuable Player" }],
		});
		p.draft.year -= 2;
		p.firstNBAContract = {
			tid: 0,
			season: 2026 - yos,
			phase: PHASE.FREE_AGENCY,
		};
		assert.strictEqual(getYearsOfService(p), yos);
		assert.strictEqual(getMaxSalaryTier(p), yos === 10 ? 35 : 30);
		assert.strictEqual(
			getMaxContractForPlayerAndTerm(p, 0, 5),
			yos === 8 || yos === 9 || yos === 10 ? 35000 : 30000,
		);
		p.stats = p.salaries.map((row) => ({
			season: row.season,
			tid: 0,
		})) as typeof p.stats;
		p.stats.push({ ...p.stats[0]! });
		assert.strictEqual(getYearsOfService(p), yos);
	}
	const p = makePlayer({ yearsOfService: 8 });
	p.stats = [];
	p.salaries = [
		{ season: 2025, amount: 1000 },
		{ season: 2027, amount: 1000 },
	];
	assert.strictEqual(getYearsOfService(p), 1);
	p.salaries = [];
	assert.strictEqual(getYearsOfService(p), 0);
});

test("legacy delayed signing ignores an unsigned draft transaction when locating salary years", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.draft.year = 2016;
	p.tid = 1;
	setRosterHistory(p, 1, 2022);
	p.transactions = [
		{ type: "draft", tid: 0, season: 2016, phase: PHASE.DRAFT, pickNum: 1 },
		{ type: "freeAgent", tid: 0, season: 2018, phase: PHASE.FREE_AGENCY },
		{
			type: "trade",
			tid: 1,
			fromTid: 0,
			season: 2022,
			phase: PHASE.REGULAR_SEASON,
		},
	];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 35000);
	p.transactions[2]!.season = 2023;
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 30000);
});

test("roster service includes zero-game seasons and deduplicates teams without filling gaps", () => {
	const p = makePlayer({ yearsOfService: 10 });
	p.stats = [
		{ season: 2020, tid: 0, gp: 0 },
		{ season: 2020, tid: 1, gp: 0 },
		{ season: 2022, tid: 1, gp: 0 },
		{ season: 2023, tid: PLAYER.FREE_AGENT, gp: 0 },
	] as typeof p.stats;
	assert.strictEqual(getYearsOfService(p), 2);
	assert.strictEqual(getMaxSalaryTier(p), 25);
});

test("legacy stats consistency checks use the fourth covered salary season", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.draft.year = 2016;
	for (const season of [2022, 2023]) {
		p.stats = [
			...p.salaries.map((row) => ({ season: row.season, tid: 0 })),
			{ season, tid: 1 },
		] as typeof p.stats;
		assert.strictEqual(
			getMaxContractForPlayerAndTerm(p, 0, 5),
			season === 2022 ? 35000 : 30000,
		);
	}
});

test("offseason trade immediately after the fourth covered salary season is too late", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	p.firstNBAContract = { tid: 0, season: 2018, phase: PHASE.DRAFT };
	p.tid = 1;
	setRosterHistory(p, 1, 2022);
	p.transactions = [
		{
			type: "trade",
			fromTid: 0,
			tid: 1,
			season: 2022,
			phase: PHASE.REGULAR_SEASON,
		},
	];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 35000);
	p.transactions[0]!.phase = PHASE.FREE_AGENCY;
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 30000);
});

test.each([
	PHASE.PRESEASON,
	PHASE.REGULAR_SEASON,
	PHASE.AFTER_TRADE_DEADLINE,
	PHASE.PLAYOFFS,
	PHASE.DRAFT_LOTTERY,
	PHASE.DRAFT,
	PHASE.AFTER_DRAFT,
	PHASE.RESIGN_PLAYERS,
	PHASE.FREE_AGENCY,
])(
	"completed service boundaries in phase %s use one value for all max rules",
	(phase) => {
		g.setWithoutSavingToDB("phase", phase);
		const offseason = phase > PHASE.PLAYOFFS;
		for (const completed of [3, 6, 7, 9]) {
			const p = makePlayer({
				awards: [{ season: 2025, type: "Most Valuable Player" }],
			});
			p.draft.year = 2025 - completed;
			p.salaries = Array.from({ length: completed + 1 }, (_, i) => ({
				season: 2026 - completed + i,
				amount: 1000,
			}));
			p.stats = p.salaries.map(({ season }) => ({
				season,
				tid: 0,
				playoffs: false,
				gp: 0,
			})) as typeof p.stats;
			const expected = completed + (offseason ? 1 : 0);
			for (const history of ["roster", "salary", "transactions"]) {
				if (history === "salary") {
					p.stats = [];
					// Salary logs establish service in this legacy fixture; executed
					// signings independently establish the prior three contract years.
					p.transactions = p.salaries.map(({ season }) => ({
						season,
						phase: PHASE.REGULAR_SEASON,
						tid: 0,
						type: "freeAgent",
					}));
				}
				if (history === "transactions") {
					p.transactions = p.salaries.map(({ season }) => ({
						season,
						phase: PHASE.REGULAR_SEASON,
						tid: 0,
						type: "freeAgent",
					}));
					p.salaries = [];
				}
				assert.strictEqual(getYearsOfService(p), expected);
				assert.strictEqual(
					getMaxSalaryTier(p),
					expected === 10 ? 35 : expected === 4 || expected >= 7 ? 30 : 25,
				);
				assert.strictEqual(
					getMaxContractForPlayerAndTerm(p, 0, 5),
					expected >= 8
						? 35000
						: expected === 4 || expected >= 7
							? 30000
							: 25000,
				);
			}
		}
	},
);

test.each([PHASE.REGULAR_SEASON, PHASE.RESIGN_PLAYERS, PHASE.FREE_AGENCY])(
	"playoff-only roster rows never credit service in phase %s",
	(phase) => {
		g.setWithoutSavingToDB("phase", phase);
		const p = makePlayer({ yearsOfService: 8 });
		p.stats = [{ season: 2025, tid: 0, playoffs: true }] as typeof p.stats;
		assert.strictEqual(getYearsOfService(p), 0);
		p.stats.push({
			season: 2024,
			tid: 0,
			playoffs: false,
			gp: 0,
		} as (typeof p.stats)[number]);
		assert.strictEqual(getYearsOfService(p), 1);
	},
);

test.each([
	[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
	[2019, 2021, 2022, 2023, 2024, 2025, 2026, 2027],
	[2019, 2022, 2024, 2025, 2026, 2027, 2028, 2029],
])("early trades count distinct contracted years starting %s", (...seasons) => {
	g.setWithoutSavingToDB("season", seasons.at(-1)!);
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	for (const source of ["salary", "roster", "signing"] as const) {
		const p = makePlayer({
			awards: [{ season: seasons.at(-1)!, type: "Most Valuable Player" }],
		});
		p.draft.year = 2016;
		p.draft.tid = -1;
		p.tid = 1;
		p.firstNBAContract = { season: 2019, phase: PHASE.REGULAR_SEASON, tid: 0 };
		p.salaries =
			source === "salary"
				? seasons.map((season) => ({ season, amount: 1000 }))
				: [];
		for (const index of [3, 4]) {
			p.stats =
				source === "roster"
					? (seasons.map((season) => ({
							season,
							tid: season < seasons[index]! ? 0 : 1,
							playoffs: false,
						})) as typeof p.stats)
					: [];
			p.transactions =
				source === "signing"
					? seasons.map((season) => ({
							season,
							phase: PHASE.REGULAR_SEASON,
							tid: season < seasons[index]! ? 0 : 1,
							type: "freeAgent",
						}))
					: source === "salary"
						? seasons.slice(-3).map((season) => ({
								season,
								phase: PHASE.REGULAR_SEASON,
								tid: 1,
								type: "freeAgent",
							}))
						: [];
			p.transactions.unshift({
				season: seasons[index]!,
				phase: PHASE.REGULAR_SEASON,
				tid: 1,
				fromTid: 0,
				type: "trade",
			});
			assert.strictEqual(getYearsOfService(p), 8);
			assert.strictEqual(
				getMaxContractForPlayerAndTerm(p, 1, 5),
				index === 3 ? 35000 : 30000,
			);
		}
	}
});

test("service stays stable across offseason and preseason, then credits the next completed season", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({ yearsOfService: 7 });
	p.stats = p.salaries.map(({ season }) => ({
		season,
		tid: 0,
		playoffs: false,
	})) as typeof p.stats;
	assert.strictEqual(getYearsOfService(p), 7);
	g.setWithoutSavingToDB("phase", PHASE.FREE_AGENCY);
	assert.strictEqual(getYearsOfService(p), 7);
	g.setWithoutSavingToDB("season", 2027);
	g.setWithoutSavingToDB("phase", PHASE.PRESEASON);
	p.stats.push({
		season: 2027,
		tid: 0,
		playoffs: false,
	} as (typeof p.stats)[number]);
	assert.strictEqual(getYearsOfService(p), 7);
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	assert.strictEqual(getYearsOfService(p), 7);
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	assert.strictEqual(getYearsOfService(p), 8);
});

test("sparse contracted history does not authorize a trade outside evidenced years", () => {
	g.setWithoutSavingToDB("phase", PHASE.RESIGN_PLAYERS);
	const p = makePlayer({
		yearsOfService: 8,
		awards: [{ season: 2026, type: "Most Valuable Player" }],
	});
	// Service is known, but a legacy move predates the retained contract years.
	p.draft.year = 2010;
	p.firstNBAContract = { season: 2010, phase: PHASE.FREE_AGENCY, tid: 0 };
	p.transactions = [
		{
			season: 2018,
			phase: PHASE.REGULAR_SEASON,
			type: "trade",
			fromTid: 0,
			tid: 1,
		},
	];
	assert.strictEqual(getMaxContractForPlayerAndTerm(p, 1, 5), 30000);
});
