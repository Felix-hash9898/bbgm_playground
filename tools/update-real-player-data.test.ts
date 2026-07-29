import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { assert, test } from "vitest";

const TARGET_PATH = "data/real-player-data.basketball.json";
const BASELINE_COMMIT = "76313676b";
const D49_OFFICIAL_COMMIT = "c127a384b2d110aab7e42f4ac2a84f4ebb8251ec";
const D51_OFFICIAL_COMMIT = "770e4990e168bf0d45f2083cb55940e46c30af4c";
const D51_SEASON = 2026;

const gitJSON = (cwd: string, revision: string): any =>
	JSON.parse(
		execFileSync("git", ["show", `${revision}:${TARGET_PATH}`], {
			cwd,
			encoding: "utf8",
			maxBuffer: 100 * 1024 * 1024,
		}),
	);

test("D49/D51 generator reproduces the fixed lottery without changing injuries or history", () => {
	execFileSync(process.execPath, ["tools/update-real-player-data.mjs"], {
		cwd: process.cwd(),
		encoding: "utf8",
	});

	const target = JSON.parse(fs.readFileSync(TARGET_PATH, "utf8"));
	const baseline = gitJSON(process.cwd(), BASELINE_COMMIT);
	const d49Official = gitJSON("../bbgm_official", D49_OFFICIAL_COMMIT);
	const d51Official = gitJSON("../bbgm_official", D51_OFFICIAL_COMMIT);

	const expectedLatestPicks = d51Official.draftPicks[D51_SEASON].filter(
		(row: any) => row.season === D51_SEASON,
	);
	const outputLatestPicks = target.draftPicks[D51_SEASON].filter(
		(row: any) => row.season === D51_SEASON,
	);
	assert.strictEqual(expectedLatestPicks.length, 60);
	assert.deepStrictEqual(outputLatestPicks, expectedLatestPicks);

	assert.deepStrictEqual(target.injuries, baseline.injuries);
	for (const season of Object.keys(baseline.draftPicks)) {
		if (Number(season) !== D51_SEASON) {
			assert.deepStrictEqual(
				target.draftPicks[season],
				baseline.draftPicks[season],
			);
		}
	}
	assert.deepStrictEqual(
		target.draftPicks[D51_SEASON].filter(
			(row: any) => row.season !== D51_SEASON,
		),
		baseline.draftPicks[D51_SEASON].filter(
			(row: any) => row.season !== D51_SEASON,
		),
	);

	for (const [name, period, fields] of [
		["teams", "season", ["slug", "season", "abbrev", "jerseyNumber"]],
		[
			"ratings",
			"season",
			[
				"slug",
				"season",
				"diq",
				"dnk",
				"drb",
				"endu",
				"fg",
				"ft",
				"fuzz",
				"hgt",
				"ins",
				"jmp",
				"oiq",
				"pss",
				"reb",
				"spd",
				"stre",
				"tp",
			],
		],
		["salaries", "start", ["slug", "start", "exp", "amounts"]],
	] as const) {
		const source = new Map<string, any>();
		for (const row of d49Official[name]) {
			if (row[period] >= D51_SEASON) {
				source.set(`${row.slug}:${row[period]}`, row);
			}
		}
		const output = new Map<string, any>(
			target[name]
				.filter((row: any) => row[period] >= D51_SEASON)
				.map((row: any) => [`${row.slug}:${row[period]}`, row]),
		);
		for (const [key, sourceRow] of source) {
			const outputRow = output.get(key);
			assert(outputRow, `Missing ${name} row ${key}`);
			for (const field of fields) {
				assert.deepStrictEqual(outputRow[field], sourceRow[field]);
			}
		}
	}
}, 30_000);
