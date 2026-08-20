import { bySport, isSport, PHASE, POSITIONS } from "../../common/index.ts";
import { finances, season, team } from "../core/index.ts";
import { idb } from "../db/index.ts";
import { g, helpers, orderTeams } from "../util/index.ts";
import type {
	Player,
	UpdateEvents,
	ViewInput,
	TeamSeasonAttr,
} from "../../common/types.ts";
import { addMood } from "./freeAgents.ts";
import addFirstNameShort from "../util/addFirstNameShort.ts";
import { getActualPlayThroughInjuries } from "../core/game/loadTeams.ts";
import {
	getBasketballGameAvailability,
	getBasketballRotationPlayerInput,
	getBasketballRotationMinutes,
	getGameEffectiveBasketballMinutesWithStatus,
	getLeagueRotationOvrPercentiles,
} from "../core/team/basketballMinutes.ts";
import reconcileBasketballRotation from "../core/team/reconcileBasketballRotation.ts";

const sortByPos = (p: {
	ratings: {
		ovr: number;
		pos: string;
	};
}) => {
	const ind = POSITIONS.indexOf(p.ratings.pos);
	return (POSITIONS.length - ind) * 1000 + p.ratings.ovr;
};

const getStandingsInfo = async (info: { season: number; tid: number }) => {
	const teams = await idb.getCopies.teamsPlus(
		{
			attrs: ["tid"],
			seasonAttrs: [
				"won",
				"lost",
				"tied",
				"otl",
				"wonDiv",
				"lostDiv",
				"tiedDiv",
				"otlDiv",
				"wonConf",
				"lostConf",
				"tiedConf",
				"otlConf",
				"winp",
				"pts",
				"cid",
				"did",
			],
			stats: ["pts", "oppPts", "gp"],
			season: info.season,
			showNoStats: true,
		},
		"noCopyCache",
	);

	const cid = teams.find((t) => t.tid === info.tid)?.seasonAttrs.cid;

	const playoffsByConf = await season.getPlayoffsByConf(info.season);

	const confOrAllTeams = await orderTeams(
		teams.filter((t) => !playoffsByConf || t.seasonAttrs.cid === cid),
		teams,
	);

	const pointsFormula = g.get("pointsFormula", info.season);
	const usePts = pointsFormula !== "";

	const firstPlaceTeam = confOrAllTeams[0];

	if (firstPlaceTeam) {
		let rank = 1;
		for (const t of confOrAllTeams) {
			if (!playoffsByConf || t.seasonAttrs.cid === cid) {
				if (t.tid === info.tid) {
					return {
						gb: usePts
							? firstPlaceTeam.seasonAttrs.pts - t.seasonAttrs.pts
							: helpers.gb(firstPlaceTeam.seasonAttrs, t.seasonAttrs),
						playoffsByConf,
						rank,
						usePts,
					};
				}

				rank += 1;
			}
		}
	}

	return {
		gb: 0,
		playoffsByConf,
		rank: undefined,
		usePts,
	};
};

