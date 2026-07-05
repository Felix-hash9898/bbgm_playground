# validation20 v1/v2 Comparable Evaluation

validation20 是 prior calibration/validation support set，不是 final unseen test.

## Why This Report Exists

v1 range overlap and v2 point inside are not directly comparable. v1 gets credit if any part of a wide range touches the human range, while v2 is judged as a single point estimate. This report compares both models using the same point-to-human-range gap and human-midpoint error metrics.

Tolerance: max($0.75M, 0.5% cap) = $0.77M. Salary cap: $154.65M.

## Overall Summary

| model | labeled | strict inside | tolerant inside | mean gap | median gap | p75 gap | p90 gap | max gap | mean mid err | median mid err | mean bias | too_low | too_high | severe | tolerant severe |
| ----- | ------- | ------------- | --------------- | -------- | ---------- | ------- | ------- | ------- | ------------ | -------------- | --------- | ------- | -------- | ------ | --------------- |
| v1    | 20      | 3/20 (15.0%)  | 8/20 (40.0%)    | 3.21     | 2.4        | 4.14    | 9.52    | 10.08   | 4.45         | 2.98           | -3.47     | 11      | 6        | 4      | 3               |
| v2    | 20      | 3/20 (15.0%)  | 9/20 (45.0%)    | 2.43     | 0.97       | 4.46    | 6.58    | 8.6     | 3.66         | 1.97           | -2.41     | 11      | 6        | 1      | 1               |

## Winner Summary

| metric                            | value |
| --------------------------------- | ----- |
| v2 better by point gap            | 12    |
| v1 better by point gap            | 2     |
| tie by point gap                  | 6     |
| v2 better by midpoint error       | 13    |
| v1 better by midpoint error       | 2     |
| tie by midpoint error             | 5     |
| mean delta point gap M            | -0.78 |
| median delta point gap M          | -0.22 |
| mean delta abs midpoint error M   | -0.79 |
| median delta abs midpoint error M | -0.22 |

## By Bucket Summary

| dataset      | bucket                          | count | v1 median gap | v2 median gap | v1 bias | v2 bias | v2 better | v1 better | tie | still severe |
| ------------ | ------------------------------- | ----- | ------------- | ------------- | ------- | ------- | --------- | --------- | --- | ------------ |
| validation20 | low_end_starter_good_rotation   | 4     | 9.08          | 6.75          | -7.55   | -5.53   | 3         | 1         | 0   | V20-11       |
| validation20 | max_near_max_high_star          | 4     | 1.39          | 0.36          | -1.39   | -0.38   | 2         | 0         | 2   |              |
| validation20 | specialist_low_rotation         | 4     | 1.65          | 1.72          | -2.95   | -3.01   | 0         | 0         | 4   |              |
| validation20 | veteran_minimum_fringe_negative | 4     | 0.28          | 0.05          | 0.27    | 0.05    | 4         | 0         | 0   |              |
| validation20 | young_proven_young_starter      | 4     | 5.19          | 3.45          | -5.73   | -3.19   | 3         | 1         | 0   |              |

## Worst Cases

### Biggest v2 misses

