# BBGM Contract Market Boundary40 诊断报告

## 0. 结论摘要

Boundary40 现在不应该被当成 final test。它的用途是 calibration/challenge diagnosis：用人工判断和 debug model 输出去定位合同估值机制的结构性偏差。

当前 labeled 样本为 28/40，A-C 共 12 个样本为空，应继续按 missing/skip 处理。基于当前金额区间的粗评分是：overlap 17/28，too_low 11/28，too_high 0/28。这个数字只能说明“debug tier/range 与人工金额区间是否重叠”，不能说明最终合同模型准确，因为目前 debug 输出主要是宽区间，不是精确 ask。

最重要的诊断不是“哪些球员错了”，而是下面这几个机制问题：

1. 当前 debug model 仍是 tier ladder，不是合同 ask 模型。`$9.28M-$18.56M`、`$26.29M-$34.80M` 这种区间太宽，只能做大档位诊断，不能直接用于实装。
2. 中端合同区间的结构性问题最大，尤其是 4-8、8-12、12-18、18-25、25-35 之间缺少连续 point estimate。
3. young upside bucket 太粗：年轻、有 pot、但当前已经有一定产量/可用技能的球员，被和“只有潜力但当前不稳”的球员混在一起。
4. turnover、role、archetype 的惩罚疑似存在断崖：失误多应该扣，但不能把有真实得分/创造能力的轮换或第六人直接打成 minimum。
5. 小后卫/后卫高阶数据需要 position sanity check：不能机械相信小后卫的 BPM、DBPM、on-off 防守价值。
6. 非得分型高影响力球员需要被识别：防守、组织、篮板、护框、多位置影响力如果有足够证据，不应被低 usage 或投篮缺陷直接压低。
7. old/current BBGM demand proxy 有时比 debug range 更接近人工判断，有时明显过高；它不能作为答案，但应作为 sanity check。
8. trade-value arbitrage 是独立风险：合同 ask 不应该因为“当前 trade value 高”而抬价，但合同模型和交易模型必须基于同一套真实价值观，否则会出现 cheap signing -> high-value flipping 的 exploit。

## 1. 关键定义

### 1.1 Human target

Human target 是用户在 blind/debug review 中填的目标金额。它不是严格意义上的市场均值，也不是最终合同公式答案。它混合了用户对以下因素的判断：

- 当前比赛影响力；
- 年龄和未来发展；
- 属性分配是否真的好用；
- 角色可用性；
- 交易价值/倒卖风险的直觉；
- 对 BBGM 当前机制的经验判断。

后续使用这些 notes 时必须注意：用户已经明确修正过一个原则——**交易价值不应该作为合同 ask 的直接加价理由。** 如果一个球员只是因为当前 BBGM trade system 高估他而显得有交易价值，这应该暴露 trade value 系统的问题，而不是让合同 ask 被迫抬高。

### 1.2 Debug range

Debug range 是当前 sandbox/debug model 的档位金额区间。它更像“该球员被模型归进了哪个 tier”，不是最终精确报价。例如：

- `LOW_END_STARTER => $9.28M-$18.56M`
- `YOUNG_PROVEN_STARTER => $26.29M-$34.80M`
- `STAR_NEAR_MAX => $40.83M-$46.40M`

因此现在的 overlap 只能判断大档位是否接近，无法判断点估计是否正确。

### 1.3 Old demand proxy

`Demand / Cap` 是 old/current BBGM demand proxy。它不是 debug model prediction。它有时明显过高，例如部分 D/F/G 组球员；也有时比 debug 更接近 human target，例如 Jović、Ben Simmons 等。后续应把它作为 sanity feature，而不是替代模型。

## 2. 明确不能学到什么

这一节比 failure modes 更重要，因为它限制过拟合。

### 2.1 不能为单个球员开门

Boundary40 中的球员只能作为证据，不能成为规则。尤其是 Kai Jones 这种 case，不能写成：

> 年轻 + C + 防守好 + 有篮 + 有潜力 => 自动抬高到 30M+

这会过拟合。正确抽象应是：

