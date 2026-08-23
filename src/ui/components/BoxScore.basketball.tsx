import ResponsiveTableWrapper from "./ResponsiveTableWrapper.tsx";
import SafeHtml from "../components/SafeHtml.tsx";
import { getCols, helpers } from "../util/index.ts";
import { sortByStats, StatsHeader } from "./BoxScore.football.tsx";
import { type MouseEvent, useState } from "react";
import type { SortBy } from "./DataTable/index.tsx";
import updateSortBys from "./DataTable/updateSortBys.ts";
import getBPMImpactSortValue from "../../common/getBPMImpactSortValue.ts";
import BOX_SCORE_STATS from "../../common/boxScoreStats.basketball.ts";

const shotAttemptStat = {
	fg: "fga",
	fgAtRim: "fgaAtRim",
	fgLowPost: "fgaLowPost",
	fgMidRange: "fgaMidRange",
	ft: "fta",
	tp: "tpa",
} as const;

type ShotStat = keyof typeof shotAttemptStat;

const formatMadeAttempts = (row: any, stat: ShotStat) => {
	const attempts = row[shotAttemptStat[stat]];
	return typeof row[stat] === "number" && typeof attempts === "number"
		? `${row[stat]}-${attempts}`
		: undefined;
};

const formatPercentage = (row: any, stat: ShotStat, percentageStat: string) => {
	const attempts = row[shotAttemptStat[stat]];
	return typeof row[stat] === "number" && typeof attempts === "number"
		? `${helpers.roundStat((100 * row[stat]) / attempts, percentageStat)}%`
		: undefined;
};

const StatsTable = ({
	Row,
	allowPlayoffsToggle,
	exhibition,
	forceRowUpdate,
	liveGameInProgress,
	numPlayersOnCourt,
	playoffsCombined,
	season,
	showBPMI,
	t,
}: {
	Row: any;
	allowPlayoffsToggle?: boolean;
	exhibition?: boolean;
	forceRowUpdate: boolean;
	liveGameInProgress: boolean;
	numPlayersOnCourt: number;
	playoffsCombined?: "regularSeason" | "playoffs" | "combined";
	season: number;
	showBPMI: boolean;
	t: any;
}) => {
	const [sortBys, setSortBys] = useState<SortBy[]>([]);

	const onClick = (event: MouseEvent, i: number) => {
		setSortBys((prevSortBys) => {
			const newSortBys =
				updateSortBys({
					cols,
					event,
					i,
					prevSortBys,
				}) ?? [];

			if (
				newSortBys.length === 1 &&
				prevSortBys.length === 1 &&
				newSortBys[0]![0] === prevSortBys[0]![0] &&
				newSortBys[0]![1] === "desc"
			) {
				// User just clicked twice on the same column. Reset sort.
				return [];
			}

			return newSortBys;
		});
	};

	const stats = BOX_SCORE_STATS.filter(
		(stat) => showBPMI || stat !== "bpmImpact",
	);
	const cols = getCols(
		stats.map((stat) => `stat:${stat}`),
		{
			"stat:fg": {
				desc: "Field Goals",
			},
			"stat:fgAtRim": {
				desc: "At Rim Field Goals (Made-Attempted)",
				title: "Rim",
			},
			"stat:fgLowPost": {
				desc: "Low Post Field Goals (Made-Attempted)",
				title: "Post",
			},
			"stat:fgMidRange": {
				desc: "Mid-Range Field Goals (Made-Attempted)",
				title: "Mid",
			},
			"stat:tp": {
				desc: "Three Pointers (Made-Attempted)",
			},
			"stat:ft": {
				desc: "Free Throws",
			},
			"stat:trb": {
				desc: "Total Rebounds",
			},
		},
	);
	const footerValues: Partial<
		Record<(typeof BOX_SCORE_STATS)[number], number | string | undefined>
	> = {
		min: Number.isInteger(t.min) ? t.min : t.min.toFixed(1),
		fg: formatMadeAttempts(t, "fg"),
		ft: formatMadeAttempts(t, "ft"),
		fgAtRim: formatMadeAttempts(t, "fgAtRim"),
		fgLowPost: formatMadeAttempts(t, "fgLowPost"),
		fgMidRange: formatMadeAttempts(t, "fgMidRange"),
		tp: formatMadeAttempts(t, "tp"),
		orb: t.orb,
		trb: t.drb + t.orb,
		ast: t.ast,
		tov: t.tov,
		stl: t.stl,
		blk: t.blk,
		ba: t.ba,
		pf: t.pf,
		pts: t.pts,
	};
	const percentageValues: Partial<
		Record<(typeof BOX_SCORE_STATS)[number], string | undefined>
	> = {
		fg: formatPercentage(t, "fg", "fgp"),
		ft: formatPercentage(t, "ft", "ftp"),
		fgAtRim: formatPercentage(t, "fgAtRim", "fgpAtRim"),
		fgLowPost: formatPercentage(t, "fgLowPost", "fgpLowPost"),
		fgMidRange: formatPercentage(t, "fgMidRange", "fgpMidRange"),
		tp: formatPercentage(t, "tp", "tpp"),
	};

	// This is used for two purposes - keeping injured/DNP at the bottom while sorting, and also sorting in general for live sim (was too hard to account for this stuff in default sort from backend)
	const playersActiveOrPlayed = [];
	const playersInjuredOrDNP = [];
	for (let i = 0; i < t.players.length; i++) {
		const p = t.players[i];
		let addToHealthy;
		if (liveGameInProgress) {
			addToHealthy =
				p.injury.gamesRemaining === 0 || p.min > 0 || p.injury.playingThrough;
		} else {
			addToHealthy = p.min > 0;
		}

		if (addToHealthy) {
			playersActiveOrPlayed.push(p);
		} else {
			playersInjuredOrDNP.push(p);
		}
	}

	if (sortBys.length > 0) {
		playersActiveOrPlayed.sort(
			sortByStats(stats, undefined, sortBys, (p, stat) => {
				if (stat === "trb") {
					return p.orb + p.drb;
				}

				if (stat === "gmsc") {
					return helpers.gameScore(p);
				}

				if (stat === "bpmImpact") {
					return getBPMImpactSortValue(p);
				}

				if (Object.hasOwn(shotAttemptStat, stat)) {
					const shotStat = stat as ShotStat;
					const attempts = p[shotAttemptStat[shotStat]];
					if (typeof p[shotStat] !== "number" || typeof attempts !== "number") {
						return -Infinity;
					}

					// Sort by FGM, FGM/FGA (+1 for divide by 0 and so 100% doesn't roll over), and # attempts (lower is better)
					return (
						p[shotStat] +
						p[shotStat] / (attempts + 1) +
						(1000 - attempts) / 1000
					);
				}

				if (stat === "formTot") {
					return (p.form ?? 0) + (p.gameForm ?? 0);
				}

				return p[stat];
			}),
		);
	}

	const allStarGame = t.tid === -1 || t.tid === -2;
	const players = [...playersActiveOrPlayed, ...playersInjuredOrDNP];

	return (
		<ResponsiveTableWrapper>
			<table className="table table-striped table-borderless table-sm table-hover">
				<thead>
					<tr>
						<th>Name</th>
						{typeof t.players[0].abbrev === "string" ? <th>Team</th> : null}
						<th>Pos</th>
						<StatsHeader
							cols={cols}
							onClick={onClick}
							sortBys={sortBys}
							sortable={t.players.length > 1}
						/>
					</tr>
				</thead>
				<tbody>
					{players.map((p, i) => (
						<Row
							allStarGame={allStarGame}
							key={p.pid}
							allowPlayoffsToggle={allowPlayoffsToggle}
							exhibition={exhibition}
							lastStarter={sortBys.length === 0 && i + 1 === numPlayersOnCourt}
							liveGameInProgress={liveGameInProgress}
							p={p}
							playoffsCombined={playoffsCombined}
							forceUpdate={forceRowUpdate}
							season={season}
							stats={stats}
						/>
					))}
				</tbody>
				<tfoot>
					<tr>
						<th>Total</th>
						<th />
						{typeof t.players[0].abbrev === "string" ? <th /> : null}
						{stats.map((stat) => (
							<th key={stat}>{footerValues[stat]}</th>
						))}
					</tr>
					<tr>
						<th>Percentages</th>
						<th />
						{typeof t.players[0].abbrev === "string" ? <th /> : null}
						{stats.map((stat) => (
							<th key={stat}>{percentageValues[stat]}</th>
						))}
					</tr>
				</tfoot>
			</table>
		</ResponsiveTableWrapper>
	);
};

