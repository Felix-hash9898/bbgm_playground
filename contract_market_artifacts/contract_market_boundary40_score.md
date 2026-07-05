# Boundary40 Contract Market Scoring

结论先说：boundary40 是 boundary/challenge calibration set，不是 final test。当前只应把结果当作 sandbox model 与人工目标、old/current BBGM demand proxy 的差异诊断，不应直接当成最终准确率。

输入来源：

- candidates: `contract_market_artifacts/contract_market_boundary40_candidates.csv`
- human notes source: `temp/contract_market_boundary40_human_notes (1).json`
- normalized copy written for follow-up scripts: `temp/contract_market_boundary40_human_notes.json`

用户 human amount 的含义：这些金额大体综合了用户自己愿不愿意签、球员未来发展/潜力、交易价值/倒卖风险。这里的 `Demand / Cap` 是 old/current BBGM demand proxy，不是 sandbox model prediction；sandbox model prediction 来自 candidates 的 `debugModelTier/debugModelRangeText`。

## 总览

- Total cases: 40
- Labeled cases: 28
- Missing/skipped cases: 12
- Sandbox overlap: 17/28
- Sandbox too_low: 11
- Sandbox too_high: 0
- Severe miss: 3
- Severe threshold: sandbox range 与 human range 不重叠时，边界距离 >= $8.00M 或 >= 5.0% salary cap（当前 cap $154.65M，5% cap = $7.73M）记为 severe_low / severe_high。

A-C 目前不可用于 scoring：用户从 D 组开始填，A-C 的 humanAmountRangeM 为空。空值没有当作 0，也没有猜测，全部按 missing/skip 处理。

## 是否足够支持继续改规则

足够支持继续做 sandbox 规则修正，但仍不足以当 final test。信号最集中在 mid/high bucket：`high_end_rotation_sixth_man`、`low_end_starter`、`solid_starter`、`good_high_starter`、`star_near_max` 和 J bucket（旧字段 `superstar_max_lock`，当前 label 为 upper-star/max-borderline）。当前 labeled 样本里 sandbox miss 全部是 too_low，没有 too_high；应优先修 amount ladder、starter/high-starter gap、near-max 上沿，再用 anchors + validation20 + 更多 boundary samples 复核。old demand proxy 则呈现 inside / too_low / too_high 混合，说明它是另一条需要单独诊断的旧需求口径。

## Bucket 汇总

| bucket                      | cases | labeled | missing | overlap | too_low | too_high | severe | mean signed gap M | mean abs gap M | old inside | old too_low | old too_high |
| --------------------------- | ----- | ------- | ------- | ------- | ------- | -------- | ------ | ----------------- | -------------- | ---------- | ----------- | ------------ |
| minimum_fringe_negative     | 4     | 0       | 4       | 0       | 0       | 0        | 0      |                   |                | 0          | 0           | 0            |
| minimum_plus_functional_vet | 4     | 0       | 4       | 0       | 0       | 0        | 0      |                   |                | 0          | 0           | 0            |
| low_rotation                | 4     | 0       | 4       | 0       | 0       | 0        | 0      |                   |                | 0          | 0           | 0            |
| good_rotation_specialist    | 4     | 4       | 0       | 2       | 2       | 0        | 0      | -0.41             | 0.41           | 1          | 0           | 3            |
| high_end_rotation_sixth_man | 4     | 4       | 0       | 1       | 3       | 0        | 1      | -5.05             | 5.05           | 2          | 0           | 2            |
| low_end_starter             | 4     | 4       | 0       | 3       | 1       | 0        | 0      | -0.36             | 0.36           | 2          | 0           | 2            |
| solid_starter               | 4     | 4       | 0       | 2       | 2       | 0        | 1      | -2.46             | 2.46           | 1          | 0           | 3            |
| good_high_starter           | 4     | 4       | 0       | 1       | 3       | 0        | 1      | -2.96             | 2.96           | 2          | 2           | 0            |
| star_near_max               | 4     | 4       | 0       | 4       | 0       | 0        | 0      | 0                 | 0              | 0          | 4           | 0            |
| superstar_max_lock          | 4     | 4       | 0       | 4       | 0       | 0        | 0      | 0                 | 0              | 0          | 4           | 0            |

注：mean signed gap M 为 sandbox 相对 human 的有符号距离，负数表示 sandbox range 低于 human range；overlap 记 0。

