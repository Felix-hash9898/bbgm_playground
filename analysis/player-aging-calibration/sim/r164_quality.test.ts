import { expect, it } from "vitest";
import { alignGeneratedDefense } from "./r164_quality.ts";

it("pairs only eligible defensive tuples and preserves the rest of each prospect", () => {
	const generate = (height: number, age: number, speed: number, defense: number, creation: number) => ({
		born: { year: 2030 - age },
		draft: { year: 2030 },
		ratings: [{ hgt: height, spd: speed, diq: defense, oiq: creation, pss: 45, drb: 40 }],
	});
	const peers = [
		generate(30, 19, 58, 49, 36), generate(32, 19, 51, 43, 65),
		generate(30, 19, 90, 80, 35), generate(31, 19, 24, 20, 33),
		generate(63, 19, 50, 41, 61), generate(34, 19, 49, 51, 78),
		generate(33, 20, 59, 48, 85),
	];
	const first = peers.map(p => structuredClone(p.ratings[0]!));
	const result = alignGeneratedDefense(peers);
	expect(result.pairs).toBe(1);
	expect(result.alignmentGain).toBeGreaterThan(0);
	expect(peers[0]!.ratings[0]).toEqual({ ...first[0], spd: 51, diq: 43 });
	expect(peers[1]!.ratings[0]).toEqual({ ...first[1], spd: 58, diq: 49 });
	expect(peers.slice(2).map(p => p.ratings[0])).toEqual(first.slice(2));
});
