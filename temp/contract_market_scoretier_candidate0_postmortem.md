# candidate_0 scoreTier postmortem

这份报告只解释上一版 first-layer candidate dry-run。它不提出 candidate_1，不改规则，不改 `src/`，不改正式 `scoreTier`，不重写已有 score CSV。candidate_0 是 calibration dry-run，不是 final test。

## 结论先行

- candidate_0 不可实装：no。
- 全 active pool 从 current 到 candidate 是单向膨胀：276 人升级，0 人降级。
- `HIGH_IMPACT_STARTER` 从无到 75 人，占 all-active 11.8%；它吸走了 current `LOW_END_STARTER` 41 人和 `YOUNG_PROVEN_STARTER` 24 人。
- labeled 48 没有支持这版：mean gap 从 2.46M 变 3.06M，severe 从 4 变 6，too_high 从 7 变 20。
- cap-budget sanity 也显示膨胀：all-active midpoint implied cap 从 2787.5% 到 4357.3%，增量 1569.8%；contract-relevant 从 1053.8% 到 1489.9%，增量 436%。这不是机械 salary-cap violation 判断，只是相对 current baseline 的 market burden 警报。

## 1. candidate_0 到底改了什么

完整 rule diff 已输出到 `contract_market_artifacts/contract_market_scoretier_candidate0_rule_diff.csv`。摘要如下：

| tier                   | change                                        | hard veto                                                                                               | support threshold         | range                         |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------- |
| SUPERSTAR_MAX          | unchanged                                     | unchanged current all-AND gate                                                                          | n/a                       | 100-100% eligible max         |
| STAR_NEAR_MAX          | unchanged                                     | unchanged current all-AND gate                                                                          | n/a                       | 88-100% eligible max          |
| HIGH_IMPACT_STARTER    | new / relaxed vs current starter gates        | GP>=40; MPG>=25; valueNoPot>=55; not PER<8 && BPM<-3; not TS<.49 && OBPM<-2                             | >=3.25 support points     | 17-22.5% cap (candidate-only) |
| YOUNG_PROVEN_STARTER   | relaxed / broadened                           | GP>=35; MPG>=18; valueNoPot>=50; not PER<8 && BPM<-3                                                    | >=4.25 support points     | 17% cap-22.5% cap             |
| SOLID_STARTER          | new / broad bridge                            | GP>=40; MPG>=22; valueNoPot>=53; not PER<8 && BPM<-3                                                    | >=3.75 support points     | 12-17% cap (candidate-only)   |
| HIGH_END_ROTATION      | new                                           | GP>=35; MPG>=16; valueNoPot>=50; not PER<8 && BPM<-3                                                    | >=3.25 support points     | 7-12% cap (candidate-only)    |
| LOW_END_STARTER        | relaxed                                       | GP>=35; MPG>=20; valueNoPot>=51; not PER<8 && BPM<-3                                                    | >=3.5 support points      | 6% cap-12% cap                |
| SPECIALIST_ROTATION    | relaxed / broadened                           | GP>=35; MPG>=10                                                                                         | >=3.5 support points      | 3.5% cap-5.5% cap             |
| YOUNG_UPSIDE_SUSPECT   | kept but shadowed by earlier candidate lanes  | current gate                                                                                            | n/a                       | 2.5% cap-4.5% cap             |
| VETERAN_ROTATION_GUARD | kept but shadowed by earlier candidate lanes  | current gate                                                                                            | n/a                       | 4% cap-6% cap                 |
| LOW_ROTATION_PLUS      | relaxed fallback                              | fallback has no GP/MPG/value hard veto beyond support threshold; only one signal checks poor production | >=2.5 of 3 support points | 2% cap-3.5% cap               |
| VETERAN_MINIMUM_PLUS   | kept but shadowed                             | current gate                                                                                            | n/a                       | player minimum-3.5% cap       |
| MINIMUM_LEVEL          | tightened fallthrough by broad upstream lanes | reported fallback vetoes MPG<8, GP<25, valueNoPot<49, poor production; not used as an entry gate        | n/a                       | 1x-1.15x player minimum       |

