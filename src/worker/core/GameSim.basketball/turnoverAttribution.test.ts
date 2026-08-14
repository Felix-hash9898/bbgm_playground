import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import GameSim, {
	TEAM_STEAL_CONDITIONAL_COEFFICIENT,
	TEAM_TOV_BASE_COEFFICIENT,
	USAGE_EXTRA_TOV_FINISH_SHARE,
	USAGE_TEAM_TOV_COEFFICIENT,
} from "./index.ts";

const makePlayers = () =>
	[0.8, 0.6, 0.4, 0.2, 0].map((turnovers, index) => ({
		id: index,
		usageBias: 1,
		compositeRating: {
			dribbling: 0.5,
			turnovers,
			usage: 0.5,
		},
		stat: {
			energy: 1,
		},
	}));

const makeGameSim = () => {
	const sim = Object.create(GameSim.prototype) as GameSim;
	const players = makePlayers();

	Object.assign(sim, {
		d: 1,
		fatigue: () => 1,
		numPlayersOnCourt: 5,
		o: 0,
		playersOnCourt: [players, makePlayers()],
		team: [
			{
				compositeRating: {
					dribbling: 1,
					passing: 1,
				},
			},
			{
				compositeRating: {
					defense: 1,
					defensePerimeter: 1,
				},
			},
		],
	});

	return { players, sim };
};

beforeEach(() => {
	resetG();
	vi.restoreAllMocks();
});

describe("basketball turnover attribution", () => {
	test("conditional steal probability uses the calibrated team environment", () => {
		const { sim } = makeGameSim();
		expect(sim.probStl()).toBeCloseTo(TEAM_STEAL_CONDITIONAL_COEFFICIENT);
	});

	test("D=0 delegates exactly to the Official individual turnover picker", () => {
		const { players, sim } = makeGameSim();
		const pickPlayer = vi
			.spyOn(sim, "pickPlayer")
			.mockReturnValue(
				players[0] as unknown as ReturnType<GameSim["pickPlayer"]>,
			);

		expect(sim.pickTurnoverPlayer()).toBe(players[0]);
		expect(pickPlayer).toHaveBeenCalledExactlyOnceWith("turnovers", 0, 2);
	});

	test("Official baseline weights retain their existing rating and floor", () => {
		const { players, sim } = makeGameSim();
		const normalWeights = sim.ratingArray("turnovers", 0, 2);
		const expectedWeights = [0.64, 0.36, 0.16, 0.06, 0.06];

		for (const [index, expectedWeight] of expectedWeights.entries()) {
			expect(normalWeights[index]).toBeCloseTo(expectedWeight);
		}

		for (const [index, player] of players.entries()) {
			player.usageBias = index === 0 ? 1.25 : 0.85;
		}
		expect(sim.ratingArray("turnovers", 0, 2)).toEqual(normalWeights);
	});

	test("team turnover occurrence uses uncapped total displacement", () => {
		const { players, sim } = makeGameSim();
		const normal = sim.getTurnoverProbabilities();

		players[0]!.usageBias = 1.25;
		for (const player of players.slice(1)) {
			player.usageBias = 0.85;
		}
		const context = sim.getShotPriorityContext();
		const concentrated = sim.getTurnoverProbabilities(context);

		expect(context.players[0]!.shareRatio - 1).toBeGreaterThan(0.25);
		expect(context.teamDisplacement).toBeGreaterThan(0);
		expect(normal.base).toBeCloseTo(TEAM_TOV_BASE_COEFFICIENT);
		expect(TEAM_TOV_BASE_COEFFICIENT * USAGE_TEAM_TOV_COEFFICIENT).toBeCloseTo(
			0.14,
			3,
		);
		expect(normal.adjusted).toBe(normal.base);
		expect(concentrated.adjusted / concentrated.base).toBeCloseTo(
			1 + USAGE_TEAM_TOV_COEFFICIENT * context.teamDisplacement,
			12,
		);
	});

	test("attribution conserves baseline and modeled extra probability mass", () => {
		const { players, sim } = makeGameSim();
		players[0]!.usageBias = 1.25;
		for (const player of players.slice(1)) {
			player.usageBias = 0.85;
		}
		const context = sim.getShotPriorityContext();
		const officialWeights = sim.ratingArray("turnovers", 0, 2);
		const officialTotal = officialWeights.reduce(
			(sum, value) => sum + value,
			0,
		);
		const official = officialWeights.map((value) => value / officialTotal);
		const excess = context.players.map(
			(player) => player.excessShare / context.teamDisplacement,
		);
		const probabilities = sim.getTurnoverProbabilities(context);
		const extra = probabilities.adjusted - probabilities.base;
		const pickPlayer = vi
			.spyOn(sim, "pickPlayer")
			.mockReturnValue(
				players[0] as unknown as ReturnType<GameSim["pickPlayer"]>,
			);

		sim.pickTurnoverPlayer();
		const weights = pickPlayer.mock.calls[0]![4]!;
		expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 14);
		for (let i = 0; i < weights.length; i++) {
			const eventMass = probabilities.adjusted * weights[i]!;
			const expectedMass =
				probabilities.base * official[i]! +
				extra *
					((1 - USAGE_EXTRA_TOV_FINISH_SHARE) * official[i]! +
						USAGE_EXTRA_TOV_FINISH_SHARE * excess[i]!);
			expect(eventMass).toBeCloseTo(expectedMass, 14);
		}
	});

	test("equal total displacement gives equal turnover occurrence", () => {
		const { sim } = makeGameSim();
		const makeContext = (excessShares: number[]) => ({
			players: excessShares.map((excessShare) => ({
				baselineShare: 0.2,
				adjustedShare: 0.2 + excessShare,
				shareRatio: 1,
				excessShare,
				incrementalFraction: 0,
			})),
			baselineWeights: [],
			adjustedWeights: [],
			teamDisplacement: 0.06,
		});

		expect(
			sim.getTurnoverProbabilities(makeContext([0.06, 0, 0, 0, 0])),
		).toEqual(
			sim.getTurnoverProbabilities(makeContext([0.02, 0.02, 0.02, 0, 0])),
		);
	});

	test("an explicit turnover player override bypasses incremental attribution", () => {
		const { players, sim } = makeGameSim();
		const override = players[4]!;
		const picker = vi.spyOn(sim, "pickTurnoverPlayer");
		Object.assign(sim, {
			isClockRunning: true,
			playByPlay: { logEvent: vi.fn() },
			probStl: () => 0,
			recordStat: vi.fn(),
			t: 100,
		});
		vi.spyOn(Math, "random").mockReturnValue(0.99);

		expect(sim.doTov(override as never)).toBe("tov");
		expect(picker).not.toHaveBeenCalled();
		expect(sim.recordStat).toHaveBeenCalledWith(0, override, "tov");
	});
});
