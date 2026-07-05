# V3-1B-narrow SOLID_STARTER sweep rules

Scope: artifact-only sweep. This tests three candidate-only SOLID_STARTER variants mapped to 12%-17% cap. It does not modify src, formal scoreTier, formal MODEL_TIERS, sandbox v2, existing score CSVs, or sampling.

Common hard blocks:

- Only current LOW_END_STARTER can enter SOLID_STARTER.
- MINIMUM_LEVEL, LOW_ROTATION_PLUS, YOUNG_UPSIDE_SUSPECT, VETERAN_ROTATION_GUARD, YOUNG_PROVEN_STARTER, STAR_NEAR_MAX, and SUPERSTAR_MAX are blocked.
- 1A HIGH_END_ROTATION is not enabled.
- HIGH_IMPACT_STARTER is not created.
- LOW_END_STARTER and LOW_ROTATION_PLUS are not relaxed.

## Variant A: moderate narrow

- GP >= 55, MPG >= 28, valueNoPot >= 59, contractValue >= 59
- role core: starterShare >= .60 or GS >= 41 or MPG >= 30
- production core: at least 2 of BPM >= .5, EWA >= 4, VORP >= .8, PER >= 15.5
- extra support: at least 1 of BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16, defense/rebounding/connector, shooting/spacing, age <= 27 with value/pot
- BPM < 0 blocks ordinary path unless exception path passes.

## Variant B: normal strict

- GP >= 55, MPG >= 29, valueNoPot >= 60, contractValue >= 60
- role core: starterShare >= .65 or GS >= 50 or MPG >= 31
- production core: at least 2 of BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16
- extra support: at least 1 of BPM >= 1.5, EWA >= 6, VORP >= 1.5, PER >= 17, defense/rebounding/connector, shooting/spacing, age <= 27 with value/pot
- BPM < 0 blocks ordinary path unless exception path passes.

## Variant C: very strict

- GP >= 60, MPG >= 30, valueNoPot >= 61, contractValue >= 61
- role core: starterShare >= .70 or GS >= 55 or MPG >= 32
- production core: at least 3 of BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16
- extra support: at least 1 of BPM >= 2, EWA >= 7, VORP >= 2, PER >= 18, defense/rebounding/connector, shooting/spacing
- BPM < 0 is not allowed in ordinary path.

## Exception path for A/B only

If BPM < 0, a player can enter only with current LOW_END_STARTER, MPG >= 30, valueNoPot >= 61, contractValue >= 61, EWA >= 5 or VORP >= 1 or PER >= 17, defense/rebounding/connector or shooting/spacing support, and PER >= 12.

No human labels, trade value, pid, name, or caseId are used as rule inputs.
