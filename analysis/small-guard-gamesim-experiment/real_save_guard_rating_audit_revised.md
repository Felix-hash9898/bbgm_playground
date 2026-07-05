# 真实 Save 守卫评级审计报告 (修订版 - real_save_guard_rating_audit_revised.md)

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

## 4. 活跃 Guard 球员 ratings.hgt 分布

从当前 save 的活跃 PG/G/SG 球员中，我们对 **Rostered-only (仅有合同且归属球队的守卫)** 和 **Rostered + Free Agents (含自由球员在内的活跃守卫)** 进行分别统计：

| 统计口径          | 球员总数 | 最小值 | P10 | P25 | 中位数 | P75 | P90 | 最大值 |
| :---------------- | :------: | :----: | :-: | :-: | :----: | :-: | :-: | :----: |
| **Rostered + FA** |   330    |   7    | 29  | 34  |   40   | 44  | 47  |   64   |
| **Rostered-Only** |   213    |   7    | 30  | 34  |   40   | 44  | 47  |   57   |

_注：主实验应以 Rostered-Only 分布作为对比和折扣的核心依据。_

---

## 5. 小后卫组 (71-74 in) 的 diq 评级分布

从小后卫组（物理身高 71-74 in，位置为 PG/G/SG）的防守智商（`diq`）分布如下：

| 统计口径          | 球员总数 |  平均值   | 最小值 |    P25    |  中位数  |   P75    |  最大值  |
| :---------------- | :------: | :-------: | :----: | :-------: | :------: | :------: | :------: |
| **Rostered + FA** |    78    |   44.62   |   21   |   36.25   |   44.5   |   53.0   |   71.0   |
| **Rostered-Only** |    48    | **46.79** |   22   | **39.75** | **48.0** | **54.0** | **71.0** |

### 核心校验发现：

根据 Rostered-Only 的 diq 统计结果：

- 我们的第一轮保守折扣 **diq 71 → 54** 正好对应了 Rostered-Only 分布的 **P75** 阈值。
- 我们的第二轮狠折扣 **diq 71 → 48** 正好对应了 Rostered-Only 分布的 **中位数 (Median)** 阈值。
- Saben Lee 的原始 `diq` 值为 71，代表着该身高组别的防守上限（Max，100% 绝对分位数）。

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
- **Jaden Springer (pid 1712)**: OVR 77, diq 93, valueNoPot 72.36。 Jaden 的防守智商（`diq` = 93）是一个极端异常的高值，且拥有 `Di` 技能徽章，防守评分过高，不适合作为正常防守后卫的对照。

---

## 7. 评级及技能变化审计说明

每个折扣版 counterfactual 均通过重新调用评级映射和 skills 逻辑计算，得到以下结果：

1. **Saben Lee (原版)**:
   - `diq` = 71, `hgt` = 30. OVR = **74**, `valueNoPot` = **68.38**
   - 技能徽章: `3, B, Dp, Ps, V`
2. **Saben Lee_def_discount_diq54 (保守折扣)**:
   - `diq` = 54, `hgt` = 30. OVR = **71** (-3), `valueNoPot` = **66.24** (-2.14)
   - 技能徽章: `3, B, Ps, V` (**丢失了 Dp 徽章！**)
   - _原因_：由于 `diq` 降至 54，其外线防守评分下降，低于 0.61 的 cutoff，从而失去了外线防守技能徽章。
3. **Saben Lee_def_discount_diq48 (狠折扣)**:
   - `diq` = 48, `hgt` = 30. OVR = **69** (-5), `valueNoPot` = **64.81** (-3.56)
   - 技能徽章: `3, B, Ps, V` (**丢失了 Dp 徽章！**)
4. **Saben_hgt_rating_only_40 (机制隔离身高版)**:
   - `diq` = 71, `hgt` = 40。OVR = **76** (+2), `valueNoPot` = **69.80** (+1.42)
   - 技能徽章: `3, B, Dp, Ps, V`
   - 位置变化: **PG 变更为 SG**
   - 物理身高: 保持原版 74 in (188 cm) 不变，只把 `ratings.hgt` 改为 40。
   - _原因_：身高 rating 从 30 增加到 40，使其在位置公式中的得分增加，最接近 POS_VALUES.SG (1.0)，从而导致了位置的变化。本 Variant 仅用于做机制隔离实验，非真实球员。

