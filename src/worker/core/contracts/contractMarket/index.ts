import { getContractMarketFeatures } from "./features.ts";
import { placeContractMarketAmount } from "./placement.ts";
import { getContractMarketRange, selectContractMarketTier } from "./tiers.ts";
import type { ContractMarketPlayer, ContractMarketResult } from "./types.ts";

export const getBasketballContractMarketDemand = (
	p: ContractMarketPlayer,
): ContractMarketResult => {
	const features = getContractMarketFeatures(p);
	const tier = selectContractMarketTier(features);
	const range = getContractMarketRange(tier, features);
	return {
		...placeContractMarketAmount(features, tier, range),
		range,
	};
};

export type {
	ContractMarketFeatures,
	ContractMarketRange,
	ContractMarketResult,
	ContractMarketTier,
} from "./types.ts";
