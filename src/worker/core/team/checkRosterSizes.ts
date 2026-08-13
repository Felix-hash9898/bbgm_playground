import { bySport, PLAYER, POSITION_COUNTS } from "../../../common/index.ts";
import { player, freeAgents, team } from "../index.ts";
import rosterAutoSort from "./rosterAutoSort.ts";
import { g, helpers, local } from "../../util/index.ts";
import type { MinimalPlayerRatings, Player } from "../../../common/types.ts";
import { KEY_POSITIONS_NEEDED } from "../freeAgents/getBest.ts";
import { isStandardContract } from "../contracts/contractTwoWay.ts";
import { isMinimumContractForPlayer } from "../contracts/contractMinimum.ts";
import { getContractException } from "../contracts/contractLimits.ts";
import {
	canOfferTwoWay,
	canTeamAddTwoWay,
} from "../contracts/contractTwoWay.ts";
import { applySigningTransaction } from "../signingTransaction.ts";
import { captureSigningContext } from "../capturedContext.ts";

export const dropPlayers = async (
	players: Player<MinimalPlayerRatings>[],
	numToDrop: number,
	context?: ReturnType<typeof captureSigningContext>,
) => {
	// Automatically drop lowest value players until we reach g.get("maxRosterSize")

	// Only drop player from a position there is an excess of (no dropping your only kicker)
	let counts;
	let countsHealthyKey;
	if (
		bySport({
			baseball: true,
			basketball: false,
			football: true,
			hockey: true,
		})
	) {
		counts = { ...POSITION_COUNTS };
		for (const pos of Object.keys(counts)) {
			counts[pos] = 0;
		}

		if (KEY_POSITIONS_NEEDED) {
			countsHealthyKey = {} as Record<string, number>;
			for (const pos of Object.keys(KEY_POSITIONS_NEEDED)) {
				countsHealthyKey[pos] = 0;
			}
		}

		for (const p of players) {
			const pos = p.ratings.at(-1)!.pos;

			if (counts[pos] !== undefined) {
				counts[pos] += 1;
			}

			if (
				countsHealthyKey?.[pos] !== undefined &&
				p.injury.gamesRemaining === 0
			) {
				countsHealthyKey[pos] += 1;
			}
		}

		let validPositions = [];
		for (const [pos, count] of Object.entries(counts)) {
			if (count > POSITION_COUNTS[pos]!) {
				validPositions.push(pos);
			}
		}

		// Should be impossible, but just in case, include all players except K/P
		if (validPositions.length === 0) {
			validPositions = Object.keys(POSITION_COUNTS).filter(
				(pos) => pos !== "K" && pos !== "P",
			);
		}
	}

	players.sort((a, b) => a.value - b.value); // Lowest first

	const releasedPIDs = [];
	for (const p of players) {
		if (
			counts &&
			bySport({
				baseball: true,
				basketball: false,
				football: true,
				hockey: true,
			})
		) {
			const pos = p.ratings.at(-1)!.pos;

			if (countsHealthyKey) {
				// If this is a key position and there is only one healthy player, keep the healthy player
				if (
					countsHealthyKey[pos]! <= (KEY_POSITIONS_NEEDED?.[pos] ?? 1) &&
					p.injury.gamesRemaining === 0
				) {
					continue;
				}
			}

			// Use 1 as fallback limit rather than POSITION_COUNTS[pos], just to be sure it's not some weird league where POSITION_COUNTS don't apply
			if (counts[pos]! <= (KEY_POSITIONS_NEEDED?.[pos] ?? 1)) {
				continue;
			}

			counts[pos]! -= 1;

			if (countsHealthyKey?.[pos] !== undefined) {
				countsHealthyKey[pos] -= 1;
			}
		}

		await player.release(p, false, context);
		releasedPIDs.push(p.pid);

		if (releasedPIDs.length >= numToDrop) {
			break;
		}
	}

	return releasedPIDs;
};

/**
 * Check roster size limits
 *
 * If any AI team is over the maximum roster size, cut their worst players.
 * If any AI team is under the minimum roster size, sign minimum contract
 * players until the limit is reached. If the user's team is breaking one of
 * these roster size limits, display a warning.
 *
 * @memberOf core.team
 * @return {Promise.?string} Resolves to null if there is no error, or a string with the error message otherwise.
 */
