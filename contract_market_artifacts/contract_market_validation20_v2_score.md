# Validation20 Sandbox v2 Contract Market Scoring

validation20 也不是 final unseen test，只是 prior calibration/validation support set。它只能提供方向性支持，不能作为最终准确率。

v2 仍然保留 v1 的 Debug tier / Debug range。这里的 v2 overlap/too_low/too_high 是用 `debugPointEstimateM` 当作 point ask 与 human range 比较；v1 overlap 仍是完整 range 与 human range 比较。因此 v1/v2 数字不是同一口径的最终准确率，而是用于观察 range coverage 与 point placement 的差异。

Severe threshold: 不重叠时 gap >= $8.00M 或 >= 5.0% salary cap（当前 cap $154.65M，5% cap = $7.73M）。

## v1 vs v2 总览

| metric                 | v1 range | v2 point |
| ---------------------- | -------- | -------- |
| total cases            | 20       | 20       |
| labeled cases          | 20       | 20       |
| missing/skipped        | 0        | 0        |
| overlap / point inside | 13       | 7        |
| too_low / point below  | 7        | 11       |
| too_high / point above | 0        | 2        |
| severe                 | 0        | 1        |

## Point Estimate Error

| metric                                | value |
| ------------------------------------- | ----- |
| mean absolute gap to human midpoint   | 3.66  |
| median absolute gap to human midpoint | 1.97  |
| point inside human range              | 7     |
| point below human range               | 11    |
| point above human range               | 2     |
| mean outside-range gap                | 2.42  |

## By Bucket Summary

| bucket                          | cases | labeled | missing | v1 overlap | v1 low | v1 high | v1 severe | v2 inside | v2 below | v2 above | v2 severe | mean v2 signed gap |
| ------------------------------- | ----- | ------- | ------- | ---------- | ------ | ------- | --------- | --------- | -------- | -------- | --------- | ------------------ |
| max_near_max_high_star          | 4     | 4       | 0       | 4          | 0      | 0       | 0         | 2         | 2        | 0        | 0         | -0.38              |
| young_proven_young_starter      | 4     | 4       | 0       | 2          | 2      | 0       | 0         | 0         | 3        | 1        | 0         | -2.26              |
| low_end_starter_good_rotation   | 4     | 4       | 0       | 1          | 3      | 0       | 0         | 0         | 3        | 1        | 1         | -4.41              |
| specialist_low_rotation         | 4     | 4       | 0       | 2          | 2      | 0       | 0         | 1         | 3        | 0        | 0         | -1.6               |
| veteran_minimum_fringe_negative | 4     | 4       | 0       | 4          | 0      | 0       | 0         | 4         | 0        | 0        | 0         | 0                  |

## Failure Mode Summary

| risk / failure flag            | labeled case count |
| ------------------------------ | ------------------ |
| high_turnover_creator_risk     | 7                  |
| defense_impact_supported       | 6                  |
| shooting_portable              | 4                  |
| high_turnover_role_player_risk | 3                  |
| low_efficiency_shooter_risk    | 3                  |
| non_scoring_impact_positive    | 3                  |
| offensive_liability_risk       | 3                  |
| small_guard_defense_stat_risk  | 2                  |
| young_proven_positive          | 2                  |
| defense_impact_noisy           | 1                  |

## Trade Exploit Risk Summary

Trade exploit risk 是旁路 audit flag，不回流进 `debugPointEstimateM`，也没有读取 current trade engine value。

| tradeExploitRiskFlag | count |
| -------------------- | ----- |
| none                 | 9     |
| low                  | 9     |
| medium               | 1     |
| high                 | 1     |

## Cases Improved

_No labeled cases improved by the point placement metric._

## Cases Worsened

