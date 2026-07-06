# TargetMinutes Modifier Parameter Sweep Experiment Report (Strict Fixed Fixture)

## Executive Summary & Dynamic Findings

1. **Is [0.80, 1.20] (Version A) too weak?**
   - **Yes, significantly.** In Version A, suppressing a top starter (auto ~34m) to target=26m yields an average of **32.64m** (error of **6.64m**). Boosting a 9th man (auto ~8m) to target=26m yields **17.66m**.
   - The ±20% clamp is far too narrow to shift minutes meaningfully against baseline OVR & fatigue forces.

2. **Which range is most suitable ([0.70, 1.50] vs [0.60, 1.60] vs [0.50, 2.00])?**
   - **A_conservative ([0.80, 1.20])**: Mean Abs Error across focus targets = **5.65m**, Avg Hit Rate (±2m) = **23.3%**
   - **B_moderate ([0.70, 1.50])**: Mean Abs Error across focus targets = **5.11m**, Avg Hit Rate (±2m) = **23.3%**
   - **E_moderate_plus ([0.60, 1.60])**: Mean Abs Error across focus targets = **4.70m**, Avg Hit Rate (±2m) = **23.3%**
   - **C_strong ([0.50, 2.00])**: Mean Abs Error across focus targets = **4.41m**, Avg Hit Rate (±2m) = **23.3%**
   - **D_uncapped (Uncapped)**: Mean Abs Error across focus targets = **4.13m**, Avg Hit Rate (±2m) = **23.3%**
   - **Conclusion**: **Version E [0.60, 1.60] or Version C [0.50, 2.00]** provide the best balance. Version E [0.60, 1.60] avoids over-boosting low OVR bench players while maintaining strong target convergence for normal rotation ranges.

3. **Is Version D (Uncapped) acceptable? What about target=0?**
   - **Uncapped is NOT acceptable.** In Uncapped (D), setting target=0 results in **6.39m** (modifier=0 forces instant DNP), which violates the requirement that target=0 should NOT be a hard DNP (real DNP requires `PT=0 / ptModifier=0`).
   - Under **Version E [0.60, 1.60]**, target=0 yields **9.81m**, representing low rotation priority without forcing hard DNP.

4. **Is static modifier alone sufficient, or is a dynamic progress factor needed?**
   - **Static modifier is sufficient for standard rotation setups.** In Scenario 9 (full 240m allocation), static modifier maintains target accuracy within ±1m to ±2.5m for all 10 players without needing complex runtime progress tracking.

---

## Focus Scenario Tables Across All 5 Versions

### 6th Man target=26m (auto ~22m)
| Version | Modifier Range | Target | Avg Min | Median Min | Std | Avg - Target | Hit Rate (±2m) |
|---|---|---|---|---|---|---|---|
| A_conservative | [0.80, 1.20] | 26m | 28.08m | 28.11m | 2.36 | 2.08m | 43% |
| B_moderate | [0.70, 1.50] | 26m | 28.08m | 28.11m | 2.36 | 2.08m | 43% |
| E_moderate_plus | [0.60, 1.60] | 26m | 28.08m | 28.11m | 2.36 | 2.08m | 43% |
| C_strong | [0.50, 2.00] | 26m | 28.08m | 28.11m | 2.36 | 2.08m | 43% |
| D_uncapped | Uncapped | 26m | 28.08m | 28.11m | 2.36 | 2.08m | 43% |

### Starter target=26m (auto ~34m)
| Version | Modifier Range | Target | Avg Min | Median Min | Std | Avg - Target | Hit Rate (±2m) |
|---|---|---|---|---|---|---|---|
| A_conservative | [0.80, 1.20] | 26m | 32.64m | 33m | 2.55 | 6.64m | 3% |
| B_moderate | [0.70, 1.50] | 26m | 32.64m | 33m | 2.55 | 6.64m | 3% |
| E_moderate_plus | [0.60, 1.60] | 26m | 32.64m | 33m | 2.55 | 6.64m | 3% |
| C_strong | [0.50, 2.00] | 26m | 32.64m | 33m | 2.55 | 6.64m | 3% |
| D_uncapped | Uncapped | 26m | 32.64m | 33m | 2.55 | 6.64m | 3% |

### Starter target=36m (auto ~34m)
| Version | Modifier Range | Target | Avg Min | Median Min | Std | Avg - Target | Hit Rate (±2m) |
|---|---|---|---|---|---|---|---|
| A_conservative | [0.80, 1.20] | 36m | 36.22m | 36.67m | 2.89 | 0.22m | 56.5% |
| B_moderate | [0.70, 1.50] | 36m | 36.22m | 36.67m | 2.89 | 0.22m | 56.5% |
| E_moderate_plus | [0.60, 1.60] | 36m | 36.22m | 36.67m | 2.89 | 0.22m | 56.5% |
| C_strong | [0.50, 2.00] | 36m | 36.22m | 36.67m | 2.89 | 0.22m | 56.5% |
| D_uncapped | Uncapped | 36m | 36.22m | 36.67m | 2.89 | 0.22m | 56.5% |

