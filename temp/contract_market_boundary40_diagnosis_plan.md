# BBGM Contract Market Boundary40 诊断执行 Plan

## 0. 目标

本文件不是最终代码实现方案，而是给后续 Codex/K 使用的诊断执行约束。核心目标是：让后续实现计划严格继承诊断报告中的价值判断，同时避免把单个球员 case 写成过拟合规则。

后续 Codex/K 的职责不是重新判断“谁值多少钱”，而是：

1. 读取诊断报告；
2. 对照仓库里的 scoring/generator 结构；
3. 产出可实现的 sandbox v2 implementation plan；
4. 明确哪些文件要改、哪些字段要新增、如何验证；
5. 在用户确认之前不改正式 `src/`。

## 1. 输入文件

后续计划必须读取并对齐这些输入：

- `contract_market_artifacts/contract_market_boundary40_candidates.csv`
- `contract_market_artifacts/contract_market_boundary40_score.csv`
- `contract_market_artifacts/contract_market_boundary40_score.md`
- `contract_market_artifacts/contract_market_boundary40_review_debug.html`
- `temp/contract_market_boundary40_human_notes.json`
- `tools/contract-market-boundary-set.mjs`
- `tools/contract-market-boundary40-score.mjs`
- 参考：
  - `tools/contract-market-validation20-score.mjs`
  - `contract_market_artifacts/contract_market_validation20_score.csv`
  - `contract_market_artifacts/contract_market_validation20_score.md`
  - `contract_market_artifacts/contract_market_tier_score.md`

## 2. 严格边界

后续 Codex/K 在制定实现计划时必须遵守：

1. 不修改正式 `src/`。
2. 不 commit。
3. 不重抽 boundary40。
4. 不把 boundary40 当 final test。
5. 不把 old `Demand / Cap` 当 debug model prediction。
6. 不把 current trade value 作为合同 ask 的直接输入。
7. 不为单个球员、pid、caseId 写规则。
8. 不把用户原始 human amount 当绝对真值；要保留 notes 中的自我修正，例如“我可能给高了”“真实可能 15-25”。

## 3. v2 的定义

v2 不是“把 Debug range 显示得更细”。v2 是 scoring 结构变化。

当前结构近似为：

```text
player features -> debug tier -> fixed debug range
```

目标结构应为：

```text
player features
-> component scores
-> debug tier
-> tier-local point estimate
-> years / risk flags
-> debug reason
```

v2 必须输出：

```text
debugTier
debugRange
debugPointEstimateM
debugYears
debugReason
riskFlags
oldDemandSanityFlag
tradeExploitRiskFlag
```

其中 `debugPointEstimateM` 是最关键新增字段。没有 point estimate，`$9.28M-$18.56M` 这种宽区间仍然无法指导合同 ask。

## 4. 需要进入 implementation plan 的机制模块

### 4.1 Tier-local point estimate

要求：

- 每个 tier 保留 min/base/max；
- 基于 continuous score 决定落点；
- point estimate 不能只取 range midpoint；
- point estimate 应受正向组件和风险组件共同影响；
- 输出 reason，说明落在下沿/中段/上沿的原因。

建议组件：

```text
currentImpactScore
roleCertaintyScore
futureUpsideScore
skillPortabilityScore
archetypeRiskScore
ageYearsRiskScore
```

### 4.2 Young upside 拆分

不要只写“young premium”。

必须拆分：

```text
young_unproven_suspect
young_rotation_with_skill
young_productive_upside
young_high_potential_but_bad_fit
```

实现计划需要说明每类的触发条件和反例。

最低要求：

- 年龄/pot 不是充分条件；
- 必须结合 MPG、production、EWA/BPM/VORP、skills、efficiency、role；
- 属性分配不好、效率差、不可转化角色要进入 risk flags。

### 4.3 Productive bench scorer floor

目的：避免 Musa/Beasley/Strawther/Jović 类球员被打成 minimum。

但必须避免无脑抬所有 scorer。

实现计划必须包含：

- minutes threshold；
- scoring/usage threshold；
- shooting or creation evidence；
- efficiency/TS/eFG sanity；
- turnover/defense penalty；
- 上限限制。

### 4.4 Turnover penalty with context

实现计划必须避免：

```text
high turnover -> direct minimum
```

改成：

```text
turnover penalty = f(TOV, USG, AST%, role, minutes)
```

要求：

- high usage creator 的 turnover 用不同标准；
- low usage role player 的 turnover 更严重；
- penalty 有 cap；
- penalty 优先影响 point estimate 和 years，不轻易跨多个 tier。

### 4.5 Small guard high-stat sanity

实现计划必须包含 position-specific sanity：

- PG/G 小体型球员的 DBPM/BPM/on-off 防守加分需要打折；
- 需要用 height/strength/defensive ratings/role/starter evidence 做交叉验证；
- on-off 不能单独成为强信号；
- 小后卫正向高阶可提高 floor，但不能直接制造 high-starter ceiling。

### 4.6 Role-convertible shooting

实现计划不能只用 3pt rating。

应考虑：

