import { isSport, PLAYER } from "../../../common/index.ts";
import { player, team } from "../index.ts";
import getBest from "./getBest.ts";
import { idb } from "../../db/index.ts";
import { g, local, random } from "../../util/index.ts";
import { orderBy } from "../../../common/utils.ts";
import { getContractException } from "../contracts/contractLimits.ts";
import { getMidLevelExceptionSeason } from "../contracts/contractMidLevel.ts";
import { isMinimumContractForPlayer } from "../contracts/contractMinimum.ts";
import {
	canOfferTwoWay,
	canTeamAddTwoWay,
	isStandardContract,
	makeTwoWayContract,
} from "../contracts/contractTwoWay.ts";

/**
 * AI teams sign free agents.
 *
 * Each team (in random order) will sign free agents up to their salary cap or roster size limit. This should eventually be made smarter
 *
 * @memberOf core.freeAgents
 * @return {Promise}
 */
const autoSign = async () => {
	const players = await idb.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);

	if (players.length === 0) {
		return;
	}

	// List of free agents, sorted by value
	let playersSorted = orderBy(players, "value", "desc");

	// Randomly order teams
	const teams = await idb.cache.teams.getAll();
	random.shuffle(teams);

	for (const t of teams) {
		// Skip the user's team
		if (
			g.get("userTids").includes(t.tid) &&
			!local.autoPlayUntil &&
			!g.get("spectator")
		) {
			continue;
		}

		if (t.disabled) {
			continue;
		}

		let probSkip;
		if (isSport("basketball")) {
			probSkip = t.strategy === "rebuilding" ? 0.9 : 0.75;
		} else {
			probSkip = 0.5;
		}

		// Skip teams sometimes
		if (Math.random() < probSkip) {
			continue;
		}

		let playersOnRoster = await idb.cache.players.indexGetAll(
			"playersByTid",
			t.tid,
		);
		const standardPlayersOnRoster = playersOnRoster.filter((p) =>
			isStandardContract(p.contract),
		);

		// With forceHistoricalRosters, only sign FAs if we have to
		if (
			standardPlayersOnRoster.length >= g.get("minRosterSize") &&
			g.get("forceHistoricalRosters")
		) {
			continue;
		}

		// Ignore roster size, will drop bad player if necessary in checkRosterSizes, and getBest won't sign min contract player unless under the roster limit
		const payroll = await team.getPayroll(t.tid);
		const p = getBest(playersOnRoster, playersSorted, payroll);
		if (p) {
			// Remove from list of free agents
			playersSorted = playersSorted.filter((p2) => p2 !== p);

			await player.sign(p, t.tid, p.contract, g.get("phase"));
			await idb.cache.players.put(p);
			playersOnRoster = [...playersOnRoster, p];
			await team.rosterAutoSort(t.tid);
		}

		if (!p) {
			const pMidLevel = playersSorted.find((p2) => {
				if (isMinimumContractForPlayer(p2, p2.contract)) {
					return false;
				}

				return (
					getContractException({
						birdException: false,
						contract: p2.contract,
						p: p2,
						payroll,
						team: t,
					}).type === "midLevel"
				);
			});

			if (pMidLevel) {
				playersSorted = playersSorted.filter((p2) => p2 !== pMidLevel);
				pMidLevel.contract.exception = "midLevel";

				await player.sign(pMidLevel, t.tid, pMidLevel.contract, g.get("phase"));
				await idb.cache.players.put(pMidLevel);
				t.midLevelExceptionUsedSeason = getMidLevelExceptionSeason();
				await idb.cache.teams.put(t);
				playersOnRoster = [...playersOnRoster, pMidLevel];
				await team.rosterAutoSort(t.tid);
			}
		}

		const standardPlayersOnRosterAfterStandardPass = playersOnRoster.filter((p) =>
			isStandardContract(p.contract),
		);
		if (
			standardPlayersOnRosterAfterStandardPass.length >= g.get("minRosterSize") &&
			canTeamAddTwoWay(playersOnRoster, t.tid)
		) {
			const pTwoWay = playersSorted.find((p) => canOfferTwoWay(p));
			if (pTwoWay) {
				playersSorted = playersSorted.filter((p) => p !== pTwoWay);

				await player.sign(
					pTwoWay,
					t.tid,
					makeTwoWayContract(),
					g.get("phase"),
				);
				await idb.cache.players.put(pTwoWay);
				await team.rosterAutoSort(t.tid);
			}
		}
	}
};

export default autoSign;
