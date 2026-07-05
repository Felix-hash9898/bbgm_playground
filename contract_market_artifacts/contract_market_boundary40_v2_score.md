# Boundary40 Sandbox v2 Contract Market Scoring

boundary40 是 boundary/challenge calibration set，不是 final test。A-C 若为空仍按 missing/skip，不把空 human amount 当 0。

v2 仍然保留 v1 的 Debug tier / Debug range。这里的 v2 overlap/too_low/too_high 是用 `debugPointEstimateM` 当作 point ask 与 human range 比较；v1 overlap 仍是完整 range 与 human range 比较。因此 v1/v2 数字不是同一口径的最终准确率，而是用于观察 range coverage 与 point placement 的差异。

Severe threshold: 不重叠时 gap >= $8.00M 或 >= 5.0% salary cap（当前 cap $154.65M，5% cap = $7.73M）。

## v1 vs v2 总览

| metric                 | v1 range | v2 point |
| ---------------------- | -------- | -------- |
| total cases            | 40       | 40       |
| labeled cases          | 28       | 28       |
| missing/skipped        | 12       | 12       |
| overlap / point inside | 17       | 7        |
| too_low / point below  | 11       | 20       |
| too_high / point above | 0        | 1        |
| severe                 | 3        | 3        |

## Point Estimate Error

| metric                                | value |
| ------------------------------------- | ----- |
| mean absolute gap to human midpoint   | 4.23  |
| median absolute gap to human midpoint | 2.71  |
| point inside human range              | 7     |
| point below human range               | 20    |
| point above human range               | 1     |
| mean outside-range gap                | 2.48  |

## By Bucket Summary

| bucket                      | cases | labeled | missing | v1 overlap | v1 low | v1 high | v1 severe | v2 inside | v2 below | v2 above | v2 severe | mean v2 signed gap |
| --------------------------- | ----- | ------- | ------- | ---------- | ------ | ------- | --------- | --------- | -------- | -------- | --------- | ------------------ |
| minimum_fringe_negative     | 4     | 0       | 4       | 0          | 0      | 0       | 0         | 0         | 0        | 0        | 0         |                    |
| minimum_plus_functional_vet | 4     | 0       | 4       | 0          | 0      | 0       | 0         | 0         | 0        | 0        | 0         |                    |
| low_rotation                | 4     | 0       | 4       | 0          | 0      | 0       | 0         | 0         | 0        | 0        | 0         |                    |
| good_rotation_specialist    | 4     | 4       | 0       | 2          | 2      | 0       | 0         | 2         | 2        | 0        | 0         | -1.17              |
| high_end_rotation_sixth_man | 4     | 4       | 0       | 1          | 3      | 0       | 1         | 0         | 4        | 0        | 1         | -5.82              |
| low_end_starter             | 4     | 4       | 0       | 3          | 1      | 0       | 0         | 1         | 2        | 1        | 0         | -0.83              |
| solid_starter               | 4     | 4       | 0       | 2          | 2      | 0       | 1         | 2         | 2        | 0        | 1         | -3.24              |
| good_high_starter           | 4     | 4       | 0       | 1          | 3      | 0       | 1         | 1         | 3        | 0        | 1         | -4                 |
| star_near_max               | 4     | 4       | 0       | 4          | 0      | 0       | 0         | 1         | 3        | 0        | 0         | -0.55              |
| superstar_max_lock          | 4     | 4       | 0       | 4          | 0      | 0       | 0         | 0         | 4        | 0        | 0         | -0.66              |

## Failure Mode Summary

| risk / failure flag            | labeled case count |
| ------------------------------ | ------------------ |
| high_turnover_creator_risk     | 11                 |
| high_turnover_role_player_risk | 8                  |
| defense_impact_noisy           | 3                  |
| non_scoring_impact_positive    | 3                  |
| shooting_portable              | 3                  |
| young_proven_positive          | 3                  |
| small_guard_defense_stat_risk  | 2                  |
| low_efficiency_shooter_risk    | 1                  |
| young_pot_only                 | 1                  |

## Trade Exploit Risk Summary

Trade exploit risk 是旁路 audit flag，不回流进 `debugPointEstimateM`，也没有读取 current trade engine value。

| tradeExploitRiskFlag | count |
| -------------------- | ----- |
| none                 | 19    |
| low                  | 13    |
| medium               | 4     |
| high                 | 4     |

## Cases Improved

_No labeled cases improved by the point placement metric._

## Cases Worsened

