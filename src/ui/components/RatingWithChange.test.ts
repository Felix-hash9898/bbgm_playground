import { beforeAll, expect, test } from "vitest";

let wrappedRatingWithChange: typeof import("./RatingWithChange.tsx").wrappedRatingWithChange;

beforeAll(async () => {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: () => null,
			removeItem: () => {},
			setItem: () => {},
		},
	});
	wrappedRatingWithChange = (await import("./RatingWithChange.tsx"))
		.wrappedRatingWithChange;
});

test("keeps display, search, sort, and CSV rating semantics separate", () => {
	const increased = wrappedRatingWithChange(63, 2);
	expect(increased.exportValue).toBe(63);
	expect(increased.searchValue).toBe("63 (+2)");
	expect(increased.sortValue).toBe(63.502);

	const decreased = wrappedRatingWithChange(0, -2);
	expect(decreased.exportValue).toBe(0);
	expect(decreased.searchValue).toBe("0 (-2)");
	expect(decreased.sortValue).toBe(0.498);

	const unchanged = wrappedRatingWithChange(63, 0);
	expect(unchanged.exportValue).toBe(63);
	expect(unchanged.searchValue).toBe("63");
	expect(unchanged.sortValue).toBe(63.5);
});
