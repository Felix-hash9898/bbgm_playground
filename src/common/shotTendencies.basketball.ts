import { helpers } from "./index.ts";

export type ShotTendencies = {
	atRimTendency: number;
	lowPostTendency: number;
	midRangeTendency: number;
	threePointTendency: number;
};

export type ShotTendencyProfileID =
	| "balanced"
	| "spacer"
	| "shotCreator"
	| "slasher"
	| "postScorer";

type ShotTendencyRatings = {
	fg?: number;
	hgt?: number;
	ins?: number;
	dnk?: number;
	oiq?: number;
	spd?: number;
	stre?: number;
	tp?: number;
};

type ObservedShotStats = {
	fga?: number;
	fgaAtRim?: number;
	fgaLowPost?: number;
	fgaMidRange?: number;
	tpa?: number;
};

type ShotTendencyProfile = {
	description: string;
	id: ShotTendencyProfileID;
	label: string;
	tendencies: ShotTendencies;
};

const MIN_TENDENCY = 0.5;
const MAX_TENDENCY = 1.8;
const OBSERVED_SAMPLE_K = 400;

const LEAGUE_AVERAGE_SHARES = {
	atRim: 0.29,
	lowPost: 0.11,
	midRange: 0.2,
	threePoint: 0.34,
} as const;

export const DEFAULT_SHOT_TENDENCIES: ShotTendencies = {
	atRimTendency: 1,
	lowPostTendency: 1,
	midRangeTendency: 1,
	threePointTendency: 1,
};

export const SHOT_TENDENCY_PRESETS: ShotTendencyProfile[] = [
	{
		id: "balanced",
		label: "Balanced",
		description: "Keeps the default shot mix.",
		tendencies: DEFAULT_SHOT_TENDENCIES,
	},
	{
		id: "spacer",
		label: "Spacer",
		description: "More threes, fewer post-ups and long twos.",
		tendencies: {
			atRimTendency: 0.95,
			lowPostTendency: 0.72,
			midRangeTendency: 0.82,
			threePointTendency: 1.38,
		},
	},
	{
		id: "shotCreator",
		label: "Shot Creator",
		description: "Leans into pull-ups and bailout jumpers.",
		tendencies: {
			atRimTendency: 0.96,
			lowPostTendency: 0.84,
			midRangeTendency: 1.35,
			threePointTendency: 1.06,
		},
	},
	{
		id: "slasher",
		label: "Slasher",
		description: "Attacks the rim and cuts back on jumpers.",
		tendencies: {
			atRimTendency: 1.36,
			lowPostTendency: 0.9,
			midRangeTendency: 0.82,
			threePointTendency: 0.82,
		},
	},
	{
		id: "postScorer",
		label: "Post Scorer",
		description: "More paint touches and low-post looks.",
		tendencies: {
			atRimTendency: 1.08,
			lowPostTendency: 1.42,
			midRangeTendency: 0.92,
			threePointTendency: 0.74,
		},
	},
];

const clampShotTendency = (value: number) =>
	helpers.bound(value, MIN_TENDENCY, MAX_TENDENCY);

export const getShotTendencies = (
	input?: Partial<ShotTendencies>,
): ShotTendencies => ({
	atRimTendency: clampShotTendency(
		input?.atRimTendency ?? DEFAULT_SHOT_TENDENCIES.atRimTendency,
	),
	lowPostTendency: clampShotTendency(
		input?.lowPostTendency ?? DEFAULT_SHOT_TENDENCIES.lowPostTendency,
	),
	midRangeTendency: clampShotTendency(
		input?.midRangeTendency ?? DEFAULT_SHOT_TENDENCIES.midRangeTendency,
	),
	threePointTendency: clampShotTendency(
		input?.threePointTendency ?? DEFAULT_SHOT_TENDENCIES.threePointTendency,
	),
});

export const getShotTendencyEffect = (value?: number) =>
	Math.sqrt(clampShotTendency(value ?? 1));

export const getShotTendenciesForProfile = (
	profileID: ShotTendencyProfileID,
): ShotTendencies =>
	getShotTendencies(
		SHOT_TENDENCY_PRESETS.find((preset) => preset.id === profileID)?.tendencies,
	);

