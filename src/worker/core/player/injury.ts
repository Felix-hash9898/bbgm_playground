import { defaultInjuries, g, helpers, random } from "../../util/index.ts";
import type { InjuriesSetting, PlayerInjury } from "../../../common/types.ts";
import { healthEffect } from "../../../common/budgetLevels.ts";

type InjuryOccurrence = "any" | "inGame" | "postGame";

const getInGameWeight = (name: string, games: number) => {
	let weight = 0.35;

	if (
		/(torn|fractured|broken|dislocated|concussion|achilles|acl|mcl|pcl|meniscus|labrum)/i.test(
			name,
		)
	) {
		weight += 0.35;
	}

	if (
		/(strained|spasms|soreness|tightness|tendinitis|tendonitis|inflammation|plantar fasciitis|shin splints)/i.test(
			name,
		)
	) {
		weight -= 0.2;
	}

	if (games >= 20) {
		weight += 0.15;
	} else if (games <= 5) {
		weight -= 0.1;
	}

	return helpers.bound(weight, 0.05, 0.95);
};

const getOccurrenceWeight = (
	injury: InjuriesSetting[number],
	occurrence: InjuryOccurrence,
) => {
	if (occurrence === "any") {
		return injury.frequency;
	}

	const inGameWeight = getInGameWeight(injury.name, injury.games);
	return (
		injury.frequency *
		(occurrence === "inGame" ? inGameWeight : 1 - inGameWeight)
	);
};

const injury = (
	healthLevel: number,
	options?: {
		occurrence?: InjuryOccurrence;
	},
): PlayerInjury => {
	const injuries = g.get("injuries") ?? defaultInjuries;
	const occurrence = options?.occurrence ?? "any";
	const weights = injuries.map((row) => getOccurrenceWeight(row, occurrence));
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	const rand = random.uniform(0, totalWeight);
	let runningWeight = 0;
	let i = 0;
	for (; i < weights.length; i++) {
		runningWeight += weights[i]!;
		if (runningWeight >= rand) {
			break;
		}
	}
	const chosenInjury = injuries[Math.min(i, injuries.length - 1)]!;
	const gamesRemaining = Math.round(
		(1 + healthEffect(healthLevel)) *
			random.uniform(0.25, 1.75) *
			chosenInjury.games,
	);

	return {
		type: chosenInjury.name,
		gamesRemaining: helpers.bound(gamesRemaining, 0, Infinity),
	};
};

export default injury;
