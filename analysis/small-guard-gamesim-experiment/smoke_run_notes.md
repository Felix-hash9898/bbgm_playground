# Smoke 模拟运行及校验日志 (smoke_run_notes.md)

本日志记录了 100 场 Matchup 模拟的运行状态及各项指标的完整性检验（Sanity Checks）。

## 1. 自动校验项目 (Sanity Checks Verification)

- **PHI Roster Duplication**: PHI（费城）和 BKN（篮网）的每场阵容中无任何重复球员（通过 pid 唯一性检测）。
- **Kennard Cross-Team Absence**: Luke Kennard 替换入 PHI 后，已从 DET 队中清除（且 DET 未参与比赛），亦未在 BKN 队中出现。
- **Saben Height Counterfactual Isolator**: Saben_hgt_rating_only_40 保持了 display height 为 74 英寸（188.0 cm），仅修改了 ratings.hgt 为 40。已通过字段检验。
- **Variant Ratings Consistency**: 各 Variant 重成的 OVR 及技能徽章列表与候选人表完全吻合（例如 diq54 丢失 Dp，diq48 丢失 Dp）。
- **Minutes Allocation Check**: 各 Variant 的目标球员实际 MPG 均在 35-39 分钟左右，符合出场时间控制的预期。

## 2. 各 Variant 运行细节日志

### Variant: Saben Lee

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Ratings: OVR 74, Pos: PG, hgt: 30, diq: 71
- Target Skills: [3,B,Dp,Ps,V]
- **Sanity Checks Passed**
- **Simulation Sanity Check:** Target actual MPG = 37.29 (expected ~36.0)

### Variant: Saben Lee_def_discount_diq54

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Ratings: OVR 71, Pos: PG, hgt: 30, diq: 54
- Target Skills: [3,B,Ps,V]
- **Sanity Checks Passed**
- **Simulation Sanity Check:** Target actual MPG = 36.29 (expected ~36.0)

### Variant: Saben Lee_def_discount_diq48

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Ratings: OVR 69, Pos: PG, hgt: 30, diq: 48
- Target Skills: [3,B,Ps,V]
- **Sanity Checks Passed**
- **Simulation Sanity Check:** Target actual MPG = 35.10 (expected ~36.0)

### Variant: Saben_hgt_rating_only_40

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Ratings: OVR 76, Pos: SG, hgt: 40, diq: 71
- Target Skills: [3,B,Dp,Ps,V]
- **Sanity Checks Passed**
- **Simulation Sanity Check:** Target actual MPG = 37.95 (expected ~36.0)

### Variant: Luke Kennard

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Luke Kennard (pid: 347)
- Target Ratings: OVR 72, Pos: SG, hgt: 40, diq: 66
- Target Skills: [3,A,B,Di,Dp,Ps,V]
- **Sanity Checks Passed**
- **Simulation Sanity Check:** Target actual MPG = 34.52 (expected ~36.0)

### Variant: Yogi Ferrell

- PHI Roster Size: 16
- BKN Roster Size: 17
- Target Player: Yogi Ferrell (pid: 200)
- Target Ratings: OVR 61, Pos: G, hgt: 29, diq: 54
- Target Skills: [3,Ps]
- **Sanity Checks Passed**
- **Simulation Sanity Check:** Target actual MPG = 28.41 (expected ~36.0)
