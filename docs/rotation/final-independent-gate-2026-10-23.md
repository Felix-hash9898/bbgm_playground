# BBGM Rotation — Final Independent Review Supplement

日期：2026-10-23

- 基线：ac9345383dcf4fe555a121cfe6bbe9bfb1b8cf54
- 固定候选：755f0c2bfa63565c3787307816c45efb0b021bb2
- 父审核数据提交：253332bad933e7512ebb048cc491fd4dc2899374
- 决定：不改候选算法；Core / Depth 结果没有显示新的 Significant 问题；本候选尚未获得正式集成 Go。

本补充以本轮用户明确的产品语义为准，并更新前一份报告中“Custom 零分钟含义未决”的结论。它不会改动候选源代码或正式 main。

## v1.1 审查材料

本环境在候选仓库根目录与 docs 路径都查不到 review-code-package-v1.1.md；GitHub 对这两个路径均返回 404。只能找到 v1，不能把 v1 冒称为 v1.1。本审查落实本轮请求中直接给出的 Goal-First、System-Wide、Independent、Adversarial 与 Decision-Relevance 要求，但不声称已逐条执行不可见的 v1.1 原文。

## 结论摘要

- Core High / Low 的目标差距比 Main 小很多，但没有消失。固定一名首选球员伤停、无 Lock / Override 时，Short 下候选 Rated 的前五人 High−Low 目标差为 BOS 4.5、ORL 7.0、MIN 7.5 分钟；No Ratings 为 5.1、7.1、7.1。三名首选伤停时，Rated 差值为 3.7、2.4、3.9；No Ratings 为 3.7、3.7、3.6。候选的 High 会给主要核心各约 1.8–2.0 分钟/场，Low 把这些分钟分散给其他角色。这个偏好仍可感知，并随伤病负荷上升而收敛。
- 这种收敛有疲劳依据：一伤病 Rated 三队，主力低能量暴露（球队每场低于 0.5 能量的球员分钟总和）从 Main 的 0.03–1.93 降到候选的 0–0.60；三伤病下 MIN 从 Main High / Low 的 15.93 / 9.09 降到候选的 0.43 / 0.03。比分种子间噪声很大，不能单独据此称 High 或 Low 更强。
- Depth 不是人数开关。健康 Auto 九种配置都产生不同计划；健康 Custom 保持用户的固定计划。伤病后 Short / Long 会重排分钟，但质量和位置适配可合理覆盖 headcount 偏好。唯一显眼反例是三伤病 MIN Rated：Low/Short 的 >1 分钟目标人数为 14，Low/Long 为 11；Long 把几名不足一分钟的边缘角色归零，把 Wendell Moore Jr. 从约 2.5 提到 7.7 分钟，深度总分钟基本不变。它是低影响的边缘角色交换，不支持恢复固定 2/3/5 人规则。
- 新的 1→3 人伤病对照没有证据要求修改 Core 系数或容量；只测了 1 与 3 人的同阵容对照。2 人和 4 人的严格同队因果剖面仍未知；现有赛季研究包含自然伤病轨迹，但不能替代控制实验。
- 用户现在已明确：Custom 健康计划的 0 分钟表示健康时不使用，不构成伤病期间的永久 DNP；UI 也说零分钟替补可参与 injury coverage。要阻止自动加分钟应使用 Lock / Prevent injury increase。四项红测试因此是旧断言与当前 UI 合同不符；保留真实的总分钟、不可用球员、Pin、Lock、质量与存档不变量，按下文替代行为测试重写。原断言未被改动。

## 一伤病真实 GameSim 对照

输入：2024 BBGM 球员与真实阵容快照 BOS–NYK、ORL–IND、MIN–DEN；主队健康 Custom 计划固定为 Main Balanced / Normal Auto 计划；伤病为健康计划分钟最高的一人（ORL 为 Franz Wagner，健康目标 37）；短轮换下比较 Core High 与 Low；Rated 和 Challenge No Ratings；无 Lock / Override；GameSim 的 baseInjuryRate=0。每个球队 × 信息模式 × allocator × 3×3 profile 单元各跑 seeds 202620000–202620011 共 12 场，实际调用完整生产 GameSim.run()。共 108 个因子单元、1,296 场。运行器还输出了 144 场标准交叉对照；Core 结论只使用上述 1,296 场。

