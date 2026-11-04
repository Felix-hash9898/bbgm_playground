import { idb } from "../../db/index.ts";
import { local, lock } from "../../util/index.ts";
import { beginGameDayNotifications } from "../../util/logEvent.ts";

// Reuse the Cache journal already used by phase changes. Each completed day is
// durable before it is published to the UI; a failed day can be retried in place.
const runDay = async <T>(operation: () => Promise<T>): Promise<T> => {
	const cache = idb.cache;
	const releaseAutoFlush = cache.pauseAutoFlush();
	let checkpoint: ReturnType<typeof cache.beginMutationCheckpoint> | undefined;
	let notifications: ReturnType<typeof beginGameDayNotifications> | undefined;
	const stopGameSim = lock.get("stopGameSim");
	const playingUntilEndOfRound = local.playingUntilEndOfRound;
	try {
		// A timer may already have entered flush before the pause. Drain that
		// transaction before taking snapshots or mutating its referenced records.
		await cache._flushPromise;
		checkpoint = cache.beginMutationCheckpoint();
		notifications = beginGameDayNotifications();
		const result = await operation();
		await cache.flush(undefined, { checkpointToCommit: checkpoint });
		checkpoint.commit();
		checkpoint = undefined;
		await notifications.commit();
		return result;
	} catch (error) {
		if (checkpoint) {
			checkpoint.rollback();
			notifications?.rollback();
			local.playingUntilEndOfRound = playingUntilEndOfRound;
			local.seasonLeaders = undefined;
			local.minFractionDiffs = undefined;
			local.liveSimRatingsStatsPopoverPlayers = undefined;
			try {
				await lock.set("stopGameSim", stopGameSim);
			} catch (cleanupError) {
				console.error("Failed to restore simulation stop flag", cleanupError);
			}
		}
		throw error;
	} finally {
		releaseAutoFlush();
	}
};

export default runDay;
