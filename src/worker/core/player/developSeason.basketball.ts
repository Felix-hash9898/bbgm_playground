import limitRating from "./limitRating.ts";
import { helpers, random } from "../../util/index.ts";
import type {
	PlayerRatings,
	RatingKey,
} from "../../../common/types.basketball.ts";
import { coachingEffect } from "../../../common/budgetLevels.ts";

type RatingFormula = {
	ageModifier: (age: number) => number;
	changeLimits: (age: number) => [number, number];
};

const shootingFormula: RatingFormula = {
	ageModifier: (age: number) => {
		// Reverse most of the age-related decline in calcBaseChange
		if (age <= 28) {
			return 0;
		}

		if (age <= 31) {
			return 0.5;
		}

		if (age <= 35) {
			return 1.5;
		}

		return 2;
	},
	changeLimits: () => [-3, 13],
};
const iqFormula: RatingFormula = {
	ageModifier: (age: number) => {
		if (age <= 21) {
			return 4;
		}

		if (age <= 23) {
			return 3;
		}

		// IQ stays flat through 35 — veterans keep learning the game
		if (age <= 28) {
			return 0;
		}

		if (age <= 31) {
			return 1; // offsets calcBase -1, net ~0
		}

		if (age <= 35) {
			return 2; // offsets calcBase -2, net ~0
		}

		if (age <= 40) {
			return 2.5; // net avg ~-0.5/yr
		}

		return 2; // net avg ~-1.8/yr at 41+
	},
	changeLimits: (age) => {
		if (age >= 24) {
			return [-3, 9];
		}

		// For 19: [-3, 32]
		// For 23: [-3, 12]
		return [-3, 7 + 5 * (24 - age)];
	},
};
const ratingsFormulas: Record<Exclude<RatingKey, "hgt">, RatingFormula> = {
	stre: {
		ageModifier: (age: number) => {
			if (age <= 25) {
				return 1; // Still building strength
			}

			if (age <= 32) {
				return 1.5; // Peak physical prime, offset calcBaseChange decline
			}

			if (age <= 36) {
				return 0.5; // Slow the decline slightly
			}

			return 0;
		},
		changeLimits: () => [-8, 12],
	},
	spd: {
		ageModifier: (age: number) => {
			if (age <= 27) {
				return 0;
			}

			if (age <= 28) {
				return -0.5;
			}

			if (age <= 30) {
				return -1.5;
			}

			if (age <= 32) {
				return -1.5;
			}

			if (age <= 35) {
				return -2.0;
			}

			if (age <= 38) {
				return -2.5;
			}

			if (age <= 40) {
				return -3.5;
			}

			return -7.0;
		},
		changeLimits: () => [-12, 2],
	},
	jmp: {
		ageModifier: (age: number) => {
			if (age <= 27) {
				return 0;
			}

			if (age <= 28) {
				return -0.5;
			}

			if (age <= 30) {
				return -1.5;
			}

			if (age <= 32) {
				return -1.5;
			}

			if (age <= 35) {
				return -2.0;
			}

			if (age <= 38) {
				return -2.5;
			}

			if (age <= 40) {
				return -3.5;
			}

			return -7.0;
		},
		changeLimits: () => [-12, 2],
	},
	endu: {
		ageModifier: (age: number) => {
			if (age <= 23) {
				return random.uniform(0, 9);
			}

			if (age <= 31) {
				return 0;
			}

			if (age <= 33) {
				return -1; // transition — smooth the cliff at 32
			}

			if (age <= 36) {
				return -2;
			}

			if (age <= 41) {
				return -4;
			}

			return -8;
		},
		changeLimits: () => [-11, 19],
	},
	dnk: {
		ageModifier: (age: number) => {
			// Like shootingForumla, except for old players
			if (age <= 28) {
				return 0;
			}

			return 0.5;
		},
		changeLimits: () => [-3, 13],
	},
	ins: shootingFormula,
	ft: shootingFormula,
	fg: shootingFormula,
	tp: shootingFormula,
	oiq: iqFormula,
	diq: iqFormula,
	drb: {
		ageModifier: shootingFormula.ageModifier,
		changeLimits: () => [-2, 5],
	},
	pss: {
		ageModifier: shootingFormula.ageModifier,
		changeLimits: () => [-2, 5],
	},
	reb: {
		ageModifier: shootingFormula.ageModifier,
		changeLimits: () => [-2, 5],
	},
};

const calcBaseChange = (age: number, coachingLevel: number): number => {
	let val: number;

	if (age <= 21) {
		val = 2;
	} else if (age <= 25) {
		val = 1;
	} else if (age <= 28) {
		val = 0;
	} else if (age <= 31) {
		val = -1;
	} else if (age <= 35) {
		val = -2;
	} else if (age <= 40) {
		val = -3;
	} else if (age <= 43) {
		val = -4;
	} else {
		val = -5;
	}

	// Noise
	if (age <= 23) {
		val += helpers.bound(random.realGauss(0, 5), -4, 20);
	} else if (age <= 25) {
		val += helpers.bound(random.realGauss(0, 5), -4, 10);
	} else {
		val += helpers.bound(random.realGauss(0, 3), -2, 4);
	}

	val *= 1 + (val > 0 ? 1 : -1) * coachingEffect(coachingLevel);

	return val;
};

const developSeason = (
	ratings: PlayerRatings,
	age: number,
	coachingLevel: number,
) => {
	// In young players, height can sometimes increase
	if (age <= 21) {
		const heightRand = Math.random();

		if (heightRand > 0.99 && age <= 20 && ratings.hgt <= 99) {
			ratings.hgt += 1;
		}

		if (heightRand > 0.999 && ratings.hgt <= 99) {
			ratings.hgt += 1;
		}
	}

	const baseChange = calcBaseChange(age, coachingLevel);

	for (const key of helpers.keys(ratingsFormulas)) {
		const ageModifier = ratingsFormulas[key].ageModifier(age);
		const changeLimits = ratingsFormulas[key].changeLimits(age);

		ratings[key] = limitRating(
			ratings[key] +
				helpers.bound(
					(baseChange + ageModifier) * random.uniform(0.4, 1.4),
					changeLimits[0],
					changeLimits[1],
				),
		);
	}
};

export default developSeason;