export const getShotTendencyProfileId = (
	input?: Partial<ShotTendencies>,
): ShotTendencyProfileID | "custom" => {
	const normalized = getShotTendencies(input);

	for (const preset of SHOT_TENDENCY_PRESETS) {
		if (
			Math.abs(normalized.atRimTendency - preset.tendencies.atRimTendency) <
				1e-6 &&
			Math.abs(normalized.lowPostTendency - preset.tendencies.lowPostTendency) <
				1e-6 &&
			Math.abs(
				normalized.midRangeTendency - preset.tendencies.midRangeTendency,
			) < 1e-6 &&
			Math.abs(
				normalized.threePointTendency - preset.tendencies.threePointTendency,
			) < 1e-6
		) {
			return preset.id;
		}
	}

	return "custom";
};

export const getShotTendenciesFromRatings = (
	ratings: ShotTendencyRatings,
): ShotTendencies => {
	const fg = ratings.fg ?? 50;
	const hgt = ratings.hgt ?? 50;
	const ins = ratings.ins ?? 50;
	const dnk = ratings.dnk ?? 50;
	const oiq = ratings.oiq ?? 50;
	const spd = ratings.spd ?? 50;
	const stre = ratings.stre ?? 50;
	const tp = ratings.tp ?? 50;

	const threePointTendency = clampShotTendency(
		1 + (tp - 50) / 90 - (ins - 50) / 240 - (stre - 50) / 450,
	);
	const midRangeTendency = clampShotTendency(
		1 + (fg - 50) / 140 + (oiq - 50) / 260 - (dnk - 50) / 380,
	);
	const atRimTendency = clampShotTendency(
		1 +
			(dnk - 50) / 120 +
			(spd - 50) / 260 +
			(hgt - 50) / 320 -
			(tp - 50) / 420,
	);
	const lowPostTendency = clampShotTendency(
		1 +
			(ins - 50) / 110 +
			(stre - 50) / 180 +
			(hgt - 50) / 250 -
			(tp - 50) / 500,
	);

	return {
		atRimTendency,
		lowPostTendency,
		midRangeTendency,
		threePointTendency,
	};
};

const combineObservedWithPrior = ({
	leagueAverageShare,
	observedAttempts,
	priorValue,
	sampleWeight,
}: {
	leagueAverageShare: number;
	observedAttempts: number | undefined;
	priorValue: number;
	sampleWeight: number;
}) => {
	if (observedAttempts === undefined) {
		return priorValue;
	}

	const observedShare = observedAttempts;
	const observedValue = clampShotTendency(observedShare / leagueAverageShare);
	return clampShotTendency(
		priorValue + sampleWeight * (observedValue - priorValue),
	);
};

export const getShotTendenciesFromObservedStats = (
	stats: ObservedShotStats,
	prior: ShotTendencies,
): ShotTendencies => {
	const fga = stats.fga ?? 0;
	if (fga <= 0) {
		return prior;
	}

	const sampleWeight = fga / (fga + OBSERVED_SAMPLE_K);

	return {
		atRimTendency: combineObservedWithPrior({
			leagueAverageShare: LEAGUE_AVERAGE_SHARES.atRim,
			observedAttempts:
				stats.fgaAtRim !== undefined ? stats.fgaAtRim / fga : undefined,
			priorValue: prior.atRimTendency,
			sampleWeight,
		}),
		lowPostTendency: combineObservedWithPrior({
			leagueAverageShare: LEAGUE_AVERAGE_SHARES.lowPost,
			observedAttempts:
				stats.fgaLowPost !== undefined ? stats.fgaLowPost / fga : undefined,
			priorValue: prior.lowPostTendency,
			sampleWeight,
		}),
		midRangeTendency: combineObservedWithPrior({
			leagueAverageShare: LEAGUE_AVERAGE_SHARES.midRange,
			observedAttempts:
				stats.fgaMidRange !== undefined ? stats.fgaMidRange / fga : undefined,
			priorValue: prior.midRangeTendency,
			sampleWeight,
		}),
		threePointTendency: combineObservedWithPrior({
			leagueAverageShare: LEAGUE_AVERAGE_SHARES.threePoint,
			observedAttempts: stats.tpa !== undefined ? stats.tpa / fga : undefined,
			priorValue: prior.threePointTendency,
			sampleWeight,
		}),
	};
};
