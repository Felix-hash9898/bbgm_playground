export type ShotPriorityInput = {
	usage: number;
	usageBias: number;
	fatigueFactor: number;
};

export type ShotPriorityPlayerContext = {
	baselineShare: number;
	adjustedShare: number;
	shareRatio: number;
	relativeIncrease: number;
	relativeDecrease: number;
	overload: number;
	relief: number;
};

export type ShotPriorityContext = {
	players: ShotPriorityPlayerContext[];
	baselineWeights: number[];
	adjustedWeights: number[];
	teamUsageOverload: number;
};

export const getUsageSelectionWeights = (players: ShotPriorityInput[]) => {
	if (players.length === 0) {
		return {
			weights: [] as number[],
			shares: [] as number[],
		};
	}

	const values = players.map(({ usage, usageBias, fatigueFactor }) => {
		const safeUsage = Number.isFinite(usage) ? Math.max(0, usage) : 0;
		const safeUsageBias =
			Number.isFinite(usageBias) && usageBias > 0 ? usageBias : 1;
		const safeFatigue = Number.isFinite(fatigueFactor)
			? Math.max(0, fatigueFactor)
			: 0;
		const value = safeUsage * safeUsageBias * safeFatigue;
		return Number.isFinite(value) ? value : 0;
	});
	let weights = values.map((value) => value ** 1.25);

	// The normal path above exactly matches ratingArray. Scale only as an
	// overflow fallback; common scaling does not affect the floor or shares.
	if (weights.some((weight) => !Number.isFinite(weight))) {
		const max = Math.max(0, ...values);
		weights =
			max > 0
				? values.map((value) => (value / max) ** 1.25)
				: values.map(() => 0);
	}

	const totalBeforeFloor = weights.reduce((sum, weight) => sum + weight, 0);
	if (!Number.isFinite(totalBeforeFloor) || totalBeforeFloor <= 0) {
		return {
			weights: players.map(() => 0),
			shares: players.map(() => 1 / players.length),
		};
	}

	const floor = 0.05 * totalBeforeFloor;
	weights = weights.map((weight) => Math.max(weight, floor));
	const totalAfterFloor = weights.reduce((sum, weight) => sum + weight, 0);

	if (!Number.isFinite(totalAfterFloor) || totalAfterFloor <= 0) {
		return {
			weights: players.map(() => 0),
			shares: players.map(() => 1 / players.length),
		};
	}

	return {
		weights,
		shares: weights.map((weight) => weight / totalAfterFloor),
	};
};

export const getShotPriorityContext = (
	players: ShotPriorityInput[],
): ShotPriorityContext => {
	if (players.length === 0) {
		return {
			players: [],
			baselineWeights: [],
			adjustedWeights: [],
			teamUsageOverload: 0,
		};
	}

	const baseline = getUsageSelectionWeights(
		players.map((player) => ({
			...player,
			usageBias: 1,
		})),
	);
	const adjusted = getUsageSelectionWeights(players);

	const playerContexts = baseline.shares.map((baselineShare, index) => {
		const adjustedShare = adjusted.shares[index]!;
		let shareRatio = baselineShare > 0 ? adjustedShare / baselineShare : 1;
		if (!Number.isFinite(shareRatio) || Math.abs(shareRatio - 1) < 1e-12) {
			shareRatio = 1;
		}
		const relativeIncrease = Math.max(0, shareRatio - 1);
		const relativeDecrease = Math.max(0, 1 - shareRatio);

		return {
			baselineShare,
			adjustedShare,
			shareRatio,
			relativeIncrease,
			relativeDecrease,
			overload: Math.min(relativeIncrease, 0.25),
			relief: Math.min(relativeDecrease, 0.15),
		};
	});

	const teamUsageOverload = playerContexts.reduce(
		(sum, context) => sum + context.baselineShare * context.overload,
		0,
	);

	return {
		players: playerContexts,
		baselineWeights: baseline.weights,
		adjustedWeights: adjusted.weights,
		teamUsageOverload,
	};
};