| dataset      | case   | global | player            | bucket                        | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                      | trade risk |
| ------------ | ------ | ------ | ----------------- | ----------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| validation20 | V20-11 |        | Anthony Davis     | low_end_starter_good_rotation | $24.00M-$28.00M | $9.28M-$18.56M  | 13.92    | 15.4     | 10.08  | 8.6    | -1.48     | 12.08      | 10.6       | v2         | high_turnover_role_player_risk; defense_impact_supported                        | high       |
| validation20 | V20-10 |        | Jason Preston     | low_end_starter_good_rotation | $24.00M-$29.00M | $9.28M-$18.56M  | 13.92    | 16.86    | 10.08  | 7.14   | -2.94     | 12.58      | 9.64       | v2         |                                                                                 | none       |
| validation20 | V20-06 |        | Isaiah Jackson    | young_proven_young_starter    | $40.00M-$46.40M | $26.29M-$34.80M | 30.54    | 33.48    | 9.46   | 6.52   | -2.93     | 12.66      | 9.72       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| validation20 | V20-09 |        | Bradley Beal      | low_end_starter_good_rotation | $22.00M-$27.00M | $9.28M-$18.56M  | 13.92    | 15.65    | 8.08   | 6.35   | -1.73     | 10.58      | 8.85       | v2         | high_turnover_creator_risk                                                      | medium     |
| validation20 | V20-07 |        | Paolo Banchero    | young_proven_young_starter    | $38.00M-$44.00M | $26.29M-$34.80M | 30.54    | 33.53    | 7.46   | 4.47   | -2.99     | 10.46      | 7.47       | v2         | high_turnover_creator_risk                                                      | low        |
| validation20 | V20-12 |        | Jared Butler      | low_end_starter_good_rotation | $23.00M-$28.00M | $26.29M-$34.80M | 30.54    | 32.46    | 2.54   | 4.46   | 1.92      | 5.04       | 6.96       | v1         |                                                                                 | low        |
| validation20 | V20-13 |        | Landry Shamet     | specialist_low_rotation       | $10.00M-$14.00M | $5.41M-$8.51M   | 6.96     | 7.03     | 3.04   | 2.97   | -0.07     | 5.04       | 4.97       | tie        | small_guard_defense_stat_risk; shooting_portable; non_scoring_impact_positive   | none       |
| validation20 | V20-08 |        | Ja Morant         | young_proven_young_starter    | $38.00M-$43.00M | $40.83M-$46.40M | 43.61    | 45.43    | 0.61   | 2.43   | 1.82      | 3.11       | 4.93       | v1         | high_turnover_creator_risk; defense_impact_noisy                                | low        |
| validation20 | V20-15 |        | Damian Lillard    | specialist_low_rotation       | $10.00M-$14.00M | $6.19M-$9.28M   | 7.73     | 7.7      | 2.27   | 2.3    | 0.03      | 4.27       | 4.3        | tie        | small_guard_defense_stat_risk; non_scoring_impact_positive                      | none       |
| validation20 | V20-16 |        | Austin Reaves     | specialist_low_rotation       | $8.00M-$12.00M  | $5.41M-$8.51M   | 6.96     | 6.86     | 1.04   | 1.14   | 0.1       | 3.04       | 3.14       | tie        | shooting_portable; non_scoring_impact_positive                                  | none       |
| validation20 | V20-03 |        | Marvin Bagley III | max_near_max_high_star        | $46.40M         | $40.83M-$46.40M | 43.61    | 45.59    | 2.79   | 0.81   | -1.98     | 2.79       | 0.81       | v2         | high_turnover_creator_risk; defense_impact_supported                            | low        |
| validation20 | V20-04 |        | Zhaire Smith      | max_near_max_high_star        | $46.40M         | $40.83M-$46.40M | 43.61    | 45.68    | 2.79   | 0.72   | -2.07     | 2.79       | 0.72       | v2         | high_turnover_creator_risk; shooting_portable                                   | low        |

### Biggest v1 misses

