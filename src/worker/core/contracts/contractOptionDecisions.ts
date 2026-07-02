import { PLAYER, isSport } from "../../../common/index.ts";
import type { Player } from "../../../common/types.ts";
import { idb } from "../../db/index.ts";
import { g, helpers, logEvent, toUI } from "../../util/index.ts";
import contractNegotiationCreate from "../contractNegotiation/create.ts";
import normalizeContractDemands from "../freeAgents/normalizeContractDemands.ts";
import {
	getContractDemandResults,
	type ContractDemandTeam,
} from "../freeAgents/contractDemands.ts";
import playerAddToFreeAgents from "../player/addToFreeAgents.ts";
import teamGetContracts from "../team/getContracts.ts";
import teamGetPayroll from "../team/getPayroll.ts";
import {
	getEffectiveOfferAmount,
	shouldExercisePlayerOption,
	shouldExerciseTeamOption,
} from "./contractOption.ts";

const isOptionDecisionSeason = (p: Player) =>
	p.tid >= 0 &&
	p.contract.option !== undefined &&
	p.contract.exp === g.get("season") + 1;

const isManualUserTeamOption = (tid: number) =>
	!g.get("spectator") && g.get("userTids").includes(tid);

export const getPendingUserTeamOptions = async () => {
	if (!isSport("basketball")) {
		return [];
	}

	const players = await idb.cache.players.indexGetAll("playersByTid", [
		0,
		Infinity,
	]);

	return players.filter(
		(p) =>
			isOptionDecisionSeason(p) &&
			p.contract.option === "team" &&
			isManualUserTeamOption(p.tid),
	);
};

export const hasPendingUserTeamOptions = async () =>
	(await getPendingUserTeamOptions()).length > 0;

export const getOptionMarketDemands = async (optionPlayers: Player[]) => {
	const optionPids = new Set(optionPlayers.map((p) => p.pid));
	const playersAll = helpers.deepCopy(
		await idb.cache.players.indexGetAll("playersByTid", [
			PLAYER.FREE_AGENT,
			Infinity,
		]),
	);

	const optionPlayerByPid = new Map(optionPlayers.map((p) => [p.pid, p]));
	for (let i = 0; i < playersAll.length; i++) {
		const optionPlayer = optionPlayerByPid.get(playersAll[i]!.pid);
		if (optionPlayer) {
			playersAll[i] = {
				...helpers.deepCopy(optionPlayer),
				tid: PLAYER.FREE_AGENT,
			};
		}
	}

	const teams: ContractDemandTeam[] = [];
	for (const t of await idb.cache.teams.getAll()) {
		const contracts = (await teamGetContracts(t.tid)).filter(
			(contract) => !optionPids.has(contract.pid),
		);
		teams.push({
			disabled: t.disabled,
			payroll: await teamGetPayroll(contracts),
			tid: t.tid,
		});
	}

	return getContractDemandResults({
		type: "freeAgentsOnly",
		playersAll,
		teams,
		pids: optionPlayers.map((p) => p.pid),
	});
};

const optionPlayerName = (p: Player) =>
	`<a href="${helpers.leagueUrl(["player", p.pid])}">${p.firstName} ${
		p.lastName
	}</a>`;

const logOptionDecision = async ({
	exercised,
	p,
}: {
	exercised: boolean;
	p: Player;
}) => {
	const playerName = optionPlayerName(p);
	const isUserTeam = isManualUserTeamOption(p.tid);
	const isPlayerOption = p.contract.option === "player";
	const persistent = isUserTeam && isPlayerOption;
	const showNotification = isUserTeam;
	if (isPlayerOption) {
		await logEvent({
			type: "info",
			text: `${playerName} ${
				exercised ? "exercised" : "declined"
			} player option.`,
			pids: [p.pid],
			persistent,
			showNotification,
			tids: [p.tid],
		});
	} else {
		const teamInfo = g.get("teamInfoCache")[p.tid];
		await logEvent({
			type: "info",
			text: `${teamInfo?.region} ${teamInfo?.name} ${
				exercised ? "exercised" : "declined"
			} team option on ${playerName}.`,
			pids: [p.pid],
			persistent,
			showNotification,
			tids: [p.tid],
		});
	}
};

const exerciseOption = async (p: Player) => {
	await logOptionDecision({ exercised: true, p });
	delete p.contract.option;
	await idb.cache.players.put(p);
};

const removeDeclinedOptionSalary = (p: Player) => {
	p.salaries = (p.salaries ?? []).filter((salary) => {
		return salary.season <= p.contract.exp;
	});
};

const declineOption = async (p: Player) => {
	await logOptionDecision({ exercised: false, p });
	delete p.contract.option;
	p.contract.exp = g.get("season");
	removeDeclinedOptionSalary(p);
	await idb.cache.players.put(p);
};

export const processContractOptions = async () => {
	if (!isSport("basketball")) {
		return;
	}

	const players = (
		await idb.cache.players.indexGetAll("playersByTid", [0, Infinity])
	).filter(isOptionDecisionSeason);

	if (players.length === 0) {
		return;
	}

	const marketDemands = await getOptionMarketDemands(players);
	for (const p of players) {
		const option = p.contract.option;
		if (option === undefined) {
			continue;
		}

		if (option === "team" && isManualUserTeamOption(p.tid)) {
			continue;
		}

		const marketContract = marketDemands.get(p.pid)?.contract;
		const marketDemand =
			marketContract === undefined
				? undefined
				: getEffectiveOfferAmount(marketContract.amount, marketContract.option);
		if (marketDemand === undefined) {
			continue;
		}

		const exercise =
			option === "player"
				? shouldExercisePlayerOption({
						optionSalary: p.contract.amount,
						marketDemand,
					})
				: shouldExerciseTeamOption({
						optionSalary: p.contract.amount,
						marketDemand,
					});

		if (exercise) {
			await exerciseOption(p);
		} else {
			await declineOption(p);
		}
	}
};

export const decideUserTeamOption = async ({
	exercise,
	pid,
}: {
	exercise: boolean;
	pid: number;
}) => {
	const p = await idb.cache.players.get(pid);
	if (!p) {
		return "Invalid player.";
	}
	if (
		!isOptionDecisionSeason(p) ||
		p.contract.option !== "team" ||
		!isManualUserTeamOption(p.tid)
	) {
		return "This player does not have a pending team option decision.";
	}

	const tid = p.tid;
	if (exercise) {
		await exerciseOption(p);
	} else {
		await declineOption(p);
		await normalizeContractDemands({
			type: "includeExpiringContracts",
			pids: [pid],
		});

		const p2 = await idb.cache.players.get(pid);
		if (!p2) {
			throw new Error("Invalid pid");
		}
		playerAddToFreeAgents(p2);
		await idb.cache.players.put(p2);
		await contractNegotiationCreate(pid, true, tid);
	}

	await toUI("realtimeUpdate", [["playerMovement"]]);
};
