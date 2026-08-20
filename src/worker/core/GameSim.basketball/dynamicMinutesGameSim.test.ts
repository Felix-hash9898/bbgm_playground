import { assert, beforeEach, expect, test } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g, helpers } from "../../util/index.ts";
import { idb } from "../../db/index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import GameSim from "./index.ts";

const PLAN = [36, 34, 32, 30, 28, 26, 22, 18, 14, 0];
const POSITIONS = ["PG", "SG", "SF", "PF", "C", "G", "F", "FC", "GF", "C"];

const seedRandom = (seed: number) => {
	let value = seed >>> 0;
	Math.random = () => {
		value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
		return value / 2 ** 32;
	};
};

const makeRosters = (rosterSize = 10) => {
	seedRandom(1000);
	return [0, 1].map((tid) =>
		Array.from({ length: rosterSize }, (_, i) => {
			const p = player.generate(tid, 24 + (i % 5), 2020, true, DEFAULT_LEVEL);
			p.pid = tid * 100 + i;
			p.rosterOrder = i;
			const ratings = p.ratings.at(-1)!;
			ratings.pos = POSITIONS[i % POSITIONS.length]!;
			ratings.endu = 75;
			ratings.ovr = 78 - i * 3;
			return p;
		}),
	);
};

const setup = async ({
	legacyNoise = false,
	plan = PLAN,
	injuredIndex,
	reverseOrder = false,
	controlledOpponent = false,
}: {
	legacyNoise?: boolean;
	plan?: number[];
	injuredIndex?: number;
	reverseOrder?: boolean;
	controlledOpponent?: boolean;
} = {}) => {
	const rosters = makeRosters(Math.max(10, plan.length));
	if (reverseOrder) {
		for (const roster of rosters) {
			for (const [i, p] of roster.entries()) {
				p.rosterOrder = roster.length - i - 1;
			}
		}
	}
	if (injuredIndex !== undefined) {
		rosters[0]![injuredIndex]!.injury = {
			type: "Sprained ankle",
			gamesRemaining: 5,
		};
	}
	if (legacyNoise) {
		for (const p of rosters[0]!) {
			p.ptModifier = p.rosterOrder % 2 === 0 ? 0 : 1.5;
			p.targetMinutes = 48 - p.rosterOrder * 4;
		}
	}
	const defaults = helpers.getTeamsDefault().slice(0, 2);
	const teams = defaults.map(team.generate);
	teams[0]!.basketballRotation = {
		version: 1,
		mode: "custom",
		minutesByPid: Object.fromEntries(
			rosters[0]!.map((p, i) => [p.pid!, plan[i]!]),
		),
		numPlayersOnCourtAtSave: 5,
	};
	if (controlledOpponent) {
		g.setWithoutSavingToDB("userTids", [0, 1]);
		teams[1]!.basketballRotation = {
			version: 1,
			mode: "custom",
			minutesByPid: Object.fromEntries(
				rosters[1]!.map((p, i) => [p.pid!, plan[i]!]),
			),
			numPlayersOnCourtAtSave: 5,
		};
	}
	await resetCache({
		players: [...rosters[0]!, ...rosters[1]!],
		teams,
		teamSeasons: defaults.map((t) => team.genSeasonRow(t)),
		teamStats: defaults.map((t) => team.genStatsRow(t.tid)),
	});
	return rosters;
};

const simOne = async (seed: number, beforeRun?: (sim: GameSim) => void) => {
	seedRandom(seed);
	const loaded = await loadTeams([0, 1], {});
	assert(loaded[0] && loaded[1]);
	const sim = new GameSim({
		gid: seed,
		teams: [loaded[0], loaded[1]],
		baseInjuryRate: 0,
		doPlayByPlay: false,
		homeCourtFactor: 1,
		allStarGame: false,
		neutralSite: true,
	});
	beforeRun?.(sim);
	const result = sim.run();
	return { loaded, result, sim };
};

