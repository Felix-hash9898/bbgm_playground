const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

/**
 * Compute a static multiplier for substitution priority (ovrs) based on user-set
 * targetMinutes vs. the system's auto baseline.
 *
 * This is a continuous modifier that nudges rotation decisions
 * without overriding fatigue, foul trouble, position legality, or other factors.
 *
 * Range: [0.60, 1.60] (Version E: down to -40%, up to +60% nudge)
 * Exponent: 0.5 (square root mapping)
 */
const getTargetMinutesModifier = ({
	targetMinutes,
	autoSoftCap,
	regulationMinutes,
	minClamp = 0.6,
	maxClamp = 1.6,
	exponent = 0.5,
}: {
	targetMinutes?: number;
	autoSoftCap: number;
	regulationMinutes: number;
	minClamp?: number;
	maxClamp?: number;
	exponent?: number;
}): number => {
	// No target set → no effect
	if (
		targetMinutes === undefined ||
		targetMinutes === null ||
		!Number.isFinite(targetMinutes)
	) {
		return 1;
	}

	// Guard against bad autoSoftCap
	if (!Number.isFinite(autoSoftCap) || autoSoftCap <= 0) {
		return 1;
	}

	// Scale targetMinutes to actual game length (user always thinks in 48-min terms)
	const targetScaled = targetMinutes * (regulationMinutes / 48);

	const ratio = targetScaled / autoSoftCap;

	const rawModifier = Math.pow(Math.max(ratio, 0), exponent);

	return clamp(rawModifier, minClamp, maxClamp);
};

export default getTargetMinutesModifier;
