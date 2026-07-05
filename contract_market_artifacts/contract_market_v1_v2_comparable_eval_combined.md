# Combined v1/v2 Comparable Evaluation

This report combines boundary40 and validation20. Both are calibration/support sets, not final unseen tests.

v1 range overlap and v2 point inside are not directly comparable, so this report compares both with the same point-to-human-range gap and midpoint error metrics.

Tolerance: max($0.75M, 0.5% cap) = $0.77M. Salary cap: $154.65M.

## Per-Dataset Summary

| dataset      | model | labeled | strict inside | tolerant inside | mean gap | median gap | p75 gap | p90 gap | max gap | mean mid err | median mid err | mean bias | too_low | too_high | severe | tolerant severe |
| ------------ | ----- | ------- | ------------- | --------------- | -------- | ---------- | ------- | ------- | ------- | ------------ | -------------- | --------- | ------- | -------- | ------ | --------------- |
| boundary40   | v1    | 28      | 6/28 (21.4%)  | 8/28 (28.6%)    | 3.44     | 2.69       | 4.46    | 7.19    | 16.08   | 5.16         | 2.79           | -4.63     | 21      | 1        | 3      | 3               |
| boundary40   | v2    | 28      | 7/28 (25.0%)  | 15/28 (53.6%)   | 2.48     | 0.73       | 2.47    | 7.05    | 14.27   | 4.23         | 2.71           | -3.33     | 20      | 1        | 3      | 3               |
| validation20 | v1    | 20      | 3/20 (15.0%)  | 8/20 (40.0%)    | 3.21     | 2.4        | 4.14    | 9.52    | 10.08   | 4.45         | 2.98           | -3.47     | 11      | 6        | 4      | 3               |
| validation20 | v2    | 20      | 3/20 (15.0%)  | 9/20 (45.0%)    | 2.43     | 0.97       | 4.46    | 6.58    | 8.6     | 3.66         | 1.97           | -2.41     | 11      | 6        | 1      | 1               |

## Combined Summary

| model | labeled | strict inside | tolerant inside | mean gap | median gap | p75 gap | p90 gap | max gap | mean mid err | median mid err | mean bias | too_low | too_high | severe | tolerant severe |
| ----- | ------- | ------------- | --------------- | -------- | ---------- | ------- | ------- | ------- | ------------ | -------------- | --------- | ------- | -------- | ------ | --------------- |
| v1    | 48      | 9/48 (18.8%)  | 16/48 (33.3%)   | 3.34     | 2.56       | 4.46    | 8.87    | 16.08   | 4.86         | 2.85           | -4.15     | 32      | 7        | 7      | 6               |
| v2    | 48      | 10/48 (20.8%) | 24/48 (50.0%)   | 2.46     | 0.77       | 3.32    | 6.71    | 14.27   | 3.99         | 2.71           | -2.95     | 31      | 7        | 4      | 4               |

## Combined Winner Summary

| metric                            | value |
| --------------------------------- | ----- |
| v2 better by point gap            | 28    |
| v1 better by point gap            | 5     |
| tie by point gap                  | 15    |
| v2 better by midpoint error       | 31    |
| v1 better by midpoint error       | 7     |
| tie by midpoint error             | 10    |
| mean delta point gap M            | -0.88 |
| median delta point gap M          | -0.24 |
| mean delta abs midpoint error M   | -0.87 |
| median delta abs midpoint error M | -0.39 |

## By Bucket Summary