## Old Demand Proxy 汇总

| old demand vs human | count |
| ------------------- | ----- |
| inside              | 8     |
| too_low             | 10    |
| too_high            | 10    |
| missing             | 12    |

## Case 明细

| case | global | player                   | bucket                      | human range     | sandbox tier           | sandbox range   | sandbox vs human | gap M | severe     | old demand | old demand cap% | old vs human | human notes             |
| ---- | ------ | ------------------------ | --------------------------- | --------------- | ---------------------- | --------------- | ---------------- | ----- | ---------- | ---------- | --------------- | ------------ | ----------------------- |
| A-01 | B40-01 | Al-Farouq Aminu          | minimum_fringe_negative     |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing          |       |            | $3.71M     | 2.4%            | missing      |                         |
| A-02 | B40-02 | Bogdan Bogdanović        | minimum_fringe_negative     |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing          |       |            | $3.71M     | 2.4%            | missing      |                         |
| A-03 | B40-03 | Pat Connaughton          | minimum_fringe_negative     |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing          |       |            | $3.71M     | 2.4%            | missing      |                         |
| A-04 | B40-04 | Andrew Harrison          | minimum_fringe_negative     |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing          |       |            | $3.71M     | 2.4%            | missing      |                         |
| B-01 | B40-05 | John Wall                | minimum_plus_functional_vet |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing          |       |            | $6.69M     | 4.3%            | missing      |                         |
| B-02 | B40-06 | Will Barton              | minimum_plus_functional_vet |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing          |       |            | $8.80M     | 5.7%            | missing      |                         |
| B-03 | B40-07 | Blake Griffin            | minimum_plus_functional_vet |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing          |       |            | $9.09M     | 5.9%            | missing      |                         |
| B-04 | B40-08 | Justin Holiday           | minimum_plus_functional_vet |                 | MINIMUM_LEVEL          | $3.71M-$4.27M   | missing          |       |            | $8.86M     | 5.7%            | missing      |                         |
| C-01 | B40-09 | Keyonte George           | low_rotation                |                 | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | missing          |       |            | $9.22M     | 6.0%            | missing      |                         |
| C-02 | B40-10 | Jordan Hall              | low_rotation                |                 | MINIMUM_LEVEL          | $2.43M-$2.79M   | missing          |       |            | $10.37M    | 6.7%            | missing      |                         |
| C-03 | B40-11 | Bennedict Mathurin       | low_rotation                |                 | MINIMUM_LEVEL          | $2.43M-$2.79M   | missing          |       |            | $8.46M     | 5.5%            | missing      |                         |
| C-04 | B40-12 | Alex Sarr                | low_rotation                |                 | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | missing          |       |            | $12.02M    | 7.8%            | missing      |                         |
| D-01 | B40-13 | Simisola Shittu          | good_rotation_specialist    | $3.00M-$5.00M   | MINIMUM_LEVEL          | $2.94M-$3.38M   | overlap          | 0     | no         | $12.73M    | 8.2%            | too_high     |                         |
| D-02 | B40-14 | Jordan Poole             | good_rotation_specialist    | $6.00M-$10.00M  | LOW_ROTATION_PLUS      | $3.09M-$5.41M   | too_low          | 0.59  | no         | $16.04M    | 10.4%           | too_high     |                         |
| D-03 | B40-15 | Jaylen Wells             | good_rotation_specialist    | $8.00M-$14.00M  | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | too_low          | 1.04  | no         | $13.84M    | 8.9%            | inside       |                         |
| D-04 | B40-16 | Keegan Murray            | good_rotation_specialist    | $4.00M-$8.00M   | SPECIALIST_ROTATION    | $5.41M-$8.51M   | overlap          | 0     | no         | $9.54M     | 6.2%            | too_high     |                         |
| E-01 | B40-17 | Yogi Ferrell             | high_end_rotation_sixth_man | $8.00M-$12.00M  | VETERAN_ROTATION_GUARD | $6.19M-$9.28M   | overlap          | 0     | no         | $18.43M    | 11.9%           | too_high     |                         |
| E-02 | B40-18 | Nikola Jović             | high_end_rotation_sixth_man | $20.00M-$30.00M | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | too_low          | 13.04 | severe_low | $19.94M    | 12.9%           | inside       |                         |
| E-03 | B40-19 | Malik Beasley            | high_end_rotation_sixth_man | $6.00M-$10.00M  | MINIMUM_LEVEL          | $3.37M-$3.88M   | too_low          | 2.12  | no         | $18.74M    | 12.1%           | too_high     |                         |
| E-04 | B40-20 | Julian Strawther         | high_end_rotation_sixth_man | $12.00M-$18.00M | YOUNG_UPSIDE_SUSPECT   | $3.87M-$6.96M   | too_low          | 5.04  | no         | $17.51M    | 11.3%           | inside       |                         |
| F-01 | B40-21 | Shaedon Sharpe           | low_end_starter             | $20.00M-$30.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low          | 1.44  | no         | $19.95M    | 12.9%           | inside       |                         |
| F-02 | B40-22 | Mfiondu Kabengele        | low_end_starter             | $10.00M-$16.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap          | 0     | no         | $19.71M    | 12.7%           | too_high     |                         |
| F-03 | B40-23 | Isaac Okoro              | low_end_starter             | $15.00M-$20.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap          | 0     | no         | $19.61M    | 12.7%           | inside       |                         |
| F-04 | B40-24 | Kentavious Caldwell-Pope | low_end_starter             | $6.00M-$12.00M  | LOW_END_STARTER        | $9.28M-$18.56M  | overlap          | 0     | no         | $20.68M    | 13.4%           | too_high     |                         |
| G-01 | B40-25 | Jordan Bell              | solid_starter               | $12.00M-$20.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap          | 0     | no         | $24.76M    | 16.0%           | too_high     |                         |
| G-02 | B40-26 | Isaiah Stewart           | solid_starter               | $20.00M-$25.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low          | 1.44  | no         | $24.81M    | 16.0%           | inside       |                         |
| G-03 | B40-27 | OG Anunoby               | solid_starter               | $12.00M-$18.00M | LOW_END_STARTER        | $9.28M-$18.56M  | overlap          | 0     | no         | $24.60M    | 15.9%           | too_high     |                         |
| G-04 | B40-28 | Džanan Musa              | solid_starter               | $12.00M-$18.00M | MINIMUM_LEVEL          | $3.15M-$3.62M   | too_low          | 8.38  | severe_low | $25.03M    | 16.2%           | too_high     | too many TO             |
| H-01 | B40-29 | Kevin Knox               | good_high_starter           | $25.00M-$35.00M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | overlap          | 0     | no         | $30.91M    | 20.0%           | inside       |                         |
| H-02 | B40-30 | Ben Simmons              | good_high_starter           | $30.00M-$35.00M | LOW_END_STARTER        | $9.28M-$18.56M  | too_low          | 11.44 | severe_low | $30.99M    | 20.0%           | inside       |                         |
| H-03 | B40-31 | LaMelo Ball              | good_high_starter           | $35.00M-$40.00M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | too_low          | 0.2   | no         | $30.81M    | 19.9%           | too_low      |                         |
| H-04 | B40-32 | Kai Jones                | good_high_starter           | $35.00M-$40.00M | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | too_low          | 0.2   | no         | $30.67M    | 19.8%           | too_low      |                         |
| I-01 | B40-33 | Saben Lee                | star_near_max               | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap          | 0     | no         | $37.98M    | 24.6%           | too_low      |                         |
| I-02 | B40-34 | Josh Giddey              | star_near_max               | $38.66M         | STAR_NEAR_MAX          | $34.02M-$38.66M | overlap          | 0     | no         | $37.63M    | 24.3%           | too_low      |                         |
| I-03 | B40-35 | Patrick Williams         | star_near_max               | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap          | 0     | no         | $38.49M    | 24.9%           | too_low      |                         |
| I-04 | B40-36 | Trae Young               | star_near_max               | $44.00M-$46.40M | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap          | 0     | no         | $36.62M    | 23.7%           | too_low      |                         |
| J-01 | B40-37 | Justin Champagnie        | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap          | 0     | no         | $43.01M    | 27.8%           | too_low      |                         |
| J-02 | B40-38 | Scottie Barnes           | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap          | 0     | no         | $40.39M    | 26.1%           | too_low      |                         |
| J-03 | B40-39 | Joshua Primo             | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap          | 0     | no         | $40.23M    | 26.0%           | too_low      | 有FMVP，基本上就是max吧 |
| J-04 | B40-40 | Luka Dončić              | superstar_max_lock          | $46.40M         | STAR_NEAR_MAX          | $40.83M-$46.40M | overlap          | 0     | no         | $38.81M    | 25.1%           | too_low      |                         |

