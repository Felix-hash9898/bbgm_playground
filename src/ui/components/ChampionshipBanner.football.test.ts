import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assert, test } from "vitest";
import { ChampionshipBanner } from "./ChampionshipBanner.tsx";

test("shared championship banner renders outside basketball", () => {
	const html = renderToStaticMarkup(
		createElement(ChampionshipBanner, {
			season: 2025,
			t: {
				colors: ["#123456", "#abcdef", "#654321"],
			},
		}),
	);

	assert.match(html, /League Champions/);
	assert.match(html, /#123456/);
});
