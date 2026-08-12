import { PHASE, isSport } from "../../../common/index.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import fuzzRating from "../player/fuzzRating.ts";
import { legalizeBasketballCustomMinutes } from "./basketballMinutes.ts";

/**
 * Relegalize persisted custom plans once, after a roster transaction is fully
 * complete. Auto plans are derived on demand and never need a database write.
 */
const reconcileBasketballRotation = async (
	tids: Iterable<number>,
	options: {
		cache?: typeof idb.cache;
		numPlayersOnCourt?: number;
		playoffs?: boolean;
		challengeNoRatings?: boolean;
	} = {},
) => {
	if (!isSport("basketball")) {
		return;
	}

	const cache = options.cache ?? idb.cache;
	const numPlayersOnCourt =
		options.numPlayersOnCourt ?? g.get("numPlayersOnCourt");
	const playoffs = options.playoffs ?? g.get("phase") === PHASE.PLAYOFFS;
	const challengeNoRatings =
		options.challengeNoRatings ?? g.get("challengeNoRatings");
	for (const tid of new Set(tids)) {
		if (tid < 0) {
			continue;
		}
		const t = await cache.teams.get(tid);
		if (t?.basketballRotation?.mode !== "custom") {
			continue;
		}
		const players = await cache.players.indexGetAll("playersByTid", tid);
		if (players.length < numPlayersOnCourt) {
			// The game cannot run with this roster either. Leave the saved intent
			// alone until the roster-size repair adds enough players.
			continue;
		}

		const minutesByPid = legalizeBasketballCustomMinutes({
			players: players.map((p) => {
				const ratings = p.ratings.at(-1)!;
				return {
					pid: p.pid,
					rosterOrder: p.rosterOrder,
					endurance: challengeNoRatings
						? 0.5
						: fuzzRating(ratings.endu, ratings.fuzz) / 100,
				};
			}),
			minutesByPid: t.basketballRotation.minutesByPid,
			numPlayersOnCourt,
			playoffs,
		});
		const currentMinutes = t.basketballRotation.minutesByPid;
		const unchanged =
			t.basketballRotation.numPlayersOnCourtAtSave === numPlayersOnCourt &&
			currentMinutes !== undefined &&
			Object.keys(currentMinutes).length === Object.keys(minutesByPid).length &&
			Object.entries(minutesByPid).every(
				([pid, value]) => currentMinutes[Number(pid)] === value,
			);
		if (unchanged) {
			continue;
		}

		t.basketballRotation = {
			version: 1,
			mode: "custom",
			minutesByPid,
			numPlayersOnCourtAtSave: numPlayersOnCourt,
		};
		await cache.teams.put(t);
	}
};

export default reconcileBasketballRotation;