| dataset      | bucket                          | count | v1 median gap | v2 median gap | v1 bias | v2 bias | v2 better | v1 better | tie | still severe |
| ------------ | ------------------------------- | ----- | ------------- | ------------- | ------- | ------- | --------- | --------- | --- | ------------ |
| boundary40   | good_high_starter               | 4     | 4.46          | 1.52          | -7.99   | -5.12   | 3         | 0         | 1   | H-02         |
| boundary40   | good_rotation_specialist        | 4     | 0.88          | 0.94          | -2.3    | -2.51   | 0         | 2         | 2   |              |
| boundary40   | high_end_rotation_sixth_man     | 4     | 4.48          | 4.38          | -8.95   | -8.82   | 2         | 0         | 2   | E-02         |
| boundary40   | low_end_starter                 | 4     | 1.5           | 1.4           | -2.21   | -1.36   | 2         | 1         | 1   |              |
| boundary40   | solid_starter                   | 4     | 3.04          | 2.19          | -5.84   | -4.39   | 1         | 0         | 3   | G-04         |
| boundary40   | star_near_max                   | 4     | 2.55          | 0.66          | -2.37   | -0.45   | 4         | 0         | 0   |              |
| boundary40   | superstar_max_lock              | 4     | 2.79          | 0.65          | -2.79   | -0.66   | 4         | 0         | 0   |              |
| validation20 | low_end_starter_good_rotation   | 4     | 9.08          | 6.75          | -7.55   | -5.53   | 3         | 1         | 0   | V20-11       |
| validation20 | max_near_max_high_star          | 4     | 1.39          | 0.36          | -1.39   | -0.38   | 2         | 0         | 2   |              |
| validation20 | specialist_low_rotation         | 4     | 1.65          | 1.72          | -2.95   | -3.01   | 0         | 0         | 4   |              |
| validation20 | veteran_minimum_fringe_negative | 4     | 0.28          | 0.05          | 0.27    | 0.05    | 4         | 0         | 0   |              |
| validation20 | young_proven_young_starter      | 4     | 5.19          | 3.45          | -5.73   | -3.19   | 3         | 1         | 0   |              |

## Combined Bucket Summary

| dataset  | bucket                          | count | v1 median gap | v2 median gap | v1 bias | v2 bias | v2 better | v1 better | tie | still severe        |
| -------- | ------------------------------- | ----- | ------------- | ------------- | ------- | ------- | --------- | --------- | --- | ------------------- |
| combined | good_high_starter               | 4     | 4.46          | 1.52          | -7.99   | -5.12   | 3         | 0         | 1   | boundary40:H-02     |
| combined | good_rotation_specialist        | 4     | 0.88          | 0.94          | -2.3    | -2.51   | 0         | 2         | 2   |                     |
| combined | high_end_rotation_sixth_man     | 4     | 4.48          | 4.38          | -8.95   | -8.82   | 2         | 0         | 2   | boundary40:E-02     |
| combined | low_end_starter                 | 4     | 1.5           | 1.4           | -2.21   | -1.36   | 2         | 1         | 1   |                     |
| combined | low_end_starter_good_rotation   | 4     | 9.08          | 6.75          | -7.55   | -5.53   | 3         | 1         | 0   | validation20:V20-11 |
| combined | max_near_max_high_star          | 4     | 1.39          | 0.36          | -1.39   | -0.38   | 2         | 0         | 2   |                     |
| combined | solid_starter                   | 4     | 3.04          | 2.19          | -5.84   | -4.39   | 1         | 0         | 3   | boundary40:G-04     |
| combined | specialist_low_rotation         | 4     | 1.65          | 1.72          | -2.95   | -3.01   | 0         | 0         | 4   |                     |
| combined | star_near_max                   | 4     | 2.55          | 0.66          | -2.37   | -0.45   | 4         | 0         | 0   |                     |
| combined | superstar_max_lock              | 4     | 2.79          | 0.65          | -2.79   | -0.66   | 4         | 0         | 0   |                     |
| combined | veteran_minimum_fringe_negative | 4     | 0.28          | 0.05          | 0.27    | 0.05    | 4         | 0         | 0   |                     |
| combined | young_proven_young_starter      | 4     | 5.19          | 3.45          | -5.73   | -3.19   | 3         | 1         | 0   |                     |

## Worst Cases

### Biggest v2 misses

