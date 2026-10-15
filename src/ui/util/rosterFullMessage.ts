export type ContractStructureFilter =
	| "all"
	| "standard"
	| "player"
	| "team"
	| "twoWay";

export const getStandardRosterFullReason = (isBasketball: boolean) =>
	isBasketball
		? "Your team has no standard roster spots available. Use Negotiate to check whether a Two-Way offer is eligible."
		: "Your team has reached its maximum roster size. Release or trade a player before signing another player.";

export const getNegotiationRosterFullReason = (isBasketball: boolean) =>
	isBasketball
		? "No standard roster spots are available. Standard offers—including MLE, Minimum, and player/team options—each use one. A qualifying Two-Way offer uses a separate slot and may still be available."
		: "Your team has reached its maximum roster size. Release or trade a player before signing another player.";

export const getContractStructureFilters = (
	isBasketball: boolean,
): { key: ContractStructureFilter; label: string }[] => [
	{ key: "all" as const, label: "All" },
	{ key: "standard" as const, label: "Standard" },
	...(isBasketball
		? [
				{ key: "player" as const, label: "PO" },
				{ key: "team" as const, label: "TO" },
				{ key: "twoWay" as const, label: "Two-Way" },
			]
		: []),
];
