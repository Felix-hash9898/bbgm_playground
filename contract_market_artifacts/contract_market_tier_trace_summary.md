# Contract Market Tier Trace Summary

本报告只做 read-only mechanism trace。它没有改 `src/`，没有改 `scoreTier`、`tierRange` 或 sandbox v2 逻辑，也没有重抽样。trace 覆盖 boundary40 与 validation20 的 labeled cases，共 48 cases。

## 机制总览

- v1 tier 是 hard if/else gate，不是 weighted score。第一个通过的 tier 直接返回，后面的 tier 不再检查。
- v1 range 完全由 tier table 转成金额区间；低 tier 的 ceiling 会把球员锁在低金额区间。
- v2 point estimate 不能逃出 v1 range。它只计算 `tierPlacementScore`，然后在 v1 range 内插值。
- tradeExploitRiskFlag 是 audit-only，不参与 point estimate。
- comparable eval 用 v1 midpoint vs v2 point 做同口径比较，因此更适合判断 point placement。

Salary cap: $154.65M.

## Primary Mechanistic Cause Summary

| cause                                         | count | severe | mean v2 gap M | datasets                 | inside/control |
| --------------------------------------------- | ----- | ------ | ------------- | ------------------------ | -------------- |
| aligned_or_control                            | 10    | 0      | 0             | boundary40, validation20 | 10             |
| v1_base_tier_range_ceiling_below_human        | 18    | 4      | 5.55          | boundary40, validation20 | 0              |
| v2_tier_internal_point_placement_low          | 4     | 0      | 0.68          | boundary40, validation20 | 0              |
| v2_archetype_risk_or_penalty_pulls_point_down | 1     | 0      | 0.57          | boundary40               | 0              |
| v2_tier_internal_point_placement_high         | 7     | 0      | 1.33          | boundary40, validation20 | 0              |
| v2_point_near_ceiling_but_range_not_enough    | 8     | 0      | 0.69          | boundary40, validation20 | 0              |

## By v1 Tier

| v1 tier                | count | inside | too_low | too_high | severe | range locked low | mean gap M |
| ---------------------- | ----- | ------ | ------- | -------- | ------ | ---------------- | ---------- |
| MINIMUM_LEVEL          | 7     | 1      | 2       | 4        | 1      | 2                | 1.59       |
| LOW_ROTATION_PLUS      | 1     | 0      | 1       | 0        | 0      | 1                | 1.88       |
| YOUNG_UPSIDE_SUSPECT   | 3     | 0      | 3       | 0        | 1      | 3                | 7.82       |
| SPECIALIST_ROTATION    | 3     | 1      | 2       | 0        | 0      | 1                | 1.37       |
| VETERAN_ROTATION_GUARD | 2     | 0      | 2       | 0        | 0      | 1                | 1.26       |
| LOW_END_STARTER        | 11    | 3      | 7       | 1        | 2      | 6                | 4.29       |
| YOUNG_PROVEN_STARTER   | 7     | 1      | 5       | 1        | 0      | 4                | 2.71       |
| STAR_NEAR_MAX          | 11    | 1      | 9       | 1        | 0      | 0                | 0.8        |
| SUPERSTAR_MAX          | 2     | 2      | 0       | 0        | 0      | 0                | 0          |
| VETERAN_MINIMUM_PLUS   | 1     | 1      | 0       | 0        | 0      | 0                | 0          |

## Nearest Higher Tier Blocking Summary