## Missing / Skipped Cases

这些 case 没有进入 overlap/too_low/too_high 分母。

| case | global | player             | bucket                      | humanAmountRangeM | status  |
| ---- | ------ | ------------------ | --------------------------- | ----------------- | ------- |
| A-01 | B40-01 | Al-Farouq Aminu    | minimum_fringe_negative     |                   | missing |
| A-02 | B40-02 | Bogdan Bogdanović  | minimum_fringe_negative     |                   | missing |
| A-03 | B40-03 | Pat Connaughton    | minimum_fringe_negative     |                   | missing |
| A-04 | B40-04 | Andrew Harrison    | minimum_fringe_negative     |                   | missing |
| B-01 | B40-05 | John Wall          | minimum_plus_functional_vet |                   | missing |
| B-02 | B40-06 | Will Barton        | minimum_plus_functional_vet |                   | missing |
| B-03 | B40-07 | Blake Griffin      | minimum_plus_functional_vet |                   | missing |
| B-04 | B40-08 | Justin Holiday     | minimum_plus_functional_vet |                   | missing |
| C-01 | B40-09 | Keyonte George     | low_rotation                |                   | missing |
| C-02 | B40-10 | Jordan Hall        | low_rotation                |                   | missing |
| C-03 | B40-11 | Bennedict Mathurin | low_rotation                |                   | missing |
| C-04 | B40-12 | Alex Sarr          | low_rotation                |                   | missing |

