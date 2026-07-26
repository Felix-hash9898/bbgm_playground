import { assert, test } from "vitest";
import { setRandomDebutRatingsSeason } from "./setRandomDebutRatingsSeason.ts";

test("moves the processed random-debut ratings row to the league season", () => {
	const p = {
		ratings: [{ season: 1998 }, { season: 1999 }],
	};

	setRandomDebutRatingsSeason(p, 1972);

	assert.deepEqual(p.ratings, [{ season: 1998 }, { season: 1972 }]);
});

test("rejects a random-debut player without ratings", () => {
	assert.throws(
		() => setRandomDebutRatingsSeason({ ratings: [] }, 1972),
		/no ratings row/,
	);
});
