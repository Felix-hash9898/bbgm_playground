# candidate_1A HIGH_END_ROTATION dry-run rules

Scope: artifact-only ablation. This script tests one candidate-only tier, `HIGH_END_ROTATION`, mapped to 7%-12% cap. It does not modify `src/`, formal `scoreTier`, formal `MODEL_TIERS`, sandbox v2, existing v1/v2 score CSVs, or sampling.

## Preserved current tiers

`SUPERSTAR_MAX`, `STAR_NEAR_MAX`, `YOUNG_PROVEN_STARTER`, `LOW_END_STARTER`, `SPECIALIST_ROTATION`, `YOUNG_UPSIDE_SUSPECT`, `VETERAN_ROTATION_GUARD`, `LOW_ROTATION_PLUS`, `VETERAN_MINIMUM_PLUS`, and `MINIMUM_LEVEL` all use current `scoreTier`.

## New candidate-only lane

`HIGH_END_ROTATION` can only override current tiers below `LOW_END_STARTER`. Current `LOW_END_STARTER` and above are protected in 1A so this remains a high-end rotation ablation, not a starter bridge experiment.

Hard floor:

- GP >= 45
- MPG >= 18
- valueNoPot >= 52
- getContractValue >= 52 or value >= 54
- not (PER < 9 and BPM < -3)

Extra floor for current `MINIMUM_LEVEL`:

- MPG >= 22
- valueNoPot >= 55
- getContractValue >= 55
- EWA >= 2 or VORP >= 0.2 or BPM >= -0.5

Required groups:

- real role support: GP >= 50 and MPG >= 22, or MPG >= 22, or GP >= 55 and MPG >= 20
- at least one core identity:
  - creator/scorer core: USG >= 22 and PTS >= 12, or AST% >= 18, or AST >= 4
  - portable shooting core: comp_shootingThreePointer >= 0.64, skill_3_margin >= 0.04, and TS >= .54
  - young productive core: age <= 25, MPG >= 18, and EWA >= 1.5 or BPM >= -1 or value >= 57
  - connector/defense core: composite defense/rebounding/passing/impact support with MPG >= 20 and non-negative value support
- at least one value/production support:
  - valueNoPot >= 55
  - getContractValue >= 55
  - EWA >= 2 or VORP >= 0.2 or BPM >= -0.5 or PER >= 14
- support score >= 3, but role/core/value-production groups are separate required gates.

No human labels, trade value, pid, name, or caseId are used as rule inputs.