const forceRemovalComparison = async ({
	seed,
	plan,
	configure,
	quarterLength = 12,
	elapsed = 6,
}: {
	seed: number;
	plan: number[];
	configure?: (args: { onCourt: any; incoming: any; sim: GameSim }) => void;
	quarterLength?: number;
	elapsed?: number;
}) => {
	let observed:
		| {
				removed: boolean;
				incomingOnCourt: boolean;
				onCourtCourtTime: number;
				incomingCourtTime: number;
				abandoned: boolean;
		  }
		| undefined;
	await setup({ plan });
	await simOne(seed, (sim) => {
		sim.o = 0;
		sim.d = 1;
		sim.t = (quarterLength - elapsed) * 60;
		sim.team[0]!.stat.ptsQtrs = [0];
		sim.team[1]!.stat.ptsQtrs = [0];

		const onCourt = sim.playersOnCourt[0]![0]!;
		const incoming = sim.team[0]!.player.find(
			(p) => !sim.playersOnCourt[0]!.includes(p),
		)!;
		for (const p of sim.team[0]!.player) {
			p.stat.energy = 1;
			p.stat.min = 0;
			p.stat.benchTime = -100;
			p.valueNoPot = p === onCourt ? 1 : p === incoming ? 1000 : 0.1;
		}
		onCourt.stat.courtTime = 3;
		incoming.stat.benchTime = 3;
		incoming.pos = onCourt.pos;
		configure?.({ onCourt, incoming, sim });
		sim.updatePlayersOnCourt();
		observed = {
			removed: !sim.playersOnCourt[0]!.includes(onCourt),
			incomingOnCourt: sim.playersOnCourt[0]!.includes(incoming),
			onCourtCourtTime: onCourt.stat.courtTime,
			incomingCourtTime: incoming.stat.courtTime,
			abandoned: sim.dynamicMinutesState[0].abandonedPlan,
		};
	});
	assert(observed);
	return observed;
};

const forceLateGameComparison = async ({
	seed,
	clockSeconds,
	incomingBaseValue = 80,
	incomingTargetMinutes,
	servedTinyTarget = false,
	zeroTargetBench = false,
}: {
	seed: number;
	clockSeconds: number;
	incomingBaseValue?: number;
	incomingTargetMinutes?: number;
	servedTinyTarget?: boolean;
	zeroTargetBench?: boolean;
}) => {
	let observed:
		| {
				lateGame: boolean;
				removed: boolean;
				incomingOnCourt: boolean;
		  }
		| undefined;
	await setup();
	await simOne(seed, (sim) => {
		sim.o = 0;
		sim.d = 1;
		sim.t = clockSeconds;
		sim.team[0]!.stat.pts = 108;
		sim.team[1]!.stat.pts = 102;
		sim.team[0]!.stat.ptsQtrs = [27, 27, 27, 27];
		sim.team[1]!.stat.ptsQtrs = [25, 25, 26, 26];

		const onCourt = sim.playersOnCourt[0]![0]!;
		const incoming = sim.team[0]!.player.find(
			(p) =>
				!sim.playersOnCourt[0]!.includes(p) &&
				(zeroTargetBench ? p.plannedMinutes === 0 : true),
		)!;
		if (zeroTargetBench) {
			assert.strictEqual(incoming.plannedMinutes, 0);
		}
		if (incomingTargetMinutes !== undefined) {
			incoming.plannedMinutes = incomingTargetMinutes;
		}
		const elapsed = 48 - clockSeconds / 60;

		for (const p of sim.team[0]!.player) {
			p.injured = false;
			p.stat.energy = 1;
			p.stat.courtTime = 3;
			p.stat.benchTime = 3;
			p.stat.min = p.plannedMinutes * (elapsed / 48);
			p.valueNoPot = sim.playersOnCourt[0]!.includes(p) ? 1000 : 0.1;
		}
		onCourt.valueNoPot = 100;
		incoming.valueNoPot = incomingBaseValue;
		onCourt.stat.min = onCourt.plannedMinutes * (elapsed / 48) + 1.25;
		if (zeroTargetBench) {
			incoming.stat.min = 0;
		} else {
			incoming.stat.min = Math.max(
				0,
				incoming.plannedMinutes * (elapsed / 48) - 1.25,
			);
		}
		incoming.pos = onCourt.pos;

		if (servedTinyTarget) {
			onCourt.stat.min = onCourt.plannedMinutes * (elapsed / 48);
			incoming.stat.min = incoming.plannedMinutes;
			sim.dynamicMinutesState[0].positiveTargetCompletedStint.add(incoming.id);
		}

		sim.updatePlayersOnCourt();

		observed = {
			lateGame: sim.isLateGame(),
			removed: !sim.playersOnCourt[0]!.includes(onCourt),
			incomingOnCourt: sim.playersOnCourt[0]!.includes(incoming),
		};
	});
	assert(observed);
	return observed;
};

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("season", 2024);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB("userTids", [0]);
	g.setWithoutSavingToDB("spectator", false);
});

