import { g, helpers } from "../../../util/index.ts";
import { clampContractAmountForPlayer } from "../contractLimits.ts";
import { getContractValue } from "../contractValue.ts";
import { getBasketballContractYears } from "../contractTerm.ts";
import { getBasketballContractAvailabilityAdjustment } from "./injuryAdjustment.ts";
import { getRegularSeasonStatsBySeason } from "./seasonStats.ts";
import type {
	BpmCorrection,
	BpmSeasonSignal,
	ContractMarketPlayer,
	ContractMarketResult,
} from "./types.ts";

const SALARY_CAP_KNOTS: [value: number, percent: number][] = [
	[40, 0.01],
	[45, 0.015],
	[50, 0.03],
	[55, 0.06],
	[60, 0.16],
	[65, 0.26],
	[70, 0.33],
];

export const getBasketballSalaryCapPercentage = (latentValue: number) => {
	if (!Number.isFinite(latentValue) || latentValue <= SALARY_CAP_KNOTS[0]![0]) {
		return SALARY_CAP_KNOTS[0]![1];
	}
	for (let i = 1; i < SALARY_CAP_KNOTS.length; i += 1) {
		const [upperValue, upperPercent] = SALARY_CAP_KNOTS[i]!;
		const [lowerValue, lowerPercent] = SALARY_CAP_KNOTS[i - 1]!;
		if (latentValue <= upperValue) {
			const share = (latentValue - lowerValue) / (upperValue - lowerValue);
			return lowerPercent + share * (upperPercent - lowerPercent);
		}
	}
	return SALARY_CAP_KNOTS.at(-1)![1];
};

export const getBasketballExpectedBpm = (valueNoPot: number) =>
	0.6 * (valueNoPot - 55) - 0.66;

export const getBpmReliability = (seasonMinutes: number) =>
	helpers.bound(
		Number.isFinite(seasonMinutes) ? seasonMinutes / 1200 : 0,
		0,
		1,
	);

export const getBpmCorrection = (
	valueNoPot: number,
	referenceSeason: number,
	statsBySeason: Map<
		number,
		{
			bpm?: number;
			bpmMinutes: number;
		}
	>,
): BpmCorrection => {
	const expectedBpm = getBasketballExpectedBpm(valueNoPot);
	const weights = [0.6, 0.25, 0.15];
	const seasons: BpmSeasonSignal[] = [];
	let weightedResidual = 0;

	for (let i = 0; i < weights.length; i += 1) {
		const season = referenceSeason - i;
		const stats = statsBySeason.get(season);
		const minutes =
			stats && Number.isFinite(stats.bpmMinutes)
				? Math.max(0, stats.bpmMinutes)
				: 0;
		const reliability =
			stats?.bpm === undefined ? 0 : getBpmReliability(minutes);
		const residual =
			stats?.bpm === undefined ? undefined : stats.bpm - expectedBpm;
		if (residual !== undefined) {
			weightedResidual += weights[i]! * reliability * residual;
		}
		seasons.push({
			season,
			bpm: stats?.bpm,
			minutes,
			reliability,
			residual,
		});
	}

	const boundedResidual = helpers.bound(weightedResidual, -4, 4);
	return {
		expectedBpm,
		weightedResidual,
		boundedResidual,
		correction: 0.4 * boundedResidual,
		seasons,
	};
};

export const getBasketballContractMarketDemand = (
	p: ContractMarketPlayer,
	contractYears: number = getBasketballContractYears(p) ?? 1,
	teamTid: number = p.tid,
): ContractMarketResult => {
	const statsBySeason = getRegularSeasonStatsBySeason(p);
	const currentSeason = g.get("season");
	const currentSeasonStats = statsBySeason.get(currentSeason);
	const currentValue = getContractValue(p, currentSeasonStats?.minutes ?? 0);
	const valueNoPot =
		typeof p.valueNoPot === "number" && Number.isFinite(p.valueNoPot)
			? p.valueNoPot
			: p.value;
	const bpm = getBpmCorrection(valueNoPot, currentSeason, statsBySeason);
	const latentValue = currentValue + bpm.correction;
	const salaryCapPct = getBasketballSalaryCapPercentage(latentValue);
	const gamesPerSeason = g.get("numGames");
	const availability = getBasketballContractAvailabilityAdjustment(
		p.injury?.gamesRemaining ?? 0,
		contractYears,
	);
	const rawAmount = g.get("salaryCap") * salaryCapPct;
	const pointAmount = clampContractAmountForPlayer(
		p,
		rawAmount,
		teamTid,
		contractYears,
	);

	return {
		baseContractValue: currentValue,
		expectedBpm: bpm.expectedBpm,
		weightedBpmResidual: bpm.weightedResidual,
		bpmCorrection: bpm.correction,
		latentValue,
		salaryCapPct,
		contractYears,
		gamesPerSeason,
		playoffGamesPerSeason: availability.playoffGamesPerSeason,
		pricedPostseasonGamesPerSeason: availability.pricedPostseasonGamesPerSeason,
		offseasonHealingGames: availability.offseasonHealingGames,
		contractGames: availability.contractGames,
		unavailableGames: availability.unavailableGames,
		unavailableShare: availability.unavailableShare,
		availabilityFactor: availability.availabilityFactor,
		rawAmount,
		pointAmount,
		pointCapPct: pointAmount / g.get("salaryCap"),
	};
};

export type {
	BpmCorrection,
	BpmSeasonSignal,
	ContractMarketResult,
} from "./types.ts";