前五人目标分钟 High / Low（实际比赛比分仅作为描述，不作小样本因果结论）：

| 球队 | 信息 | Main High / Low | 候选 High / Low | 候选差值 |
|---|---|---:|---:|---:|
| BOS | Rated | 174.9 / 162.4 | 172.0 / 167.5 | 4.5 |
| ORL | Rated | 165.9 / 153.7 | 163.8 / 156.8 | 7.0 |
| MIN | Rated | 173.4 / 160.8 | 170.0 / 162.5 | 7.5 |
| BOS | No Ratings | 170.6 / 158.7 | 166.6 / 161.5 | 5.1 |
| ORL | No Ratings | 170.6 / 158.7 | 166.6 / 159.5 | 7.1 |
| MIN | No Ratings | 170.6 / 158.7 | 166.7 / 159.6 | 7.1 |

ORL Rated、Short、Franz Wagner 伤停的全队目标 / 12 场平均实际分钟如下。OVR 仅用于识别阵容，不能视为完整球员价值；GameSim 仍使用 BBGM 真实能力、角色、位置、疲劳和比赛事件。

| 球员 | 位 | OVR | 健康目标 | Main H 目标/实际 | Main L 目标/实际 | 候选 H 目标/实际 | 候选 L 目标/实际 |
|---|---|---:|---:|---:|---:|---:|---:|
| Franz Wagner（伤） | SF | 69 | 37 | 0/0 | 0/0 | 0/0 | 0/0 |
| Jalen Suggs | G | 67 | 33 | 37.0/35.6 | 35.0/34.0 | 35.8/35.2 | 34.0/35.3 |
| Paolo Banchero | PF | 65 | 34 | 39.1/37.1 | 36.0/35.1 | 36.8/35.4 | 35.0/35.7 |
| Wendell Carter Jr. | FC | 58 | 30 | 34.5/33.0 | 31.8/30.8 | 32.8/31.4 | 31.0/31.6 |
| Markelle Fultz | G | 56 | 27 | 31.1/30.7 | 28.6/29.6 | 29.9/29.8 | 28.0/28.7 |
| Gary Harris | SG | 58 | 21 | 24.2/25.7 | 22.3/23.9 | 28.6/27.9 | 28.8/28.9 |
| Cole Anthony | PG | 56 | 18 | 20.7/22.2 | 19.1/20.7 | 24.0/23.6 | 25.6/24.6 |
| Goga Bitadze | C | 55 | 14 | 16.1/17.6 | 14.8/16.4 | 18.7/19.4 | 20.7/21.3 |
| Jonathan Isaac | PF | 54 | 9 | 10.4/11.3 | 9.5/10.6 | 12.0/13.5 | 13.3/14.4 |
| Moritz Wagner | C | 53 | 6 | 6.9/8.8 | 6.4/6.0 | 8.0/9.5 | 9.2/9.9 |
| Anthony Black | PG | 54 | 7 | 8.1/9.0 | 7.4/8.8 | 9.3/10.7 | 10.3/11.3 |
| Joe Ingles | F | 54 | 4 | 4.6/5.5 | 4.2/1.5 | 4.2/3.5 | 4.1/3.7 |
| Trevelin Queen | SG | 49 | 0 | 3.5/1.6 | 17.5/16.8 | 0/0.3 | 0/0.4 |
| Chuma Okeke | F | 42 | 0 | 0/0.1 | 0/0.1 | 0/0 | 0/0.3 |
| Caleb Houstan | SF | 42 | 0 | 3.9/1.8 | 7.3/5.9 | 0/0 | 0/0 |
| Admiral Schofield | F | 41 | 0 | 0/0 | 0/0 | 0/0 | 0/0.2 |
| Kevon Harris | SG | 41 | 0 | 0/0.1 | 0/0.1 | 0/0 | 0/0.2 |
| Jett Howard | SF | 41 | 0 | 0/0 | 0/0 | 0/0 | 0/0 |