关键变化不是 max/star，而是中段：新增 `HIGH_IMPACT_STARTER`、`SOLID_STARTER`、`HIGH_END_ROTATION`，放松 `YOUNG_PROVEN_STARTER`、`LOW_END_STARTER`、`SPECIALIST_ROTATION`，并新增一个更宽的 `LOW_ROTATION_PLUS` fallback。

## 2. 为什么 HIGH_IMPACT_STARTER = 75

`HIGH_IMPACT_STARTER` hard veto 是：GP>=40、MPG>=25、valueNoPot>=55、不能是 PER<8 且 BPM<-3、不能是 TS<.49 且 OBPM<-2。all-active 中 127 人先通过这些硬门槛，最后 75 人达到 >=3.25 support points。

Support signal 命中：

| signal                                | entrants passing | % of 75 | hard-veto pool context                                  |
| ------------------------------------- | ---------------- | ------- | ------------------------------------------------------- |
| full or established starter-like role | 73               | 97.3%   | 125 of 127 hard-veto-pass players also pass this signal |
| contractValue >= 60                   | 48               | 64.0%   | 70 of 127 hard-veto-pass players also pass this signal  |
| valueNoPot >= 59                      | 55               | 73.3%   | 80 of 127 hard-veto-pass players also pass this signal  |
| current impact production             | 73               | 97.3%   | 100 of 127 hard-veto-pass players also pass this signal |
| non-scoring connector/defense         | 70               | 93.3%   | 95 of 127 hard-veto-pass players also pass this signal  |

主要 signal combination：

| signal combination                                                                                                                     | count | % of 75 |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------- |
| full or established starter-like role; contractValue >= 60; valueNoPot >= 59; current impact production; non-scoring connector/defense | 41    | 54.7%   |
| full or established starter-like role; current impact production; non-scoring connector/defense                                        | 20    | 26.7%   |
| full or established starter-like role; valueNoPot >= 59; current impact production; non-scoring connector/defense                      | 7     | 9.3%    |
| full or established starter-like role; contractValue >= 60; valueNoPot >= 59; current impact production                                | 3     | 4.0%    |
| contractValue >= 60; valueNoPot >= 59; current impact production; non-scoring connector/defense                                        | 2     | 2.7%    |
| full or established starter-like role; contractValue >= 60; valueNoPot >= 59                                                           | 2     | 2.7%    |

来源 current tier：

| current tier           | count | % of 75 |
| ---------------------- | ----- | ------- |
| LOW_END_STARTER        | 41    | 54.7%   |
| YOUNG_PROVEN_STARTER   | 24    | 32.0%   |
| MINIMUM_LEVEL          | 4     | 5.3%    |
| VETERAN_ROTATION_GUARD | 2     | 2.7%    |
| VETERAN_MINIMUM_PLUS   | 2     | 2.7%    |
| YOUNG_UPSIDE_SUSPECT   | 2     | 2.7%    |

归因：candidate_0 把“已有强 role + current value/valueNoPot + 任一 impact/connector”组合放在年轻、低端 starter、veteran guard 等 lane 之前，因此它不是修补少数漏档，而是变成了一个大吸附层。

## 3. transition 归因

主要 all-active movement：

| current tier           | candidate tier       | count | % of current | steps |
| ---------------------- | -------------------- | ----- | ------------ | ----- |
| MINIMUM_LEVEL          | LOW_ROTATION_PLUS    | 79    | 17.2%        | 2     |
| MINIMUM_LEVEL          | LOW_END_STARTER      | 46    | 10.0%        | 6     |
| LOW_END_STARTER        | HIGH_IMPACT_STARTER  | 41    | 65.1%        | 4     |
| YOUNG_PROVEN_STARTER   | HIGH_IMPACT_STARTER  | 24    | 100.0%       | 1     |
| LOW_END_STARTER        | SOLID_STARTER        | 14    | 22.2%        | 2     |
| MINIMUM_LEVEL          | SPECIALIST_ROTATION  | 13    | 2.8%         | 5     |
| MINIMUM_LEVEL          | SOLID_STARTER        | 8     | 1.7%         | 8     |
| LOW_END_STARTER        | YOUNG_PROVEN_STARTER | 7     | 11.1%        | 3     |
| YOUNG_UPSIDE_SUSPECT   | YOUNG_PROVEN_STARTER | 6     | 23.1%        | 5     |
| YOUNG_UPSIDE_SUSPECT   | SPECIALIST_ROTATION  | 4     | 15.4%        | 1     |
| VETERAN_ROTATION_GUARD | SOLID_STARTER        | 4     | 28.6%        | 5     |
| VETERAN_ROTATION_GUARD | LOW_END_STARTER      | 4     | 28.6%        | 3     |
| MINIMUM_LEVEL          | HIGH_IMPACT_STARTER  | 4     | 0.9%         | 10    |
| MINIMUM_LEVEL          | YOUNG_PROVEN_STARTER | 3     | 0.7%         | 9     |
| MINIMUM_LEVEL          | HIGH_END_ROTATION    | 3     | 0.7%         | 7     |

