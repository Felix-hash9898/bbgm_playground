import {
	PLAYER_STATS_TABLES,
	processPlayerStatsBasketball,
} from "../../common/index.ts";
import type {
	Game,
	HeadToHead,
	PlayoffSeries,
	PlayerStatType,
} from "../../common/types.ts";
import playerStats from "../core/player/stats.basketball.ts";
import { calculateAdvancedStatsFromRawGameData } from "../util/advStats.basketball.ts";
import { weightByMinutes } from "../db/getCopies/playersPlus.ts";

type Series = {
	key: string;
	label: string;
	result?: "won" | "lost";
	round: number;
	tid: number;
	oppTid: number;
	won: number;
	lost: number;
	gids?: number[];
};

type Summary = {
	key: string;
	label: string;
	record?: string;
	stats: Record<string, Record<string, any>>;
};

/** Identify matchups from persisted playoff brackets and head-to-head records. */
export const identifyPlayerSeries = (
	games: Game[],
	pid: number,
	playoffSeries: PlayoffSeries | undefined,
	headToHead: HeadToHead | undefined,
	playoffRoundName: (round: number) => string,
	numGamesByRound: number[],
): Series[] => {
	const matchups = new Map<string, Series>();
	const add = (
		round: number,
		tid: number,
		oppTid: number,
		gids?: number[],
		bracketWon?: number,
		bracketLost?: number,
	) => {
		const key = `${tid}_${oppTid}`;
		const firstTid = Math.min(tid, oppTid);
		const record = headToHead?.playoffs[firstTid]?.[Math.max(tid, oppTid)];
		const firstIsPlayer = tid === firstTid;
		const won = record
			? firstIsPlayer
				? record.won
				: record.lost
			: (bracketWon ?? 0);
		const lost = record
			? firstIsPlayer
				? record.lost
				: record.won
			: (bracketLost ?? 0);
		const bracketResult =
			bracketWon !== undefined &&
			bracketLost !== undefined &&
			(bracketWon >=
				(round < 0 ? 1 : Math.ceil((numGamesByRound[round] ?? Infinity) / 2)) ||
				bracketLost >=
					(round < 0 ? 1 : Math.ceil((numGamesByRound[round] ?? Infinity) / 2)))
				? bracketWon > bracketLost
					? "won"
					: "lost"
				: undefined;
		const result = record?.result
			? firstIsPlayer
				? record.result
				: record.result === "won"
					? "lost"
					: "won"
			: bracketResult;
		matchups.set(key, {
			key,
			label: `${playoffRoundName(round)} vs. `,
			result,
			round,
			tid,
			oppTid,
			won,
			lost,
			gids,
		});
	};

	// The bracket supplies the round, including play-in (-1), and can supply
	// exact game IDs. A head-to-head record supplies completed/current W-L.
	if (playoffSeries) {
		for (const [round, matchupsInRound] of playoffSeries.series.entries()) {
			for (const matchup of matchupsInRound) {
				if (!matchup.away) {
					continue;
				}
				add(
					round,
					matchup.home.tid,
					matchup.away.tid,
					matchup.gids,
					matchup.home.won,
					matchup.away.won,
				);
				add(
					round,
					matchup.away.tid,
					matchup.home.tid,
					matchup.gids,
					matchup.away.won,
					matchup.home.won,
				);
			}
		}
		for (const tournament of playoffSeries.playIns ?? []) {
			for (const matchup of tournament) {
				add(
					-1,
					matchup.home.tid,
					matchup.away.tid,
					matchup.gids,
					matchup.home.won,
					matchup.away.won,
				);
				add(
					-1,
					matchup.away.tid,
					matchup.home.tid,
					matchup.gids,
					matchup.away.won,
					matchup.home.won,
				);
			}
		}
	}

	if (headToHead) {
		for (const [first, opponents] of Object.entries(headToHead.playoffs)) {
			for (const [second, record] of Object.entries(opponents)) {
				const firstTid = Number(first);
				const secondTid = Number(second);
				if (!matchups.has(`${firstTid}_${secondTid}`)) {
					add(record.round, firstTid, secondTid);
					add(record.round, secondTid, firstTid);
				}
			}
		}
	}

	const appeared = new Map<string, Series>();
	for (const game of games) {
		if (!game.playoffs) {
			continue;
		}
		const team = game.teams.find((t) =>
			t.players.some(
				(p) => p.pid === pid && ((p.gp ?? 0) > 0 || (p.min ?? 0) > 0),
			),
		);
		if (!team) {
			continue;
		}
		const oppTid =
			game.teams[0].tid === team.tid ? game.teams[1].tid : game.teams[0].tid;
		const series = matchups.get(`${team.tid}_${oppTid}`);
		if (
			series &&
			series.tid === team.tid &&
			(!series.gids || series.gids.includes(game.gid))
		) {
			appeared.set(series.key, series);
		}
	}
	return [...appeared.values()].sort((a, b) => a.round - b.round);
};