| nearest higher tier    | count | severe | common blocking conditions                                                                                         |
| ---------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| VETERAN_MINIMUM_PLUS   | 5     | 0      | PER >= 12 (5); frontcourt rebound/defense signal (4); valueNoPot >= 50 (4); age >= 30 (1)                          |
| SPECIALIST_ROTATION    | 2     | 0      | skill_3_margin >= 0.08 (2); comp_shootingThreePointer >= 0.68 (1)                                                  |
| LOW_END_STARTER        | 6     | 2      | establishedStarter (6); valueNoPot >= 56 (3); PER >= 13 OR EWA >= 2 OR VORP >= 0.2 (1); getContractValue >= 55 (1) |
| YOUNG_UPSIDE_SUSPECT   | 1     | 0      | age <= 24 (1); pot >= 65 (1); potentialPremium >= 4 (1); value >= 57 (1)                                           |
| LOW_ROTATION_PLUS      | 1     | 0      | MPG < 16 (1)                                                                                                       |
| YOUNG_PROVEN_STARTER   | 10    | 2      | value >= 60 (7); age <= 26 (6); getContractValue >= 59 (3); highProduction OR BPM >= 1 OR EWA >= 5 (3)             |
| STAR_NEAR_MAX          | 8     | 0      | valueNoPot >= 65 (8); getContractValue >= 65 (7); starProduction (6)                                               |
| SUPERSTAR_MAX          | 11    | 0      | superstarProduction (10); comp_usage >= 0.70 (9); value >= 70 (4); getContractValue >= 68 (2)                      |
| none                   | 2     | 0      |                                                                                                                    |
| VETERAN_ROTATION_GUARD | 2     | 0      | AST% >= 14 (1); comp_passing >= 0.60 (1); age >= 28 (1); valueNoPot >= 52 (1)                                      |

## Worst v2 Point Misses With Mechanism Trace

