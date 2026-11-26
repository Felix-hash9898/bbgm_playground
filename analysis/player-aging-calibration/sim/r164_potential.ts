import { DEFAULT_LEVEL } from "../../../src/common/budgetLevels.ts";
import type { PlayerRatings } from "../../../src/common/types.basketball.ts";
import overall from "../../../src/worker/core/player/ovr.basketball.ts";
import { corrected } from "./r164_growth.ts";

export function estimateOpeningPotential(ratings: PlayerRatings, age: number, seed: number) {
	const originalRandom = Math.random;
	let state = seed >>> 0;
	Math.random = () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
	try {
		const peaks = Array.from({ length: 20 }, () => {
			const copy = { ...ratings };
			let peak = ratings.ovr;
			for (let year = age + 1; year <= 29; year++) {
				corrected(copy, year, DEFAULT_LEVEL);
				peak = Math.max(peak, overall(copy));
			}
			return peak;
		}).sort((a, b) => a - b);
		return peaks[15]!;
	} finally {
		Math.random = originalRandom;
	}
}

export function potentialSeed(key: string) {
	let state = 1573802019;
	for (const char of key) {
		state = Math.imul(state ^ char.charCodeAt(0), 16777619);
	}
	return state >>> 0;
}