test("loadTeams gives user and AI teams exact Dynamic plans, including old-save Auto", async () => {
	await setup();
	seedRandom(2000);
	let loaded = await loadTeams([0, 1], {});
	assert(loaded[0] && loaded[1]);
	for (const t of [loaded[0], loaded[1]]) {
		assert.closeTo(
			t.player.reduce((sum: number, p: any) => sum + p.plannedMinutes, 0),
			240,
			8,
		);
		assert(
			t.player.every(
				(p: any) => p.plannedMinutes >= 0 && p.plannedMinutes <= 48,
			),
		);
	}
	assert.deepEqual(
		loaded[0].player.map((p: any) => p.plannedMinutes),
		PLAN,
	);

	const aiTeam = (await idb.cache.teams.get(1))!;
	aiTeam.basketballRotation = {
		version: 1,
		mode: "custom",
		minutesByPid: Object.fromEntries(
			loaded[1].player.map((p: any, i: number) => [p.id, i < 5 ? 48 : 0]),
		),
		numPlayersOnCourtAtSave: 5,
	};
	await idb.cache.teams.put(aiTeam);
	seedRandom(2000);
	loaded = await loadTeams([0, 1], {});
	assert(loaded[1]);
	assert.notDeepEqual(
		loaded[1].player.map((p: any) => p.plannedMinutes),
		[48, 48, 48, 48, 48, 0, 0, 0, 0, 0],
	);
});

test("loadTeams blocks an invalid-total persisted custom draft without rewriting it", async () => {
	const plan = [...PLAN];
	plan[0] = plan[0]! - 1;
	const rosters = await setup({ plan });

	await expect(loadTeams([0, 1], {})).rejects.toThrow(
		/must total 240.*Roster page/,
	);
	assert.deepEqual(
		(await idb.cache.teams.get(0))!.basketballRotation!.minutesByPid,
		Object.fromEntries(rosters[0]!.map((p, i) => [p.pid!, plan[i]!])),
	);
});

test("loadTeams applies injury no-increase protection only to effective planned minutes", async () => {
	const rosters = await setup({ injuredIndex: 0 });
	const userTeam = (await idb.cache.teams.get(0))!;
	userTeam.basketballRotation!.noInjuryMinutesIncreasePids = [
		rosters[0]![1]!.pid!,
	];
	await idb.cache.teams.put(userTeam);

	const loaded = await loadTeams([0, 1], {});
	assert(loaded[0]);
	assert.strictEqual(loaded[0].player[0]!.plannedMinutes, 0);
	assert.isAtMost(loaded[0].player[1]!.plannedMinutes, PLAN[1]!);
	assert.closeTo(
		loaded[0].player.reduce((sum: number, p: any) => sum + p.plannedMinutes, 0),
		240,
		1e-7,
	);
});

test("loadTeams keeps inactive reserves strictly zero through Current Override promotion boundaries", async () => {
	const plan = [38, 35, 33, 30, 27, 24, 20, 18, 15, 0, 0, 0, 0, 0];
	const rosters = await setup({ plan, injuredIndex: 0 });
	const userTeam = (await idb.cache.teams.get(0))!;
	userTeam.basketballRotation = {
		...userTeam.basketballRotation!,
		rotationDepth: "short",
		coreReliance: "high",
		currentMinutesOverrideByPid: { 1: 10 },
		currentMinutesOverrideContext: {
			rosterPids: rosters[0]!.map((p) => p.pid!).toSorted((a, b) => a - b),
			unavailablePids: [rosters[0]![0]!.pid!],
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		},
	};
	await idb.cache.teams.put(userTeam);

	const loaded = await loadTeams([0, 1], {});
	assert(loaded[0]);
	const byId = new Map<number, any>(
		loaded[0].player.map((p: any) => [p.id, p]),
	);
	assert.strictEqual(byId.get(1)!.plannedMinutes, 10);
	assert.strictEqual(byId.get(9)!.plannedMinutes, 0);
	assert.isAbove(byId.get(10)!.plannedMinutes, 0);
	assert.isAbove(byId.get(11)!.plannedMinutes, 0);
	for (const pid of [12, 13]) {
		assert.strictEqual(byId.get(pid)!.plannedMinutes, 0);
	}
	assert.closeTo(
		loaded[0].player.reduce((sum: number, p: any) => sum + p.plannedMinutes, 0),
		240,
		1e-7,
	);
});

