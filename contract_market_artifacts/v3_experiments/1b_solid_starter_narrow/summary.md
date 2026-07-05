# V3-1B-narrow SOLID_STARTER sweep

This is an artifact-only sweep. It tests three narrowed SOLID_STARTER variants and writes all outputs inside this directory. No src, formal scoreTier, sandbox v2, existing score CSVs, sampling, or temp files were changed.

## Verdict comparison

| variant | verdict      | entrants | LOW_END -> SOLID | rostered delta/30 | top15 delta/30 | severe | too_high | too_low fixed | too_high added |
| ------- | ------------ | -------- | ---------------- | ----------------- | -------------- | ------ | -------- | ------------- | -------------- |
| A       | inconclusive | 19       | 19 (30.2%)       | 3.1%              | 3.1%           | 4->2   | 7->9     | 2             | 2              |
| B       | inconclusive | 17       | 17 (27.0%)       | 2.8%              | 2.8%           | 4->2   | 7->8     | 1             | 1              |
| C       | inconclusive | 10       | 10 (15.9%)       | 1.5%              | 1.5%           | 4->3   | 7->7     | 0             | 0              |

## Answers

- A/B/C safety: A=inconclusive, B=inconclusive, C=inconclusive.
- Best semantic match: B. It is the closest default candidate because it targets a smaller LOW_END_STARTER subset than A while avoiding C becoming too narrow, but it still needs review before implementation.
- Old 1B failure: yes, the old 1B failure was mainly entry-gate breadth. It lifted 43/63 LOW_END_STARTER players; the narrow variants reduce that.
- BPM < 0 among entrants: no. A: BPM<0 entrants 0, exception path 0; B: BPM<0 entrants 0, exception path 0; C: BPM<0 entrants 0, exception path 0. No variant used the BPM<0 exception path in this run.
- SOLID_STARTER bridge should be retained as a V3 candidate module: yes, as a candidate module only; the sweep supports continued analysis, not implementation.
- Continue to V3-1C or revise 1B again: review this sweep first. If B/C are too narrow or still add too_high, revise 1B; otherwise continue to 1C after choosing a target envelope.

## Distribution snapshot

| variant | tier          | count | %    | avg age | avg MPG | avg valueNoPot | avg contractValue | avg BPM |
| ------- | ------------- | ----- | ---- | ------- | ------- | -------------- | ----------------- | ------- |
| A       | SOLID_STARTER | 19    | 3.0% | 29.474  | 32.47   | 62.143         | 61.638            | 4.032   |
| B       | SOLID_STARTER | 17    | 2.7% | 29.647  | 32.669  | 62.413         | 61.877            | 3.974   |
| C       | SOLID_STARTER | 10    | 1.6% | 29.6    | 33.409  | 63.022         | 62.503            | 4.325   |

## Cap-budget totals

| variant | pool               | total mid cap | mid/30 | delta  |
| ------- | ------------------ | ------------- | ------ | ------ |
| A       | all_active         | 2892.0%       | 96.4%  | 104.5% |
| A       | rostered_active    | 2449.7%       | 81.7%  | 93.5%  |
| A       | top15_roster_proxy | 2402.1%       | 80.1%  | 93.5%  |
| A       | contract_relevant  | 1081.3%       | 36.0%  | 27.5%  |
| B       | all_active         | 2881.0%       | 96.0%  | 93.5%  |
| B       | rostered_active    | 2438.7%       | 81.3%  | 82.5%  |
| B       | top15_roster_proxy | 2391.1%       | 79.7%  | 82.5%  |
| B       | contract_relevant  | 1081.3%       | 36.0%  | 27.5%  |
| C       | all_active         | 2842.5%       | 94.7%  | 55.0%  |
| C       | rostered_active    | 2400.2%       | 80.0%  | 44.0%  |
| C       | top15_roster_proxy | 2352.6%       | 78.4%  | 44.0%  |
| C       | contract_relevant  | 1075.8%       | 35.9%  | 22.0%  |

## Labeled SOLID_STARTER cases

