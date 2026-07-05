# Contract Market Mechanism Explainer

本文件从零解释当前 sandbox contract market 的机制。它不是调参建议，也不是 v2.1 实现方案。

## 1. 当前模型分两层

当前 sandbox 有三件事：

1. v1 `scoreTier(row)`：把球员分进一个 tier。
2. v1 `tierRange(tier, row, attrs)`：把 tier 转成金额 range。
3. v2 `scoreContractMarketV2(row, attrs)`：保留 v1 tier/range，只在 range 内放一个 point estimate。

这意味着 v2 不是一个能自由报价的模型。它不能跳出 v1 range。如果 v1 把一个球员放进 `YOUNG_UPSIDE_SUSPECT $3.87M-$6.96M`，v2 最多只能把 point 放到这个区间上沿附近，不能自己报到 $20M。

## 2. v1 tier 判断机制

v1 是 hard if/else gate。它不是 weighted score。代码按固定顺序检查 tier，第一个通过的 tier 直接返回。

检查顺序：

1. `SUPERSTAR_MAX`
2. `STAR_NEAR_MAX`
3. `YOUNG_PROVEN_STARTER`
4. `LOW_END_STARTER`
5. `VETERAN_ROTATION_GUARD`
6. `YOUNG_UPSIDE_SUSPECT`
7. `SPECIALIST_ROTATION`
8. `VETERAN_MINIMUM_PLUS`
9. `LOW_ROTATION_PLUS`
10. fallback `MINIMUM_LEVEL`

核心字段：

- value/valueNoPot/getContractValue: BBGM value and contract value proxies.
- GP/MPG/starterShare: role and starter certainty.
- PER/EWA/VORP/BPM/USG: production and impact gates.
- age/pot/potentialPremium: upside gates.
- comp*\* and skill*\* margins: shooting, passing, rebounding, defense archetype gates.
- pos: guard/frontcourt gates.

没有跨 tier 的总分。一个球员如果差一个关键条件，就会掉到后面的 tier，即使其他条件很强。

## 3. v1 range 判断机制

`tierRange` 不看更多篮球信息，只看 tier table、salary cap、eligible max、player minimum。

| tier                   | range source               | years override |
| ---------------------- | -------------------------- | -------------- |
| MINIMUM_LEVEL          | 1x-1.15x player minimum    |                |
| VETERAN_MINIMUM_PLUS   | player minimum-3.5% cap    |                |
| LOW_ROTATION_PLUS      | 2.0%-3.5% cap              |                |
| SPECIALIST_ROTATION    | 3.5%-5.5% cap              |                |
| YOUNG_UPSIDE_SUSPECT   | 2.5%-4.5% cap              |                |
| VETERAN_ROTATION_GUARD | 4.0%-6.0% cap              | 1-2            |
| LOW_END_STARTER        | 6.0%-12.0% cap             |                |
| YOUNG_PROVEN_STARTER   | 17.0%-22.5% cap            |                |
| STAR_NEAR_MAX          | 88.0%-100.0% eligible max  |                |
| SUPERSTAR_MAX          | 100.0%-100.0% eligible max |                |

强限制来自 ceiling：

- `MINIMUM_LEVEL` ceiling 约 1.15x player minimum。
- `YOUNG_UPSIDE_SUSPECT` ceiling 4.5% cap。
- `LOW_END_STARTER` ceiling 12% cap。
- `YOUNG_PROVEN_STARTER` ceiling 22.5% cap。
- `STAR_NEAR_MAX` ceiling 是 eligible max。

所以如果 v1 tier 过低，v2 point 再好也逃不出低 ceiling。

## 4. v2 point estimate 机制

v2 的公式是：

```text
debugPointEstimateM = debugRangeMinM + tierPlacementScore * (debugRangeMaxM - debugRangeMinM)
```

`tierPlacementScore` 来自七个 component：

| component                      | main inputs                                                                | role                   |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------- |
| currentImpactComponent         | getContractValue, valueNoPot, MPG, starterShare, PER, EWA, VORP, BPM       | 当前影响力             |
| roleCertaintyComponent         | GP, MPG, starterShare, valueNoPot, EWA                                     | 角色稳定性             |
| futureUpsideComponent          | age, pot, potentialPremium, MPG/BPM/EWA role support                       | 未来 upside            |
| skillPortabilityComponent      | shooting package, playmaking, defense/rebound, MPG, TS                     | 技能能否转化成上场价值 |
| archetypeRiskComponent         | turnover, low efficiency, low role, poor impact, small guard defense noise | 风险扣分               |
| ageYearsRiskComponent          | age, years, GP durability                                                  | 年龄/年限风险          |
| productionReliabilityComponent | GP, MPG, EWA, VORP, BPM, PER                                               | 产量可信度             |

权重：

```text
currentImpact 0.28
roleCertainty 0.17
futureUpside 0.13
skillPortability 0.14
productionReliability 0.14
(1 - archetypeRisk) 0.08
(1 - ageYearsRisk) 0.06
```

最终 placement 被 clamp 到 0.04-0.96。也就是说即使 component 很强，也不能超过 range 上沿。

## 5. Risk flags

v2 会输出 risk flags，例如：

- `young_proven_positive`
- `young_pot_only`
- `small_guard_defense_stat_risk`
- `high_turnover_creator_risk`
- `high_turnover_role_player_risk`
- `shooting_portable`
- `low_efficiency_shooter_risk`
- `non_scoring_impact_positive`
- `defense_impact_supported`
- `defense_impact_noisy`

这些 flags 解释机制和风险。它们不是单个 case 特供门。

## 6. Trade exploit audit

`tradeExploitRiskFlag` 是 audit-only。它不进入 `tierPlacementScore`，也不改变 point estimate。它只标记“低 ask + 高 asset proxy + 风险 profile”这种后续需要 trade-value audit 的情况。

## 7. Comparable eval 为什么更公平

旧对比是：

- v1: full range 是否 overlap human range。
- v2: point 是否 inside human range。

这对 v1 太宽容，对 v2 太严格。

同口径 eval 改成：

- v1 point = v1 range midpoint。
- v2 point = `debugPointEstimateM`。
- 两者都用 point-to-human-range gap、midpoint error、signed bias、severe threshold 比较。

当前 comparable eval 结论：v2 在 point gap、midpoint error、bias、severe count 上都比 v1 midpoint 更好，但仍然系统性 too_low。这指向的问题多半在 v1 base tier/range ceiling，而不只是 v2 point placement。

## 8. 当前 trace 覆盖

本轮 trace 覆盖 48 个 labeled cases，包括 boundary40 和 validation20。每个 case 都记录了 hard gate 结果、range ceiling/floor、v2 components、risk flags 和机制归因。
