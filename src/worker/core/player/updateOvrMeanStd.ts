import { local } from "../../util/index.ts";
import { idb } from "../../db/index.ts";
import type Cache from "../../db/Cache.ts";
import type { CapturedOvrMeanStd } from "../capturedContext.ts";

const updateOvrMeanStd = async (
	cache: Cache = idb.cache,
	ovrMeanStd: CapturedOvrMeanStd = local,
) => {
	if (ovrMeanStd.playerOvrMeanStdStale) {
		const players = await cache.players.indexGetAll("playersByTid", [
			-1,
			Infinity,
		]);

		if (players.length > 0) {
			let sum = 0;
			for (const p of players) {
				sum += p.ratings.at(-1)!.ovr;
			}
			ovrMeanStd.playerOvrMean = sum / players.length;

			let sumSquareDeviations = 0;
			for (const p of players) {
				sumSquareDeviations +=
					(p.ratings.at(-1)!.ovr - ovrMeanStd.playerOvrMean) ** 2;
			}
			ovrMeanStd.playerOvrStd = Math.sqrt(sumSquareDeviations / players.length);

			ovrMeanStd.playerOvrMeanStdStale = false;
		}
	}
};

export default updateOvrMeanStd;
