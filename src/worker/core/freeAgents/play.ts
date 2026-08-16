import { PHASE } from "../../../common/index.ts";
import { league, phase, trade } from "../index.ts";
import autoSign from "./autoSign.ts";
import decreaseDemands from "./decreaseDemands.ts";
import {
	g,
	lock,
	updatePlayMenu,
	updateStatus,
	toUI,
	recomputeLocalUITeamOvrs,
	helpers,
} from "../../util/index.ts";
import type { Conditions } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";

type PlayRequestContext = {
	cache: typeof idb.cache;
	leagueDB: typeof idb.league;
	releaseAutoFlush: () => void;
	checkpoint: ReturnType<typeof idb.cache.beginMutationCheckpoint> | undefined;
	finalFlushAttempted: boolean;
	batchUiRefresh: boolean;
	finalUiRefreshSent: boolean;
};

const createPlayRequestContext = (
	batchUiRefresh = false,
): PlayRequestContext => {
	const cache = idb.cache;
	return {
		cache,
		leagueDB: idb.league,
		releaseAutoFlush: cache.pauseAutoFlush(),
		checkpoint: cache.beginMutationCheckpoint(),
		finalFlushAttempted: false,
		batchUiRefresh,
		finalUiRefreshSent: false,
	};
};

const flushPlayRequest = async (context: PlayRequestContext) => {
	context.finalFlushAttempted = true;
	await context.cache.flush(undefined, {
		league: context.leagueDB,
		updateLastPlayed: false,
	});
};

/**
 * Simulates one or more days of free agency.
 *
 * @memberOf core.freeAgents
 * @param {number} numDays An integer representing the number of days to be simulated. If numDays is larger than the number of days remaining, then all of free agency will be simulated up until the preseason starts.
 * @param {boolean} start Is this a new request from the user to simulate days (true) or a recursive callback to simulate another day (false)? If true, then there is a check to make sure simulating games is allowed. Default true.
 */
async function play(
	numDays: number,
	conditions: Conditions,
	start: boolean = true,
	requestContext?: PlayRequestContext,
) {
	let context = requestContext;
	let ownsRequestContext = false;

	const getContext = () => {
		if (!context) {
			throw new Error("Free Agency play request context is not initialized");
		}
		return context;
	};

	// This is called when there are no more days to play, either due to the user's request (e.g. 1 week) elapsing or at the end of free agency.
	const cbNoDays = async () => {
		const currentContext = getContext();
		await lock.set("gameSim", false);
		await updatePlayMenu(); // Check to see if free agency is over

		if (g.get("daysLeft") <= 0) {
			await updateStatus("Idle");
			await flushPlayRequest(getContext());
			currentContext.checkpoint?.commit();
			currentContext.checkpoint = undefined;
			await phase.newPhase(PHASE.PRESEASON, conditions);
			currentContext.finalUiRefreshSent = true;
		}
	};

	// This simulates a day, including game simulation and any other bookkeeping that needs to be done
	const cbRunDay = async () => {
		// This is called if there are remaining days to simulate
		const cbYetAnother = async () => {
			const currentContext = getContext();
			let runAnotherDay = false;
			await decreaseDemands();
			await autoSign();
			await league.setGameAttributes({
				daysLeft: g.get("daysLeft") - 1,
			});

			if (g.get("daysLeft") > 0 && numDays > 0) {
				if (!currentContext.batchUiRefresh) {
					await toUI("realtimeUpdate", [["playerMovement"]]);
				}
				await recomputeLocalUITeamOvrs();
				await updateStatus(helpers.daysLeft(true));
				if (currentContext.batchUiRefresh) {
					await trade.betweenAiTeams({ deferUiRefresh: true });
				} else {
					await trade.betweenAiTeams();
				}
				runAnotherDay = true;
			}

			if (runAnotherDay) {
				await play(numDays - 1, conditions, false, currentContext);
			} else {
				await cbNoDays();
			}
		};

		// If we didn't just stop games, let's play
		// Or, if we are starting games (and already passed the lock), continue even if stopGameSim was just seen
		const stopGameSim = lock.get("stopGameSim");

		if (numDays > 0 && (start || !stopGameSim)) {
			if (stopGameSim) {
				await lock.set("stopGameSim", false);
			}

			await cbYetAnother();
		} else {
			// If this is the last day, update play menu
			await cbNoDays();
		}
	};

	try {
		// If this is a request to start a new simulation... are we allowed to do
		// that? If so, set the lock and update the play menu
		if (start) {
			const canStartGames = await lock.canStartGames();

			if (canStartGames) {
				if (!context) {
					context = createPlayRequestContext(numDays > 1);
					ownsRequestContext = true;
				}
				await updatePlayMenu();
				await cbRunDay();
			}
		} else {
			if (!context) {
				context = createPlayRequestContext(numDays > 1);
				ownsRequestContext = true;
			}
			await cbRunDay();
		}

		if (ownsRequestContext) {
			const currentContext = getContext();
			currentContext.checkpoint?.commit();
			currentContext.checkpoint = undefined;
			if (!currentContext.finalFlushAttempted) {
				await flushPlayRequest(currentContext);
			}
			if (currentContext.batchUiRefresh) {
				await recomputeLocalUITeamOvrs();
			}
			if (currentContext.batchUiRefresh && !currentContext.finalUiRefreshSent) {
				await toUI("realtimeUpdate", [["playerMovement"]]);
				currentContext.finalUiRefreshSent = true;
			}
		}
	} catch (error) {
		if (ownsRequestContext && context?.checkpoint) {
			context.checkpoint.rollback();
			context.checkpoint = undefined;
		}
		throw error;
	} finally {
		if (ownsRequestContext) {
			getContext().releaseAutoFlush();
		}
	}
}

export default play;
