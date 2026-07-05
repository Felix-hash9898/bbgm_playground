# Diagnostic 模拟运行与校验日志 (hgt_sensitivity_run_notes.md)

本日志详细记录了高阶指标（DBPM）可信度 300 场反事实折扣实验的运行日志及校验状态。

## 1. 校验项目

- [x] **PHI/BKN 跨队无重复**：每个 Variant 启动前，均求交双方的 pid 列表。交集全部为 0，完全通过检验。
- [x] **Roster Size 口径审计**：主实验组 roster size 均为 17。Yogi Ferrell 名单为 16，已记录。
- [x] **防守可信度打折控制**：仅扣减 diq， display height 和所有进攻 ratings 保持 100% 不变。OVR 和位置根据公式重新计算加载。

## 2. 运行日志明细

### Case: Yogi Ferrell (pid: 200)

- Group: suspicious
- Original ratings: OVR 61, POS: G, hgt: 29, diq: 54, skills: [3,Ps]
- Discounted ratings: diq = 39
- Discounted results: OVR 58, POS: G, skills: [3,Ps]
- Sim Results: Orig Win% = 39.7%, Disc Win% = 40.7%
- MPG: 27.95
- Win% Delta: 1.0%, Avg Margin Delta: 0.71

### Case: Ja Morant (pid: 1519)

- Group: suspicious
- Original ratings: OVR 69, POS: PG, hgt: 33, diq: 43, skills: [B,Ps,V]
- Discounted ratings: diq = 28
- Discounted results: OVR 66, POS: G, skills: [B,Ps,V]
- Sim Results: Orig Win% = 54.0%, Disc Win% = 56.3%
- MPG: 35.89
- Win% Delta: 2.3%, Avg Margin Delta: -0.22

### Case: Dennis Smith Jr. (pid: 594)

- Group: suspicious
- Original ratings: OVR 59, POS: PG, hgt: 33, diq: 56, skills: [Ps]
- Discounted ratings: diq = 40
- Discounted results: OVR 55, POS: G, skills: [Ps]
- Sim Results: Orig Win% = 38.7%, Disc Win% = 42.0%
- MPG: 25.68
- Win% Delta: 3.3%, Avg Margin Delta: 1.36

### Case: Cole Anthony (pid: 719)

- Group: suspicious
- Original ratings: OVR 61, POS: PG, hgt: 33, diq: 59, skills: []
- Discounted ratings: diq = 40
- Discounted results: OVR 57, POS: SG, skills: []
- Sim Results: Orig Win% = 47.7%, Disc Win% = 49.7%
- MPG: 28.38
- Win% Delta: 2.0%, Avg Margin Delta: 0.43

### Case: Saben Lee (pid: 1422)

- Group: credible
- Original ratings: OVR 74, POS: PG, hgt: 30, diq: 71, skills: [3,B,Dp,Ps,V]
- Discounted ratings: diq = 40
- Discounted results: OVR 68, POS: PG, skills: [3,B,Ps,V]
- Sim Results: Orig Win% = 59.0%, Disc Win% = 57.7%
- MPG: 37.46
- Win% Delta: -1.3%, Avg Margin Delta: -0.16

### Case: Terry Rozier (pid: 567)

- Group: credible
- Original ratings: OVR 67, POS: G, hgt: 34, diq: 68, skills: [3,Ps]
- Discounted ratings: diq = 40
- Discounted results: OVR 62, POS: SG, skills: [3,Ps]
- Sim Results: Orig Win% = 50.7%, Disc Win% = 48.7%
- MPG: 31.45
- Win% Delta: -2.0%, Avg Margin Delta: -0.54

### Case: Trae Young (pid: 1840)

- Group: credible
- Original ratings: OVR 73, POS: PG, hgt: 31, diq: 56, skills: [A,B,Dp,Po,Ps,V]
- Discounted ratings: diq = 40
- Discounted results: OVR 70, POS: PG, skills: [A,B,Dp,Po,Ps,V]
- Sim Results: Orig Win% = 60.7%, Disc Win% = 63.3%
- MPG: 36.18
- Win% Delta: 2.7%, Avg Margin Delta: 0.94

### Case: Jared Butler (pid: 812)

- Group: credible
- Original ratings: OVR 66, POS: G, hgt: 30, diq: 64, skills: [3,B,Ps,V]
- Discounted ratings: diq = 40
- Discounted results: OVR 61, POS: PG, skills: [3,B,Ps,V]
- Sim Results: Orig Win% = 49.7%, Disc Win% = 47.7%
- MPG: 30.87
- Win% Delta: -2.0%, Avg Margin Delta: -2.66

### Case: Stephen Curry (pid: 146)

- Group: negative
- Original ratings: OVR 61, POS: PG, hgt: 37, diq: 53, skills: [3,Ps,V]
- Discounted ratings: diq = 38
- Discounted results: OVR 58, POS: SG, skills: [3,Ps,V]
- Sim Results: Orig Win% = 45.7%, Disc Win% = 40.0%
- MPG: 27.05
- Win% Delta: -5.7%, Avg Margin Delta: -2.38

### Case: Darius Garland (pid: 1239)

- Group: negative
- Original ratings: OVR 58, POS: G, hgt: 33, diq: 53, skills: [3]
- Discounted ratings: diq = 38
- Discounted results: OVR 55, POS: G, skills: [3]
- Sim Results: Orig Win% = 44.0%, Disc Win% = 35.7%
- MPG: 25.23
- Win% Delta: -8.3%, Avg Margin Delta: -2.57

### Case: Kemba Walker (pid: 646)

- Group: negative
- Original ratings: OVR 57, POS: PG, hgt: 27, diq: 45, skills: [Ps]
- Discounted ratings: diq = 30
- Discounted results: OVR 54, POS: PG, skills: [Ps]
- Sim Results: Orig Win% = 45.3%, Disc Win% = 40.7%
- MPG: 20.55
- Win% Delta: -4.7%, Avg Margin Delta: -1.06

### Case: Miles McBride (pid: 1472)

- Group: negative
- Original ratings: OVR 58, POS: PG, hgt: 26, diq: 55, skills: [3]
- Discounted ratings: diq = 40
- Discounted results: OVR 55, POS: PG, skills: [3]
- Sim Results: Orig Win% = 40.7%, Disc Win% = 43.0%
- MPG: 20.32
- Win% Delta: 2.3%, Avg Margin Delta: 0.77
