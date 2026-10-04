import { afterEach, assert, beforeEach, expect, test, vi } from "vitest";
import { PHASE } from "../../../common/index.ts";
import type { Game, Player, ScheduleGame } from "../../../common/types.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { freeAgents, trade } from "../index.ts";
import { healInjuryForOffseason } from "../player/injury.ts";
import { getContractAvailabilityAdjustment } from "../contracts/contractMarket/injuryAdjustment.ts";
import { idb } from "../../db/index.ts";
import { g, lock } from "../../util/index.ts";
import { getDaysOffSimulationPlan } from "../season/getBasketballPlayoffDaysOff.ts";
import play, {
	processDayOver,
	processDaysOffBeforeGame,
	updateUIAfterDaysOff,
} from "./play.ts";

const mocks = {
	recomputeLocalUITeamOvrs: vi.fn(),
	realtimeUpdate: vi.fn(),
};

const season = 2016;

const makePlayer = (gamesRemaining: number) =>
	({
		contract: {
			amount: 1000,
			exp: season + 1,
		},
		draft: {
			year: season - 1,
		},
		firstName: "Test",
		gamesUntilTradable: 5,
		injury: {
			gamesRemaining,
			type: "Sprained Ankle",
		},
		lastName: "Player",
		pid: 0,
		ratings: [{ pos: "PG" }],
		retiredYear: Infinity,
		tid: 0,
	}) as unknown as Player;

const completedGame = {
	day: 103,
	gid: 1,
	playoffs: true,
	season,
	teams: [{ tid: 2 }, { tid: 3 }],
} as Game;

const upcomingGame = {
	awayTid: 3,
	day: 107,
	gid: 2,
	homeTid: 2,
} satisfies ScheduleGame;

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	await resetCache();
	lock.reset();
	mocks.recomputeLocalUITeamOvrs.mockResolvedValue(undefined);
	mocks.realtimeUpdate.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	lock.reset();
});

test("signed-player injury countdown covers a playoff return and offseason healing", async () => {
	const playoffGames = 30;
	g.setWithoutSavingToDB("numGames", 82);
	g.setWithoutSavingToDB("numGamesPlayoffSeries", [7, 7, 7, 7]);
	g.setWithoutSavingToDB("playIn", true);
	g.setWithoutSavingToDB("tragicDeathRate", 0);

	const oneYearInjury = makePlayer(80);
	oneYearInjury.pid = 0;
	oneYearInjury.injury.type = "Torn ACL";
	oneYearInjury.contract = { amount: 45000, exp: season + 1 } as any;
	const twoYearInjury = makePlayer(200);
	twoYearInjury.pid = 1;
	twoYearInjury.injury.type = "Torn Achilles Tendon";
	twoYearInjury.contract = { amount: 45000, exp: season + 2 } as any;
	await idb.cache.players.add(oneYearInjury);
	await idb.cache.players.add(twoYearInjury);

	vi.spyOn(freeAgents, "decreaseDemands").mockResolvedValue(undefined);
	vi.spyOn(freeAgents, "autoSign").mockResolvedValue(undefined);
	vi.spyOn(trade, "betweenAiTeams").mockResolvedValue(undefined);

	const oneYearProjection = getContractAvailabilityAdjustment({
		gamesRemaining: 80,
		contractYears: 1,
		gamesPerSeason: 82,
		playoffGamesPerSeason: playoffGames,
		offseasonHealingGames: 82,
	});
	const twoYearProjection = getContractAvailabilityAdjustment({
		gamesRemaining: 200,
		contractYears: 2,
		gamesPerSeason: 82,
		playoffGamesPerSeason: playoffGames,
		offseasonHealingGames: 82,
	});
	assert.strictEqual(oneYearProjection.unavailableGames, 80);
	assert.strictEqual(twoYearProjection.unavailableGames, 118);

	// Production day-over processing decrements injuries once per played game.
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	for (let game = 0; game < 82; game += 1) {
		await processDayOver({}, new Set(), ["gameSim"]);
	}
	assert.deepStrictEqual((await idb.cache.players.get(0))?.injury, {
		type: "Healthy",
		gamesRemaining: 0,
	});
	assert.strictEqual(
		(await idb.cache.players.get(1))?.injury.gamesRemaining,
		118,
	);

	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	for (let game = 0; game < playoffGames; game += 1) {
		await processDayOver({}, new Set(), ["gameSim"]);
	}
	assert.deepStrictEqual((await idb.cache.players.get(0))?.injury, {
		type: "Healthy",
		gamesRemaining: 0,
	});
	assert.strictEqual(
		(await idb.cache.players.get(1))?.injury.gamesRemaining,
		88,
	);

	// This is the exact production helper called during newPhaseBeforeDraft.
	const afterOffseason = await idb.cache.players.get(1);
	afterOffseason!.injury = healInjuryForOffseason(afterOffseason!.injury, 82);
	await idb.cache.players.put(afterOffseason!);
	assert.strictEqual(
		(await idb.cache.players.get(1))?.injury.gamesRemaining,
		6,
	);

	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	for (let game = 0; game < 6; game += 1) {
		await processDayOver({}, new Set(), ["gameSim"]);
	}
	assert.deepStrictEqual((await idb.cache.players.get(1))?.injury, {
		type: "Healthy",
		gamesRemaining: 0,
	});
});

