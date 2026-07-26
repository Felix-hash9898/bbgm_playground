import { beforeEach, describe, expect, test, vi } from "vitest";
import { resetG } from "../../../test/helpers.ts";
import GameSim from "./index.ts";

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
	test("delegates to the Official individual turnover picker", () => {
		const { players, sim } = makeGameSim();
		const pickPlayer = vi
			.spyOn(sim, "pickPlayer")
			.mockReturnValue(
				players[0] as unknown as ReturnType<GameSim["pickPlayer"]>,
			);

		expect(sim.pickTurnoverPlayer()).toBe(players[0]);
		expect(pickPlayer).toHaveBeenCalledExactlyOnceWith("turnovers", 0, 2);
	});

	test("Official turnover weights ignore usageBias directly", () => {
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

		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const selectedWithConcentratedUsage = sim.pickTurnoverPlayer();
		for (const player of players) {
			player.usageBias = 1;
		}
		const selectedWithNormalUsage = sim.pickTurnoverPlayer();

		expect(selectedWithConcentratedUsage).toBe(selectedWithNormalUsage);
	});

	test("usageBias still changes shot share and team turnover overload", () => {
		const { players, sim } = makeGameSim();
		const normalContext = sim.getShotPriorityContext();
		const normalProbTov = sim.probTov();

		players[0]!.usageBias = 1.25;
		for (const player of players.slice(1)) {
			player.usageBias = 0.85;
		}

		const concentratedContext = sim.getShotPriorityContext();
		const concentratedProbTov = sim.probTov();

		expect(concentratedContext.players[0]!.adjustedShare).toBeGreaterThan(
			normalContext.players[0]!.adjustedShare,
		);
		expect(concentratedContext.teamUsageOverload).toBeGreaterThan(
			normalContext.teamUsageOverload,
		);
		expect(concentratedProbTov).toBeGreaterThan(normalProbTov);
		expect(concentratedProbTov).toBeCloseTo(
			0.14 * (1 + 0.35 * concentratedContext.teamUsageOverload),
		);
	});

	test("preserves the turnover, overload, and steal constants", () => {
		const { sim } = makeGameSim();

		expect(sim.getTeamUsageOverload()).toBe(0);
		expect(sim.probTov()).toBeCloseTo(0.14);
		expect(sim.probStl()).toBeCloseTo(0.45);

		sim.getTeamUsageOverload = () => 0.1;
		const overloadCoefficient = (sim.probTov() / 0.14 - 1) / 0.1;
		expect(overloadCoefficient).toBeCloseTo(0.35);
	});
});
