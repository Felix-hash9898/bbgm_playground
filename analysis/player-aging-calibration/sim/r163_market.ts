import { PHASE, PLAYER } from "../../../src/common/index.ts";
import type { Player, PlayerContract, Team } from "../../../src/common/types.ts";
import type { CapturedSigningContext } from "../../../src/worker/core/capturedContext.ts";
import { getContractException, getMaxContractForPlayerAndTerm, getPriorContractTid,
	hasDesignatedVeteranContractRights } from "../../../src/worker/core/contracts/contractLimits.ts";
import { getContractCapHit, getMinContractForPlayer,
	withContractCapHitForPlayer } from "../../../src/worker/core/contracts/contractMinimum.ts";
import { getEffectiveOfferAmount, getRealAmountForEffectiveOffer } from "../../../src/worker/core/contracts/contractOption.ts";
import { getBasketballContractForMechanism,
	getContractExpirationForYears, getContractYearsFromExpiration } from "../../../src/worker/core/contracts/contractTerm.ts";
import { isStandardContract } from "../../../src/worker/core/contracts/contractTwoWay.ts";
import getLuxuryTaxAmount from "../../../src/worker/core/finances/getLuxuryTaxAmount.ts";
import moodInfo from "../../../src/worker/core/player/moodInfo.ts";
import { g, helpers, local } from "../../../src/worker/util/index.ts";
import { team } from "../../../src/worker/core/index.ts";

type Context = CapturedSigningContext;
export type MarketArm = "baseline" | "late-incumbent" | "late-bids" | "late-bridge" | "late-term";
export type MarketLog = (event: string, p: Player, fields: Record<string, unknown>) => void;
type Execute = (p: Player, tid: number, marker?: Team, contract?: PlayerContract) => Promise<Player>;
type Board = { club: Team; payroll: number; roster: Player[] };

const priorMinutes = (p: Player, year: number) =>
	p.stats.filter(s => !s.playoffs && s.season === year).reduce((sum, s) => sum + s.min, 0);

function consider(p: Player, context: Context) {
	return p.tid === PLAYER.FREE_AGENT && p.yearsFreeAgent === 0 &&
		p.injury.gamesRemaining === 0 && priorMinutes(p, context.season) >= 500 &&
		p.numDaysFreeAgent >= 23 && p.draft.year < context.season;
}

function latestTeamMinutes(p: Player, tid: number, year: number) {
	return p.stats.filter(s => !s.playoffs && s.season === year && s.tid === tid)
		.reduce((sum, s) => sum + s.min, 0);
}

// We grant an ordinary incumbent exception for the pilot transaction only, never a
// designated-veteran salary tier. One recent season allows a traded incumbent to bid.
export function ordinaryRights(p: Player, tid: number, context: Context) {
	return context.salaryCapType === "soft" && context.phase === PHASE.FREE_AGENCY &&
		consider(p, context) && getPriorContractTid(p) === tid &&
		latestTeamMinutes(p, tid, context.season) >= 500;
}

