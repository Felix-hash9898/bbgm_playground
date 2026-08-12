import { useState } from "react";
import {
	bySport,
	isSport,
	PLAYER,
	WEBSITE_ROOT,
} from "../../../common/index.ts";
import {
	CountryFlag,
	HelpPopover,
	SafeHtml,
	MoreLinks,
	DataTable,
} from "../../components/index.tsx";
import useTitleBar from "../../hooks/useTitleBar.tsx";
import {
	confirm,
	getCols,
	helpers,
	logEvent,
	toWorker,
	useLocalPartial,
} from "../../util/index.ts";
import PlayingTime, { ptStyles } from "./PlayingTime.tsx";
import UsageBias, { usageBiasStyles } from "./UsageBias.tsx";
import TopStuff from "./TopStuff.tsx";
import type {
	GameAttributesLeague,
	Phase,
	View,
} from "../../../common/types.ts";
import {
	wrappedRosterContract,
	wrappedRosterContractTerms,
} from "../../components/contract.tsx";
import type {
	DataTableRow,
	SortBy,
} from "../../components/DataTable/index.tsx";
import { wrappedPlayerNameLabels } from "../../components/PlayerNameLabels.tsx";
import { dataTableWrappedMood } from "../../components/Mood.tsx";
import { wrappedRatingWithChange } from "../../components/RatingWithChange.tsx";
import type { BulkAction } from "../../components/DataTable/BulkActions.tsx";
import { groupByUnique } from "../../../common/utils.ts";
import { movePlayerPids, swapPlayerPids } from "./reorderPlayers.ts";
import { rosterCompactControlStyle } from "./compactControlStyle.ts";
import { useBasketballMinutesAutosave } from "./useBasketballMinutesAutosave.ts";

const saveBasketballMinutesPlan = (
	tid: number,
	minutesByPid: Record<number, number>,
) => toWorker("main", "updateBasketballMinutes", { tid, minutesByPid });

const resetBasketballMinutesPlan = (tid: number) =>
	toWorker("main", "resetPlayingTime", [tid]);

const reportBasketballMinutesError = (error: unknown) => {
	logEvent({
		type: "error",
		text: String(error),
		saveToDb: false,
	});
};

const handleRelease = async (
	p: View<"roster">["players"][number],
	phase: Phase,
	season: number,
	gender: GameAttributesLeague["gender"],
) => {
	const wasPlayerJustDrafted = helpers.justDrafted(p, phase, season);

	let releaseMessage;
	if (wasPlayerJustDrafted) {
		releaseMessage = `Are you sure you want to release ${p.firstName} ${
			p.lastName
		}? ${helpers.pronoun(
			gender,
			"He",
		)} will become a free agent and no longer take up a roster spot on your team. Because you just drafted ${helpers.pronoun(
			gender,
			"him",
		)} and the regular season has not started yet, you will not have to pay ${helpers.pronoun(
			gender,
			"his",
		)} contract.`;
	} else {
		releaseMessage = `Are you sure you want to release ${p.firstName} ${
			p.lastName
		}? ${helpers.pronoun(
			gender,
			"He",
		)} will become a free agent and no longer take up a roster spot on your team, but you will still have to pay ${helpers.pronoun(
			gender,
			"his",
		)} salary (and have it count against the salary cap) until ${helpers.pronoun(
			gender,
			"his",
		)} contract expires in ${p.contract.exp}.`;
	}

	const proceed = await confirm(releaseMessage, {
		okText: "Release player",
	});
	if (proceed) {
		const errorMsg = await toWorker("main", "releasePlayer", {
			pids: [p.pid],
		});
		if (errorMsg) {
			logEvent({
				type: "error",
				text: errorMsg,
				saveToDb: false,
			});
		}
	}
};