const updateRoster = async (
	inputs: ViewInput<"roster">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("gameAttributes") ||
		updateEvents.includes("playerMovement") ||
		updateEvents.includes("team") ||
		(inputs.season === g.get("season") &&
			(updateEvents.includes("gameSim") ||
				updateEvents.includes("newPhase"))) ||
		(updateEvents.includes("newPhase") && g.get("phase") === PHASE.PRESEASON) ||
		inputs.abbrev !== state.abbrev ||
		inputs.playoffs !== state.playoffs ||
		inputs.season !== state.season
	) {
		const stats = bySport({
			baseball: ["gp", "keyStats", "war"],
			basketball: ["gp", "min", "pts", "trb", "ast", "per"],
			football: ["gp", "keyStats", "av"],
			hockey: ["gp", "amin", "keyStats", "ops", "dps", "ps"],
		});

		const editable =
			inputs.season === g.get("season") &&
			inputs.tid === g.get("userTid") &&
			!g.get("spectator") &&
			isSport("basketball");
		if (editable) {
			await reconcileBasketballRotation([inputs.tid]);
		}

		const showRelease =
			inputs.season === g.get("season") &&
			inputs.tid === g.get("userTid") &&
			!g.get("spectator");

		const seasonAttrs: TeamSeasonAttr[] = [
			"profit",
			"won",
			"lost",
			"tied",
			"otl",
			"playoffRoundsWon",
			"imgURL",
			"region",
			"name",
			"avgAge",
			"note",
		];
		const t = await idb.getCopy.teamsPlus(
			{
				season: inputs.season,
				tid: inputs.tid,
				attrs: [
					"tid",
					"strategy",
					"region",
					"name",
					"keepRosterSorted",
					"playThroughInjuries",
					"basketballRotation",
				],
				seasonAttrs,
				stats: ["pts", "oppPts", "gp"],
				addDummySeason: true,
			},
			"noCopyCache",
		);

		if (!t) {
			const returnValue = {
				errorMessage: "Invalid team ID.",
			};
			return returnValue;
		}

		const attrs = [
			"pid",
			"tid",
			"draft",
			"firstName",
			"lastName",
			"age",
			"born",
			"contract",
			"cashOwed",
			"rosterOrder",
			"injury",
			"ptModifier",
			"targetMinutes",
			"usageBias",
			"watch",
			"untradable",
			"hof",
			"latestTransaction",
			"mood",
			"value",
			"valueNoPot",
			"awards",
			"form",
		]; // tid and draft are used for checking if a player can be released without paying his salary

		const ratings = [
			"ovr",
			"pot",
			"dovr",
			"dpot",
			"skills",
			"hgt",
			"fuzz",
			"pos",
			"ovrs",
			"endu",
			"drb",
			"pss",
			"oiq",
			"reb",
			"diq",
			"stre",
			"spd",
			"jmp",
			"tp",
		];
		const stats2 = [...stats, "yearsWithTeam", "jerseyNumber", "min", "gp"];

		let players: any[];
		let payroll: number | undefined;
		let luxuryTaxAmount: number | undefined;
		let minPayrollAmount: number | undefined;

		if (inputs.season === g.get("season")) {
			const schedule = await season.getSchedule();

			// Show players currently on the roster
			const playersAll = await addMood(
				await idb.cache.players.indexGetAll("playersByTid", inputs.tid),
			);
			payroll = await team.getPayroll(inputs.tid);
			luxuryTaxAmount = finances.getLuxuryTaxAmount(payroll) / 1000;
			minPayrollAmount = finances.getMinPayrollAmount(payroll) / 1000;
			payroll /= 1000;

			// numGamesRemaining doesn't need to be calculated except for userTid, but it is.
			let numGamesRemaining = 0;

			for (const matchup of schedule) {
				if (inputs.tid === matchup.homeTid || inputs.tid === matchup.awayTid) {
					numGamesRemaining += 1;
				}
			}

			players = await idb.getCopies.playersPlus(playersAll, {
				attrs,
				ratings,
				playoffs: inputs.playoffs === "playoffs",
				regularSeason: inputs.playoffs === "regularSeason",
				combined: inputs.playoffs === "combined",
				stats: stats2,
				season: inputs.season,
				tid: inputs.tid,
				showNoStats: true,
				showRookies: true,
				fuzz: true,
				numGamesRemaining,
			});

			if (isSport("basketball")) {
				players.sort((a, b) => a.rosterOrder - b.rosterOrder);
			} else {
				players.sort((a, b) => sortByPos(b) - sortByPos(a));
			}

			for (const p of players) {
				// Can alway release player, even if below the minimum roster limit, cause why not. Except in the playoffs.
				if (
					inputs.tid === g.get("userTid") &&
					(g.get("phase") !== PHASE.PLAYOFFS ||
						(g.get("phase") === PHASE.PLAYOFFS &&
							players.length > g.get("minRosterSize"))) &&
					!g.get("gameOver") &&
					!g.get("otherTeamsWantToHire") &&
					g.get("phase") !== PHASE.FANTASY_DRAFT &&
					g.get("phase") !== PHASE.EXPANSION_DRAFT
				) {
					p.canRelease = true;
				} else {
					p.canRelease = false;
				}

				// Convert ptModifier to string so it doesn't cause unneeded knockout re-rendering
				p.ptModifier = String(p.ptModifier);
				p.usageBias = String(p.usageBias ?? 1);
			}
		} else {
			// Show all players with stats for the given team and year
			const playersAll = await idb.getCopies.players(
				{
					activeSeason: inputs.season,
					statsTid: inputs.tid,
				},
				"noCopyCache",
			);
			players = await idb.getCopies.playersPlus(playersAll, {
				attrs,
				ratings,
				playoffs: inputs.playoffs === "playoffs",
				regularSeason: inputs.playoffs === "regularSeason",
				combined: inputs.playoffs === "combined",
				stats: stats2,
				season: inputs.season,
				tid: inputs.tid,
				fuzz: true,
			});

			if (isSport("basketball")) {
				players.sort(
					(a, b) => b.stats.gp * b.stats.min - a.stats.gp * a.stats.min,
				);
			} else {
				players.sort((a, b) => sortByPos(b) - sortByPos(a));
			}

			for (const p of players) {
				p.canRelease = false;
			}

			const teamSeason = await idb.getCopy.teamSeasons({
				season: inputs.season,
				tid: inputs.tid,
			});

			// >0 check handles old leagues that might have it undefined, and real players leagues that have a dummy negative value
			if (teamSeason && teamSeason.payrollEndOfSeason > 0) {
				payroll = teamSeason.payrollEndOfSeason / 1000;
				luxuryTaxAmount = teamSeason.expenses.luxuryTax / 1000;
				minPayrollAmount = teamSeason.expenses.minTax / 1000;
			}
		}

		const playoffsOvr =
			(g.get("phase") === PHASE.PLAYOFFS &&
				g.get("season") === inputs.season) ||
			inputs.playoffs === "playoffs";

		const { gb, playoffsByConf, rank, usePts } = await getStandingsInfo(inputs);

		const t2 = {
			...t,
			ovr: team.ovr(players, {
				playoffs: playoffsOvr,
			}),
			ovrCurrent: team.ovr(players, {
				accountForInjuredPlayers: {
					numDaysInFuture: 0,
					playThroughInjuries: getActualPlayThroughInjuries(t),
				},
				playoffs: playoffsOvr,
			}),
			roundsWonText: helpers.roundsWonText({
				playoffRoundsWon: t.seasonAttrs.playoffRoundsWon,
				numPlayoffRounds: g.get("numGamesPlayoffSeries", inputs.season).length,
				playoffsByConf: await season.getPlayoffsByConf(inputs.season),
			}),
			gb,
			rank,
		};
		t2.seasonAttrs.avgAge = t2.seasonAttrs.avgAge ?? team.avgAge(players);
		const leagueRotationOvrPercentiles =
			isSport("basketball") &&
			inputs.season === g.get("season") &&
			inputs.tid === g.get("userTid") &&
			!g.get("spectator") &&
			!g.get("challengeNoRatings")
				? getLeagueRotationOvrPercentiles(
						await idb.cache.players.indexGetAll("playersByTid", [0, Infinity]),
					)
				: undefined;

		const basketballMinutes =
			isSport("basketball") &&
			inputs.season === g.get("season") &&
			inputs.tid === g.get("userTid") &&
			!g.get("spectator")
				? (() => {
						const minutesPlayers = players.map((p) =>
							getBasketballRotationPlayerInput({
								pid: p.pid,
								rosterOrder: p.rosterOrder,
								ratings: p.ratings as unknown as Record<string, unknown>,
								challengeNoRatings: g.get("challengeNoRatings"),
								// playersPlus(..., fuzz: true) already applied the user
								// information policy. Do not fuzz these ratings again.
								useFuzzedRatings: false,
								ovrPercentile: leagueRotationOvrPercentiles?.get(p.pid),
							}),
						);
						const playoffs = g.get("phase") === PHASE.PLAYOFFS;
						const rotation = getBasketballRotationMinutes({
							rotation: t.basketballRotation,
							players: minutesPlayers,
							numPlayersOnCourt: g.get("numPlayersOnCourt"),
							playoffs,
						});
						const autoMinutes = getBasketballRotationMinutes({
							rotation: {
								version: 1,
								mode: "auto",
								rotationDepth: rotation.rotationDepth,
								coreReliance: rotation.coreReliance,
							},
							players: minutesPlayers,
							numPlayersOnCourt: g.get("numPlayersOnCourt"),
							playoffs,
						});

						let effective:
							| ReturnType<typeof getGameEffectiveBasketballMinutesWithStatus>
							| undefined;
						let unavailablePids: number[] = [];
						if (rotation.previewReady) {
							const playThroughInjuries =
								getActualPlayThroughInjuries(t)[playoffs ? 1 : 0];
							const available = getBasketballGameAvailability({
								players,
								playThroughInjuries,
								numPlayersOnCourt: g.get("numPlayersOnCourt"),
							});
							unavailablePids = players
								.filter((_, index) => !available[index])
								.map((p) => p.pid);
							const availableCount = available.filter(Boolean).length;
							if (availableCount >= g.get("numPlayersOnCourt")) {
								const regulationMinutes =
									g.get("quarterLength") * g.get("numPeriods");
								const previewTargetTotal =
									Object.values(rotation.minutesByPid).reduce(
										(total, value) => total + value,
										0,
									) *
									(regulationMinutes / 48);
								effective = getGameEffectiveBasketballMinutesWithStatus({
									players: minutesPlayers.map((p, index) => ({
										...p,
										available: available[index]!,
										value: g.get("challengeNoRatings")
											? undefined
											: players[index]!.valueNoPot,
									})),
									minutesByPid: rotation.minutesByPid,
									numPlayersOnCourt: g.get("numPlayersOnCourt"),
									regulationMinutes,
									targetTotalMinutes: previewTargetTotal,
									noInjuryMinutesIncreasePids:
										t.basketballRotation?.noInjuryMinutesIncreasePids ?? [],
									rotationDepth: rotation.rotationDepth,
									coreReliance: rotation.coreReliance,
									currentMinutesOverrideByPid:
										t.basketballRotation?.currentMinutesOverrideByPid,
									currentMinutesOverrideContext:
										t.basketballRotation?.currentMinutesOverrideContext,
								});
							}
						}

						return {
							...rotation,
							minutesByPid:
								rotation.baselineMinutesByPid ?? rotation.minutesByPid,
							healthyMinutesByPid: rotation.minutesByPid,
							autoMinutesByPid: autoMinutes.minutesByPid,
							effectiveMinutesByPid: effective?.minutesByPid,
							protectionOverridePids: effective?.protectionOverridePids ?? [],
							injuryMinutesAllocationError: effective?.allocationError,
							currentMinutesOverrideByPid:
								effective?.activeCurrentMinutesOverrideByPid,
							currentMinutesOverrideError:
								effective?.currentMinutesOverrideError,
							unavailablePids,
							required: 48 * g.get("numPlayersOnCourt"),
						};
					})()
				: undefined;

		for (const p of players) {
			p.awards = p.awards.filter(
				(award: Player["awards"][number]) => award.season === inputs.season,
			);
		}

		return {
			abbrev: inputs.abbrev,
			budget: g.get("budget"),
			basketballMinutes,
			challengeNoRatings: g.get("challengeNoRatings"),
			currentSeason: g.get("season"),
			editable,
			godMode: g.get("godMode"),
			salaryCapType: g.get("salaryCapType"),
			maxRosterSize: g.get("maxRosterSize"),
			numPlayersOnCourt: g.get("numPlayersOnCourt"),
			luxuryPayroll: g.get("luxuryPayroll") / 1000,
			luxuryTaxAmount,
			minPayroll: g.get("minPayroll") / 1000,
			minPayrollAmount,
			payroll,
			phase: g.get("phase"),
			playoffs: inputs.playoffs,
			playoffsByConf,
			players: addFirstNameShort(players),
			salaryCap: g.get("salaryCap") / 1000,
			season: inputs.season,
			showSpectatorWarning:
				inputs.season === g.get("season") &&
				inputs.tid === g.get("userTid") &&
				g.get("spectator"),
			showRelease,
			showTradeFor:
				inputs.season === g.get("season") &&
				inputs.tid !== g.get("userTid") &&
				!g.get("spectator"),
			showTradingBlock:
				inputs.season === g.get("season") &&
				inputs.tid === g.get("userTid") &&
				!g.get("spectator"),
			stats,
			t: t2,
			tid: inputs.tid,
			usePts,
			userTid: g.get("userTid"),
		};
	}
};

export default updateRoster;
