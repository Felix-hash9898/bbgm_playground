import { PHASE } from "../../../../common/index.ts";
import type { Player } from "../../../../common/types.ts";
import { defaultGameAttributes, g, helpers } from "../../../util/index.ts";
import type { CapturedSigningContext } from "../../capturedContext.ts";
import { getMinContractForPlayer } from "../contractMinimum.ts";
import { getContractLength } from "../contractOption.ts";

export const getIncumbentInjuredAsk = ({
	p,
	healthyH,
	contractYears = 1,
	context,
}: {
	p: Parameters<typeof getMinContractForPlayer>[0] & {
		injury?: { type?: string; gamesRemaining?: number };
	};
	healthyH: number;
	contractYears?: number;
	context?: CapturedSigningContext;
}) => {
	const gamesRemaining = p.injury?.gamesRemaining ?? 0;
	const playerMinimum = getMinContractForPlayer(p);
	if (gamesRemaining <= 0) {
		return Math.max(playerMinimum, healthyH);
	}
	const numGames = context?.numGames ?? g.get("numGames");
	const maxContract = g.get("maxContract");
	const minContract = context?.minContract ?? g.get("minContract");
	const grace = Math.round((14 * numGames) / 82);
	if (gamesRemaining <= grace) {
		return Math.max(playerMinimum, healthyH);
	}

	const guaranteedYears = Math.max(1, contractYears);
	const guaranteedGames = guaranteedYears * numGames;
	const unavailableShare =
		Math.min(gamesRemaining, guaranteedGames) / guaranteedGames;

	let floorPct = 0.9;
	let maxDays = 20;
	if (guaranteedYears === 1 && unavailableShare > 0.5) {
		const shortSeverity = helpers.bound((unavailableShare - 0.5) / 0.5, 0, 1);
		floorPct = 0.9 - 0.2 * shortSeverity;
		maxDays = Math.round(20 + 20 * shortSeverity);
	}

	const severity = helpers.bound(
		(gamesRemaining - grace) / Math.max(1, numGames - grace),
		0,
		1,
	);
	const equivalentDays = Math.round(maxDays * severity);

	const legalIncrement =
		minContract >= 3 ? 10 ** (Math.floor(Math.log10(minContract / 3)) - 1) : 1;
	const floor = Math.max(
		playerMinimum,
		Math.ceil((floorPct * healthyH) / legalIncrement) * legalIncrement,
	);

	let q = healthyH;
	const baseAmount = 50 * Math.sqrt(maxContract / 20000);
	for (let i = 0; i < equivalentDays; i++) {
		q -= baseAmount;
		q = helpers.roundContract(q);
	}

	return Math.max(q, floor, playerMinimum);
};

export const getBasketballSigningPriority = (
	p: Player,
	context?: CapturedSigningContext,
	scheduleGamesForTeam?: number,
) => {
	const gamesRemaining = p.injury?.gamesRemaining ?? 0;
	if (gamesRemaining <= 0) {
		return p.value;
	}
	const numGames = context?.numGames ?? g.get("numGames");
	const phase = context?.phase ?? g.get("phase");
	// PRESEASON (phase=0) is NOT treated as midseason — only true regular-season
	// and active playoff windows qualify for the short-horizon penalty.
	const isMidseason = phase >= PHASE.REGULAR_SEASON && phase <= PHASE.PLAYOFFS;
	const contractYears = getContractLength(p.contract);

	// For midseason signing priority, use actual remaining schedule games for the
	// signing team rather than the league-wide daysLeft countdown (Defect A fix).
	// scheduleGamesForTeam is pre-counted from idb.cache.schedule by the caller.
	const horizonGames = isMidseason
		? typeof scheduleGamesForTeam === "number" &&
			Number.isFinite(scheduleGamesForTeam) &&
			scheduleGamesForTeam >= 0
			? Math.max(1, scheduleGamesForTeam)
			: numGames // fallback: treat as full season when schedule unavailable
		: Math.min(2 * numGames, contractYears * numGames);
	const grace = Math.round((14 * horizonGames) / 82);
	if (gamesRemaining <= grace) {
		return p.value;
	}
	const severity = helpers.bound(
		(gamesRemaining - grace) / Math.max(1, horizonGames - grace),
		0,
		1,
	);
	const maxPenalty =
		(isMidseason || contractYears === 1) && severity > 0.5 ? 0.15 : 0.075;

	return p.value * (1 - maxPenalty * severity);
};

