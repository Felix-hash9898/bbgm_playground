import { PLAYER } from "../../../common/index.ts";
import { team } from "../index.ts";
import { idb } from "../../db/index.ts";
import { g } from "../../util/index.ts";
import type { ContractDemandType } from "./contractDemands.ts";
import { getContractDemandResults } from "./contractDemands.ts";

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
	if (pids && pids.length === 0) {
		return;
	}

	const playersAll = await idb.cache.players.indexGetAll("playersByTid", [
		PLAYER.FREE_AGENT,
		Infinity,
	]);

	const season = g.get("season");
	const teams = [];
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

	const results = getContractDemandResults({
		type,
		playersAll,
		teams,
		pids,
		nextSeason,
	});

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