test("loadTeams permanently clears a stale Current Override before a repeated injury episode", async () => {
	const rosters = await setup({ injuredIndex: 0 });
	const userTeam = (await idb.cache.teams.get(0))!;
	userTeam.basketballRotation = {
		...userTeam.basketballRotation!,
		currentMinutesOverrideByPid: { 1: 10 },
		currentMinutesOverrideContext: {
			rosterPids: rosters[0]!.map((p) => p.pid!).toSorted((a, b) => a - b),
			unavailablePids: [0],
			numPlayersOnCourt: 5,
			regulationMinutes: 48,
		},
	};
	await idb.cache.teams.put(userTeam);

	const returned = (await idb.cache.players.get(0))!;
	returned.injury = { type: "Healthy", gamesRemaining: 0 };
	const newlyInjured = (await idb.cache.players.get(2))!;
	newlyInjured.injury = { type: "Knee", gamesRemaining: 5 };
	await idb.cache.players.put(returned);
	await idb.cache.players.put(newlyInjured);
	let loaded = await loadTeams([0, 1], {});
	let rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.isUndefined(rotation.currentMinutesOverrideContext);
	assert.notStrictEqual(
		loaded[0]!.player.find((p: any) => p.id === 1)!.plannedMinutes,
		10,
	);

	returned.injury = { type: "Ankle", gamesRemaining: 5 };
	newlyInjured.injury = { type: "Healthy", gamesRemaining: 0 };
	await idb.cache.players.put(returned);
	await idb.cache.players.put(newlyInjured);
	loaded = await loadTeams([0, 1], {});
	rotation = (await idb.cache.teams.get(0))!.basketballRotation!;
	assert.isUndefined(rotation.currentMinutesOverrideByPid);
	assert.notStrictEqual(
		loaded[0]!.player.find((p: any) => p.id === 1)!.plannedMinutes,
		10,
	);
});

test("the user-facing Auto path does not reveal true endurance in no-ratings mode", async () => {
	const rosters = await setup();
	const userTeam = (await idb.cache.teams.get(0))!;
	userTeam.basketballRotation = { version: 1, mode: "auto" };
	await idb.cache.teams.put(userTeam);
	g.setWithoutSavingToDB("challengeNoRatings", true);
	seedRandom(2500);
	let loaded = await loadTeams([0, 1], {});
	const baseline = loaded[0]!.player.map((p: any) => p.plannedMinutes);

	for (const [i, p] of rosters[0]!.entries()) {
		p.ratings.at(-1)!.endu = i % 2 === 0 ? 0 : 100;
		await idb.cache.players.put(p);
	}
	seedRandom(2500);
	loaded = await loadTeams([0, 1], {});
	assert.deepEqual(
		loaded[0]!.player.map((p: any) => p.plannedMinutes),
		baseline,
	);
});

test("legacy basketball PT and targetMinutes cannot change a production GameSim", async () => {
	await setup();
	const baseline = await simOne(3000);
	const baselineSummary = baseline.result.team.map((t) => ({
		pts: t.stat.pts,
		minutes: t.player.map((p) => [p.id, p.stat.min]),
	}));

	await setup({ legacyNoise: true });
	const noisy = await simOne(3000);
	assert.deepEqual(
		noisy.result.team.map((t) => ({
			pts: t.stat.pts,
			minutes: t.player.map((p) => [p.id, p.stat.min]),
		})),
		baselineSummary,
	);
});

