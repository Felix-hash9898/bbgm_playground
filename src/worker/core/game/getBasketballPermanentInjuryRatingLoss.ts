type AthleticRating = "spd" | "jmp" | "endu";

type RatingRange = readonly [min: number, max: number];

type PermanentInjuryProfile = {
	probability: number;
	ratings: Partial<Record<AthleticRating, RatingRange>>;
};

const basketballPermanentInjuryRolloutInjuries = [
	"Sprained Ankle",
	"Knee Soreness",
	"Strained Hamstring",
	"Strained Calf",
	"Ankle Soreness",
	"Strained Groin",
	"Foot Soreness",
	"Hip Soreness",
	"Bruised Knee",
	"Sprained Knee",
	"Achilles Soreness",
	"Bruised Hip",
	"Bruised Quadriceps",
	"Patellar Tendinitis",
	"Sprained Toe",
	"Sprained Foot",
	"Bruised Leg",
	"Plantar Fasciitis",
	"Bruised Foot",
	"Quadriceps Soreness",
	"Strained Quadriceps",
	"Torn ACL",
	"Fractured Ankle",
	"Fractured Foot",
	"Toe Soreness",
	"Torn Meniscus",
	"Torn Achilles Tendon",
	"Ankle Contusion",
	"Fractured Toe",
] as const;

// Temporary rollout boundary: only these studied lower-body injuries are
// handled by the new mechanism. Every other basketball injury keeps the
// pre-existing duration-based permanent-loss behavior.
export const basketballPermanentInjuryRollout: ReadonlySet<string> = new Set(
	basketballPermanentInjuryRolloutInjuries,
);

const profiles: Record<string, PermanentInjuryProfile> = {
	"Torn Achilles Tendon": {
		probability: 0.65,
		ratings: {
			spd: [3, 10],
			jmp: [3, 11],
			endu: [1, 9],
		},
	},
	"Torn ACL": {
		probability: 0.25,
		ratings: {
			spd: [3, 10],
			jmp: [3, 12],
			endu: [1, 6],
		},
	},
	"Torn Meniscus": {
		probability: 0.075,
		ratings: {
			jmp: [1, 3],
		},
	},
	"Fractured Ankle": {
		probability: 0.05,
		ratings: {
			spd: [1, 2],
			jmp: [1, 2],
			endu: [0, 1],
		},
	},
};

const randomInteger = (random: () => number, [min, max]: RatingRange) =>
	min + Math.floor(random() * (max - min + 1));

const getBasketballPermanentInjuryRatingLoss = ({
	injuryType,
	isReaggravation,
	ratingsLocked,
	random = Math.random,
}: {
	injuryType: string;
	isReaggravation: boolean;
	ratingsLocked: boolean;
	random?: () => number;
}): Partial<Record<AthleticRating, number>> | undefined => {
	if (isReaggravation || ratingsLocked) {
		return;
	}

	const profile = profiles[injuryType];
	if (!profile || random() >= profile.probability) {
		return;
	}

	const losses: Partial<Record<AthleticRating, number>> = {};
	for (const rating of ["spd", "jmp", "endu"] as const) {
		const range = profile.ratings[rating];
		if (range) {
			const loss = randomInteger(random, range);
			if (loss > 0) {
				losses[rating] = loss;
			}
		}
	}

	return Object.keys(losses).length > 0 ? losses : undefined;
};

export default getBasketballPermanentInjuryRatingLoss;
