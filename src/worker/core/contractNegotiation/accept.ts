import { player, team } from "../index.ts";
import cancel from "./cancel.ts";
import { idb } from "../../db/index.ts";
import { g, toUI, recomputeLocalUITeamOvrs } from "../../util/index.ts";
import type { PlayerContract } from "../../../common/types.ts";
import { PHASE } from "../../../common/index.ts";
import {
	canSignContractUnderSalaryCapRules,
	getMaxContractForPlayer,
} from "../contracts/contractLimits.ts";
import {
	canOfferTwoWay,
	canTeamAddTwoWay,
	getTwoWayContractAmount,
} from "../contracts/contractTwoWay.ts";
import {
	getMinContractForPlayer,
	withContractCapHitForPlayer,
} from "../contracts/contractMinimum.ts";

/**
 * Accept the player's offer.
 *
 * If successful, then the team's current roster will be displayed.
 *
 * @memberOf core.contractNegotiation
 * @param {number} pid An integer that must correspond with the player ID of a player in an ongoing negotiation.
 * @return {Promise.<string=>} If an error occurs, resolves to a string error message.
 */
const accept = async ({
	pid,
	amount,
	exp,
	type,
	dryRun,
}: {
	pid: number;
	amount: number;
	exp: number;
	type?: PlayerContract["type"];
	dryRun?: boolean;
}) => {
	const negotiation = await idb.cache.negotiations.get(pid);

	if (!negotiation) {
		return `No negotiation with player ${pid} found.`;
	}

	const p = await idb.cache.players.get(pid);
	if (!p) {
		throw new Error("Invalid pid");
	}

	const contractType = type ?? "standard";
	const isTwoWay = contractType === "twoWay";
	const amountActual = isTwoWay ? getTwoWayContractAmount() : amount;
	const maxContract = getMaxContractForPlayer(p);
	// This error is for sanity checking in multi team mode. Need to check for existence of negotiation.tid because it
	// wasn't there originally and I didn't write upgrade code. Can safely get rid of it later.
	if (negotiation.tid !== undefined && negotiation.tid !== g.get("userTid")) {
		return `This negotiation was started by the ${
			g.get("teamInfoCache")[negotiation.tid]?.region
		} ${g.get("teamInfoCache")[negotiation.tid]?.name} but you are the ${
			g.get("teamInfoCache")[g.get("userTid")]?.region
		} ${
			g.get("teamInfoCache")[g.get("userTid")]?.name
		}. Either switch teams or cancel this negotiation.`;
	}

	if (isTwoWay) {
		const players = await idb.cache.players.indexGetAll(
			"playersByTid",
			g.get("userTid"),
		);
		if (!canOfferTwoWay(p)) {
			return "This player is not eligible for a two-way contract.";
		}
		if (!canTeamAddTwoWay(players, g.get("userTid"))) {
			return "Your team already has the maximum number of two-way contracts.";
		}
	} else if (amountActual > maxContract) {
		return "You cannot offer this player a contract higher than their maximum salary.";
	} else if (amountActual < getMinContractForPlayer(p)) {
		return "You cannot offer this player a contract lower than their minimum salary.";
	}

	const salaryCapType = g.get("salaryCapType");
	const contract: PlayerContract = {
		amount: amountActual,
		exp,
	};
	if (isTwoWay) {
		contract.type = "twoWay";
	}
	const contractWithCapHit = withContractCapHitForPlayer(p, contract);

	if (salaryCapType !== "none" && !isTwoWay) {
		const payroll = await team.getPayroll(g.get("userTid"));
		const birdException = negotiation.resigning && salaryCapType === "soft";

		// If this contract brings team over the salary cap, it's not a minimum contract, and it's not re-signing a current
		// player with the Bird exception, ERROR!
		if (
			!canSignContractUnderSalaryCapRules({
				birdException,
				contract: contractWithCapHit,
				p,
				payroll,
			})
		) {
			return `You cannot go over the salary cap to sign ${
				salaryCapType === "hard" ? "players" : "free agents"
			} to contracts higher than the minimum salary.`;
		}
	}

	// Make sure the user didn't do something in another tab to change the willingness to negotiate, such as trading away players
	const mood = await player.moodInfo(p, g.get("userTid"));
	if (!mood.willing) {
		return "Player is no longer willing to negotiate.";
	}

	if (p.contract.rookie && g.get("phase") === PHASE.RESIGN_PLAYERS) {
		// Not sure if the phase condition is necessary. The purpose of this is for hard cap rookies with rookie contract scale.
		contractWithCapHit.rookie = true;
	}

	if (!dryRun) {
		await player.sign(p, g.get("userTid"), contractWithCapHit, g.get("phase"));
		await idb.cache.players.put(p);
		await cancel(pid);

		// If a depth chart exists, place this player in the depth chart so they are ahead of every player they are
		// better than, without otherwise disturbing the depth chart order
		const t = await idb.cache.teams.get(p.tid);
		const onlyNewPlayers = t ? !t.keepRosterSorted : false;
		await team.rosterAutoSort(g.get("userTid"), onlyNewPlayers);

		await toUI("realtimeUpdate", [["playerMovement"]]);
		await recomputeLocalUITeamOvrs();
	}
};

export default accept;