| dataset      | case   | global | player           | bucket                        | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                      | trade risk |
| ------------ | ------ | ------ | ---------------- | ----------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| boundary40   | E-02   | B40-18 | Nikola Jović     | high_end_rotation_sixth_man   | $20.00M-$30.00M | $3.87M-$6.96M   | 5.42     | 5.73     | 14.59  | 14.27  | -0.32     | 19.59      | 19.27      | v2         | young_proven_positive; high_turnover_role_player_risk                           | high       |
| boundary40   | H-02   | B40-30 | Ben Simmons      | good_high_starter             | $30.00M-$35.00M | $9.28M-$18.56M  | 13.92    | 17.03    | 16.08  | 12.97  | -3.11     | 18.58      | 15.47      | v2         |                                                                                 | medium     |
| validation20 | V20-11 |        | Anthony Davis    | low_end_starter_good_rotation | $24.00M-$28.00M | $9.28M-$18.56M  | 13.92    | 15.4     | 10.08  | 8.6    | -1.48     | 12.08      | 10.6       | v2         | high_turnover_role_player_risk; defense_impact_supported                        | high       |
| boundary40   | G-04   | B40-28 | Džanan Musa      | solid_starter                 | $12.00M-$18.00M | $3.15M-$3.62M   | 3.38     | 3.44     | 8.62   | 8.56   | -0.05     | 11.62      | 11.56      | tie        | high_turnover_creator_risk                                                      | medium     |
| validation20 | V20-10 |        | Jason Preston    | low_end_starter_good_rotation | $24.00M-$29.00M | $9.28M-$18.56M  | 13.92    | 16.86    | 10.08  | 7.14   | -2.94     | 12.58      | 9.64       | v2         |                                                                                 | none       |
| validation20 | V20-06 |        | Isaiah Jackson   | young_proven_young_starter    | $40.00M-$46.40M | $26.29M-$34.80M | 30.54    | 33.48    | 9.46   | 6.52   | -2.93     | 12.66      | 9.72       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| boundary40   | E-04   | B40-20 | Julian Strawther | high_end_rotation_sixth_man   | $12.00M-$18.00M | $3.87M-$6.96M   | 5.42     | 5.6      | 6.58   | 6.4    | -0.18     | 9.59       | 9.4        | v2         | young_proven_positive                                                           | medium     |
| validation20 | V20-09 |        | Bradley Beal     | low_end_starter_good_rotation | $22.00M-$27.00M | $9.28M-$18.56M  | 13.92    | 15.65    | 8.08   | 6.35   | -1.73     | 10.58      | 8.85       | v2         | high_turnover_creator_risk                                                      | medium     |
| boundary40   | F-01   | B40-21 | Shaedon Sharpe   | low_end_starter               | $20.00M-$30.00M | $9.28M-$18.56M  | 13.92    | 15.02    | 6.08   | 4.98   | -1.1      | 11.08      | 9.98       | v2         | young_proven_positive; high_turnover_role_player_risk                           | low        |
| validation20 | V20-07 |        | Paolo Banchero   | young_proven_young_starter    | $38.00M-$44.00M | $26.29M-$34.80M | 30.54    | 33.53    | 7.46   | 4.47   | -2.99     | 10.46      | 7.47       | v2         | high_turnover_creator_risk                                                      | low        |
| validation20 | V20-12 |        | Jared Butler     | low_end_starter_good_rotation | $23.00M-$28.00M | $26.29M-$34.80M | 30.54    | 32.46    | 2.54   | 4.46   | 1.92      | 5.04       | 6.96       | v1         |                                                                                 | low        |
| boundary40   | G-02   | B40-26 | Isaiah Stewart   | solid_starter                 | $20.00M-$25.00M | $9.28M-$18.56M  | 13.92    | 15.62    | 6.08   | 4.38   | -1.7      | 8.58       | 6.88       | v2         | high_turnover_role_player_risk                                                  | high       |

### Biggest v1 misses

