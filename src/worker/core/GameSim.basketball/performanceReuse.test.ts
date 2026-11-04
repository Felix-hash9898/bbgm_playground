import { expect, test } from "vitest";
import GameSim, { getSortedIndexes } from "./index.ts";

test("index sorting preserves legacy tie handling, infinities, and the input", () => {
	const values = [-Infinity, 30, 30, Infinity, -Infinity];
	expect(getSortedIndexes(values)).toEqual([4, 0, 2, 1, 3]);
	expect(values).toEqual([-Infinity, 30, 30, Infinity, -Infinity]);
	expect(getSortedIndexes([0, 0, 0, 0, 0])).toEqual([4, 3, 2, 1, 0]);
	// Nonadjacent ties follow the existing substitution algorithm too.
	expect(getSortedIndexes([30, 10, 30, 20])).toEqual([2, 3, 1, 0]);
});

test("substitution ordering reuses only unchanged ordering inputs", () => {
	const roster = [
		{ id: 2, plannedMinutes: 20, valueNoPot: 40 },
		{ id: 1, plannedMinutes: 20, valueNoPot: 40 },
	];
	const sim = Object.create(GameSim.prototype) as any;
	sim.team = [{ player: roster }];
	sim.substitutionOrders = new Map();
	const first = sim.getSubstitutionOrder(0);
	expect(first.map((p: any) => p.id)).toEqual([1, 2]);
	expect(sim.getSubstitutionOrder(0)).toBe(first);
	roster[0]!.plannedMinutes = 21;
	const edited = sim.getSubstitutionOrder(0);
	expect(edited).not.toBe(first);
	expect(edited[0]).toBe(roster[0]);
	roster[0]!.plannedMinutes = 20;
	roster[0]!.valueNoPot = 41;
	expect(sim.getSubstitutionOrder(0)[0]).toBe(roster[0]);
	const replacement = { ...roster[0]! };
	roster[0] = replacement;
	expect(sim.getSubstitutionOrder(0)[0]).toBe(replacement);
	roster.reverse();
	expect(sim.getSubstitutionOrder(0)[0]).toBe(replacement);
	roster.pop();
	expect(sim.getSubstitutionOrder(0)).toHaveLength(1);
});

test("neutral turnover paths match the full calculation and observe live bias edits", () => {
	const sim = Object.create(GameSim.prototype) as any;
	sim.o = 0;
	sim.playersOnCourt = [[{ usageBias: 1 }, { usageBias: 0 }]];
	sim.getBaseTurnoverProbability = () => 0.125;
	sim.getTurnoverProbabilities = () => ({ adjusted: 0.15 });
	sim.pickPlayer = (...args: any[]) => args;
	expect(sim.probTov()).toBe(0.125);
	expect(sim.getTeamDisplacement()).toBe(0);
	expect(sim.pickTurnoverPlayer()).toEqual(["turnovers", 0, 2]);
	sim.playersOnCourt[0][0].usageBias = 1.25;
	expect(sim.hasNeutralShotPriority()).toBe(false);
	expect(sim.probTov()).toBe(0.15);
});
