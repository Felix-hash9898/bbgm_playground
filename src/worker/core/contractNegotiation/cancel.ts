import { PHASE } from "../../../common/index.ts";
import { idb } from "../../db/index.ts";
import {
	g,
	helpers,
	lock,
	updatePlayMenu,
	updateStatus,
} from "../../util/index.ts";
import {
	isCapturedContextActive,
	type CapturedLeagueContext,
} from "../capturedContext.ts";

/**
 * Cancel contract negotiations with a player.
 */
const cancel = async (
	pid: number,
	context?: CapturedLeagueContext,
	alreadyDeleted = false,
) => {
	if (!alreadyDeleted) {
		await (context?.cache ?? idb.cache).negotiations.delete(pid);
	}
	const negotiationInProgress = await lock.negotiationInProgress();

	if (context && !isCapturedContextActive(context)) {
		return;
	}

	if (!negotiationInProgress) {
		if (g.get("phase") === PHASE.FREE_AGENCY) {
			await updateStatus(helpers.daysLeft(true));
		} else {
			await updateStatus("Idle");
		}

		updatePlayMenu();
	}
};

export default cancel;
