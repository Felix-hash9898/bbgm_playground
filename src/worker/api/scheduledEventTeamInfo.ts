import type { ScheduledEventTeamInfo } from "../../common/types.ts";

type Info = ScheduledEventTeamInfo["info"] & Record<string, unknown>;

// tid identifies which team this event belongs to, and srID may be needed to
// match the same team across future real-roster seasons. Everything else is
// team information owned by the league-file picker, including fields added in
// the future that this version of the code does not know about.
const TEAM_INFO_IDENTITY_FIELDS = new Set(["tid", "srID"]);

export const deleteScheduledTeamInfoFields = (
	info: Info,
	mode: "confs" | "teamInfo",
) => {
	const keys =
		mode === "confs"
			? (["cid", "did"] as const)
			: Object.keys(info).filter((key) => !TEAM_INFO_IDENTITY_FIELDS.has(key));
	let updated = false;
	for (const key of keys) {
		if (info[key] !== undefined) {
			delete info[key];
			updated = true;
		}
	}
	return updated;
};