| dataset      | case   | global | player           | bucket                        | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                      | trade risk |
| ------------ | ------ | ------ | ---------------- | ----------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| boundary40   | H-02   | B40-30 | Ben Simmons      | good_high_starter             | $30.00M-$35.00M | $9.28M-$18.56M  | 13.92    | 17.03    | 16.08  | 12.97  | -3.11     | 18.58      | 15.47      | v2         |                                                                                 | medium     |
| boundary40   | E-02   | B40-18 | Nikola Jović     | high_end_rotation_sixth_man   | $20.00M-$30.00M | $3.87M-$6.96M   | 5.42     | 5.73     | 14.59  | 14.27  | -0.32     | 19.59      | 19.27      | v2         | young_proven_positive; high_turnover_role_player_risk                           | high       |
| validation20 | V20-10 |        | Jason Preston    | low_end_starter_good_rotation | $24.00M-$29.00M | $9.28M-$18.56M  | 13.92    | 16.86    | 10.08  | 7.14   | -2.94     | 12.58      | 9.64       | v2         |                                                                                 | none       |
| validation20 | V20-11 |        | Anthony Davis    | low_end_starter_good_rotation | $24.00M-$28.00M | $9.28M-$18.56M  | 13.92    | 15.4     | 10.08  | 8.6    | -1.48     | 12.08      | 10.6       | v2         | high_turnover_role_player_risk; defense_impact_supported                        | high       |
| validation20 | V20-06 |        | Isaiah Jackson   | young_proven_young_starter    | $40.00M-$46.40M | $26.29M-$34.80M | 30.54    | 33.48    | 9.46   | 6.52   | -2.93     | 12.66      | 9.72       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| boundary40   | G-04   | B40-28 | Džanan Musa      | solid_starter                 | $12.00M-$18.00M | $3.15M-$3.62M   | 3.38     | 3.44     | 8.62   | 8.56   | -0.05     | 11.62      | 11.56      | tie        | high_turnover_creator_risk                                                      | medium     |
| validation20 | V20-09 |        | Bradley Beal     | low_end_starter_good_rotation | $22.00M-$27.00M | $9.28M-$18.56M  | 13.92    | 15.65    | 8.08   | 6.35   | -1.73     | 10.58      | 8.85       | v2         | high_turnover_creator_risk                                                      | medium     |
| validation20 | V20-07 |        | Paolo Banchero   | young_proven_young_starter    | $38.00M-$44.00M | $26.29M-$34.80M | 30.54    | 33.53    | 7.46   | 4.47   | -2.99     | 10.46      | 7.47       | v2         | high_turnover_creator_risk                                                      | low        |
| boundary40   | E-04   | B40-20 | Julian Strawther | high_end_rotation_sixth_man   | $12.00M-$18.00M | $3.87M-$6.96M   | 5.42     | 5.6      | 6.58   | 6.4    | -0.18     | 9.59       | 9.4        | v2         | young_proven_positive                                                           | medium     |
| boundary40   | F-01   | B40-21 | Shaedon Sharpe   | low_end_starter               | $20.00M-$30.00M | $9.28M-$18.56M  | 13.92    | 15.02    | 6.08   | 4.98   | -1.1      | 11.08      | 9.98       | v2         | young_proven_positive; high_turnover_role_player_risk                           | low        |
| boundary40   | G-02   | B40-26 | Isaiah Stewart   | solid_starter                 | $20.00M-$25.00M | $9.28M-$18.56M  | 13.92    | 15.62    | 6.08   | 4.38   | -1.7      | 8.58       | 6.88       | v2         | high_turnover_role_player_risk                                                  | high       |
| boundary40   | H-03   | B40-31 | LaMelo Ball      | good_high_starter             | $35.00M-$40.00M | $26.29M-$34.80M | 30.54    | 33.66    | 4.46   | 1.34   | -3.11     | 6.96       | 3.84       | v2         | high_turnover_creator_risk                                                      | low        |

### v2 improved most vs v1