| dataset      | case   | global | player            | bucket                        | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                      | trade risk |
| ------------ | ------ | ------ | ----------------- | ----------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| validation20 | V20-10 |        | Jason Preston     | low_end_starter_good_rotation | $24.00M-$29.00M | $9.28M-$18.56M  | 13.92    | 16.86    | 10.08  | 7.14   | -2.94     | 12.58      | 9.64       | v2         |                                                                                 | none       |
| validation20 | V20-11 |        | Anthony Davis     | low_end_starter_good_rotation | $24.00M-$28.00M | $9.28M-$18.56M  | 13.92    | 15.4     | 10.08  | 8.6    | -1.48     | 12.08      | 10.6       | v2         | high_turnover_role_player_risk; defense_impact_supported                        | high       |
| validation20 | V20-06 |        | Isaiah Jackson    | young_proven_young_starter    | $40.00M-$46.40M | $26.29M-$34.80M | 30.54    | 33.48    | 9.46   | 6.52   | -2.93     | 12.66      | 9.72       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| validation20 | V20-09 |        | Bradley Beal      | low_end_starter_good_rotation | $22.00M-$27.00M | $9.28M-$18.56M  | 13.92    | 15.65    | 8.08   | 6.35   | -1.73     | 10.58      | 8.85       | v2         | high_turnover_creator_risk                                                      | medium     |
| validation20 | V20-07 |        | Paolo Banchero    | young_proven_young_starter    | $38.00M-$44.00M | $26.29M-$34.80M | 30.54    | 33.53    | 7.46   | 4.47   | -2.99     | 10.46      | 7.47       | v2         | high_turnover_creator_risk                                                      | low        |
| validation20 | V20-13 |        | Landry Shamet     | specialist_low_rotation       | $10.00M-$14.00M | $5.41M-$8.51M   | 6.96     | 7.03     | 3.04   | 2.97   | -0.07     | 5.04       | 4.97       | tie        | small_guard_defense_stat_risk; shooting_portable; non_scoring_impact_positive   | none       |
| validation20 | V20-05 |        | Jeremy Sochan     | young_proven_young_starter    | $33.46M         | $26.29M-$34.80M | 30.54    | 32.98    | 2.92   | 0.48   | -2.43     | 2.92       | 0.48       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| validation20 | V20-03 |        | Marvin Bagley III | max_near_max_high_star        | $46.40M         | $40.83M-$46.40M | 43.61    | 45.59    | 2.79   | 0.81   | -1.98     | 2.79       | 0.81       | v2         | high_turnover_creator_risk; defense_impact_supported                            | low        |
| validation20 | V20-04 |        | Zhaire Smith      | max_near_max_high_star        | $46.40M         | $40.83M-$46.40M | 43.61    | 45.68    | 2.79   | 0.72   | -2.07     | 2.79       | 0.72       | v2         | high_turnover_creator_risk; shooting_portable                                   | low        |
| validation20 | V20-12 |        | Jared Butler      | low_end_starter_good_rotation | $23.00M-$28.00M | $26.29M-$34.80M | 30.54    | 32.46    | 2.54   | 4.46   | 1.92      | 5.04       | 6.96       | v1         |                                                                                 | low        |
| validation20 | V20-15 |        | Damian Lillard    | specialist_low_rotation       | $10.00M-$14.00M | $6.19M-$9.28M   | 7.73     | 7.7      | 2.27   | 2.3    | 0.03      | 4.27       | 4.3        | tie        | small_guard_defense_stat_risk; non_scoring_impact_positive                      | none       |
| validation20 | V20-16 |        | Austin Reaves     | specialist_low_rotation       | $8.00M-$12.00M  | $5.41M-$8.51M   | 6.96     | 6.86     | 1.04   | 1.14   | 0.1       | 3.04       | 3.14       | tie        | shooting_portable; non_scoring_impact_positive                                  | none       |

### v2 improved most vs v1

