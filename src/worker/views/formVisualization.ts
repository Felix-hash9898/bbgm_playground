import formatScoreWithShootout from "../../common/formatScoreWithShootout.ts";
import getWinner from "../../common/getWinner.ts";
import {
	isSport,
	PHASE,
	PLAYER,
	PLAYER_STATS_TABLES,
} from "../../common/index.ts";
import { orderBy } from "../../common/utils.ts";
import type { Game, UpdateEvents, ViewInput } from "../../common/types.ts";
import { idb } from "../db/index.ts";
import { calculateAdvancedStatsFromRawGameData } from "../util/advStats.basketball.ts";
import { g, helpers } from "../util/index.ts";

type PlayerOption = {
	label: string;
	name: string;
	pid: number;
};

const DEFAULT_METRIC = "form";
const ADVANCED_METRICS =
	PLAYER_STATS_TABLES.advanced?.stats.filter(
		(stat) => !["gp", "gs", "min"].includes(stat),
	) ?? [];
const METRIC_OPTIONS = [DEFAULT_METRIC, "gmsc", ...ADVANCED_METRICS];
const METRIC_OPTIONS_SET = new Set(METRIC_OPTIONS);
const TEAM_STAT_KEYS = [
	"gp",
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
	"oppFg",
	"oppFga",
	"oppTp",
	"oppTpa",
	"oppFt",
	"oppFta",
	"oppOrb",
	"oppDrb",
	"oppAst",
	"oppTov",
	"oppStl",
	"oppBlk",
	"oppPf",
	"oppPts",
] as const;
const PLAYER_STAT_KEYS = [
	"gp",
	"gs",
	"min",
	"fg",
	"fga",
	"tp",
	"tpa",
	"ft",
	"fta",
	"pm",
	"orb",
	"drb",
	"ast",
	"tov",
	"stl",
	"blk",
	"pf",
	"pts",
] as const;

type MetricKey = (typeof METRIC_OPTIONS)[number];

type WindowGame = {
	away: boolean;
	currentTeamTid: number;
	form: number;
	formIsEstimate: boolean;
	game: Game;
	gid: number;
	min: number;
	num: number;
	oppAbbrev: string;
	playoffs: boolean;
	result: string;
	row: any;
};

const getPlayers = async (season: number) => {
	let playersAll;
	if (g.get("season") === season && g.get("phase") <= PHASE.PLAYOFFS) {
		playersAll = await idb.cache.players.indexGetAll("playersByTid", [
			PLAYER.FREE_AGENT,
			Infinity,
		]);
	} else {
		playersAll = await idb.getCopies.players(
			{
				activeSeason: season,
			},
			"noCopyCache",
		);
	}

	const players = await idb.getCopies.playersPlus(playersAll, {
		attrs: ["pid", "firstName", "lastName", "tid"],
		ratings: ["pos"],
		stats: ["abbrev", "gp", "min", "tid"],
		season,
		statType: "totals",
		combined: true,
		mergeStats: "totOnly",
	});

	return players
		.sort((a, b) => {
			const aTid = a.stats.tid ?? a.tid;
			const bTid = b.stats.tid ?? b.tid;
			const aOnUser = aTid === g.get("userTid") ? 1 : 0;
			const bOnUser = bTid === g.get("userTid") ? 1 : 0;
			if (aOnUser !== bOnUser) {
				return bOnUser - aOnUser;
			}
			const aMin = a.stats.min ?? 0;
			const bMin = b.stats.min ?? 0;
			if (aMin !== bMin) {
				return bMin - aMin;
			}
			const lastNameCmp = a.lastName.localeCompare(b.lastName);
			if (lastNameCmp !== 0) {
				return lastNameCmp;
			}
			return a.firstName.localeCompare(b.firstName);
		})
		.map(
			(p): PlayerOption => ({
				label: `${Array.isArray(p.ratings) ? p.ratings.at(-1)?.pos : p.ratings.pos} ${p.firstName} ${p.lastName} (${p.stats.abbrev ?? g.get("teamInfoCache")[p.tid]?.abbrev ?? "FA"})`,
				name: `${p.firstName} ${p.lastName}`,
				pid: p.pid,
			}),
		);
};

