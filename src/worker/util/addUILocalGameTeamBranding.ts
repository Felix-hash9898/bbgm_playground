import type { LocalStateUI, Team } from "../../common/types.ts";
import { idb } from "../db/index.ts";

const getBranding = (
	teamsByTid: Map<number, Team>,
	tid: number,
): LocalStateUI["games"][number]["teams"][number]["branding"] => {
	const t = teamsByTid.get(tid);
	if (!t) {
		return;
	}

	return {
		region: t.region,
		name: t.name,
		abbrev: t.abbrev,
		imgURL: t.imgURL,
		imgURLSmall: t.imgURLSmall,
	};
};

const addUILocalGameTeamBranding = async <T extends LocalStateUI["games"]>(
	games: T,
): Promise<T> => {
	const teamsByTid = new Map(
		(await idb.cache.teams.getAll()).map((t) => [t.tid, t]),
	);

	return games.map((game) => ({
		...game,
		teams: [
			{
				...game.teams[0],
				branding: getBranding(teamsByTid, game.teams[0].tid),
			},
			{
				...game.teams[1],
				branding: getBranding(teamsByTid, game.teams[1].tid),
			},
		],
	})) as T;
};

export default addUILocalGameTeamBranding;