export const getContractAvailabilityAdjustment = ({
	gamesRemaining,
	contractYears,
	gamesPerSeason,
	playoffGamesPerSeason = 0,
	postseasonCalendarGames = playoffGamesPerSeason,
	offseasonHealingGames = 82,
}: {
	gamesRemaining: number;
	contractYears: number;
	gamesPerSeason: number;
	playoffGamesPerSeason?: number;
	postseasonCalendarGames?: number;
	offseasonHealingGames?: number;
}) => {
	const years = Math.max(1, Number.isFinite(contractYears) ? contractYears : 1);
	const seasonGames = Math.max(
		1,
		Number.isFinite(gamesPerSeason) ? gamesPerSeason : 82,
	);
	const postseasonGames = Math.max(
		0,
		Number.isFinite(playoffGamesPerSeason) ? playoffGamesPerSeason : 0,
	);
	const postseasonDays = Math.max(
		0,
		Number.isFinite(postseasonCalendarGames) ? postseasonCalendarGames : 0,
	);
	const contractGames = years * (seasonGames + postseasonGames);
	const healingGames = Math.max(
		0,
		Number.isFinite(offseasonHealingGames) ? offseasonHealingGames : 82,
	);
	let remainingInjuryGames = Math.max(
		0,
		Number.isFinite(gamesRemaining) ? gamesRemaining : 0,
	);
	let unavailableGames = 0;
	for (let year = 0; year < years && remainingInjuryGames > 0; year += 1) {
		const missedRegularSeason = Math.min(remainingInjuryGames, seasonGames);
		unavailableGames += missedRegularSeason;
		remainingInjuryGames -= missedRegularSeason;
		const missedPostseasonDays = Math.min(remainingInjuryGames, postseasonDays);
		if (postseasonDays > 0) {
			// Contract value credits the league-wide playoff opportunity. Injury
			// still heals across the actual maximum postseason calendar.
			unavailableGames +=
				(postseasonGames * missedPostseasonDays) / postseasonDays;
		}
		remainingInjuryGames -= missedPostseasonDays;

		// BBGM removes 82 days of injury duration between seasons. Injury time
		// left after those days must not be charged again as games the player
		// will miss in the next contract year.
		if (remainingInjuryGames > 0 && year < years - 1) {
			remainingInjuryGames = Math.max(0, remainingInjuryGames - healingGames);
		}
	}
	const unavailableShare = unavailableGames / contractGames;

	return {
		contractGames,
		unavailableGames,
		offseasonHealingGames: healingGames,
		unavailableShare,
		availabilityFactor: 1 - unavailableShare,
	};
};

export const getBasketballContractAvailabilityAdjustment = (
	gamesRemaining: number,
	contractYears: number,
) => {
	const seriesGames = g.get("numGamesPlayoffSeries");
	const playoffGamesPerSeason =
		(Array.isArray(seriesGames)
			? seriesGames.reduce(
					(total, games) =>
						total +
						(typeof games === "number" && Number.isFinite(games)
							? Math.max(0, games)
							: 0),
					0,
				)
			: 0) + (g.get("playIn") ? 2 : 0);
	const pricedPostseasonGamesPerSeason =
		Array.isArray(seriesGames) && g.get("numActiveTeams") > 0
			? Math.min(
					playoffGamesPerSeason,
					(2 *
						seriesGames.reduce(
							(total, games, round) =>
								total +
								(typeof games === "number" && Number.isFinite(games)
									? Math.max(0, games) * 2 ** (seriesGames.length - round - 1)
									: 0),
							0,
						)) /
						g.get("numActiveTeams"),
				)
			: 0;
	return {
		playoffGamesPerSeason,
		pricedPostseasonGamesPerSeason,
		...getContractAvailabilityAdjustment({
			gamesRemaining,
			contractYears,
			gamesPerSeason: g.get("numGames"),
			playoffGamesPerSeason: pricedPostseasonGamesPerSeason,
			postseasonCalendarGames: playoffGamesPerSeason,
			offseasonHealingGames: defaultGameAttributes.numGames[0].value,
		}),
	};
};

export const getTermAdjustedContractOffer = ({
	baseOfferAmount,
	referenceRawAmount,
	offeredRawAmount,
	factor,
	minimumAmount,
}: {
	baseOfferAmount: number;
	referenceRawAmount: number;
	offeredRawAmount: number;
	factor: number;
	minimumAmount: number;
}) => {
	const termAdjustedAmount =
		baseOfferAmount + offeredRawAmount - referenceRawAmount;
	return Math.max(
		minimumAmount,
		helpers.roundContract(termAdjustedAmount * factor),
	);
};