const Roster = ({
	abbrev,
	basketballMinutes,
	budget,
	challengeNoRatings,
	currentSeason,
	editable,
	godMode,
	luxuryPayroll,
	luxuryTaxAmount,
	maxRosterSize,
	minPayroll,
	minPayrollAmount,
	numPlayersOnCourt,
	payroll,
	phase,
	players,
	playoffs,
	playoffsByConf,
	salaryCap,
	salaryCapType,
	season,
	showSpectatorWarning,
	showRelease,
	showTradeFor,
	showTradingBlock,
	stats,
	t,
	tid,
	usePts,
	userTid,
}: View<"roster">) => {
	const [sortedPids, setSortedPids] = useState<number[] | undefined>(undefined);
	const [prevPlayers, setPrevPlayers] = useState(players);
	const { gender } = useLocalPartial(["gender"]);
	const {
		minutesDraft,
		plannedMinutesTotal,
		plannedMinutesValid,
		plannedMinutesChanged,
		minutesSaveStatus,
		autoResetPending,
		handleMinutesChange,
		handleAutoMinutes,
	} = useBasketballMinutesAutosave({
		basketballMinutes,
		players,
		editable,
		tid,
		saveCustomPlan: saveBasketballMinutesPlan,
		resetToAuto: resetBasketballMinutesPlan,
		onError: reportBasketballMinutesError,
	});

	useTitleBar({
		title: "Roster",
		dropdownView: "roster",
		dropdownFields: {
			teams: abbrev,
			seasons: season,
			playoffsCombined: playoffs,
		},
		moreInfoAbbrev: abbrev,
		moreInfoSeason: season,
		moreInfoTid: tid,
	});

	if (players !== prevPlayers) {
		setSortedPids(undefined);
		setPrevPlayers(players);
	}

	// Use the result of drag and drop to sort players, before the "official" order comes back as props
	let playersSorted: typeof players;
	if (sortedPids !== undefined) {
		const playersByPid = groupByUnique(players, "pid");
		playersSorted = sortedPids.map((pid) => playersByPid[pid]);
	} else {
		playersSorted = players;
	}

	const profit = t.seasonAttrs !== undefined ? t.seasonAttrs.profit : 0;

	const showMood = season === currentSeason;

	const cols = getCols(
		[
			"Name",
			"Pos",
			"Age",
			"Ovr",
			"Pot",
			...(isSport("basketball") && season === currentSeason ? ["Form"] : []),
			...(season === currentSeason ? ["Contract", "Terms"] : []),
			"stat:yearsWithTeam",
			"Country",
			...stats.map((stat) => `stat:${stat}`),
			...(editable ? ["PT"] : []),
			...(editable && isSport("basketball") && season === currentSeason
				? ["Usage"]
				: []),
			...(showMood ? ["Mood"] : []),
			...(showRelease ? ["Release"] : []),
			...(showTradeFor || showTradingBlock ? ["Trade"] : []),
			"Acquired",
		],
		{
			Country: {
				title: "",
				desc: "Country",
			},
			PT: {
				width: isSport("basketball") ? "56px" : undefined,
				titleReact: (
					<>
						{isSport("basketball") ? (
							<>
								Minutes{" "}
								<HelpPopover title="Planned minutes">
									<p>
										Dynamic rotations use this 48-minute plan as their target.
										Actual minutes can vary with fatigue, fouls, injuries,
										blowouts, overtime, and substitution timing.
									</p>
								</HelpPopover>
							</>
						) : (
							<>
								PT{" "}
								<HelpPopover title="Playing time modifier">
									<p>
										Your coach will divide up playing time based on ability and
										stamina. If you want to influence{" "}
										{helpers.pronoun(gender, "his")} judgement, your options
										are:
									</p>
									<p>
										<span style={ptStyles["0"]}>0 No Playing Time</span>
										<br />
										<span style={ptStyles["0.75"]}>- Less Playing Time</span>
										<br />
										<span style={ptStyles["1"]}>
											&nbsp;&nbsp;&nbsp; Let Coach Decide
										</span>
										<br />
										<span style={ptStyles["1.25"]}>+ More Playing Time</span>
										<br />
										<span style={ptStyles["1.5"]}>
											++ Even More Playing Time
										</span>
									</p>
								</HelpPopover>
							</>
						)}
					</>
				),
			},
			Usage: {
				titleReact: (
					<>
						Tendency{" "}
						<HelpPopover title="Shot Priority">
							<p>
								This adjusts how often a player is selected to finish
								possessions relative to teammates, without changing{" "}
								{helpers.pronoun(gender, "his")} underlying ratings or broader
								playmaking role.
							</p>
							<p>
								<span style={usageBiasStyles["0.85"]}>Low</span>
								<br />
								<span style={usageBiasStyles["1"]}>Normal</span>
								<br />
								<span style={usageBiasStyles["1.1"]}>High</span>
								<br />
								<span style={usageBiasStyles["1.25"]}>Featured</span>
							</p>
						</HelpPopover>
					</>
				),
				width: "70px",
			},
			Terms: {
				width: "7rem",
			},
			Mood: {
				titleReact: (
					<>
						Mood{" "}
						<HelpPopover title="Player mood">
							See{" "}
							<a
								href={`https://${WEBSITE_ROOT}/manual/player-mood/`}
								target="_blank"
							>
								the manual
							</a>{" "}
							for more info about player mood.
						</HelpPopover>
					</>
				),
			},
			Release: {
				titleReact: (
					<>
						Release{" "}
						<HelpPopover title="Release player">
							<p>
								To free up a roster spot, you can release a player from your
								team. You will still have to pay{" "}
								{helpers.pronoun(gender, "his")} salary (and have it count
								against the salary cap) until {helpers.pronoun(gender, "his")}{" "}
								contract expires (you can view your released players' contracts
								in your{" "}
								<a href={helpers.leagueUrl(["team_finances"])}>Team Finances</a>
								).
							</p>
							{salaryCapType === "soft" ? (
								<p>
									However, if you just drafted a player and the regular season
									has not started yet, {helpers.pronoun(gender, "his")} contract
									is not guaranteed and you can release{" "}
									{helpers.pronoun(gender, "him")} for free.
								</p>
							) : null}
						</HelpPopover>
					</>
				),
			},
		},
	);

	// Sort by pos for non-basketball sports
	const defaultSortCol = 1;

	const rows: DataTableRow[] = playersSorted.map((p, i) => {
		const showRatings = !challengeNoRatings || p.tid === PLAYER.RETIRED;

		return {
			key: p.pid,
			metadata: {
				type: "player",
				pid: p.pid,
				season,
				playoffs,
			},
			classNames: ({ isDragged, isFiltered, sortBys }) => ({
				separator:
					!isDragged &&
					(!isFiltered || !isSport("basketball")) &&
					(sortBys === undefined ||
						(!isSport("basketball") &&
							sortBys.length === 1 &&
							sortBys[0]![0] === defaultSortCol)) &&
					((isSport("basketball") &&
						i === numPlayersOnCourt - 1 &&
						season === currentSeason) ||
						(!isSport("basketball") &&
							playersSorted[i + 1] &&
							p.ratings.pos !== playersSorted[i + 1].ratings.pos)),
				"table-danger": p.hof,
				"table-info": p.tid === tid && season !== currentSeason,
			}),
			data: [
				wrappedPlayerNameLabels({
					pid: p.pid,
					injury: p.injury,
					jerseyNumber: p.stats.jerseyNumber,
					playoffsCombined: playoffs,
					season,
					skills: p.ratings.skills,
					defaultWatch: p.watch,
					firstName: p.firstName,
					firstNameShort: p.firstNameShort,
					lastName: p.lastName,
					awards: p.awards,
					neverShowCountry: true,
				}),
				p.ratings.pos,
				p.age,
				showRatings
					? wrappedRatingWithChange(p.ratings.ovr, p.ratings.dovr)
					: null,
				showRatings
					? wrappedRatingWithChange(p.ratings.pot, p.ratings.dpot)
					: null,
				...(isSport("basketball") && season === currentSeason
					? [
							(p as any).form != null
								? ((p as any).form as number).toFixed(1)
								: "0.0",
						]
					: []),
				...(season === currentSeason
					? [wrappedRosterContract(p), wrappedRosterContractTerms(p)]
					: []),
				playoffs === "playoffs" ? null : p.stats.yearsWithTeam,
				{
					value: (
						<>
							<a
								href={helpers.leagueUrl([
									"frivolities",
									"most",
									"country",
									window.encodeURIComponent(helpers.getCountry(p.born.loc)),
								])}
							>
								<CountryFlag country={p.born.loc} />
							</a>
						</>
					),
					sortValue: p.born.loc,
					searchValue: p.born.loc,
				},
				...stats.map((stat) => helpers.roundStat(p.stats[stat], stat)),
				...(editable
					? isSport("basketball")
						? [
								<input
									className="form-control form-control-sm"
									type="number"
									min={0}
									max={48}
									step={1}
									value={minutesDraft[p.pid] ?? ""}
									onChange={(event) =>
										handleMinutesChange(p.pid, event.target.value)
									}
									aria-label={`Planned minutes for ${p.firstName} ${p.lastName}`}
									style={{
										...rosterCompactControlStyle,
										width: "56px",
										minWidth: "56px",
										textAlign: "center",
									}}
								/>,
							]
						: [<PlayingTime p={p} userTid={userTid} godMode={godMode} />]
					: []),
				...(editable && isSport("basketball") && season === currentSeason
					? [<UsageBias p={p} userTid={userTid} />]
					: []),
				...(showMood
					? [
							dataTableWrappedMood({
								defaultType: "current",
								maxWidth: true,
								p,
								compact: true,
							}),
						]
					: []),
				...(showRelease
					? [
							<button
								className="btn btn-light-bordered btn-xs"
								disabled={!p.canRelease}
								onClick={() => handleRelease(p, phase, currentSeason, gender)}
							>
								Release
							</button>,
						]
					: []),
				...(showTradeFor || showTradingBlock
					? [
							<button
								className="btn btn-light-bordered btn-xs"
								disabled={p.untradable}
								onClick={() => {
									if (showTradeFor) {
										toWorker("actions", "tradeFor", { pid: p.pid });
									} else {
										toWorker("actions", "addToTradingBlock", {
											pids: [p.pid],
										});
									}
								}}
							>
								{showTradeFor ? "Trade for" : "Trade away"}
							</button>,
						]
					: []),
				{
					value: <SafeHtml dirty={p.latestTransaction} />,
					sortValue: p.latestTransaction,
					searchValue: p.latestTransaction,
				},
			],
		};
	});

	return (
		<>
			<MoreLinks
				type="team"
				page="roster"
				abbrev={abbrev}
				tid={tid}
				season={season}
			/>

			<TopStuff
				abbrev={abbrev}
				budget={budget}
				challengeNoRatings={challengeNoRatings}
				currentSeason={currentSeason}
				editable={editable}
				godMode={godMode}
				luxuryPayroll={luxuryPayroll}
				luxuryTaxAmount={luxuryTaxAmount}
				minPayroll={minPayroll}
				minPayrollAmount={minPayrollAmount}
				openRosterSpots={
					maxRosterSize -
					players.filter((p) => p.contract.type !== "twoWay").length
				}
				players={players}
				playoffsByConf={playoffsByConf}
				season={season}
				payroll={payroll}
				profit={profit}
				salaryCap={salaryCap}
				salaryCapType={salaryCapType}
				showTradeFor={showTradeFor}
				showTradingBlock={showTradingBlock}
				t={t}
				tid={tid}
				userTid={userTid}
				usePts={usePts}
			/>

			{showSpectatorWarning ? (
				<p className="alert alert-danger d-inline-block">
					The AI will handle roster management in spectator mode.
				</p>
			) : null}

			{editable && basketballMinutes ? (
				<div className="mb-3">
					<div className="d-flex flex-wrap align-items-center gap-2">
						<span className="fw-bold">
							{(basketballMinutes.mode === "auto" && !plannedMinutesChanged) ||
							autoResetPending
								? "Auto plan"
								: "Custom plan"}
						</span>
						<span
							className={plannedMinutesValid ? "text-success" : "text-danger"}
						>
							Total {plannedMinutesTotal} / {basketballMinutes.required}
						</span>
						{minutesSaveStatus === "saving" ? (
							<span className="text-body-secondary small">Saving…</span>
						) : minutesSaveStatus === "saved" ? (
							<span className="text-success small">Saved</span>
						) : null}
						<button
							className="btn btn-light-bordered btn-sm"
							onClick={handleAutoMinutes}
						>
							Auto Minutes
						</button>
					</div>
				</div>
			) : null}

			<DataTable
				cols={cols}
				defaultSort={bySport<SortBy | "disableSort">({
					basketball: "disableSort",
					default: [defaultSortCol, "asc"],
				})}
				defaultStickyCols={window.mobile ? 0 : isSport("basketball") ? 2 : 1}
				extraBulkActions={[
					...(showRelease
						? ([
								{
									onClick: async (selectedRows) => {
										const proceed = await confirm(
											`Are you sure you want to release ${helpers.numberWithCommas(selectedRows.map.size)} ${helpers.plural("player", selectedRows.map.size)}?`,
											{
												okText: helpers.plural(
													"Release player",
													selectedRows.map.size,
												),
											},
										);
										if (proceed) {
											const pids = Array.from(selectedRows.map.values())
												.filter((metadata) => metadata.type === "player")
												.map((metadata) => {
													return metadata.pid;
												});
											const errorMsg = await toWorker("main", "releasePlayer", {
												pids,
											});
											if (errorMsg) {
												logEvent({
													type: "error",
													text: errorMsg,
													saveToDb: false,
												});
											} else {
												// Clear because the selected players are no longer on this team!
												selectedRows.clear();
											}
										}
									},
									text: "Release",
									textLong: "Release players",
								},
							] as BulkAction[])
						: []),
					...(showTradeFor || showTradingBlock
						? ([
								{
									onClick: (selectedRows) => {
										let numUntradeable = 0;

										const playersByPid = groupByUnique(players, "pid");
										const pids = Array.from(selectedRows.map.values())
											.filter((metadata) => metadata.type === "player")
											.map((metadata) => {
												return metadata.pid;
											})
											.filter((pid) => {
												if (playersByPid[pid].untradable) {
													numUntradeable += 1;
													return false;
												}

												return true;
											});

										if (numUntradeable > 0) {
											logEvent({
												type: "error",
												text: `${numUntradeable} selected ${helpers.plural("player", numUntradeable)} ${helpers.plural("is", numUntradeable, "are")} currently untradeable!`,
												saveToDb: false,
											});
										}

										if (showTradeFor) {
											toWorker("actions", "tradeFor", {
												otherDpids: [],
												otherPids: pids,
												tid,
												userDpids: [],
												userPids: [],
											});
										} else {
											toWorker("actions", "addToTradingBlock", {
												pids,
											});
										}
									},
									text: showTradeFor ? "Trade for" : "Trade away",
									textLong: showTradeFor
										? "Trade for players"
										: "Trade away players",
								},
							] as BulkAction[])
						: []),
				]}
				name="Roster"
				rows={rows}
				hideAllControls={editable}
				nonfluid
				sortableRows={
					editable
						? {
								highlightHandle: ({ index }) => index < numPlayersOnCourt,
								onChange: async ({ oldIndex, newIndex }) => {
									if (oldIndex === newIndex) {
										return;
									}
									const newSortedPids = movePlayerPids(
										playersSorted,
										oldIndex,
										newIndex,
									);
									setSortedPids(newSortedPids);
									await toWorker("main", "reorderRosterDrag", newSortedPids);
								},
								onSwap: async (index1, index2) => {
									const newSortedPids = swapPlayerPids(
										playersSorted,
										index1,
										index2,
									);
									setSortedPids(newSortedPids);
									await toWorker("main", "reorderRosterDrag", newSortedPids);
								},
							}
						: undefined
				}
			/>
		</>
	);
};

export default Roster;
