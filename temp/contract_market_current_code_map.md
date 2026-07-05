# Contract Market Current Code Map

本文件只描述当前 sandbox / artifact 层代码。boundary40 是 calibration/challenge set，不是 final test；本轮不涉及正式 `src/` 接入。

## 读取范围

- `temp/contract_market_boundary40_diagnosis.md`
- `temp/contract_market_boundary40_diagnosis_plan.md`
- `temp/contract_market_boundary40_human_notes.json`
- `temp/contract_market_boundary40_human_notes (1).json`
- `contract_market_artifacts/contract_market_boundary40_score.csv`
- `contract_market_artifacts/contract_market_boundary40_review_debug.html`
- `tools/contract-market-boundary-set.mjs`
- `tools/contract-market-boundary40-score.mjs`
- `tools/contract-market-proxy-core.mjs`
- `tools/contract-market-validation20-score.mjs`
- `contract_market_artifacts/contract_market_validation20_score.md`
- `contract_market_artifacts/contract_market_validation20_score.csv`

另为定位 Debug tier/range 的实际来源，读取了 `tools/contract-market-tier-score.mjs`。该文件属于 `tools/` sandbox/artifact 逻辑，不是正式 `src/`。

## 当前 boundary40 生成链路

入口是 `tools/contract-market-boundary-set.mjs`。

当前链路大致为：

1. 从 proxy rows / candidates 中构造 boundary40 candidate pool。
2. 对每个 row 调用 sandbox tier scorer：
   - `scoreTier(row)`
   - `tierRange(score.tier, row, attrs)`
3. 将结果写入 candidate 对象：
   - `debugModelTier`
   - `debugModelRangeText`
   - `debugModelReason`
4. 输出 artifacts：
   - `contract_market_artifacts/contract_market_boundary40_candidates.csv`
   - `contract_market_artifacts/contract_market_boundary40_notes_template.json`
   - `contract_market_artifacts/contract_market_boundary40_review_blind.html`
   - `contract_market_artifacts/contract_market_boundary40_review_debug.html`
   - `contract_market_artifacts/contract_market_boundary40_selection_report.md`

当前生成逻辑不重抽样时，应保持已有 B40 case 列表不变，只改变展示、score、report 或新增 sandbox 字段。

## Debug tier / Debug range 来源

Debug tier/range 的实际模型逻辑在 `tools/contract-market-tier-score.mjs`。

主要入口：

- `MODEL_TIERS`
- `featureFlags(row)`
- `scoreTier(row)`
- `tierRange(tier, row, attrs)`

`tools/contract-market-boundary-set.mjs` 中的 candidate 构造调用：

- `const score = scoreTier(row);`
- `const range = tierRange(score.tier, row, attrs);`

然后写入：

- `debugModelTier: score.tier`
- `debugModelRangeText: range.modelRangeText`
- `debugModelReason: score.reason`

当前 tier ladder 是离散 bucket + 固定 range：

| tier                     |                   range structure | notes                         |
| ------------------------ | --------------------------------: | ----------------------------- |
| `MINIMUM_LEVEL`          | player minimum 到约 1.15x minimum | minimum multiplier            |
| `VETERAN_MINIMUM_PLUS`   |        player minimum 到 3.5% cap | cap% range with minimum floor |
| `LOW_ROTATION_PLUS`      |                     2.0%-3.5% cap | low rotation                  |
| `SPECIALIST_ROTATION`    |                     3.5%-5.5% cap | shooting specialist rotation  |
| `YOUNG_UPSIDE_SUSPECT`   |                     2.5%-4.5% cap | young upside, non-starter     |
| `VETERAN_ROTATION_GUARD` |                     4.0%-6.0% cap | older creator guard           |
| `LOW_END_STARTER`        |                    6.0%-12.0% cap | starter-ish lower band        |
| `YOUNG_PROVEN_STARTER`   |                   17.0%-22.5% cap | young proven starter          |
| `STAR_NEAR_MAX`          |             88%-100% eligible max | near max                      |
| `SUPERSTAR_MAX`          |                exact eligible max | max                           |

`scoreTier(row)` 是优先级 gate：

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

这解释了当前模型的两个限制：

- tier 是硬 gate，不是连续分数。
- tier 内只输出 range，不输出 point estimate。

## 当前 old demand proxy 来源

old/current BBGM demand proxy 来自 `tools/contract-market-proxy-core.mjs`，不是 sandbox Debug model prediction。

核心函数：

- `getContractValue(p, season)`
- `estimateContractDemandNoRandom(p, attrs)`
- `getNormalNoOptionContract(contract, attrs)`
- `buildProxyRows(...)`

`buildProxyRows` 输出的关键字段包括：