> 模型需要区分“真实可转化的年轻潜力”和“只被 OVR/POT 抬高、但实际产出/技能结构不稳的潜力”。

### 2.2 不能把 young upside 简化成“年轻就加钱”

Jović、Strawther、Sharpe、Wells 都指向年轻潜力被低估，但 Okoro、部分 low-rotation 年轻人也提醒我们：年轻不是充分条件。必须同时看到可转化产出、角色、技能包、效率、位置/体型、发展空间和当前影响力。

### 2.3 不能机械相信小后卫高阶数据

Yogi Ferrell 是一个正面 sanity case：debug 不需要大幅上调，old demand 反而偏高。用户明确指出小后卫的防守端高阶数据不应被机械相信。正确机制是 position-specific sanity，而不是“BPM 正就加价”。

### 2.4 不能取消 turnover 惩罚

Musa、Jović 的 notes 都提到 turnover。问题不是 turnover 不重要，而是现在 debug 可能让 turnover 或某个 archetype penalty 造成断崖式降档。正确方向是：turnover penalty 要和 usage/creation burden/role 一起看，并设置上限。

### 2.5 不能把 current trade value 直接塞进 ask

这是最重要的系统设计约束。合同 ask 的目标不是“堵住当前交易系统 exploit”而机械跟随 trade value。正确做法是：

- 合同 ask 估计真实市场价格；
- trade value 估计真实资产价值 minus 合同负担；
- 两者应共享真实价值观；
- 如果低 ask + 高 trade value 形成套利，应诊断合同模型低估、交易模型高估，或引入交易冷却/折价，而不是直接把 ask 拉到 trade value。

## 3. Generalizable failure modes

### 3.1 Failure Mode A：宽 tier range 缺少 point estimate

**现象。** 很多 overlap case 其实仍然无法判断。例如 `LOW_END_STARTER $9.28M-$18.56M` 覆盖 9M 以上，F-02、F-03、F-04、G-01、G-02、G-03 都可能 overlap，但 9M、13M、18M 是完全不同的合同决策。

**逻辑。**

1. 如果模型只输出 tier range，它只能回答“是不是大体在这一档”。
2. 合同 ask 需要回答“具体应该开多少 AAV、几年”。
3. 当 range 跨度过大时，overlap 会虚高，因为人类 10-16、12-18、15-20 都能和同一个 debug range 重叠。
4. 所以当前 17/28 overlap 不能当作足够准确。

**修正方向。** 保留 tier 作为解释层，但必须增加 point estimate：

- 每个 tier 有 min/base/max；
- 根据 continuous component score 决定落点；
- 输出 `debugTier + debugRange + debugPointEstimate + debugYears + debugReason`。

### 3.2 Failure Mode B：young upside bucket 太粗

**现象。** D-03、E-02、E-04、F-01 都体现了 young upside 被粗放压低。它们并不完全相同：有人已经有稳定产量，有人有真实投篮，有人有身体爆发，有人只是 pot 高但当前一般。

**逻辑。**

1. 年轻潜力不是单一维度。
2. `age + pot` 只能说明 future optionality，不能说明当前市场价格。
3. 但如果年轻球员已经有 rotation minutes、正向高阶、得分/投篮/组织/防守中至少一个可转化技能，就不该只落到 minimum-ish young suspect。
4. 反过来，如果只是 OVR/POT 高、效率差、属性分配不好、角色不可转化，则不能抬价。

**修正方向。** young upside 至少拆成三类：

- `young_unproven_suspect`：只有 pot，当前影响力/角色不稳；
- `young_rotation_with_skill`：有轮换时间和一个可转化技能；
- `young_productive_upside`：有年龄优势 + 当前正向产量/影响力 + 可增长技能。

### 3.3 Failure Mode C：productive bench scorer / sixth-man floor 过低

**现象。** Musa、Beasley、Strawther、Jović 这类球员不是无风险，但如果有真实得分能力、可上场时间、正向或接近正向影响力，不应该被直接打成 minimum。

**逻辑。**

