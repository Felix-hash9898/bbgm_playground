# Blind Validation30 Current vs V3-AB Eval

Scope: artifact-only held-out eval. This does not tune rules, implement V3, edit `src/`, edit `tools/contract-market-tier-score.mjs`, revive Candidate0, revive broad HIGH_IMPACT_STARTER, or revive broad 1C.

## Input Status

- completed_n / total_n: 30 / 30
- aligned_n: 30
- evaluable_n: 27
- low_confidence_evaluable_n: 3
- required numeric fields issue: all notes have blank human_min_m/human_max_m; evaluable ranges were parsed from role_note shorthand where possible.

## Core Metrics

| scope              | model   | n   | evaluable_n | mean_absolute_gap_m | median_absolute_gap_m | in_range_count | fine_count | acceptable_count | review_count | major_count | too_low_count | too_high_count |
| ------------------ | ------- | --- | ----------- | ------------------- | --------------------- | -------------- | ---------- | ---------------- | ------------ | ----------- | ------------- | -------------- |
| all evaluable      | current | 27  | 27          | 1.78                | 0.13                  | 13             | 22         | 2                | 1            | 2           | 10            | 4              |
| all evaluable      | V3-AB   | 27  | 27          | 1.34                | 0.05                  | 13             | 21         | 3                | 2            | 1           | 5             | 9              |
| non-low-confidence | current | 24  | 24          | 1.74                | 0.07                  | 12             | 21         | 0                | 1            | 2           | 8             | 4              |
| non-low-confidence | V3-AB   | 24  | 24          | 1.24                | 0.03                  | 12             | 20         | 1                | 2            | 1           | 3             | 9              |
| low-confidence     | current | 3   | 3           | 2.12                | 3.05                  | 1              | 1          | 2                | 0            | 0           | 2             | 0              |
| low-confidence     | V3-AB   | 3   | 3           | 2.12                | 3.05                  | 1              | 1          | 2                | 0            | 0           | 2             | 0              |

V3 case result count: 4 better, 4 worse, 19 tied, 0 missing.

## Interpretation

- Overall, V3-AB is better on mean absolute gap (1.34M vs 1.78M) and better on median (0.05M vs 0.13M).
- Directionally, current has 10 too_low and 4 too_high; V3 has 5 too_low and 9 too_high.
- Low-confidence cases are reported separately and should not be treated as hard failures.

## Tier Safety

- HIGH_END_ROTATION: n=5; V3 mean gap 4.06M vs current 6.06M; V3 in_range 1/5; V3 major 1; V3 too_low 1, too_high 3.
- SOLID_STARTER: n=4; V3 mean gap 0.08M vs current 0.55M; V3 in_range 2/4; V3 major 0; V3 too_low 0, too_high 2.

## Responsible Module Impact

| responsibleModule | n   | current_mean_gap_m | v3_mean_gap_m | delta_m | v3_major | v3_too_high | v3_too_low |
| ----------------- | --- | ------------------ | ------------- | ------- | -------- | ----------- | ---------- |
| 1A                | 5   | 6.06               | 4.06          | 2       | 1        | 3           | 1          |
| 1B-B              | 4   | 0.55               | 0.08          | 0.47    | 0        | 2           | 0          |

## Major Cases

### Current Major

| caseId  | name                 | confidence  | human_range | current_point | direction | gap_m | hiddenStratum             | tier                |
| ------- | -------------------- | ----------- | ----------- | ------------- | --------- | ----- | ------------------------- | ------------------- |
| BV30-25 | RJ Barrett           | unspecified | 25-35       | 3.26          | too_low   | 21.74 | young_proven_high_starter | MINIMUM_LEVEL       |
| BV30-06 | Georgios Kalaitzakis | unspecified | 16-24       | 7.63          | too_low   | 8.37  | high_end_rotation_v3_ab   | SPECIALIST_ROTATION |

### V3 Major

| caseId  | name       | confidence  | human_range | v3_point | direction | gap_m | hiddenStratum             | tier              |
| ------- | ---------- | ----------- | ----------- | -------- | --------- | ----- | ------------------------- | ----------------- |
| BV30-25 | RJ Barrett | unspecified | 25-35       | 16.44    | too_low   | 8.56  | young_proven_high_starter | HIGH_END_ROTATION |

## Manual Review Queue

| caseId  | name                 | confidence  | human_range | current                | v3                      | v3_result      | note  |
| ------- | -------------------- | ----------- | ----------- | ---------------------- | ----------------------- | -------------- | ----- |
| BV30-25 | RJ Barrett           | unspecified | 25-35       | 3.26 too_low gap=21.74 | 16.44 too_low gap=8.56  | v3_better      | 25-35 |
| BV30-06 | Georgios Kalaitzakis | unspecified | 16-24       | 7.63 too_low gap=8.37  | 16.36 in_range gap=0    | v3_better      | 16-24 |
| BV30-29 | Willie Cauley-Stein  | unspecified | 4-8         | 4.38 in_range gap=0    | 13.86 too_high gap=5.86 | current_better | 4-8   |
| BV30-10 | Aaron Holiday        | unspecified | 6-10        | 7.84 in_range gap=0    | 14.97 too_high gap=4.97 | current_better | 6-10  |
| BV30-11 | Bilal Coulibaly      | low         | 8-20        | 4.69 too_low gap=3.31  | 4.69 too_low gap=3.31   | tie            | 8-20  |
| BV30-18 | Cam Whitmore         | low         | 8-16        | 4.95 too_low gap=3.05  | 4.95 too_low gap=3.05   | tie            | 8-16  |
| BV30-07 | Emmanuel Mudiay      | unspecified | 8-14        | 7.82 too_low gap=0.18  | 14.9 too_high gap=0.9   | current_better | 8-14  |
| BV30-01 | De'Aaron Fox         | medium      | 16-24       | 16.12 in_range gap=0   | 24.26 too_high gap=0.26 | current_better | 16-24 |
| BV30-24 | Anthony Edwards      | low         | 25-35       | 32.22 in_range gap=0   | 32.22 in_range gap=0    | tie            | 25-35 |

## Formal Implementation Readiness

Eval conclusion only: this result can inform a formal implementation plan, but it is not itself an implementation diff. Because human ranges were mostly entered in role_note rather than human_min_m/human_max_m and several young-player cases are low confidence, formal go/no-go should treat those input quality limits explicitly.
