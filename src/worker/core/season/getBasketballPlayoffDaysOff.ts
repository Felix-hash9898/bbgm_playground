export const getDaysOffBeforeGame = (
	nextGameDay: number,
	games: {
		day?: number;
		season: number;
	}[],
	season: number,
	daysProcessedThrough?: {
		day: number;
		season: number;
	},
) => {
	const priorDays = games
		.filter(
			(game) =>
				game.season === season &&
				game.day !== undefined &&
				game.day <= nextGameDay,
		)
		.map((game) => game.day!);

	if (daysProcessedThrough?.season === season) {
		priorDays.push(daysProcessedThrough.day);
	}

	if (priorDays.length === 0) {
		return 0;
	}

	return Math.max(0, nextGameDay - Math.max(...priorDays) - 1);
};

export const getDaysOffSimulationPlan = (
	numDaysOff: number,
	numDays: number,
	playingOneGame: boolean,
) => {
	const numDaysOffToProcess = playingOneGame
		? numDaysOff
		: Math.min(numDaysOff, numDays);
	const numDaysRemaining = playingOneGame
		? numDays
		: numDays - numDaysOffToProcess;

	return {
		numDaysOffToProcess,
		numDaysRemaining,
		playGame: numDaysOffToProcess === numDaysOff && numDaysRemaining > 0,
	};
};
