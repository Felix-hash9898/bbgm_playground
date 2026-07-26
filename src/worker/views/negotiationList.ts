import { PLAYER } from "../../common/index.ts";
import { player, team } from "../core/index.ts";
import { getPendingUserTeamOptions } from "../core/contracts/contractOptionDecisions.ts";
import { isStandardContract } from "../core/contracts/contractTwoWay.ts";
import { getNormalizedContractDemandResults } from "../core/freeAgents/normalizeContractDemands.ts";
import { idb } from "../db/index.ts";
import { g, helpers } from "../util/index.ts";
import addFirstNameShort from "../util/addFirstNameShort.ts";
import { addMood, freeAgentStats } from "./freeAgents.ts";

export const getNegotiationPids = async (tid: number) => {
	const negotiations = await idb.cache.negotiations.getAll();

	// Need to check tid for Multi Team Mode, might have other team's negotiations going on
	return new Set(
		negotiations
			.filter((negotiation) => negotiation.tid === tid)
			.map((negotiation) => negotiation.pid),
	);
};

const updateNegotiationList = async () => {
	const stats = ["yearsWithTeam", ...freeAgentStats];

	const userTid = g.get("userTid");

	const negotiationPids = await getNegotiationPids(userTid);
	// During re-signing, active negotiations are the authoritative list. Relying on
	// the free-agent index can miss players who should still appear here.
	const negotiationPlayers = (
		await Promise.all(
			[...negotiationPids].map((pid) => idb.cache.players.get(pid)),
		)
	).filter((p) => p !== undefined);

	const userPlayersAll = await idb.cache.players.indexGetAll(
		"playersByTid",
		userTid,
	);
	const playersAll = await addMood(negotiationPlayers);

	const players = addFirstNameShort(
		await idb.getCopies.playersPlus(playersAll, {
			attrs: [
				"pid",
				"firstName",
				"lastName",
				"age",
				"injury",
				"jerseyNumber",
				"watch",
				"contract",
				"draft",
				"latestTransaction",
				"latestTransactionSeason",
				"lastSalary",
				"mood",
			],
			ratings: ["ovr", "pot", "skills", "pos"],
			stats,
			season: g.get("season"),
			tid: userTid,
			showNoStats: true,
			fuzz: true,
		}),
	);
	const pendingTeamOptionsAll = await getPendingUserTeamOptions();
	const declinedTeamOptionsAll = pendingTeamOptionsAll.map((p) => {
		const p2 = helpers.deepCopy(p);
		delete p2.contract.option;
		p2.contract.exp = g.get("season");
		p2.salaries = (p2.salaries ?? []).filter(
			(salary) => salary.season <= p2.contract.exp,
		);
		return p2;
	});
	const projectedReSignDemands =
		declinedTeamOptionsAll.length === 0
			? undefined
			: await getNormalizedContractDemandResults({
					type: "includeExpiringContracts",
					pids: declinedTeamOptionsAll.map((p) => p.pid),
					playersAll: [
						...(await idb.cache.players.indexGetAll(
							"playersByTid",
							PLAYER.FREE_AGENT,
						)),
						...declinedTeamOptionsAll,
					],
				});
	const pendingTeamOptions = addFirstNameShort(
		await idb.getCopies.playersPlus(pendingTeamOptionsAll, {
			attrs: [
				"pid",
				"firstName",
				"lastName",
				"age",
				"contract",
				"injury",
				"jerseyNumber",
				"watch",
			],
			ratings: ["ovr", "pot", "skills", "pos"],
			stats,
			season: g.get("season"),
			tid: userTid,
			showNoStats: true,
			fuzz: true,
		}),
	);
	for (const p of pendingTeamOptions) {
		const pRaw = pendingTeamOptionsAll.find((p2) => p2.pid === p.pid);
		const projectedContract = projectedReSignDemands?.get(p.pid)?.contract;
		if (pRaw && projectedContract) {
			const pAfterDecline = helpers.deepCopy(pRaw);
			pAfterDecline.contract = helpers.deepCopy(projectedContract);
			pAfterDecline.tid = PLAYER.FREE_AGENT;
			pAfterDecline.numDaysFreeAgent = 0;
			const projectedMood = await player.moodInfo(pAfterDecline, userTid, {
				activeNegotiation: true,
			});
			p.projectedAsk = projectedMood.contractAmount / 1000;
			p.projectedWilling = projectedMood.willing;
		}
	}

	let sumContracts = 0;
	for (const p of players) {
		sumContracts += p.mood.user.contractAmount;
	}
	sumContracts /= 1000;

	const payroll = await team.getPayroll(userTid);
	const capSpace = (g.get("salaryCap") - payroll) / 1000;

	const userPlayers = await idb.getCopies.playersPlus(userPlayersAll, {
		attrs: [],
		ratings: ["pos"],
		stats: [],
		season: g.get("season"),
		showNoStats: true,
		showRookies: true,
	});

	return {
		capSpace,
		challengeNoRatings: g.get("challengeNoRatings"),
		draftPickAutoContract: g.get("draftPickAutoContract"),
		luxuryPayroll: g.get("luxuryPayroll") / 1000,
		salaryCapType: g.get("salaryCapType"),
		maxContract: g.get("maxContract"),
		minContract: g.get("minContract"),
		numRosterSpots:
			g.get("maxRosterSize") -
			userPlayersAll.filter((p) => isStandardContract(p.contract)).length,
		spectator: g.get("spectator"),
		payroll: payroll / 1000,
		pendingTeamOptions,
		players,
		season: g.get("season"),
		stats,
		sumContracts,
		userPlayers,
	};
};

export default updateNegotiationList;
