import { PLAYER } from "../../../common/index.ts";
import { team } from "../index.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import type {
	ContractDemandResult,
	ContractDemandTeam,
	ContractDemandType,
} from "./contractDemands.ts";
import { getContractDemandResults } from "./contractDemands.ts";
import type { Player } from "../../../common/types.ts";

// "includeExpiringContracts" - use this at the start of re-signing phase
// "freeAgentsOnly" - use this at the start of free agency phase
// "dummyExpiringContracts" - use this at beginning of regular season, or during season (like when releasing a player)
export const getNormalizedContractDemandResults = async ({
	type,
	pids,
	nextSeason,
	playersAll,
}: {
	type: ContractDemandType;
	pids?: number[];
	nextSeason?: boolean;
	playersAll?: Player[];
}): Promise<Map<number, ContractDemandResult> | undefined> => {
	if (pids && pids.length === 0) {
		return;
	}

	playersAll ??= await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);

	const season = g.get("season");
	const teams: ContractDemandTeam[] = [];
	for (const t of await idb.cache.teams.getAll()) {
		const contracts = (await team.getContracts(t.tid)).filter((contract) => {
			if (pids && pids.includes(contract.pid)) {
				return false;
			}

			if (type === "newLeague" || type === "freeAgentsOnly") {
				return true;
			}

			return contract.exp > season;
		});

		teams.push({
			disabled: t.disabled,
			payroll: await team.getPayroll(contracts),
			tid: t.tid,
		});
	}

	return getContractDemandResults({
		type,
		playersAll,
		teams,
		pids,
		nextSeason,
	});
};

// "includeExpiringContracts" - use this at the start of re-signing phase
// "freeAgentsOnly" - use this at the start of free agency phase
// "dummyExpiringContracts" - use this at beginning of regular season, or during season (like when releasing a player)
const normalizeContractDemands = async ({
	type,
	pids,
	nextSeason,
}: {
	type: ContractDemandType;
	pids?: number[];
	nextSeason?: boolean;
}) => {
	const results = await getNormalizedContractDemandResults({
		type,
		pids,
		nextSeason,
	});
	if (!results) {
		return;
	}

	for (const [pid, result] of results) {
		const p = await idb.cache.players.get(pid);
		if (!p) {
			continue;
		}

		p.contract = result.contract;

		if (result.rookie) {
			p.contract.rookie = true;
		}

		await idb.cache.players.put(p);
	}
};

export default normalizeContractDemands;