1. 第六人/替补 scorer 经常有防守或失误缺陷。
2. 缺陷应影响上限和年限，而不是直接让 AAV 掉到底薪。
3. 如果球员能在常规赛稳定消化 usage、提供得分/投篮/创造，市场不会完全按 replacement 付费。
4. 但如果效率差、TS 低、功能单一，则 point estimate 应靠近下沿。

**修正方向。** 新增/强化 `productive_bench_scorer_floor`，但必须有条件：

- minutes >= rotation threshold；
- usage/points/shot creation 或 shooting package 至少一项真实；
- EWA/VORP/BPM 不应完全 replacement；
- turnover/TS/defense 决定落点，而不是触发直接 minimum。

### 3.4 Failure Mode D：turnover penalty 需要 usage context 和 cap

**现象。** Musa 的 debug range 是 minimum-level，但用户认为失误多只是把他压到 12M 左右，而不是让他变成 3M 球员。Jović 也有 turnover 顾虑，但用户仍认为 debug 过低。

**逻辑。**

1. 失误对低 usage 角色球员和高 usage creator 的含义不同。
2. 高 usage creator 的失误需要看 AST%、usage、得分责任和球队角色。
3. 低 usage 球员失误多通常更致命，因为他没有创造价值抵消。
4. 因此 turnover penalty 不应是固定扣分，也不应造成断崖降档。

**修正方向。**

- 计算 turnover burden relative to usage/AST；
- penalty 设上下限；
- 对 creator 使用 ratio penalty，对 non-creator 使用 stronger penalty；
- penalty 主要影响 point estimate 和 years，不应轻易跨多个 tier。

### 3.5 Failure Mode E：small guard high-stat inflation sanity

**现象。** Yogi Ferrell 有正向 BPM、EWA、低 turnover，但用户认为小后卫的防守端正面数据不应完全相信，old demand 明显偏高。

**逻辑。**

1. 小后卫的 DBPM/on-off 容易受到阵容、替补对位、样本和 steal-driven box score 的影响。
2. 如果缺少身高、对抗、防守属性、starter role 支撑，防守端高阶数据应打折。
3. 这不是否定小后卫价值，而是避免小后卫因为 box-score/high-order noise 被过高估值。

**修正方向。**

- 对 PG/G 小后卫设置 defensive impact sanity；
- 防守加分需要身高/力量/防守属性/steal之外证据；
- on-off 不作为强单独信号；
- 小后卫正向高阶更应影响 floor，而不是直接推高 ceiling。

### 3.6 Failure Mode F：role-convertible shooting valuation

**现象。** Strawther、Beasley、Keegan 等 case 都涉及“有篮”。但用户明确区分了：不是有三分就加价，而是要看中投/三分/产量/TS/offensive IQ/年龄/角色。

**逻辑。**

1. shooting value 必须能转化成上场价值。
2. 单一 3pt rating 不够；需要看真实产量、效率、技能组合和角色。
3. 中投+三分+offensive IQ 的组合，比单纯 spot-up rating 更能支撑进攻角色。
4. 但 TS 低、防守差、失误多会压上限。

**修正方向。**

- 构建 `portable_shooting_score`；
- 不只使用 3pt rating，也看 scoring production、TS/eFG、offensive IQ、usage、age；
- shooting 影响 floor/fit，不能单独制造 high-starter value。

### 3.7 Failure Mode G：non-scoring impact recognition

**现象。** Ben Simmons 被 debug 打到 low-end starter，是最明显的 high-impact non-scorer miss。用户指出他的防守存在感和 BPM 极强，即使进攻伤害需要商榷，也不该被压低。

**逻辑。**

1. 合同价值不只来自得分。
2. 防守、组织、篮板、护框、多位置能力、转换推进都可能形成高影响力。
3. 但 non-scoring impact 也需要证据，不应凭 reputation。
4. 如果 MPG、starter share、BPM/EWA/VORP、awards、ratings 同时支持，应允许进入高合同区间。
5. 进攻伤害、投篮缺陷、季后赛适配风险仍然要压 point estimate 和 years。

**修正方向。**

