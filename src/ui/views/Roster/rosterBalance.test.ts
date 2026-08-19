import { describe, expect, test } from "vitest";
import { getRosterBalance, type RosterBalancePlayer } from "./rosterBalance.ts";

const player = (
	pid: number,
	pos: string,
	skills: string[] = [],
): RosterBalancePlayer => ({
	pid,
	firstName: `Player${pid}`,
	lastName: "Test",
	ratings: { pos, skills },
});

describe("roster balance", () => {
	test("counts broad and detailed multi-position coverage", () => {
		const summary = getRosterBalance({
			players: [
				player(1, "PG"),
				player(2, "G"),
				player(3, "GF"),
				player(4, "F"),
				player(5, "FC"),
				player(6, "C"),
			],
			minutesByPid: {},
		});

		expect(summary.broadPositions).toEqual({ G: 3, F: 3, C: 2 });
		expect(summary.detailedPositions).toEqual({
			PG: 2,
			SG: 2,
			SF: 2,
			PF: 2,
			C: 2,
		});
		expect(summary.detailedPositionMinutes).toEqual({
			PG: 0,
			SG: 0,
			SF: 0,
			PF: 0,
			C: 0,
		});
	});

	test("sums healthy plan minutes and leaves zero-minute specialists at zero", () => {
		const summary = getRosterBalance({
			players: [
				player(1, "PG", ["B", "3"]),
				player(2, "GF", ["Ps", "Po", "V", "Dp"]),
				player(3, "FC", ["Di", "R"]),
				player(4, "C", ["Di", "R"]),
				player(5, "G", ["B"]),
			],
			minutesByPid: { 1: 34, 2: 27, 3: 8, 4: 0, 5: 0 },
		});

		expect(summary.categories).toEqual([
			expect.objectContaining({
				key: "ballHandler",
				totalMinutes: 34,
			}),
			expect.objectContaining({
				key: "shooting",
				totalMinutes: 34,
			}),
			expect.objectContaining({
				key: "perimeterDefense",
				totalMinutes: 27,
			}),
			expect.objectContaining({
				key: "interiorDefense",
				totalMinutes: 8,
				players: expect.arrayContaining([
					expect.objectContaining({
						player: expect.objectContaining({ pid: 4 }),
						minutes: 0,
					}),
				]),
			}),
			expect.objectContaining({
				key: "rebounding",
				totalMinutes: 8,
			}),
		]);

		expect(summary.detailedPositionMinutes).toEqual({
			PG: 34,
			SG: 27,
			SF: 27,
			PF: 8,
			C: 8,
		});
	});
});
