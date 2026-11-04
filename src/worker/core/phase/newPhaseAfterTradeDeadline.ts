import { idb } from "../../db/index.ts";
import type { Conditions, PhaseReturn } from "../../../common/types.ts";

const newPhaseAfterTradeDeadline = async (
	_conditions: Conditions,
	extra?: { tradeDeadlineGid?: number },
): Promise<PhaseReturn> => {
	if (extra?.tradeDeadlineGid !== undefined) {
		await idb.cache.schedule.delete(extra.tradeDeadlineGid);
	}
	return {};
};

export default newPhaseAfterTradeDeadline;
