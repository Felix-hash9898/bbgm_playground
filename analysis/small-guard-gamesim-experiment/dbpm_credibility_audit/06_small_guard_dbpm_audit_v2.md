# 小后卫 DBPM 可信度分层审计报告 (06_small_guard_dbpm_audit_v2.md)

本报告基于更精细的分层逻辑，对小后卫的 DBPM 表现进行精细化评估，避免将“在场正影响”与“单纯 box-score 投影冲突”混为一谈。

## 1. 细分分组统计结果 (Sub-Category Counts)

- **A1. 战境一致性可疑组 (A1_yogi_type_positive_context)**: **6 人**
  _(定义：DBPM > 0，DIQ <= 60，无 Dp，且 PM100 > 0 且 OnOff100 > 0)_
- **A2. Box-score 投影冲突组 (A2_box_proxy_positive_dbpm_negative_context)**: **12 人**
  _(定义：DBPM > 0，DIQ <= 60，无 Dp，但 PM100 <= 0 或 OnOff100 <= 0)_
- **A3. 低样本正值组 (A3_low_sample_positive_dbpm)**: **3 人**
  _(定义：DBPM > 0，DIQ <= 60，无 Dp，且 MPG < 12 或 GP < 20)_
- **B. 可信正防守组 (B_credible_positive_dbpm_small_guard)**: **8 人**
  _(定义：DBPM > 0，且 DIQ > 60 或有 Dp)_
- **C. 符合预期负防守组 (C_expected_negative_small_guard)**: **35 人**
  _(定义：DBPM <= 0，DIQ <= 60，无 Dp)_

## 2. 关键代表样本审计诊断

### Yogi Ferrell (pid 200) - 归入 **A1_yogi_type_positive_context**

- **数据特征**: DBPM: **+1.16**, PM100: **+10.14**, OnOff100: **+4.79**
- **审计判定**: **战境一致性可疑组 (A1)**。他在场时不仅 DBPM 录得正数，PHI 队的实际每百回合净胜分（PM100）和在场净胜效率（OnOff）也都是显著的正值。这说明他的优异高阶数据得到了“在场表现”的支持，但其底层 ratings（diq 54, hgt 29, 无Dp）依然不承认其防守，数据冲突属于典型的“强进攻/强团队光环掩盖了防守弱点”。

### Ja Morant (pid 1519) - 归入 **A2_box_proxy_positive_dbpm_negative_context**

- **数据特征**: DBPM: **+1.62**, PM100: **-2.67**, OnOff100: **-4.29**
- **审计判定**: **Box-score 投影冲突组 (A2)**。虽然他的 DBPM 拟合高达 **+1.62**，但当他在场时，灰熊队的 PM100 和 OnOff 都是**负值**。这属于典型的“个人刷了大量基础 box 统计（助攻、抢断）导致 Raw DBPM 虚高，但实际在场影响完全是负累”的冲突，无法用强队光环来解释。

### Cole Anthony (pid 719) - 归入 **A2_box_proxy_positive_dbpm_negative_context**

- **数据特征**: DBPM: **+0.97**, PM100: **-10.35**, OnOff100: **-1.07**
- **审计判定**: **Box-score 投影冲突组 (A2)**。同样的，Cole Anthony 也是 DBPM 刷得很好（+0.97），但在场净胜效率（PM100 -10.4）是严重负值。这进一步证实了 A2 组代表了公式本身的 proxy 缺陷，不应混为一谈。

## 3. 冲突与分层结论

1. **A1 (Yogi型) 属于“优异环境/强力进攻掩盖”**：
   这类球员在场时球队确实在赢分，OnOff 也是正的，但这是其强大的进攻组织效率（如 Yogi 的 OBPM 2.29）或与防守强人同场导致的，其正的 DBPM 并不是底层 GameSim 真实的防守输出。
2. **A2 (Morant型) 属于“单纯 Box-score Proxy 幻觉”**：
   这类球员在场时球队其实是在输分（OnOff 负），但由于他们的助攻、得分和抢断等 Raw BPM 加权项太高，回归公式强制推导出了一个正的 DBPM。这纯粹是回归公式的局限，甚至没有在场赢分作为事实支撑。
