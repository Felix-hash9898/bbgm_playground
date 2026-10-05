import { PHASE } from "../../../common/index.ts";
import type {
	GameAttributesLeague,
	Player,
	PlayerContract,
} from "../../../common/types.ts";
import { g, helpers } from "../../util/index.ts";
import type { CapturedSigningContext } from "../capturedContext.ts";
import {
	clampContractAmountForPlayer,
	getMaxContractForPlayerAndTerm,
	getYearsOfService,
} from "./contractLimits.ts";
import {
	getMinContractForPlayer,
	withContractCapHitForPlayer,
} from "./contractMinimum.ts";
import { getMidLevelExceptionAmount } from "./contractMidLevel.ts";
import {
	canContractHaveOption,
	getAIContractOption,
	getEffectiveOfferAmount,
	getRealAmountForEffectiveOffer,
	isPlayerOptionInjuryHorizonSafe,
} from "./contractOption.ts";

export type ContractTermPlayer = {
	born: { year: number };
	ratings: { ovr?: number; pot?: number }[];
	tid?: number;
};

export type ContractTermContext = {
	season?: number;
	phase?: number;
	minContractLength?: number;
	maxContractLength?: number;
	salaryCapType?: GameAttributesLeague["salaryCapType"];
};

const finite = (value: unknown, fallback: number) =>
	typeof value === "number" && Number.isFinite(value) ? value : fallback;

const readSettings = (context?: ContractTermContext) => {
	const season = context?.season ?? g.get("season");
	const phase = context?.phase ?? g.get("phase");
	const minContractLength = Math.max(
		1,
		Math.floor(context?.minContractLength ?? g.get("minContractLength")),
	);
	const maxContractLength = Math.max(
		minContractLength,
		Math.floor(context?.maxContractLength ?? g.get("maxContractLength")),
	);
	return { season, phase, minContractLength, maxContractLength };
};

export type BasketballMechanism =
	| "bird"
	| "capSpace"
	| "midLevel"
	| "minimum"
	| "none";

export const BASKETBALL_MECHANISM_MAX_YEARS: Record<
	BasketballMechanism,
	number
> = {
	bird: 5,
	capSpace: 4,
	midLevel: 4,
	minimum: 2,
	none: Infinity,
};

export const getBasketballMechanismMaxContractLength = (
	mechanism: BasketballMechanism,
	maxContractLength = g.get("maxContractLength"),
) => {
	const mechanismLimit = BASKETBALL_MECHANISM_MAX_YEARS[mechanism];
	return Math.min(mechanismLimit, maxContractLength);
};

export const getBasketballContractScore = (
	p: ContractTermPlayer,
	season?: number,
) => {
	const currentSeason = season ?? g.get("season");
	const age = currentSeason - p.born.year;
	const ovr = finite(p.ratings.at(-1)?.ovr, 40);
	const pot = finite(p.ratings.at(-1)?.pot, ovr);
	const rawAbility = Math.max((ovr - 40) / 30, 0);

	return helpers.bound(
		rawAbility +
			0.015 * (pot - ovr) -
			0.075 * Math.max(age - 29, 0) -
			0.05 * Math.max(age - 34, 0),
		0,
		1,
	);
};

/**
 * Generate a basketball contract term using S1 delayed-upper-clamp strong model.
 * Deterministic with no fuzziness or randomization.
 */
export const getBasketballContractYears = (
	p: ContractTermPlayer,
	{
		mechanism,
		context,
	}: {
		mechanism?: BasketballMechanism;
		randomizeExpiration?: boolean;
		context?: ContractTermContext;
	} = {},
): number | null => {
	const { season, minContractLength, maxContractLength } =
		readSettings(context);
	const salaryCapType = context?.salaryCapType ?? g.get("salaryCapType");
	const defaultMech: BasketballMechanism =
		salaryCapType === "none"
			? "none"
			: "tid" in p && typeof p.tid === "number" && p.tid >= 0
				? "bird"
				: "capSpace";
	const mech = mechanism ?? defaultMech;
	const legalMax = getBasketballMechanismMaxContractLength(
		mech,
		maxContractLength,
	);

	if (minContractLength > legalMax) {
		// Mechanism is unavailable if configured min exceeds mechanism legal max
		return null;
	}

	const score = getBasketballContractScore(p, season);
	const years =
		minContractLength + Math.round((legalMax - minContractLength) * score);

	return helpers.bound(years, minContractLength, legalMax);
};

export const getContractExpirationForYears = ({
	years,
	nextSeason = false,
	context,
}: {
	years: number;
	nextSeason?: boolean;
	context?: ContractTermContext;
}) => {
	const { season, phase } = readSettings(context);
	const phaseOffset = phase <= PHASE.PLAYOFFS ? -1 : 0;
	return season + years + phaseOffset - (nextSeason ? 1 : 0);
};