const getMetricValue = (
	metric: MetricKey,
	windowGames: WindowGame[],
	currentTeamTid: number,
	pid: number,
) => {
	const playersByKey = new Map<string, any>();
	const teamsByTid = new Map<number, any>();

	for (const windowGame of windowGames) {
		for (const team of windowGame.game.teams) {
			let teamInfo = teamsByTid.get(team.tid);
			if (!teamInfo) {
				teamInfo = {
					tid: team.tid,
					stats: Object.fromEntries(TEAM_STAT_KEYS.map((key) => [key, 0])),
				};
				teamsByTid.set(team.tid, teamInfo);
			}

			for (const key of TEAM_STAT_KEYS) {
				teamInfo.stats[key] += team[key] ?? 0;
			}

			for (const p of team.players) {
				if ((p.gp ?? 0) <= 0 && (p.min ?? 0) <= 0) {
					continue;
				}

				const key = `${p.pid}_${team.tid}`;
				let playerInfo = playersByKey.get(key);
				if (!playerInfo) {
					playerInfo = {
						pid: p.pid,
						ratings: {
							pos: p.pos,
						},
						tid: team.tid,
						stats: Object.fromEntries(
							PLAYER_STAT_KEYS.map((stat) => [stat, 0]),
						),
					};
					playersByKey.set(key, playerInfo);
				}

				for (const stat of PLAYER_STAT_KEYS) {
					playerInfo.stats[stat] += p[stat] ?? 0;
				}
				playerInfo.stats.trb = playerInfo.stats.orb + playerInfo.stats.drb;
			}
		}
	}

	const players = [...playersByKey.values()];
	const teams = [...teamsByTid.values()];
	const advancedStats = calculateAdvancedStatsFromRawGameData(players, teams);

	if (!advancedStats) {
		return undefined;
	}

	const currentPlayer = players.find(
		(player) => player.pid === pid && player.tid === currentTeamTid,
	);
	if (!currentPlayer) {
		return undefined;
	}

	const currentIndex = players.indexOf(currentPlayer);
	if (currentIndex < 0) {
		return undefined;
	}

	if (metric === "ws") {
		return (
			(advancedStats.dws?.[currentIndex] ?? 0) +
			(advancedStats.ows?.[currentIndex] ?? 0)
		);
	}

	if (metric === "bpm") {
		return (
			(advancedStats.dbpm?.[currentIndex] ?? 0) +
			(advancedStats.obpm?.[currentIndex] ?? 0)
		);
	}

	if (metric === "tsp") {
		return helpers.percentage(
			currentPlayer.stats.pts,
			2 * (currentPlayer.stats.fga + 0.44 * currentPlayer.stats.fta),
		);
	}

	if (metric === "tpar") {
		return helpers.ratio(currentPlayer.stats.tpa, currentPlayer.stats.fga);
	}

	if (metric === "ftr") {
		return helpers.ratio(currentPlayer.stats.fta, currentPlayer.stats.fga);
	}

	if (metric === "tovp") {
		return helpers.percentage(
			currentPlayer.stats.tov,
			currentPlayer.stats.fga +
				0.44 * currentPlayer.stats.fta +
				currentPlayer.stats.tov,
		);
	}

	if (metric === "ws48") {
		const dws = advancedStats.dws?.[currentIndex] ?? 0;
		const ows = advancedStats.ows?.[currentIndex] ?? 0;
		return currentPlayer.stats.min > 0
			? ((dws + ows) * 48) / currentPlayer.stats.min
			: 0;
	}

	return (advancedStats as Record<string, number[] | undefined>)[metric]?.[
		currentIndex
	];
};

