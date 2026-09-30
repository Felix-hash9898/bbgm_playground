import { assert, beforeEach, test } from "vitest";
import { PHASE, PLAYER } from "../../common/index.ts";
import { DEFAULT_LEVEL } from "../../common/budgetLevels.ts";
import { resetCache, resetG } from "../../test/helpers.ts";
import { player } from "../core/index.ts";
import { g, local } from "../util/index.ts";
import api from "./index.ts";

beforeEach(async () => {
	resetG();
	g.setWithoutSavingToDB("season", 2024);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	local.exhibitionGamePlayers = undefined;
	local.liveSimRatingsStatsPopoverPlayers = undefined;
	await resetCache();
});

const setupPlayer = async () => {
	const p = player.generate(PLAYER.UNDRAFTED, 25, 2020, true, DEFAULT_LEVEL);
	p.pid = 42;
	p.tid = 0;
	p.draft.year = 2019;
	p.ratings = [
		{ ...p.ratings[0]!, season: 2023 },
		{ ...p.ratings[0]!, season: 2024 },
	];
	p.stats = [];
	p.statsTids = [];

	player.addStatsRow(p, 2023, false);
	Object.assign(p.stats.at(-1), {
		gp: 70,
		pts: 1400,
		tpa: 350,
		obpm: 1.2,
		dbpm: 0.9,
	});
	player.addStatsRow(p, 2023, true);
	Object.assign(p.stats.at(-1), {
		gp: 5,
		pts: 120,
		tpa: 25,
		obpm: 5.1,
		dbpm: 3.3,
	});
	player.addStatsRow(p, 2024, false);
	Object.assign(p.stats.at(-1), {
		gp: 30,
		pts: 750,
		tpa: 90,
		obpm: 1.7,
		dbpm: 2.5,
	});

	await resetCache({ players: [p] });
	return p;
};

test("explicit current season with no playoff row never falls back to prior playoffs", async () => {
	const p = await setupPlayer();

	const result = await api.main.ratingsStatsPopoverInfo({
		pid: p.pid!,
		season: 2024,
		playoffsCombined: "playoffs",
	});

	assert.strictEqual(result.hasPlayoffStats, false);
	assert.strictEqual(result.stats.gp, 0);
	assert.strictEqual(result.stats.pts, 0);
	assert.strictEqual(result.stats.tpa, 0);
});

test("explicit historical season returns that season's playoff data and canonical stats", async () => {
	const p = await setupPlayer();

	const result = await api.main.ratingsStatsPopoverInfo({
		pid: p.pid!,
		season: 2023,
		playoffsCombined: "playoffs",
	});

	assert.strictEqual(result.hasPlayoffStats, true);
	assert.strictEqual(result.stats.gp, 5);
	assert.strictEqual(result.stats.pts, 24);
	assert.strictEqual(result.stats.tpa, 5);
	assert.closeTo(result.stats.bpm, 8.4, 0.01);
});
