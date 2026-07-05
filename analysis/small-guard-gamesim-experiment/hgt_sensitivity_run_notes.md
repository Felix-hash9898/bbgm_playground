# 身高敏感度 (Hgt Sensitivity) 运行与校验日志 (hgt_sensitivity_run_notes.md)

本日志详细记录了身高敏感度 1000 场 Matchup 对抗实验的数据库校验（Sanity Checks）及审计状态。

## 1. 严格交叉校验项目 (Sanity Checks Verification)

- [x] **PHI/BKN 阵容无交集 (Cross-Team Duplicate Check)**: 已对每组 Variant 启动前两队的所有球员 `pid` 进行求交计算。交集大小为 **0**，无任何跨队重复登场球员，完全通过检验。
- [x] **Roster Size 审计**: 主实验组 PHI/BKN 阵容规模为 **17 人 / 17 人**。Yogi Ferrell 校验组中，由于移除了原有的 Yogi Ferrell 以免重复，PHI 阵容规模变更为 **16 人**。此项不一致已被显式记录，符合方法论规范。
- [x] **Saben Height Counterfactual Isolator**: Saben 的物理展示身高 `p.hgt` 依然为 **74 英寸** (188 cm)，仅最新一行 ratings.hgt 在不同变体下被修改为 **30 / 29 / 22**，已通过字段验证。
- [x] **Variant Ratings & OVR Consistency**: 各变体在载入缓存前的 ratings 状态重算后，其 OVR 及徽章展现与候选人表一致。

## 2. 详细 Variant 运行日志

### Variant: Saben Lee

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Display Height: 74 inches (188 cm)
- Target Ratings: OVR 74, Pos: PG, ratings.hgt: 30, ratings.diq: 71
- Target Skills: [`3,B,Dp,Ps,V`]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 68.38
- **Sanity Checks Passed** (Cross-team intersection size: 0)
- **Simulation Sanity Check:** Target actual MPG = 37.56

### Variant: Saben_hgt_rating_only_30

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Display Height: 74 inches (188 cm)
- Target Ratings: OVR 74, Pos: PG, ratings.hgt: 30, ratings.diq: 71
- Target Skills: [`3,B,Dp,Ps,V`]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 68.38
- **Sanity Checks Passed** (Cross-team intersection size: 0)
- **Simulation Sanity Check:** Target actual MPG = 37.37

### Variant: Saben_hgt_rating_only_29

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Display Height: 74 inches (188 cm)
- Target Ratings: OVR 74, Pos: PG, ratings.hgt: 29, ratings.diq: 71
- Target Skills: [`3,B,Dp,Ps,V`]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 68.38
- **Sanity Checks Passed** (Cross-team intersection size: 0)
- **Simulation Sanity Check:** Target actual MPG = 37.33

### Variant: Saben_hgt_rating_only_22

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Display Height: 74 inches (188 cm)
- Target Ratings: OVR 72, Pos: PG, ratings.hgt: 22, ratings.diq: 71
- Target Skills: [`3,B,Dp,Ps,V`]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 66.95
- **Sanity Checks Passed** (Cross-team intersection size: 0)
- **Simulation Sanity Check:** Target actual MPG = 36.99

### Variant: Saben_hgt29_diq54

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Display Height: 74 inches (188 cm)
- Target Ratings: OVR 70, Pos: PG, ratings.hgt: 29, ratings.diq: 54
- Target Skills: [`3,B,Ps,V`]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 65.53
- **Sanity Checks Passed** (Cross-team intersection size: 0)
- **Simulation Sanity Check:** Target actual MPG = 36.05

### Variant: Saben_hgt22_diq54

- PHI Roster Size: 17
- BKN Roster Size: 17
- Target Player: Saben Lee (pid: 1422)
- Target Display Height: 74 inches (188 cm)
- Target Ratings: OVR 69, Pos: PG, ratings.hgt: 22, ratings.diq: 54
- Target Skills: [`3,B,Ps,V`]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 64.81
- **Sanity Checks Passed** (Cross-team intersection size: 0)
- **Simulation Sanity Check:** Target actual MPG = 35.51

### Variant: Yogi Ferrell

- PHI Roster Size: 16 (注: 较主实验少1人，非同口径)
- BKN Roster Size: 17
- Target Player: Yogi Ferrell (pid: 200)
- Target Display Height: 72 inches (182.9 cm)
- Target Ratings: OVR 61, Pos: G, ratings.hgt: 29, ratings.diq: 54
- Target Skills: [`3,Ps`]
- Role Audits: ptModifier = 1, usageBias = 1, valueNoPot = 56.56
- **Sanity Checks Passed** (Cross-team intersection size: 0)
- **Simulation Sanity Check:** Target actual MPG = 28.19