| dataset      | case   | player           | bucket                        | human           | v1 tier              | v1 range        | v2 point | v2 gap | primary cause                          | nearest higher         | blocking conditions                                                        | risk flags                                                                      |
| ------------ | ------ | ---------------- | ----------------------------- | --------------- | -------------------- | --------------- | -------- | ------ | -------------------------------------- | ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| boundary40   | E-02   | Nikola Jović     | high_end_rotation_sixth_man   | $20.00M-$30.00M | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M   | 5.73     | 14.27  | v1_base_tier_range_ceiling_below_human | LOW_END_STARTER        | establishedStarter                                                         | young_proven_positive; high_turnover_role_player_risk                           |
| boundary40   | H-02   | Ben Simmons      | good_high_starter             | $30.00M-$35.00M | LOW_END_STARTER      | $9.28M-$18.56M  | 17.03    | 12.97  | v1_base_tier_range_ceiling_below_human | YOUNG_PROVEN_STARTER   | age <= 26                                                                  |                                                                                 |
| validation20 | V20-11 | Anthony Davis    | low_end_starter_good_rotation | $24.00M-$28.00M | LOW_END_STARTER      | $9.28M-$18.56M  | 15.4     | 8.6    | v1_base_tier_range_ceiling_below_human | YOUNG_PROVEN_STARTER   | age <= 26; value >= 60                                                     | high_turnover_role_player_risk; defense_impact_supported                        |
| boundary40   | G-04   | Džanan Musa      | solid_starter                 | $12.00M-$18.00M | MINIMUM_LEVEL        | $3.15M-$3.62M   | 3.44     | 8.56   | v1_base_tier_range_ceiling_below_human | LOW_END_STARTER        | establishedStarter                                                         | high_turnover_creator_risk                                                      |
| validation20 | V20-10 | Jason Preston    | low_end_starter_good_rotation | $24.00M-$29.00M | LOW_END_STARTER      | $9.28M-$18.56M  | 16.86    | 7.14   | v1_base_tier_range_ceiling_below_human | YOUNG_PROVEN_STARTER   | value >= 60                                                                |                                                                                 |
| validation20 | V20-06 | Isaiah Jackson   | young_proven_young_starter    | $40.00M-$46.40M | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | 33.48    | 6.52   | v1_base_tier_range_ceiling_below_human | STAR_NEAR_MAX          | valueNoPot >= 65; starProduction                                           | young_proven_positive; high_turnover_role_player_risk; defense_impact_supported |
| boundary40   | E-04   | Julian Strawther | high_end_rotation_sixth_man   | $12.00M-$18.00M | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M   | 5.6      | 6.4    | v1_base_tier_range_ceiling_below_human | LOW_END_STARTER        | establishedStarter; valueNoPot >= 56                                       | young_proven_positive                                                           |
| validation20 | V20-09 | Bradley Beal     | low_end_starter_good_rotation | $22.00M-$27.00M | LOW_END_STARTER      | $9.28M-$18.56M  | 15.65    | 6.35   | v1_base_tier_range_ceiling_below_human | YOUNG_PROVEN_STARTER   | age <= 26; value >= 60                                                     | high_turnover_creator_risk                                                      |
| boundary40   | F-01   | Shaedon Sharpe   | low_end_starter               | $20.00M-$30.00M | LOW_END_STARTER      | $9.28M-$18.56M  | 15.02    | 4.98   | v1_base_tier_range_ceiling_below_human | YOUNG_PROVEN_STARTER   | getContractValue >= 59; highProduction OR BPM >= 1 OR EWA >= 5             | young_proven_positive; high_turnover_role_player_risk                           |
| validation20 | V20-07 | Paolo Banchero   | young_proven_young_starter    | $38.00M-$44.00M | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | 33.53    | 4.47   | v1_base_tier_range_ceiling_below_human | STAR_NEAR_MAX          | getContractValue >= 65; valueNoPot >= 65                                   | high_turnover_creator_risk                                                      |
| validation20 | V20-12 | Jared Butler     | low_end_starter_good_rotation | $23.00M-$28.00M | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | 32.46    | 4.46   | v2_tier_internal_point_placement_high  | STAR_NEAR_MAX          | getContractValue >= 65; valueNoPot >= 65; starProduction                   |                                                                                 |
| boundary40   | G-02   | Isaiah Stewart   | solid_starter                 | $20.00M-$25.00M | LOW_END_STARTER      | $9.28M-$18.56M  | 15.62    | 4.38   | v1_base_tier_range_ceiling_below_human | YOUNG_PROVEN_STARTER   | highProduction OR BPM >= 1 OR EWA >= 5                                     | high_turnover_role_player_risk                                                  |
| validation20 | V20-13 | Landry Shamet    | specialist_low_rotation       | $10.00M-$14.00M | SPECIALIST_ROTATION  | $5.41M-$8.51M   | 7.03     | 2.97   | v1_base_tier_range_ceiling_below_human | VETERAN_ROTATION_GUARD | AST% >= 14; comp_passing >= 0.60                                           | small_guard_defense_stat_risk; shooting_portable; non_scoring_impact_positive   |
| boundary40   | D-03   | Jaylen Wells     | good_rotation_specialist      | $8.00M-$14.00M  | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M   | 5.22     | 2.78   | v1_base_tier_range_ceiling_below_human | LOW_END_STARTER        | establishedStarter; valueNoPot >= 56; PER >= 13 OR EWA >= 2 OR VORP >= 0.2 | young_pot_only                                                                  |
| validation20 | V20-08 | Ja Morant        | young_proven_young_starter    | $38.00M-$43.00M | STAR_NEAR_MAX        | $40.83M-$46.40M | 45.43    | 2.43   | v2_tier_internal_point_placement_high  | SUPERSTAR_MAX          | value >= 70; valueNoPot >= 67; getContractValue >= 68; superstarProduction | high_turnover_creator_risk; defense_impact_noisy                                |

## Reading Notes

- `failedHigherTierGates` tells which better tiers were checked before the returned tier and failed.
- `nearestHigherTierFailedBecause` is not a recommendation to tune those thresholds; it is the nearest hard gate blocker under current code.
- `rangeWasLockedLow=yes` means the final v1 range ceiling sits below the human range minimum.
- `v2CouldNotEscapeRange=yes` means v2 was limited by the inherited v1 range rather than only by point placement.
