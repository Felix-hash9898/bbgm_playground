import { afterAll, assert, beforeEach, test } from "vitest";
import { PHASE } from "../../../common/index.ts";
import type {
	Game,
	Player,
	PlayoffSeries,
	PlayoffSeriesTeam,
} from "../../../common/types.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import { processDayOver, processDaysOffBeforeGame } from "../game/play.ts";
import addDaysToSchedule from "./addDaysToSchedule.ts";
import {
	getDaysOffBeforeGame,
	getDaysOffSimulationPlan,
} from "./getBasketballPlayoffDaysOff.ts";
import {
	getNextRoundFirstGameDay,
	getNextRoundFirstGameDayForCurrentSport,
} from "./newSchedulePlayoffsDay.ts";

const season = 2016;

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	await resetCache();
});

afterAll(() => {
	resetG();
});

const makeTeam = (tid: number, won: number): PlayoffSeriesTeam => ({
	cid: 0,
	seed: tid + 1,
	tid,
	won,
});

const makeGame = (
	gid: number,
	day: number,
	homeTid: number,
	awayTid: number,
	options?: {
		playoffs?: boolean;
		season?: number;
	},
) =>
	({
		day,
		gid,
		playoffs: options?.playoffs ?? true,
		season: options?.season ?? season,
		teams: [{ tid: homeTid }, { tid: awayTid }],
	}) as Game;

const makeRound = ({
	awayWon,
	gids,
	homeWon,
}: {
	awayWon: number;
	gids?: number[];
	homeWon: number;
}): PlayoffSeries["series"][number] => [
	{
		away: makeTeam(1, awayWon),
		gids,
		home: makeTeam(0, homeWon),
	},
];

const makePlayer = (
	pid: number,
	gamesRemaining: number,
	skipDailyCountdown = false,
) =>
	({
		draft: {
			year: season - 1,
		},
		firstName: "Test",
		gamesUntilTradable: 5,
		injury: {
			gamesRemaining,
			...(skipDailyCountdown ? { skipDailyCountdown: true } : {}),
			type: "Sprained Ankle",
		},
		lastName: `Player ${pid}`,
		pid,
		ratings: [{ pos: "PG" }],
		retiredYear: Infinity,
		tid: 0,
	}) as unknown as Player;

test("reserves a full best-of-7 window after a sweep", () => {
	const games = [100, 101, 102, 103].map((day, i) => makeGame(i, day, 0, 1));
	const round = makeRound({
		awayWon: 0,
		gids: games.map((game) => game.gid),
		homeWon: 4,
	});

	assert.strictEqual(
		getNextRoundFirstGameDayForCurrentSport(round, games, season, 7),
		107,
	);
});

test("leaves a full day off after a series that goes the distance", () => {
	const games = [100, 101, 102, 103, 104, 105, 106].map((day, i) =>
		makeGame(i, day, 0, 1),
	);
	const round = makeRound({
		awayWon: 3,
		gids: games.map((game) => game.gid),
		homeWon: 4,
	});

	assert.strictEqual(getNextRoundFirstGameDay(round, games, season, 7), 108);
});

test.each([
	{ awayWon: 0, expected: 107, homeWon: 4 },
	{ awayWon: 1, expected: 107, homeWon: 4 },
	{ awayWon: 2, expected: 107, homeWon: 4 },
	{ awayWon: 3, expected: 108, homeWon: 4 },
])(
	"uses the potential series window for a 4-$awayWon result",
	({ awayWon, expected, homeWon }) => {
		const games = Array.from({ length: homeWon + awayWon }, (_, i) =>
			makeGame(i, 100 + i, 0, 1),
		);
		const round = makeRound({
			awayWon,
			gids: games.map((game) => game.gid),
			homeWon,
		});

		assert.strictEqual(
			getNextRoundFirstGameDay(round, games, season, 7),
			expected,
		);
	},
);

test("uses the slowest actual series without losing the shared round window", () => {
	const sweepGames = [100, 101, 102, 103].map((day, i) =>
		makeGame(i, day, 0, 1),
	);
	const slowerGames = [100, 101, 102, 103, 104, 105].map((day, i) =>
		makeGame(i + 10, day, 2, 3),
	);
	const round: PlayoffSeries["series"][number] = [
		{
			away: makeTeam(1, 0),
			gids: sweepGames.map((game) => game.gid),
			home: makeTeam(0, 4),
		},
		{
			away: makeTeam(3, 2),
			gids: slowerGames.map((game) => game.gid),
			home: makeTeam(2, 4),
		},
	];

	assert.strictEqual(
		getNextRoundFirstGameDay(round, [...sweepGames, ...slowerGames], season, 7),
		107,
	);
});