## 最大 miss cases（重点 buckets）

| case | global | player           | bucket                      | human range     | sandbox tier         | sandbox range   | sandbox vs human | gap M | severe     | old demand | old demand cap% | old vs human | human notes |
| ---- | ------ | ---------------- | --------------------------- | --------------- | -------------------- | --------------- | ---------------- | ----- | ---------- | ---------- | --------------- | ------------ | ----------- |
| E-02 | B40-18 | Nikola Jović     | high_end_rotation_sixth_man | $20.00M-$30.00M | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M   | too_low          | 13.04 | severe_low | $19.94M    | 12.9%           | inside       |             |
| H-02 | B40-30 | Ben Simmons      | good_high_starter           | $30.00M-$35.00M | LOW_END_STARTER      | $9.28M-$18.56M  | too_low          | 11.44 | severe_low | $30.99M    | 20.0%           | inside       |             |
| G-04 | B40-28 | Džanan Musa      | solid_starter               | $12.00M-$18.00M | MINIMUM_LEVEL        | $3.15M-$3.62M   | too_low          | 8.38  | severe_low | $25.03M    | 16.2%           | too_high     | too many TO |
| E-04 | B40-20 | Julian Strawther | high_end_rotation_sixth_man | $12.00M-$18.00M | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M   | too_low          | 5.04  | no         | $17.51M    | 11.3%           | inside       |             |
| E-03 | B40-19 | Malik Beasley    | high_end_rotation_sixth_man | $6.00M-$10.00M  | MINIMUM_LEVEL        | $3.37M-$3.88M   | too_low          | 2.12  | no         | $18.74M    | 12.1%           | too_high     |             |
| F-01 | B40-21 | Shaedon Sharpe   | low_end_starter             | $20.00M-$30.00M | LOW_END_STARTER      | $9.28M-$18.56M  | too_low          | 1.44  | no         | $19.95M    | 12.9%           | inside       |             |
| G-02 | B40-26 | Isaiah Stewart   | solid_starter               | $20.00M-$25.00M | LOW_END_STARTER      | $9.28M-$18.56M  | too_low          | 1.44  | no         | $24.81M    | 16.0%           | inside       |             |
| H-03 | B40-31 | LaMelo Ball      | good_high_starter           | $35.00M-$40.00M | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | too_low          | 0.2   | no         | $30.81M    | 19.9%           | too_low      |             |
| H-04 | B40-32 | Kai Jones        | good_high_starter           | $35.00M-$40.00M | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | too_low          | 0.2   | no         | $30.67M    | 19.8%           | too_low      |             |

