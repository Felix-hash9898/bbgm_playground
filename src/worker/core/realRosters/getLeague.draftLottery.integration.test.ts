import { assert, test } from "vitest";
import { PHASE, REAL_PLAYERS_INFO } from "../../../common/index.ts";
import getLeague, {
	shouldIncludeRealizedDraftPicksThisSeason,
} from "./getLeague.ts";
import getLeagueInfo from "./getLeagueInfo.ts";
import loadDataBasketball from "./loadData.basketball.ts";
import oldAbbrevTo2020BBGMAbbrev from "./oldAbbrevTo2020BBGMAbbrev.ts";

const latestSeason = REAL_PLAYERS_INFO!.MAX_SEASON;
const options = {
	includePlayers: false,
	phase: PHASE.PLAYOFFS,
	randomDebuts: false,
	randomDebutsKeepCurrent: false,
	realDraftRatings: "rookie",
	realStats: "none",
	season: latestSeason,
	type: "real",
} as const;

test("latest lottery switch is limited to the completed real season", () => {
	assert.strictEqual(
		shouldIncludeRealizedDraftPicksThisSeason(options, false),
		false,
	);
	assert.strictEqual(
		shouldIncludeRealizedDraftPicksThisSeason(options, true),
		true,
	);
	assert.strictEqual(
		shouldIncludeRealizedDraftPicksThisSeason(
			{ ...options, randomDebuts: true },
			true,
		),
		false,
	);
	assert.strictEqual(
		shouldIncludeRealizedDraftPicksThisSeason(
			{ ...options, season: latestSeason - 1 },
			true,
		),
		false,
	);
	assert.strictEqual(
		shouldIncludeRealizedDraftPicksThisSeason(
			{ ...options, phase: PHASE.PRESEASON },
			true,
		),
		false,
	);
	// Preserve the pre-existing behavior for a league created during the draft.
	assert.strictEqual(
		shouldIncludeRealizedDraftPicksThisSeason(
			{ ...options, phase: PHASE.DRAFT, randomDebuts: true },
			false,
		),
		true,
	);
});

test("latest real-roster league uses every fixed lottery pick and owner", async () => {
	const [league, basketball] = await Promise.all([
		getLeague(options),
		loadDataBasketball(),
	]);
	const source = basketball.draftPicks[latestSeason]!.filter(
		(dp) => dp.season === latestSeason,
	);
	const realized = league.draftPicks!.filter(
		(dp) => dp.season === latestSeason && dp.pick > 0,
	);
	assert.strictEqual(source.length, 60);
	assert.strictEqual(realized.length, 60);

	const teamsByAbbrev = new Map(
		league.teams.map((t) => [oldAbbrevTo2020BBGMAbbrev(t.srID), t.tid]),
	);
	for (const sourceRow of source) {
		const outputRow = realized.find(
			(dp) => dp.round === sourceRow.round && dp.pick === sourceRow.pick,
		);
		assert(outputRow);
		assert.strictEqual(outputRow.tid, teamsByAbbrev.get(sourceRow.abbrev));
		assert.strictEqual(
			outputRow.originalTid,
			teamsByAbbrev.get(sourceRow.originalAbbrev ?? sourceRow.abbrev),
		);
	}
	assert.deepStrictEqual(league.draftLotteryResults, [
		{
			draftType: "dummy",
			result: [],
			season: latestSeason,
		},
	]);
}, 30_000);

test("latest real lottery does not leak into Random Debuts", async () => {
	const league = await getLeague({ ...options, randomDebuts: true });
	assert.strictEqual(league.draftPicks, undefined);
	assert.strictEqual(league.draftLotteryResults, undefined);
}, 30_000);

test("historical real leagues keep their normal unrealized draft picks", async () => {
	const season = latestSeason - 1;
	const league = await getLeague({ ...options, season });
	const currentSeasonPicks = league.draftPicks!.filter(
		(dp) => dp.season === season,
	);

	assert(currentSeasonPicks.length > 0);
	assert(currentSeasonPicks.every((dp) => dp.pick === 0));
	assert.strictEqual(league.draftLotteryResults, undefined);
}, 30_000);

test("exhibition season-info loading remains independent of lottery results", async () => {
	const info = await getLeagueInfo({
		...options,
		includePlayers: true,
		includeSeasonInfo: true,
	});

	assert.strictEqual(info.teams.length, 30);
	assert(
		info.teams.every(
			(team) => "players" in team && Array.isArray(team.players),
		),
	);
}, 30_000);