const updateFormVisualization = async (
	{
		metric,
		minMinutes,
		pid,
		season,
		windowSize,
	}: ViewInput<"formVisualization">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	const selectedMetric = METRIC_OPTIONS_SET.has(metric)
		? (metric as MetricKey)
		: DEFAULT_METRIC;

	if (!isSport("basketball")) {
		return {
			games: [],
			infoMessage:
				"Form visualization is currently only available in Basketball GM.",
			metric: selectedMetric,
			metricOptions: METRIC_OPTIONS,
			minMinutes,
			numEstimatedGames: 0,
			numExactGames: 0,
			pid,
			player: undefined,
			playerOptions: [],
			season,
			windowSize,
		};
	}

	if (
		updateEvents.includes("firstRun") ||
		(updateEvents.includes("gameSim") && season === g.get("season")) ||
		updateEvents.includes("playerMovement") ||
		state.metric !== selectedMetric ||
		state.minMinutes !== minMinutes ||
		state.pid !== pid ||
		state.season !== season ||
		state.windowSize !== windowSize
	) {
		const playerOptions = await getPlayers(season);
		const selectedPid = playerOptions.some((p) => p.pid === pid)
			? pid
			: playerOptions[0]?.pid;

		if (selectedPid === undefined) {
			return {
				games: [],
				infoMessage: "No saved box scores found for this season.",
				metric: selectedMetric,
				metricOptions: METRIC_OPTIONS,
				minMinutes,
				numEstimatedGames: 0,
				numExactGames: 0,
				pid: undefined,
				player: undefined,
				playerOptions,
				season,
				windowSize,
			};
		}

		const selectedPlayer = playerOptions.find((p) => p.pid === selectedPid)!;
		const gamesRaw = orderBy(
			await idb.getCopies.games({ season }, "noCopyCache"),
			"gid",
			"asc",
		);

		let cumulative = {
			ast: 0,
			drb: 0,
			min: 0,
			orb: 0,
			pts: 0,
			tov: 0,
		};
		let reconstructedForm = 0;

		const allPlayerGames: WindowGame[] = [];

		for (const game of gamesRaw) {
			let row = game.teams[0].players.find((p) => p.pid === selectedPid);
			let teamIndex: 0 | 1 = 0;
			if (!row) {
				row = game.teams[1].players.find((p) => p.pid === selectedPid);
				teamIndex = 1;
			}
			if (!row) {
				continue;
			}

			const otherIndex = teamIndex === 0 ? 1 : 0;
			const storedForm = typeof row.form === "number" ? row.form : undefined;

			cumulative.pts += row.pts ?? 0;
			cumulative.ast += row.ast ?? 0;
			cumulative.orb += row.orb ?? 0;
			cumulative.drb += row.drb ?? 0;
			cumulative.tov += row.tov ?? 0;
			cumulative.min += row.min ?? 0;

			if (storedForm !== undefined) {
				reconstructedForm = storedForm;
			} else if ((row.min ?? 0) > 5 && cumulative.min > 0) {
				const gameEff =
					(((row.pts ?? 0) +
						(row.ast ?? 0) * 1.5 +
						((row.orb ?? 0) + (row.drb ?? 0)) * 0.8 -
						(row.tov ?? 0) * 2) *
						36) /
					(row.min ?? 1);
				const seasonEff =
					((cumulative.pts +
						cumulative.ast * 1.5 +
						(cumulative.orb + cumulative.drb) * 0.8 -
						cumulative.tov * 2) *
						36) /
					cumulative.min;
				const delta = (gameEff - seasonEff) * 0.15;
				reconstructedForm = helpers.bound(
					reconstructedForm * 0.85 + delta,
					-10,
					10,
				);
			}

			const winner = getWinner(game.teams);
			const result =
				winner === teamIndex ? "W" : winner === otherIndex ? "L" : "T";
			const overtimeText = helpers.overtimeText(
				game.overtimes,
				game.numPeriods,
			);
			const overtimes = overtimeText === "" ? "" : ` (${overtimeText})`;
			const oppTid = game.teams[otherIndex].tid;
			const oppAbbrev =
				oppTid < 0 ? "ASG" : (g.get("teamInfoCache")[oppTid]?.abbrev ?? "???");

			allPlayerGames.push({
				away: teamIndex === 1,
				currentTeamTid: game.teams[teamIndex].tid,
				form: storedForm ?? reconstructedForm,
				formIsEstimate: storedForm === undefined,
				game,
				gid: game.gid,
				min: row.min ?? 0,
				num: 0,
				oppAbbrev,
				playoffs: !!game.playoffs,
				result: `${result} ${formatScoreWithShootout(
					game.teams[teamIndex],
					game.teams[otherIndex],
				)}${overtimes}`,
				row,
			});
		}

		if (allPlayerGames.length === 0) {
			return {
				games: [],
				infoMessage:
					"No saved box scores found for this player in this season.",
				metric: selectedMetric,
				metricOptions: METRIC_OPTIONS,
				minMinutes,
				numEstimatedGames: 0,
				numExactGames: 0,
				pid: selectedPid,
				player: selectedPlayer,
				playerOptions,
				season,
				windowSize,
			};
		}

		const eligiblePlayerGames = allPlayerGames.filter(
			(game) => game.min >= minMinutes,
		);

		if (eligiblePlayerGames.length === 0) {
			return {
				games: [],
				infoMessage: `No games meet the ${minMinutes}-minute filter for this player in this season.`,
				metric: selectedMetric,
				metricOptions: METRIC_OPTIONS,
				minMinutes,
				numEstimatedGames: 0,
				numExactGames: 0,
				pid: selectedPid,
				player: selectedPlayer,
				playerOptions,
				season,
				windowSize,
			};
		}

		const games = eligiblePlayerGames.map((game, index) => {
			const rawValue =
				selectedMetric === "form"
					? game.form
					: selectedMetric === "gmsc"
						? helpers.gameScore(game.row)
						: getMetricValue(
								selectedMetric,
								[game],
								game.currentTeamTid,
								selectedPid,
							);
			const windowGames = eligiblePlayerGames.slice(
				Math.max(0, index + 1 - windowSize),
				index + 1,
			);
			const displayValue =
				selectedMetric === "form"
					? windowGames.reduce(
							(sum, currentGame) => sum + currentGame.form,
							0,
						) / windowGames.length
					: selectedMetric === "gmsc"
						? windowGames.reduce(
								(sum, currentGame) => sum + helpers.gameScore(currentGame.row),
								0,
							) / windowGames.length
						: getMetricValue(
								selectedMetric,
								windowGames,
								game.currentTeamTid,
								selectedPid,
							);

			return {
				away: game.away,
				displayValue,
				formIsEstimate: game.formIsEstimate,
				game: game.game,
				gid: game.gid,
				min: game.min,
				num: index + 1,
				oppAbbrev: game.oppAbbrev,
				playoffs: game.playoffs,
				rawValue,
				result: game.result,
				windowSize: windowGames.length,
			};
		});

		const numEstimatedGames = games.filter(
			(game) => game.formIsEstimate,
		).length;
		const numExactGames = games.length - numEstimatedGames;

		return {
			games,
			infoMessage: undefined,
			metric: selectedMetric,
			metricOptions: METRIC_OPTIONS,
			minMinutes,
			numEstimatedGames,
			numExactGames,
			pid: selectedPid,
			player: selectedPlayer,
			playerOptions,
			season,
			windowSize,
		};
	}
};

export default updateFormVisualization;
