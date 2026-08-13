import { PHASE, PLAYER } from "../../../common/index.ts";
import { player } from "../index.ts";
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
	type CapturedSigningContext,
} from "../capturedContext.ts";

/**
 * Start a new contract negotiation with a player.
 *
 * @memberOf core.contractNegotiation
 * @param {number} pid An integer that must correspond with the player ID of a free agent.
 * @param {boolean} resigning Set to true if this is a negotiation for a contract extension, which will allow multiple simultaneous negotiations. Set to false otherwise.
 * @param {number=} tid Team ID the contract negotiation is with. This only matters for Multi Team Mode. If undefined, defaults to g.get("userTid").
 * @param {CapturedSigningContext=} context Captured league state for async-safe mutations.
 * @param {number=} usageBiasBeforeFreeAgency Snapshot used only by a formal same-team re-sign.
 * @return {Promise.<string=>)} If an error occurs, resolve to a string error message.
 */
const create = async (
	pid: number,
	resigning: boolean,
	tid?: number,
	context?: CapturedSigningContext,
	usageBiasBeforeFreeAgency?: number,
): Promise<string | undefined> => {
	const cache = context?.cache ?? idb.cache;
	const userTid = tid ?? context?.userTid ?? g.get("userTid");
	const phase = context?.phase ?? g.get("phase");
	if (
		phase > PHASE.AFTER_TRADE_DEADLINE &&
		phase <= PHASE.RESIGN_PLAYERS &&
		!resigning
	) {
		return "You're not allowed to sign free agents now.";
	}

	if (lock.get("gameSim")) {
		return "You cannot initiate a new negotiaion while game simulation is in progress.";
	}

	if (phase < 0) {
		return "You're not allowed to sign free agents now.";
	}

	const p = await cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}
	if (context && !isCapturedContextActive(context)) {
		throw new Error("Negotiation league context changed during validation");
	}

	if (p.tid !== PLAYER.FREE_AGENT) {
		return `${p.firstName} ${p.lastName} is not a free agent.`;
	}

	if (!resigning) {
		const moodInfo = await player.moodInfo(p, userTid);
		if (context && !isCapturedContextActive(context)) {
			throw new Error("Negotiation league context changed during validation");
		}
		if (!moodInfo.willing) {
			return `<a href="${helpers.leagueUrl(["player", p.pid])}">${
				p.firstName
			} ${p.lastName}</a> refuses to sign with you, no matter what you offer.`;
		}
	}

	const negotiation = {
		pid,
		tid: userTid,
		resigning,
		...(resigning && usageBiasBeforeFreeAgency !== undefined
			? { usageBiasBeforeFreeAgency }
			: undefined),
	};

	if (context && !isCapturedContextActive(context)) {
		throw new Error("Negotiation league context changed before mutation");
	}

	// Except in re-signing phase, only one negotiation at a time
	if (!resigning) {
		await cache.negotiations.clear();
	}

	if (context && !isCapturedContextActive(context)) {
		throw new Error("Negotiation league context changed before mutation");
	}
	await cache.negotiations.add(negotiation); // This will be handled by phase change when re-signing

	if (!resigning) {
		await updateStatus("Contract negotiation");
		await updatePlayMenu();
	}
};

export default create;
