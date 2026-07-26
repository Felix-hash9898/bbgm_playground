export const setRandomDebutRatingsSeason = <
	T extends {
		ratings: {
			season: number;
		}[];
	},
>(
	p: T,
	season: number,
) => {
	const ratings = p.ratings.at(-1);
	if (!ratings) {
		throw new Error("Random-debut player has no ratings row");
	}
	ratings.season = season;
};