test("uses actual nonconsecutive days for a non-7-game series", () => {
	const games = [50, 52, 55, 56].map((day, i) => makeGame(i, day, 0, 1));
	const round = makeRound({
		awayWon: 1,
		gids: games.map((game) => game.gid),
		homeWon: 3,
	});

	assert.strictEqual(getNextRoundFirstGameDay(round, games, season, 5), 58);
});

test("falls back to the current matchup's latest games for old leagues without gids", () => {
	const games = [
		makeGame(0, 10, 0, 1),
		...[100, 101, 102, 103].map((day, i) => makeGame(i + 1, day, 0, 1)),
		makeGame(10, 200, 0, 2),
		makeGame(11, 201, 0, 1, { playoffs: false }),
		makeGame(12, 202, 0, 1, { season: season - 1 }),
	];
	const round = makeRound({
		awayWon: 0,
		homeWon: 4,
	});

	assert.strictEqual(getNextRoundFirstGameDay(round, games, season, 7), 107);
});

test("addDaysToSchedule honors a minimum first day without changing its default", () => {
	const existingGames = [makeGame(0, 103, 2, 3)];
	const matchups = [
		{ homeTid: 0, awayTid: 1 },
		{ homeTid: 2, awayTid: 3 },
		{ homeTid: 0, awayTid: 2 },
	];

	assert.deepStrictEqual(
		addDaysToSchedule(matchups, existingGames).map((game) => game.day),
		[104, 104, 105],
	);
	assert.deepStrictEqual(
		addDaysToSchedule(matchups, existingGames, 107).map((game) => game.day),
		[107, 107, 108],
	);
});

test.each([
	{
		firstDay: 106,
		lastPlayedDay: 103,
		target: 107,
	},
	{
		firstDay: 107,
		lastPlayedDay: 106,
		target: 108,
	},
])(
	"places a playoff All-Star Game before Game 1 on day $target",
	({ firstDay, lastPlayedDay, target }) => {
		const schedule = addDaysToSchedule(
			[
				{ homeTid: -1, awayTid: -2 },
				{ homeTid: 0, awayTid: 1 },
			],
			[makeGame(0, lastPlayedDay, 2, 3)],
			firstDay,
		);

		assert.deepStrictEqual(
			schedule.map((game) => game.day),
			[target - 1, target],
		);
	},
);

test("keeps the default All-Star Game spacing when no first day is requested", () => {
	const schedule = addDaysToSchedule(
		[
			{ homeTid: -1, awayTid: -2 },
			{ homeTid: 0, awayTid: 1 },
		],
		[makeGame(0, 103, 2, 3)],
	);

	assert.deepStrictEqual(
		schedule.map((game) => game.day),
		[105, 106],
	);
});

test("counts every blank basketball playoff day before loading the next game", () => {
	const games = [
		makeGame(0, 100, 0, 1),
		makeGame(1, 103, 2, 3),
		makeGame(2, 104, 0, 1, { season: season - 1 }),
	];

	assert.strictEqual(getDaysOffBeforeGame(107, games, season), 3);

	// A live-simmed game already written on the current day prevents the rest
	// window from being processed a second time for other games that day.
	assert.strictEqual(
		getDaysOffBeforeGame(107, [...games, makeGame(3, 107, 4, 5)], season),
		0,
	);
});

test.each([
	{
		expected: {
			numDaysOffToProcess: 1,
			numDaysRemaining: 0,
			playGame: false,
		},
		gap: 3,
		numDays: 1,
	},
	{
		expected: {
			numDaysOffToProcess: 3,
			numDaysRemaining: 0,
			playGame: false,
		},
		gap: 3,
		numDays: 3,
	},
	{
		expected: {
			numDaysOffToProcess: 3,
			numDaysRemaining: 1,
			playGame: true,
		},
		gap: 3,
		numDays: 4,
	},
	{
		expected: {
			numDaysOffToProcess: 3,
			numDaysRemaining: 4,
			playGame: true,
		},
		gap: 3,
		numDays: 7,
	},
	{
		expected: {
			numDaysOffToProcess: 3,
			numDaysRemaining: 27,
			playGame: true,
		},
		gap: 3,
		numDays: 30,
	},
	{
		expected: {
			numDaysOffToProcess: 0,
			numDaysRemaining: 1,
			playGame: true,
		},
		gap: 0,
		numDays: 1,
	},
])(
	"budgets a $gap-day playoff gap from a $numDays-day request",
	({ expected, gap, numDays }) => {
		assert.deepStrictEqual(
			getDaysOffSimulationPlan(gap, numDays, false),
			expected,
		);
	},
);

