import { deleteDB } from "@dumbmatter/idb";
import { afterAll, assert, describe, test } from "vitest";
import { LEAGUE_DATABASE_VERSION, PHASE, helpers } from "../common/index.ts";
import api from "../worker/api/index.ts";
import { game, league } from "../worker/core/index.ts";
import createStreamFromLeagueObject from "../worker/core/league/create/createStreamFromLeagueObject.ts";
import { isStandardContract } from "../worker/core/contracts/contractTwoWay.ts";
import { idb } from "../worker/db/index.ts";
import { defaultGameAttributes, g, lock } from "../worker/util/index.ts";
import { beforeNonLeague } from "../worker/util/beforeView.ts";

import "../worker/index.ts";

const lid = 92;
const startingSeason = 2025;
const DEFAULT_SEASONS = 5;
const conditions = {};

const assertPlayable = (location: string) => {
	assert.isFalse(lock.get("gameSim"), `${location}: gameSim lock remained set`);
};

const assertLeagueSane = async (location: string) => {
	const teams = await idb.cache.teams.getAll();
	const players = await idb.cache.players.getAll();
	const userPlayers = await idb.cache.players.indexGetAll(
		"playersByTid",
		g.get("userTid"),
	);
	assert.isAbove(teams.length, 0, `${location}: no teams remain`);
	assert.isAbove(
		players.filter((player) => player.tid >= 0).length,
		0,
		`${location}: no active players remain`,
	);
	assert.isAbove(userPlayers.length, 0, `${location}: user roster is empty`);
	assert.isAtLeast(
		userPlayers.filter((player) => isStandardContract(player.contract)).length,
		g.get("minRosterSize"),
		`${location}: spectator-managed user roster is below the minimum`,
	);
};

const playUntilPhase = async (targetPhase: number, location: string) => {
	for (let attempt = 1; attempt <= 200; attempt++) {
		if (g.get("phase") >= targetPhase) {
			return;
		}

		const phaseBefore = g.get("phase");
		const gamesBefore = (await idb.cache.games.getAll()).length;
		await game.play(100, conditions);
		const phaseAfter = g.get("phase");
		const gamesAfter = (await idb.cache.games.getAll()).length;
		assert.ok(
			phaseAfter > phaseBefore || gamesAfter > gamesBefore,
			`${location}: play attempt ${attempt} made no progress`,
		);
		assertPlayable(`${location}, attempt ${attempt}`);
	}

	assert.fail(`${location}: phase ${targetPhase} was not reached`);
};

const completeDraftAndResign = async (location: string) => {
	await api.playMenu.untilDraft(undefined, conditions);
	assert.strictEqual(
		g.get("phase"),
		PHASE.DRAFT,
		`${location}: did not enter draft`,
	);
	// Spectator mode makes the same production draft path auto-pick for every team,
	// including the nominal user team.
	await api.playMenu.untilEnd(undefined, conditions);
	assert.strictEqual(
		g.get("phase"),
		PHASE.AFTER_DRAFT,
		`${location}: did not finish the draft`,
	);

	await api.playMenu.untilResignPlayers(undefined, conditions);
	assert.strictEqual(
		g.get("phase"),
		PHASE.RESIGN_PLAYERS,
		`${location}: did not enter re-sign phase`,
	);
	assert.strictEqual(
		(await idb.cache.negotiations.getAll()).filter(
			(negotiation) => negotiation.tid === g.get("userTid"),
		).length,
		0,
		`${location}: spectator mode left user negotiations pending`,
	);

	await api.playMenu.untilFreeAgency(undefined, conditions);
	assert.strictEqual(
		g.get("phase"),
		PHASE.FREE_AGENCY,
		`${location}: did not enter free agency`,
	);
};