| case | global | player                   | bucket                      | human           | v1 tier                | v1 range        | v1      | v2 point | v2 point | v2 gap M | risk flags                                                          | trade risk | change                      |
| ---- | ------ | ------------------------ | --------------------------- | --------------- | ---------------------- | --------------- | ------- | -------- | -------- | -------- | ------------------------------------------------------------------- | ---------- | --------------------------- |
| F-01 | B40-21 | Shaedon Sharpe           | low_end_starter             | $20.00M-$30.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low | $15.02M  | too_low  | 4.98     | young_proven_positive; high_turnover_role_player_risk               | low        | worsened_gap                |
| G-02 | B40-26 | Isaiah Stewart           | solid_starter               | $20.00M-$25.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low | $15.62M  | too_low  | 4.38     | high_turnover_role_player_risk                                      | high       | worsened_gap                |
| F-04 | B40-24 | Kentavious Caldwell-Pope | low_end_starter             | $6.00M-$12.00M  | LOW_END_STARTER        | $9.28M-$18.56M  | overlap | $14.22M  | too_high | 2.22     | high_turnover_role_player_risk                                      | none       | worsened_from_range_overlap |
| I-01 | B40-33 | Saben Lee                | star_near_max               | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.52M  | too_low  | 0.88     | small_guard_defense_stat_risk; high_turnover_creator_risk           | low        | worsened_from_range_overlap |
| I-03 | B40-35 | Patrick Williams         | star_near_max               | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.66M  | too_low  | 0.74     | high_turnover_creator_risk                                          | low        | worsened_from_range_overlap |
| J-04 | B40-40 | Luka Dončić              | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.67M  | too_low  | 0.73     | high_turnover_creator_risk                                          | low        | worsened_from_range_overlap |
| J-01 | B40-37 | Justin Champagnie        | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.73M  | too_low  | 0.67     | high_turnover_creator_risk                                          | low        | worsened_from_range_overlap |
| J-02 | B40-38 | Scottie Barnes           | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.77M  | too_low  | 0.63     | high_turnover_creator_risk; shooting_portable; defense_impact_noisy | low        | worsened_from_range_overlap |
| J-03 | B40-39 | Joshua Primo             | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.77M  | too_low  | 0.63     | high_turnover_creator_risk; shooting_portable; defense_impact_noisy | low        | worsened_from_range_overlap |
| I-02 | B40-34 | Josh Giddey              | star_near_max               | $38.66M         | STAR_NEAR_MAX          | $34.02M-$38.66M | overlap | $38.08M  | too_low  | 0.58     | high_turnover_creator_risk                                          | low        | worsened_from_range_overlap |
| F-03 | B40-23 | Isaac Okoro              | low_end_starter             | $15.00M-$20.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap | $14.43M  | too_low  | 0.57     | high_turnover_role_player_risk; low_efficiency_shooter_risk         | low        | worsened_from_range_overlap |
| E-01 | B40-17 | Yogi Ferrell             | high_end_rotation_sixth_man | $8.00M-$12.00M  | VETERAN_ROTATION_GUARD | $6.19M-$9.28M   | overlap | $7.77M   | too_low  | 0.23     | small_guard_defense_stat_risk; non_scoring_impact_positive          | none       | worsened_from_range_overlap |

## Cases Still Severe

| case | global | player       | bucket                      | human           | v1 tier              | v1 range       | v1      | v2 point | v2 point | v2 gap M | risk flags                                            | trade risk | change       |
| ---- | ------ | ------------ | --------------------------- | --------------- | -------------------- | -------------- | ------- | -------- | -------- | -------- | ----------------------------------------------------- | ---------- | ------------ |
| E-02 | B40-18 | Nikola Jović | high_end_rotation_sixth_man | $20.00M-$30.00M | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M  | too_low | $5.73M   | too_low  | 14.27    | young_proven_positive; high_turnover_role_player_risk | high       | roughly_same |
| H-02 | B40-30 | Ben Simmons  | good_high_starter           | $30.00M-$35.00M | LOW_END_STARTER      | $9.28M-$18.56M | too_low | $17.03M  | too_low  | 12.97    |                                                       | medium     | roughly_same |
| G-04 | B40-28 | Džanan Musa  | solid_starter               | $12.00M-$18.00M | MINIMUM_LEVEL        | $3.15M-$3.62M  | too_low | $3.44M   | too_low  | 8.56     | high_turnover_creator_risk                            | medium     | roughly_same |

## All Cases

