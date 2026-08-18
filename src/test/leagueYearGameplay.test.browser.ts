import { deleteDB } from "@dumbmatter/idb";
import { afterAll, assert, describe, test } from "vitest";
import {
	LEAGUE_DATABASE_VERSION,
	PHASE,
	PLAYER,
	helpers,
} from "../common/index.ts";
import type { TradeTeams } from "../common/types.ts";
import api from "../worker/api/index.ts";
import {
	contractNegotiation,
	draft,
	game,
	league,
	team,
} from "../worker/core/index.ts";
import { getPendingUserTeamOptions } from "../worker/core/contracts/contractOptionDecisions.ts";
import { getMidLevelExceptionAmount } from "../worker/core/contracts/contractMidLevel.ts";
import createStreamFromLeagueObject from "../worker/core/league/create/createStreamFromLeagueObject.ts";
import { idb } from "../worker/db/index.ts";
import { defaultGameAttributes, g, local, lock } from "../worker/util/index.ts";
import { beforeNonLeague } from "../worker/util/beforeView.ts";

import "../worker/index.ts";

const lid = 91;
const startingSeason = 2025;
const conditions = {};

const assertPlayable = (location: string) => {
	assert.isFalse(lock.get("gameSim"), `${location}: gameSim lock remained set`);
};

const readView = async (
	viewId: string,
	params: Record<string, string> = {},
) => {
	const result = await api.main.runBefore(
		{
			viewId,
			params,
			ctxBBGM: {},
			updateEvents: ["firstRun"],
			prevData: {},
		},
		conditions,
	);
	assert.isObject(result, `${viewId} worker view returned no data`);
	return result as Record<string, any>;
};

const userAbbrev = () => g.get("teamInfoCache")[g.get("userTid")]!.abbrev;

const getUserPlayers = () =>
	idb.cache.players.indexGetAll("playersByTid", g.get("userTid"));

const getFreeAgents = () =>
	idb.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT);

const acceptFirstEnabledContract = async (pid: number) => {
	const error = await contractNegotiation.create(pid, false);
	assert.notOk(error, `Could not open negotiation for pid ${pid}: ${error}`);
	const negotiation = await readView("negotiation", { pid: String(pid) });
	const option = negotiation.contractOptions?.find(
		(row: any) =>
			row.disabledReason === undefined &&
			row.type !== "twoWay" &&
			row.contractExceptionType === "capSpace",
	);
	assert.ok(
		option,
		`No enabled cap-space contract for pid ${pid}: ${JSON.stringify({
			capSpace: negotiation.capSpace,
			contractOptions: negotiation.contractOptions,
			payroll: negotiation.payroll,
			salaryCap: negotiation.salaryCap,
		})}`,
	);
	const acceptError = await api.main.acceptContractNegotiation({
		pid,
		amount: Math.round(option.amount * 1000),
		exp: option.exp,
		option: option.option,
		type: option.type,
	});
	assert.notOk(
		acceptError,
		`Contract was rejected for pid ${pid}: ${acceptError}`,
	);
	return idb.cache.players.get(pid);
};

const playOneDay = async (location: string) => {
	const gamesBefore = (await idb.cache.games.getAll()).length;
	const scheduleBefore = (await idb.cache.schedule.getAll()).length;
	await api.playMenu.day(undefined, conditions);
	const gamesAfter = (await idb.cache.games.getAll()).length;
	const scheduleAfter = (await idb.cache.schedule.getAll()).length;
	assert.ok(
		gamesAfter > gamesBefore || scheduleAfter < scheduleBefore,
		`${location}: One day did not advance games or schedule`,
	);
	assertPlayable(location);
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
			`${location}: Play attempt ${attempt} made no progress`,
		);
		assertPlayable(`${location}, attempt ${attempt}`);
	}

	assert.fail(`${location}: phase ${targetPhase} was not reached`);
};