| variant | case   | bucket                        | human           | current point | candidate point | direction | delta gap | signals                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ------ | ----------------------------- | --------------- | ------------- | --------------- | --------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A       | G-01   | solid_starter                 | $12.00M-$20.00M | 15.85         | 23.99           | too_high  | 3.99      | role: starterShare >= 0.6; role: GS >= 41; value core: valueNoPot >= 59 and contractValue >= 59; production: BPM >= 0.5; production: EWA >= 4; production: VORP >= 0.8; production: PER >= 15.5; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support                                                           |
| A       | G-03   | solid_starter                 | $12.00M-$18.00M | 16.03         | 24.17           | too_high  | 6.17      | role: starterShare >= 0.6; role: GS >= 41; value core: valueNoPot >= 59 and contractValue >= 59; production: BPM >= 0.5; production: EWA >= 4; production: VORP >= 0.8; production: PER >= 15.5; extra: BPM >= 1; extra: VORP >= 1; extra: defense/rebounding/connector support; extra: shooting/spacing support                                                             |
| A       | H-02   | good_high_starter             | $30.00M-$35.00M | 17.03         | 24.99           | too_low   | -7.96     | role: starterShare >= 0.6; role: GS >= 41; role: MPG >= 30; value core: valueNoPot >= 59 and contractValue >= 59; production: BPM >= 0.5; production: EWA >= 4; production: VORP >= 0.8; production: PER >= 15.5; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support                                          |
| A       | V20-09 | low_end_starter_good_rotation | $22.00M-$27.00M | 15.65         | 23.87           | inside    | -6.35     | role: starterShare >= 0.6; role: GS >= 41; role: MPG >= 30; value core: valueNoPot >= 59 and contractValue >= 59; production: BPM >= 0.5; production: EWA >= 4; production: VORP >= 0.8; production: PER >= 15.5; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support                                          |
| A       | V20-10 | low_end_starter_good_rotation | $24.00M-$29.00M | 16.86         | 24.88           | inside    | -7.14     | role: starterShare >= 0.6; role: GS >= 41; role: MPG >= 30; value core: valueNoPot >= 59 and contractValue >= 59; production: BPM >= 0.5; production: EWA >= 4; production: VORP >= 0.8; production: PER >= 15.5; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support; extra: age <= 27 with value/pot support |
| A       | V20-11 | low_end_starter_good_rotation | $24.00M-$28.00M | 15.4          | 23.66           | too_low   | -8.26     | role: starterShare >= 0.6; role: GS >= 41; role: MPG >= 30; value core: valueNoPot >= 59 and contractValue >= 59; production: BPM >= 0.5; production: EWA >= 4; production: VORP >= 0.8; production: PER >= 15.5; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support                                                           |
| B       | G-03   | solid_starter                 | $12.00M-$18.00M | 16.03         | 24.17           | too_high  | 6.17      | role: starterShare >= 0.65; role: GS >= 50; value core: valueNoPot >= 60 and contractValue >= 60; production: BPM >= 1; production: VORP >= 1; extra: BPM >= 1.5; extra: VORP >= 1.5; extra: defense/rebounding/connector support; extra: shooting/spacing support                                                                                                           |
| B       | H-02   | good_high_starter             | $30.00M-$35.00M | 17.03         | 24.99           | too_low   | -7.96     | role: starterShare >= 0.65; role: GS >= 50; role: MPG >= 31; value core: valueNoPot >= 60 and contractValue >= 60; production: BPM >= 1; production: EWA >= 5; production: VORP >= 1; production: PER >= 16; extra: BPM >= 1.5; extra: EWA >= 6; extra: VORP >= 1.5; extra: PER >= 17; extra: defense/rebounding/connector support                                           |
| B       | V20-09 | low_end_starter_good_rotation | $22.00M-$27.00M | 15.65         | 23.87           | inside    | -6.35     | role: starterShare >= 0.65; role: GS >= 50; role: MPG >= 31; value core: valueNoPot >= 60 and contractValue >= 60; production: BPM >= 1; production: EWA >= 5; production: VORP >= 1; production: PER >= 16; extra: EWA >= 6; extra: VORP >= 1.5; extra: PER >= 17; extra: defense/rebounding/connector support                                                              |
| B       | V20-11 | low_end_starter_good_rotation | $24.00M-$28.00M | 15.4          | 23.66           | too_low   | -8.26     | role: starterShare >= 0.65; role: GS >= 50; value core: valueNoPot >= 60 and contractValue >= 60; production: EWA >= 5; production: VORP >= 1; production: PER >= 16; extra: EWA >= 6; extra: PER >= 17; extra: defense/rebounding/connector support                                                                                                                         |
| C       | H-02   | good_high_starter             | $30.00M-$35.00M | 17.03         | 24.99           | too_low   | -7.96     | role: starterShare >= 0.7; role: GS >= 55; value core: valueNoPot >= 61 and contractValue >= 61; production: BPM >= 1; production: EWA >= 5; production: VORP >= 1; production: PER >= 16; extra: BPM >= 2; extra: EWA >= 7; extra: VORP >= 2; extra: PER >= 18; extra: defense/rebounding/connector support                                                                 |
