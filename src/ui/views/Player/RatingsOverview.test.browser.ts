import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import RatingsOverview from "./RatingsOverview.tsx";

test("renders rating values and changes with neutral colors", () => {
	const markup = renderToStaticMarkup(
		createElement(RatingsOverview, {
			ratings: [
				{ season: 2025, ovr: 55, pot: 75 },
				{ season: 2026, ovr: 60, pot: 70 },
			],
		}),
	);

	expect(markup).toContain("(+5)");
	expect(markup).toContain("(-5)");
	expect(markup).not.toContain("text-success");
	expect(markup).not.toContain("text-danger");
	expect(markup).not.toContain("background-color");
});
