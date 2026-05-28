import formatScoreWithShootout from "../../common/formatScoreWithShootout.ts";
import getWinner from "../../common/getWinner.ts";
import { isSport, PHASE, PLAYER } from "../../common/index.ts";
import { orderBy } from "../../common/utils.ts";
import type { UpdateEvents, ViewInput } from "../../common/types.ts";
import { idb } from "../db/index.ts";
import { g, helpers, processPlayerStats } from "../util/index.ts";

type PlayerOption = {
	label: string;
	name: string;
	pid: number;
};

const DEFAULT_METRIC = "pts";
const METRIC_OPTIONS = [
	"min",
	"pts",
	"trb",
	"ast",
	"stl",
	"blk",
	"tov",
	"pf",
	"pm",
	"fg",
	"fga",
	"fgp",
	"tp",
	"tpa",
	"tpp",
	"ft",
	"fta",
	"ftp",
	"2p",
	"2pa",
	"2pp",
	"orb",
	"drb",
	"ba",
	"efg",
	"tsp",
	"gmsc",
	"fgAtRim",
	"fgaAtRim",
	"fgpAtRim",
	"fgLowPost",
	"fgaLowPost",
	"fgpLowPost",
	"fgMidRange",
	"fgaMidRange",
	"fgpMidRange",
] as const;
const METRIC_OPTIONS_SET = new Set<string>(METRIC_OPTIONS);
const RAW_STATS_TO_SUM = [
	"gp",
	"gs",
	"min",
	"fg",
	"fga",
	"fgAtRim",
	"fgaAtRim",
	"fgLowPost",
	"fgaLowPost",
	"fgMidRange",
	"fgaMidRange",
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
	"ba",
	"pf",
	"pts",
] as const;

type MetricKey = (typeof METRIC_OPTIONS)[number];

type GameRow = {
	away: boolean;
	gid: number;
	min: number;
	num: number;
	oppAbbrev: string;
	playoffs: boolean;
	processed: Record<string, number | undefined>;
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

const getWindowProcessedStats = (windowGames: GameRow[], metric: MetricKey) => {
	const totals = Object.fromEntries(
		RAW_STATS_TO_SUM.map((stat) => [stat, 0]),
	) as Record<string, number>;

	for (const game of windowGames) {
		for (const stat of RAW_STATS_TO_SUM) {
			totals[stat] += game.row[stat] ?? 0;
		}
	}

	totals.gp = windowGames.length;

	return processPlayerStats(totals as any, [metric], "perGame")[metric];
};

const updateStatsVisualization = async (
	{
		metric,
		minMinutes,
		pid,
		season,
		windowSize,
	}: ViewInput<"statsVisualization">,
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
				"Stats visualization is currently only available in Basketball GM.",
			metric: selectedMetric,
			metricOptions: METRIC_OPTIONS,
			minMinutes,
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

		const allPlayerGames: GameRow[] = [];

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
				gid: game.gid,
				min: row.min ?? 0,
				num: 0,
				oppAbbrev,
				playoffs: !!game.playoffs,
				processed: processPlayerStats(
					row,
					[...METRIC_OPTIONS] as MetricKey[],
					"perGame",
				),
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
				pid: selectedPid,
				player: selectedPlayer,
				playerOptions,
				season,
				windowSize,
			};
		}

		const games = eligiblePlayerGames.map((game, index) => {
			const windowGames = eligiblePlayerGames.slice(
				Math.max(0, index + 1 - windowSize),
				index + 1,
			);

			return {
				away: game.away,
				displayValue: getWindowProcessedStats(windowGames, selectedMetric),
				gid: game.gid,
				min: game.min,
				num: index + 1,
				oppAbbrev: game.oppAbbrev,
				playoffs: game.playoffs,
				rawValue: game.processed[selectedMetric],
				result: game.result,
				windowSize: windowGames.length,
			};
		});

		return {
			games,
			infoMessage: undefined,
			metric: selectedMetric,
			metricOptions: METRIC_OPTIONS,
			minMinutes,
			pid: selectedPid,
			player: selectedPlayer,
			playerOptions,
			season,
			windowSize,
		};
	}
};

export default updateStatsVisualization;
