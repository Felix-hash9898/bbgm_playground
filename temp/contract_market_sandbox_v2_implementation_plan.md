# Contract Market Sandbox v2 Implementation Plan

本文件是 artifact/tool 层 sandbox v2 实现计划，不是正式实现。boundary40 与 validation20 都是 calibration / challenge material，不是 final test。

## 1. v2 目标

v2 继续聚焦球员签约 ask / re-sign contract demand realism。

目标变化：

- 不再只有 Debug range。
- 新增 Debug point estimate。
- 继续保留 Debug tier / Debug range，用于可解释的 bucket 诊断。
- 新增 risk flags，把可疑样本标出来，而不是直接用单个 case 改规则。
- 新增 trade exploit risk audit flag。
- trade exploit 只做旁路 audit / risk flag，不把当前 BBGM trade value 当成 ask 输入或目标。

v2 应避免把 human notes 当 final truth。human target 是方向性 calibration evidence，尤其包含用户对使用价值、未来发展、交易价值/倒卖风险的综合判断。

## 2. v2 输出字段建议

建议 v2 candidate/debug 输出至少包含：

| field                    | purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `debugTier`              | v2 tier bucket                                      |
| `debugRangeMinM`         | v2 range lower bound, in millions                   |
| `debugRangeMaxM`         | v2 range upper bound, in millions                   |
| `debugRangeText`         | human-readable range                                |
| `debugPointEstimateM`    | v2 point ask estimate, in millions                  |
| `debugPointEstimateText` | human-readable point estimate                       |
| `debugYears`             | suggested years / term band                         |
| `debugReason`            | concise explanation                                 |
| `modelComponents`        | structured component scores and gates               |
| `riskFlags`              | non-trade model uncertainty / contract-risk flags   |
| `tradeExploitRiskFlag`   | audit-only cheap ask + likely high trade value risk |
| `tradeExploitReason`     | audit-only explanation                              |

For compatibility with existing artifacts, v2 can also temporarily write old names:

- `debugModelTier`
- `debugModelRangeText`
- `debugModelReason`

But the long-term artifact schema should distinguish v1/v2 clearly if both are compared side by side.

## 3. v2 机制设计草案

### Tier 与 point estimate 分工

Tier 仍然负责大类：

- minimum / low rotation
- rotation / specialist
- starter bands
- near-max / max borderline
- exact max

Point estimate 负责 tier 内落点：

- 先选 tier。
- 再计算 tier-local continuous score。
- 将 continuous score 映射到 range 内 percentile。
- 输出 `debugPointEstimateM`。
- Point estimate 必须 clamp 到 `debugRangeMinM` / `debugRangeMaxM`。

这样可以保留当前 range 诊断能力，同时解决“same tier but very different ask”的问题。

### 禁止规则

v2 不允许为单个 case 开特供规则：

- 不按 `pid` 写规则。
- 不按 `caseId` 写规则。
- 不写 Kai Jones-style one-off gate。
- 不写“年轻 + C + 防守 + 有篮 + pot”这种单例组合门。
- 不因为 boundary40 某一个 case 直接把某个 tier 上调或下调。

case 只能作为 evidence：

- 一个 case 可以暴露 miss pattern。
- 一个 bucket 可以提示边界问题。
- 只有当 pattern 与 anchor / validation / boundary samples 一致时，才提高机制级调整的可信度。

### 允许的机制级规则

以下机制可以作为 v2 components 或 risk flags 设计：

| mechanism                               | intent                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| young upside split                      | 把 purely speculative upside 与 已有 NBA production / role-convertible upside 拆开 |
| small guard defensive stat sanity check | 小后卫抢断/防守数据高时，检查身材、犯规、on/off、role 和样本，避免过度奖励         |
| turnover penalty capped and usage-aware | 失误惩罚要考虑 usage/creation burden，且应有上限                                   |
| role-convertible shooting package       | 对能转换到真实轮换角色的投射包给更稳定 floor，而不是只看命中率                     |
| non-scoring impact recognition          | 对防守、篮板、传球、低使用率正贡献提供非得分 impact credit                         |
| old demand proxy sanity check           | old demand 不当目标，但可提示 sandbox point ask 是否异常脱离现行 BBGM proxy        |
| trade exploit audit flag                | 标记 cheap ask + likely high trade value 的套利风险，不直接抬 ask 到 trade value   |

### Suggested component shape

`modelComponents` 可以先用简单结构，不需要一次性复杂化：

```json
{
	"baseTierScore": 0.62,
	"tierLocalScore": 0.48,
	"production": 0.55,
	"role": 0.5,
	"ageUpside": 0.35,
	"shootingPackage": 0.2,
	"defenseReboundImpact": 0.1,
	"creationLoad": 0.18,
	"turnoverPenalty": -0.06,
	"sampleRisk": -0.04,
	"oldDemandSanity": "below_proxy"
}
```