| dataset      | case   | global | player            | bucket                          | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                      | trade risk |
| ------------ | ------ | ------ | ----------------- | ------------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| validation20 | V20-07 |        | Paolo Banchero    | young_proven_young_starter      | $38.00M-$44.00M | $26.29M-$34.80M | 30.54    | 33.53    | 7.46   | 4.47   | -2.99     | 10.46      | 7.47       | v2         | high_turnover_creator_risk                                                      | low        |
| validation20 | V20-10 |        | Jason Preston     | low_end_starter_good_rotation   | $24.00M-$29.00M | $9.28M-$18.56M  | 13.92    | 16.86    | 10.08  | 7.14   | -2.94     | 12.58      | 9.64       | v2         |                                                                                 | none       |
| validation20 | V20-06 |        | Isaiah Jackson    | young_proven_young_starter      | $40.00M-$46.40M | $26.29M-$34.80M | 30.54    | 33.48    | 9.46   | 6.52   | -2.93     | 12.66      | 9.72       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| validation20 | V20-05 |        | Jeremy Sochan     | young_proven_young_starter      | $33.46M         | $26.29M-$34.80M | 30.54    | 32.98    | 2.92   | 0.48   | -2.43     | 2.92       | 0.48       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| validation20 | V20-04 |        | Zhaire Smith      | max_near_max_high_star          | $46.40M         | $40.83M-$46.40M | 43.61    | 45.68    | 2.79   | 0.72   | -2.07     | 2.79       | 0.72       | v2         | high_turnover_creator_risk; shooting_portable                                   | low        |
| validation20 | V20-03 |        | Marvin Bagley III | max_near_max_high_star          | $46.40M         | $40.83M-$46.40M | 43.61    | 45.59    | 2.79   | 0.81   | -1.98     | 2.79       | 0.81       | v2         | high_turnover_creator_risk; defense_impact_supported                            | low        |
| validation20 | V20-09 |        | Bradley Beal      | low_end_starter_good_rotation   | $22.00M-$27.00M | $9.28M-$18.56M  | 13.92    | 15.65    | 8.08   | 6.35   | -1.73     | 10.58      | 8.85       | v2         | high_turnover_creator_risk                                                      | medium     |
| validation20 | V20-11 |        | Anthony Davis     | low_end_starter_good_rotation   | $24.00M-$28.00M | $9.28M-$18.56M  | 13.92    | 15.4     | 10.08  | 8.6    | -1.48     | 12.08      | 10.6       | v2         | high_turnover_role_player_risk; defense_impact_supported                        | high       |
| validation20 | V20-17 |        | Alec Burks        | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.74     | 0.28   | 0.03   | -0.25     | 0.28       | 0.03       | v2         | low_efficiency_shooter_risk; offensive_liability_risk                           | none       |
| validation20 | V20-18 |        | Terrence Jones    | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.76     | 0.28   | 0.05   | -0.23     | 0.28       | 0.05       | v2         | offensive_liability_risk                                                        | none       |
| validation20 | V20-19 |        | Jusuf Nurkić      | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.78     | 0.28   | 0.07   | -0.21     | 0.28       | 0.07       | v2         | low_efficiency_shooter_risk                                                     | none       |
| validation20 | V20-20 |        | Johnathan Motley  | veteran_minimum_fringe_negative | $3.36M          | $3.36M-$3.86M   | 3.61     | 3.41     | 0.25   | 0.05   | -0.2      | 0.25       | 0.05       | v2         | low_efficiency_shooter_risk; offensive_liability_risk                           | none       |

### v2 worsened most vs v1

