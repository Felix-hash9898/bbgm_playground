import { idb } from "../../db/index.ts";
import genDepth from "./genDepth.baseball.ts";
import { g } from "../../util/index.ts";
import type { CapturedLeagueContext } from "../capturedContext.ts";

const rosterAutoSort = async (
	tid: number,
	onlyNewPlayers?: boolean,
	pos?: "L" | "LP" | "D" | "DP" | "P",
	context?: CapturedLeagueContext,
) => {
	const cache = context?.cache ?? idb.cache;
	const season = context?.season ?? g.get("season");
	const t = await cache.teams.get(tid);
	if (!t) {
		throw new Error("Invalid tid");
	}

	const playersFromCache = await cache.players.indexGetAll("playersByTid", tid);

	t.depth = await genDepth(
		playersFromCache,
		t.depth as {
			L: number[];
			LP: number[];
			D: number[];
			DP: number[];
			P: number[];
		},
		onlyNewPlayers,
		pos,
		season,
	);

	await cache.teams.put(t);
};

export default rosterAutoSort;