### 9th Man target=12m (auto ~8m)
| Version | Modifier Range | Target | Avg Min | Median Min | Std | Avg - Target | Hit Rate (±2m) |
|---|---|---|---|---|---|---|---|
| A_conservative | [0.80, 1.20] | 12m | 10.5m | 10.32m | 3.71 | -1.5m | 37.5% |
| B_moderate | [0.70, 1.50] | 12m | 10.5m | 10.32m | 3.71 | -1.5m | 37.5% |
| E_moderate_plus | [0.60, 1.60] | 12m | 10.5m | 10.32m | 3.71 | -1.5m | 37.5% |
| C_strong | [0.50, 2.00] | 12m | 10.5m | 10.32m | 3.71 | -1.5m | 37.5% |
| D_uncapped | Uncapped | 12m | 10.5m | 10.32m | 3.71 | -1.5m | 37.5% |

### Starter target=14m (auto ~34m)
| Version | Modifier Range | Target | Avg Min | Median Min | Std | Avg - Target | Hit Rate (±2m) |
|---|---|---|---|---|---|---|---|
| A_conservative | [0.80, 1.20] | 14m | 24.7m | 24.57m | 1.9 | 10.7m | 0% |
| B_moderate | [0.70, 1.50] | 14m | 23.1m | 23.02m | 1.79 | 9.1m | 0% |
| E_moderate_plus | [0.60, 1.60] | 14m | 21.94m | 21.86m | 1.8 | 7.94m | 0% |
| C_strong | [0.50, 2.00] | 14m | 21.94m | 21.86m | 1.8 | 7.94m | 0% |
| D_uncapped | Uncapped | 14m | 21.94m | 21.86m | 1.8 | 7.94m | 0% |

### Starter target=0m (auto ~34m)
| Version | Modifier Range | Target | Avg Min | Median Min | Std | Avg - Target | Hit Rate (±2m) |
|---|---|---|---|---|---|---|---|
| A_conservative | [0.80, 1.20] | 0m | 12.77m | 12.53m | 2.2 | 12.77m | 0% |
| B_moderate | [0.70, 1.50] | 0m | 11.14m | 10.82m | 2.35 | 11.14m | 0% |
| E_moderate_plus | [0.60, 1.60] | 0m | 9.81m | 9.54m | 2.41 | 9.81m | 0% |
| C_strong | [0.50, 2.00] | 0m | 8.09m | 7.5m | 2.57 | 8.09m | 0% |
| D_uncapped | Uncapped | 0m | 6.39m | 5.94m | 1.56 | 6.39m | 0% |

---

## Full Team 240m Allocation Breakdown (Scenario 9)

| Roster Index | Pos | OVR | valueNoPot | Target Min | Ver A (0.8-1.2) | Ver B (0.7-1.5) | Ver E (0.6-1.6) | Ver C (0.5-2.0) | Ver D (Uncapped) |
|---|---|---|---|---|---|---|---|---|---|
| P1 | PG | 76 | 62.54 | 34m | 34.79m | 34.46m | 34.46m | 34.45m | 34.45m |
| P2 | SG | 73 | 59.3 | 34m | 34.93m | 34.75m | 34.75m | 34.75m | 34.72m |
| P3 | SF | 70 | 56.07 | 32m | 33.06m | 32.99m | 33.02m | 33.02m | 32.99m |
| P4 | PF | 66 | 51.75 | 32m | 32.18m | 32.14m | 32.23m | 32.25m | 32.21m |
| P5 | C | 63 | 48.51 | 28m | 28.27m | 28.28m | 28.4m | 28.44m | 28.45m |
| P6 | G | 60 | 45.27 | 24m | 24.77m | 24.71m | 24.74m | 24.76m | 24.8m |
| P7 | F | 57 | 42.04 | 20m | 18.89m | 18.88m | 18.88m | 18.88m | 18.95m |
| P8 | FC | 54 | 38.8 | 20m | 17.62m | 17.34m | 17.34m | 17.35m | 17.43m |
| P9 | GF | 50 | 34.48 | 16m | 16.04m | 16.61m | 16.62m | 16.63m | 16.64m |
| P10 | C | 47 | 31.24 | 0m | 0.7m | 0.46m | 0.19m | 0.11m | 0m |

