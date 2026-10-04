import { PLAYER } from "../../../../common/index.ts";
import type {
	MinimalPlayerRatings,
	Player,
	PlayerWithoutKey,
} from "../../../../common/types.ts";

type ContractMarketPlayer =
	| Player<MinimalPlayerRatings>
	| PlayerWithoutKey<MinimalPlayerRatings>;

type StatRecord = Record<string, unknown>;

export type RegularSeasonAggregate = {
	games: number;
	minutes: number;
	bpm?: number;
	bpmMinutes: number;
};

const numberValue = (value: unknown, fallback = 0) =>
	typeof value === "number" && Number.isFinite(value) ? value : fallback;

const getBpm = (stats: StatRecord) => {
	if (typeof stats.bpm === "number" && Number.isFinite(stats.bpm)) {
		return stats.bpm;
	}
	if (
		typeof stats.obpm === "number" &&
		Number.isFinite(stats.obpm) &&
		typeof stats.dbpm === "number" &&
		Number.isFinite(stats.dbpm)
	) {
		return stats.obpm + stats.dbpm;
	}
	return undefined;
};

const getRowsToAggregate = (rows: StatRecord[]) => {
	const teamRows = rows.filter((stats) => stats.tid !== PLAYER.TOT);
	const teamRowsWithGames = teamRows.filter(
		(stats) => numberValue(stats.gp) > 0,
	);
	if (teamRowsWithGames.length > 0) {
		return teamRowsWithGames;
	}

	const totalRowsWithGames = rows.filter(
		(stats) => stats.tid === PLAYER.TOT && numberValue(stats.gp) > 0,
	);
	if (totalRowsWithGames.length > 0) {
		return [totalRowsWithGames.at(-1)!];
	}
	if (teamRows.length > 0) {
		return teamRows;
	}
	return rows.length > 0 ? [rows.at(-1)!] : [];
};

/**
 * Aggregate regular-season rows by season without counting a duplicate TOT row.
 * For a traded player, team stints are summed once and rate statistics are
 * weighted by the minutes in the rows that actually contain that statistic.
 */
export const getRegularSeasonStatsBySeason = (
	p: ContractMarketPlayer,
): Map<number, RegularSeasonAggregate> => {
	const rowsBySeason = new Map<number, StatRecord[]>();
	for (const stats of (p.stats ?? []) as unknown as StatRecord[]) {
		if (stats.playoffs === true) {
			continue;
		}
		const season = stats.season;
		if (typeof season !== "number" || !Number.isFinite(season)) {
			continue;
		}
		const rows = rowsBySeason.get(season) ?? [];
		rows.push(stats);
		rowsBySeason.set(season, rows);
	}

	const result = new Map<number, RegularSeasonAggregate>();
	for (const [season, seasonRows] of rowsBySeason) {
		const rows = getRowsToAggregate(seasonRows);
		const games = rows.reduce(
			(total, stats) => total + numberValue(stats.gp),
			0,
		);
		const minutes = rows.reduce(
			(total, stats) => total + numberValue(stats.min),
			0,
		);
		const bpmRows = rows
			.map((stats) => ({
				bpm: getBpm(stats),
				minutes: Math.max(0, numberValue(stats.min)),
			}))
			.filter(
				(row): row is { bpm: number; minutes: number } => row.bpm !== undefined,
			);
		const bpmMinutes = bpmRows.reduce((total, row) => total + row.minutes, 0);
		const bpm =
			bpmRows.length === 0
				? undefined
				: bpmMinutes > 0
					? bpmRows.reduce((total, row) => total + row.bpm * row.minutes, 0) /
						bpmMinutes
					: bpmRows.reduce((total, row) => total + row.bpm, 0) / bpmRows.length;

		result.set(season, {
			games,
			minutes,
			bpm,
			bpmMinutes,
		});
	}

	return result;
};
