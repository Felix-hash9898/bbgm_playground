/**
 * Registry of development formulas used by the research harness. Research-only: nothing here is
 * imported by product code.
 *  - official   : verbatim body of zengm-games/zengm 205d18eb developSeason.basketball.ts (imports rewired)
 *  - playground : the product module in this worktree (== Felix-hash9898/bbgm_playground 363bcbc6)
 *  - candidates : parameterised variants defined in candidates.ts
 *  - v9*        : round-9 structure / composition candidates (v9.ts, v9_specs.json)
 */
import type { PlayerRatings } from "../../../../src/common/types.basketball.ts";
import developSeasonPlayground from "../../../../src/worker/core/player/developSeason.basketball.ts";
import developSeasonOfficial from "./official.developSeason.basketball.ts";
import { CANDIDATES } from "./candidates.ts";
import { V9 } from "./v9.ts";

export type DevFn = (ratings: PlayerRatings, age: number, coachingLevel: number) => void;

export const FORMULAS: Record<string, DevFn> = {
	official: developSeasonOfficial,
	playground: developSeasonPlayground,
	...CANDIDATES,
	...V9,
};
