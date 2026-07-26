import type { ScheduledEventTeamInfo } from "../../common/types.ts";

type Info = ScheduledEventTeamInfo["info"] & Record<string, unknown>;

// These are the known team-info fields controlled by the "Team info" league
// file picker. Unknown Playground extension fields are intentionally retained.
const TEAM_INFO_FIELDS = [
	"abbrev",
	"colors",
	"imgURL",
	"imgURLSmall",
	"jersey",
	"name",
	"pop",
	"region",
	"stadiumCapacity",
] as const satisfies readonly (keyof ScheduledEventTeamInfo["info"])[];

export const deleteScheduledTeamInfoFields = (
	info: Info,
	mode: "confs" | "teamInfo",
) => {
	const keys =
		mode === "confs" ? (["cid", "did"] as const) : TEAM_INFO_FIELDS;
	let updated = false;
	for (const key of keys) {
		if (info[key] !== undefined) {
			delete info[key];
			updated = true;
		}
	}
	return updated;
};
