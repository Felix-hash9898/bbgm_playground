import { assert, beforeAll, describe, test } from "vitest";
import { g, helpers } from "../util/index.ts";
import processInputs, {
	validateAbbrev,
	validateSeason,
} from "./processInputs.ts";

beforeAll(() => {
	g.setWithoutSavingToDB("userTid", 4);
	g.setWithoutSavingToDB("season", 2009);
	const teams = helpers.getTeamsDefault();
	g.setWithoutSavingToDB(
		"teamInfoCache",
		teams.map((t) => ({
			abbrev: t.abbrev,
			disabled: false,
			imgURL: t.imgURL,
			imgURLSmall: t.imgURLSmall,
			name: t.name,
			region: t.region,
		})),
	);
});

// Relies on g.*Cache being populated
describe("validateAbbrev", () => {
	test("return team ID and abbrev when given valid abbrev", () => {
		const out = validateAbbrev("DAL");
		assert.strictEqual(out[0], 6);
		assert.strictEqual(out[1], "DAL");
	});

	test("return user team ID and abbrev on invalid input", () => {
		let out = validateAbbrev("fuck");
		assert.strictEqual(out[0], 4);
		assert.strictEqual(out[1], "CIN");
		out = validateAbbrev();
		assert.strictEqual(out[0], 4);
		assert.strictEqual(out[1], "CIN");
	});
});
describe("validateSeason", () => {
	test("return input season when given a valid season", () => {
		assert.strictEqual(validateSeason(2008), 2008);
		assert.strictEqual(validateSeason("2008"), 2008);
	});

	test("return current season on invalid input", () => {
		assert.strictEqual(validateSeason("fuck"), 2009);
		assert.strictEqual(validateSeason(undefined), 2009);
	});
});

describe("standings", () => {
	test("defaults to conf for basketball when playoffs exist", () => {
		g.setWithoutSavingToDB("numGamesPlayoffSeries", [7, 7, 7, 7]);
		const result = processInputs.standings({});
		assert.strictEqual(result.type, "conf");
		assert.strictEqual(result.season, 2009);
	});

	test("defaults to league when numGamesPlayoffSeries is empty", () => {
		g.setWithoutSavingToDB("numGamesPlayoffSeries", []);
		const result = processInputs.standings({});
		assert.strictEqual(result.type, "league");
	});

	test("respects explicit query params authoritatively", () => {
		g.setWithoutSavingToDB("numGamesPlayoffSeries", [7, 7, 7, 7]);
		assert.strictEqual(processInputs.standings({ type: "conf" }).type, "conf");
		assert.strictEqual(processInputs.standings({ type: "div" }).type, "div");
		assert.strictEqual(
			processInputs.standings({ type: "league" }).type,
			"league",
		);
	});

	test("falls back to default on unrecognized type param", () => {
		g.setWithoutSavingToDB("numGamesPlayoffSeries", [7, 7, 7, 7]);
		assert.strictEqual(
			processInputs.standings({ type: "invalid" as any }).type,
			"conf",
		);
	});
});