- 新增 `non_scoring_impact_score`；
- 使用 defensive awards、DBPM/BPM、passing/rebounding/defense composites、MPG/starter share；
- 对 spacing/offense damage 设置扣分；
- 输出 risk flag，而不是直接打到底。

### 3.8 Failure Mode H：old demand proxy 应作为 sanity feature

**现象。** old demand 对 D/G/F 一些球员偏高，但在 Jović、Ben Simmons、部分 H/I/J 近似更接近 human target。

**逻辑。**

1. 旧 demand 不是答案，但包含 BBGM 原系统的某些 useful signal。
2. Debug model 如果和 old demand 差距极大，必须能解释原因。
3. 如果解释不了，应该触发 review flag。
4. 这比完全丢弃旧 demand 更安全。

**修正方向。**

- 输出 `oldDemandGapFlag`；
- debug point 与 old demand 差距过大时记录 reason；
- old demand 只能参与 sanity/review，不直接决定 ask。

### 3.9 Failure Mode I：trade-value arbitrage risk

**现象。** 用户指出，有些球员当前 BBGM 交易系统可能因为 high OVR/POT/value 高估他们，但他们实际不好用、合同性价比不高。合同 ask 降低后，玩家能 cheap sign 然后高价交易，形成 exploit。

**逻辑。**

1. 合同模型修真实后，某些球员 ask 会下降。
2. 如果交易系统仍按 OVR/POT/value 高估他们，签约合同会变成正资产。
3. 玩家会系统性低价签约再倒卖。
4. 因此合同模型和交易模型必须共享“真实价值”的判断基础。
5. 但合同 ask 不应该因为当前 trade value 高而加价；那只是把另一个系统的错误转嫁给合同系统。

**修正方向。**

- v2/v3 输出 `tradeExploitRiskFlag`；
- 标记 high OVR/POT/value + low ask + low actual impact/bad archetype 的球员；
- 后续单独做 trade value audit；
- 可选机制：re-sign 后短期交易折价、AI 对 newly signed contract 的评估冷却、trade value 采用 same component scores。

## 4. Evidence table

下表中的 case 是证据，不是规则。每一行都必须先抽象成 mechanism，再进入 revision plan。

