# BBGM 比赛推进、AI 合同与 UI 同步修复记录

日期：2026-11-03。所有修改留在当前工作树，未 Push。保留任务开始时已有的 `.pi/`、`analysis/injury-rate-calibration/`、`tmp/`、`tools/cbpm/`。

## 已复现的根因

1. `freeAgents.decreaseDemands` 会把赛季中的低价自由球员需求缩短为当年到期，却保留原来的 PO/TO。`autoSign` 的快速签约路径只检查期限/薪资例外，没有重新检查选项合法性。最终 `signingTransaction` 正确拒绝一年合同的选项，抛出 `Contract option is not legal for this term`。
2. `game.play` 在球员/球队数据、比赛和赛程已经发生修改之后执行日结。日结签约或交易失败时，原错误清理只释放锁；缓存保留半完成修改，后台自动保存恢复后可将它们写入数据库。比分条和 Game Log 的更新又排在日结之后，因此会出现数据库已推进、页面仍停在赛前的状态。
3. Sim Next 没有处理 Worker Promise 的拒绝，连续 Play 的六个 API 入口没有等待 `game.play`。Stop 提前释放 `gameSim` 还允许第二个请求与尚未结算的请求重叠。
4. 同类遗漏包括：缓存对象先原地修改、`put` 前失败时回滚不恢复；IDB 同步写入异常没有取消已排队的写入；等待其它保存的自动保存没有重新检查暂停状态；部分伤病/事件写入未被等待；页面加载错误未释放 `viewManager` 队列；自由市场最终保存前过早提交缓存检查点；自动推进跨阶段时嵌套检查点。

确定性回归测试在修复前得到 5 个失败：每日缩短后的 PO/TO 未移除，以及 soft/hard/none 三种薪资帽下提交旧一年 PO 时均抛出上述原始错误。合法两年 PO/TO 的对照测试在修复前已经通过。

## 修复边界与行为

- 在 AI 需求和报价生成阶段移除不合法的选项，合法 PO/TO 保留。无薪资帽的陈旧期限也在报价阶段重新生成。补查 AI 续约缩短期限的路径；最低薪资、MLE、Bird、roster repair 和 two-way 继续通过既有合同生成器与最终验证。最终验证没有放宽，新增测试明确证明直接提交非法一年 PO/TO 仍被拒绝。
- 比赛日复用现有 `Cache.beginMutationCheckpoint()`，覆盖阵容准备、模拟、伤病/比赛统计、赛程删除、每日结算、进阶统计和季后赛日程生成。开启自动保存时，每天在一个 IDB 保存事务成功后提交缓存并发布 UI；后一天失败不撤销前一天。季后赛首次生成赛程也有独立恢复边界，并延后比分条更新。
- 日结前暂停自动保存并等待已经开始的保存结束。失败恢复对象、索引、脏标记和必要的运行时状态。事件/伤病通知缓冲至保存成功；通知或 UI 通信在保存后失败时保留已保存比赛，并重新读取比分与页面数据。自动保存关闭时仍保持原有的仅内存推进语义。
- 保存保留写入 token 检查；同步 IDB 异常会取消整个事务并等待其结束，脏状态可重试。缓存还保留旧联赛中尚未存入数据库的全局默认值。
- 普通 Play、Sim Next 和快捷键共用错误边界与重复请求保护；Stop 保持正在结算请求的锁，直到保存/停止完成。过期的单场季后赛请求会结束，避免意外落入其它比赛的模拟路径。跨阶段时移交锁，防止旧请求释放后续请求的锁。
- deferred AI 交易与签约在当天保存后一起发送 `gameSim`、`playerMovement`。比分条、Game Log 和球员变更视图由此在同一已提交状态上更新。
- 自由市场保存失败会回滚并解锁；跨阶段自动推进在上一检查点结束后再启动。交易截止日标记的删除也由阶段检查点保护。

## 用户存档验证

读取 `/Users/felixhuang/Downloads/BBGM_League_10_2019_regular_season_32-21.json.gz`，解压到内存并装载到独立临时联赛数据库。原件没有写入。

存档中 pid 267（Gerald Henderson）和 pid 1561（Boban Marjanović）均有 `exp: 2019` 的旧 PO，直接印证陈旧需求存在。测试执行真实 `play`、`decreaseDemands`、`autoSign`、签约最终验证、统计写入、保存和 Cache 重新填充路径；为必经 AI 签约分支，签约 pass 内固定随机值，随机 AI 交易被隔离。测试验证比赛数量/赛程变化匹配、旧选项清除、重新打开数据库后数据相同。

原文件前后 SHA-256：

`824eadc94e6d2e5120ab7d92185bf7c6b3e80780d5243dc7843a3494988cc696`

这不是原 Safari 会话的随机赛果重放。NYK–CHA 120–110 与 DEN 下一场的比分条行为另由真实 React 组件回归测试验证。

## 验证

- Chromium / Firefox / WebKit：UI、导航队列和既有整季流程共 27 项通过；原生 IndexedDB 失败恢复与重新打开另 3 项通过，总计 30 项。
- 本次所有新增/修改源码的 ESLint 检查通过；`git diff --check` 通过。
- 全仓 `tsc --noEmit` 仍报告其它文件的 339 条诊断，涉及已有 DataTable、Player/TopStuff、GameSim sweep 及研究/工具代码；本次新增/修改文件中为 0 条诊断。没有修改这些无关文件来取得全仓绿灯。
- 核心、合同、缓存、季后赛日程及用户存档回归：567 项通过、0 失败，1 个已有 200-game sweep 诊断用例按原条件跳过。最后一次整组执行返回成功。

