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
import {
	isCapturedContextActive,
	type CapturedSigningContext,
} from "../capturedContext.ts";

// "includeExpiringContracts" - use this at the start of re-signing phase
// "freeAgentsOnly" - use this at the start of free agency phase
// "dummyExpiringContracts" - use this at beginning of regular season, or during season (like when releasing a player)
export const getNormalizedContractDemandResults = async ({
	type,
	pids,
	nextSeason,
	playersAll,
	context,
}: {
	type: ContractDemandType;
	pids?: number[];
	nextSeason?: boolean;
	playersAll?: Player[];
	context?: CapturedSigningContext;
}): Promise<Map<number, ContractDemandResult> | undefined> => {
	if (pids && pids.length === 0) {
		return;
	}

	const cache = context?.cache ?? idb.cache;
	const season = context?.season ?? g.get("season");
	const allPlayers =
		playersAll ??
		(await cache.players.indexGetAll("playersByTid", [
			PLAYER.FREE_AGENT,
			Infinity,
		]));

	const teams: ContractDemandTeam[] = [];
	for (const t of await cache.teams.getAll()) {
		const contracts = (await team.getContracts(t.tid, cache)).filter(
			(contract) => {
				if (pids && pids.includes(contract.pid)) {
					return false;
				}

				if (type === "newLeague" || type === "freeAgentsOnly") {
					return true;
				}

				return contract.exp > season;
			},
		);

		teams.push({
			disabled: t.disabled,
			payroll: await team.getPayroll(contracts, undefined, cache),
			tid: t.tid,
		});
	}

	return getContractDemandResults({
		type,
		playersAll: allPlayers,
		teams,
		pids,
		nextSeason,
		context,
	});
};

// "includeExpiringContracts" - use this at the start of re-signing phase
// "freeAgentsOnly" - use this at the start of free agency phase
// "dummyExpiringContracts" - use this at beginning of regular season, or during season (like when releasing a player)
const normalizeContractDemands = async ({
	type,
	pids,
	nextSeason,
	context,
}: {
	type: ContractDemandType;
	pids?: number[];
	nextSeason?: boolean;
	context?: CapturedSigningContext;
}) => {
	const assertActive = () => {
		if (context && !isCapturedContextActive(context)) {
			throw new Error("Contract demand league context changed");
		}
	};
	assertActive();
	const results = await getNormalizedContractDemandResults({
		type,
		pids,
		nextSeason,
		context,
	});
	assertActive();
	if (!results) {
		return;
	}

	const cache = context?.cache ?? idb.cache;
	const updates: { oldPlayer: Player; player: Player }[] = [];
	for (const [pid, result] of results) {
		assertActive();
		const p = await cache.players.get(pid);
		assertActive();
		if (!p) {
			continue;
		}
		const oldPlayer = structuredClone(p);
		const player = structuredClone(p);
		player.contract = result.contract;

		if (result.rookie) {
			player.contract.rookie = true;
		}
		updates.push({ oldPlayer, player });
	}

	const written: Player[] = [];
	try {
		for (const update of updates) {
			assertActive();
			await cache.players.put(update.player);
			written.push(update.oldPlayer);
			assertActive();
		}
	} catch (error) {
		const rollbackErrors: unknown[] = [];
		for (const oldPlayer of written) {
			try {
				await cache.players.put(oldPlayer);
			} catch (rollbackError) {
				rollbackErrors.push(rollbackError);
			}
		}
		if (rollbackErrors.length > 0) {
			const combined = new Error(
				"Contract demand normalization failed and rollback failed",
				{ cause: error },
			);
			(combined as any).originalError = error;
			(combined as any).rollbackError =
				rollbackErrors.length === 1
					? rollbackErrors[0]
					: new AggregateError(rollbackErrors);
			throw combined;
		}
		throw error;
	}
};

export default normalizeContractDemands;
