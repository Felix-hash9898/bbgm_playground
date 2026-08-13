import { isSport, PHASE } from "../../../common/index.ts";
import setContract from "./setContract.ts";
import { helpers, logEventInContext } from "../../util/index.ts";
import type { Phase, Player, PlayerContract } from "../../../common/types.ts";
import genJerseyNumber from "./genJerseyNumber.ts";
import setJerseyNumber from "./setJerseyNumber.ts";
import {
	captureSigningContext,
	type CapturedSigningContext,
} from "../capturedContext.ts";

const sign = async (
	p: Player,
	tid: number,
	contract: PlayerContract,
	phase: Phase,
	context: CapturedSigningContext = captureSigningContext(),
) => {
	const isRookie =
		p.stats.length === 0 &&
		p.draft.year === context.season &&
		p.draft.tid === tid;

	p.tid = tid;
	delete p.tradeReputationByTid;
	p.numDaysFreeAgent = 0;
	p.gamesUntilTradable = isRookie ? 0 : Math.round(0.17 * context.numGames); // 14 for basketball, 3 for football

	// Handle stats if the season is in progress. Otherwise, not needed until next season.
	if (phase <= PHASE.PLAYOFFS) {
		setJerseyNumber(
			p,
			await genJerseyNumber(
				p,
				undefined,
				undefined,
				undefined,
				undefined,
				context.cache,
			),
			{ phase, season: context.season },
		);
	}

	let score = p.valueFuzz - 45;
	if (isSport("football")) {
		score -= 7;
	}
	score = Math.round(helpers.bound(score, 0, Infinity));

	setContract(p, contract, true, {
		season: context.season,
		phase,
		minContract: context.minContract,
	});
	const resigning =
		phase === PHASE.RESIGN_PLAYERS && p.draft.year !== context.season;
	const eventType = resigning ? "reSigned" : "freeAgent";
	const eid = await logEventInContext(
		{
			type: eventType,
			showNotification: false,
			pids: [p.pid],
			tids: [p.tid],
			score,
			contract: p.contract,
		},
		undefined,
		context,
	);

	const freeAgent = !resigning && !isRookie;
	if (freeAgent) {
		if (!p.transactions) {
			p.transactions = [];
		}
		p.transactions.push({
			season: context.season,
			phase: context.phase,
			tid: p.tid,
			type: "freeAgent",
			eid,
		});
	}

	return eid;
};

export default sign;
