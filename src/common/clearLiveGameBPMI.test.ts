import { describe, expect, test } from "vitest";
import clearLiveGameBPMI from "./clearLiveGameBPMI.ts";

describe("clearLiveGameBPMI", () => {
	test("removes final BPMI and resets live possession counters", () => {
		const p: Record<string, any> = {
			bpmImpact: 4.5,
			singleGameBpm: 6,
			offPossOn: 75,
			defPossOn: 75,
		};

		clearLiveGameBPMI(p);

		expect(p.bpmImpact).toBeUndefined();
		expect(p.singleGameBpm).toBeUndefined();
		expect(p.offPossOn).toBe(0);
		expect(p.defPossOn).toBe(0);
	});
});
