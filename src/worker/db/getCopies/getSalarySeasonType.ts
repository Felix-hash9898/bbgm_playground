import { PHASE } from "../../../common/index.ts";
import type { Phase } from "../../../common/types.ts";

export type SalarySeasonType = "past" | "current" | "future";

export const getSalarySeasonType = (
	salarySeason: number,
	season: number,
	phase: Phase,
): SalarySeasonType => {
	if (
		salarySeason < season ||
		(salarySeason === season && phase > PHASE.PLAYOFFS)
	) {
		return "past";
	}

	if (
		salarySeason === season ||
		(salarySeason === season + 1 && phase > PHASE.PLAYOFFS)
	) {
		return "current";
	}

	return "future";
};