| case | global | player                   | bucket                      | human           | v1 tier                | v1 range        | v1      | v2 point | v2 point | v2 gap M | risk flags                                                          | trade risk | change                      |
| ---- | ------ | ------------------------ | --------------------------- | --------------- | ---------------------- | --------------- | ------- | -------- | -------- | -------- | ------------------------------------------------------------------- | ---------- | --------------------------- |
| A-01 | B40-01 | Al-Farouq Aminu          | minimum_fringe_negative     |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing | $3.80M   | missing  |          |                                                                     | none       | missing                     |
| A-02 | B40-02 | Bogdan Bogdanović        | minimum_fringe_negative     |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing | $3.79M   | missing  |          | offensive_liability_risk                                            | none       | missing                     |
| A-03 | B40-03 | Pat Connaughton          | minimum_fringe_negative     |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing | $3.81M   | missing  |          |                                                                     | none       | missing                     |
| A-04 | B40-04 | Andrew Harrison          | minimum_fringe_negative     |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing | $3.80M   | missing  |          | offensive_liability_risk                                            | none       | missing                     |
| B-01 | B40-05 | John Wall                | minimum_plus_functional_vet |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing | $3.85M   | missing  |          |                                                                     | none       | missing                     |
| B-02 | B40-06 | Will Barton              | minimum_plus_functional_vet |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing | $3.87M   | missing  |          |                                                                     | none       | missing                     |
| B-03 | B40-07 | Blake Griffin            | minimum_plus_functional_vet |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing | $3.94M   | missing  |          | defense_impact_noisy                                                | none       | missing                     |
| B-04 | B40-08 | Justin Holiday           | minimum_plus_functional_vet |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing | $3.87M   | missing  |          |                                                                     | none       | missing                     |
| C-01 | B40-09 | Keyonte George           | low_rotation                |                 | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | missing | $5.12M   | missing  |          | young_pot_only                                                      | none       | missing                     |
| C-02 | B40-10 | Jordan Hall              | low_rotation                |                 | MINIMUM_LEVEL          | $2.43M-$2.79M   | missing | $2.54M   | missing  |          | young_pot_only                                                      | none       | missing                     |
| C-03 | B40-11 | Bennedict Mathurin       | low_rotation                |                 | MINIMUM_LEVEL          | $2.43M-$2.79M   | missing | $2.59M   | missing  |          |                                                                     | none       | missing                     |
| C-04 | B40-12 | Alex Sarr                | low_rotation                |                 | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | missing | $5.40M   | missing  |          | young_pot_only                                                      | high       | missing                     |
| D-01 | B40-13 | Simisola Shittu          | good_rotation_specialist    | $3.00M-$5.00M   | MINIMUM_LEVEL          | $2.94M-$3.38M   | overlap | $3.13M   | overlap  | 0        |                                                                     | none       | roughly_same                |
| D-02 | B40-14 | Jordan Poole             | good_rotation_specialist    | $6.00M-$10.00M  | LOW_ROTATION_PLUS      | $3.09M-$5.41M   | too_low | $4.12M   | too_low  | 1.88     |                                                                     | none       | roughly_same                |
| D-03 | B40-15 | Jaylen Wells             | good_rotation_specialist    | $8.00M-$14.00M  | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | too_low | $5.22M   | too_low  | 2.78     | young_pot_only                                                      | none       | roughly_same                |
| D-04 | B40-16 | Keegan Murray            | good_rotation_specialist    | $4.00M-$8.00M   | SPECIALIST_ROTATION    | $5.41M-$8.51M   | overlap | $6.49M   | overlap  | 0        |                                                                     | none       | roughly_same                |
| E-01 | B40-17 | Yogi Ferrell             | high_end_rotation_sixth_man | $8.00M-$12.00M  | VETERAN_ROTATION_GUARD | $6.19M-$9.28M   | overlap | $7.77M   | too_low  | 0.23     | small_guard_defense_stat_risk; non_scoring_impact_positive          | none       | worsened_from_range_overlap |
| E-02 | B40-18 | Nikola Jović             | high_end_rotation_sixth_man | $20.00M-$30.00M | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | too_low | $5.73M   | too_low  | 14.27    | young_proven_positive; high_turnover_role_player_risk               | high       | roughly_same                |
| E-03 | B40-19 | Malik Beasley            | high_end_rotation_sixth_man | $6.00M-$10.00M  | MINIMUM_LEVEL          | $3.37M-$3.88M   | too_low | $3.63M   | too_low  | 2.37     |                                                                     | none       | roughly_same                |
| E-04 | B40-20 | Julian Strawther         | high_end_rotation_sixth_man | $12.00M-$18.00M | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | too_low | $5.60M   | too_low  | 6.4      | young_proven_positive                                               | medium     | roughly_same                |
| F-01 | B40-21 | Shaedon Sharpe           | low_end_starter             | $20.00M-$30.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low | $15.02M  | too_low  | 4.98     | young_proven_positive; high_turnover_role_player_risk               | low        | worsened_gap                |
| F-02 | B40-22 | Mfiondu Kabengele        | low_end_starter             | $10.00M-$16.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap | $15.40M  | overlap  | 0        | high_turnover_creator_risk; shooting_portable                       | none       | roughly_same                |
| F-03 | B40-23 | Isaac Okoro              | low_end_starter             | $15.00M-$20.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap | $14.43M  | too_low  | 0.57     | high_turnover_role_player_risk; low_efficiency_shooter_risk         | low        | worsened_from_range_overlap |
| F-04 | B40-24 | Kentavious Caldwell-Pope | low_end_starter             | $6.00M-$12.00M  | LOW_END_STARTER        | $9.28M-$18.56M  | overlap | $14.22M  | too_high | 2.22     | high_turnover_role_player_risk                                      | none       | worsened_from_range_overlap |
| G-01 | B40-25 | Jordan Bell              | solid_starter               | $12.00M-$20.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap | $15.85M  | overlap  | 0        | high_turnover_role_player_risk; non_scoring_impact_positive         | high       | roughly_same                |
| G-02 | B40-26 | Isaiah Stewart           | solid_starter               | $20.00M-$25.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low | $15.62M  | too_low  | 4.38     | high_turnover_role_player_risk                                      | high       | worsened_gap                |
| G-03 | B40-27 | OG Anunoby               | solid_starter               | $12.00M-$18.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap | $16.03M  | overlap  | 0        | non_scoring_impact_positive                                         | medium     | roughly_same                |
| G-04 | B40-28 | Džanan Musa              | solid_starter               | $12.00M-$18.00M | MINIMUM_LEVEL          | $3.15M-$3.62M   | too_low | $3.44M   | too_low  | 8.56     | high_turnover_creator_risk                                          | medium     | roughly_same                |
| H-01 | B40-29 | Kevin Knox               | good_high_starter           | $25.00M-$35.00M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | overlap | $33.02M  | overlap  | 0        | high_turnover_role_player_risk                                      | low        | roughly_same                |
| H-02 | B40-30 | Ben Simmons              | good_high_starter           | $30.00M-$35.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low | $17.03M  | too_low  | 12.97    |                                                                     | medium     | roughly_same                |
| H-03 | B40-31 | LaMelo Ball              | good_high_starter           | $35.00M-$40.00M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | too_low | $33.66M  | too_low  | 1.34     | high_turnover_creator_risk                                          | low        | roughly_same                |
| H-04 | B40-32 | Kai Jones                | good_high_starter           | $35.00M-$40.00M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | too_low | $33.30M  | too_low  | 1.7      | high_turnover_role_player_risk; defense_impact_noisy                | low        | roughly_same                |
| I-01 | B40-33 | Saben Lee                | star_near_max               | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.52M  | too_low  | 0.88     | small_guard_defense_stat_risk; high_turnover_creator_risk           | low        | worsened_from_range_overlap |
| I-02 | B40-34 | Josh Giddey              | star_near_max               | $38.66M         | STAR_NEAR_MAX          | $34.02M-$38.66M | overlap | $38.08M  | too_low  | 0.58     | high_turnover_creator_risk                                          | low        | worsened_from_range_overlap |
| I-03 | B40-35 | Patrick Williams         | star_near_max               | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.66M  | too_low  | 0.74     | high_turnover_creator_risk                                          | low        | worsened_from_range_overlap |
| I-04 | B40-36 | Trae Young               | star_near_max               | $44.00M-$46.40M | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.59M  | overlap  | 0        | high_turnover_creator_risk                                          | low        | roughly_same                |
| J-01 | B40-37 | Justin Champagnie        | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.73M  | too_low  | 0.67     | high_turnover_creator_risk                                          | low        | worsened_from_range_overlap |
| J-02 | B40-38 | Scottie Barnes           | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.77M  | too_low  | 0.63     | high_turnover_creator_risk; shooting_portable; defense_impact_noisy | low        | worsened_from_range_overlap |
| J-03 | B40-39 | Joshua Primo             | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.77M  | too_low  | 0.63     | high_turnover_creator_risk; shooting_portable; defense_impact_noisy | low        | worsened_from_range_overlap |
| J-04 | B40-40 | Luka Dončić              | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.67M  | too_low  | 0.73     | high_turnover_creator_risk                                          | low        | worsened_from_range_overlap |

## Overfit Risk Notes

- v2 没有按 pid/caseId 写规则，case 只作为 evidence。
- v2 只做 tier-internal point placement 和 audit flags；没有重抽样，也没有把 validation/boundary 当 final test。
- boundary40 candidate 字段少于 validation20，缺失 composite/skill margin 时 v2 会降级到 stats/value/role proxies，因此某些 skillPortability 与 defense flags 需要后续用更完整字段复核。
- trade exploit risk 只标记 cheap ask + high asset proxy 风险，不把当前 trade value 当合同 ask 输入。
