const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export const PLAN_AWARE_COURT_TIMER_BLEND = 0.75;

export const getPlanAwareCourtTimer = ({
	legacyRequiredWait,
	remainingGame,
	remainingNeed,
	restShare,
	completedBench,
	plannedMinutes,
}: {
	legacyRequiredWait: number;
	remainingGame: number;
	remainingNeed: number;
	restShare: number;
	completedBench: number;
	plannedMinutes: number;
}) => {
	const pairedOnCourtWait =
		restShare <= 1e-7
			? remainingNeed
			: completedBench * (plannedMinutes / restShare);
	const desiredWait = Math.min(remainingGame, remainingNeed, pairedOnCourtWait);
	const blendedWait =
		legacyRequiredWait +
		PLAN_AWARE_COURT_TIMER_BLEND * (desiredWait - legacyRequiredWait);
	return {
		desiredWait,
		blendedWait,
		courtTime: 2 - blendedWait,
	};
};

export const DYNAMIC_MINUTES_CONFIG = {
	gain: 4,
	stabilityFloorMinutes: 4,
	minMultiplier: 0.35,
	maxMultiplier: 2.4,
	fatigueEnergySoft: 0.68,
	fatigueEnergyHard: 0.5,
	continuousStintSoft: 10,
	continuousStintHard: 14,
	fatiguePositiveCapSoft: 1.75,
	fatiguePositiveCapHard: 1.1,
	tinyTargetMaxMinutes: 6,
	tinyCompletionToleranceMinutes: 0.75,
	tinyReentryMaxMultiplier: 0.2,
} as const;

const getSeverity = ({
	value,
	soft,
	hard,
	inverted,
}: {
	value: number;
	soft: number;
	hard: number;
	inverted: boolean;
}) => {
	const denominator = inverted ? soft - hard : hard - soft;
	return inverted
		? clamp((soft - value) / denominator, 0, 1)
		: clamp((value - soft) / denominator, 0, 1);
};

/** Frozen Dynamic-final controller, extracted from the validated scratch arm. */
const getDynamicMinutesMultiplier = ({
	targetMinutes,
	regulationMinutes,
	elapsed,
	playedMinutes,
	energy,
	onCourt,
	continuousStintMinutes,
	completedPositiveStint,
}: {
	targetMinutes: number;
	regulationMinutes: number;
	elapsed: number;
	playedMinutes: number;
	energy: number;
	onCourt: boolean;
	continuousStintMinutes: number;
	completedPositiveStint: boolean;
}) => {
	const config = DYNAMIC_MINUTES_CONFIG;
	const deficit = targetMinutes * (elapsed / regulationMinutes) - playedMinutes;
	const denominator = Math.max(
		config.stabilityFloorMinutes * (regulationMinutes / 48),
		regulationMinutes - elapsed,
	);
	const rawMultiplier =
		targetMinutes <= 0
			? config.minMultiplier
			: clamp(
					Math.exp(config.gain * (deficit / denominator)),
					config.minMultiplier,
					config.maxMultiplier,
				);
	let multiplier = rawMultiplier;

	if (onCourt && rawMultiplier > 1) {
		const fatigueSeverity = getSeverity({
			value: energy,
			soft: config.fatigueEnergySoft,
			hard: config.fatigueEnergyHard,
			inverted: true,
		});
		const stintSeverity = getSeverity({
			value: continuousStintMinutes,
			soft: config.continuousStintSoft,
			hard: config.continuousStintHard,
			inverted: false,
		});
		const severity = Math.max(fatigueSeverity, stintSeverity);
		if (severity > 0) {
			const positiveCap =
				config.fatiguePositiveCapSoft +
				severity *
					(config.fatiguePositiveCapHard - config.fatiguePositiveCapSoft);
			multiplier = Math.min(multiplier, positiveCap);
		}
	}

	const tinyTargetServed =
		targetMinutes > 0 &&
		targetMinutes < config.tinyTargetMaxMinutes &&
		completedPositiveStint &&
		playedMinutes >=
			Math.max(0, targetMinutes - config.tinyCompletionToleranceMinutes);
	if (tinyTargetServed && !onCourt) {
		multiplier = Math.min(multiplier, config.tinyReentryMaxMultiplier);
	}

	return multiplier;
};

export default getDynamicMinutesMultiplier;