const runOneLeagueYear = async (yearIndex: number) => {
	const expectedSeason = startingSeason + yearIndex;
	const location = `season ${expectedSeason}`;
	assert.strictEqual(
		g.get("season"),
		expectedSeason,
		`${location}: wrong start season`,
	);
	assert.strictEqual(
		g.get("phase"),
		PHASE.PRESEASON,
		`${location}: wrong start phase`,
	);
	assertPlayable(`${location} start`);
	await assertLeagueSane(`${location} start`);

	await api.playMenu.untilRegularSeason(undefined, conditions);
	assert.strictEqual(g.get("phase"), PHASE.REGULAR_SEASON);
	assertPlayable(`${location} regular season`);
	await playUntilPhase(PHASE.PLAYOFFS, `${location} regular season`);
	assert.strictEqual(g.get("phase"), PHASE.PLAYOFFS);
	await playUntilPhase(PHASE.DRAFT_LOTTERY, `${location} playoffs`);
	assert.strictEqual(g.get("phase"), PHASE.DRAFT_LOTTERY);
	assertPlayable(`${location} offseason`);

	await completeDraftAndResign(`${location} draft/re-sign`);
	await api.playMenu.untilPreseason(undefined, conditions);
	assert.strictEqual(
		g.get("season"),
		expectedSeason + 1,
		`${location}: season did not increment exactly once`,
	);
	assert.strictEqual(
		g.get("phase"),
		PHASE.PRESEASON,
		`${location}: wrong next phase`,
	);
	assertPlayable(`${location} next preseason`);
	await assertLeagueSane(`${location} next preseason`);
};

describe("same-league multi-year gameplay smoke", () => {
	let lifecycleLocation = "suite setup";

	test(
		`one league survives ${DEFAULT_SEASONS} consecutive seasons`,
		{ timeout: 30 * 60 * 1000 },
		async ({ onTestFailed }) => {
			onTestFailed(() => {
				console.error(`Multi-year smoke failed at: ${lifecycleLocation}`);
			});

			lifecycleLocation = "league creation";
			const stream = createStreamFromLeagueObject({});
			await league.createStream(stream, {
				confs: defaultGameAttributes.confs.at(-1)!.value,
				divs: defaultGameAttributes.divs.at(-1)!.value,
				fromFile: {
					gameAttributes: undefined,
					hasRookieContracts: true,
					maxGid: undefined,
					startingSeason: undefined,
					teams: undefined,
					version: LEAGUE_DATABASE_VERSION,
				},
				getLeagueOptions: undefined,
				keptKeys: new Set(),
				lid,
				name: "Same-league multi-year gameplay smoke",
				setLeagueCreationStatus: () => {},
				settings: {
					godMode: true,
					maxRosterSize: 18,
					numGames: 40,
					salaryCapType: "none",
					spectator: true,
				} as any,
				shuffleRosters: false,
				startingSeasonFromInput: String(startingSeason),
				teamsFromInput: helpers.addPopRank(helpers.getTeamsDefault()),
				tid: 0,
			});
			assert.isTrue(
				g.get("spectator"),
				"multi-year smoke must run with spectator/AI management enabled",
			);

			for (let yearIndex = 0; yearIndex < DEFAULT_SEASONS; yearIndex++) {
				lifecycleLocation = `season ${startingSeason + yearIndex}`;
				await runOneLeagueYear(yearIndex);

				if (yearIndex === 1) {
					lifecycleLocation = "flush and reload after season 2";
					await api.main.idbCacheFlush();
					await api.main.discardUnsavedProgress();
					assert.strictEqual(g.get("season"), startingSeason + 2);
					assert.strictEqual(g.get("phase"), PHASE.PRESEASON);
					assertPlayable("after season 2 reload");
					await assertLeagueSane("after season 2 reload");
				}
			}

			assert.strictEqual(g.get("season"), startingSeason + DEFAULT_SEASONS);
			assert.strictEqual(g.get("phase"), PHASE.PRESEASON);
			assertPlayable("final multi-year boundary");
			await assertLeagueSane("final multi-year boundary");
		},
	);

	afterAll(async () => {
		try {
			await beforeNonLeague(conditions);
			await league.remove(lid);
		} finally {
			await idb.meta.close();
			await deleteDB("meta");
		}
	});
});
