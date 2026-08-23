import { describe, expect, test, vi } from "vitest";

vi.mock("./index.ts", () => ({
	helpers: {
		ordinal: (value: number) => `${value}${value === 1 ? "st" : "th"}`,
		pronoun: (_gender: string, pronoun: string) => pronoun,
	},
	local: {
		getState: () => ({
			gender: "male",
		}),
	},
}));

import processLiveGameEvents from "./processLiveGameEvents.basketball.tsx";

describe("Live Game injury event", () => {
	test("reveals the injury only when its play-by-play event is processed", () => {
		const injuredPlayer = {
			pid: 1,
			name: "Test Player",
			inGame: true,
			injury: {
				type: "Healthy",
				gamesRemaining: 0,
			},
		};
		const boxScore = {
			gid: 123,
			numPeriods: 4,
			quarter: "",
			quarterShort: "",
			overtime: "",
			teams: [
				{
					pts: 0,
					ptsQtrs: [],
					players: [injuredPlayer],
				},
				{
					pts: 0,
					ptsQtrs: [],
					players: [],
				},
			],
		};
		const events: any[] = [
			{
				type: "period",
				clock: 720,
				period: 1,
			},
			{
				type: "injury",
				t: 0,
				pid: 1,
				clock: 600,
			},
		];

		const beforeInjury = processLiveGameEvents({
			events,
			boxScore,
			overtimes: 0,
			quarters: [],
		});

		expect(beforeInjury.text).not.toContain("was injured!");
		expect(injuredPlayer.injury).toEqual({
			type: "Healthy",
			gamesRemaining: 0,
		});
		expect(events).toHaveLength(1);

		const atInjury = processLiveGameEvents({
			events,
			boxScore,
			overtimes: beforeInjury.overtimes,
			quarters: beforeInjury.quarters,
		});

		expect(atInjury.text).toContain("Test Player was injured!");
		expect(injuredPlayer.injury).toEqual({
			type: "Injured",
			gamesRemaining: -1,
		});
	});

	test("updates Rim / Post / Mid shot-zone stats in real time for player and team", () => {
		const shooter1 = {
			pid: 101,
			name: "Shooter One",
			inGame: true,
			fg: 0,
			fga: 0,
			fgAtRim: 0,
			fgaAtRim: 0,
			fgLowPost: 0,
			fgaLowPost: 0,
			fgMidRange: 0,
			fgaMidRange: 0,
			tp: 0,
			tpa: 0,
			pts: 0,
			pm: 0,
			injury: { type: "Healthy", gamesRemaining: 0 },
		};
		const shooter2 = {
			pid: 201,
			name: "Shooter Two",
			inGame: true,
			fg: 0,
			fga: 0,
			fgAtRim: 0,
			fgaAtRim: 0,
			fgLowPost: 0,
			fgaLowPost: 0,
			fgMidRange: 0,
			fgaMidRange: 0,
			tp: 0,
			tpa: 0,
			pts: 0,
			pm: 0,
			injury: { type: "Healthy", gamesRemaining: 0 },
		};

		const boxScore = {
			gid: 456,
			numPeriods: 4,
			quarter: "",
			quarterShort: "",
			overtime: "",
			teams: [
				{
					pts: 0,
					ptsQtrs: [],
					fg: 0,
					fga: 0,
					fgAtRim: 0,
					fgaAtRim: 0,
					fgLowPost: 0,
					fgaLowPost: 0,
					fgMidRange: 0,
					fgaMidRange: 0,
					tp: 0,
					tpa: 0,
					players: [shooter2],
				},
				{
					pts: 0,
					ptsQtrs: [],
					fg: 0,
					fga: 0,
					fgAtRim: 0,
					fgaAtRim: 0,
					fgLowPost: 0,
					fgaLowPost: 0,
					fgMidRange: 0,
					fgaMidRange: 0,
					tp: 0,
					tpa: 0,
					players: [shooter1],
				},
			],
		};

		// Team 0 in event is visitor -> mapped to boxScore.teams[1]
		// Team 1 in event is home -> mapped to boxScore.teams[0]
		const events: any[] = [
			{ type: "period", clock: 720, period: 1 },
			// Step 1: Rim shot attempt and make for shooter1 (team 0 -> actualT 1)
			{ type: "stat", t: 0, pid: 101, s: "fgaAtRim", amt: 1 },
			{ type: "stat", t: 0, pid: 101, s: "fgAtRim", amt: 1 },
			{ type: "stat", t: 0, pid: 101, s: "fga", amt: 1 },
			{ type: "stat", t: 0, pid: 101, s: "fg", amt: 1 },
			{ type: "stat", t: 0, pid: 101, s: "pts", amt: 2 },
			{ type: "fgAtRim", t: 0, pid: 101, clock: 700 },

			// Step 2: Low post shot attempt and miss for shooter1
			{ type: "stat", t: 0, pid: 101, s: "fgaLowPost", amt: 1 },
			{ type: "stat", t: 0, pid: 101, s: "fga", amt: 1 },
			{ type: "fgaLowPost", t: 0, pid: 101, clock: 680 },

			// Step 3: Mid range shot attempt and make for shooter2 (team 1 -> actualT 0)
			{ type: "stat", t: 1, pid: 201, s: "fgaMidRange", amt: 1 },
			{ type: "stat", t: 1, pid: 201, s: "fgMidRange", amt: 1 },
			{ type: "stat", t: 1, pid: 201, s: "fga", amt: 1 },
			{ type: "stat", t: 1, pid: 201, s: "fg", amt: 1 },
			{ type: "stat", t: 1, pid: 201, s: "pts", amt: 2 },
			{ type: "fgMidRange", t: 1, pid: 201, clock: 650 },
		];

		// Process initial period event
		const p1 = processLiveGameEvents({
			events,
			boxScore,
			overtimes: 0,
			quarters: [],
		});
		expect(shooter1.fgAtRim).toBe(0);
		expect(shooter1.fgaAtRim).toBe(0);

		// Process rim make event
		const p2 = processLiveGameEvents({
			events,
			boxScore,
			overtimes: p1.overtimes,
			quarters: p1.quarters,
		});
		expect(shooter1.fgAtRim).toBe(1);
		expect(shooter1.fgaAtRim).toBe(1);
		expect(shooter1.fg).toBe(1);
		expect(shooter1.fga).toBe(1);
		expect(shooter1.pts).toBe(2);
		expect(boxScore.teams[1]!.fgAtRim).toBe(1);
		expect(boxScore.teams[1]!.fgaAtRim).toBe(1);

		// Process low post miss event
		const p3 = processLiveGameEvents({
			events,
			boxScore,
			overtimes: p2.overtimes,
			quarters: p2.quarters,
		});
		expect(shooter1.fgLowPost).toBe(0);
		expect(shooter1.fgaLowPost).toBe(1);
		expect(shooter1.fga).toBe(2);
		expect(boxScore.teams[1]!.fgLowPost).toBe(0);
		expect(boxScore.teams[1]!.fgaLowPost).toBe(1);

		// Process mid range make event for shooter2 on other team
		processLiveGameEvents({
			events,
			boxScore,
			overtimes: p3.overtimes,
			quarters: p3.quarters,
		});
		expect(shooter2.fgMidRange).toBe(1);
		expect(shooter2.fgaMidRange).toBe(1);
		expect(shooter2.pts).toBe(2);
		expect(boxScore.teams[0]!.fgMidRange).toBe(1);
		expect(boxScore.teams[0]!.fgaMidRange).toBe(1);
	});
});