字段不必一开始全部稳定，但应结构化输出，方便 boundary40 / validation20 report 比较。

## 4. 建议最小实现步骤

### Step 1: 只在 tools/artifacts 做 sandbox v2

推荐新增 artifact-only scorer：

- `tools/contract-market-sandbox-v2.mjs`

或如果希望沿用现有命名：

- `tools/contract-market-tier-score-v2.mjs`

不要改 `src/`。

最小内容：

- 复用 `tools/contract-market-proxy-core.mjs` row fields。
- 保留 v1 `MODEL_TIERS` 或复制成 v2 ladder 草案。
- 新增 point estimate function。
- 新增 risk flag function。
- 新增 trade exploit audit flag function。

`tools/contract-market-boundary-set.mjs` 后续可以只做薄 wiring：

- 调用 v2 scorer。
- 输出 v2 debug fields。
- 保留 v1 fields 用于 diff。

### Step 2: rerun boundary40 + validation20

重新生成 artifact 层结果：

- boundary40 candidates/debug HTML/report
- boundary40 score CSV/MD
- validation20 score CSV/MD

仍然不重抽样，不把这两组当 final test。

### Step 3: 对比 v1/v2

新增或扩展 report：

- v1 range overlap vs v2 range overlap
- v2 point estimate vs human range
- severe miss count
- by bucket summary
- old demand proxy sanity summary
- trade exploit risk flag count

Point estimate scoring 应独立于 range scoring：

- range tells coverage.
- point tells ask placement.
- years/term logic separately diagnosed.

### Step 4: 人工 review

让用户审查：

- v2 point estimates 是否更接近真实 ask 直觉。
- risk flags 是否有用。
- 是否出现明显过拟合或荒谬解释。
- trade exploit risk flag 是否只做 audit，没有污染 ask。

### Step 5: 稳定后再考虑 formal src integration

只有当 sandbox v2 在 boundary / validation / anchor 上稳定后，才规划正式接入。

正式接入前还需要：

- 对应 BBGM demand API 的最小侵入设计。
- 与 old demand randomization / contract years / option logic 的关系。
- UI/debug visibility 策略。
- performance 和 save compatibility 检查。

### Step 6: 最后才做 unseen test set

在机制稳定前不要做 final test set。

推荐顺序：

1. anchor / boundary / validation 做机制收敛。
2. 用户确认 v2 behavior。
3. freeze sandbox rules。
4. 抽 unseen test set。
5. 只评估，不再用 test set 改规则。

## 5. 风险和待确认

### 数据字段可靠性

相对可靠、可作为 v2 初始输入：

- age
- ratings/composites
- season stats with minutes/games context
- `minContractForPlayer`
- `eligibleMax`
- `salaryCap`
- `getContractValue`
- `estimatedDemandNoRandom` as old-demand sanity reference only
- current no-option contract amount/years as historical/current contract context

需要谨慎使用：

- on/off：样本与阵容强依赖，容易 noisy。
- 小样本 BPM / VORP / EWA：需要 games/minutes context。
- guard defensive stats：steal/block/rebound 对小后卫可能高估真实防守。
- high potential with little production：容易制造 trade-exploit risk，但不应直接等同高 ask。
- old demand proxy：可做 sanity signal，不应作为 target。

### 机制过拟合风险

高风险区域：

- young upside split 如果写成特定身高/位置/投射组合，容易变成单例门。
- small guard defense sanity 如果过强，可能压低真实高 impact 后卫。
- turnover penalty 如果不考虑 usage，会系统性低估持球创造者。
- role-convertible shooting 如果只看 3P%，会奖励低 volume 假投手。
- trade exploit audit 如果进入 ask formula，会把 trade value 错当 contract demand。

### 用户判断点

需要用户确认：

- human amount 是 ask target、sign willingness、asset/trade risk 的混合判断，正式 scoring 应如何分层解释。
- point estimate 是希望接近 human willingness，还是希望偏向 market ask。
- high upside low production 球员应更多表现为 high risk flag，还是更高 ask。
- old demand proxy 与 sandbox ask 分歧多大时应触发 sanity warning。
- exact max 与 near-max borderline 的区分标准。

## Recommended first implementation entry

推荐从新增 `tools/contract-market-sandbox-v2.mjs` 开始，而不是直接改正式 `src/`。

原因：

- 可以复用 `tools/contract-market-proxy-core.mjs` 的 row schema。
- 可以在 `tools/contract-market-boundary-set.mjs` 中最小 wiring。
- 可以同时跑 boundary40 和 validation20。
- 可以保留 v1/v2 side-by-side debug，避免把 calibration 改动误认为正式结论。

如果不新增文件，第二选择是在 `tools/contract-market-tier-score.mjs` 中新增 v2 exports，但这会让 v1/v2 混在同一文件里。为了清晰对比，独立 v2 module 更稳。