| dataset      | case   | global | player            | bucket                        | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                      | trade risk |
| ------------ | ------ | ------ | ----------------- | ----------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| boundary40   | H-03   | B40-31 | LaMelo Ball       | good_high_starter             | $35.00M-$40.00M | $26.29M-$34.80M | 30.54    | 33.66    | 4.46   | 1.34   | -3.11     | 6.96       | 3.84       | v2         | high_turnover_creator_risk                                                      | low        |
| boundary40   | H-02   | B40-30 | Ben Simmons       | good_high_starter             | $30.00M-$35.00M | $9.28M-$18.56M  | 13.92    | 17.03    | 16.08  | 12.97  | -3.11     | 18.58      | 15.47      | v2         |                                                                                 | medium     |
| validation20 | V20-07 |        | Paolo Banchero    | young_proven_young_starter    | $38.00M-$44.00M | $26.29M-$34.80M | 30.54    | 33.53    | 7.46   | 4.47   | -2.99     | 10.46      | 7.47       | v2         | high_turnover_creator_risk                                                      | low        |
| validation20 | V20-10 |        | Jason Preston     | low_end_starter_good_rotation | $24.00M-$29.00M | $9.28M-$18.56M  | 13.92    | 16.86    | 10.08  | 7.14   | -2.94     | 12.58      | 9.64       | v2         |                                                                                 | none       |
| validation20 | V20-06 |        | Isaiah Jackson    | young_proven_young_starter    | $40.00M-$46.40M | $26.29M-$34.80M | 30.54    | 33.48    | 9.46   | 6.52   | -2.93     | 12.66      | 9.72       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| boundary40   | H-04   | B40-32 | Kai Jones         | good_high_starter             | $35.00M-$40.00M | $26.29M-$34.80M | 30.54    | 33.3     | 4.46   | 1.7    | -2.75     | 6.96       | 4.2        | v2         | high_turnover_role_player_risk; defense_impact_noisy                            | low        |
| validation20 | V20-05 |        | Jeremy Sochan     | young_proven_young_starter    | $33.46M         | $26.29M-$34.80M | 30.54    | 32.98    | 2.92   | 0.48   | -2.43     | 2.92       | 0.48       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| boundary40   | J-02   | B40-38 | Scottie Barnes    | superstar_max_lock            | $46.40M         | $40.83M-$46.40M | 43.61    | 45.77    | 2.79   | 0.63   | -2.16     | 2.79       | 0.63       | v2         | high_turnover_creator_risk; shooting_portable; defense_impact_noisy             | low        |
| boundary40   | J-03   | B40-39 | Joshua Primo      | superstar_max_lock            | $46.40M         | $40.83M-$46.40M | 43.61    | 45.77    | 2.79   | 0.63   | -2.16     | 2.79       | 0.63       | v2         | high_turnover_creator_risk; shooting_portable; defense_impact_noisy             | low        |
| boundary40   | J-01   | B40-37 | Justin Champagnie | superstar_max_lock            | $46.40M         | $40.83M-$46.40M | 43.61    | 45.73    | 2.79   | 0.67   | -2.12     | 2.79       | 0.67       | v2         | high_turnover_creator_risk                                                      | low        |
| validation20 | V20-04 |        | Zhaire Smith      | max_near_max_high_star        | $46.40M         | $40.83M-$46.40M | 43.61    | 45.68    | 2.79   | 0.72   | -2.07     | 2.79       | 0.72       | v2         | high_turnover_creator_risk; shooting_portable                                   | low        |
| boundary40   | J-04   | B40-40 | Luka Dončić       | superstar_max_lock            | $46.40M         | $40.83M-$46.40M | 43.61    | 45.67    | 2.79   | 0.73   | -2.06     | 2.79       | 0.73       | v2         | high_turnover_creator_risk                                                      | low        |

### v2 worsened most vs v1

