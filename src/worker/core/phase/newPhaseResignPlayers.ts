import {
	bySport,
	PHASE,
	PLAYER,
	POSITION_COUNTS,
} from "../../../common/index.ts";
import {
	contractNegotiation,
	draft,
	league,
	player,
	team,
	freeAgents,
} from "../index.ts";
import { helpers, local, logEvent } from "../../util/index.ts";
import type { Conditions, PhaseReturn } from "../../../common/types.ts";
import { orderBy } from "../../../common/utils.ts";
import { processContractOptions } from "../contracts/contractOptionDecisions.ts";
import { getContractException } from "../contracts/contractLimits.ts";
import { getContractCapHit } from "../contracts/contractMinimum.ts";
import { getTradeReputationByTid } from "../player/getTradeReputation.ts";
import {
	captureSigningContext,
	isCapturedContextActive,
} from "../capturedContext.ts";
import { applySigningTransaction } from "../signingTransaction.ts";
import reconcileBasketballRotation from "../team/reconcileBasketballRotation.ts";

export const FREE_AGENCY_DAYS = 30;

const newPhaseResignPlayers = async (
	conditions: Conditions,
): Promise<PhaseReturn> => {
	const signingContext = captureSigningContext();
	await processContractOptions();
	const tradeReputationByTid = await getTradeReputationByTid(
		signingContext.season,
		signingContext.cache,
	);
	const assertActive = () => {
		if (!isCapturedContextActive(signingContext)) {
			throw new Error(
				"Re-signing league context changed during phase operation",
			);
		}
	};
	assertActive();

	// In case some weird situation results in games still in the schedule, clear them
	await signingContext.cache.schedule.clear();

	// Clear any negotiations that still somehow exist, except if it's a re-signing negotiation for the user, because that could be from a prior failed attempt to run this function and we want to keep those guys. (Would rather have phase updates be transactional, but oh well.)
	const existingNegotiations = await signingContext.cache.negotiations.getAll();
	const userTids = signingContext.userTids;
	for (const negotiation of existingNegotiations) {
		if (negotiation.resigning && userTids.includes(negotiation.tid)) {
			continue;
		}

		assertActive();
		await signingContext.cache.negotiations.delete(negotiation.pid);
	}

	const repeatSeasonType = signingContext.repeatSeason?.type;

	// Reset contract demands of current free agents and undrafted players
	// KeyRange only works because PLAYER.UNDRAFTED is -2 and PLAYER.FREE_AGENT is -1
	const existingFreeAgents = await signingContext.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);
	const undraftedPlayers =
		!repeatSeasonType && !signingContext.forceHistoricalRosters
			? (
					await signingContext.cache.players.indexGetAll(
						"playersByDraftYearRetiredYear",
						[[signingContext.season], [signingContext.season, Infinity]],
					)
				).filter((p) => p.tid === PLAYER.UNDRAFTED)
			: [];

	for (const p of [...existingFreeAgents, ...undraftedPlayers]) {
		await player.addToFreeAgents(p, tradeReputationByTid);
		assertActive();
		await signingContext.cache.players.put(p);
	}

	// Re-sign players on user's team, and some AI players
	const players = await signingContext.cache.players.indexGetAll(
		"playersByTid",
		[0, Infinity],
	);

	// Figure out how many players are needed at each position, beyond who is already signed
	type PositionInfo = Record<
		string,
		{
			count: number;
			maxValue: number;
		}
	>;
	const positionInfoByTid = new Map<number, PositionInfo>();

	if (Object.keys(POSITION_COUNTS).length > 0) {
		for (let tid = 0; tid < signingContext.numTeams; tid++) {
			const positionInfo: PositionInfo = {};
			for (const [pos, count] of Object.entries(POSITION_COUNTS)) {
				positionInfo[pos] = {
					count,
					maxValue: 0,
				};
			}
			positionInfoByTid.set(tid, positionInfo);
		}

		for (const p of players) {
			// Only expiring contracts and hard cap rookies!
			if (p.contract.exp <= signingContext.season) {
				continue;
			}

			const positionInfo = positionInfoByTid.get(p.tid);
			const pos = p.ratings.at(-1)!.pos;

			if (positionInfo !== undefined && positionInfo[pos] !== undefined) {
				positionInfo[pos].count -= 1;
				if (p.value > positionInfo[pos].maxValue) {
					positionInfo[pos].maxValue = p.value;
				}
			}
		}
	}

	const payrollsByTid = new Map<number, number>();

	if (signingContext.salaryCapType === "hard") {
		for (let tid = 0; tid < signingContext.numTeams; tid++) {
			const payroll = await team.getPayroll(
				tid,
				undefined,
				signingContext.cache,
			);
			const expiringPayroll = players
				.filter((p) => p.tid === tid && p.contract.exp <= signingContext.season)
				.reduce((total, p) => total + p.contract.amount, 0);
			payrollsByTid.set(tid, payroll - expiringPayroll);
		}
	}

	const expiringPids = orderBy(
		players.filter((p) => p.contract.exp <= signingContext.season),
		[
			"tid",
			(p) => {
				return p.draft.year === signingContext.season ? 1 : -1;
			},
			"value",
		],
		["asc", "desc", "desc"],
	).map((p) => p.pid);

	const expiredRookieContractPids = new Set(
		players
			.filter(
				(p) =>
					p.contract.exp <= signingContext.season &&
					p.contract.rookie &&
					p.draft.year < signingContext.season,
			)
			.map((p) => p.pid),
	);

	await freeAgents.normalizeContractDemands({
		type: "includeExpiringContracts",
		context: signingContext,
	});

	for (const pid of expiringPids) {
		// Re-fetch players, because normalizeContractDemands might have changed some objects
		let p = await signingContext.cache.players.get(pid);
		if (!p) {
			continue;
		}

		if (expiredRookieContractPids.has(p.pid)) {
			p.contract.rookieResign = true;
		}

		const draftPick = p.draft.year === signingContext.season;

		if (draftPick && !signingContext.draftPickAutoContract) {
			p.contract.amount /= 2;

			if (p.contract.amount < signingContext.minContract) {
				p.contract.amount = signingContext.minContract;
			} else {
				p.contract.amount = helpers.roundContract(p.contract.amount);
			}

			p.contract.rookie = true;
		}

		if (
			signingContext.userTids.includes(p.tid) &&
			!local.autoPlayUntil &&
			!signingContext.spectator
		) {
			const tid = p.tid;
			const usageBiasBeforeFreeAgency =
				typeof p.usageBias === "number" &&
				Number.isFinite(p.usageBias) &&
				p.usageBias > 0
					? p.usageBias
					: 1;

			await player.addToFreeAgents(p, tradeReputationByTid);

			await signingContext.cache.players.put(p);
			const error = await contractNegotiation.create(
				p.pid,
				true,
				tid,
				signingContext,
				usageBiasBeforeFreeAgency,
			);

			if (error !== undefined && error) {
				logEvent(
					{
						type: "refuseToSign",
						text: error,
						pids: [p.pid],
						tids: [tid],
					},
					conditions,
				);
			}
		} else {
			let reSignPlayer = true;

			const contract = {
				...p.contract,
			};
			const payroll = payrollsByTid.get(p.tid);

			const positionInfo = positionInfoByTid.get(p.tid);
			const pos = p.ratings.at(-1)!.pos;

			if (signingContext.salaryCapType === "hard") {
				if (payroll === undefined) {
					throw new Error(
						"Payroll should always be defined if there is a hard cap",
					);
				}
				if (contract.amount + payroll > signingContext.salaryCap) {
					reSignPlayer = false;
				}

				// Don't go beyond roster needs by position
				if (
					bySport({
						baseball: true,
						basketball: false,
						football: true,
						hockey: true,
					}) &&
					positionInfo !== undefined &&
					positionInfo[pos] !== undefined &&
					positionInfo[pos].count <= 0 &&
					positionInfo[pos].maxValue > p.value
				) {
					reSignPlayer = false;
				}

				// Always sign rookies
				if (draftPick) {
					reSignPlayer = true;
				}
			}

			if (reSignPlayer) {
				const mood = await player.moodInfo(p, p.tid, {
					contractAmount: p.contract.amount,
				});
				assertActive();

				// Player must be willing to sign (includes draft picks and first year after expansion, from moodInfo)
				if (!mood.willing) {
					reSignPlayer = false;
				} else {
					// Is team better off without him?
					const dv = await team.valueChange(p.tid, [], [p.pid], [], []);
					assertActive();

					// Skip re-signing some low value players, otherwise teams fill up their rosters too readily
					const skipBadPlayer =
						contract.amount < signingContext.minContract * 2 &&
						Math.random() < 0.5;

					// More randomness if hard cap
					const whatever =
						signingContext.salaryCapType === "hard"
							? Math.random() > 0.1
							: true;

					if (
						draftPick ||
						(mood.willing && dv < 0 && !skipBadPlayer && whatever)
					) {
						const signingTid = p.tid;
						const signingContract = contract;
						let expectedContractException: "bird" | "capSpace" | undefined;
						if (signingContext.salaryCapType === "soft") {
							const currentTeam =
								await signingContext.cache.teams.get(signingTid);
							const currentPayroll = await team.getPayroll(
								signingTid,
								signingContext.season + 1,
								signingContext.cache,
							);
							const initialException = getContractException({
								birdException: true,
								contract: signingContract,
								p,
								payroll: currentPayroll,
								team: currentTeam,
							}).type;
							if (initialException !== "bird") {
								throw new Error("Bird exception is unavailable for re-signing");
							}
							expectedContractException = "bird";
						} else if (signingContext.salaryCapType === "hard") {
							const currentPayroll = await team.getPayroll(
								signingTid,
								signingContext.season + 1,
								signingContext.cache,
							);
							if (
								currentPayroll + getContractCapHit(signingContract) >
								signingContext.salaryCap
							) {
								throw new Error("Hard cap does not allow this re-signing");
							}
							expectedContractException = "capSpace";
						}
						const signed = await applySigningTransaction({
							context: signingContext,
							player: p,
							tid: signingTid,
							contract: signingContract,
							phase: PHASE.RESIGN_PLAYERS,
							durability: "deferred",
							exceptionValidator:
								expectedContractException === undefined
									? undefined
									: {
											expected: expectedContractException,
											validate: async ({ player: currentPlayer }) => {
												const currentPayroll = await team.getPayroll(
													signingTid,
													signingContext.season + 1,
													signingContext.cache,
												);
												if (signingContext.salaryCapType === "hard") {
													return currentPayroll +
														getContractCapHit(signingContract) <=
														signingContext.salaryCap
														? "capSpace"
														: undefined;
												}
												const currentTeam =
													await signingContext.cache.teams.get(signingTid);
												return getContractException({
													birdException: true,
													contract: signingContract,
													p: currentPlayer,
													payroll: currentPayroll,
													team: currentTeam,
												}).type;
											},
										},
							revalidate: async ({ player: currentPlayer }) => {
								if (currentPlayer.tid !== signingTid) {
									throw new Error(
										"Player is no longer available for re-signing",
									);
								}
								if (!(await signingContext.cache.teams.get(signingTid))) {
									throw new Error("Re-signing team is no longer available");
								}
							},
						});
						p = signed.player;

						if (positionInfo !== undefined && positionInfo[pos] !== undefined) {
							positionInfo[pos].count -= 1;
							if (p.value > positionInfo[pos].maxValue) {
								positionInfo[pos].maxValue = p.value;
							}
						}

						if (payroll !== undefined) {
							payrollsByTid.set(p.tid, contract.amount + payroll);
						}
					} else {
						reSignPlayer = false;
					}
				}
			}

			if (!reSignPlayer) {
				await player.addToFreeAgents(p, tradeReputationByTid);
			}

			// Delete rookieResign for AI players, since we're done re-signing them. Leave it for user players.
			if (expiredRookieContractPids.has(pid) || p.contract.rookieResign) {
				delete p.contract.rookieResign;
			}

			assertActive();
			await signingContext.cache.players.put(p);
		}
	}

	const draftProspects = await signingContext.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.UNDRAFTED,
	);

	if (repeatSeasonType === "players") {
		// Bump up age of draft prospects, so they stay the same
		for (const p of draftProspects) {
			p.draft.year += 1;
			p.born.year += 1;
			p.ratings.at(-1)!.season += 1;
			await player.updateValues(p, signingContext.cache, {
				captured: true,
				ovrMeanStd: signingContext.ovrMeanStd,
				repeatSeason: signingContext.repeatSeason,
				season: signingContext.season,
			});
			assertActive();
			await signingContext.cache.players.put(p);
		}
	} else {
		// Bump up future draft classes (not simultaneous so tid updates don't cause race conditions)
		for (const p of draftProspects) {
			if (p.draft.year !== signingContext.season + 1) {
				continue;
			}

			p.ratings[0].fuzz /= Math.sqrt(2);
			await player.develop(p, 0, false, undefined, false, signingContext); // Update skills/pot based on fuzz
			assertActive();

			await player.updateValues(p, signingContext.cache, {
				captured: true,
				ovrMeanStd: signingContext.ovrMeanStd,
				repeatSeason: signingContext.repeatSeason,
				season: signingContext.season,
			});
			assertActive();
			await signingContext.cache.players.put(p);
		}

		for (const p of draftProspects) {
			if (p.draft.year !== signingContext.season + 2) {
				continue;
			}

			p.ratings[0].fuzz /= Math.sqrt(2);
			await player.develop(p, 0, false, undefined, false, signingContext); // Update skills/pot based on fuzz
			assertActive();

			await player.updateValues(p, signingContext.cache, {
				captured: true,
				ovrMeanStd: signingContext.ovrMeanStd,
				repeatSeason: signingContext.repeatSeason,
				season: signingContext.season,
			});
			assertActive();
			await signingContext.cache.players.put(p);
		}

		// Generate a new draft class, while leaving existing players in that draft class in place
		assertActive();
		await draft.genPlayers(
			signingContext.season + 3,
			undefined,
			false,
			signingContext,
		);
	}

	// Delete any old undrafted players that still somehow exist
	const toRemove = [];
	for (const p of draftProspects) {
		if (p.draft.year <= signingContext.season) {
			toRemove.push(p.pid);
		}
	}
	for (const pid of toRemove) {
		assertActive();
		await signingContext.cache.players.delete(pid);
	}

	// Preserve league.setGameAttributes side effects (wrapped attribute, global
	// state, and gameAttributesToUI). The captured-context guard prevents this
	// global helper from running after a league switch.
	assertActive();
	await league.setGameAttributes({
		daysLeft: FREE_AGENCY_DAYS,
	});
	assertActive();
	await reconcileBasketballRotation(userTids, {
		cache: signingContext.cache,
		numPlayersOnCourt: signingContext.numPlayersOnCourt,
		playoffs: false,
		challengeNoRatings: signingContext.challengeNoRatings,
	});

	return {
		redirect: {
			url: helpers.leagueUrl(["negotiation"]),
			text: "Re-sign players",
		},
		updateEvents: ["playerMovement"],
	};
};

export default newPhaseResignPlayers;
