# Standard 1000场模拟运行与角色审计日志 (standard_run_notes.md)

本日志详细记录了标准 1000 场 Matchup 对抗实验的数据库校验（Sanity Checks）及审计状态。

## 1. 严格交叉校验项目 (Sanity Checks Verification)

- [x] **PHI/BKN 阵容无交集 (Cross-Team Duplicate Check)**: 已对每组 Variant 启动前两队的所有球员 `pid` 进行求交计算。交集大小为 **0**，证明无任何跨队重复登场球员，完全通过检验。
- [x] **Roster Size 审计**: 主实验组 PHI/BKN 阵容规模为 **17 人 / 17 人**。Yogi Ferrell 校验组中，由于移除了原有的 Yogi Ferrell 以免重复，PHI 阵容规模变更为 **16 人**。此项不一致已被显式记录，符合方法论规范。
- [x] **Saben Height Counterfactual Isolator**: `Saben_hgt_rating_only_40` 变体的物理展示身高 `p.hgt` 依然为 **74 英寸** (188 cm)，仅最新一行 ratings.hgt 修改为 **40**，确认机制隔离成功。
- [x] **Variant Ratings & OVR Consistency**: 各变体在载入缓存前的 ratings 状态重算后，其 OVR 及徽章展现与候选人表一致。

## 2. 详细 Variant 运行日志

### Variant: Saben Lee

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Ratings: OVR 74, Pos: PG, hgt: 30, diq: 71
- Target Skills: [3,B,Dp,Ps,V]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 68.38
- **Sanity Checks Passed** (Cross-team intersection is empty)
- **Simulation Sanity Check:** Target actual MPG = 37.42

### Variant: Saben Lee_def_discount_diq54

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Ratings: OVR 71, Pos: PG, hgt: 30, diq: 54
- Target Skills: [3,B,Ps,V]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 66.24
- **Sanity Checks Passed** (Cross-team intersection is empty)
- **Simulation Sanity Check:** Target actual MPG = 36.43

### Variant: Saben Lee_def_discount_diq48

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Ratings: OVR 69, Pos: PG, hgt: 30, diq: 48
- Target Skills: [3,B,Ps,V]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 64.81
- **Sanity Checks Passed** (Cross-team intersection is empty)
- **Simulation Sanity Check:** Target actual MPG = 35.44

### Variant: Saben_hgt_rating_only_40

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Ratings: OVR 76, Pos: SG, hgt: 40, diq: 71
- Target Skills: [3,B,Dp,Ps,V]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 69.8
- **Sanity Checks Passed** (Cross-team intersection is empty)
- **Simulation Sanity Check:** Target actual MPG = 37.49

### Variant: Luke Kennard

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Luke Kennard (pid: 347)
- Target Ratings: OVR 72, Pos: SG, hgt: 40, diq: 66
- Target Skills: [3,A,B,Di,Dp,Ps,V]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 66.35
- **Sanity Checks Passed** (Cross-team intersection is empty)
- **Simulation Sanity Check:** Target actual MPG = 34.78

### Variant: Yogi Ferrell

- PHI Roster Size: 16 (注: 较主实验少1人，非同口径)
- BKN Roster Size: 17
- Target Player: Yogi Ferrell (pid: 200)
- Target Ratings: OVR 61, Pos: G, hgt: 29, diq: 54
- Target Skills: [3,Ps]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 56.59
- **Sanity Checks Passed** (Cross-team intersection is empty)
- **Simulation Sanity Check:** Target actual MPG = 27.97