| dataset      | case   | global | player                   | bucket                        | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                  | trade risk |
| ------------ | ------ | ------ | ------------------------ | ----------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ----------------------------------------------------------- | ---------- |
| validation20 | V20-12 |        | Jared Butler             | low_end_starter_good_rotation | $23.00M-$28.00M | $26.29M-$34.80M | 30.54    | 32.46    | 2.54   | 4.46   | 1.92      | 5.04       | 6.96       | v1         |                                                             | low        |
| validation20 | V20-08 |        | Ja Morant                | young_proven_young_starter    | $38.00M-$43.00M | $40.83M-$46.40M | 43.61    | 45.43    | 0.61   | 2.43   | 1.82      | 3.11       | 4.93       | v1         | high_turnover_creator_risk; defense_impact_noisy            | low        |
| boundary40   | F-04   | B40-24 | Kentavious Caldwell-Pope | low_end_starter               | $6.00M-$12.00M  | $9.28M-$18.56M  | 13.92    | 14.22    | 1.92   | 2.22   | 0.3       | 4.92       | 5.22       | v1         | high_turnover_role_player_risk                              | none       |
| boundary40   | D-03   | B40-15 | Jaylen Wells             | good_rotation_specialist      | $8.00M-$14.00M  | $3.87M-$6.96M   | 5.42     | 5.22     | 2.58   | 2.78   | 0.2       | 5.58       | 5.78       | v1         | young_pot_only                                              | none       |
| boundary40   | D-02   | B40-14 | Jordan Poole             | good_rotation_specialist      | $6.00M-$10.00M  | $3.09M-$5.41M   | 4.25     | 4.12     | 1.75   | 1.88   | 0.13      | 3.75       | 3.88       | v1         |                                                             | none       |
| validation20 | V20-16 |        | Austin Reaves            | specialist_low_rotation       | $8.00M-$12.00M  | $5.41M-$8.51M   | 6.96     | 6.86     | 1.04   | 1.14   | 0.1       | 3.04       | 3.14       | tie        | shooting_portable; non_scoring_impact_positive              | none       |
| validation20 | V20-15 |        | Damian Lillard           | specialist_low_rotation       | $10.00M-$14.00M | $6.19M-$9.28M   | 7.73     | 7.7      | 2.27   | 2.3    | 0.03      | 4.27       | 4.3        | tie        | small_guard_defense_stat_risk; non_scoring_impact_positive  | none       |
| boundary40   | D-01   | B40-13 | Simisola Shittu          | good_rotation_specialist      | $3.00M-$5.00M   | $2.94M-$3.38M   | 3.16     | 3.13     | 0      | 0      | 0         | 0.84       | 0.87       | tie        |                                                             | none       |
| boundary40   | D-04   | B40-16 | Keegan Murray            | good_rotation_specialist      | $4.00M-$8.00M   | $5.41M-$8.51M   | 6.96     | 6.49     | 0      | 0      | 0         | 0.96       | 0.49       | tie        |                                                             | none       |
| boundary40   | F-02   | B40-22 | Mfiondu Kabengele        | low_end_starter               | $10.00M-$16.00M | $9.28M-$18.56M  | 13.92    | 15.4     | 0      | 0      | 0         | 0.92       | 2.4        | tie        | high_turnover_creator_risk; shooting_portable               | none       |
| boundary40   | G-01   | B40-25 | Jordan Bell              | solid_starter                 | $12.00M-$20.00M | $9.28M-$18.56M  | 13.92    | 15.85    | 0      | 0      | 0         | 2.08       | 0.15       | tie        | high_turnover_role_player_risk; non_scoring_impact_positive | high       |
| boundary40   | G-03   | B40-27 | OG Anunoby               | solid_starter                 | $12.00M-$18.00M | $9.28M-$18.56M  | 13.92    | 16.03    | 0      | 0      | 0         | 1.08       | 1.03       | tie        | non_scoring_impact_positive                                 | medium     |

### v1 range overlap was misleading

