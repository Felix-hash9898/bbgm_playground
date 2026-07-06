const BASE_TARGET_SHARES = [
	0.72, 0.7, 0.67, 0.65, 0.61, 0.47, 0.42, 0.36, 0.24, 0.17,
];

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const getBaseTargetShare = (rosterIndex: number) => {
	if (rosterIndex < BASE_TARGET_SHARES.length) {
		return BASE_TARGET_SHARES[rosterIndex]!;
	}

	const last = BASE_TARGET_SHARES.at(-1)!;
	return Math.max(
		0.08,
		last - 0.03 * (rosterIndex - BASE_TARGET_SHARES.length + 1),
	);
};

type Params = {
	availablePlayers: number;
	endurance: number;
	lateGame: boolean;
	minutes: number;
	playoffs: boolean;
	ptModifier: number;
	regulationMinutes: number;
	rosterIndex: number;
	targetMinutes?: number;
};

export const getAutoMinutesSoftCap = ({
	availablePlayers,
	endurance,
	playoffs,
	ptModifier,
	regulationMinutes,
	rosterIndex,
}: Omit<Params, "lateGame" | "minutes" | "targetMinutes">) => {
	const baseShare = getBaseTargetShare(rosterIndex);
	const depthMultiplier = clamp(10 / Math.max(availablePlayers, 6), 1, 1.35);
	const ptMultiplier = clamp(1 + (ptModifier - 1) * 0.35, 0.6, 1.2);
	const enduranceAdjustment = (endurance - 0.5) * 4;
	const playoffsAdjustment = playoffs ? 2 : 0;

	const target =
		regulationMinutes * baseShare * depthMultiplier * ptMultiplier +
		enduranceAdjustment +
		playoffsAdjustment;

	return clamp(
		target,
		regulationMinutes * 0.12,
		regulationMinutes * (playoffs ? 0.92 : 0.86),
	);
};

export const getMinutesSoftCap = ({
	availablePlayers,
	endurance,
	playoffs,
	ptModifier,
	regulationMinutes,
	rosterIndex,
	targetMinutes,
}: Omit<Params, "lateGame" | "minutes">) => {
	// targetMinutes acts as a soft cap target. It suppresses playing time when exceeded, but does not force DNP or prevent starting.
	if (
		targetMinutes !== undefined &&
		targetMinutes !== null &&
		Number.isFinite(targetMinutes)
	) {
		const targetMinutesScaled = targetMinutes * (regulationMinutes / 48);
		return clamp(
			targetMinutesScaled,
			0,
			regulationMinutes * (playoffs ? 0.92 : 0.86),
		);
	}

	return getAutoMinutesSoftCap({
		availablePlayers,
		endurance,
		playoffs,
		ptModifier,
		regulationMinutes,
		rosterIndex,
	});
};

const getMinutesLimitFactor = ({
	availablePlayers,
	endurance,
	lateGame,
	minutes,
	playoffs,
	ptModifier,
	regulationMinutes,
	rosterIndex,
	targetMinutes,
}: Params) => {
	const softCap = getMinutesSoftCap({
		availablePlayers,
		endurance,
		playoffs,
		ptModifier,
		regulationMinutes,
		rosterIndex,
		targetMinutes,
	});

	const excessMinutes = minutes - softCap;
	if (excessMinutes <= 0) {
		return 1;
	}

	const overloadWindow = Math.max(6, regulationMinutes / 6);
	const strength = lateGame ? 0.45 : playoffs ? 0.7 : 1;
	const floor = lateGame ? 0.55 : 0.35;

	return clamp(
		1 / (1 + strength * (excessMinutes / overloadWindow) ** 1.35),
		floor,
		1,
	);
};

export default getMinutesLimitFactor;