核心回归（`--project basketball`，限定相关源码目录，避免运行用户未跟踪的研究实验）：

```bash
node_modules/.bin/vitest run --project basketball --maxWorkers=2 \
  src/worker/core/game src/worker/core/phase/newPhaseResignPlayers.test.ts \
  src/worker/core/freeAgents src/worker/core/contracts \
  src/worker/core/signingTransaction.test.ts \
  src/worker/core/team/checkRosterSizes.test.ts \
  src/worker/api/playMenu.advance.test.ts src/worker/db/Cache.test.ts \
  src/worker/core/season/newSchedulePlayoffsDay.test.ts
```

存档验证：

```bash
BBGM_RECOVERY_LEAGUE='/Users/felixhuang/Downloads/BBGM_League_10_2019_regular_season_32-21.json.gz' \
  node_modules/.bin/vitest run --project basketball src/worker/core/game/play.archive.test.ts
```

浏览器回归（Chromium、Firefox、WebKit 的原生 IndexedDB；含既有整季/休赛期/下一赛季流程）：

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/bbgm-playwright \
  node_modules/.bin/vitest run --project browser \
  src/ui/components/playAdvance.test.browser.ts \
  src/ui/util/viewManager.recovery.test.browser.ts \
  src/test/gameAdvanceRecovery.test.browser.ts \
  src/test/leagueYearGameplay.test.browser.ts
```

Playwright 浏览器仅安装到 `/tmp/bbgm-playwright`。UI 测试在实际 `promiseWorker.postMessage` 边界注入失败，并观察真实通知、导航、Zustand 状态与 React 组件；原生 IDB 测试不使用 fake-indexeddb。Node 侧事务回归使用 fake-indexeddb，并包含真实事务取消、同步 DataCloneError、开启自动保存后的等待/重试、伤病事件写入失败、保存后 UI 失败、重复推进、连续多天、截止日和阶段交接。

合同回归覆盖现有 SalaryFix、合同期限、最高薪资、例外条款、伤病合同市场、PO/TO、two-way 与 signing transaction 测试。

## 修改文件

- `src/test/gameAdvanceRecovery.test.browser.ts`
- `src/ui/components/BoxScoreNextButton.tsx`
- `src/ui/components/BoxScoreWrapper.tsx`
- `src/ui/components/PlayMenu.tsx`
- `src/ui/components/playAdvance.test.browser.ts`
- `src/ui/util/runPlayMenuAction.ts`
- `src/ui/util/viewManager.recovery.test.browser.ts`
- `src/ui/util/viewManager.tsx`
- `src/worker/api/playMenu.advance.test.ts`
- `src/worker/api/playMenu.ts`
- `src/worker/core/contracts/contractOption.ts`
- `src/worker/core/contracts/contractTerm.ts`
- `src/worker/core/freeAgents/advanceRecovery.test.ts`
- `src/worker/core/freeAgents/autoSign.ts`
- `src/worker/core/freeAgents/decreaseDemands.ts`
- `src/worker/core/freeAgents/play.test.ts`
- `src/worker/core/freeAgents/play.ts`
- `src/worker/core/game/loadTeams.ts`
- `src/worker/core/game/play.archive.test.ts`
- `src/worker/core/game/play.transaction.test.ts`
- `src/worker/core/game/play.ts`
- `src/worker/core/game/runDay.ts`
- `src/worker/core/game/writeGameStats.ts`
- `src/worker/core/game/writePlayerStats.ts`
- `src/worker/core/league/autoPlay.ts`
- `src/worker/core/phase/finalize.ts`
- `src/worker/core/phase/newPhase.ts`
- `src/worker/core/phase/newPhaseAfterTradeDeadline.ts`
- `src/worker/core/phase/newPhaseResignPlayers.ts`
- `src/worker/core/player/killOne.ts`
- `src/worker/core/season/newSchedulePlayoffsDay.ts`
- `src/worker/core/season/setSchedule.ts`
- `src/worker/core/signingTransaction.test.ts`
- `src/worker/core/signingTransaction.ts`
- `src/worker/core/team/updateClinchedPlayoffs.ts`
- `src/worker/db/Cache.test.ts`
- `src/worker/db/Cache.ts`
- `src/worker/util/lock.ts`
- `src/worker/util/logEvent.ts`

## 尚未证实与风险

- 原历史“伤病通知已出现、推进未结束、刷新后伤病丢失”的完整现场没有提供，不能断言它与本次合同错误同根。已用故障注入复现并验证：伤病/事件写入失败和后续日结失败的回滚、通知发布时点，以及三种浏览器中重开后的伤病持久化。
- WebKit 测试覆盖 Safari 的引擎与原生 IDB 行为；未重放用户原 Safari 标签页、Worker 被系统终止或设备断电的现场。
- 每个比赛日增加一次保存边界，连续模拟的 IDB 写入频率高于原先按请求末尾保存。整季流程已验证；没有进行长期多赛季性能基准。
- God Mode / Signing Page 修改预期 salary 不生效仍为独立待办，未纳入修复。