| dataset      | case   | global | player                   | bucket                        | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                                      | trade risk |
| ------------ | ------ | ------ | ------------------------ | ----------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------------------- | ---------- |
| boundary40   | F-03   | B40-23 | Isaac Okoro              | low_end_starter               | $15.00M-$20.00M | $9.28M-$18.56M  | 13.92    | 14.43    | 1.08   | 0.57   | -0.51     | 3.58       | 3.07       | v2         | high_turnover_role_player_risk; low_efficiency_shooter_risk                     | low        |
| boundary40   | F-04   | B40-24 | Kentavious Caldwell-Pope | low_end_starter               | $6.00M-$12.00M  | $9.28M-$18.56M  | 13.92    | 14.22    | 1.92   | 2.22   | 0.3       | 4.92       | 5.22       | v1         | high_turnover_role_player_risk                                                  | none       |
| validation20 | V20-05 |        | Jeremy Sochan            | young_proven_young_starter    | $33.46M         | $26.29M-$34.80M | 30.54    | 32.98    | 2.92   | 0.48   | -2.43     | 2.92       | 0.48       | v2         | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported | low        |
| validation20 | V20-12 |        | Jared Butler             | low_end_starter_good_rotation | $23.00M-$28.00M | $26.29M-$34.80M | 30.54    | 32.46    | 2.54   | 4.46   | 1.92      | 5.04       | 6.96       | v1         |                                                                                 | low        |
| boundary40   | I-01   | B40-33 | Saben Lee                | star_near_max                 | $46.40M         | $40.83M-$46.40M | 43.61    | 45.52    | 2.79   | 0.88   | -1.91     | 2.79       | 0.88       | v2         | small_guard_defense_stat_risk; high_turnover_creator_risk                       | low        |
| boundary40   | I-03   | B40-35 | Patrick Williams         | star_near_max                 | $46.40M         | $40.83M-$46.40M | 43.61    | 45.66    | 2.79   | 0.74   | -2.05     | 2.79       | 0.74       | v2         | high_turnover_creator_risk                                                      | low        |
| boundary40   | I-04   | B40-36 | Trae Young               | star_near_max                 | $44.00M-$46.40M | $40.83M-$46.40M | 43.61    | 45.59    | 0.39   | 0      | -0.39     | 1.59       | 0.39       | v2         | high_turnover_creator_risk                                                      | low        |
| boundary40   | J-01   | B40-37 | Justin Champagnie        | superstar_max_lock            | $46.40M         | $40.83M-$46.40M | 43.61    | 45.73    | 2.79   | 0.67   | -2.12     | 2.79       | 0.67       | v2         | high_turnover_creator_risk                                                      | low        |
| boundary40   | J-02   | B40-38 | Scottie Barnes           | superstar_max_lock            | $46.40M         | $40.83M-$46.40M | 43.61    | 45.77    | 2.79   | 0.63   | -2.16     | 2.79       | 0.63       | v2         | high_turnover_creator_risk; shooting_portable; defense_impact_noisy             | low        |
| boundary40   | J-03   | B40-39 | Joshua Primo             | superstar_max_lock            | $46.40M         | $40.83M-$46.40M | 43.61    | 45.77    | 2.79   | 0.63   | -2.16     | 2.79       | 0.63       | v2         | high_turnover_creator_risk; shooting_portable; defense_impact_noisy             | low        |
| boundary40   | J-04   | B40-40 | Luka Dončić              | superstar_max_lock            | $46.40M         | $40.83M-$46.40M | 43.61    | 45.67    | 2.79   | 0.73   | -2.06     | 2.79       | 0.73       | v2         | high_turnover_creator_risk                                                      | low        |
| validation20 | V20-03 |        | Marvin Bagley III        | max_near_max_high_star        | $46.40M         | $40.83M-$46.40M | 43.61    | 45.59    | 2.79   | 0.81   | -1.98     | 2.79       | 0.81       | v2         | high_turnover_creator_risk; defense_impact_supported                            | low        |

### Exact max / near-max cases affected by tolerance

