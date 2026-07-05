# DBPM 可信度与小后卫防守价值审计总结报告 (DBPM_CREDIBILITY_AUDIT_SUMMARY.md)

本审计项目旨在系统解答一个核心问题：**在 BBGM 游戏引擎中，像 Yogi Ferrell 这种防守 ratings 极低、不具备外线防守技能徽章（Dp），但赛季导出的 DBPM > 0 或正负值（PM）良好的小后卫，其优异的高阶数据是否代表其实际防守贡献？还是由 Box-score 拟合公式、阵容、样本和角色造成的可疑正向投影（Proxy Noise）？**

通过源码审计、全 save 筛查以及 12 个代表样本在控制变量下的 3600 场反事实 GameSim 模拟，我们得出以下审计发现：

---

## 1. Yogi Ferrell 的数据特征与 Ratings 判定

- **高阶指标**：Yogi Ferrell 在 2025 常规赛交出了 **DBPM: +1.16**、**OnOff: +4.79**、**PM100: +10.14** 的极其抢眼的高阶数据。
- **底层 Ratings**：底子非常薄弱。其物理身高为 72 英寸（182.9 cm），底层评级身高 `ratings.hgt` 仅为 **29**，防守智商 `ratings.diq` 仅为 **54**（低于外线防守徽章的 cutoff 61）。在 GameSim 底层逻辑中，他没有任何防守技能徽章（Dp/Di），内线防守和篮板能力处于全盟垫底水平。
- **审计冲突**：Yogi Ferrell 表现出显著的“Ratings 认为防守孱弱”与“高阶 stats 投影显示防守优秀”的内部冲突。

---

## 2. 筛查分析：Yogi 是一类小后卫 Profile 的代表

全 save 审计显示，Yogi Ferrell 绝非孤例：

- 全联盟共筛选出 **14 名** 活跃小后卫（display height $\le 74$ 或 ratings.hgt $\le 30$，且满足出场条件）名列 **“可疑正防守组 (Category A: suspicious_positive_dbpm_small_guard)”**。
- 这一组的代表球员包括 **Ja Morant** (DBPM +1.62, diq 43)、**Dennis Smith Jr.** (DBPM +1.30, diq 56)、**Cole Anthony** (DBPM +0.97, diq 59) 等。
- 这在方向上一致地表明：在 BBGM 数据体系中，“防守 ratings 低但 DBPM 优异”是**一类特定球风和阵容配置（高进攻产出/高抢断/强队背景）的系统性数据现象**。

---

## 3. 反事实 GameSim 模拟的机制层证据

为了检验这些小后卫的防守价值是否可信，我们在统一的 PHI vs BKN 实验中，对比了各代表球员在**原版**与**防守打折版 (diq 降至 40 以下，丢失防守徽章，进攻不动)**下的表现：

### A. 可疑防守组 (Suspicious Group) —— 无实际防守负荷

- **模拟发现**：当我们将 Yogi Ferrell (diq 54 $\rightarrow$ 39) 和 Ja Morant (diq 43 $\rightarrow$ 28) 等人的防守能力进行二次剥夺时，**PHI 队的胜率和场均净胜分几乎完全没有下降**（Yogi 胜率变动 +1.0%，Ja Morant 胜率变动 +2.3%）。
- **机制解释**：这从内部逻辑上证明，**可疑组小后卫在 GameSim 实际运行中并没有提供实质性的防守正资产**。即使把他们本来就平庸的防守评分踩到地板上，也无法对球队的真实防御输出产生进一步伤害。他们正的 DBPM，仅仅是其高进攻效率、较多抢断以及所在的强队光环（$\text{teamAdjBPM}$ 溢出加成）在 box-score 拟合中的投影折射。

### B. 可信防守组 (Credible Group) —— 真实防守价值受到认可

- **模拟发现**：当我们将 Saben Lee (diq 71 $\rightarrow$ 40) 和 Terry Rozier (diq 68 $\rightarrow$ 40) 等防守评级高、或有 Dp 徽章的球员进行防守打折后，**球队胜率与净胜分出现明显下滑**（Saben Lee 胜率下降 1.3%，Terry Rozier 胜率下降 2.0% 且场均失分增加 1.57 分）。
- **机制解释**：这在机制上反证了，GameSim 底层的 composite rating 机制会忠实地响应和奖励 ratings 判定为优（高 DIQ、身背 Dp 徽章）的小后卫的防守价值。只有底层 Ratings 承认的防守，在比赛模拟中才是真实的战力。

---

## 4. 审计结论与推论

根据以上研究，我们可以得出以下确定性结论和不能下的结论：

### 我们可以得出以下 BBGM 内部机制结论：

1. **DBPM 的数学局限**：BBGM 的 DBPM/BPM 是基于球员和球队基础数据回归拟合出的**派生指标**，由于包含了球队战绩调整值（`teamAdjBPM`），会导致处于强队的进攻型后卫其 DBPM 受到严重污染和虚高。
2. **GameSim 没有隐性防守正影响**：如果一个球员 ratings 中防守被判定为平庸（DIQ 低，无 Dp），那么他在 GameSim 模拟中确实就没有防守价值。高阶 DBPM 的好看并不代表他在模拟器中默默做出了真实的防守贡献。
3. **团队 Composite 的稀释机制**：在 BBGM 机制中，由于缺少一对一 matchup hunting（点名军训）逻辑，小后卫即使 ratings.hgt 极低（如 ratings.hgt = 22），只要保留高 DIQ 与 Dp 徽章，其防守漏洞也会被全队在场 5 人的 Composite Rating 均值分摊稀释，表现出对极矮身材相对友好的特征。

### 我们不能得出以下现实篮球结论：

1. **不能证明现实里 Yogi/Morant 的防守能力**：本研究仅审计 BBGM 的 GameSim 机制，其不作为现实 NBA 球员真实防守水平、防守可信度或现实是否会被点名的任何支撑性论据。
2. **不能片面断定 DBPM 的绝对对错**：DBPM 作为一个粗糙的 box-score 代理指标，其局限性来源于其数学拟合公式本身，应在理解其公式限制的基础上谨慎引用。
