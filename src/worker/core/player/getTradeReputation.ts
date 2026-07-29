import type { TeamSeasonWithoutKey } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";

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

export const getTradeReputationByTid = async () => {
	const season = g.get("season");
	const teamSeasons = await idb.cache.teamSeasons.indexGetAll(
		"teamSeasonsBySeasonTid",
		[[season - 2], [season, "Z"]],
	);
	const byTid = Object.groupBy(teamSeasons, (row) => row.tid);
	const result: Record<number, number> = {};
	for (const team of await idb.cache.teams.getAll()) {
		if (!team.disabled) {
			result[team.tid] = getTradeReputation(byTid[team.tid] ?? [], season);
		}
	}
	return result;
};