test("Play 1 Day during a playoff gap advances once without simulating the game", async () => {
	await idb.cache.players.add(makePlayer(1));
	await idb.cache.games.add(completedGame);
	await idb.cache.schedule.add(upcomingGame);

	await play(1, {});

	assert.deepStrictEqual(
		await idb.cache.gameAttributes.get("basketballPlayoffDaysProcessedThrough"),
		{
			key: "basketballPlayoffDaysProcessedThrough",
			value: { day: 104, season },
		},
	);
	assert.deepStrictEqual(g.get("basketballPlayoffDaysProcessedThrough"), {
		day: 104,
		season,
	});
	assert.deepStrictEqual((await idb.cache.players.get(0))?.injury, {
		gamesRemaining: 0,
		type: "Healthy",
	});
	assert.strictEqual((await idb.cache.schedule.getAll()).length, 1);
	assert.strictEqual((await idb.cache.games.getAll()).length, 1);
	assert.isFalse(lock.get("gameSim"));
});

test("days-off UI orchestration recomputes OVRs and sends gameSim", async () => {
	const conditions = { hostID: 7 };

	await updateUIAfterDaysOff(conditions, {
		recomputeLocalUITeamOvrs: mocks.recomputeLocalUITeamOvrs,
		realtimeUpdate: mocks.realtimeUpdate,
	});

	assert.strictEqual(mocks.recomputeLocalUITeamOvrs.mock.calls.length, 1);
	assert.deepStrictEqual(mocks.realtimeUpdate.mock.calls, [
		[["gameSim"], conditions],
	]);
});

test("gap 0 keeps the normal game path without advancing the cursor", async () => {
	await idb.cache.games.add({
		...completedGame,
		day: 106,
	});
	await idb.cache.schedule.add(upcomingGame);

	await expect(play(1, {})).rejects.toThrow("Invalid tid");

	assert.isUndefined(g.get("basketballPlayoffDaysProcessedThrough"));
});

test("three gap days plus one game day each run day-over once", async () => {
	await idb.cache.players.add(makePlayer(5));
	await idb.cache.games.add(completedGame);

	const plan = getDaysOffSimulationPlan(3, 4, false);
	assert.deepStrictEqual(plan, {
		numDaysOffToProcess: 3,
		numDaysRemaining: 1,
		playGame: true,
	});
	assert.strictEqual(
		await processDaysOffBeforeGame(
			upcomingGame.day,
			{},
			plan.numDaysOffToProcess,
		),
		3,
	);

	let gamesSimulated = 0;
	gamesSimulated += 1;
	await processDayOver({}, new Set(), ["gameSim"]);

	assert.strictEqual(gamesSimulated, 1);
	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		1,
	);
	assert.strictEqual((await idb.cache.players.get(0))?.gamesUntilTradable, 1);
	assert.deepStrictEqual(g.get("basketballPlayoffDaysProcessedThrough"), {
		day: 106,
		season,
	});
});

test("actual play retry after persisted days off does not repeat countdowns", async () => {
	await idb.cache.players.add(makePlayer(5));
	await idb.cache.games.add(completedGame);
	await idb.cache.schedule.add(upcomingGame);
	assert.strictEqual(
		await processDaysOffBeforeGame(upcomingGame.day, {}, 3),
		3,
	);

	await expect(play(1, {})).rejects.toThrow("Invalid tid");
	lock.reset();
	await expect(play(1, {})).rejects.toThrow("Invalid tid");

	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		2,
	);
	assert.strictEqual((await idb.cache.players.get(0))?.gamesUntilTradable, 2);
	assert.deepStrictEqual(g.get("basketballPlayoffDaysProcessedThrough"), {
		day: 106,
		season,
	});
	assert.strictEqual((await idb.cache.games.getAll()).length, 1);
	assert.strictEqual((await idb.cache.schedule.getAll()).length, 1);
});