const checkRosterSizes = async (
	userOrOther: "user" | "other",
): Promise<string | undefined> => {
	const context = captureSigningContext();
	const teamInfoCache = g.get("teamInfoCache");
	const minFreeAgents: Player[] = [];
	let userTeamSizeError: string | undefined;

	const releasedPIDs: number[] = [];

	const checkRosterSize = async (tid: number, userTeamAndActive: boolean) => {
		const players = await context.cache.players.indexGetAll(
			"playersByTid",
			tid,
		);
		const standardPlayers = players.filter((p) =>
			isStandardContract(p.contract),
		);
		let numPlayersOnRoster = standardPlayers.length;

		if (numPlayersOnRoster > context.maxRosterSize) {
			if (userTeamAndActive) {
				if (context.userTids.length <= 1) {
					userTeamSizeError = "Your team has ";
				} else {
					userTeamSizeError = `The ${teamInfoCache[tid]?.region} ${
						teamInfoCache[tid]?.name
					} have `;
				}

				userTeamSizeError += `more than the maximum number of players (${context.maxRosterSize}). You must remove players (by <a href="${helpers.leagueUrl(
					["roster"],
				)}">releasing them from your roster</a> or through <a href="${helpers.leagueUrl(
					["trade"],
				)}">trades</a>) before continuing.`;
			} else {
				const releasedPIDsTemp = await dropPlayers(
					standardPlayers,
					numPlayersOnRoster - context.maxRosterSize,
					context,
				);
				releasedPIDs.push(...releasedPIDsTemp);
			}
		} else if (numPlayersOnRoster < context.minRosterSize) {
			if (userTeamAndActive) {
				if (context.userTids.length <= 1) {
					userTeamSizeError = "Your team has ";
				} else {
					userTeamSizeError = `The ${teamInfoCache[tid]?.region} ${
						teamInfoCache[tid]?.name
					} have `;
				}

				userTeamSizeError += `less than the minimum number of players (${context.minRosterSize}). You must add players (through <a href="${helpers.leagueUrl(
					["free_agents"],
				)}">free agency</a> or <a href="${helpers.leagueUrl([
					"trade",
				])}">trades</a>) before continuing.<br><br>Reminder: you can always sign free agents to ${helpers.formatCurrency(
					context.minContract / 1000,
					"M",
					2,
				)}/yr contracts, even if you're over the cap!`;
			} else {
				// Auto-add players
				while (numPlayersOnRoster < context.minRosterSize) {
					// See also core.phase
					let p = minFreeAgents.shift();

					if (!p) {
						p = await player.genRandomFreeAgent(context);
					}
					const contractToSign = p.contract;
					let expectedContractException: "capSpace" | "minimum" | undefined;
					if (
						contractToSign.type !== "twoWay" &&
						context.salaryCapType !== "none"
					) {
						const currentTeam = await context.cache.teams.get(tid);
						const payroll = await team.getPayroll(
							tid,
							undefined,
							context.cache,
						);
						const initialException = getContractException({
							birdException: false,
							contract: contractToSign,
							p,
							payroll,
							team: currentTeam,
						}).type;
						if (
							initialException !== "capSpace" &&
							initialException !== "minimum"
						) {
							throw new Error(
								"Roster repair requires cap space or the minimum exception",
							);
						}
						expectedContractException = initialException;
					}

					const signed = await applySigningTransaction({
						context,
						player: p,
						tid,
						contract: contractToSign,
						phase: context.phase,
						durability: "deferred",
						exceptionValidator:
							expectedContractException === undefined
								? undefined
								: {
										expected: expectedContractException,
										validate: async ({ player: currentPlayer }) => {
											const currentTeam = await context.cache.teams.get(tid);
											const payroll = await team.getPayroll(
												tid,
												undefined,
												context.cache,
											);
											const actual = getContractException({
												birdException: false,
												contract: contractToSign,
												p: currentPlayer,
												payroll,
												team: currentTeam,
											}).type;
											return actual === "capSpace" || actual === "minimum"
												? actual
												: undefined;
										},
									},
						revalidate: async ({ player: currentPlayer }) => {
							if (currentPlayer.tid !== PLAYER.FREE_AGENT) {
								throw new Error(
									"Player is no longer available for roster repair",
								);
							}
							const currentRoster = await context.cache.players.indexGetAll(
								"playersByTid",
								tid,
							);
							if (
								currentRoster.filter((rosterPlayer) =>
									isStandardContract(rosterPlayer.contract),
								).length >= context.maxRosterSize
							) {
								throw new Error("Team roster limit is no longer available");
							}
							if (contractToSign.type === "twoWay") {
								if (
									!canOfferTwoWay(currentPlayer) ||
									!canTeamAddTwoWay(currentRoster, tid)
								) {
									throw new Error("Two-way slot is no longer available");
								}
							}
						},
					});
					p = signed.player;
					numPlayersOnRoster += 1;
				}
			}
		}

		// Auto sort rosters (except player's team)
		// This will sort all AI rosters before every game. Excessive? It could change some times, but usually it won't
		const t = await context.cache.teams.get(tid);
		if (!userTeamAndActive || (t && t.keepRosterSorted)) {
			try {
				await rosterAutoSort(tid, undefined, undefined, context);
			} catch (error) {
				console.warn(
					"Core roster-size signing succeeded; roster refresh failed",
					error,
				);
			}
		}
	};

	const players = await context.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);

	// List of free agents looking for minimum contracts, sorted by value. This is used to bump teams up to the minimum roster size.
	for (const p of players) {
		if (
			isStandardContract(p.contract) &&
			isMinimumContractForPlayer(p, p.contract)
		) {
			minFreeAgents.push(p);
		}
	}

	minFreeAgents.sort((a, b) => b.value - a.value); // Make sure teams are all within the roster limits

	const teams = await context.cache.teams.getAll();
	for (const t of teams) {
		if (t.disabled) {
			continue;
		}

		const userTeamAndActive =
			context.userTids.includes(t.tid) &&
			!local.autoPlayUntil &&
			!context.spectator;

		if (
			(userTeamAndActive && userOrOther === "user") ||
			(!userTeamAndActive && userOrOther === "other")
		) {
			await checkRosterSize(t.tid, userTeamAndActive);
		}

		if (userTeamSizeError) {
			break;
		}
	}

	if (releasedPIDs.length > 0) {
		await freeAgents.normalizeContractDemands({
			type: "dummyExpiringContracts",
			pids: releasedPIDs,
			context,
		});
	}

	return userTeamSizeError;
};

export default checkRosterSizes;