| dataset      | case   | global | player            | bucket                     | human           | v1 range        | v1 point | v2 point | v1 gap | v2 gap | delta gap | v1 mid err | v2 mid err | gap winner | risk flags                                                          | trade risk |
| ------------ | ------ | ------ | ----------------- | -------------------------- | --------------- | --------------- | -------- | -------- | ------ | ------ | --------- | ---------- | ---------- | ---------- | ------------------------------------------------------------------- | ---------- |
| boundary40   | I-02   | B40-34 | Josh Giddey       | star_near_max              | $38.66M         | $34.02M-$38.66M | 36.34    | 38.08    | 2.32   | 0.58   | -1.74     | 2.32       | 0.58       | v2         | high_turnover_creator_risk                                          | low        |
| boundary40   | I-03   | B40-35 | Patrick Williams  | star_near_max              | $46.40M         | $40.83M-$46.40M | 43.61    | 45.66    | 2.79   | 0.74   | -2.05     | 2.79       | 0.74       | v2         | high_turnover_creator_risk                                          | low        |
| boundary40   | I-04   | B40-36 | Trae Young        | star_near_max              | $44.00M-$46.40M | $40.83M-$46.40M | 43.61    | 45.59    | 0.39   | 0      | -0.39     | 1.59       | 0.39       | v2         | high_turnover_creator_risk                                          | low        |
| boundary40   | J-01   | B40-37 | Justin Champagnie | superstar_max_lock         | $46.40M         | $40.83M-$46.40M | 43.61    | 45.73    | 2.79   | 0.67   | -2.12     | 2.79       | 0.67       | v2         | high_turnover_creator_risk                                          | low        |
| boundary40   | J-02   | B40-38 | Scottie Barnes    | superstar_max_lock         | $46.40M         | $40.83M-$46.40M | 43.61    | 45.77    | 2.79   | 0.63   | -2.16     | 2.79       | 0.63       | v2         | high_turnover_creator_risk; shooting_portable; defense_impact_noisy | low        |
| boundary40   | J-03   | B40-39 | Joshua Primo      | superstar_max_lock         | $46.40M         | $40.83M-$46.40M | 43.61    | 45.77    | 2.79   | 0.63   | -2.16     | 2.79       | 0.63       | v2         | high_turnover_creator_risk; shooting_portable; defense_impact_noisy | low        |
| boundary40   | J-04   | B40-40 | Luka Dončić       | superstar_max_lock         | $46.40M         | $40.83M-$46.40M | 43.61    | 45.67    | 2.79   | 0.73   | -2.06     | 2.79       | 0.73       | v2         | high_turnover_creator_risk                                          | low        |
| validation20 | V20-04 |        | Zhaire Smith      | max_near_max_high_star     | $46.40M         | $40.83M-$46.40M | 43.61    | 45.68    | 2.79   | 0.72   | -2.07     | 2.79       | 0.72       | v2         | high_turnover_creator_risk; shooting_portable                       | low        |
| validation20 | V20-08 |        | Ja Morant         | young_proven_young_starter | $38.00M-$43.00M | $40.83M-$46.40M | 43.61    | 45.43    | 0.61   | 2.43   | 1.82      | 3.11       | 4.93       | v1         | high_turnover_creator_risk; defense_impact_noisy                    | low        |

## Interval Width Penalty

For v1 range only: intervalScore = intervalMissGap + lambda \* v1WidthM. Wide v1 ranges should not be counted as precise predictions.

| metric                           | value |
| -------------------------------- | ----- |
| mean v1 width                    | 5.3   |
| median v1 width                  | 5.57  |
| mean v1 intervalScore lambda .10 | 1.99  |
| mean v1 intervalScore lambda .15 | 2.25  |
| mean v1 intervalScore lambda .20 | 2.52  |
| mean v2 point gap                | 2.46  |

## Conclusion

| metric             | conclusion         | detail                           |
| ------------------ | ------------------ | -------------------------------- |
| point-to-range gap | v2 improves        | v1 mean 3.34M vs v2 mean 2.46M   |
| midpoint error     | v2 improves        | v1 mean 4.86M vs v2 mean 3.99M   |
| bias               | v2 less biased     | v1 bias -4.15M vs v2 bias -2.95M |
| severe count       | v2 improves        | v1 severe 7 vs v2 severe 4       |
| winner count       | v2 wins more cases | v2 28, v1 5, tie 15              |