test("roster order changes the opener without changing the saved custom minutes", async () => {
	const rosters = await setup({ reverseOrder: true });
	const savedBefore = structuredClone(
		(await idb.cache.teams.get(0))!.basketballRotation!.minutesByPid,
	);
	const { result } = await simOne(3500);
	const starters = result.team[0]!.player.filter((p) => p.stat.gs === 1)
		.map((p) => p.id)
		.sort((a, b) => a - b);
	const expected = rosters[0]!
		.toSorted((a, b) => a.rosterOrder - b.rosterOrder)
		.slice(0, 5)
		.map((p) => p.pid!)
		.sort((a, b) => a - b);
	assert.deepEqual(starters, expected);
	assert.deepEqual(
		(await idb.cache.teams.get(0))!.basketballRotation!.minutesByPid,
		savedBefore,
	);
});

test("production Dynamic follows a representative custom plan over real games", async () => {
	const rosters = await setup();
	const totals = Array(10).fill(0) as number[];
	let games = 0;
	for (let i = 0; i < 80; i++) {
		const { result, sim } = await simOne(10_000 + i * 101);
		if (result.overtimes > 0 || sim.dynamicMinutesState[0].abandonedPlan) {
			continue;
		}
		const byPid = new Map(result.team[0]!.player.map((p) => [p.id, p]));
		for (const [j, p] of rosters[0]!.entries()) {
			totals[j]! += byPid.get(p.pid!)?.stat.min ?? 0;
		}
		games += 1;
	}
	assert(games >= 30);
	const means = totals.map((total) => total / games);
	const mae =
		means.reduce(
			(total, minutes, i) => total + Math.abs(minutes - PLAN[i]!),
			0,
		) / means.length;
	assert(mae < 3, `expected production plan MAE < 3, got ${mae}`);
	assert(means[9]! < 0.1, `non-starter target 0 played ${means[9]} minutes`);
});

test("a 0-minute starter gets only the opening stint while a 0-minute bench player stays DNP", async () => {
	const plan = [0, 40, 38, 36, 34, 30, 26, 20, 16, 0];
	const rosters = await setup({ plan });
	let games = 0;
	let starterMinutes = 0;
	let benchMinutes = 0;
	for (let i = 0; i < 80; i++) {
		const { result, sim } = await simOne(20_000 + i * 101);
		if (result.overtimes > 0 || sim.dynamicMinutesState[0].abandonedPlan) {
			continue;
		}
		const byPid = new Map(result.team[0]!.player.map((p) => [p.id, p]));
		const opener = byPid.get(rosters[0]![0]!.pid!)!;
		assert.strictEqual(opener.stat.gs, 1);
		starterMinutes += opener.stat.min;
		benchMinutes += byPid.get(rosters[0]![9]!.pid!)!.stat.min;
		games += 1;
	}
	assert(games >= 30);
	assert(starterMinutes / games > 2 && starterMinutes / games < 10);
	assert(benchMinutes / games < 0.1);
});

test("a tiny positive target receives a bounded real stint", async () => {
	const plan = [34, 34, 32, 30, 28, 26, 22, 18, 14, 2];
	const rosters = await setup({ plan, controlledOpponent: true });
	let games = 0;
	let minutes = 0;
	for (let i = 0; i < 80; i++) {
		const { result, sim } = await simOne(30_000 + i * 103);
		if (result.overtimes > 0 || sim.dynamicMinutesState[0].abandonedPlan) {
			continue;
		}
		const p = result.team[0]!.player.find((p) => p.id === rosters[0]![9]!.pid)!;
		minutes += p.stat.min;
		games += 1;
	}
	const mean = minutes / games;
	assert(games >= 30);
	assert(mean > 0.5 && mean < 4.5, `tiny target realized ${mean} minutes`);
});

test("late-game Dynamic keeps the materially stronger closer ahead of minute debt", async () => {
	for (const [i, clockSeconds] of [359, 180, 90].entries()) {
		const observed = await forceLateGameComparison({
			seed: 70_000 + i,
			clockSeconds,
		});
		assert(observed.lateGame);
		assert(
			!observed.removed,
			`100-value closer was removed at ${clockSeconds}s`,
		);
		assert(!observed.incomingOnCourt);
	}

	const strongerGap = await forceLateGameComparison({
		seed: 70_003,
		clockSeconds: 90,
		incomingBaseValue: 90,
	});
	assert(!strongerGap.removed);
	assert(!strongerGap.incomingOnCourt);
});

