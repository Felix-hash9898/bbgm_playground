import { expect, it, vi } from "vitest";
import type { PlayerRatings } from "../../../src/common/types.basketball.ts";
import { DEFAULT_LEVEL } from "../../../src/common/budgetLevels.ts";
import { veteranComposition, youngComposition } from "./growthNextComposition.ts";
import { composed, corrected } from "./r164_growth.ts";

function seeded(seed: number) {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let mix = Math.imul(state ^ (state >>> 15), state | 1);
		mix ^= mix + Math.imul(mix ^ (mix >>> 7), mix | 61);
		return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
	};
}

it("reproduces the corresponding K and N steps across age bands", () => {
	const random = vi.spyOn(Math, "random");
	try {
		const step = (develop: typeof corrected, seed: number, age: number, level: number, value: number) => {
			const ratings = { hgt: 65, stre: value, spd: value, jmp: value, endu: value, ins: value, dnk: value, ft: value,
				fg: value, tp: value, oiq: value, diq: value, drb: value, pss: value, reb: value } as PlayerRatings;
			random.mockImplementation(seeded(seed));
			develop(ratings, age, level);
			return { ratings, nextRandom: Math.random() };
		};
		for (const age of Array.from({ length: 25 }, (_, i) => 18 + i)) {
			for (const [i, value] of [1, 47, 98].entries()) {
				const args = [age * 13 + i, age, DEFAULT_LEVEL + i - 1, value] as const;
				const k = step(corrected, ...args);
				const n = step(composed, ...args);
				expect(step(youngComposition, ...args)).toEqual(age >= 20 && age <= 25 ? n : k);
				expect(step(veteranComposition, ...args)).toEqual(age >= 29 && age <= 38 ? n : k);
			}
		}
	} finally {
		random.mockRestore();
	}
});