---

## 8. BBGM GameSim 运行机制修正解释 (Corrected GameSim Architecture)

**注意：BBGM 的比赛模拟逻辑本质上是“团队复合评分 (Team-Level Composite Ratings)”与“球员分配权重 (Player Selection / pickPlayer)”驱动的回合概率模型，而非真实篮球的“一对一点名/强吃 (Matchup Hunting)”物理机制。**

### A. 身高 rating.hgt 影响表现的传导路径

小后卫由于评级身高（`hgt`）较低，其劣势并非因为在场上被对方高大球员“针对性单打”，而是因为其低 `hgt` 会直接拖累球队的多个复合属性和分配权重：

- **团队防守基础率 (Team-level Interior Defense & Rebounding)**:
  - 球队的内线防守（`defenseInterior` 权重中 `hgt` 占 2.5）、盖帽（`blocking` 权重中 `hgt` 占 2.5）以及后场篮板（`defensiveRebounding` 权重中 `hgt` 占 1.9）高度依赖场上 5 人的 `hgt` 评分总和。
  - 小后卫在场时，由于其 `hgt` 低（30），会导致球队的防守篮板率下降（被对方冲抢前场板的几率增高）、内线犯规率增高，且对手在篮下和低位投篮（`shootingAtRim` 和 `shootingLowPost`）的得分概率会系统性上升。
- **球员分配概率 (pickPlayer / doBlk / rebounding)**:
  - 篮板的最终获得者由 `pickDefensiveReboundPlayer()` 等方法基于场上 5 人的 `rebounding` 复合分数分配；盖帽的执行者由 `pickPlayer("blocking", ...)` 分配。
  - 由于小后卫的 `rebounding` 评分极低（`hgt` 权重 2.0），他极难通过分配算法分到防守篮板和盖帽数据。

### B. 防守外线中的 hgt、spd 与 diq 关系

在外线防守评级（`defensePerimeter`，对应外线防守技能 `Dp` 徽章）中：

- 评级身高 `hgt` 的权重占比较小，仅为 **0.5**。
- 运动速度 `spd`（权重 **2.0**）和防守智商 `diq`（权重 **1.0**）占据核心地位。
- 这也是为什么小后卫 Saben Lee（hgt=30）在拥有极高速度（69）和高 DIQ（71）时，依然能够越过 0.61 的 cutoff 获得 `Dp` 徽章，并在外线防守体系中提供优秀的贡献。但一旦其 `diq` 遭受折扣（如降至 54 或 48），其外线防守贡献值将显著滑坡并丢失 `Dp` 徽章。

### C. GameSim 核心计算公式回顾

1. **失误概率 (`probTov`)**：
   $$\text{probTov} = \text{boundProb}\left( \frac{\text{turnoverFactor} \times (0.14 \times \text{team[d].compositeRating.defense})}{0.5 \times (\text{team[o].compositeRating.dribbling} + \text{team[o].compositeRating.passing})} \times (1 + 0.35 \times \text{getTeamUsageOverload()}) \right)$$
   小后卫在防守端只能通过提高团队的整体 defense Composite 来促使对方失误。
2. **抢断概率 (`probStl`)**：
   $$\text{probStl} = \text{boundProb}\left( \frac{\text{stealFactor} \times (0.45 \times \text{team[d].compositeRating.defensePerimeter})}{0.5 \times (\text{team[o].compositeRating.dribbling} + \text{team[o].compositeRating.passing})} \right)$$
   抢断极其依赖 `defensePerimeter`。小后卫通过高 `spd` 和高 `diq` 维持较高的外线防守复合值，可以系统性提升球队在防守回合的抢断率。
3. **盖帽概率 (`probBlk`)**：
   $$\text{probBlk} = \text{blockFactor} \times 0.2 \times \text{team[d].compositeRating.blocking}^2$$
   由于 `blocking` 复合属性中 `hgt` 权重为 2.5，小后卫在场会极大地拉低盖帽发生率。
4. **防守篮板概率 (`rebounding` 阶段)**：
   防守篮板保护率取决于双方的复合评分，小后卫偏低的后场篮板复合评分（`hgt` 权重 1.9，`reb` 权重 2.0）会直接使球队更容易丢失防守篮板。
