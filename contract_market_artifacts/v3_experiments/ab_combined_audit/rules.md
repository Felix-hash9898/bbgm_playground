# V3-AB combined first-layer audit rules

Scope: artifact-only audit. This combines V3-1A HIGH_END_ROTATION and V3-1B-narrow-B SOLID_STARTER. It does not modify src, formal scoreTier, formal MODEL_TIERS, sandbox v2, existing score CSVs, sampling, or temp files.

## Shared precedence

- Start from original current scoreTier.
- 1A and 1B-B eligibility both use original current tier.
- 1A output cannot feed 1B-B.
- 1B-B output cannot feed 1A.
- Any player hitting both modules is recorded as conflict.

## Module 1: V3-1A HIGH_END_ROTATION

- Uses the original candidate_1A dry-run gate.
- Temporary range: 7%-12% cap.
- Protected tiers: SUPERSTAR_MAX, STAR_NEAR_MAX, YOUNG_PROVEN_STARTER, LOW_END_STARTER.
- Hard floor: GP >= 45, MPG >= 18, valueNoPot >= 52, getContractValue >= 52 or value >= 54, and not PER < 9 with BPM < -3.
- Extra MINIMUM_LEVEL floor: MPG >= 22, valueNoPot >= 55, contractValue >= 55, and EWA >= 2 or VORP >= .2 or BPM >= -.5.
- Required groups: real role support, core identity, value/production support, and support score >= 3.

## Module 2: V3-1B-narrow-B SOLID_STARTER

- Only original current LOW_END_STARTER is eligible.
- Temporary range: 12%-17% cap.
- GP >= 55
- MPG >= 29
- valueNoPot >= 60
- getContractValue >= 60
- role core: starterShare >= .65 or GS >= 50 or MPG >= 31
- production core: at least 2 of BPM >= 1, EWA >= 5, VORP >= 1, PER >= 16
- extra support: at least 1 of BPM >= 1.5, EWA >= 6, VORP >= 1.5, PER >= 17, defense/rebounding/connector support, shooting/spacing support, age <= 27 with value/pot support
- BPM < 0 blocks ordinary path unless the rare exception path passes.

No human labels, trade value, pid, name, or caseId are used as rule inputs.