| dataset      | case   | global | player           | bucket                          | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                    | trade risk |
| ------------ | ------ | ------ | ---------------- | ------------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ----------------------------------------------------------------------------- | ---------- |
| validation20 | V20-12 |        | Jared Butler     | low_end_starter_good_rotation   | $23.00M-$28.00M | $26.29M-$34.80M | 30.54    | 32.46    | 2.54   | 4.46   | 1.92      | 5.04       | 6.96       | v1         |                                                                               | low        |
| validation20 | V20-08 |        | Ja Morant        | young_proven_young_starter      | $38.00M-$43.00M | $40.83M-$46.40M | 43.61    | 45.43    | 0.61   | 2.43   | 1.82      | 3.11       | 4.93       | v1         | high_turnover_creator_risk; defense_impact_noisy                              | low        |
| validation20 | V20-16 |        | Austin Reaves    | specialist_low_rotation         | $8.00M-$12.00M  | $5.41M-$8.51M   | 6.96     | 6.86     | 1.04   | 1.14   | 0.1       | 3.04       | 3.14       | tie        | shooting_portable; non_scoring_impact_positive                                | none       |
| validation20 | V20-15 |        | Damian Lillard   | specialist_low_rotation         | $10.00M-$14.00M | $6.19M-$9.28M   | 7.73     | 7.7      | 2.27   | 2.3    | 0.03      | 4.27       | 4.3        | tie        | small_guard_defense_stat_risk; non_scoring_impact_positive                    | none       |
| validation20 | V20-01 |        | Zion Williamson  | max_near_max_high_star          | $46.40M         | $46.40M         | 46.4     | 46.4     | 0      | 0      | 0         | 0          | 0          | tie        | high_turnover_creator_risk; defense_impact_supported                          | low        |
| validation20 | V20-02 |        | Jaden Springer   | max_near_max_high_star          | $46.40M         | $46.40M         | 46.4     | 46.4     | 0      | 0      | 0         | 0          | 0          | tie        | high_turnover_creator_risk; shooting_portable; defense_impact_supported       | low        |
| validation20 | V20-14 |        | Hassan Whiteside | specialist_low_rotation         | $3.00M-$5.00M   | $3.71M-$5.41M   | 4.56     | 4.36     | 0      | 0      | 0         | 0.56       | 0.36       | tie        |                                                                               | none       |
| validation20 | V20-13 |        | Landry Shamet    | specialist_low_rotation         | $10.00M-$14.00M | $5.41M-$8.51M   | 6.96     | 7.03     | 3.04   | 2.97   | -0.07     | 5.04       | 4.97       | tie        | small_guard_defense_stat_risk; shooting_portable; non_scoring_impact_positive | none       |
| validation20 | V20-20 |        | Johnathan Motley | veteran_minimum_fringe_negative | $3.36M          | $3.36M-$3.86M   | 3.61     | 3.41     | 0.25   | 0.05   | -0.2      | 0.25       | 0.05       | v2         | low_efficiency_shooter_risk; offensive_liability_risk                         | none       |
| validation20 | V20-19 |        | Jusuf Nurkić     | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.78     | 0.28   | 0.07   | -0.21     | 0.28       | 0.07       | v2         | low_efficiency_shooter_risk                                                   | none       |
| validation20 | V20-18 |        | Terrence Jones   | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.76     | 0.28   | 0.05   | -0.23     | 0.28       | 0.05       | v2         | offensive_liability_risk                                                      | none       |
| validation20 | V20-17 |        | Alec Burks       | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.74     | 0.28   | 0.03   | -0.25     | 0.28       | 0.03       | v2         | low_efficiency_shooter_risk; offensive_liability_risk                         | none       |

### v1 range overlap was misleading