| case | player                   | human view                       | debug range     | old demand | range result                         | generalizable signal                                                 | do-not-overfit guardrail                                                      |
| ---- | ------------------------ | -------------------------------- | --------------- | ---------- | ------------------------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| D-01 | Simisola Shittu          | 3-5                              | $2.94M-$3.38M   | $12.73M    | overlap                              | 低端 specialist 可以保持低价；old demand 明显偏高。                  | 不要因为一个防守/冠军标签就抬整组。                                           |
| D-02 | Jordan Poole             | 6-10                             | $3.09M-$5.41M   | $16.04M    | too_low                              | 年轻、可轮换、有技能，debug 偏低；old demand 偏高。                  | 不能把当前 trade value 当合同定价理由。                                       |
| D-03 | Jaylen Wells             | 8-14                             | $3.87M-$6.96M   | $13.84M    | too_low                              | 年轻+pot+轮换样本被粗暴归入低价 young suspect。                      | 不是所有高 pot 年轻人都要抬价；需要可转化产出。                               |
| D-04 | Keegan Murray            | 4-8                              | $5.41M-$8.51M   | $9.54M     | overlap                              | specialist tier 可覆盖部分低中端射手/空间型角色。                    | 不能把所有 shooter 都抬到 10M+。                                              |
| E-01 | Yogi Ferrell             | 8-12                             | $6.19M-$9.28M   | $18.43M    | overlap                              | 小后卫高阶数据需防守 sanity；debug 接近，old demand 偏高。           | 不要机械相信小后卫 DBPM/BPM/on-off 防守价值。                                 |
| E-02 | Nikola Jović             | 原20-30；用户修正倾向15-25       | $3.87M-$6.96M   | $19.94M    | too_low / severe                     | 年轻前场、正 BPM/VORP/EWA、有产量与投篮，debug 明显过低。            | 不是“Jović 专门加价”；是 young productive wing/forward 不能只落 low-suspect。 |
| E-03 | Malik Beasley            | 原6-10；用户修正倾向6-8          | $3.37M-$3.88M   | $18.74M    | too_low                              | 真实能上场的 shooting/rotation value 不应接近 minimum。              | TS/效率低、功能单一要限制上沿。                                               |
| E-04 | Julian Strawther         | 原12-18；用户修正倾向10-15       | $3.87M-$6.96M   | $17.51M    | too_low                              | 年轻、有投篮包、中投+三分+offensive IQ，debug 低估。                 | 不能“有篮就高价”；必须结合产量、年龄、角色。                                  |
| F-01 | Shaedon Sharpe           | 原20-30；用户修正倾向15-25       | $9.28M-$18.56M  | $19.95M    | too_low by range edge                | low-end starter range 太宽；年轻得分产量应靠近上沿。                 | 不能自动把所有年轻得分手推到 25M+。                                           |
| F-02 | Mfiondu Kabengele        | 10-16                            | $9.28M-$18.56M  | $19.71M    | overlap                              | debug 大档位命中，但需要 point estimate 才知道 10、14、18 哪个合理。 | 不要只因 overlap 认为已解决。                                                 |
| F-03 | Isaac Okoro              | 15-20；用户承认可能偏高          | $9.28M-$18.56M  | $19.61M    | overlap                              | 防守好、年轻、OVR 不低，但无进攻；模型可能更合理。                   | 不要“年轻+防守”自动抬价。                                                     |
| F-04 | Kentavious Caldwell-Pope | 6-12；用户修正可能8-12/8-14      | $9.28M-$18.56M  | $20.68M    | overlap but upper risk               | 老将 3D 有市场，但年龄/无潜力/年限应压上沿。                         | 不要把所有 low-end starter 都给长约或接近 18M。                               |
| G-01 | Jordan Bell              | 12-20                            | $9.28M-$18.56M  | $24.76M    | overlap                              | 防守/篮板型 C 可以落中档，但 old demand 偏高风险存在。               | 不要因为防守荣誉历史自动顶高。                                                |
| G-02 | Isaiah Stewart           | 原20-25；用户修正倾向15-20       | $9.28M-$18.56M  | $24.81M    | too_low by original; near if revised | 年轻防守大个，debug 若落上沿可接受；range 太粗。                     | 不要“年轻防守内线”自动 20M+。                                                 |
| G-03 | OG Anunoby               | 12-18                            | $9.28M-$18.56M  | $24.60M    | overlap                              | 低端/solid starter 范围可覆盖 3D forward。                           | old demand 可能偏高，不能照抄。                                               |
| G-04 | Džanan Musa              | 12-18；用户倾向约12下沿          | $3.15M-$3.62M   | $25.03M    | too_low / severe                     | 失误多应扣，但有真实得分/第六人能力不能被打成 minimum。              | 不要取消 turnover 惩罚；要让 penalty 有上限并与 usage 交互。                  |
| H-01 | Kevin Knox               | 25-35                            | $26.29M-$34.80M | $30.91M    | overlap                              | good/high starter 大档位可行。                                       | 此类 overlap 不证明 mid-tier 全部可靠。                                       |
| H-02 | Ben Simmons              | 30-35                            | $9.28M-$18.56M  | $30.99M    | too_low / severe                     | 非得分高影响力、防守/组织/全能型被低估。                             | 不是给 Simmons 特权；是 non-scoring impact recognition。                      |
| H-03 | LaMelo Ball              | 35-40                            | $26.29M-$34.80M | $30.81M    | too_low                              | 年轻核心持球产量+荣誉履历应接近 near-max/max 边界。                  | 不要只因 counting stats 自动 max；需荣誉、效率、影响力、年龄共同触发。        |
| H-04 | Kai Jones                | 原35-40；用户修正倾向30-35/30-40 | $26.29M-$34.80M | $30.67M    | too_low by original; near if revised | 年轻稀缺前场 case 是证据，但样本不可转成特供规则。                   | 禁止写“年轻空间C+防守+pot => 加价”这种门。                                    |
| I-01 | Saben Lee                | 46.40                            | $40.83M-$46.40M | $37.98M    | overlap                              | near-max/max boundary 大体可覆盖。                                   | 不要因 I/J overlap 忽略中段问题。                                             |
| I-02 | Josh Giddey              | 38.66                            | $34.02M-$38.66M | $37.63M    | overlap                              | eligible max 边界处理可行。                                          | 仍需 point estimate 与 years。                                                |
| I-03 | Patrick Williams         | 46.40                            | $40.83M-$46.40M | $38.49M    | overlap                              | near-max 大档位可覆盖。                                              | old demand 可能低于 max；不能只看旧 demand。                                  |
| I-04 | Trae Young               | 44-46.40                         | $40.83M-$46.40M | $36.62M    | overlap                              | basically max/near max 识别可接受。                                  | 需要处理 max vs near-max 的 years/option，不只是 AAV。                        |
| J-01 | Justin Champagnie        | 46.40                            | $40.83M-$46.40M | $43.01M    | overlap                              | star/max lock 覆盖。                                                 | 不要把 J 组当 final accuracy。                                                |
| J-02 | Scottie Barnes           | 46.40                            | $40.83M-$46.40M | $40.39M    | overlap                              | star/max lock 覆盖。                                                 | 同上。                                                                        |
| J-03 | Joshua Primo             | 46.40；FMVP note                 | $40.83M-$46.40M | $40.23M    | overlap                              | FMVP/顶级荣誉应强烈推动 max。                                        | 不要只因单个奖项忽略年龄/当前状态；但 FMVP 是强信号。                         |
| J-04 | Luka Dončić              | 46.4                             | $40.83M-$46.40M | $38.81M    | overlap                              | max lock 应被覆盖。                                                  | 无。                                                                          |

