export const getInjuryOverloadFactor = (minutes: number) => {
	let factor = 1;

	// Preserve the existing "more time on court = more exposure" model.
	// This only adds a nonlinear overload penalty once minutes get high.
	if (minutes > 28) {
		factor += (Math.min(minutes, 34) - 28) * 0.006666666666666667;
	}
	if (minutes > 34) {
		factor += (Math.min(minutes, 40) - 34) * 0.013333333333333334;
	}
	if (minutes > 40) {
		factor += (Math.min(minutes, 48) - 40) * 0.01625;
	}

	return factor;
};

const getInjuryRate = (
	baseRate: number,
	age: number,
	playingThroughInjury?: boolean,
) => {
	// Modulate injuryRate by age - assume default is 26 yo, and increase/decrease by 3%
	let injuryRate = baseRate * 1.03 ** (Math.min(50, age) - 26);

	// 50% higher if playing through an injury
	if (playingThroughInjury) {
		injuryRate *= 1.5;
	}

	return injuryRate;
};

export default getInjuryRate;