全部四种计划总目标均为 240 分钟；伤员保持 0。候选 High / Low 的比分均值分别为 ORL 108.6–103.4 和 108.4–110.6，Main 为 106.2–108.5 和 110.9–108.2。12 场间方向不稳定；不能把该比分差归因于 Core。候选把 Queen 的 17.5 分钟健康零计划晋升为 0.4 / 0.3 分钟，而用相对适配的健康轮换承接主要增量；这是 UI 明确允许的伤病覆盖语义。

### 能量统计审计

旧 576 行导出中的 minimumEnergy 字段只取每个单元的第一个 seed；旧报告不应把它解释为 12 场平均或跨 seed 最差能量。本轮一伤病运行器已经修正为聚合 12 个 seed 的最低能量均值与最差 seed；这里的低能量分钟数则从一开始就是跨 12 场均值。本报告的 Core 疲劳判断只依据跨 seed 低能量分钟暴露，不使用旧的单 seed minimumEnergy 字段。

一伤病 Rated Short，候选 / Main High 与 Low 的全队低能量分钟/场：BOS 0.57/0.60 对 1.93/0.79；ORL 0/0 对 0.25/0.03；MIN 0/0 对 0.40/0。No Ratings 三队均很低，候选分别为 0.56/0.10、0/0.13、0.10/0。疲劳收益支持候选把 High 的极端核心负荷收回，但 12 场不足以判定比分优劣。

## Depth 与用户语义

源代码 UI 文案位于 src/ui/views/Roster/index.tsx:796–849：Depth 是 Auto rotation 的 preferred size，也影响零分钟替补参与 injury coverage 的容易程度；它不是 hard cap。Core 文案说明 High favors the core、Low spreads targets more broadly，并且可增加核心负担，但不是 workload hard cap。Lock 的 UI 文案明确说队友受伤时不会自动增加该球员分钟。

候选 No Ratings 计划输入只保留球员 ID、顺序、固定 endurance 与公开位置；传给伤病分配的 hidden valueNoPot 被置为 undefined。GameSim 内部继续使用真实能力做比赛模拟。这是正确的信息隔离，而非泄漏。

## 四项红测试与替代合同

未改动任何原断言。全套测试中四项 Rotation 断言仍失败，具体错误为 22.647 分钟超过旧的 10 分钟限额；Short 实际只晋升 1 名而旧断言要求 2；固定 2/3/5 人数断言实际只晋升 1 名；loadTeams 中 pid9 实际获得 11.024 分钟而旧断言要求 0。

| 旧断言 | 应保留的真实回归检查 | 替代行为断言方向 |
|---|---|---|
| basketballMinutes.test.ts:909：弱替补 ≤10 分钟 | 伤员为 0；全队合法总量与单人上限；充分且合适的强替代应比弱替代得到更多分钟 | 不设普遍分钟硬帽；当球队仅剩六名可用球员时允许应急负担；增加有同位置、能力更好替代者的全队比较 |
| basketballMinutes.test.ts:1212：Short 恰好 2 名深度球员 | Current Override 精确值、Pin 上下调后的总量、不可行时错误 | 在有自由容量且角色相近时比较 Short 与 Long 的偏好；允许位置/能力/保护条件压制人数差异 |
| basketballMinutes.test.ts:1355：Short/Normal/Long 恰为 2/3/5 人 | 240 分钟、伤员归零、Lock hard cap、Core High/Low 行为以及无错误 | 断言有效 slack 条件下的配置偏好及全队质量，而非固定人数和零分钟掩码 |
| dynamicMinutesGameSim.test.ts:368：指定 Custom 零分钟球员永久 DNP | 有效 Pin 精确；伤员归零；总量合法；健康 Custom 存档不被伤病改写 | 无伤病时 Custom zero 保持 0；伤病时允许有篮球理由的临时晋升；只有显式 Prevent injury increase 才禁止自动加分钟 |

最后一项断言位于候选改过的 dynamicMinutesGameSim 测试文件。不能只删掉它：应保留 Pin、伤员和存档不变量，重写的只是与 UI 不符的永久 DNP 语义。任何实际测试变更仍需独立审查通过。

## 长期和零和复核

复用既有 96 组多球队与 40 组 NYK 赛季实验，未重跑 136 组。每场比赛双方分差变化严格相反，因此受控队分差上涨与 AI 组分差下降是恒等式互补，不能当作两项独立证据。AI 得分、伤病和轮换暴露并非零和；既有区间小且不确定，没有系统性 AI 算法伤害证据。

