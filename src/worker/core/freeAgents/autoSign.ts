import { isSport, PLAYER } from "../../../common/index.ts";
import { team } from "../index.ts";
import getBest from "./getBest.ts";
import { helpers, local, random } from "../../util/index.ts";
import { orderBy } from "../../../common/utils.ts";
import { getContractException } from "../contracts/contractLimits.ts";
import { isMinimumContractForPlayer } from "../contracts/contractMinimum.ts";
import {
	canOfferTwoWay,
	canTeamAddTwoWay,
	isStandardContract,
	makeTwoWayContract,
} from "../contracts/contractTwoWay.ts";
import { captureSigningContext } from "../capturedContext.ts";
import { applySigningTransaction } from "../signingTransaction.ts";

/**
 * AI teams sign free agents.
 *
 * Each team (in random order) will sign free agents up to their salary cap or roster size limit. This should eventually be made smarter
 *
 * @memberOf core.freeAgents
 * @return {Promise}
 */
const autoSign = async () => {
	const context = captureSigningContext();
	const players = await context.cache.players.indexGetAll(
		"playersByTid",
		PLAYER.FREE_AGENT,
	);

	if (players.length === 0) {
		return;
	}

	// List of free agents, sorted by value
	let playersSorted = orderBy(players, "value", "desc");

	// Randomly order teams
	const teams = await context.cache.teams.getAll();
	random.shuffle(teams);

	const completeSigning = async (
		p: (typeof players)[number],
		tid: number,
		teamMarker?: (typeof teams)[number],
		contract: (typeof players)[number]["contract"] = p.contract,
	) => {
		let expectedContractException:
			| "capSpace"
			| "bird"
			| "minimum"
			| "midLevel"
			| undefined;
		if (contract.type !== "twoWay" && context.salaryCapType !== "none") {
			const currentTeam = await context.cache.teams.get(tid);
			if (!currentTeam) {
				throw new Error("Signing team is no longer available");
			}
			const currentPayroll = await team.getPayroll(
				tid,
				undefined,
				context.cache,
			);
			expectedContractException = getContractException({
				birdException: false,
				contract,
				p,
				payroll: currentPayroll,
				team: currentTeam,
			}).type;
			if (
				expectedContractException === undefined ||
				(teamMarker && expectedContractException !== "midLevel")
			) {
				throw new Error(
					"Contract exception is unavailable before auto-signing",
				);
			}
		}
		const result = await applySigningTransaction({
			context,
			player: p,
			tid,
			contract,
			phase: context.phase,
			team: teamMarker,
			durability: "deferred",
			exceptionValidator:
				expectedContractException === undefined
					? undefined
					: {
							expected: expectedContractException,
							validate: async ({ player: currentPlayer }) => {
								const currentTeam = await context.cache.teams.get(tid);
								const currentPayroll = await team.getPayroll(
									tid,
									undefined,
									context.cache,
								);
								return getContractException({
									birdException: false,
									contract,
									p: currentPlayer,
									payroll: currentPayroll,
									team: currentTeam,
								}).type;
							},
						},
			revalidate: async ({ player: currentPlayer }) => {
				if (currentPlayer.tid !== PLAYER.FREE_AGENT) {
					throw new Error("Player is no longer available for auto-signing");
				}
				const currentRoster = await context.cache.players.indexGetAll(
					"playersByTid",
					tid,
				);
				if (!(await context.cache.teams.get(tid))) {
					throw new Error("Signing team is no longer available");
				}
				if (
					contract.type === "twoWay" &&
					(!canOfferTwoWay(currentPlayer) ||
						!canTeamAddTwoWay(currentRoster, tid))
				) {
					throw new Error("Two-way roster slot is no longer available");
				}
			},
		});
		try {
			await team.rosterAutoSort(tid, undefined, undefined, context);
		} catch (error) {
			console.warn(
				"Core auto-signing succeeded; post-signing roster refresh failed",
				error,
			);
		}
		return result.player;
	};

	for (const t of teams) {
		// Skip the user's team
		if (
			context.userTids.includes(t.tid) &&
			!local.autoPlayUntil &&
			!context.spectator
		) {
			continue;
		}

		if (t.disabled) {
			continue;
		}

		let probSkip;
		if (isSport("basketball")) {
			probSkip = t.strategy === "rebuilding" ? 0.9 : 0.75;
		} else {
			probSkip = 0.5;
		}

		// Skip teams sometimes
		if (Math.random() < probSkip) {
			continue;
		}

		let playersOnRoster = await context.cache.players.indexGetAll(
			"playersByTid",
			t.tid,
		);
		const standardPlayersOnRoster = playersOnRoster.filter((p) =>
			isStandardContract(p.contract),
		);

		// With forceHistoricalRosters, only sign FAs if we have to
		if (
			standardPlayersOnRoster.length >= context.minRosterSize &&
			context.forceHistoricalRosters
		) {
			continue;
		}

		// Ignore roster size, will drop bad player if necessary in checkRosterSizes, and getBest won't sign min contract player unless under the roster limit
		const payroll = await team.getPayroll(t.tid, undefined, context.cache);
		const p = getBest(playersOnRoster, playersSorted, payroll);
		if (p) {
			// Remove from list of free agents
			playersSorted = playersSorted.filter((p2) => p2 !== p);

			const signedPlayer = await completeSigning(p, t.tid);
			playersOnRoster = [...playersOnRoster, signedPlayer];
		}

		if (!p) {
			const pMidLevel = playersSorted.find((p2) => {
				if (isMinimumContractForPlayer(p2, p2.contract)) {
					return false;
				}

				return (
					getContractException({
						birdException: false,
						contract: p2.contract,
						p: p2,
						payroll,
						team: t,
					}).type === "midLevel"
				);
			});

			if (pMidLevel) {
				playersSorted = playersSorted.filter((p2) => p2 !== pMidLevel);
				const teamWithMLE = helpers.deepCopy(t);
				teamWithMLE.midLevelExceptionUsedSeason = context.mleSeason;
				const pMidLevelForSigning = helpers.deepCopy(pMidLevel);
				pMidLevelForSigning.contract.exception = "midLevel";
				const signedPlayer = await completeSigning(
					pMidLevelForSigning,
					t.tid,
					teamWithMLE,
					pMidLevelForSigning.contract,
				);
				playersOnRoster = [...playersOnRoster, signedPlayer];
			}
		}

		const standardPlayersOnRosterAfterStandardPass = playersOnRoster.filter(
			(p) => isStandardContract(p.contract),
		);
		if (
			standardPlayersOnRosterAfterStandardPass.length >=
				context.minRosterSize &&
			canTeamAddTwoWay(playersOnRoster, t.tid)
		) {
			const pTwoWay = playersSorted.find((p) => canOfferTwoWay(p));
			if (pTwoWay) {
				playersSorted = playersSorted.filter((p) => p !== pTwoWay);

				const signedPlayer = await completeSigning(
					pTwoWay,
					t.tid,
					undefined,
					makeTwoWayContract(),
				);
				playersOnRoster = [...playersOnRoster, signedPlayer];
			}
		}
	}
};

export default autoSign;