describe("full league-year gameplay smoke", () => {
	let lifecycleLocation = "suite setup";

	test(
		"a real player journey survives the offseason and remains playable next year",
		{ timeout: 10 * 60 * 1000 },
		async ({ onTestFailed }) => {
			onTestFailed(() => {
				console.error(`League-year smoke failed at: ${lifecycleLocation}`);
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
				name: "League-year gameplay smoke",
				setLeagueCreationStatus: () => {},
				settings: {
					godMode: true,
					maxRosterSize: 18,
					numGames: 40,
					salaryCapType: "none",
				} as any,
				shuffleRosters: false,
				startingSeasonFromInput: String(startingSeason),
				teamsFromInput: helpers.addPopRank(helpers.getTeamsDefault()),
				tid: 0,
			});
			lifecycleLocation = "initial preseason assertions";

			assert.strictEqual(g.get("season"), startingSeason);
			assert.strictEqual(g.get("phase"), PHASE.PRESEASON);
			assert.isTrue(local.leagueLoaded);
			assertPlayable("new preseason league");

			const initialRoster = await getUserPlayers();
			assert.isAtLeast(initialRoster.length, 12);

			lifecycleLocation = "customize player";
			// Customize Player/God Mode production save path.
			const editedPid = initialRoster[0]!.pid;
			const editedPlayer = helpers.deepCopy(initialRoster[0]!);
			const oldSpd = editedPlayer.ratings.at(-1)!.spd;
			editedPlayer.ratings.at(-1)!.spd = oldSpd === 99 ? 98 : oldSpd + 1;
			await api.main.upsertCustomizedPlayer(
				{
					p: editedPlayer,
					originalTid: editedPlayer.tid,
					recomputePosOvrPot: false,
					season: g.get("season"),
				},
				conditions,
			);
			assert.strictEqual(
				(await idb.cache.players.get(editedPid))!.ratings.at(-1)!.spd,
				editedPlayer.ratings.at(-1)!.spd,
			);

			lifecycleLocation = "playing time";
			// Unified Dynamic minutes production API. Start from the generated Auto
			// plan, make one legal edit, and atomically save it as Custom.
			const rotationPid = initialRoster[1]!.pid;
			const initialRosterView = await readView("roster", {
				abbrev: userAbbrev(),
				season: String(g.get("season")),
			});
			assert.strictEqual(initialRosterView.basketballMinutes.mode, "auto");
			const customMinutes = {
				...initialRosterView.basketballMinutes.minutesByPid,
			} as Record<number, number>;
			const minuteEntries = Object.entries(customMinutes) as [string, number][];
			const recipient = minuteEntries.find(([, minutes]) => minutes <= 47)!;
			const rotationPlanPid = Number(recipient[0]);
			const donor = minuteEntries.find(
				([pid, minutes]) => pid !== recipient[0] && minutes >= 1,
			)!;
			customMinutes[rotationPlanPid] = recipient[1] + 1;
			customMinutes[Number(donor[0])] = donor[1] - 1;
			await api.main.updateBasketballMinutes({
				tid: g.get("userTid"),
				minutesByPid: customMinutes,
			});
			assert.strictEqual(
				(await idb.cache.teams.get(g.get("userTid")))!.basketballRotation!.mode,
				"custom",
			);

			lifecycleLocation = "release player";
			// Release production API, leaving ample legal roster depth.
			const releasedPid = initialRoster.at(-1)!.pid;
			assert.notOk(await api.main.releasePlayer({ pids: [releasedPid] }));
			assert.strictEqual(
				(await idb.cache.players.get(releasedPid))!.tid,
				PLAYER.FREE_AGENT,
			);

			lifecycleLocation = "normal free-agent signing";
			// Normal cap-space free-agent signing.
			const normalCandidate = (await getFreeAgents()).find(
				(p) => p.pid !== releasedPid,
			)!;
			const normalSigned = await acceptFirstEnabledContract(
				normalCandidate.pid,
			);
			assert.strictEqual(normalSigned!.tid, g.get("userTid"));
			assert.notStrictEqual(normalSigned!.contract.exception, "midLevel");

			lifecycleLocation = "trade";
			// Deterministic real trade commit path. Force acceptance is the God Mode
			// production path; transaction mechanics and all durable mutations are real.
			const tradeAway = (await getUserPlayers()).find(
				(p) => p.pid !== editedPid && p.pid !== rotationPlanPid,
			)!;
			const otherTid = 1;
			const tradeFor = (
				await idb.cache.players.indexGetAll("playersByTid", otherTid)
			)[0]!;
			const tradeTeams: TradeTeams = [
				{
					tid: g.get("userTid"),
					pids: [tradeAway.pid],
					dpids: [],
					pidsExcluded: [],
					dpidsExcluded: [],
				},
				{
					tid: otherTid,
					pids: [tradeFor.pid],
					dpids: [],
					pidsExcluded: [],
					dpidsExcluded: [],
				},
			];
			await api.main.createTrade(tradeTeams);
			const tradeResult = await api.main.proposeTrade(true, conditions);
			assert.isTrue(
				tradeResult?.[0],
				`Forced production trade failed: ${tradeResult}`,
			);
			assert.strictEqual(
				(await idb.cache.players.get(tradeAway.pid))!.tid,
				otherTid,
			);
			assert.strictEqual(
				(await idb.cache.players.get(tradeFor.pid))!.tid,
				g.get("userTid"),
			);

			lifecycleLocation = "preseason worker views";
			// Independent worker-view reads cross-check all preseason mutations.
			let rosterView = await readView("roster", {
				abbrev: userAbbrev(),
				season: String(g.get("season")),
			});
			assert.ok(
				rosterView.players.some((p: any) => p.pid === normalCandidate.pid),
			);
			assert.ok(rosterView.players.some((p: any) => p.pid === tradeFor.pid));
			assert.notOk(rosterView.players.some((p: any) => p.pid === releasedPid));
			const playerView = await readView("player", { pid: String(editedPid) });
			assert.strictEqual(
				playerView.pRaw.ratings.at(-1).spd,
				editedPlayer.ratings.at(-1)!.spd,
			);
			const freeAgentsView = await readView("freeAgents");
			assert.isArray(freeAgentsView.players);

			lifecycleLocation = "preseason to regular season";
			await api.playMenu.untilRegularSeason(undefined, conditions);
			assert.strictEqual(g.get("phase"), PHASE.REGULAR_SEASON);
			assertPlayable("entering regular season");

			lifecycleLocation = "ten consecutive opening days";
			for (let day = 1; day <= 10; day++) {
				lifecycleLocation = `opening regular season day ${day}`;
				await playOneDay(`opening regular season day ${day}`);
			}

			lifecycleLocation = "opening one week";
			const scheduleBeforeWeek = (await idb.cache.schedule.getAll()).length;
			await api.playMenu.week(undefined, conditions);
			assert.isBelow(
				(await idb.cache.schedule.getAll()).length,
				scheduleBeforeWeek,
				"One week did not advance the schedule",
			);
			assertPlayable("opening regular season week");

			// Real Stop path interrupts a longer production simulation and leaves the
			// league immediately playable again.
			lifecycleLocation = "Stop interruption";
			const interruptedPlay = game.play(20, conditions);
			await Promise.resolve();
			await api.playMenu.stop();
			await interruptedPlay;
			assert.isFalse(
				lock.get("gameSim"),
				"Stop after longer progression: gameSim lock remained set",
			);
			await playOneDay("One day after Stop");

			lifecycleLocation = "regular-season worker views";
			const statsView = await readView("playerStats", {
				abbrev: "all",
				season: String(g.get("season")),
			});
			assert.isAbove(statsView.players.length, 0);
			const standingsView = await readView("standings", {
				season: String(g.get("season")),
				type: "league",
			});
			assert.isAbove(standingsView.rankingGroups.league[0].length, 0);
			const scheduleView = await readView("schedule", { abbrev: userAbbrev() });
			assert.isAbove(scheduleView.completed.length, 0);
			const completedGame = scheduleView.completed[0];
			const gameLogView = await readView("gameLog", {
				abbrev: userAbbrev(),
				gid: String(completedGame.gid),
				season: String(g.get("season")),
			});
			assert.strictEqual(gameLogView.boxScore.gid, completedGame.gid);

			lifecycleLocation = "flush and reload";
			// Flush and reload through the same production league load path.
			await api.main.idbCacheFlush();
			await api.main.discardUnsavedProgress();
			assert.strictEqual(g.get("lid"), lid);
			assert.include(
				[PHASE.REGULAR_SEASON, PHASE.AFTER_TRADE_DEADLINE],
				g.get("phase"),
			);
			assert.strictEqual(
				(await idb.cache.players.get(editedPid))!.ratings.at(-1)!.spd,
				editedPlayer.ratings.at(-1)!.spd,
			);
			const persistedRotation = (await idb.cache.teams.get(0))!
				.basketballRotation!;
			assert.strictEqual(persistedRotation.mode, "custom");
			const persistedBaselineMinutes = persistedRotation.minutesByPid!;
			const persistedBaselineTotal = Object.values(
				persistedBaselineMinutes,
			).reduce((total, minutes) => total + minutes, 0);
			const reloadedRosterPids = new Set(
				(await getUserPlayers()).map((player) => player.pid),
			);
			if (reloadedRosterPids.has(rotationPid)) {
				assert.strictEqual(
					persistedBaselineMinutes[rotationPid],
					customMinutes[rotationPid],
				);
			}
			for (const [pidString, minutes] of Object.entries(customMinutes)) {
				const pid = Number(pidString);
				if (reloadedRosterPids.has(pid)) {
					assert.strictEqual(
						persistedBaselineMinutes[pid],
						minutes,
						`Custom baseline changed for retained pid ${pid}`,
					);
				}
			}
			const reloadedRosterView = await readView("roster", {
				abbrev: userAbbrev(),
				season: String(g.get("season")),
			});
			const reloadedBasketballMinutes = reloadedRosterView.basketballMinutes;
			assert.strictEqual(reloadedBasketballMinutes.mode, "custom");
			assert.strictEqual(reloadedBasketballMinutes.required, 240);
			assert.isTrue(reloadedBasketballMinutes.gameReady);
			const reloadedHealthyMinutes =
				reloadedBasketballMinutes.healthyMinutesByPid as Record<number, number>;
			assert.strictEqual(
				Object.values(reloadedHealthyMinutes).reduce(
					(total, minutes) => total + minutes,
					0,
				),
				240,
			);
			if (persistedBaselineTotal < 240) {
				assert.isTrue(persistedRotation.rosterAutoFillActive);
				assert.isTrue(reloadedBasketballMinutes.rosterAutoFillActive);
				const reloadedRosterOverlay =
					reloadedBasketballMinutes.rosterOverlayByPid as Record<
						number,
						number
					>;
				assert.isAbove(
					Object.values(reloadedRosterOverlay).reduce(
						(total, minutes) => total + minutes,
						0,
					),
					0,
				);
			}
			for (const pid of reloadedRosterPids) {
				assert.strictEqual(
					reloadedBasketballMinutes.minutesByPid[pid],
					persistedBaselineMinutes[pid],
					`Roster view rewrote the Custom baseline for pid ${pid}`,
				);
			}
			assert.strictEqual((await idb.cache.players.get(tradeFor.pid))!.tid, 0);
			await playOneDay("One day after reload");

			lifecycleLocation = "finish regular season";
			// Finish the regular season through the real game progression core.
			await playUntilPhase(PHASE.PLAYOFFS, "finish regular season");
			assert.strictEqual(g.get("phase"), PHASE.PLAYOFFS);
			assertPlayable("entering playoffs");
			lifecycleLocation = "playoffs";
			await playUntilPhase(PHASE.DRAFT_LOTTERY, "finish playoffs");
			assert.strictEqual(g.get("phase"), PHASE.DRAFT_LOTTERY);
			assertPlayable("finishing playoffs");

			lifecycleLocation = "enter draft";
			await api.playMenu.untilDraft(undefined, conditions);
			assert.strictEqual(g.get("phase"), PHASE.DRAFT);
			const draftView = await readView("draft");
			assert.isAbove(draftView.undrafted.length, 0);

			lifecycleLocation = "real user draft pick";
			// Auto-pick only until the user's turn, then make one real user pick.
			await api.playMenu.untilYourNextPick(undefined, conditions);
			const orderAtUserPick = await draft.getOrder();
			assert.ok(g.get("userTids").includes(orderAtUserPick[0]!.tid));
			const prospect = (
				await idb.cache.players.indexGetAll("playersByTid", PLAYER.UNDRAFTED)
			)[0]!;
			const userPickTid = orderAtUserPick[0]!.tid;
			await api.main.draftUser(prospect.pid, conditions);
			const draftedPlayer = await idb.cache.players.get(prospect.pid);
			assert.strictEqual(draftedPlayer!.tid, userPickTid);
			assert.isAbove(draftedPlayer!.draft.pick, 0);
			await api.playMenu.untilEnd(undefined, conditions);
			assert.strictEqual(g.get("phase"), PHASE.AFTER_DRAFT);

			lifecycleLocation = "re-sign phase";
			await api.playMenu.untilResignPlayers(undefined, conditions);
			assert.strictEqual(g.get("phase"), PHASE.RESIGN_PLAYERS);
			for (const pending of await getPendingUserTeamOptions()) {
				await api.main.decideTeamOption({ exercise: true, pid: pending.pid });
			}
			const negotiations = (await idb.cache.negotiations.getAll()).filter(
				(negotiation) => negotiation.tid === g.get("userTid"),
			);
			assert.isAbove(
				negotiations.length,
				0,
				"No user re-sign negotiations created",
			);
			const reSignPid = negotiations[0]!.pid;
			const reSignView = await readView("negotiation", {
				pid: String(reSignPid),
			});
			const reSignOption = reSignView.contractOptions.find(
				(option: any) =>
					option.disabledReason === undefined && option.type !== "twoWay",
			);
			assert.ok(reSignOption, "No enabled re-sign contract option");
			assert.notOk(
				await api.main.acceptContractNegotiation({
					pid: reSignPid,
					amount: Math.round(reSignOption.amount * 1000),
					exp: reSignOption.exp,
					option: reSignOption.option,
					type: reSignOption.type,
				}),
			);
			assert.strictEqual((await idb.cache.players.get(reSignPid))!.tid, 0);
			for (const negotiation of await idb.cache.negotiations.getAll()) {
				if (negotiation.tid === g.get("userTid")) {
					await api.main.cancelContractNegotiation(negotiation.pid);
				}
			}

			lifecycleLocation = "enter free agency";
			await api.playMenu.untilFreeAgency(undefined, conditions);
			assert.strictEqual(g.get("phase"), PHASE.FREE_AGENCY);

			lifecycleLocation = "MLE signing";
			// Force a deterministic over-cap condition through the real game-attribute
			// setter, then sign a willing player using the actual MLE validation and
			// transaction path.
			const payroll = await team.getPayroll(g.get("userTid"));
			await league.setGameAttributes({
				salaryCap: payroll - 1000,
				salaryCapType: "soft",
			});
			const mleLimit = getMidLevelExceptionAmount();
			let mleSignedPid: number | undefined;
			for (const candidate of await getFreeAgents()) {
				const error = await contractNegotiation.create(candidate.pid, false);
				if (error) {
					continue;
				}
				const negotiation = await readView("negotiation", {
					pid: String(candidate.pid),
				});
				const option = negotiation.contractOptions?.find(
					(row: any) =>
						row.disabledReason === undefined &&
						row.contractExceptionType === "midLevel" &&
						row.amount * 1000 <= mleLimit,
				);
				if (!option) {
					await api.main.cancelContractNegotiation(candidate.pid);
					continue;
				}
				const error2 = await api.main.acceptContractNegotiation({
					pid: candidate.pid,
					amount: Math.round(option.amount * 1000),
					exp: option.exp,
					option: option.option,
					type: option.type,
				});
				assert.notOk(error2);
				mleSignedPid = candidate.pid;
				break;
			}
			assert.isNumber(mleSignedPid, "No eligible willing MLE candidate found");
			const mleSigned = await idb.cache.players.get(mleSignedPid!);
			assert.strictEqual(mleSigned!.tid, 0);
			assert.strictEqual(mleSigned!.contract.exception, "midLevel");
			assert.strictEqual(
				(await idb.cache.teams.get(0))!.midLevelExceptionUsedSeason,
				g.get("season") + 1,
			);
			rosterView = await readView("roster", {
				abbrev: userAbbrev(),
				season: String(g.get("season")),
			});
			assert.ok(rosterView.players.some((p: any) => p.pid === mleSignedPid));

			lifecycleLocation = "free agency to next preseason";
			await api.playMenu.untilPreseason(undefined, conditions);
			assert.strictEqual(g.get("season"), startingSeason + 1);
			assert.strictEqual(g.get("phase"), PHASE.PRESEASON);
			assertPlayable("next-season preseason");
			lifecycleLocation = "next regular season";
			await api.playMenu.untilRegularSeason(undefined, conditions);
			assert.strictEqual(g.get("phase"), PHASE.REGULAR_SEASON);
			await playOneDay("next-season regular season day 1");
			await playOneDay("next-season regular season day 2");
			const nextSeasonRotation = (await idb.cache.teams.get(0))!
				.basketballRotation!;
			const nextSeasonRoster = await getUserPlayers();
			assert.strictEqual(nextSeasonRotation.mode, "custom");
			assert.sameMembers(
				Object.keys(nextSeasonRotation.minutesByPid!).map(Number),
				nextSeasonRoster.map((p) => p.pid),
			);
			const nextSeasonRosterView = await readView("roster", {
				abbrev: userAbbrev(),
				season: String(g.get("season")),
			});
			const nextSeasonBasketballMinutes =
				nextSeasonRosterView.basketballMinutes;
			assert.strictEqual(nextSeasonBasketballMinutes.mode, "custom");
			assert.strictEqual(nextSeasonBasketballMinutes.required, 240);
			assert.isTrue(nextSeasonBasketballMinutes.gameReady);
			const nextSeasonHealthyMinutes =
				nextSeasonBasketballMinutes.healthyMinutesByPid as Record<
					number,
					number
				>;
			assert.strictEqual(
				Object.values(nextSeasonHealthyMinutes).reduce(
					(total, minutes) => total + minutes,
					0,
				),
				240,
			);
			const nextSeasonBaselineTotal = Object.values(
				nextSeasonRotation.minutesByPid!,
			).reduce((total, minutes) => total + minutes, 0);
			if (nextSeasonBaselineTotal < 240) {
				assert.isTrue(nextSeasonRotation.rosterAutoFillActive);
				assert.isTrue(nextSeasonBasketballMinutes.rosterAutoFillActive);
				const nextSeasonRosterOverlay =
					nextSeasonBasketballMinutes.rosterOverlayByPid as Record<
						number,
						number
					>;
				assert.isAbove(
					Object.values(nextSeasonRosterOverlay).reduce(
						(total, minutes) => total + minutes,
						0,
					),
					0,
				);
			}
			for (const player of nextSeasonRoster) {
				assert.strictEqual(
					nextSeasonBasketballMinutes.minutesByPid[player.pid],
					nextSeasonRotation.minutesByPid![player.pid],
					`Next-season Roster view rewrote the Custom baseline for pid ${player.pid}`,
				);
			}
			assertPlayable("second consecutive next-season One day");
		},
	);

	afterAll(async () => {
		try {
			// runBefore starts the normal league heartbeat. Stop that lifecycle
			// before closing/deleting meta, otherwise its 1-second callback races
			// the cleanup and produces unhandled IDB "connection is closing" errors.
			await beforeNonLeague(conditions);
			await league.remove(lid);
		} finally {
			await idb.meta.close();
			await deleteDB("meta");
		}
	});
});