| dataset      | case   | global | player            | bucket                          | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                      | trade risk |
| ------------ | ------ | ------ | ----------------- | ------------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| validation20 | V20-05 |        | Jeremy Sochan     | young_proven_young_starter      | $33.46M         | $26.29M-$34.80M | 30.54    | 32.98    | 2.92   | 0.48   | -2.43     | 2.92       | 0.48       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| validation20 | V20-12 |        | Jared Butler      | low_end_starter_good_rotation   | $23.00M-$28.00M | $26.29M-$34.80M | 30.54    | 32.46    | 2.54   | 4.46   | 1.92      | 5.04       | 6.96       | v1         |                                                                                 | low        |
| validation20 | V20-03 |        | Marvin Bagley III | max_near_max_high_star          | $46.40M         | $40.83M-$46.40M | 43.61    | 45.59    | 2.79   | 0.81   | -1.98     | 2.79       | 0.81       | v2         | high_turnover_creator_risk; defense_impact_supported                            | low        |
| validation20 | V20-04 |        | Zhaire Smith      | max_near_max_high_star          | $46.40M         | $40.83M-$46.40M | 43.61    | 45.68    | 2.79   | 0.72   | -2.07     | 2.79       | 0.72       | v2         | high_turnover_creator_risk; shooting_portable                                   | low        |
| validation20 | V20-08 |        | Ja Morant         | young_proven_young_starter      | $38.00M-$43.00M | $40.83M-$46.40M | 43.61    | 45.43    | 0.61   | 2.43   | 1.82      | 3.11       | 4.93       | v1         | high_turnover_creator_risk; defense_impact_noisy                                | low        |
| validation20 | V20-16 |        | Austin Reaves     | specialist_low_rotation         | $8.00M-$12.00M  | $5.41M-$8.51M   | 6.96     | 6.86     | 1.04   | 1.14   | 0.1       | 3.04       | 3.14       | tie        | shooting_portable; non_scoring_impact_positive                                  | none       |
| validation20 | V20-17 |        | Alec Burks        | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.74     | 0.28   | 0.03   | -0.25     | 0.28       | 0.03       | v2         | low_efficiency_shooter_risk; offensive_liability_risk                           | none       |
| validation20 | V20-18 |        | Terrence Jones    | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.76     | 0.28   | 0.05   | -0.23     | 0.28       | 0.05       | v2         | offensive_liability_risk                                                        | none       |
| validation20 | V20-19 |        | Jusuf Nurkić      | veteran_minimum_fringe_negative | $3.71M          | $3.71M-$4.27M   | 3.99     | 3.78     | 0.28   | 0.07   | -0.21     | 0.28       | 0.07       | v2         | low_efficiency_shooter_risk                                                     | none       |
| validation20 | V20-20 |        | Johnathan Motley  | veteran_minimum_fringe_negative | $3.36M          | $3.36M-$3.86M   | 3.61     | 3.41     | 0.25   | 0.05   | -0.2      | 0.25       | 0.05       | v2         | low_efficiency_shooter_risk; offensive_liability_risk                           | none       |

### Exact max / near-max cases affected by tolerance

| dataset      | case   | global | player       | bucket                     | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                       | trade risk |
| ------------ | ------ | ------ | ------------ | -------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------ | ---------- |
| validation20 | V20-04 |        | Zhaire Smith | max_near_max_high_star     | $46.40M         | $40.83M-$46.40M | 43.61    | 45.68    | 2.79   | 0.72   | -2.07     | 2.79       | 0.72       | v2         | high_turnover_creator_risk; shooting_portable    | low        |
| validation20 | V20-08 |        | Ja Morant    | young_proven_young_starter | $38.00M-$43.00M | $40.83M-$46.40M | 43.61    | 45.43    | 0.61   | 2.43   | 1.82      | 3.11       | 4.93       | v1         | high_turnover_creator_risk; defense_impact_noisy | low        |

## Interval Width Penalty

For v1 range only: intervalScore = intervalMissGap + lambda \* v1WidthM. This penalizes over-wide ranges so range overlap is not counted as a precise prediction.

| metric                           | value |
| -------------------------------- | ----- |
| mean v1 width                    | 4.59  |
| median v1 width                  | 4.33  |
| mean v1 intervalScore lambda .10 | 1.71  |
| mean v1 intervalScore lambda .15 | 1.93  |
| mean v1 intervalScore lambda .20 | 2.16  |
| mean v2 point gap                | 2.43  |

## Conclusion

| metric             | conclusion         | detail                           |
| ------------------ | ------------------ | -------------------------------- |
| point-to-range gap | v2 improves        | v1 mean 3.21M vs v2 mean 2.43M   |
| midpoint error     | v2 improves        | v1 mean 4.45M vs v2 mean 3.66M   |
| bias               | v2 less biased     | v1 bias -3.47M vs v2 bias -2.41M |
| severe count       | v2 improves        | v1 severe 4 vs v2 severe 1       |
| winner count       | v2 wins more cases | v2 12, v1 2, tie 6               |
