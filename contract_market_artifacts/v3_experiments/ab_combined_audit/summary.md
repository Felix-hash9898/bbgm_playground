# V3-AB combined first-layer audit

Artifact-only audit. This combines V3-1A HIGH_END_ROTATION and V3-1B-narrow-B SOLID_STARTER. It does not implement V3, modify src, modify formal scoreTier/MODEL_TIERS, modify sandbox v2, rewrite existing score CSVs, resample, write temp outputs, or commit.

## Top-line

| metric                         |        value |
| ------------------------------ | -----------: |
| 1A HIGH_END_ROTATION entrants  |           33 |
| 1B-B SOLID_STARTER entrants    |           17 |
| conflicts                      |            0 |
| labeled mean gap               | 2.46 -> 1.67 |
| labeled median gap             | 0.78 -> 0.75 |
| labeled severe                 |       4 -> 0 |
| labeled too_low                |     31 -> 27 |
| labeled too_high               |       7 -> 9 |
| combined/current/tie           |   7 / 5 / 36 |
| severe fixed / new severe      |        4 / 0 |
| too_low fixed / too_high added |        4 / 2 |

Safety read: passes severe/conflict tripwires. Human ranges are calibration evidence, not ground truth; small point misses near a boundary are marked as minor rather than treated as automatic rule failures.

## 1C necessity

- Is 1C necessary now? **inconclusive**.
- Recommended next step: review remaining LOW_END_STARTER misses before defining any narrow 1C.
- Reason: H-02 and V20-11 are both checked explicitly below; if they are already in SOLID_STARTER but still too low, that is not clean evidence for a new first-layer tier.
- Broad 1C warning: if only a small number of special archetypes remain, opening a broad 1C risks recreating candidate_0-style HIGH_IMPACT_STARTER absorption.

## Required named checks

| case           | status                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| H-02 / Simmons | Ben Simmons: LOW_END_STARTER -> SOLID_STARTER, module 1B-B, point 24.99 vs $30.00M-$35.00M, too_low, gap 5.01M   |
| V20-11 / AD    | Anthony Davis: LOW_END_STARTER -> SOLID_STARTER, module 1B-B, point 23.66 vs $24.00M-$28.00M, too_low, gap 0.34M |

## Focus transitions

| current tier           | combined tier     | count | % of current | direction | steps |
| ---------------------- | ----------------- | ----- | ------------ | --------- | ----- |
| LOW_END_STARTER        | SOLID_STARTER     | 17    | 27.0%        | up        | 1     |
| YOUNG_UPSIDE_SUSPECT   | HIGH_END_ROTATION | 11    | 42.3%        | up        | 2     |
| VETERAN_ROTATION_GUARD | HIGH_END_ROTATION | 10    | 71.4%        | up        | 3     |
| MINIMUM_LEVEL          | HIGH_END_ROTATION | 6     | 1.3%         | up        | 6     |

Unexpected transitions:

None.

## Cap-budget totals

| pool               | model          | count | total mid cap | mid/30 | delta  |
| ------------------ | -------------- | ----- | ------------- | ------ | ------ |
| all_active         | current        | 634   | 2787.5%       | 92.9%  | 0.0%   |
| all_active         | combined_v3_ab | 634   | 3071.4%       | 102.4% | 283.9% |
| rostered_active    | current        | 460   | 2356.2%       | 78.5%  | 0.0%   |
| rostered_active    | combined_v3_ab | 460   | 2624.6%       | 87.5%  | 268.4% |
| top15_roster_proxy | current        | 431   | 2308.6%       | 77.0%  | 0.0%   |
| top15_roster_proxy | combined_v3_ab | 431   | 2577.0%       | 85.9%  | 268.4% |
| contract_relevant  | current        | 322   | 1053.8%       | 35.1%  | 0.0%   |
| contract_relevant  | combined_v3_ab | 322   | 1141.2%       | 38.0%  | 87.4%  |

## Affected labeled cases

