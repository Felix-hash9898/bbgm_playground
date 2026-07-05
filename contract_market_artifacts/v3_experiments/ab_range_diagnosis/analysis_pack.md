# V3-AB range diagnosis analysis pack

## Main read

- Labeled cases: 48
- Tier diagnosis rows: 12
- Placement diagnosis rows: 48
- Team top15 rows: 30
- Outlier teams >=145%: 0
- Range sweep rows: 16

## Recommended sequence

1. Review `tier_range_diagnosis.csv` for tier-level range issues.
2. Review `placement_diagnosis.csv` for point-placement decomposition.
3. Review `team_payroll_outliers.csv` and `team_delta_attribution.csv` before considering any range change.
4. Use `range_sweep_optional.csv` only as diagnostic support.
5. Do blind validation/test only after deciding whether range/placement needs a sandbox revision.