test("late-game Dynamic caps tiny-target catch-up without removing the stronger closer", async () => {
	const observed = await forceLateGameComparison({
		seed: 71_000,
		clockSeconds: 90,
		incomingBaseValue: 80,
		incomingTargetMinutes: 4,
	});
	assert(observed.lateGame);
	assert(!observed.removed);
	assert(!observed.incomingOnCourt);
});

test("late-game Dynamic preserves served tiny-target re-entry suppression", async () => {
	const observed = await forceLateGameComparison({
		seed: 71_001,
		clockSeconds: 90,
		incomingBaseValue: 200,
		incomingTargetMinutes: 4,
		servedTinyTarget: true,
	});
	assert(observed.lateGame);
	assert(!observed.removed);
	assert(!observed.incomingOnCourt);
});

test("late-game Dynamic keeps a 0-minute bench player locked out", async () => {
	const observed = await forceLateGameComparison({
		seed: 71_002,
		clockSeconds: 90,
		incomingBaseValue: 10_000,
		zeroTargetBench: true,
	});
	assert(observed.lateGame);
	assert(!observed.removed);
	assert(!observed.incomingOnCourt);
});

test("the late-game boundary remains strictly below 6:00", async () => {
	const atSixMinutes = await forceLateGameComparison({
		seed: 71_003,
		clockSeconds: 360,
	});
	const underSixMinutes = await forceLateGameComparison({
		seed: 71_004,
		clockSeconds: 359,
	});
	assert(!atSixMinutes.lateGame);
	assert(underSixMinutes.lateGame);
});

test("symmetric court-removal 0.75 uses the loaded target in both directions", async () => {
	const higherTarget = await forceRemovalComparison({
		seed: 31_000,
		plan: [36, 34, 32, 30, 28, 40, 22, 18, 0, 0],
	});
	const lowerTarget = await forceRemovalComparison({
		seed: 31_000,
		plan: [36, 34, 32, 30, 28, 4, 22, 18, 36, 0],
	});

	assert(higherTarget.removed && higherTarget.incomingOnCourt);
	assert(lowerTarget.removed && lowerTarget.incomingOnCourt);
	assert(
		higherTarget.incomingCourtTime < lowerTarget.incomingCourtTime,
		`expected higher target to receive the longer on-court wait: ${higherTarget.incomingCourtTime} vs ${lowerTarget.incomingCourtTime}`,
	);
});

test("Plan48 zero-rest lock is exact, while nearby plans remain ordinary", async () => {
	const planForFirstTarget = (target: number) => [
		target,
		78 - target,
		34,
		32,
		30,
		26,
		22,
		18,
		0,
		0,
	];

	for (const [i, target] of [40, 42, 44, 46].entries()) {
		const observed = await forceRemovalComparison({
			seed: 32_000 + i,
			plan: planForFirstTarget(target),
		});
		assert(observed.removed, `target ${target} should allow ordinary removal`);
	}

	const locked = await forceRemovalComparison({
		seed: 32_010,
		plan: planForFirstTarget(48),
	});
	assert(!locked.removed, "Plan48 player should remain in clean regulation");
});

test("zero-rest lock has the accepted injury, foul, emergency, blowout, and OT escapes", async () => {
	const plan = [48, 30, 34, 32, 30, 26, 22, 18, 0, 0];
	const injury = await forceRemovalComparison({
		seed: 33_000,
		plan,
		configure: ({ onCourt }) => {
			onCourt.injured = true;
		},
	});
	assert(injury.removed);

	const foul = await forceRemovalComparison({
		seed: 33_001,
		plan,
		configure: ({ onCourt }) => {
			onCourt.stat.pf = g.get("foulsNeededToFoulOut");
		},
	});
	assert(foul.removed);

	const emergency = await forceRemovalComparison({
		seed: 33_002,
		plan,
		configure: ({ onCourt, incoming, sim }) => {
			for (const p of sim.team[0]!.player) {
				if (p !== onCourt && p !== incoming && p.plannedMinutes > 0) {
					p.injured = true;
				}
			}
		},
	});
	assert(
		emergency.onCourtCourtTime > 2,
		"emergency depth must bypass the ordinary Plan48 timer lock",
	);

	const blowout = await forceRemovalComparison({
		seed: 33_003,
		plan,
		configure: ({ sim }) => {
			sim.team[0]!.stat.pts = 30;
			sim.team[1]!.stat.pts = 0;
			sim.team[0]!.stat.ptsQtrs = [0, 0, 0, 0];
			sim.team[1]!.stat.ptsQtrs = [0, 0, 0, 0];
			sim.t = 30;
		},
	});
	assert(blowout.abandoned && blowout.removed);

	const overtime = await forceRemovalComparison({
		seed: 33_004,
		plan,
		configure: ({ sim }) => {
			sim.overtimes = 1;
		},
	});
	assert(overtime.removed);
});

