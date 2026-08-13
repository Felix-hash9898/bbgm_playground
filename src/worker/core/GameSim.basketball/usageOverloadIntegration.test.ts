import { assert, beforeEach, test } from "vitest";
import { DEFAULT_LEVEL } from "../../../common/budgetLevels.ts";
import { PHASE } from "../../../common/index.ts";
import { resetCache, resetG } from "../../../test/helpers.ts";
import { g, helpers, local } from "../../util/index.ts";
import { idb } from "../../db/index.ts";
import { player, team } from "../index.ts";
import loadTeams from "../game/loadTeams.ts";
import GameSim from "./index.ts";

const seedRandom = (seed: number) => {
	let state = seed >>> 0;
	Math.random = () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
		return state / 2 ** 32;
	};
};

const makeFixture = async (biases: number[]) => {
	resetG();
	g.setWithoutSavingToDB("season", 2025);
	g.setWithoutSavingToDB("startingSeason", 2025);
	g.setWithoutSavingToDB("phase", PHASE.REGULAR_SEASON);
	g.setWithoutSavingToDB("userTid", 0);
	g.setWithoutSavingToDB("userTids", [0]);
	g.setWithoutSavingToDB("spectator", false);
	g.setWithoutSavingToDB("maxOvertimes", 0);
	g.setWithoutSavingToDB("shootoutRounds", 0);
	local.reset();

	seedRandom(0x51a7_1010);
	const rosters = [0, 1].map((tid) =>
		Array.from({ length: 5 }, (_, index) => {
			const p = player.generate(tid, 24 + index, 2021, true, DEFAULT_LEVEL);
			p.pid = tid * 100 + index;
			p.rosterOrder = index;
			p.usageBias = tid === 0 ? biases[index]! : 1;
			p.form = 0;
			p.ratings.at(-1)!.endu = 82;
			return p;
		}),
	);
	const defaults = helpers.getTeamsDefault().slice(0, 2);
	const teams = defaults.map(team.generate);
	for (const [tid, roster] of rosters.entries()) {
		teams[tid]!.basketballRotation = {
			version: 1,
			mode: "custom",
			minutesByPid: Object.fromEntries(roster.map((p) => [p.pid!, 48])),
			numPlayersOnCourtAtSave: 5,
		};
	}
	await resetCache({
		players: rosters.flat(),
		teams,
		teamSeasons: defaults.map((t) => team.genSeasonRow(t)),
		teamStats: defaults.map((t) => team.genStatsRow(t.tid)),
	});
};

class PreChangeNormalGameSim extends GameSim {
	override probTov() {
		return helpers.bound(
			(g.get("turnoverFactor") *
				(0.14 * this.team[this.d].compositeRating.defense)) /
				(0.5 *
					(this.team[this.o].compositeRating.dribbling +
						this.team[this.o].compositeRating.passing)),
			0.001,
			0.999,
		);
	}

	override pickTurnoverPlayer() {
		return this.pickPlayer("turnovers", this.o, 2);
	}
}

const run = async (biases: number[], SimClass: typeof GameSim = GameSim) => {
	await makeFixture(biases);
	seedRandom(0xf091_7782);
	const loaded = await loadTeams([0, 1], {});
	assert(loaded[0] && loaded[1]);
	const sim = new SimClass({
		gid: 1,
		teams: [loaded[0], loaded[1]],
		baseInjuryRate: 0,
		doPlayByPlay: false,
		homeCourtFactor: 1,
		allStarGame: false,
		neutralSite: true,
	});
	const initialDisplacement = sim.getShotPriorityContext().teamDisplacement;
	const result = sim.run();
	return {
		initialDisplacement,
		loadedBiases: loaded[0].player.map(
			(p: { usageBias?: number }) => p.usageBias,
		),
		stats: result.team.map((t) => ({
			stat: t.stat,
			players: t.player.map((p) => ({ id: p.id, stat: p.stat })),
		})),
	};
};

beforeEach(() => {
	local.reset();
});

test("Normal full-game output exactly matches the pre-change normal formulas", async () => {
	const current = await run(Array(5).fill(1));
	const preChange = await run(Array(5).fill(1), PreChangeNormalGameSim);
	assert.deepStrictEqual(current.stats, preChange.stats);
});

test.each([0.85, 1.1, 1.25])(
	"all five players at usageBias %s have zero cost and exact Normal output",
	async (commonBias) => {
		const normal = await run(Array(5).fill(1));
		const common = await run(Array(5).fill(commonBias));
		assert.strictEqual(normal.initialDisplacement, 0);
		assert.strictEqual(common.initialDisplacement, 0);
		assert.deepStrictEqual(common.stats, normal.stats);
	},
);

test("loadTeams preserves user-team Tendency but normalizes AI and spectator inputs", async () => {
	await makeFixture([1.25, 1, 1, 1, 1]);
	seedRandom(0x9911_2200);
	let loaded = await loadTeams([0, 1], {});
	assert(loaded[0] && loaded[1]);
	assert.deepStrictEqual(
		loaded[0].player.map((p: { usageBias?: number }) => p.usageBias),
		[1.25, 1, 1, 1, 1],
	);
	assert.deepStrictEqual(
		loaded[1].player.map((p: { usageBias?: number }) => p.usageBias),
		[1, 1, 1, 1, 1],
	);

	await makeFixture([1.25, 1, 1, 1, 1]);
	g.setWithoutSavingToDB("spectator", true);
	seedRandom(0x9911_2200);
	loaded = await loadTeams([0, 1], {});
	assert(loaded[0]);
	assert.deepStrictEqual(
		loaded[0].player.map((p: { usageBias?: number }) => p.usageBias),
		[1, 1, 1, 1, 1],
	);
});

test("missing and invalid legacy usageBias values are simulation-safe and cost-free", async () => {
	await makeFixture([1, 1, 1, 1, 1]);
	const roster = await idb.cache.players.indexGetAll("playersByTid", 0);
	delete (roster[0] as any).usageBias;
	roster[1]!.usageBias = -1;
	roster[2]!.usageBias = Number.NaN;
	roster[3]!.usageBias = Number.POSITIVE_INFINITY;
	roster[4]!.usageBias = 0;
	for (const p of roster) {
		await idb.cache.players.put(p);
	}

	seedRandom(0x43ad_7001);
	const loaded = await loadTeams([0, 1], {});
	assert(loaded[0] && loaded[1]);
	const sim = new GameSim({
		gid: 2,
		teams: [loaded[0], loaded[1]],
		baseInjuryRate: 0,
		doPlayByPlay: false,
		homeCourtFactor: 1,
		allStarGame: false,
		neutralSite: true,
	});
	const context = sim.getShotPriorityContext();
	assert.strictEqual(context.teamDisplacement, 0);
	assert.deepStrictEqual(context.adjustedWeights, context.baselineWeights);
	const result = sim.run();
	assert(result.team.every((t) => Number.isFinite(t.stat.pts)));
});