| case   | global | player            | bucket                        | human           | v1 tier              | v1 range        | v1      | v2 point | v2 point | v2 gap M | risk flags                                                                      | trade risk | change                      |
| ------ | ------ | ----------------- | ----------------------------- | --------------- | -------------------- | --------------- | ------- | -------- | -------- | -------- | ------------------------------------------------------------------------------- | ---------- | --------------------------- |
| V20-11 |        | Anthony Davis     | low_end_starter_good_rotation | $24.00M-$28.00M | LOW_END_STARTER      | $9.28M-$18.56M  | too_low | $15.40M  | too_low  | 8.6      | high_turnover_role_player_risk; defense_impact_supported                        | high       | worsened_gap                |
| V20-09 |        | Bradley Beal      | low_end_starter_good_rotation | $22.00M-$27.00M | LOW_END_STARTER      | $9.28M-$18.56M  | too_low | $15.65M  | too_low  | 6.35     | high_turnover_creator_risk                                                      | medium     | worsened_gap                |
| V20-12 |        | Jared Butler      | low_end_starter_good_rotation | $23.00M-$28.00M | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | overlap | $32.46M  | too_high | 4.46     |                                                                                 | low        | worsened_from_range_overlap |
| V20-08 |        | Ja Morant         | young_proven_young_starter    | $38.00M-$43.00M | STAR_NEAR_MAX        | $40.83M-$46.40M | overlap | $45.43M  | too_high | 2.43     | high_turnover_creator_risk; defense_impact_noisy                                | low        | worsened_from_range_overlap |
| V20-16 |        | Austin Reaves     | specialist_low_rotation       | $8.00M-$12.00M  | SPECIALIST_ROTATION  | $5.41M-$8.51M   | overlap | $6.86M   | too_low  | 1.14     | shooting_portable; non_scoring_impact_positive                                  | none       | worsened_from_range_overlap |
| V20-03 |        | Marvin Bagley III | max_near_max_high_star        | $46.40M         | STAR_NEAR_MAX        | $40.83M-$46.40M | overlap | $45.59M  | too_low  | 0.81     | high_turnover_creator_risk; defense_impact_supported                            | low        | worsened_from_range_overlap |
| V20-04 |        | Zhaire Smith      | max_near_max_high_star        | $46.40M         | STAR_NEAR_MAX        | $40.83M-$46.40M | overlap | $45.68M  | too_low  | 0.72     | high_turnover_creator_risk; shooting_portable                                   | low        | worsened_from_range_overlap |
| V20-05 |        | Jeremy Sochan     | young_proven_young_starter    | $33.46M         | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | overlap | $32.98M  | too_low  | 0.48     | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        | worsened_from_range_overlap |

## Cases Still Severe

| case   | global | player        | bucket                        | human           | v1 tier         | v1 range       | v1      | v2 point | v2 point | v2 gap M | risk flags                                               | trade risk | change       |
| ------ | ------ | ------------- | ----------------------------- | --------------- | --------------- | -------------- | ------- | -------- | -------- | -------- | -------------------------------------------------------- | ---------- | ------------ |
| V20-11 |        | Anthony Davis | low_end_starter_good_rotation | $24.00M-$28.00M | LOW_END_STARTER | $9.28M-$18.56M | too_low | $15.40M  | too_low  | 8.6      | high_turnover_role_player_risk; defense_impact_supported | high       | worsened_gap |

## All Cases