export const getContractYearsFromExpiration = ({
	expiration,
	nextSeason = false,
	context,
}: {
	expiration: number;
	nextSeason?: boolean;
	context?: ContractTermContext;
}) => {
	const { season, phase } = readSettings(context);
	const phaseOffset = phase <= PHASE.PLAYOFFS ? 1 : 0;
	return expiration - season + phaseOffset + (nextSeason ? 1 : 0);
};

export const getBasketballContractTerm = (
	p: ContractTermPlayer,
	{
		mechanism,
		randomizeExpiration = false,
		nextSeason = false,
		context,
	}: {
		mechanism?: BasketballMechanism;
		randomizeExpiration?: boolean;
		nextSeason?: boolean;
		context?: ContractTermContext;
	} = {},
): { years: number; expiration: number } | null => {
	const years = getBasketballContractYears(p, {
		mechanism,
		randomizeExpiration,
		context,
	});
	if (years === null) {
		return null;
	}
	return {
		years,
		expiration: getContractExpirationForYears({
			years,
			nextSeason,
			context,
		}),
	};
};

/**
 * On-demand derivation of a legally configured mechanism-specific contract (Defect B fix).
 * Produces S1 term clamped to the mechanism's legal max, appropriate option, and cap hit.
 * If minContractLength exceeds the mechanism's legal max, returns null (mechanism unavailable).
 */
export const getBasketballContractForMechanism = (
	p: Player,
	mechanism: BasketballMechanism,
	{
		context,
		realAmount,
		nextSeason = false,
		teamTid = p.tid,
	}: {
		context?: CapturedSigningContext;
		/** Existing annual salary after any PO/TO conversion. */
		realAmount?: number;
		teamTid?: number;
		nextSeason?: boolean;
	} = {},
): PlayerContract | null => {
	const term = getBasketballContractTerm(p, {
		mechanism,
		context,
		nextSeason,
	});
	if (term === null) {
		return null;
	}

	const playerMinimum = getMinContractForPlayer(p);
	const playerMaximum = getMaxContractForPlayerAndTerm(p, teamTid, term.years);
	const mleCap = getMidLevelExceptionAmount();
	const requestedRealAmount = realAmount ?? p.contract?.amount ?? playerMinimum;

	let option = mechanism === "minimum" ? undefined : p.contract?.option;
	let effectiveAmount =
		mechanism === "minimum"
			? playerMinimum
			: option === undefined
				? requestedRealAmount
				: getEffectiveOfferAmount(requestedRealAmount, option);
	effectiveAmount =
		mechanism === "midLevel"
			? Math.max(playerMinimum, effectiveAmount)
			: clampContractAmountForPlayer(p, effectiveAmount, teamTid, term.years);

	const contractForOption: PlayerContract = {
		amount: effectiveAmount,
		exp: term.expiration,
		...(p.contract?.type === undefined ? {} : { type: p.contract.type }),
		...(p.contract?.rookie ? { rookie: p.contract.rookie } : {}),
	};

	// Check if existing option is still legal for the new term
	if (option !== undefined) {
		const quotedRealAmount = getRealAmountForEffectiveOffer(
			effectiveAmount,
			option,
		);
		if (
			!canContractHaveOption(contractForOption, context) ||
			quotedRealAmount < playerMinimum ||
			(mechanism === "midLevel" &&
				(quotedRealAmount > playerMaximum || quotedRealAmount > mleCap)) ||
			(option === "team" && quotedRealAmount > playerMaximum) ||
			(option === "player" &&
				!isPlayerOptionInjuryHorizonSafe(p, contractForOption))
		) {
			option = undefined;
		}
	}

	// If no option (either none originally or it was dropped), maybe add one
	if (option === undefined && mechanism !== "minimum") {
		option = getAIContractOption(p, contractForOption, context);
	}

	if (
		option &&
		getYearsOfService(p) === 4 &&
		getRealAmountForEffectiveOffer(effectiveAmount, option) >
			getMaxContractForPlayerAndTerm(p, teamTid, term.years, option)
	) {
		option = undefined;
	}

	// Apply the final option
	let contract: PlayerContract = {
		...contractForOption,
		amount: option
			? getRealAmountForEffectiveOffer(effectiveAmount, option)
			: effectiveAmount,
	};
	if (option) {
		contract.option = option;
	}
	if (mechanism === "midLevel" && contract.amount > mleCap) {
		if (option === undefined || effectiveAmount > mleCap) {
			return null;
		}
		delete contract.option;
		contract.amount = effectiveAmount;
	}
	if (
		mechanism === "midLevel" &&
		(contract.amount < playerMinimum ||
			contract.amount > playerMaximum ||
			contract.amount > mleCap)
	) {
		return null;
	}

	contract = withContractCapHitForPlayer(p, contract);
	return contract;
};
