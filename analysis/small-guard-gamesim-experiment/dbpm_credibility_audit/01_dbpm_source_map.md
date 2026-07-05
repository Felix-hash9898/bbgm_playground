# DBPM / BPM / PM 字段来源与计算逻辑审计 (01_dbpm_source_map.md)

本报告详细梳理了 BBGM 真实 save 文件或现有导出数据中 DBPM、OBPM、BPM、PM100 和 OnOff 等高阶指标的底层数据来源、源码公式以及核心限制。

---

## 1. 字段映射与定义

在 BBGM 导出的 JSON/CSV 数据中，这些字段对应的原始键值如下：

- **OBPM (Offensive Box Plus/Minus)**: 对应 player stats 数组元素中的 `obpm`。
- **DBPM (Defensive Box Plus/Minus)**: 对应 player stats 数组元素中的 `dbpm`。
- **BPM (Box Plus/Minus)**: 页面展现为 `BPM`，底层直接由 `dbpm + obpm` 累加得出（[processPlayerStats.basketball.ts:L113](file:///Users/felixhuang/Desktop/bbgm/zengm%20-%20playground/src/common/processPlayerStats.basketball.ts#L113)）。
- **PM100 (Plus-Minus per 100 Possessions)**: 对应 player stats 数组元素中的 `pm100`。
- **OnOff (On-Off Net Rating per 100 Possessions)**: 对应 player stats 中的 `onOff100` 字段。

---

## 2. 底层源码公式审计

所有这些高阶属性均为**每赛季模拟结束后，基于基础累积数据计算出的衍生指标 (Box-Score Derived)**，计算逻辑主要封装在 [advStats.basketball.ts](file:///Users/felixhuang/Desktop/bbgm/zengm%20-%20playground/src/worker/util/advStats.basketball.ts) 中。

### A. PM100 & OnOff 计算公式

在 [advStats.basketball.ts:L51-L80](file:///Users/felixhuang/Desktop/bbgm/zengm%20-%20playground/src/worker/util/advStats.basketball.ts#L51-L80) 源码中：

- **`onPerMin` (场上每分钟正负值)**:
  $$\text{onPerMin} = \frac{\text{ps.pm}}{\text{ps.min} + 1e-6}$$
- **`offPerMin` (场下每分钟正负值)**:
  $$\text{offPerMin} = \frac{\text{mov} - \text{ps.pm}}{\text{offMin} + 1e-6}$$
  _(其中，$\text{mov} = \text{t.stats.pts} - \text{t.stats.oppPts}$ 为球队赛季总净胜分，$\text{offMin}$ 为球员不在场的总时间)_
- **`pm100`**:
  $$\text{pm100} = \frac{100}{\text{t.stats.pace}} \times \text{gameLength} \times \text{onPerMin}$$
- **`onOff100`**:
  $$\text{onOff100} = \frac{100}{\text{t.stats.pace}} \times \text{gameLength} \times (\text{onPerMin} - \text{offPerMin})$$

### B. BPM & OBPM/DBPM 计算公式

在 [advStats.basketball.ts:L300-L493](file:///Users/felixhuang/Desktop/bbgm/zengm%20-%20playground/src/worker/util/advStats.basketball.ts#L300-L493) 源码中：

1. **输入参数**：提取球员的基础数据（pts, fga, fta, tp, ast, stl, blk, pf, tov, orb, drb, trb，均标准化为每 100 回合数据），并根据位置和进攻角色选择对应的系数数组（`coeffsBPM1` 和 `coeffsBPM5`）。
2. **团队调整值 (Team Adjustment)**：
   计算出球队的调整值：
   $$\text{teamAdjBPM} = \frac{\text{tmRate} - \text{teamBPM}}{5}$$
   _(其中，$\text{tmRate}$ 为球队的整体每百回合得分效率/净胜分水平)_
3. **加成与最终得分**：
   - 将球员的基础回归分数加上球队调整值，得出最终的 `BPM` 和 `OBPM`：
     $$\text{BPM}_i = \text{rawBPM}_i + \text{teamAdjBPM}$$
     $$\text{OBPM}_i = \text{rawOBPM}_i + \text{teamAdjOBPM}$$
   - **DBPM 计算**：
     $$\text{DBPM}_i = \text{BPM}_i - \text{OBPM}_i$$

---

## 3. 指标可信度与防守审计

### 特别说明：这些高阶防守指标绝对不能被直接理解为球员的“真实单防能力”！

其主要原因在于：

1. **球队实力的“溢出效应” (Team Success Inflation)**：
   从公式 $\text{BPM}_i = \text{rawBPM}_i + \text{teamAdjBPM}$ 可以看出，球员的 BPM（及 DBPM）会获得球队整体净胜效率（$\text{tmRate}$）的直接加成。这意味着**当一个防守极差的球员身处强队、或者与 Giannis 等防守精英共同在场时，即使他自己在防守端毫无贡献，其最终的 DBPM / PM100 也会被团队胜利强行拉高成可观的正值**。
2. **防守回归公式的粗糙代理 (Box-score Regression Proxy)**：
   DBPM 在数学上不是“比赛模拟器对该球员的防守质量评估”，而是“通过篮板、抢断、盖帽、犯规进行的公式拟合”。如果一个小后卫依靠极高的速度刷到了较多抢断，或者因为队伍的保护拿到了几个防守篮板，他的基础防守回归得分就会很高，即使他在防守端被彻底打爆，公式也无法察觉。
3. **缺少 Matchup 物理阻截**：
   BBGM 并不存在一对一的单防阻截和定点点名机制。如果一个矮个后卫（OVR 偏低，防守 ratings 偏低）上场，他的防守漏洞只通过全队 Composite Ratings 稀释分摊。再加上他进攻端可能是一个高效率的组织者或三分手，他的 $\text{pm100}$ / $\text{onOff}$ 会被其强大的进攻影响力带正，从而被计算公式“倒推”出一个看似优异的 DBPM 正值。

### 审计结论：

真实 save 中像 Yogi Ferrell 这样 ratings 低、没有防守徽章但 DBPM / PM 指标极其优异的现象，极有可能是**“高进攻输出/高抢断率 + 强队光环 + 强力队友共同在场”在 box-score 回归公式中产生的虚假正向投影（Proxy Noise）**，而不代表他在 BBGM 引擎中拥有真正的防守正资产。