| case   | global | player            | bucket                          | human           | v1 tier                | v1 range        | v1      | v2 point | v2 point | v2 gap M | risk flags                                                                      | trade risk | change                      |
| ------ | ------ | ----------------- | ------------------------------- | --------------- | ---------------------- | --------------- | ------- | -------- | -------- | -------- | ------------------------------------------------------------------------------- | ---------- | --------------------------- |
| V20-01 |        | Zion Williamson   | max_near_max_high_star          | $46.40M         | SUPERSTAR_MAX          | $46.40M         | overlap | $46.40M  | overlap  | 0        | high_turnover_creator_risk; defense_impact_supported                            | low        | roughly_same                |
| V20-02 |        | Jaden Springer    | max_near_max_high_star          | $46.40M         | SUPERSTAR_MAX          | $46.40M         | overlap | $46.40M  | overlap  | 0        | high_turnover_creator_risk; shooting_portable; defense_impact_supported         | low        | roughly_same                |
| V20-03 |        | Marvin Bagley III | max_near_max_high_star          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.59M  | too_low  | 0.81     | high_turnover_creator_risk; defense_impact_supported                            | low        | worsened_from_range_overlap |
| V20-04 |        | Zhaire Smith      | max_near_max_high_star          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.68M  | too_low  | 0.72     | high_turnover_creator_risk; shooting_portable                                   | low        | worsened_from_range_overlap |
| V20-05 |        | Jeremy Sochan     | young_proven_young_starter      | $33.46M         | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | overlap | $32.98M  | too_low  | 0.48     | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        | worsened_from_range_overlap |
| V20-06 |        | Isaiah Jackson    | young_proven_young_starter      | $40.00M-$46.40M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | too_low | $33.48M  | too_low  | 6.52     | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        | roughly_same                |
| V20-07 |        | Paolo Banchero    | young_proven_young_starter      | $38.00M-$44.00M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | too_low | $33.53M  | too_low  | 4.47     | high_turnover_creator_risk                                                      | low        | roughly_same                |
| V20-08 |        | Ja Morant         | young_proven_young_starter      | $38.00M-$43.00M | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap | $45.43M  | too_high | 2.43     | high_turnover_creator_risk; defense_impact_noisy                                | low        | worsened_from_range_overlap |
| V20-09 |        | Bradley Beal      | low_end_starter_good_rotation   | $22.00M-$27.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low | $15.65M  | too_low  | 6.35     | high_turnover_creator_risk                                                      | medium     | worsened_gap                |
| V20-10 |        | Jason Preston     | low_end_starter_good_rotation   | $24.00M-$29.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low | $16.86M  | too_low  | 7.14     |                                                                                 | none       | roughly_same                |
| V20-11 |        | Anthony Davis     | low_end_starter_good_rotation   | $24.00M-$28.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low | $15.40M  | too_low  | 8.6      | high_turnover_role_player_risk; defense_impact_supported                        | high       | worsened_gap                |
| V20-12 |        | Jared Butler      | low_end_starter_good_rotation   | $23.00M-$28.00M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | overlap | $32.46M  | too_high | 4.46     |                                                                                 | low        | worsened_from_range_overlap |
| V20-13 |        | Landry Shamet     | specialist_low_rotation         | $10.00M-$14.00M | SPECIALIST_ROTATION    | $5.41M-$8.51M   | too_low | $7.03M   | too_low  | 2.97     | small_guard_defense_stat_risk; shooting_portable; non_scoring_impact_positive   | none       | roughly_same                |
| V20-14 |        | Hassan Whiteside  | specialist_low_rotation         | $3.00M-$5.00M   | VETERAN_MINIMUM_PLUS   | $3.71M-$5.41M   | overlap | $4.36M   | overlap  | 0        |                                                                                 | none       | roughly_same                |
| V20-15 |        | Damian Lillard    | specialist_low_rotation         | $10.00M-$14.00M | VETERAN_ROTATION_GUARD | $6.19M-$9.28M   | too_low | $7.70M   | too_low  | 2.3      | small_guard_defense_stat_risk; non_scoring_impact_positive                      | none       | roughly_same                |
| V20-16 |        | Austin Reaves     | specialist_low_rotation         | $8.00M-$12.00M  | SPECIALIST_ROTATION    | $5.41M-$8.51M   | overlap | $6.86M   | too_low  | 1.14     | shooting_portable; non_scoring_impact_positive                                  | none       | worsened_from_range_overlap |
| V20-17 |        | Alec Burks        | veteran_minimum_fringe_negative | $3.71M          | MINIMUM_LEVEL          | $3.71M-$4.27M   | overlap | $3.74M   | overlap  | 0        | low_efficiency_shooter_risk; offensive_liability_risk                           | none       | roughly_same                |
| V20-18 |        | Terrence Jones    | veteran_minimum_fringe_negative | $3.71M          | MINIMUM_LEVEL          | $3.71M-$4.27M   | overlap | $3.76M   | overlap  | 0        | offensive_liability_risk                                                        | none       | roughly_same                |
| V20-19 |        | Jusuf Nurkić      | veteran_minimum_fringe_negative | $3.71M          | MINIMUM_LEVEL          | $3.71M-$4.27M   | overlap | $3.78M   | overlap  | 0        | low_efficiency_shooter_risk                                                     | none       | roughly_same                |
| V20-20 |        | Johnathan Motley  | veteran_minimum_fringe_negative | $3.36M          | MINIMUM_LEVEL          | $3.36M-$3.86M   | overlap | $3.41M   | overlap  | 0        | low_efficiency_shooter_risk; offensive_liability_risk                           | none       | roughly_same                |

## Overfit Risk Notes

- v2 没有按 pid/caseId 写规则，case 只作为 evidence。
- v2 只做 tier-internal point placement 和 audit flags；没有重抽样，也没有把 validation/boundary 当 final test。
- boundary40 candidate 字段少于 validation20，缺失 composite/skill margin 时 v2 会降级到 stats/value/role proxies，因此某些 skillPortability 与 defense flags 需要后续用更完整字段复核。
- trade exploit risk 只标记 cheap ask + high asset proxy 风险，不把当前 trade value 当合同 ask 输入。
