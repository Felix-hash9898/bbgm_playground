import { assert, beforeEach, test } from "vitest";
import { DEFAULT_TEAM_COLORS } from "../../common/constants.ts";
import { resetG } from "../../test/helpers.ts";
import { g } from "../util/index.ts";
import { getHistoryTeam } from "./teamHistory.ts";

beforeEach(() => {
	resetG();
	g.setWithoutSavingToDB("teamInfoCache", [
		{
			abbrev: "CUR",
			disabled: false,
			imgURL: "/current-large.svg",
			imgURLSmall: "/current-small.svg",
			name: "Current",
			region: "Current",
		},
	]);
});

const makeTeamSeason = (overrides: Record<string, unknown>) =>
	({
		abbrev: "HIS",
		lost: 30,
		otl: 0,
		playoffRoundsWon: 4,
		season: 2025,
		tid: 0,
		tied: 0,
		won: 52,
		...overrides,
	}) as any;

test("team history uses season-specific championship colors and logos", () => {
	const result = getHistoryTeam(
		[
			makeTeamSeason({
				colors: ["#112233", "#445566", "#778899"],
				imgURL: "/historic-large.svg",
				imgURLSmall: "/historic-small.svg",
			}),
		],
		new Map() as any,
	);

	assert.deepStrictEqual(result.history[0]?.colors, [
		"#112233",
		"#445566",
		"#778899",
	]);
	assert.strictEqual(result.history[0]?.imgURL, "/historic-large.svg");
	assert.strictEqual(result.history[0]?.imgURLSmall, "/historic-small.svg");
	assert.strictEqual(result.championships, 1);
});

test("team history safely falls back when old season branding is missing", () => {
	const result = getHistoryTeam(
		[
			makeTeamSeason({
				colors: undefined,
				imgURL: undefined,
				imgURLSmall: undefined,
			}),
		],
		new Map() as any,
	);

	assert.deepStrictEqual(result.history[0]?.colors, DEFAULT_TEAM_COLORS);
	assert.strictEqual(result.history[0]?.imgURL, "/current-large.svg");
	assert.strictEqual(result.history[0]?.imgURLSmall, "/current-small.svg");
});
