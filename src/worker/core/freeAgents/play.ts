import initUILocalGames from "../../util/initUILocalGames.ts";
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
	local,
} from "../../util/index.ts";
import type { Conditions } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";

type PlayRequestContext = {
	cache: typeof idb.cache;
	leagueDB: typeof idb.league;
	releaseAutoFlush: () => void;
	checkpoint: ReturnType<typeof idb.cache.beginMutationCheckpoint> | undefined;
	finalFlushAttempted: boolean;
	releasedSimulation: boolean;
	batchUiRefresh: boolean;
	finalUiRefreshSent: boolean;
};

const createPlayRequestContext = async (
	batchUiRefresh = false,
): Promise<PlayRequestContext> => {
	const cache = idb.cache;
	const releaseAutoFlush = cache.pauseAutoFlush();
	try {
		await cache._flushPromise;
		return {
			cache,
			leagueDB: idb.league,
			releaseAutoFlush,
			checkpoint: cache.beginMutationCheckpoint(),
			finalFlushAttempted: false,
			releasedSimulation: false,
			batchUiRefresh,
			finalUiRefreshSent: false,
		};
	} catch (error) {
		releaseAutoFlush();
		throw error;
	}
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
	let ownsSimulation = false;

	const getContext = () => {
		if (!context) {
			throw new Error("Free Agency play request context is not initialized");
		}
		return context;
	};

	// This is called when there are no more days to play, either due to the user's request (e.g. 1 week) elapsing or at the end of free agency.
	const cbNoDays = async () => {
		const currentContext = getContext();

		if (g.get("daysLeft") <= 0) {
			await updateStatus("Idle");
			await flushPlayRequest(getContext());
			currentContext.checkpoint?.commit();
			currentContext.checkpoint = undefined;
			currentContext.releasedSimulation = true;
			await lock.set("gameSim", false);
			await updatePlayMenu();
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
				ownsSimulation = true;
				if (!context) {
					context = await createPlayRequestContext(numDays > 1);
					ownsRequestContext = true;
				}
				await updatePlayMenu();
				await cbRunDay();
			}
		} else {
			if (!context) {
				context = await createPlayRequestContext(numDays > 1);
				ownsRequestContext = true;
			}
			await cbRunDay();
		}

		if (ownsRequestContext) {
			const currentContext = getContext();
			if (!currentContext.finalFlushAttempted) {
				await flushPlayRequest(currentContext);
			}
			currentContext.checkpoint?.commit();
			currentContext.checkpoint = undefined;
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
		if (ownsRequestContext || ownsSimulation) {
			local.autoPlayUntil = undefined;
			try {
				await initUILocalGames();
				await toUI("realtimeUpdate", [["playerMovement"]]);
				await updateStatus(helpers.daysLeft(true));
			} catch (cleanupError) {
				console.error(
					"Failed to refresh after free agency error",
					cleanupError,
				);
			}
		}
		throw error;
	} finally {
		if (
			(ownsRequestContext || ownsSimulation) &&
			!context?.releasedSimulation
		) {
			try {
				await lock.set("gameSim", false);
				await updatePlayMenu();
			} catch (cleanupError) {
				console.error("Failed to unlock free agency", cleanupError);
			}
		}
		if (ownsRequestContext) {
			getContext().releaseAutoFlush();
		}
	}
}

export default play;