NYK 40 季平均 −1.05 胜，95% 区间 [−2.85,+0.75]；最差 −14 胜种子同时有更糟的伤病路径（候选多 9 次伤病、53 球员缺阵场、120 伤病日），但该路径是轮换与随机伤病反馈共同作用，不能识别为直接战术因果。没有可信的系统性长期退化结论，也不能排除中等负效应。

此前已知的 LAL 0→1 / 排名交换断点和 IND / ORL 弱末端超载在固定候选已知案例中得到改善，但仍不能声称所有球队已彻底修复。当前因子覆盖三个真实球队；伤病规模 2/4 人的同队受控试验未做。

## 完整项目验证与风险

在候选 755f0c2 下运行 node --run test，使用 Vitest 默认超时、默认配置：409.16 秒；147 个文件通过、12 个文件失败、7 个跳过；1,202 项测试通过、5 项失败、17 项跳过，另 1 个未处理错误。失败为四项上述 Rotation 语义测试、D49/D51 测试启动子进程 EPERM；9 个 Football 文件在导入 playerGameLogSeries.basketball.ts 时因 gameHighs.stats 未定义而收集失败；还有 localhost IPv6 listen EPERM。没有测试超时。失败文件不在候选代码改动清单中，除四项测试本身；这支持环境/既有配置失败判断，但本轮没有在 ac934 上重跑全套来作基线证明。

node --run lint 全仓失败：ESLint 报 464 项，TypeScript 报 183 项、跨 9 个未改动文件；候选改动的六个 TypeScript 源码/测试文件单独 ESLint 通过，TypeScript 诊断不落在候选改动文件。故全仓 lint/type 不能作为绿色门禁；旧研究目录及项目现存诊断需另行清理。

## 决策

Decision-Relevance 判断：不增加固定上限、不调大 High/Low 数值差、不恢复人数规则。Core/Depth 在健康 Auto 和无显式约束伤病场景中产生可解释的目标差；伤病越重，Core 目标差变小并伴随低能量暴露下降。Short/Long 的低分钟角色交换在现有例子里影响小。没有新 Significant/Blocker 由 Core/Depth 触发。

候选算法可继续接受 ChatGPT 的最终独立源码审查，但这不是合入批准。正式集成仍为 No-Go：v1.1 正文在当前资源不可见；四项测试还需经 ChatGPT 审批后以行为合同重写；全仓测试与 lint/type 尚非绿色。不得合入 main。

## 可复现标识

- 固定代码：755f0c2bfa63565c3787307816c45efb0b021bb2
- 既有审计数据：253332bad933e7512ebb048cc491fd4dc2899374；576 行导出 manifest 的 SHA256 为 22b3636572e0ee08602072c8cd4adc04bcd02e5122b8678d49d9577a0c01a844
- 新一伤病完整输出：[core-single-injury-factorial.json.gz](https://github.com/Felix-hash9898/bbgm_playground/blob/review/rotation-final-gate-2026-10-23/docs/rotation/core-single-injury-factorial.json.gz)；压缩文件 SHA256 `1c04a1b6c657980a32f7779f595fceabe0c2d68f18137bfad353a962c572f0b4`，解压后 JSON SHA256 `682dbc639c62dafb2ead1048ffd9eacd7001260ebc9a7ca649934f29471339d8`
- 修正最低能量跨 seed 聚合后的 runner（Cloud 本地）：coreRelianceInjuryScale.test.ts，SHA256 cefffdc2806ef0cf95181aee388bf59c314c289aa32227d2e1fab87e94442553
- 一伤病数据 fixture 沿用 2024 holdout2024.json，SHA256 a0843c6eaecd024443cf8fd7c9ef9bc0e53cf099c1a0234863e1a941983bc21a

来源：src/worker/core/team/basketballMinutes.ts:617–685、1296–1718；src/worker/core/game/loadTeams.ts:429–498；src/worker/views/roster.ts:395–488；src/ui/views/Roster/index.tsx:354、796–849；src/worker/core/GameSim.basketball/dynamicMinutesGameSim.test.ts:344–382；src/worker/core/team/basketballMinutes.test.ts:885–920、1180–1235、1309–1370。