指定 movement 的 signal combination 见 `contract_market_artifacts/contract_market_scoretier_candidate0_lane_hits.csv` 的 `transition_signal_combination` section。短结论：

- `LOW_END_STARTER -> HIGH_IMPACT_STARTER` 41 人：大多同时命中 starter-like role、valueNoPot/contractValue、current impact 或 connector/defense。current 低端 starter 的很多人本来就满足 role/value，candidate_0 的 3.25 threshold 让他们自然上浮。
- `YOUNG_PROVEN_STARTER -> HIGH_IMPACT_STARTER` 24 人：全部被吸走，因为 high-impact lane 排在 young lane 前面，而且 current young-proven 通常已满足 MPG/GP/value/impact 硬门槛。
- `MINIMUM_LEVEL -> LOW_ROTATION_PLUS` 79 人：来自 fallback 的 `real role + valueNoPot>=49 + not extreme poor production`，>=2.5/3 事实上要求三项全中，但门槛仍比 current `smallButRealRole + age<30 + valueNoPot>=50 + !poorProduction` 更宽。
- `MINIMUM_LEVEL -> LOW_END_STARTER` 46 人：来自 softened starter-ish lane，GP>=35、MPG>=20、valueNoPot>=51 再配 role/starts/value/production 3.5 points，说明 current minimum 中有一批“有分钟和 starts 但旧 gate 没认”的球员被一次性抬到 6%-12% cap。
- `MINIMUM_LEVEL -> SOLID_STARTER/HIGH_IMPACT_STARTER` 合计 12 人：这是最强的不安全信号。若 current minimum 能直接进入 12%-17% 或 17%-22.5% cap，说明中段 weighted support 缺少足够的 role quality、production floor 或 old-demand sanity brake。

## 4. cap-budget sanity

方法：对每个 pool 同时计算 current 与 candidate 的 tier count、单人平均 tier min/mid/max cap%、总 implied min/mid/max cap%、每 30 队 midpoint burden，并用 current distribution 作为 baseline。all-active pool 会超过正式 roster，球队也可 over cap，所以这里不要求 <=100%；重点看 candidate 相对 current 是否显著增加。

| pool               | model     | count | total min cap | total mid cap | total max cap | mid per 30 teams | delta vs current |
| ------------------ | --------- | ----- | ------------- | ------------- | ------------- | ---------------- | ---------------- |
| all_active         | current   | 634   | 2377.3%       | 2787.5%       | 3197.7%       | 92.9%            | 0%               |
| all_active         | candidate | 634   | 3684.8%       | 4357.3%       | 5029.8%       | 145.2%           | 1569.8%          |
| rostered_active    | current   | 460   | 1990.5%       | 2356.2%       | 2721.9%       | 78.5%            | 0%               |
| rostered_active    | candidate | 460   | 3238.3%       | 3860.3%       | 4482.4%       | 128.7%           | 1504.1%          |
| contract_relevant  | current   | 322   | 914.8%        | 1053.8%       | 1192.8%       | 35.1%            | 0%               |
| contract_relevant  | candidate | 322   | 1278.2%       | 1489.9%       | 1701.6%       | 49.7%            | 436%             |
| top15_roster_proxy | current   | 431   | 1947%         | 2308.6%       | 2670.1%       | 77%              | 0%               |
| top15_roster_proxy | candidate | 431   | 3194.7%       | 3812.7%       | 4430.7%       | 127.1%           | 1504.1%          |

