import type { TeamSeasonWithoutKey } from "../../../common/types.ts";

export const PRIMARY_KEYS_TO_DELETE: Record<string, string> = {
	messages: "mid",
	playerFeats: "fid",
	releasedPlayers: "rid",
	scheduledEvents: "id",
	teamSeasons: "rid",
	teamStats: "rid",
};

export const deleteGeneratedPrimaryKey = (store: string, row: any) => {
	const key = PRIMARY_KEYS_TO_DELETE[store];
	if (key !== undefined) {
		delete row[key];
	}
	return row;
};

export const assertUniqueTeamSeasons = (
	teamSeasons: TeamSeasonWithoutKey[],
) => {
	const counts = new Map<string, number>();
	for (const row of teamSeasons) {
		const key = `${row.tid}/${row.season}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const duplicates = Array.from(counts).filter(([, count]) => count > 1);
	if (duplicates.length > 0) {
		throw new Error(
			`Duplicate team season entries for the following tid/season combinations: ${duplicates
				.map(([key, count]) => `${key}${count > 2 ? ` (${count} times)` : ""}`)
				.join(", ")}`,
		);
	}
};
