import { describe, expect, test } from "vitest";
import getBPMImpactSortValue from "../../common/getBPMImpactSortValue.ts";
import BOX_SCORE_STATS from "../../common/boxScoreStats.basketball.ts";

describe("BPMI Box Score sorting", () => {
	test("sorts by numeric BPMI and keeps missing values last", () => {
		const players = [
			{ pid: 1, bpmImpact: 0.8333 },
			{ pid: 2, bpmImpact: 4.5 },
			{ pid: 3 },
		];
		const sorted = [...players].sort(
			(a, b) => getBPMImpactSortValue(b) - getBPMImpactSortValue(a),
		);
		expect(sorted.map((p) => p.pid)).toEqual([2, 1, 3]);
	});

	test("keeps GmSc, BPMI, and all Form columns without pm", () => {
		expect(BOX_SCORE_STATS).toEqual([
			"min",
			"fg",
			"tp",
			"ft",
			"orb",
			"trb",
			"ast",
			"tov",
			"stl",
			"blk",
			"ba",
			"pf",
			"pts",
			"gmsc",
			"bpmImpact",
			"form",
			"gameForm",
			"formTot",
		]);
		expect(BOX_SCORE_STATS).not.toContain("pm");
	});
});
