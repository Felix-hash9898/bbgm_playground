import type BasketballGameSim from "../worker/core/GameSim.basketball/index.ts";
import { deleteDB } from "@dumbmatter/idb";
import { expect, test, vi } from "vitest";
import { DEFAULT_LEVEL } from "../common/budgetLevels.ts";
import { PHASE, PLAYER } from "../common/index.ts";
import { resetG } from "./helpers.ts";
import Cache, { STORES } from "../worker/db/Cache.ts";
import { connectLeague, idb } from "../worker/db/index.ts";
import { g, helpers, local, lock } from "../worker/util/index.ts";
import { GameSim, league, player, team, trade } from "../worker/core/index.ts";
import { getMinContractForPlayer } from "../worker/core/contracts/contractMinimum.ts";
import play from "../worker/core/game/play.ts";

// Native browser IndexedDB, including WebKit; no fake-indexeddb or mocked flush.
test("a failed native-IDB day retries once and persists its injury, contract, score, and schedule after reopen", async () => {
	resetG();
	lock.reset();
	const lid = 710_000 + Math.floor(Math.random() * 10_000);
	g.setWithoutSavingToDB("lid", lid);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	g.setWithoutSavingToDB("numTeams", 2);
	g.setWithoutSavingToDB("numActiveTeams", 2);
	g.setWithoutSavingToDB("numGamesPlayoffSeries", [7]);
	g.setWithoutSavingToDB("numPlayoffByes", 0);
	g.setWithoutSavingToDB("playIn", false);
	g.setWithoutSavingToDB("injuryRate", 0);
	g.setWithoutSavingToDB("tragicDeathRate", 0);
	const autoSave = local.autoSave;
	local.autoSave = true;
	idb.league = await connectLeague(lid);
	idb.cache = new Cache();
	try {
		for (const store of STORES) {
			idb.cache._data[store] = {};
			idb.cache._deletes[store] = new Set();
			idb.cache._dirtyRecords[store] = new Set();
			idb.cache._maxIds[store] = -1;
			idb.cache._markDirtyIndexes(store);
		}
		idb.cache._status = "full";
		for (const row of helpers.getTeamsDefault().slice(0, 2)) {
			await idb.cache.teams.add(team.generate(row));
			await idb.cache.teamSeasons.add(team.genSeasonRow(row));
			await idb.cache.teamStats.add(team.genStatsRow(row.tid));
			for (let i = 0; i < g.get("minRosterSize"); i++) {
				const p = player.generate(
					row.tid,
					27,
					g.get("season") - 5,
					true,
					DEFAULT_LEVEL,
				);
				p.rosterOrder = i;
				await idb.cache.players.add(p);
			}
		}
		const freeAgent = player.generate(
			PLAYER.FREE_AGENT,
			30,
			g.get("season") - 8,
			true,
			DEFAULT_LEVEL,
		);
		freeAgent.contract = {
			amount: getMinContractForPlayer(freeAgent) + 100,
			exp: g.get("season"),
			option: "player",
		};
		const freeAgentPid = await idb.cache.players.add(freeAgent);
		await idb.cache.schedule.add({ gid: 1, homeTid: 0, awayTid: 1, day: 1 });
		await idb.cache.schedule.add({ gid: 2, homeTid: 1, awayTid: 0, day: 2 });
		await idb.cache.flush(undefined, {
			league: idb.league,
			updateLastPlayed: false,
		});
		vi.spyOn(league, "updateMeta").mockResolvedValue(undefined);
		vi.spyOn(team, "checkRosterSizes").mockResolvedValue(undefined);
		vi.spyOn(trade, "betweenAiTeams").mockResolvedValue(undefined);
		vi.spyOn(player, "injury").mockReturnValue({
			type: "Sprained Ankle",
			gamesRemaining: 8,
		});
		let injuredPid: number | undefined;
		const simulate = (GameSim as typeof BasketballGameSim).prototype.run;
		vi.spyOn(
			(GameSim as typeof BasketballGameSim).prototype,
			"run",
		).mockImplementation(function (this: BasketballGameSim) {
			const result = simulate.call(this);
			const p = result.team.find((t) => t.id === 0)!.player[0]!;
			p.pendingPostGameInjury = true;
			injuredPid = p.id;
			return result;
		});
		const baseline = structuredClone(await idb.cache.players.getAll());
		vi.spyOn(idb.cache.players, "put").mockRejectedValueOnce(
			new Error("native day put failed"),
		);
		await expect(play(1, {})).rejects.toThrow("native day put failed");
		expect(await idb.cache.players.getAll()).toEqual(baseline);
		expect(await idb.league.getAll("games")).toHaveLength(0);
		expect(await idb.league.getAll("schedule")).toHaveLength(2);
		expect(idb.cache._dirty).toBe(false);
		expect(lock.get("gameSim")).toBe(false);
		await play(1, {});
		const [savedGame] = await idb.league.getAll("games");
		expect(savedGame!.gid).toBe(1);
		expect(savedGame!.teams[0].pts).toBeGreaterThan(0);
		idb.cache.stopAutoFlush();
		idb.league.close();
		idb.league = await connectLeague(lid);
		idb.cache = new Cache();
		await idb.cache.fill();
		expect(await idb.cache.games.getAll()).toEqual([savedGame]);
		expect((await idb.cache.schedule.getAll()).map((g) => g.gid)).toEqual([2]);
		expect(
			(await idb.cache.players.get(freeAgentPid))!.contract.option,
		).toBeUndefined();
		expect((await idb.cache.players.get(injuredPid!))!.injury).toMatchObject({
			type: "Sprained Ankle",
			gamesRemaining: 8,
		});
		expect(
			(await idb.league.getAll("events")).filter(
				(e) => e.type === "injured" && e.pids?.includes(injuredPid!),
			),
		).toHaveLength(1);
	} finally {
		vi.restoreAllMocks();
		idb.cache.stopAutoFlush();
		idb.league.close();
		await deleteDB(`league${lid}`);
		local.autoSave = autoSave;
		lock.reset();
	}
});
