import type {
	MinimalPlayerRatings,
	Player,
	PlayerWithoutKey,
} from "../../../../common/types.ts";

export type ContractMarketPlayer =
	| Player<MinimalPlayerRatings>
	| PlayerWithoutKey<MinimalPlayerRatings>;

export type BpmSeasonSignal = {
	season: number;
	bpm?: number;
	minutes: number;
	reliability: number;
	residual?: number;
};

export type BpmCorrection = {
	expectedBpm: number;
	weightedResidual: number;
	boundedResidual: number;
	correction: number;
	seasons: BpmSeasonSignal[];
};

export type ContractMarketResult = {
	baseContractValue: number;
	expectedBpm: number;
	weightedBpmResidual: number;
	bpmCorrection: number;
	latentValue: number;
	salaryCapPct: number;
	contractYears: number;
	gamesPerSeason: number;
	playoffGamesPerSeason: number;
	pricedPostseasonGamesPerSeason: number;
	offseasonHealingGames: number;
	contractGames: number;
	unavailableGames: number;
	unavailableShare: number;
	availabilityFactor: number;
	rawAmount: number;
	pointAmount: number;
	pointCapPct: number;
};
