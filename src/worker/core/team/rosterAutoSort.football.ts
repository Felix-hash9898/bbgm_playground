import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import genDepth from "./genDepth.football.ts";
import type { Position } from "../../../common/types.football.ts";
import type { CapturedLeagueContext } from "../capturedContext.ts";

const rosterAutoSort = async (
	tid: number,
	onlyNewPlayers?: boolean,
	pos?: Position,
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
			QB: number[];
			RB: number[];
			WR: number[];
			TE: number[];
			OL: number[];
			DL: number[];
			LB: number[];
			CB: number[];
			S: number[];
			K: number[];
			P: number[];
			KR: number[];
			PR: number[];
		},
		onlyNewPlayers,
		pos,
		season,
	);

	await cache.teams.put(t);
};

export default rosterAutoSort;
