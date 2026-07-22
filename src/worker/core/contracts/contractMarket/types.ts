import type {
	MinimalPlayerRatings,
	Player,
	PlayerWithoutKey,
} from "../../../../common/types.ts";

export type ContractMarketPlayer =
	| Player<MinimalPlayerRatings>
	| PlayerWithoutKey<MinimalPlayerRatings>;

export type ContractMarketTier =
	| "MINIMUM_LEVEL"
	| "VETERAN_MINIMUM_PLUS"
	| "LOW_ROTATION_PLUS"
	| "SPECIALIST_ROTATION"
	| "YOUNG_UPSIDE_SUSPECT"
	| "VETERAN_ROTATION_GUARD"
	| "LOW_END_STARTER"
	| "HIGH_END_ROTATION"
	| "SOLID_STARTER"
	| "YOUNG_PROVEN_STARTER"
	| "STAR_NEAR_MAX"
	| "SUPERSTAR_MAX";

export type ContractMarketFeatures = {
	age: number;
	pos: string;
	ovr: number;
	pot: number;
	value: number;
	valueNoPot: number;
	potentialPremium: number;
	contractValue: number;
	minutes: number;
	games: number;
	starts: number;
	minutesPerGame: number;
	starterShare: number;
	per: number;
	ewa: number;
	vorp: number;
	bpm: number;
	obpm: number;
	dbpm: number;
	onOff: number;
	pts: number;
	trb: number;
	ast: number;
	stl: number;
	blk: number;
	tov: number;
	trueShooting: number;
	effectiveFg: number;
	usage: number;
	compUsage: number;
	astPct: number;
	compPassing: number;
	compShootingThree: number;
	compRebounding: number;
	compDefense: number;
	compDefenseInterior: number;
	compDefensePerimeter: number;
	compBlocking: number;
	skillThreeMargin: number;
	skillReboundingMargin: number;
	skillDefenseInteriorMargin: number;
	minContract: number;
	salaryCap: number;
	eligibleMax: number;
	maxContractLength: number;
	normalContractYears: number;
};

export type ContractMarketRange = {
	minAmount: number;
	maxAmount: number;
	minCapPct: number;
	maxCapPct: number;
	modelYears: string;
};

export type ContractMarketResult = {
	tier: ContractMarketTier;
	range: ContractMarketRange;
	pointAmount: number;
	pointCapPct: number;
	placementScore: number;
	yearsHint: string;
	riskFlags: string[];
};
