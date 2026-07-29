import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assert, test, vi } from "vitest";

vi.mock("../../util/index.ts", () => ({
	helpers: {
		formatRecord: ({ lost, won }: { lost: number; won: number }) =>
			`${won}-${lost}`,
		leagueUrl: () => "/test",
	},
}));

import { ChampionshipBanner } from "../../components/ChampionshipBanner.tsx";
import { PlayoffMatchup } from "../../components/PlayoffMatchup.tsx";
import { Championships } from "./Championships.tsx";

const renderChampionships = (history: any[]) =>
	renderToStaticMarkup(createElement(Championships, { history } as any));

const row = (
	season: number,
	playoffRoundsWon: number,
	numPlayoffRounds = 4,
) => ({
	colors: ["#112233", "#445566", "#778899"],
	imgURL: `/historic-${season}.svg`,
	numPlayoffRounds,
	playoffRoundsWon,
	season,
});

test("championship history shows None when there are no exact winners", () => {
	assert.strictEqual(
		renderChampionships([row(2024, 3), row(2023, 5)]),
		"<p>None</p>",
	);
});

test("championship history shows one or multiple exact winners with historical branding", () => {
	const one = renderChampionships([row(2025, 4), row(2024, 3)]);
	assert.match(one, /2025/);
	assert.match(one, /historic-2025\.svg/);
	assert.match(one, /#112233/);
	assert(!/2024/.test(one));

	const multiple = renderChampionships([
		row(2025, 4),
		row(2024, 3),
		row(2023, 4),
	]);
	assert.match(multiple, /2025/);
	assert.match(multiple, /2023/);
	assert(!/2024/.test(multiple));
});

test("championship banner safely renders without colors or a logo", () => {
	const html = renderToStaticMarkup(
		createElement(ChampionshipBanner, { season: 2025, t: {} }),
	);
	assert.match(html, /2025/);
	assert(html.includes("#000000"));
	assert(!/<img/.test(html));
});

test("playoff matchup still renders the completed finals winner banner", () => {
	const team = (tid: number, won: number) =>
		({
			abbrev: `T${tid}`,
			cid: 0,
			colors: ["#112233", "#445566", "#778899"],
			imgURLSmall: `/team-${tid}.svg`,
			region: `Team ${tid}`,
			regularSeason: { lost: 30, won: 52 },
			seed: tid + 1,
			tid,
			winp: 0.634,
			won,
		}) as any;
	const html = renderToStaticMarkup(
		createElement(PlayoffMatchup, {
			bannerForWinner: true,
			numGamesToWinSeries: 4,
			season: 2025,
			series: {
				away: team(1, 2),
				home: team(0, 4),
			},
			userTid: 10,
		}),
	);

	assert.match(html, /League Champions/);
	assert.match(html, /team-0\.svg/);
	assert.match(html, /2025/);
});
