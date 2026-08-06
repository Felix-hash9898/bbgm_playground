import { createElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, expect, test } from "vitest";

let wrappedRatingWithChange: typeof import("./RatingWithChange.tsx").wrappedRatingWithChange;
let RatingWithChange: typeof import("./RatingWithChange.tsx").default;

beforeAll(async () => {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: () => null,
			removeItem: () => {},
			setItem: () => {},
		},
	});
	const module = await import("./RatingWithChange.tsx");
	RatingWithChange = module.default;
	wrappedRatingWithChange = module.wrappedRatingWithChange;
});

test("keeps colors by default and can disable only the change color", () => {
	const Component = RatingWithChange as ComponentType<{
		change: number;
		colorize?: boolean;
	}>;
	const defaultMarkup = renderToStaticMarkup(
		createElement(Component, { change: 2 }, 63),
	);
	expect(defaultMarkup).toContain('class="text-success"');
	expect(defaultMarkup).toContain("63<span");
	expect(defaultMarkup).toContain("(+2)");

	const neutralMarkup = renderToStaticMarkup(
		createElement(Component, { change: -2, colorize: false }, 63),
	);
	expect(neutralMarkup).toContain("(-2)");
	expect(neutralMarkup).not.toContain("text-success");
	expect(neutralMarkup).not.toContain("text-danger");
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
