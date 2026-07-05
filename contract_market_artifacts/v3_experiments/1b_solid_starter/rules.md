# V3-1B SOLID_STARTER dry-run rules

Scope: artifact-only first-layer ablation. This tests one candidate-only tier, `SOLID_STARTER`, mapped to 12%-17% cap. It does not modify `src/`, formal `scoreTier`, formal `MODEL_TIERS`, sandbox v2, existing v1/v2 score CSVs, or sampling.

## Preserved current tiers

All current `scoreTier` tiers are preserved unless a player passes the candidate-only `SOLID_STARTER` gate. This run does not enable 1A `HIGH_END_ROTATION`, does not create `HIGH_IMPACT_STARTER`, does not relax `LOW_END_STARTER`, and does not relax `LOW_ROTATION_PLUS`.

## SOLID_STARTER gate

Eligible pool:

- current tier must be `LOW_END_STARTER`; or
- narrowly `VETERAN_ROTATION_GUARD` with MPG >= 28 and starterShare >= .35 or GS >= 20.

Blocked by design:

- current `MINIMUM_LEVEL`
- current `LOW_ROTATION_PLUS`
- current `YOUNG_UPSIDE_SUSPECT`
- current `YOUNG_PROVEN_STARTER`, `STAR_NEAR_MAX`, `SUPERSTAR_MAX`

Hard floor:

- GP >= 50
- MPG >= 26
- valueNoPot >= 57
- getContractValue >= 57
- not (PER < 10 and BPM < -2)

Required groups:

- role core: starterShare >= .45, GS >= 30, or MPG >= 29
- value core: valueNoPot >= 57 and getContractValue >= 57
- production support: EWA >= 3, VORP >= .5, BPM >= 0, or PER >= 14
- extra support: BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16, defense/rebounding/connector support, shooting/spacing support, or age <= 27 with value/pot support

No human labels, trade value, pid, name, or caseId are used as rule inputs.