- `getContractValue`
- `estimatedDemandNoRandom`
- `rawContractAmount`
- `rawContractYears`
- `rawContractOption`
- `normalNoOptionContractAmount`
- `normalNoOptionContractYears`
- `normalNoOptionContractCapPct`
- `eligibleMax`
- `minContractForPlayer`

boundary40 HTML/CSV 中的 Demand / Cap 来自：

- `estimatedDemandNoRandom`
- `estimatedDemandNoRandom / salaryCap`

scoring 中 old demand proxy 比较也使用：

- `candidate.estimatedDemandNoRandom / 1000`

因此报告里必须继续区分：

- sandbox model = `debugModelTier` / `debugModelRangeText` / `debugModelReason`
- old demand proxy = `estimatedDemandNoRandom` / Demand / Cap

## 当前 scoring 来源

boundary40 scoring 入口是 `tools/contract-market-boundary40-score.mjs`。

主要逻辑：

- `parseAmountRangeM(raw)`：解析 human amount range。
- `parseModelRangeM(text)`：解析 sandbox debug range text。
- `compareRange(...)`：比较 human range 与 sandbox range。
- `comparePoint(...)`：比较 old demand proxy point 与 human range。

当前 sandbox range 分类：

- `overlap`：model range 与 human range 有交集。
- `too_low`：model upper < human lower。
- `too_high`：model lower > human upper。
- `missing`：human 或 model range 缺失。

当前 severe threshold：

- money gap >= `$8M`
- 或 cap gap >= `5% cap`

对应输出：

- `severe_low`
- `severe_high`
- `no`
- `missing`

old demand proxy 的 point compare：

- `inside`
- `too_low`
- `too_high`
- `missing`

validation20 scoring 入口是 `tools/contract-market-validation20-score.mjs`。它同样解析 human notes/ranges 并比较 model range，但 boundary40 scorer 目前包含更明确的 severe money/cap threshold 与 old demand proxy point compare。

## 当前 human notes merge 方式

boundary40 scorer 读取 human notes，并优先按 pid 合并到 candidates：

- notes 文件来源可为 `temp/contract_market_boundary40_human_notes.json`
- 若原始用户文件是 `temp/contract_market_boundary40_human_notes (1).json`，scorer 会规范化为 stable copy
- candidate 与 note 通过 `pid` 对齐
- 输出里保留：
  - display `caseId`，例如 `D-01`
  - `globalCaseId`，例如 `B40-13`
  - `noteCaseId`，兼容旧 note

当前 A-C 为空值时，scoring 标记为 `missing` / `skip`，不进入 overlap accuracy 分母。

## Artifact-only 可以安全改的文件

以下属于 sandbox / artifact / temp 层，可作为 v2 planning 或 future sandbox v2 implementation 的落点：

- `tools/contract-market-boundary-set.mjs`
- `tools/contract-market-boundary40-score.mjs`
- `tools/contract-market-validation20-score.mjs`
- `tools/contract-market-tier-score.mjs`
- 可新增 `tools/contract-market-sandbox-v2.mjs` 或 `tools/contract-market-tier-score-v2.mjs`
- `temp/*.md`
- `temp/*human_notes*.json` 的规范化副本，但不应手工改用户金额判断
- `contract_market_artifacts/contract_market_boundary40_*`
- `contract_market_artifacts/contract_market_validation20_score.*`

注意：即使是 `tools/`，本轮也只做计划，不实现 v2。

## 正式 src 不要碰

本阶段不要改：

- `src/`
- 正式 game contract demand / re-sign demand 逻辑
- 正式 trade value 逻辑
- 正式 UI components
- 正式 player ratings rendering

trade exploit 只能作为 audit/risk flag 设计，不应把当前 trade value 直接作为 contract ask 输入或目标。

## 当前模型为什么只有 range，没有 point estimate

当前 sandbox model 是 tier/range diagnostic model：

1. `scoreTier(row)` 只返回一个离散 `tier` 和 `reason`。
2. `MODEL_TIERS[tier]` 只定义 range type 与 min/max：
   - cap% range
   - eligible max multiplier range
   - player minimum multiplier range
3. `tierRange(tier, row, attrs)` 只把 tier range 转换成金额上下沿和 years。
4. 没有 tier-local continuous score。
5. 没有把 player features 映射到 range 内 percentile。
6. 没有输出 `debugPointEstimateM` 或 point ask。

因此当前 Debug range 适合诊断覆盖、空档、重叠和大方向 miss，但无法判断同一 tier 内应该落在低位、中位还是高位。这也是 boundary40 diagnosis 中多次出现“range overlap 但实际 ask 仍可能偏低/偏高”的原因。