| dataset      | case   | bucket                        | human           | current tier           | combined tier     | module | current point | combined point | gap  | direction | signals                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------ | ----------------------------- | --------------- | ---------------------- | ----------------- | ------ | ------------- | -------------- | ---- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| boundary40   | E-01   | high_end_rotation_sixth_man   | $8.00M-$12.00M  | VETERAN_ROTATION_GUARD | HIGH_END_ROTATION | 1A     | 7.77          | 14.82          | 2.82 | too_high  | real role fallback: GP >= 55 and MPG >= 20; creator/scorer core; portable shooting core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                                                                 |
| boundary40   | E-02   | high_end_rotation_sixth_man   | $20.00M-$30.00M | YOUNG_UPSIDE_SUSPECT   | HIGH_END_ROTATION | 1A     | 5.73          | 15.45          | 4.55 | too_low   | real role fallback: GP >= 55 and MPG >= 20; portable shooting core; young productive core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                                                               |
| boundary40   | E-04   | high_end_rotation_sixth_man   | $12.00M-$18.00M | YOUNG_UPSIDE_SUSPECT   | HIGH_END_ROTATION | 1A     | 5.6           | 15.15          | 0    | inside    | real role fallback: GP >= 55 and MPG >= 20; portable shooting core; young productive core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                                                               |
| boundary40   | G-03   | solid_starter                 | $12.00M-$18.00M | LOW_END_STARTER        | SOLID_STARTER     | 1B-B   | 16.03         | 24.17          | 6.17 | too_high  | role: starterShare >= 0.65; role: GS >= 50; value core: valueNoPot >= 60 and contractValue >= 60; production: BPM >= 1; production: VORP >= 1; extra: BPM >= 1.5; extra: VORP >= 1.5; extra: defense/rebounding/connector support; extra: shooting/spacing support                                                                 |
| boundary40   | G-04   | solid_starter                 | $12.00M-$18.00M | MINIMUM_LEVEL          | HIGH_END_ROTATION | 1A     | 3.44          | 15.51          | 0    | inside    | real role fallback: MPG >= 22; creator/scorer core; portable shooting core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                                                                              |
| boundary40   | H-02   | good_high_starter             | $30.00M-$35.00M | LOW_END_STARTER        | SOLID_STARTER     | 1B-B   | 17.03         | 24.99          | 5.01 | too_low   | role: starterShare >= 0.65; role: GS >= 50; role: MPG >= 31; value core: valueNoPot >= 60 and contractValue >= 60; production: BPM >= 1; production: EWA >= 5; production: VORP >= 1; production: PER >= 16; extra: BPM >= 1.5; extra: EWA >= 6; extra: VORP >= 1.5; extra: PER >= 17; extra: defense/rebounding/connector support |
| validation20 | V20-09 | low_end_starter_good_rotation | $22.00M-$27.00M | LOW_END_STARTER        | SOLID_STARTER     | 1B-B   | 15.65         | 23.87          | 0    | inside    | role: starterShare >= 0.65; role: GS >= 50; role: MPG >= 31; value core: valueNoPot >= 60 and contractValue >= 60; production: BPM >= 1; production: EWA >= 5; production: VORP >= 1; production: PER >= 16; extra: EWA >= 6; extra: VORP >= 1.5; extra: PER >= 17; extra: defense/rebounding/connector support                    |
| validation20 | V20-11 | low_end_starter_good_rotation | $24.00M-$28.00M | LOW_END_STARTER        | SOLID_STARTER     | 1B-B   | 15.4          | 23.66          | 0.34 | too_low   | role: starterShare >= 0.65; role: GS >= 50; value core: valueNoPot >= 60 and contractValue >= 60; production: EWA >= 5; production: VORP >= 1; production: PER >= 16; extra: EWA >= 6; extra: PER >= 17; extra: defense/rebounding/connector support                                                                               |

## Remaining miss read

- Remaining misses written to `remaining_misses.csv`: 10.
- Too-low >= 3M already upgraded to HIGH_END_ROTATION/SOLID_STARTER: 2.
- Too-low >= 3M still in LOW_END_STARTER: 3.
- Read: if the miss is already in an upgraded first-layer tier, inspect range/placement before inventing 1C.

## Files

- `rules.md`: exact combined module rules.
- `distribution.csv`: four-pool current vs combined distribution.
- `transition_matrix.csv`: current -> combined movements.
- `cap_budget.csv`: four-pool cap burden.
- `labeled_eval.csv`: labeled 48 current v2 vs combined eval.
- `lane_hits.csv`: module entrants, signal counts, combinations, BPM buckets, named statuses.
- `remaining_misses.csv`: post-combined miss classification.
- `one_c_necessity_audit.csv`: explicit 1C necessity checks.