test("a 4x10 game treats a stored Plan48 as its regulation Plan40", async () => {
	g.setWithoutSavingToDB("quarterLength", 10);
	const observed = await forceRemovalComparison({
		seed: 34_000,
		plan: [48, 30, 34, 32, 30, 26, 22, 18, 0, 0],
		quarterLength: 10,
		elapsed: 5,
	});
	assert(!observed.removed);
});

test("the frozen production controller retains a monotonic high-minute curve", async () => {
	const plans = [
		[38, 36, 34, 32, 30, 26, 24, 20, 0, 0],
		[42, 36, 34, 32, 30, 26, 22, 18, 0, 0],
		[46, 36, 34, 32, 28, 24, 22, 18, 0, 0],
	];
	const realized: number[] = [];
	for (const [planIndex, plan] of plans.entries()) {
		const rosters = await setup({ plan });
		let games = 0;
		let minutes = 0;
		for (let i = 0; i < 60; i++) {
			const { result, sim } = await simOne(
				40_000 + planIndex * 10_000 + i * 107,
			);
			if (result.overtimes > 0 || sim.dynamicMinutesState[0].abandonedPlan) {
				continue;
			}
			minutes += result.team[0]!.player.find(
				(p) => p.id === rosters[0]![0]!.pid,
			)!.stat.min;
			games += 1;
		}
		assert(games >= 20);
		realized.push(minutes / games);
	}
	assert(realized[0]! < realized[1]! && realized[1]! < realized[2]!);
});

test("pregame injury is game-only and 3v3 custom regulation scales from the 48-minute plan", async () => {
	const rosters = await setup({ injuredIndex: 0 });
	seedRandom(50_000);
	let loaded = await loadTeams([0, 1], {});
	assert(loaded[0]);
	assert.strictEqual(
		loaded[0].player.find((p: any) => p.id === rosters[0]![0]!.pid)
			.plannedMinutes,
		0,
	);
	assert.closeTo(
		loaded[0].player.reduce((sum: number, p: any) => sum + p.plannedMinutes, 0),
		240,
		8,
	);

	const savedTeam = await idb.cache.teams.get(0);
	assert.strictEqual(savedTeam!.basketballRotation!.minutesByPid![0], PLAN[0]);

	g.setWithoutSavingToDB("numPlayersOnCourt", 3);
	g.setWithoutSavingToDB("quarterLength", 10);
	const plan3v3 = [30, 26, 22, 20, 18, 14, 8, 6, 0, 0];
	await setup({ plan: plan3v3 });
	seedRandom(50_001);
	loaded = await loadTeams([0, 1], {});
	assert(loaded[0]);
	assert.closeTo(
		loaded[0].player.reduce((sum: number, p: any) => sum + p.plannedMinutes, 0),
		120,
		8,
	);
	await simOne(50_002);
});

test("foul trouble, blowout abandonment, and overtime all use real GameSim exception paths", async () => {
	await setup({ controlledOpponent: true });
	const foul = await simOne(60_000, (sim) => {
		sim.team[0].player[0]!.stat.pf = 4;
	});
	assert(foul.result.team[0]!.player[0]!.stat.pf >= 4);

	await setup({ controlledOpponent: true });
	const blowout = await simOne(60_001, (sim) => {
		sim.team[0].stat.pts += 30;
	});
	assert(blowout.sim.dynamicMinutesState[0].abandonedPlan);

	await setup();
	const overtime = await simOne(60_002, (sim) => {
		const original = sim.simRegulation.bind(sim);
		sim.simRegulation = () => {
			original();
			sim.team[0].stat.pts = sim.team[1].stat.pts;
		};
	});
	assert(overtime.result.overtimes >= 1);
});
