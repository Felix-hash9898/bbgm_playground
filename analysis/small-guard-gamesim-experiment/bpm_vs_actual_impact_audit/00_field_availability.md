# 可用字段与分析限制确认报告 (00_field_availability.md)

本报告详细梳理了 BBGM 存档中与球员“实际在场影响（on-court impact）”相关的可用字段，并评估了分析方法的限制。

## 1. 字段可用性核对列表 (Field Check)

根据对真实存档 `real_saves/BBGM_League_3_2025_re_sign_players.json.gz` 结构和 BBGM 源码 `advStats.basketball.ts` 的核对：

- **bpm / obpm / dbpm**: 存档中直接存储了 `obpm` 和 `dbpm`，球员总 `bpm` 可由 `obpm + dbpm` 衍生得出。
- **pm (Plus-Minus)**: 存档中存储了球员赛季累计净胜分 `pm`。
- **min**: 存档中存储了球员赛季累计上场时间 `min`。
- **pm100**: 存档中存储了 `pm100`（即球员在场时每 100 回合球队的净胜分，根据 `(100 / pace) * 48 * (pm / min)` 计算）。
- **onOff100**: 存档中存储了 `onOff100`（即球员在场与不在场时，球队每 100 回合净胜分的差值）。
- **ortg / drtg**: 存档中存储了球员的 `ortg` 和 `drtg`。
  - **重要发现**：这里的 `drtg` 是根据 Dean Oliver 的经典 Box-score 估算公式（结合球员的抢断、盖帽、防守篮板、犯规以及球队整体防守数据）计算出的**防守效率投影**，并不是真实的在场球队防守失分（on-court defensive rating）。
- **在场防守分拆字段 (On-Court Defensive Split)**: **不包含**。存档中没有记录球员在场时球队的实际失分或对手命中率等防守端在场细节。
- **Lineup / Play-by-Play / Stint-level Data**: **不包含**。存档虽包含常规赛的简要 box score (`d.games`)，但并不存储每个回合的实时对阵名单、攻防事件流或阵容 stint 数据。

---

## 2. 核心问题回答

### Q1: 存档里能不能直接观察“Yogi 在场时球队防守失分（On-court DRtg / Points Allowed）”？

**不能**。存档中的 `drtg` 是纯粹的 box-score 多元线性公式估算值（代理变量），球员的 `pm` 则是攻防混合的净值。没有任何字段直接记录球员在场时团队防守端的实际表现。

### Q2: 存档里能不能做 lineup-controlled RAPM 类分析？

**不能**。由于缺乏 stint 级别的阵容交替数据与逐回合对位事件流，无法通过解线性方程组或岭回归等方法剥离同场队友和对手的质量，不能进行真正的 Lineup-Controlled RAPM (正则化调整正负值) 计算。

### Q3: 审计分析的代理边界说明

**本项目只能使用 `pm100`、`onOff100`、`pm` 和 `min` 作为球员在场实际表现（Actual On-Court Impact）的 Proxy。由于缺乏 lineup 级别的对照，所有在场指标均包含强烈的队友光环效应，无法声称完成了真正的队友控制（lineup control）分析。**
