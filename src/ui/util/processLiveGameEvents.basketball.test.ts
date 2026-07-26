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
});
