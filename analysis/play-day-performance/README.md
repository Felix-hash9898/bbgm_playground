# Play Day 性能优化（2026-11-03）

## 交付

已实施 GameSim 热路径、换人排序复用、安全快照/保存边界和 Game Log 传输优化。完整读时快照、原地修改回滚、逐日原子保存、伤病通知、合同合法性、重复推进保护及 UI 同步保留。根目录 `AGENTS.md` 持久化 M1 单任务约束。God Mode Signing Page 的预期 salary 问题仍是独立待办。

## 基准来源与测量边界

- HEAD：`8a24c72211c886d49446eb6eaecdc7719ffb3e75`。
- Official：[ZenGM commit dcaf4620](https://github.com/zengm-games/zengm/commit/dcaf4620cbb09d2ebf599414d9850d60f90869b3)。使用实际上游源代码，适配其新的环境宏/advStats 导出；共用本机现有依赖工具链，未声称是上游锁文件的独立安装构建。
- 优化前：本轮开始时冻结的未提交恢复修复版本；最终版包含本轮优化。隔离目录位于 `/tmp/bbgm-play-day-perf/{head,before,after}`，Official 在 `/tmp/bbgm-official-perf`。
- 同一真实 League 10：2162 名球员、1153 场既有比赛；固定种子 `20261103`；一天真实模拟 14 场，赛程 451→437。原始 gzip 只读。
- 每样本重新导入完整存档，执行真实 `Cache.fill()`；导入/填充不计时。然后执行真实 `play(1,{})`、真实 GameSim/签约/高级统计/原生 IndexedDB 保存。每组仅三次单日样本，串行执行；同一 Chromium 引擎、一个 worker。不是长赛季扫样本。
- 原存档在交易截止后。为使缺少合同修复的 HEAD 能完成，共同对**临时副本**的两名自由球员移除非法单年 PO。正式修复本身由合同/签约测试覆盖。Official 不实现 Playground 自定义轮换、usageBias、form 和伤病逻辑，比赛结果不能要求与 Playground 相同。
- 主计时是 worker 业务函数的完整事务路径；浏览器测试中业务代码运行于页面环境。通信另以真实 Blob Worker 回传实际请求/发布/视图数据测量；渲染使用实际 LeagueTopBar 和 GameLog。**这不是已部署应用的生产 Worker 点击到绘制延迟测试**，不包含真实应用 Worker 排队、网络/样式加载或 SharedWorker 多标签竞争。
- 时间为带细粒度 instrumentation 的诊断数值。IndexedDB 完成等待受刚导入大存档、GC、文件系统和 Chromium 存储调度影响显著；小样本无统计显著性保证。

## 总时间

单位 ms，三次样本中位数。“扣除 IDB 等待”是每样本总时间减去对应的事务等待，然后取中位数；包含其余异步等待，不能严格称为纯 CPU 时间。

| 版本               | Play Day 总时间 |    总时间范围 | 扣除 IDB 等待 |
| ------------------ | --------------: | ------------: | ------------: |
| Official           |          2249.7 | 1891.3–2295.2 |         299.8 |
| 修复前 HEAD        |          2035.0 | 1166.5–2274.7 |         313.5 |
| 恢复修复后、优化前 |          2389.6 | 1323.0–2555.4 |         409.3 |
| 最终优化版         |          2329.6 | 1137.7–2374.7 |         312.3 |

- 扣除 IDB 等待后的耗时下降 **23.7%**；最终约 312 ms，与 Official 的约 300 ms 接近。此结果同时包含新增安全保证和旧 GameSim 路径的改进。
- GameSim 从约 136 ms 降到 112 ms（**17.6%**）；修复前 HEAD 为约 144 ms。收益不局限于撤销恢复修复开销。
- 总时间中位数只改善约 2.5%，首样本 1323→1138 ms。事务等待主导总耗时，因此不能据此宣称稳定的端到端加速比例，或宣称比 Official 更快。

## 主要阶段

单位 ms，中位数。阶段有包含关系：快照包含在阵容检查/读取里，伤病包含在球员写入里，签约/降价包含在日结里；flush 包含序列化、事务等待和 rebase。**不可将整张表相加**。缓存读写及 `updateValues` 的逐调用异步累计值也不能当作独立墙钟时间相加，详见原始 JSON。

| 阶段                                   | Official |   HEAD | 优化前 |   最终 |
| -------------------------------------- | -------: | -----: | -----: | -----: |
| 球队数据读取、轮换、lineup preparation |      3.8 |   46.5 |   28.4 |   27.3 |
| GameSim（14 场）                       |     55.4 |  144.1 |  135.7 |  111.8 |
| 阵容检查（包含首次球员快照）           |    158.0 |    5.8 |   64.3 |   56.9 |
| writePlayerStats（含伤病处理）         |      6.0 |    7.4 |    7.2 |    6.5 |
| writeTeamStats                         |      1.2 |   23.8 |    2.6 |    2.5 |
| writeGameStats                         |      2.0 |   36.2 |    5.6 |    8.3 |
| FA 每日要价/伤病结算                   |      0.5 |    1.5 |    1.6 |    1.4 |
| AI 签约                                |      2.1 |    9.5 |    8.4 |    7.0 |
| advStats                               |      6.6 |   19.7 |   16.7 |   15.4 |
| checkpoint 初始完整快照                |      0.0 |    4.3 |   65.8 |   56.3 |
| 保存后 checkpoint rebase               |      0.0 |    0.2 |   50.7 |    0.2 |
| IDB 写入排队/序列化                    |     70.0 |   66.3 |   65.6 |   64.3 |
| IDB 事务完成等待                       |   1753.3 | 1739.0 | 2007.2 | 2036.2 |
| Cache.flush（包含上述 IDB 与 rebase）  |   1862.7 | 1804.9 | 2123.2 | 2101.7 |

补充分段：最终全联盟轮换 OVR 分位数读取/计算约 0.9 ms；其余 preparation 约数十 ms，主要是自定义轮换、球员和球队比赛输入构造。最终日结约 8.9 ms，伤病子过程约 0.3 ms。交易截止后 AI 交易按规则不运行，不能记为“交易优化”。

额外仅做一对常规赛副本（phase=1）验证真实 AI 交易路径：交易函数 26.7→27.2 ms，日结 43.0→42.5 ms；全部对象仓库持久化哈希相同。交易不是本轮收益来源，也未为基准跳过交易。

### UI 边界

实际视图数据、真实 Worker structured clone 回传、真实 React 组件渲染。Worker 预热后测量，不含启动。renderAndPaint 包含实际组件挂载、副作用及两次 requestAnimationFrame；无完整应用 CSS，因此只作为组件边界诊断。

| 项目                        |                  优化前 |                            最终 |
| --------------------------- | ----------------------: | ------------------------------: |
| Game Log 数据 JSON 字节     |               1,194,318 |                          28,469 |
| Game Log Worker 往返        | 11.7 ms（一个对照样本） | 0.4–3.5 ms，三样本中位数 0.5 ms |
| 请求往返                    |               约 0.1 ms |                        0–0.1 ms |
| 日末 UI 发布                |     8 次调用，1368 字节 |             8 次调用，1368 字节 |
| Game Log 数据准备           |                  0.9 ms |                      0.5–0.8 ms |
| Game Log + 比分条渲染至绘制 |             首次 105 ms |     首次 86 ms；后两次 60–61 ms |

Game Log 传输量下降约 97.6%。两版均渲染 107 行，实际页面文本 SHA-256 完全一致；渲染时间变化不能独立归因为摘要优化。发布没有增加刷新次数。

## 实际修改与安全边界

1. `Cache.ts`：初始完整快照采用原生 structuredClone；遇到不可序列化的暂存对象或旧环境时回退原有 deepCopy。仍在首次读出可变记录时快照整条记录，未共享历史数组、推迟到 put 或取消原地修改回滚。
2. `Cache.flush` / `runDay.ts`：全量日末事务成功后结束本日 journal，再清理 dirty 状态，避免重建随即丢弃的 rebase 快照。事务失败仍可回滚；普通/局部 flush 仍推进活动 journal 基线。局部保存不能使用结束整个 checkpoint 的选项；autoSave 关闭时保留原逻辑。
3. `GameSim.basketball/index.ts`：比赛内复用替补排序，校验阵容成员引用、顺序、长度、id、计划分钟和 valueNoPot；更改任一排序输入都重算。伤病、能量、犯规和轮换控制状态保持逐次读取。移除暂时排序后恢复整个阵容数组的操作，最终状态累计仍按原阵容顺序。
4. `shotPriority.ts` / GameSim：中性 usageBias 只计算一次相同权重；公开的两组权重数组仍独立。中性阵容的失误概率、失误归属及团队偏移走等价分支，每次检查当前场上球员的 bias；自定义优先级保留原算法和 RNG 次序。
5. `worker/views/gameLog.ts`、`getProcessedGames.ts`、`ui/views/GameLog.tsx`：赛程侧栏只传摘要，保留 gid、加时、节数、中立场、强制赛果、两队 tid/比分/点球比分。选中比赛的完整 box score 独立读取，导航仍使用同一 gid 顺序。
6. 审查撤回候选索引排序微优化：旧算法在非相邻并列值时有特定索引分配语义。收益很小，保留旧行为并添加回归断言。
7. 稳定一个既有 SalaryFix 测试夹具：随机正面情绪可能抵消 -10 的负面测试值，使测试前提失效。固定该夹具的 moodTraits 为空，保留原来的 -10 负面项，避免随机性；业务薪资/情绪/合同代码未因性能任务更改。

## 行为与存档验证

- 三次主样本的 players/games/teams/teamSeasons/teamStats/schedule/events/headToHeads 哈希逐一与优化前相同。
- 新的一次标准阶段对照还比对了 **全部 Cache.STORES**，完整哈希相同；常规赛交易路径对照同样对全部仓库一致。新 JSON 同时提供 `stateHash`（全部仓库）与 `coreStateHash`（上述八类，便于对比先前数据）。不同 iteration 的事件 URL 含不同 lid，不能跨 iteration 比哈希。
- 比分条 + 实际 Game Log 页面文本哈希：`6403748592bcf3b7909f58bfb2f91f9378c00b256511594d7d12057d205c6c93`，优化前后相同。选中 box score、摘要独立性、增量更新无重复、加时/点球/强制赛果字段另有测试。
- 新增回归覆盖：排序缓存失效、中性/非法 bias 与实时编辑、权重数组独立、日末成功保存不再快照、失败后原地编辑回滚、拒绝局部保存结束整日 journal、保留旧并列处理。
- 原始 gzip SHA-256 再次核验：`824eadc94e6d2e5120ab7d92185bf7c6b3e80780d5243dc7843a3494988cc696`，未改变。

## 验证记录

所有命令串行执行。Vitest 均使用 `--maxWorkers=1 --no-file-parallelism`；浏览器配置仅包含 Chromium。

- 定向回归覆盖 22 个文件、379 个不同用例，涉及 Cache、推进事务/编排、loadTeams、GameSim/轮换/伤病/usage、合同 PO/TO、SalaryFix、签约事务及 Game Log 摘要。整组曾为 378/379：一个随机情绪夹具未满足负面情绪前提；固定该夹具的 moodTraits 后，该文件重跑 51/51。其余 21 文件在整组中通过。测试类型修正后，Game Log/shotPriority 两文件另重跑 10/10。未把重复执行累计成额外独立用例。
- Chromium：3 文件、9 用例通过，覆盖原生 IndexedDB 失败回滚/重试/重开、伤病事件一次性、推进按钮重复保护、比分条更新和视图队列恢复。另有最终真实存档基准里的 107 行实际组件渲染和文本哈希对照。
- 本轮修改涉及的 12 个源代码/测试文件 ESLint 通过。
- 完整 `tsc --noEmit --incremental false` 仍返回 339 项既有诊断；与优化前 `/tmp/bbgm-final-tsc.log` 按诊断行多重集合比对完全一致，新增 0、移除 0。本轮新增测试的 4 处类型问题已修正。
- `git diff --check` 通过；生产 `src` 中没有基准 instrumentation 标记。

关键验证日志保存在 [validation](validation/)；原始性能测量在 [results](results/)。

## 剩余差距与停止理由

最终 GameSim 仍约 112 ms，Official 约 55 ms；比赛准备约 27 ms 对约 4 ms；完整安全快照约 56 ms。Official 的阵容检查还含额外原生数据库访问，耗时约 158 ms，不能把其阶段总和与 Playground 的每个阶段直接一一抵扣。高级统计约 15 ms 对约 7 ms。以上功能及源代码并不等价，未为追平数字删除自定义功能。

主要墙钟等待是 IDB 持久化（本轮约 0.8–2.1 秒的事务等待），两边均存在。没有放宽 durability、拆散逐日原子事务、漏写球员或省略高级统计。继续消减全量快照需要证明历史对象不可变/所有权，或引入全面的 mutation tracking；继续跨日缓存轮换/价值需要覆盖伤病、评分、签约、交易、用户编辑和阶段切换失效。当前分位数本身不足 2 ms，进一步重构的收益小且风险更高，因此在此停止。

## 复现

`prepare.py` 只准备隔离源代码副本和 instrumentation，拒绝活动仓库根目录。冻结副本需有完整 src、data、tools、build/names 资源与相同 node_modules。Official 使用其自身 sportFunctions 插件。

```bash
python3 analysis/play-day-performance/prepare.py /tmp/bbgm-play-day-perf/after --browser --ui
PLAYWRIGHT_BROWSERS_PATH=/tmp/bbgm-playwright BBGM_PERF_OUTPUT=/tmp/profile.json BBGM_PERF_VARIANT=optimized BBGM_PERF_REPEATS=3 node_modules/.bin/vitest run --config /tmp/bbgm-play-day-perf/after/perf.config.ts --maxWorkers=1 --no-file-parallelism
```

`BBGM_PERF_LEAGUE` 在 prepare 时可覆盖存档路径；默认是本次 League 10 原存档。单独测交易时设置 `BBGM_PERF_PHASE=1`，只用一次样本。不要与测试、构建或 lint 同时运行。`chromium.config.ts` 是本轮单引擎 UI 回归配置。`results/*.json` 为可审查的原始阶段数据，不包含存档正文。

早期 fake-indexeddb/Node 测量显示约 2.6–2.7 秒主要耗在 fake-IDB 树扫描，因此弃用其总时间作为浏览器性能结论。Node CPU profile 只辅助定位 JS clone/GameSim 热点；最终数字均来自原生 Chromium。

## 最终应用端浏览器验收（2026-11-03）

- 本机 macOS 26.6.2 / Safari 26.6.2。没有可用的 Apple Safari MCP；`safaridriver --enable` 请求系统密码后停止，未输入密码。按验收要求使用 Playwright WebKit；**未验证原生 Safari**。
- 使用单独的 WebKit browser context，通过真实 New League 页面上传隔离副本，并在应用界面点击 Play → One day。副本 SHA-256 为 `824eadc94e6d2e5120ab7d92185bf7c6b3e80780d5243dc7843a3494988cc696`，操作前后相同；用户原始存档未打开写入。
- 一次完整单日样本：2019 赛季第 58 天的 14 场比赛。实际 Play Menu Worker 往返 **628 ms**；GameSim **94 ms / 14 场**；`runDay` 日末 `Cache.flush` 完成 **264 ms**。这些阶段计时由本地一次性测试探针测得；测后精确恢复源码，探针未进入提交。
- 初始单样本记录了点击到比分条首次 DOM 更新并经过两帧 **7,284 ms**，当时 Play Menu Worker 往返为 628 ms。这是未拆解的一次 WebKit headless 观测；当时关于 Worker 后 UI 延迟的归因尚未证实。下文的分阶段复查未复现该结果。
- 原生 IndexedDB：赛前赛程 **451**、已赛 **1,153**；赛后赛程 **437**、已赛 **1,167**。重载后赛程行哈希、全部已赛游戏主键与新增比赛分数一致。Game Log 页面显示用户队伍本场 `DEN / W / 127–103`；重载后 Daily Schedule 标题为 2019 第 59 天，显示 15 个比赛操作卡片，与 IndexedDB 下一天的 15 场相同。
- 页面无应用级 page error、第一方 console error、第一方 HTTP 错误或失败请求。受运行环境网络限制，外部 `i.imgur.com` 头像返回 403，广告域名 `b.pub.network` 预连接 DNS 失败；不影响模拟、比分、数据库或页面路由。
- 这次浏览器验收没有发现比赛结果、存档保存、重载、Game Log 或赛程一致性错误，因此未新增产品代码修复。比分条的初始 UI 延迟观察值及后续分阶段复查记录在本文末；原生 Safari 仍未验证。

## Play Day UI 延迟复查（2026-11-03）

针对一次 WebKit headless 的 `click → Scorebar update` 7,284 ms 记录，按完整消息链复测。诊断构建基于当前提交 `5e9fe4f` 的临时 detached worktree，只在 UI API / `viewManager` 加时间标记，并用 React commit hook 标记包含 `.league-top-bar` 的 Fiber；当前工作树源码和正式构建未改。另在未加源码标记、未挂 React hook 的正式构建上做一个最小对照。样本均是隔离 League 10 副本的一日模拟；副本 SHA-256 前后相同。页面加载完成并稳定后才开始计时，热启动样本通过刷新已保存的联盟取得。点击后用浏览器内事件屏障等待，没有使用 Playwright 轮询。

| 阶段                                       |        首次推进（导入后） |      持久化联盟热重载 | 正式构建最小对照 |
| ------------------------------------------ | ------------------------: | --------------------: | ---------------: |
| 点击事件至 Worker 请求发送                 |                      1 ms |                  0 ms |             0 ms |
| Play Menu Worker 往返                      |                    678 ms |                634 ms |           771 ms |
| `mergeGames` 请求 / `local.games` 写入     |              602 / 603 ms |          569 / 569 ms |     未加源码探针 |
| `.league-top-bar` 的 React memo commit     | 605 ms（状态写入后 2 ms） | 572 ms（写入后 3 ms） |  未挂 React hook |
| 比分条文本 DOM mutation                    |                    607 ms |                574 ms |           703 ms |
| 文本变化至两帧回调                         |                10 + 13 ms |             0 + 20 ms |        1 + 10 ms |
| Worker `realtimeUpdate` 总往返             |                     52 ms |                 38 ms |           未拆分 |
| `viewManager` 入队等待                     |          0 ms，队列长度 0 |    0–1 ms，队列长度 0 |     未加源码探针 |
| Worker `main.runBefore` 生成并返回页面数据 |                     29 ms |                 22 ms |           未拆分 |

点击处理器从 capture 到 bubble 为 1–2 ms，Worker 响应分别在比分条文本变更后 72 ms、60 ms、68 ms 到达。也就是说，`local.games` 的合并先触发了 `LeagueTopBar` React commit 和 DOM 文本更新；接着 UI 执行 `realtimeUpdate`、`viewManager` 与 `runBefore`，最后 Play Menu Worker 才返回。viewManager 没有排队，页面数据请求也只占 22–29 ms。

所有样本页面均 `visibilityState=visible` 且有焦点；DOM mutation 到首个 RAF 为 0–10 ms，后续 RAF 间隔 10–20 ms，没有观察到 headless RAF 长时间节流。最小对照未使用源码诊断标记或 React hook，结果仍是 Worker 771 ms、比分条 703 ms、第二帧 714 ms；诊断探针没有制造秒级延迟。第二帧只代表浏览器经历了绘制机会，不等同于物理显示器的 presentation timestamp。

本次三次有效观测都没有复现 7,284 ms：比分条在 Worker 请求完成前更新约 60–72 ms。现有证据不能证明旧的单样本由某一具体代码路径造成；它不构成可复现的产品 UI 延迟，因此没有产品代码修复。Safari 原生未测，结论仅适用于本轮 WebKit headless。原始分阶段数据见 [`play-day-ui-trace-2026-11-03.json`](results/play-day-ui-trace-2026-11-03.json)。