## 5. 对当前 scoring 的解释

当前 boundary40 scoring 不能直接被解释为“模型 17/28 正确”。更准确的解释是：

- 17 个 overlap：debug 大档位与 human range 有交集，但其中很多仍然因为 range 太宽而信息不足。
- 11 个 too_low：几乎没有 too_high，说明当前 sandbox debug model 对 labeled D-H 中段球员存在系统性偏保守。
- severe 主要暴露断崖错误：Jović、Musa、Ben Simmons 分别指向 young productive forward、turnover-cliff scorer、non-scoring defensive/connector impact。
- I/J max 段大体 overlap，但不能掩盖中段问题；max 段本身更容易因为 eligible max 上限而 overlap。

## 6. 优先级排序

### P0：防过拟合原则

任何 revision 都必须满足：

1. 不为单一球员写条件。
2. 不把 case name / pid / exact player archetype 写进 rule。
3. 不因一个 case 就增加一个独立 gate。
4. 每个新机制必须解释至少一类 failure mode，并有反例约束。
5. 每个正向加分必须有风险扣分或上限。

### P1：引入 point estimate

这是最高优先级机制改造。没有 point estimate，合同 ask 不能实装。

建议输出：

- `debugTier`
- `debugRange`
- `debugPointEstimate`
- `debugYears`
- `debugReason`
- `riskFlags`

### P1：重构 young upside

需要区分：

- 纯潜力；
- 可轮换年轻技能球员；
- 已有正向产量的年轻球员；
- OVR/POT 好看但实际不可转化的球员。

### P1：处理断崖式低估

必须重点检查：

- turnover penalty；
- young suspect fallback；
- minimum fall-through；
- defense/offense archetype exclusions；
- non-scoring impact 是否被误杀。

### P2：trade exploit audit

这不应阻塞合同 v2 sandbox，但必须进入正式实装前 checklist。

## 7. 推荐下一步

下一步不是创建 test set。应按以下顺序：

1. 固化本 diagnosis。
2. 让 Codex/K 基于本 diagnosis 写 implementation plan，而不是重新解释价值判断。
3. 实现 sandbox v2，不改正式 `src`。
4. v2 输出 point estimate + risk flags。
5. 重跑 boundary40 + validation20。
6. 如果 v2 在 calibration/challenge sets 上表现稳定，再创建 unseen test set。