- 3pt rating；
- mid-range / shot creation；
- TS/eFG；
- usage and volume；
- offensive IQ；
- age and development;
- role fit。

输出应能解释：

- 为什么某些 shooter 只是 4-8；
- 为什么某些年轻 shooter 可以到 10-15；
- 为什么低效率 shooter 不应被 old demand 拉到 18M+。

### 4.7 Non-scoring impact recognition

实现计划必须覆盖 defensive/connector/non-scoring star：

- defensive awards；
- DBPM/BPM/EWA/VORP；
- passing/rebounding/defense composites；
- starter share / MPG；
- position/role scarcity。

同时必须有 offense damage 风险：

- spacing risk；
- low scoring；
- free throw / shooting issue；
- playoff/fit risk；
- years risk。

### 4.8 Old demand sanity

old demand 不能直接变成 ask，但应作为 sanity feature。

实现计划应新增：

```text
oldDemandGapM
oldDemandGapPct
oldDemandSanityFlag
oldDemandDisagreementReason
```

当 debug point 与 old demand 差距极大时，必须输出解释：

- old demand likely too high；
- debug likely too low；
- disagreement requires review；
- trade exploit risk possible。

### 4.9 Trade exploit risk flag

实现计划必须把 trade exploit 做成 audit，不是 ask 输入。

建议 flag 条件：

```text
high OVR/POT/value or trade-value proxy
+ low debugPointEstimate
+ weak actual impact / bad archetype / poor efficiency / role uncertainty
+ likely current trade system would still value him
```

输出：

```text
tradeExploitRiskFlag: none / watch / high
tradeExploitReason
```

禁止：

```text
trade value high -> ask high
```

正确逻辑：

```text
trade value high but true impact weak -> audit trade value
true impact high but debug ask low -> raise contract model
both high -> fair asset, not exploit
```

## 5. Implementation plan 的预期文件输出

Codex/K 后续应先产出计划文件，而不是直接改模型：

```text
contract_market_artifacts/contract_market_sandbox_v2_implementation_plan.md
```

该文件必须包含：

1. 当前代码链路：哪些脚本生成 debug tier/range；
2. 新增字段设计；
3. 每个机制模块对应修改点；
4. 不修改正式 `src` 的 sandbox-only 路径；
5. 预期输出 CSV/MD；
6. 验证命令；
7. 过拟合防护；
8. trade exploit audit 方案；
9. 与 validation20/boundary40 的回归对比方式。

可选新增诊断 CSV：

```text
contract_market_artifacts/contract_market_boundary40_qualitative_diagnosis.csv
```

字段建议：

```text
caseId
pid
name
bucket
humanOriginalRange
humanRevisedRange
debugTier
debugRange
oldDemand
rangeResult
failureModes
doNotOverfit
implementationImplication
```

## 6. 计划质量检查清单

后续 implementation plan 交付前，逐项检查：

### 6.1 防过拟合

- 是否出现球员名/pid 作为规则条件？如果有，失败。
- 是否出现 “young + C + shooting + defense + pot” 这种过窄条件？如果有，失败。
- 每个机制是否至少覆盖多个 case 或一个明确 class？如果没有，失败。
- 每个正向加分是否有反例和上限？如果没有，失败。

### 6.2 可实现性

- 是否说明要改哪个工具脚本？
- 是否说明新增字段从哪里计算？
- 是否说明验证命令？
- 是否说明输出 CSV/MD schema？
- 是否保持 sandbox-only，不改 `src/`？

### 6.3 价值观一致性

- 是否避免把 trade value 直接塞进 ask？
- 是否说明合同价值和交易价值共享真实价值基础？
- 是否保留 old demand sanity，但不照抄 old demand？
- 是否处理 point estimate，而不是只改显示文案？

### 6.4 评测流程

- 是否先 rerun boundary40？
- 是否 rerun validation20？
- 是否把 boundary40/validation20 都称为 calibration/challenge，不称 final test？
- 是否说明只有 v2 稳定后才创建 unseen test set？

## 7. 推荐后续工作流

### Step 1：确认诊断

用户和 GPT 先确认诊断报告是否代表正确价值观。

### Step 2：Codex/K 写 implementation plan

Codex/K 只负责把诊断转成代码层 plan，不重写价值判断。

### Step 3：审 implementation plan

GPT 和用户审查：

- 是否过拟合；
- 是否能实现；
- 是否遗漏 trade exploit；
- 是否把 point estimate 做成核心。

### Step 4：实现 sandbox v2

只改工具/产物，不改正式 `src`。

### Step 5：重跑 calibration

输出：

```text
contract_market_artifacts/contract_market_boundary40_score_v2.csv
contract_market_artifacts/contract_market_boundary40_score_v2.md
contract_market_artifacts/contract_market_validation20_score_v2.csv
contract_market_artifacts/contract_market_validation20_score_v2.md
```

### Step 6：再决定 test set

只有当 v2 在 boundary40 + validation20 的主要 failure modes 上改善后，才抽 unseen test set。

## 8. 对 Codex/K 的一句话约束

后续所有实现计划都要服从这句话：

> Case 是证据，不是规则；规则必须解释一类机制偏差，并且有反例、上限和可验证输出。
