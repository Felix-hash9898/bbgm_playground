# 真实 Save 守卫评级审计报告 (real_save_guard_rating_audit.md)

本报告基于真实 BBGM save 文件 `real_saves/BBGM_League_3_2025_re_sign_players.json.gz`，对“小体型正防守后卫”在 BBGM 评级系统及游戏模拟引擎（GameSim）中的处理方式进行审计。

---

## 1. 物理身高 (Display Height) 与评级身高 (ratings.hgt) 的区别

在 BBGM 中，球员的物理身高和评级身高扮演着完全不同的角色：

- **物理身高 (Display Height)**：在球员属性中的 `hgt` 字段（如 Saben Lee 是 `74` 英寸，即 188.0 cm）。这个字段**仅用于 UI 展示、文案展示以及部分外观渲染**，对比赛模拟（GameSim）的底层计算完全没有直接影响（cosmetic only）。
- **评级身高 (ratings.hgt)**：存在于球员 ratings 数组的当前赛季行中（如 Saben Lee 是 `30`）。这个数值（0-100）才是用于计算各项 **复合评级 (Composite Ratings)** 并最终输入给 **GameSim** 的决定性属性。

---

## 2. 身高映射公式 (Height Mapping Formula)

在球员评级生成逻辑 [heightToRating.ts](file:///Users/felixhuang/Desktop/bbgm/zengm%20-%20playground/src/worker/core/player/heightToRating.ts) 中，身高映射公式如下：

```typescript
const heightToRating = (heightInInches: number) => {
	const minHgt = 66; // 5'6" (basketball)
	const maxHgt = 93; // 7'9" (basketball)
	return limitRating((100 * (heightInInches - minHgt)) / (maxHgt - minHgt));
};
```

其中，`limitRating` 的逻辑是将结果截断并向下取整（`Math.floor`），范围限制在 `[0, 100]` 之间。

因此，理论上的映射公式为：
$$\text{ratings.hgt} = \lfloor \frac{100 \times (\text{heightInInches} - 66)}{27} \rfloor$$

_注：在真实球员导入或球员生成时，可能会对臂展（wingspanAdjust）引入 $\pm 1$ 英寸的随机抖动，导致实际 ratings.hgt 围绕理论身高映射值轻微浮动。_

---

## 3. 身高与 hgt 评级对照表 (Major Landmarks)

根据上述映射公式以及真实 save 数据的校准，主要身高 landmark 对应的大致 `hgt` 评级如下：

| 物理身高 (Display Height)     | 理论计算公式                                | 对应理论 hgt 评级 |     真实样本实际 hgt 评级 (Save 校验)      |
| :---------------------------- | :------------------------------------------ | :---------------: | :----------------------------------------: |
| **183cm (≈ 72.05 in / 6'0")** | $100 \times (72.05 - 66) / 27 \approx 22.4$ |      **22**       | **29** (Yogi Ferrell - 72 in 存在臂展上调) |
| **188cm (≈ 74.02 in / 6'2")** | $100 \times (74.02 - 66) / 27 \approx 29.7$ |      **29**       |         **30** (Saben Lee - 74 in)         |
| **195cm (≈ 76.77 in / 6'4")** | $100 \times (76.77 - 66) / 27 \approx 39.9$ |      **39**       |  **40** (Luke Kennard - 77 in / 195.6 cm)  |
| **6'0" (72.0 in)**            | $100 \times (72 - 66) / 27 = 22.2$          |      **22**       |                22 - 29 范围                |
| **6'2" (74.0 in)**            | $100 \times (74 - 66) / 27 = 29.6$          |      **29**       |                29 - 30 范围                |
| **6'4" (76.0 in)**            | $100 \times (76 - 66) / 27 = 37.0$          |      **37**       |                35 - 37 范围                |
| **6'6" (78.0 in)**            | $100 \times (78 - 66) / 27 = 44.4$          |      **44**       |                44 - 45 范围                |

---

## 4. PG/G/SG 球员 ratings.hgt 分布

从当前 save 的 330 名活跃 PG/G/SG 球员中，统计得出的 `hgt` 评级分布如下：

- **最小值 (Min)**: 7
- **P10**: 29
- **P25**: 34
- **中位数 (Median)**: 40
- **P75**: 44
- **P90**: 47
- **最大值 (Max)**: 64

---

## 5. 小后卫组 (71-74 in) 的 diq 评级分布

从当前 save 的 78 名活跃小后卫（物理身高 71-74 in，位置为 PG/G/SG）中，统计得出的防守智商（`diq`）分布如下：

- **平均值 (Mean)**: 44.6
- **最小值 (Min)**: 21
- **P25**: 36.3
- **中位数 (Median)**: 44.5
- **P75**: 53.0
- **最大值 (Max)**: 71.0 (**Saben Lee 即为该组的最大值 diq=71**)

---

## 6. 球员选样设计合理性说明

### A. 为什么 Saben Lee (pid 1422) 是主实验 Baseline？

1. **防守精英代表性**：Saben Lee 的 `diq` 是整个小后卫组中的最高值（71，即 Max），这使他成为测试“小体型防守正资产”的最极端样本。
2. **防守正资产与技能**：他在 2025 常规赛交出了优秀的防守答卷（DBPM +2.44, PM/100 +9.01），且拥有 `Dp`（Perimeter Defense）技能徽章。
3. **可控的对照实验**：通过对他的 `diq` 进行折扣下调，我们可以非常清晰地观察到当一个小后卫失去 elite 级别的 DIQ 时，他在 GameSim 中的防守和整体影响力将如何崩溃。

### B. 为什么 Yogi Ferrell (pid 200) 只是 exact-height sanity check？

1. **平庸的防守端**：Yogi Ferrell 的身高更矮（72 in），但他的 `diq` 只有 54（位于小后卫组的 P75），且没有任何防守技能徽章（仅有 `3` 和 `Ps`）。
2. **不能代表防守正资产**：他并非“小体型防守正资产”的代表，无法作为折扣实验的基准。他的存在主要用来作为矮个子球员在正常 diq 水平下的基础表现 sanity check。

### C. 为什么 Luke Kennard (pid 347) 是合理的 taller_real_neighbor？

1. **评级与价值极为接近**：Luke Kennard 的 OVR 为 72（Saben Lee 为 74），`valueNoPot` 为 66.35（Saben Lee 为 68.38），非常适合进行同级别身高的平行对比。
2. **防守水平相近但身高占优**：Luke 的 `diq` 为 66，虽略低于 Saben 的 71，但由于其评级身高更高（ratings.hgt = 40，Saben 为 30），他同时获得了 `Dp` 和 `Di` 技能徽章。
3. **实操表现的代表性**：他是 Det 的主力 SG，数据特征全面，是完美的 195cm 对照组。

### D. 其他 Taller Neighbor 候选人的对比分析

- **Joshua Primo (pid 1604)**: OVR 75, diq 70, valueNoPot 69.25。虽然他的评级和防守很接近，但他在 save 中的位置被判定为 **GF** (Guard-Forward)，因此具有一定的前锋属性，不属于纯粹的 guard。
- **Jaden Springer (pid 1712)**: OVR 77, diq 93, valueNoPot 72.36。他的防守智商（`diq` = 93）是一个极端异常的高值，且拥有 `Di` 技能徽章，防守统治力远超 Saben Lee，无法作为同级别防守影响力的 taller neighbor 对照。

---

## 7. 评级及技能变化审计说明

每个折扣版 counterfactual 均通过重新调用评级映射和 skills 逻辑计算，得到以下结果：

1. **Saben Lee (原版)**:
   - `diq` = 71, `hgt` = 30. OVR = **74**, `valueNoPot` = **68.38**
   - 技能徽章: `3, B, Dp, Ps, V`
2. **Saben Lee_def_discount_diq54 (保守折扣)**:
   - `diq` = 54, `hgt` = 30. OVR = **71** (-3), `valueNoPot` = **66.24** (-2.14)
   - 技能徽章: `3, B, Ps, V` (**丢失了 Dp 徽章！**)
   - _审计原因_：由于 `diq` 降至 54，其复合外线防守评级（`defensePerimeter`）下降，低于 0.61 的 cutoff，从而失去了外线防守技能徽章。
3. **Saben Lee_def_discount_diq48 (狠折扣)**:
   - `diq` = 48, `hgt` = 30. OVR = **69** (-5), `valueNoPot` = **64.81** (-3.56)
   - 技能徽章: `3, B, Ps, V` (**丢失了 Dp 徽章！**)
4. **Saben Lee_height_only_counterfactual (机制隔离身高版)**:
   - `diq` = 71, `hgt` = 40 (映射至 195cm)。OVR = **76** (+2), `valueNoPot` = **69.80** (+1.42)
   - 技能徽章: `3, B, Dp, Ps, V`
   - 位置变化: **PG 变更为 SG**
   - _审计原因_：身高 rating 从 30 增加到 40，使其在位置公式中的得分增加，最接近 POS_VALUES.SG (1.0)，从而导致了位置的变化。由于身高的直接加权，OVR 增加了 2 点。

---

## 8. GameSim 机制审计汇总

### A. 身高 rating.hgt 在复合属性中的加权方式

根据 [constants.basketball.ts](file:///Users/felixhuang/Desktop/bbgm/zengm%20-%20playground/src/common/constants.basketball.ts)，评级身高（`hgt`）对以下复合属性有极其显著的影响（括号内为加权权重）：

- **篮下投篮 (shootingAtRim)**: `hgt` (2.0) - 决定篮下终结效率，权重极高。
- **低位投篮 (shootingLowPost)**: `hgt` (1.0) - 决定低位得分效率。
- **篮板球 (rebounding)**: `hgt` (2.0) - 决定争抢篮板的概率。
- **进攻篮板 (offensiveRebounding)**: `hgt` (1.7) - 决定前场篮板争抢。
- **防守篮板 (defensiveRebounding)**: `hgt` (1.9) - 决定后场篮板保护。
- **盖帽 (blocking)**: `hgt` (2.5) - 盖帽的绝对核心影响因子，权重高达 2.5。
- **犯规 (fouling)**: `hgt` (1.0) - 身高越高，犯规概率越大（正权重）。
- **制造犯规 (drawingFouls)**: `hgt` (1.0) - 决定造杀伤的能力。
- **整体防守 (defense)**: `hgt` (1.0) - 基础防守权重。
- **内线防守 (defenseInterior)**: `hgt` (2.5) - 内线防守支柱，权重高达 2.5。
- **外线防守 (defensePerimeter)**: `hgt` (0.5) - 外线防守中身高影响较小（权重 0.5），防守智商（`diq` = 1.0）和速度（`spd` = 2.0）更关键。
- **运动能力 (athleticism)**: `hgt` (0.75) - 基础身体素质复合项。
- **争球 (jumpBall)**: `hgt` (1.0) - 跳球概率。
- **使用率 (usage)**: `hgt` (0.5) - 对回合占有率的辅助加权。

### B. GameSim 核心计算链审计

1. **`updatePlayersOnCourt` & `updateSynergy`**:
   - 提取场上双方 5 名球员的复合属性，计算出球队在 dribbling、passing、defense、defensePerimeter 等多维度的团队复合值。
   - 身高的劣势（如 Saben Lee hgt=30）会直接拉低球队的 defensePerimeter、defenseInterior 和 rebounding 团队值。
2. **`probTov` (失误概率)**:
   - 还原底层公式：
     $$\text{probTov} = \text{boundProb}\left( \frac{\text{turnoverFactor} \times (0.14 \times \text{team[d].compositeRating.defense})}{0.5 \times (\text{team[o].compositeRating.dribbling} + \text{team[o].compositeRating.passing})} \times (1 + 0.35 \times \text{getTeamUsageOverload()}) \right)$$
   - 小后卫的高 DIQ/SPD 能帮助拉高团队 defensePerimeter，从而压低对方的传控效率。
3. **`probStl` (抢断概率)**:
   - 还原底层公式：
     $$\text{probStl} = \text{boundProb}\left( \frac{\text{stealFactor} \times (0.45 \times \text{team[d].compositeRating.defensePerimeter})}{0.5 \times (\text{team[o].compositeRating.dribbling} + \text{team[o].compositeRating.passing})} \right)$$
   - 抢断成功后，利用 `pickPlayer("stealing", d, 4)` 选取抢断球员。
4. **`getShotInfo` & `probMake` (投篮命中率)**:
   - 三分命中率由 `shootingThreePointerScaled * 0.6 + 0.2` 决定；而篮下命中率极度依赖 `shootingAtRim`（高度挂钩 `hgt`）。
   - 小后卫防守者因 `hgt` 较低，在防守对方篮下或低位单打时，因 `defenseInterior`（`hgt` 权重 2.5）严重不足，会被轻易单打。
5. **`probBlk` (盖帽概率)**:
   - 还原底层公式：
     $$\text{probBlk} = \text{blockFactor} \times 0.2 \times \text{team[d].compositeRating.blocking}^2$$
   - `blocking` 复合项中 `hgt` 权重为 2.5，导致小后卫在封盖概率上处于绝对劣势。
6. **`rebounding` (篮板分配)**:
   - 还原分配概率：
     $$\text{DRB\_ratio} = \frac{0.75 \times (2 + \text{team[d].compositeRating.defensiveRebounding})}{\text{orbFactor} \times (2 + \text{team[o].compositeRating.offensiveRebounding})}$$
   - 身高低（hgt=30）将全面拉低团队的后场篮板率，导致球队丢前场板。
7. **`loadTeams` 中的 `usage ** 1.9`与`gameForm`\*\*:
   - `usage` 复合评分进行 1.9 次幂处理，放大了高 usage 球员对回合的占有能力。
   - `gameForm`（竞技状态）由 crossGameForm（±8% 影响）和 withinGameForm 叠加而成，对各复合属性做微调。
     Composites in `FORM_FULL` (usage, passing, shootingMidRange, shootingThreePointer, shootingFT, shootingLowPost, drawingFouls) scaled by `1 + formFactor * 0.08` (up to ±8%).
     Composites in `FORM_WEAK` (shootingAtRim, rebounding, stealing, defense, defenseInterior, defensePerimeter, turnovers) scaled by `1 + formFactor * 0.04` (up to ±4%).
