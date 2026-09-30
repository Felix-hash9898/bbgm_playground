import { isSport } from "../../common/index.ts";
import helpers from "../util/helpers.ts";
import PlusMinus from "../components/PlusMinus.tsx";

export const formatStatGameHigh = (
	ps: any,
	stat: string,
	statType?: string,
) => {
	if (isSport("baseball")) {
		if (
			ps.pos !== "C" &&
			(stat === "pb" || stat === "sbF" || stat === "csF" || stat === "csp")
		) {
			return null;
		}
	}
	if (stat.endsWith("Max")) {
		if (!Array.isArray(ps[stat])) {
			return null;
		}
		const row = ps[stat] as
			| [number, number]
			| [number, number, string, number, number];
		const abbrev = row.length > 3 ? row[2] : ps.abbrev;
		const tid = row.length > 3 ? row[3] : ps.tid;
		const season = row.length > 3 ? row[4] : ps.season;
		return (
			<a
				href={helpers.leagueUrl([
					"game_log",
					`${abbrev}_${tid}`,
					season as any,
					row[1],
				])}
			>
				{helpers.roundStat(row[0], stat, statType === "totals")}
			</a>
		);
	}
	if (isSport("basketball") && (stat === "pm100" || stat === "onOff100")) {
		return <PlusMinus>{ps[stat]}</PlusMinus>;
	}
	return helpers.roundStat(ps[stat], stat, statType === "totals");
};
