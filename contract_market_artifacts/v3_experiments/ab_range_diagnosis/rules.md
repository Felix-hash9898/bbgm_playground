# V3-AB range diagnosis rules

This script diagnoses V3-AB range, placement, and team top15 implied payroll only.

- First layer is fixed as V3-AB: 1A HIGH_END_ROTATION plus 1B-narrow-B SOLID_STARTER.
- HIGH_END_ROTATION baseline temporary range: 7%-12% cap.
- SOLID_STARTER baseline temporary range: 12%-17% cap.
- Near-boundary miss: gap <= $1M or <= 0.75% cap.
- Team top15 selection is fixed by tid >= 0, regular-season stats, MPG desc, valueNoPot desc, GP desc. It does not use candidate contract point.
- Team payroll thresholds are diagnostic only: <=110 low/conservative, 110-130 normal-ish, 130-145 elevated, 145-160 high_risk, >=160 likely_bad, >=180 extreme_bad.
- Optional range sweep is diagnostic and does not imply a rule change.
