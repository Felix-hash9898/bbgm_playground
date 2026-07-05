# V3-AB range / placement / team-payroll diagnosis

Artifact-only diagnosis. This does not implement V3, alter first-layer rules, modify src, modify formal scoreTier/MODEL_TIERS, modify sandbox v2, change existing score CSVs, resample, write temp outputs, or commit.

## Direct Answers

1. V1 existing ranges after V3-AB: no broad explosion in existing tiers, but YOUNG_PROVEN_STARTER still has some human-above-range signals; treat as calibration evidence, not an automatic first-layer change.
2. HIGH_END_ROTATION 7%-12%: range_too_low; labeled cases show one too-high/one too-low tension, so range needs review but not a single-case change.
3. SOLID_STARTER 12%-17%: range_too_low; H-02 is below the upper range while G-03 is above human, so the problem is mixed range/placement/human-range calibration.
4. too_high 7->9: more likely new-tier range/placement plus possibly low human ranges on individual calibration cases, not a clean first-layer failure.
5. H-02 / Simmons: human_range_above_tier_range -> likely range too low or tier too low; status too_low, gap 5.01M.
6. V20-11 / AD: yes, near-boundary minor miss; gap 0.34M.
7. Team top15 implied payroll: median 90.7% cap, mean 89.2% cap.
8. 160%/180% outliers: teams >=160% 0, teams >=180% 0; max 128.7%.
9. Team explosions, if any: see `team_payroll_outliers.csv`; attribution separates 1A, 1B-B, and baseline/other.
10. Range sweep: yes, narrow optional sweep was run because new tier cases have both high and low signals. Best diagnostic row by severe/too_high/mean-gap ordering: HER 7%-12%, SOLID 12%-17%.
11. Blind validation/test set: not yet. First review range/placement and team payroll; then a blind validation set is reasonable before formal implementation.

## Tier Range Diagnosis

| tier                   | cases | mean gap | median gap | severe | too_low | too_high | near | human below | overlap | human above | diagnosis        |
| ---------------------- | ----- | -------- | ---------- | ------ | ------- | -------- | ---- | ----------- | ------- | ----------- | ---------------- |
| SUPERSTAR_MAX          | 2     | 0        | 0          | 0      | 0       | 0        | 0    | 0           | 0       | 2           | range_too_low    |
| STAR_NEAR_MAX          | 11    | 0.79     | 0.72       | 0      | 0       | 1        | 9    | 0           | 3       | 8           | placement_issue  |
| YOUNG_PROVEN_STARTER   | 7     | 2.713    | 1.78       | 0      | 4       | 1        | 1    | 0           | 3       | 4           | placement_issue  |
| SOLID_STARTER          | 4     | 2.88     | 2.675      | 0      | 1       | 1        | 1    | 1           | 2       | 1           | range_too_low    |
| LOW_END_STARTER        | 7     | 2.827    | 2.22       | 0      | 3       | 1        | 1    | 0           | 4       | 3           | range_too_low    |
| HIGH_END_ROTATION      | 4     | 1.842    | 1.41       | 0      | 1       | 1        | 0    | 0           | 3       | 1           | range_too_low    |
| SPECIALIST_ROTATION    | 3     | 1.37     | 1.14       | 0      | 1       | 0        | 1    | 0           | 2       | 1           | range_too_low    |
| YOUNG_UPSIDE_SUSPECT   | 1     | 2.81     | 2.81       | 0      | 1       | 0        | 0    | 0           | 0       | 1           | sample_too_small |
| VETERAN_ROTATION_GUARD | 1     | 2.3      | 2.3        | 0      | 1       | 0        | 0    | 0           | 0       | 1           | sample_too_small |
| LOW_ROTATION_PLUS      | 1     | 1.88     | 1.88       | 0      | 1       | 0        | 0    | 0           | 0       | 1           | sample_too_small |
| VETERAN_MINIMUM_PLUS   | 1     | 0        | 0          | 0      | 0       | 0        | 0    | 0           | 1       | 0           | sample_too_small |
| MINIMUM_LEVEL          | 6     | 0.428    | 0.05       | 0      | 1       | 0        | 4    | 0           | 5       | 1           | range_too_low    |

## Placement Highlights

| dataset      | case   | tier              | module | human           | tier range      | point | gap  | miss type                | decomposition                                                          |
| ------------ | ------ | ----------------- | ------ | --------------- | --------------- | ----- | ---- | ------------------------ | ---------------------------------------------------------------------- |
| boundary40   | H-02   | SOLID_STARTER     | 1B-B   | $30.00M-$35.00M | $18.56M-$26.29M | 24.99 | 5.01 | too_low                  | human_range_above_tier_range -> likely range too low or tier too low   |
| validation20 | V20-11 | SOLID_STARTER     | 1B-B   | $24.00M-$28.00M | $18.56M-$26.29M | 23.66 | 0.34 | near_boundary_minor_miss | near_boundary -> minor, do not overreact                               |
| boundary40   | G-03   | SOLID_STARTER     | 1B-B   | $12.00M-$18.00M | $18.56M-$26.29M | 24.17 | 6.17 | too_high                 | human_range_below_tier_range -> likely range too high or tier too high |
| boundary40   | E-01   | HIGH_END_ROTATION | 1A     | $8.00M-$12.00M  | $10.83M-$18.56M | 14.82 | 2.82 | too_high                 | human_range_overlaps_tier_range_but_point_misses -> placement issue    |

## Team Payroll Summary

| model    | mean   | median | p10    | p25    | p75     | p90     | max     | >=145 | >=160 | >=180 |
| -------- | ------ | ------ | ------ | ------ | ------- | ------- | ------- | ----- | ----- | ----- |
| current  | 80.08  | 80.818 | 61.035 | 65.647 | 92.633  | 102.379 | 111.206 | 0     | 0     | 0     |
| combined | 89.198 | 90.682 | 65.804 | 76.992 | 102.946 | 111.579 | 128.723 | 0     | 0     | 0     |

Outliers >=145%: 0. Team delta attribution rows: 24.

## Range Sweep Read

| HER        | SOLID   | mean gap | median gap | severe | too_low | too_high | teams >=145 | teams >=160 |
| ---------- | ------- | -------- | ---------- | ------ | ------- | -------- | ----------- | ----------- |
| 6%-10%     | 10%-14% | 1.807    | 0.75       | 1      | 28      | 9        | 0           | 0           |
| 6%-10%     | 11%-15% | 1.742    | 0.745      | 1      | 28      | 9        | 0           | 0           |
| 6%-10%     | 12%-16% | 1.694    | 0.745      | 0      | 27      | 9        | 0           | 0           |
| 6%-10%     | 12%-17% | 1.67     | 0.73       | 0      | 27      | 9        | 0           | 0           |
| 6.5%-10.5% | 10%-14% | 1.807    | 0.775      | 1      | 28      | 9        | 0           | 0           |
| 6.5%-10.5% | 11%-15% | 1.742    | 0.75       | 1      | 28      | 9        | 0           | 0           |
| 6.5%-10.5% | 12%-16% | 1.694    | 0.75       | 0      | 27      | 9        | 0           | 0           |
| 6.5%-10.5% | 12%-17% | 1.67     | 0.745      | 0      | 27      | 9        | 0           | 0           |