const teamKeys = [
	"min",
	"fg",
	"fga",
	"tp",
	"tpa",
	"ft",
	"fta",
	"orb",
	"drb",
	"ast",
	"tov",
	"stl",
	"blk",
	"pf",
	"pts",
] as const;
const playerKeys: readonly string[] = [
	...playerStats.raw.filter((stat) => stat !== "minAvailable"),
	"trb", // Older games can have total rebounds without ORB/DRB.
];
const gameHighStats = PLAYER_STATS_TABLES.gameHighs!.stats.filter((stat) =>
	stat.endsWith("Max"),
);

const sumPresent = (
	target: Record<string, number>,
	source: any,
	keys: readonly string[],
) => {
	for (const key of keys) {
		if (typeof source[key] === "number") {
			target[key] = (target[key] ?? 0) + source[key];
		}
	}
};

/** Aggregate games once, then apply BBGM's canonical stat processing. */
export const aggregatePlayerGames = (games: Game[], pid: number) => {
	const players = new Map<
		string,
		{
			pid: number;
			tid: number;
			ratings: { pos: string };
			stats: Record<string, number>;
		}
	>();
	const teams = new Map<
		number,
		{ tid: number; stats: Record<string, number> }
	>();
	const playerTotals: Record<string, number> = {};
	const statSumsExtra: Record<string, { gp: number; min: number }> = {};
	const highs: Record<string, [number, number, number]> = {};
	let gp = 0;
	let advancedDataComplete = true;
	for (const game of games) {
		for (const [i, team] of game.teams.entries()) {
			const opponent = game.teams[1 - i]!;
			if (teamKeys.some((key) => typeof team[key] !== "number")) {
				advancedDataComplete = false;
			}
			let teamInfo = teams.get(team.tid);
			if (!teamInfo) {
				teamInfo = { tid: team.tid, stats: {} };
				teams.set(team.tid, teamInfo);
			}
			teamInfo.stats.gp = (teamInfo.stats.gp ?? 0) + 1;
			sumPresent(teamInfo.stats, team, teamKeys);
			for (const key of teamKeys) {
				const oppKey = `opp${key[0]!.toUpperCase()}${key.slice(1)}`;
				if (typeof opponent[key] === "number") {
					teamInfo.stats[oppKey] =
						(teamInfo.stats[oppKey] ?? 0) + opponent[key];
				}
			}
			teamInfo.stats.trb =
				(teamInfo.stats.orb ?? 0) + (teamInfo.stats.drb ?? 0);
			teamInfo.stats.oppTrb =
				(teamInfo.stats.oppOrb ?? 0) + (teamInfo.stats.oppDrb ?? 0);

			for (const row of team.players) {
				if ((row.gp ?? 0) <= 0 && (row.min ?? 0) <= 0) {
					continue;
				}
				if (
					[
						"min",
						"fg",
						"fga",
						"tp",
						"tpa",
						"ft",
						"fta",
						"orb",
						"drb",
						"ast",
						"tov",
						"stl",
						"blk",
						"pf",
						"pts",
						"pm",
					].some((key) => typeof row[key] !== "number")
				) {
					advancedDataComplete = false;
				}
				const key = `${row.pid}_${team.tid}`;
				let playerInfo = players.get(key);
				if (!playerInfo) {
					playerInfo = {
						pid: row.pid,
						tid: team.tid,
						ratings: { pos: row.pos },
						stats: {},
					};
					players.set(key, playerInfo);
				}
				sumPresent(playerInfo.stats, row, playerKeys);
				playerInfo.stats.gp = (playerInfo.stats.gp ?? 0) + 1;
				playerInfo.stats.trb =
					(playerInfo.stats.orb ?? 0) + (playerInfo.stats.drb ?? 0);
				if (row.pid !== pid) {
					continue;
				}
				gp++;
				sumPresent(playerTotals, row, playerKeys);
				for (const key of playerKeys) {
					if (typeof row[key] === "number") {
						const coverage = statSumsExtra[key] ?? { gp: 0, min: 0 };
						coverage.gp++;
						coverage.min += row.min ?? 0;
						statSumsExtra[key] = coverage;
					}
				}
				for (const stat of gameHighStats) {
					const raw = stat.slice(0, -3);
					const value = processPlayerStatsBasketball(row, [raw], "totals")[raw];
					if (
						typeof value === "number" &&
						(highs[stat] === undefined || value > highs[stat][0])
					) {
						highs[stat] = [value, game.gid, team.tid];
					}
				}
			}
		}
	}
	if (gp === 0) {
		return undefined;
	}
	playerTotals.gp = gp;
	const playerList = [...players.values()];
	const advanced = advancedDataComplete
		? calculateAdvancedStatsFromRawGameData(playerList, [...teams.values()])
		: undefined;
	const selected = playerList.flatMap((p, i) => (p.pid === pid ? [i] : []));
	if (advanced && selected.length > 0) {
		for (const [stat, values] of Object.entries(advanced)) {
			const present = selected.filter(
				(i) => typeof values[i] === "number" && Number.isFinite(values[i]),
			);
			if (present.length === 0) {
				continue;
			}
			if (weightByMinutes.has(stat)) {
				const min = present.reduce(
					(total, i) => total + (playerList[i]!.stats.min ?? 0),
					0,
				);
				if (min > 0) {
					playerTotals[stat] =
						present.reduce(
							(total, i) =>
								total + values[i]! * (playerList[i]!.stats.min ?? 0),
							0,
						) / min;
				}
			} else {
				playerTotals[stat] = present.reduce(
					(total, i) => total + values[i]!,
					0,
				);
			}
		}
	}
	const stats: Record<string, Record<string, any>> = {};
	for (const [type, table] of Object.entries(PLAYER_STATS_TABLES)) {
		const statType: PlayerStatType =
			type === "totals" ? "totals" : type === "per36" ? "per36" : "perGame";
		stats[type] = processPlayerStatsBasketball(
			{ ...playerTotals, ...highs },
			table.stats,
			statType,
			undefined,
			undefined,
			statSumsExtra,
		);
	}
	stats.per36 = processPlayerStatsBasketball(
		playerTotals,
		PLAYER_STATS_TABLES.regular!.stats,
		"per36",
		undefined,
		undefined,
		statSumsExtra,
	);
	stats.totals = processPlayerStatsBasketball(
		playerTotals,
		PLAYER_STATS_TABLES.regular!.stats,
		"totals",
		undefined,
		undefined,
		statSumsExtra,
	);
	return stats;
};

