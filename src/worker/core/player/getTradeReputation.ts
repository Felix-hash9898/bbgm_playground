import type { TeamSeasonWithoutKey } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import type Cache from "../../db/Cache.ts";

export const getTradeReputation = (
	teamSeasons: TeamSeasonWithoutKey[],
	season: number,
) => {
	let value = 0;
	for (const teamSeason of teamSeasons) {
		if (teamSeason.season === season - 2) {
			value += teamSeason.numPlayersTradedAway * 0.25;
		} else if (teamSeason.season === season - 1) {
			value += teamSeason.numPlayersTradedAway * 0.5;
		} else if (teamSeason.season === season) {
			value += teamSeason.numPlayersTradedAway * 0.75;
		}
	}
	return value;
};

export const getTradeReputationByTidFromData = (
	tids: number[],
	teamSeasons: TeamSeasonWithoutKey[],
	season: number,
) => {
	const byTid = Object.groupBy(teamSeasons, (row) => row.tid);
	const result: Record<number, number> = {};
	for (const tid of tids) {
		result[tid] = getTradeReputation(byTid[tid] ?? [], season);
	}
	return result;
};

export const getTradeReputationByTid = async (
	season = g.get("season"),
	cache: Cache = idb.cache,
) => {
	const teamSeasons = await cache.teamSeasons.indexGetAll(
		"teamSeasonsBySeasonTid",
		[[season - 2], [season, "Z"]],
	);
	const tids = (await cache.teams.getAll())
		.filter((team) => !team.disabled)
		.map((team) => team.tid);
	return getTradeReputationByTidFromData(tids, teamSeasons, season);
};