async function quote(p: Player, board: Board, context: Context, arm: MarketArm, log: MarketLog) {
	const { club, payroll, roster } = board;
	const tid = club.tid;
	const nativeRights = hasDesignatedVeteranContractRights(p, tid);
	const legalRights = ordinaryRights(p, tid, context) || nativeRights;
	const bench = roster.filter(q => q.injury.gamesRemaining <= 14 && isStandardContract(q.contract))
		.sort((a,b) => b.valueNoPot-a.valueNoPot);
	const starterFloor = bench[4]?.valueNoPot ?? 40;
	const rotationFloor = bench[7]?.valueNoPot ?? 40;
	const upgrade = p.valueNoPot - rotationFloor;
	const contracts = roster.filter(q => isStandardContract(q.contract)).length;
	const base = { tid, payroll, cap: context.salaryCap, taxLine: g.get("luxuryPayroll"),
		nativeRights, legalRights, contracts, starterFloor, rotationFloor, upgrade, strategy: club.strategy };
	const reject = (reason: string, more: Record<string, unknown> = {}) =>
		log("lateBid", p, { ...base, ...more, reason });
	if (upgrade <= 0 || p.valueNoPot < starterFloor - (club.strategy === "contending" ? 2 : 0)) {
		reject("basketball fit");
		return;
	}
	// Use the regular salary tier and quote logic. The incumbent exception below only
	// changes the accounting test. A rescue quote cannot acquire a new five-year maximum.
	const ordinary = getBasketballContractForMechanism(p, "capSpace", { context, teamTid: tid });
	if (!ordinary) {
		reject("term unavailable");
		return;
	}
	const years = getContractYearsFromExpiration({ expiration: ordinary.exp, context });
	// A non-incumbent pilot may bid for a two-year deal only with genuine cap room.
	// Limit the reduction to 10% of the current (already decayed) annual ask.
	const maxByCap = context.salaryCap - payroll;
	const bridge = arm === "late-bridge" && g.get("daysLeft") <= 4;
	const offeredYears = bridge ? 1 : 2;
	const floored = Math.ceil(ordinary.amount * (bridge ? .80 : .90) / 10) * 10;
	const capOffer = !legalRights && arm !== "late-incumbent" && years >= offeredYears &&
		context.minContractLength <= offeredYears &&
		maxByCap >= floored && maxByCap < ordinary.amount;
	const reducedOffer = capOffer
		? withContractCapHitForPlayer(p, { amount: Math.floor(maxByCap / 10) * 10,
			exp: getContractExpirationForYears({ years: offeredYears, context }) })
		: ordinary;
	const first = payroll + getContractCapHit(ordinary) <= context.salaryCap ? ordinary : reducedOffer;
	const reserve = capOffer ? floored : p.contract.amount;

	async function evaluate(contract: PlayerContract, shortTerm: boolean) {
		const term = getContractYearsFromExpiration({ expiration: contract.exp, context });
		const exception = getContractException({ birdException: legalRights && payroll+getContractCapHit(contract)>context.salaryCap,
			contract, p, payroll, team: club }).type;
		const money = { ask:p.contract.amount, offer:contract.amount, term, exception, capOffer, shortTerm };
		if ((exception !== "bird" && exception !== "capSpace") ||
			contract.amount < getMinContractForPlayer(p) ||
			contract.amount > getMaxContractForPlayerAndTerm(p,tid,term,contract.option)) {
			reject("no legal serious quote", money);
			return;
		}
		const mood = await moodInfo(p,tid,{contractAmount:reserve,contractYears:term});
		// Carry the player-specific mood price through the actual option conversion.
		const effective = getEffectiveOfferAmount(contract.amount,contract.option);
		const after = payroll + getContractCapHit(contract);
		const incrementalTax = getLuxuryTaxAmount(after)-getLuxuryTaxAmount(payroll);
		const payrollBurden = (getContractCapHit(contract) + .25 * incrementalTax) / context.salaryCap;
		const willingness = Math.min(.52, .12 + .012 * upgrade +
			(club.strategy === "contending" ? .06 : 0) -
			.015 * Math.max(0, term - 2) -
			.008 * Math.max(0, context.season - p.born.year - 32));
		const valuation = { ...money, after, incrementalTax, payrollBurden, willingness,
			mood:mood.probWilling, willing:mood.willing, moodAsk:mood.contractAmount, effective, components:mood.components };
		const reason = !mood.willing ? "player declined" : effective+1<mood.contractAmount ?
			"player declined price" : payrollBurden>willingness ? "team declined price" : "mutual";
		reject(reason,valuation);
		if (reason === "mutual") return { tid,contract,exception,payroll,after,
			mood:mood.probWilling,willingness,payrollBurden,term,effective };
	}
	const chosen = await evaluate(first,false);
	if (chosen || arm !== "late-term" || !legalRights || years <= 2 ||
		context.minContractLength > 2 || g.get("daysLeft") > 4) return chosen;
	const { willing,contractAmount } = await moodInfo(p,tid,{contractAmount:reserve,contractYears:2});
	if (!willing) return;
	let option = ordinary.option;
	let amount = getRealAmountForEffectiveOffer(contractAmount,option);
	const maxAmount = getMaxContractForPlayerAndTerm(p,tid,2,option);
	if (amount > maxAmount) {
		option = undefined;
		amount = Math.min(contractAmount, getMaxContractForPlayerAndTerm(p,tid,2));
	}
	return evaluate(withContractCapHitForPlayer(p,{ amount,option,
		exp:getContractExpirationForYears({ years:2,context }) }),true);
}

export async function clearLateMarket(
	context: Context, execute: Execute, authorize: (p: Player, tid: number) => void,
	arm: MarketArm, log: MarketLog,
) {
	if (arm === "baseline" || context.salaryCapType !== "soft" || context.phase !== PHASE.FREE_AGENCY ||
		context.forceHistoricalRosters || g.get("challengeNoFreeAgents") || g.get("daysLeft") > 8) return;
	const candidates = (await context.cache.players.indexGetAll("playersByTid", PLAYER.FREE_AGENT))
		.filter(p => consider(p, context)).sort((a,b) => b.valueNoPot-a.valueNoPot || a.pid-b.pid);
	const clubs = (await context.cache.teams.getAll()).filter(t => !t.disabled &&
		(!context.userTids.includes(t.tid) || local.autoPlayUntil || context.spectator));
	const occupied = new Set<number>();
	for (const p of candidates) {
		const bids = [];
		for (const club of clubs) {
			if (occupied.has(club.tid) || (arm === "late-incumbent" && !ordinaryRights(p, club.tid, context))) continue;
			const payroll = await team.getPayroll(club.tid, undefined, context.cache);
			const roster = await context.cache.players.indexGetAll("playersByTid", club.tid);
			const offer = await quote(p, { club, payroll, roster }, context, arm, log);
			if (offer) bids.push(offer);
		}
		// Observe actual offers first, then rank by salary and willingness to join the club.
		const best = bids.sort((a,b) => b.contract.amount-a.contract.amount ||
			b.mood-a.mood || b.term-a.term || a.tid-b.tid)[0];
		if (!best) continue;
		if (best.exception === "bird") authorize(p, best.tid);
		const signed = await execute(p, best.tid, undefined, best.contract);
		occupied.add(best.tid);
		log("lateSign", p, { ...best, order: signed.rosterOrder,
			postPayroll: await team.getPayroll(best.tid, undefined, context.cache) });
	}
}