test("an explicitly selected game advances through its whole gap and still plays", () => {
	assert.deepStrictEqual(getDaysOffSimulationPlan(3, 1, true), {
		numDaysOffToProcess: 3,
		numDaysRemaining: 1,
		playGame: true,
	});
});

test("processes only the blank days allowed by the calendar-day budget", async () => {
	await idb.cache.players.add(makePlayer(0, 5));
	await idb.cache.games.add(makeGame(0, 103, 2, 3));

	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 1), 1);
	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		4,
	);
	assert.strictEqual((await idb.cache.players.get(0))?.gamesUntilTradable, 4);
	assert.deepStrictEqual(g.get("basketballPlayoffDaysProcessedThrough"), {
		day: 104,
		season,
	});

	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 2), 2);

	const injured = await idb.cache.players.get(0);
	assert.strictEqual(injured?.injury.gamesRemaining, 2);
	assert.strictEqual(injured?.gamesUntilTradable, 2);
});

test("does not repeat processed days after a failure before the next game is written", async () => {
	await idb.cache.players.add(makePlayer(0, 5));
	await idb.cache.games.add(makeGame(0, 103, 2, 3));

	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 3), 3);
	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		2,
	);
	assert.strictEqual((await idb.cache.players.get(0))?.gamesUntilTradable, 2);

	// Simulate the next game failing before it is written. The last completed
	// game remains on day 103, but the persisted cursor prevents reprocessing.
	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 3), 0);
	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		2,
	);
	assert.strictEqual((await idb.cache.players.get(0))?.gamesUntilTradable, 2);
});

test("rehydrated playoff day progress prevents duplicate countdowns", async () => {
	const p = makePlayer(0, 5);
	await idb.cache.players.add(p);
	await idb.cache.games.add(makeGame(0, 103, 2, 3));
	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 3), 3);

	const savedPlayer = await idb.cache.players.get(0);
	const savedProgressRecord = await idb.cache.gameAttributes.get(
		"basketballPlayoffDaysProcessedThrough",
	);
	assert.deepStrictEqual(savedProgressRecord, {
		key: "basketballPlayoffDaysProcessedThrough",
		value: {
			day: 106,
			season,
		},
	});
	await resetCache({
		players: [savedPlayer],
	});
	await idb.cache.games.add(makeGame(0, 103, 2, 3));
	resetG();
	g.setWithoutSavingToDB("phase", PHASE.PLAYOFFS);
	g.setWithoutSavingToDB(
		"basketballPlayoffDaysProcessedThrough",
		savedProgressRecord?.value,
	);

	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 3), 0);
	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		2,
	);
	assert.strictEqual((await idb.cache.players.get(0))?.gamesUntilTradable, 2);
});

test("does not inherit playoff day progress from another season", async () => {
	await idb.cache.players.add(makePlayer(0, 5));
	await idb.cache.games.add(makeGame(0, 103, 2, 3));
	g.setWithoutSavingToDB("basketballPlayoffDaysProcessedThrough", {
		day: 999,
		season: season - 1,
	});

	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 3), 3);
	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		2,
	);
});

test("a second live game on the same day does not repeat days off", async () => {
	await idb.cache.players.add(makePlayer(0, 5));
	await idb.cache.games.add(makeGame(0, 103, 2, 3));
	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 3), 3);

	await idb.cache.games.add(makeGame(1, 107, 4, 5));
	assert.strictEqual(await processDaysOffBeforeGame(107, {}, 3), 0);
	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		2,
	);
});

test("keeps the normal single game-day countdown and skip semantics", async () => {
	await idb.cache.players.add(makePlayer(0, 3));
	await idb.cache.players.add(makePlayer(1, 2, true));

	await processDayOver({}, new Set(), ["gameSim"]);

	const normal = await idb.cache.players.get(0);
	assert.strictEqual(normal?.injury.gamesRemaining, 2);
	assert.strictEqual(normal?.gamesUntilTradable, 4);

	const skipped = await idb.cache.players.get(1);
	assert.strictEqual(skipped?.injury.gamesRemaining, 2);
	assert.notProperty(skipped?.injury, "skipDailyCountdown");
	assert.strictEqual(skipped?.gamesUntilTradable, 4);
});

test("does not process schedule gaps outside basketball playoffs", async () => {
	await idb.cache.players.add(makePlayer(0, 5));
	await idb.cache.games.add(makeGame(0, 103, 2, 3));
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);

	assert.strictEqual(await processDaysOffBeforeGame(107, {}), 0);
	assert.strictEqual(
		(await idb.cache.players.get(0))?.injury.gamesRemaining,
		5,
	);
});