const BoxScore = ({
	boxScore,
	Row,
	forceRowUpdate,
}: {
	boxScore: any;
	Row: any;
	forceRowUpdate: boolean;
}) => {
	// Historical games will have boxScore.won.name and boxScore.lost.name so use that for ordering, but live games
	// won't. This is hacky, because the existence of this property is just a historical coincidence, and maybe it'll
	// change in the future.
	const liveGameSim = boxScore.won?.name === undefined;
	const liveGameInProgress = liveGameSim && !boxScore.gameOver;
	const showBPMI = !liveGameSim;

	return (
		<>
			{boxScore.teams.map((t: any, i: number) => {
				return (
					<div
						key={t.abbrev}
						className="mb-3"
						id={i === 0 ? "scroll-team-1" : "scroll-team-2"}
						style={{
							scrollMarginTop: 136,
						}}
					>
						<h2>
							{t.tid >= 0 ? (
								<a
									href={helpers.leagueUrl([
										"roster",
										`${t.abbrev}_${t.tid}`,
										boxScore.season,
									])}
								>
									{t.season !== undefined ? `${t.season} ` : null}
									{t.region} {t.name}
								</a>
							) : (
								<>
									{t.season !== undefined ? `${t.season} ` : null}
									{t.region} {t.name}
								</>
							)}
						</h2>
						<StatsTable
							Row={Row}
							allowPlayoffsToggle={!boxScore.exhibition}
							exhibition={boxScore.exhibition}
							forceRowUpdate={forceRowUpdate}
							liveGameInProgress={liveGameInProgress}
							numPlayersOnCourt={boxScore.numPlayersOnCourt ?? 5}
							playoffsCombined={
								boxScore.playoffs ? "playoffs" : "regularSeason"
							}
							season={boxScore.season}
							showBPMI={showBPMI}
							t={t}
						/>
					</div>
				);
			})}
			{boxScore.gameOver !== false &&
			boxScore.clutchPlays &&
			boxScore.clutchPlays.length > 0
				? boxScore.clutchPlays.map((text: string, i: number) => (
						<p key={i}>
							<SafeHtml dirty={text} />
						</p>
					))
				: null}
		</>
	);
};

export default BoxScore;
