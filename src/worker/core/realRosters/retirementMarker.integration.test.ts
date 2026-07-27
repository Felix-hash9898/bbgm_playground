import { expect, test } from "vitest";
import { PHASE, PLAYER } from "../../../common/index.ts";
import formatPlayerFactory from "./formatPlayerFactory.ts";

const basketball = {
	awards: {},
	bios: {
		active: {
			bornYear: 1995,
			college: "Test",
			country: "USA",
			diedYear: Infinity,
			draftAbbrev: "ATL",
			draftPick: 1,
			draftRound: 1,
			draftYear: 2020,
			height: 75,
			name: "Active Player",
			pos: "G",
			weight: 200,
		},
		retired: {
			bornYear: 1970,
			college: "Test",
			country: "USA",
			diedYear: Infinity,
			draftAbbrev: "ATL",
			draftPick: 1,
			draftRound: 1,
			draftYear: 1990,
			height: 75,
			name: "Retired Player",
			pos: "G",
			weight: 200,
		},
	},
	draftPicks: {},
	freeAgents: [],
	injuries: {},
	ratings: [],
	relatives: [],
	salaries: [],
	scheduledEventsGameAttributes: [],
	scheduledEventsTeams: [],
	teamSeasons: {},
	teams: [
		{ abbrev: "ATL", season: 2026, slug: "active" },
		{ abbrev: -3, season: 2026, slug: "retired" },
	],
};

const ratings = {
	abbrev_if_new_row: undefined,
	diq: 50,
	dnk: 50,
	drb: 50,
	endu: 50,
	fg: 50,
	ft: 50,
	hgt: 50,
	ins: 50,
	jmp: 50,
	oiq: 50,
	pss: 50,
	reb: 50,
	season: 2026,
	slug: "retired",
	spd: 50,
	stre: 50,
	tp: 50,
};

test("formatPlayerFactory passes a numeric retired marker through as tid", async () => {
	const formatPlayer = await formatPlayerFactory(
		basketball as any,
		{
			phase: PHASE.PRESEASON,
			randomDebuts: false,
			realDraftRatings: "rookie",
			realStats: "none",
			season: 2026,
			type: "real",
		} as any,
		2026,
		[{ srID: "ATL", tid: 0 }],
		0,
	);

	const p = formatPlayer(ratings);
	expect(p.tid).toBe(PLAYER.RETIRED);
	expect(p.jerseyNumber).toBeUndefined();
	expect(p.awards).toBeUndefined();
});