## 最大 miss cases（全体 labeled）

| case | global | player           | bucket                      | human range     | sandbox tier         | sandbox range   | sandbox vs human | gap M | severe     | old demand | old demand cap% | old vs human | human notes |
| ---- | ------ | ---------------- | --------------------------- | --------------- | -------------------- | --------------- | ---------------- | ----- | ---------- | ---------- | --------------- | ------------ | ----------- |
| E-02 | B40-18 | Nikola Jović     | high_end_rotation_sixth_man | $20.00M-$30.00M | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M   | too_low          | 13.04 | severe_low | $19.94M    | 12.9%           | inside       |             |
| H-02 | B40-30 | Ben Simmons      | good_high_starter           | $30.00M-$35.00M | LOW_END_STARTER      | $9.28M-$18.56M  | too_low          | 11.44 | severe_low | $30.99M    | 20.0%           | inside       |             |
| G-04 | B40-28 | Džanan Musa      | solid_starter               | $12.00M-$18.00M | MINIMUM_LEVEL        | $3.15M-$3.62M   | too_low          | 8.38  | severe_low | $25.03M    | 16.2%           | too_high     | too many TO |
| E-04 | B40-20 | Julian Strawther | high_end_rotation_sixth_man | $12.00M-$18.00M | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M   | too_low          | 5.04  | no         | $17.51M    | 11.3%           | inside       |             |
| E-03 | B40-19 | Malik Beasley    | high_end_rotation_sixth_man | $6.00M-$10.00M  | MINIMUM_LEVEL        | $3.37M-$3.88M   | too_low          | 2.12  | no         | $18.74M    | 12.1%           | too_high     |             |
| F-01 | B40-21 | Shaedon Sharpe   | low_end_starter             | $20.00M-$30.00M | LOW_END_STARTER      | $9.28M-$18.56M  | too_low          | 1.44  | no         | $19.95M    | 12.9%           | inside       |             |
| G-02 | B40-26 | Isaiah Stewart   | solid_starter               | $20.00M-$25.00M | LOW_END_STARTER      | $9.28M-$18.56M  | too_low          | 1.44  | no         | $24.81M    | 16.0%           | inside       |             |
| D-03 | B40-15 | Jaylen Wells     | good_rotation_specialist    | $8.00M-$14.00M  | YOUNG_UPSIDE_SUSPECT | $3.87M-$6.96M   | too_low          | 1.04  | no         | $13.84M    | 8.9%            | inside       |             |
| D-02 | B40-14 | Jordan Poole     | good_rotation_specialist    | $6.00M-$10.00M  | LOW_ROTATION_PLUS    | $3.09M-$5.41M   | too_low          | 0.59  | no         | $16.04M    | 10.4%           | too_high     |             |
| H-03 | B40-31 | LaMelo Ball      | good_high_starter           | $35.00M-$40.00M | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | too_low          | 0.2   | no         | $30.81M    | 19.9%           | too_low      |             |
| H-04 | B40-32 | Kai Jones        | good_high_starter           | $35.00M-$40.00M | YOUNG_PROVEN_STARTER | $26.29M-$34.80M | too_low          | 0.2   | no         | $30.67M    | 19.8%           | too_low      |             |

## 方向性诊断

- D 组 good_rotation/specialist：人工目标偏低的样本会暴露 sandbox 是否把 specialist/young-upside 拉得过高或过宽。
- E/F/G 组：这是最该优先看的区域。这里覆盖 sixth-man、高分钟低效率 starter、solid starter，也是当前模型 amount ladder 空档和 LOW_END_STARTER 上沿问题的核心。
- H/I/J 组：用于判断 high-starter、near-max、upper-star/max-borderline 是否应该推到 exact max 或保留 max 以下。J bucket 不是 exact-max lock；exact max calibration 仍要结合 anchor15 和 validation20。
- old demand proxy 与 human 的差异可以作为 BBGM 旧需求口径诊断，但不能替代 sandbox model scoring。

## Trade-value Sanity Note

用户的 human target 已经部分综合使用价值、未来发展、交易价值。后续正式接入前应增加 trade-value sanity audit，避免合同 ask 偏低导致可倒卖资产套利。尤其是年轻高潜、正资产 starter、near-max 上沿球员，需要检查“签下后是否明显可立刻交易套利”，而不只是检查 AAV 是否看起来合理。