完整 tier-level cap budget 已输出到 `contract_market_artifacts/contract_market_scoretier_candidate0_cap_budget.csv`。

## 5. labeled 48 变化归因

candidate_0 在 labeled 48 上的变化：improved 9，worsened 10，tie 29；too_low 31 -> 18，too_high 7 -> 20，severe 4 -> 6。

按 candidate lane 归因：

| lane                   | count | improved | worsened | new severe | fixed severe | too_high added | too_low fixed |
| ---------------------- | ----- | -------- | -------- | ---------- | ------------ | -------------- | ------------- |
| HIGH_IMPACT_STARTER    | 15    | 4        | 4        | 2          | 2            | 7              | 6             |
| STAR_NEAR_MAX          | 11    | 1        | 0        | 0          | 0            | 0              | 0             |
| SPECIALIST_ROTATION    | 5     | 2        | 0        | 0          | 0            | 0              | 1             |
| SOLID_STARTER          | 5     | 1        | 4        | 2          | 0            | 3              | 3             |
| MINIMUM_LEVEL          | 4     | 0        | 0        | 0          | 0            | 0              | 0             |
| YOUNG_PROVEN_STARTER   | 2     | 1        | 1        | 1          | 1            | 2              | 2             |
| SUPERSTAR_MAX          | 2     | 0        | 0        | 0          | 0            | 0              | 0             |
| LOW_ROTATION_PLUS      | 1     | 0        | 0        | 0          | 0            | 0              | 0             |
| HIGH_END_ROTATION      | 1     | 0        | 1        | 0          | 0            | 1              | 1             |
| VETERAN_MINIMUM_PLUS   | 1     | 0        | 0        | 0          | 0            | 0              | 0             |
| VETERAN_ROTATION_GUARD | 1     | 0        | 0        | 0          | 0            | 0              | 0             |

解释：candidate_0 确实修了一部分 too_low，但代价是新增 too_high 和 severe。换句话说，它不是“更准”，而是整体抬高，且抬高集中在中段 starter/rotation lanes。

## 6. 结论

candidate_0 是否可实装：no。

最主要不安全原因：它是单向升级系统。candidate_0 没有对应的 downgrade/brake，且 `HIGH_IMPACT_STARTER`、softened `LOW_END_STARTER`、`LOW_ROTATION_PLUS` fallback 都会从 current lower tiers 大量吸人，导致 distribution 和 cap burden 同时膨胀。

最可疑的具体规则：

- `HIGH_IMPACT_STARTER` support threshold 3.25 太容易被 role + value + one impact signal 凑满。
- `HIGH_IMPACT_STARTER` 放在 `YOUNG_PROVEN_STARTER` 前面，导致 current young-proven 24/24 全部被吸走。
- `LOW_END_STARTER` softened lane 把 46 个 current minimum 直接抬到 6%-12% cap。
- `LOW_ROTATION_PLUS` fallback 把 79 个 current minimum 抬出 minimum，说明 real-role fallback 太宽。
- `MINIMUM_LEVEL -> SOLID_STARTER/HIGH_IMPACT_STARTER` 的 12 人说明中高段 lane 对 old floor/production/role quality 的 brake 不够。

仍可能有价值的方向：

- 增设 `SOLID_STARTER` 或类似 bridge tier 的方向可能对金额空档有价值，但需要更硬的进入条件。
- 识别 non-scoring impact、connector/defense、portable shooting 仍是合理机制，但不能靠低 threshold 直接抬大档。
- `LOW_ROTATION_PLUS` fallback 可能能修正部分底薪误杀，但需要更窄地限定 eligible pool。

下一轮改规则前需要先决定：

- 中段 tier 的目标全联盟 count / cap-budget envelope 是多少，而不是只看 labeled 48。
- `HIGH_IMPACT_STARTER` 是否应该存在，若存在应排在 young lane 前还是后。
- current minimum 可以被一次性抬升的最大档位是多少。
- 哪些 support signals 必须是 required core，哪些只能做 tie-breaker。
- 是否加入 old-demand/current-demand sanity brake，但仍不把 trade value 当合同 ask 输入。