export const buildPlayerGameLogSummaries = (
	games: Game[],
	pid: number,
	series: Series[],
	oppAbbrevs: Record<number, string>,
): Summary[] => {
	const summaries: Summary[] = [];
	for (const [key, label, selected] of [
		[
			"regular",
			"Regular Season",
			games.filter(
				(game) => !game.playoffs && game.teams.every((team) => team.tid >= 0),
			),
		],
		["playoffs", "All Playoffs", games.filter((game) => game.playoffs)],
	] as const) {
		const stats = aggregatePlayerGames(selected, pid);
		summaries.push({ key, label, stats: stats ?? {} });
	}
	for (const item of series) {
		const selected = games.filter(
			(game) =>
				game.playoffs &&
				game.teams.some((t) => t.tid === item.tid) &&
				game.teams.some((t) => t.tid === item.oppTid) &&
				(!item.gids || item.gids.includes(game.gid)),
		);
		const stats = aggregatePlayerGames(selected, pid);
		if (stats) {
			summaries.push({
				key: item.key,
				label: `${item.label}${oppAbbrevs[item.oppTid] ?? "???"}`,
				record: `${item.result === "won" ? "Won " : item.result === "lost" ? "Lost " : "In progress "}${item.won}-${item.lost}`,
				stats,
			});
		}
	}
	return summaries;
};
