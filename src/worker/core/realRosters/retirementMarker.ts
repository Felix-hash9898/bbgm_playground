export const resolveRealRosterTid = (
	abbrev: string | number | undefined,
	getTid: (abbrev: string) => number | undefined,
) =>
	typeof abbrev === "number"
		? abbrev
		: abbrev === undefined
			? undefined
			: getTid(abbrev);

export const isActiveRealRosterTeam = (
	abbrev: string | number,
): abbrev is string => typeof abbrev === "string";
