# V3-1B SOLID_STARTER analysis pack

## One-page summary

- Experiment: one-lane ablation for `SOLID_STARTER`.
- Range: 12%-17% cap, dry-run only.
- Entrants: 43 all-active.
- Upgrades: 43 all-active.
- LOW_END_STARTER -> SOLID_STARTER: 43.
- MINIMUM_LEVEL -> SOLID_STARTER: 0.
- YOUNG_UPSIDE_SUSPECT -> SOLID_STARTER: 0.
- Labeled severe: 4 -> 2.
- Labeled too_high: 7 -> 11.
- Verdict: unsafe.

## Exact V3-1B rule

See `rules.md`.

## Exact differences vs current scoreTier

The current `scoreTier` result is computed first. V3-1B changes only eligible current `LOW_END_STARTER` and narrow starter-minutes `VETERAN_ROTATION_GUARD` players who pass required role, value, production, and extra-support gates. All other current tiers stay unchanged.

## Distribution tables

| tier                   | count | %     | avg age | avg MPG | avg valueNoPot | avg contractValue | avg BPM |
| ---------------------- | ----- | ----- | ------- | ------- | -------------- | ----------------- | ------- |
| SUPERSTAR_MAX          | 3     | 0.5%  | 23.667  | 36.851  | 72.402         | 72.727            | 12.442  |
| STAR_NEAR_MAX          | 19    | 3.0%  | 25.737  | 35.837  | 68.255         | 68.317            | 7.672   |
| YOUNG_PROVEN_STARTER   | 24    | 3.8%  | 23.875  | 32.468  | 62.221         | 62.754            | 3.047   |
| SOLID_STARTER          | 43    | 6.8%  | 28.349  | 30.808  | 60.272         | 60.04             | 2.254   |
| LOW_END_STARTER        | 20    | 3.2%  | 28.65   | 28.306  | 56.8           | 56.628            | 0.183   |
| SPECIALIST_ROTATION    | 9     | 1.4%  | 27      | 19.12   | 53.815         | 53.736            | -0.704  |
| YOUNG_UPSIDE_SUSPECT   | 26    | 4.1%  | 21.769  | 18.393  | 53.266         | 55.032            | -1.501  |
| VETERAN_ROTATION_GUARD | 14    | 2.2%  | 30.643  | 25.325  | 56.291         | 55.794            | 3.105   |
| LOW_ROTATION_PLUS      | 10    | 1.6%  | 25.1    | 10.615  | 52.594         | 52.862            | -0.614  |
| VETERAN_MINIMUM_PLUS   | 6     | 0.9%  | 32.167  | 20.423  | 55.905         | 55.381            | -0.532  |
| MINIMUM_LEVEL          | 460   | 72.6% | 26.222  | 10.697  | 45.442         | 45.967            | -4.448  |

## Cap-budget summary

| pool               | model   | count | total min cap | total mid cap | total max cap | mid per 30 teams | delta vs current |
| ------------------ | ------- | ----- | ------------- | ------------- | ------------- | ---------------- | ---------------- |
| all_active         | current | 634   | 2377.3%       | 2787.5%       | 3197.7%       | 92.9%            | 0.0%             |
| all_active         | V3-1B   | 634   | 2635.3%       | 3024.0%       | 3412.7%       | 100.8%           | 236.5%           |
| rostered_active    | current | 460   | 1990.5%       | 2356.2%       | 2721.9%       | 78.5%            | 0.0%             |
| rostered_active    | V3-1B   | 460   | 2218.5%       | 2565.2%       | 2911.9%       | 85.5%            | 209.0%           |
| top15_roster_proxy | current | 431   | 1947.0%       | 2308.6%       | 2670.1%       | 77.0%            | 0.0%             |
| top15_roster_proxy | V3-1B   | 431   | 2175.0%       | 2517.6%       | 2860.2%       | 83.9%            | 209.0%           |
| contract_relevant  | current | 322   | 914.8%        | 1053.8%       | 1192.8%       | 35.1%            | 0.0%             |
| contract_relevant  | V3-1B   | 322   | 986.8%        | 1119.8%       | 1252.8%       | 37.3%            | 66.0%            |

## Transition red flags

| current tier           | candidate tier | count | % of current | notes                                  |
| ---------------------- | -------------- | ----- | ------------ | -------------------------------------- |
| LOW_END_STARTER        | SOLID_STARTER  | 43    | 68.3%        | 43 of 63 current LOW_END_STARTER       |
| MINIMUM_LEVEL          | SOLID_STARTER  | 0     | 0.0%         | 0 of 460 current MINIMUM_LEVEL         |
| LOW_ROTATION_PLUS      | SOLID_STARTER  | 0     | 0.0%         | 0 of 10 current LOW_ROTATION_PLUS      |
| YOUNG_UPSIDE_SUSPECT   | SOLID_STARTER  | 0     | 0.0%         | 0 of 26 current YOUNG_UPSIDE_SUSPECT   |
| VETERAN_ROTATION_GUARD | SOLID_STARTER  | 0     | 0.0%         | 0 of 14 current VETERAN_ROTATION_GUARD |
| YOUNG_PROVEN_STARTER   | SOLID_STARTER  | 0     | 0.0%         | 0 of 24 current YOUNG_PROVEN_STARTER   |

## Lane hit signal combinations

| combination                                                                                                                                                                                                                                                                                                                                                                                            | count | % of entrants |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------------- |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support                                  | 6     | 14.0%         |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16                                                                               | 5     | 11.6%         |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: shooting/spacing support                                              | 2     | 4.7%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: VORP >= 1; extra: PER >= 16; extra: age <= 27 with value/pot support                                                       | 2     | 4.7%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: VORP >= .5; production: PER >= 14; extra: age <= 27 with value/pot support                                                                                                                                                        | 2     | 4.7%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: PER >= 14; extra: PER >= 16; extra: age <= 27 with value/pot support                                                                                                                | 2     | 4.7%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: age <= 27 with value/pot support                                      | 2     | 4.7%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: VORP >= 1; extra: defense/rebounding/connector support; extra: shooting/spacing support                                    | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support                                                   | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support; extra: shooting/spacing support | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: PER >= 14; extra: EWA >= 5; extra: PER >= 16; extra: defense/rebounding/connector support                                                                                                                         | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: VORP >= 1                                                                                                                                   | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: VORP >= 1; extra: PER >= 16                                                                                                                              | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support                                                                                                  | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: shooting/spacing support                                                                                             | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: VORP >= 1                                                                                                                  | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: VORP >= 1; extra: age <= 27 with value/pot support                                                                                                                        | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: VORP >= 1; extra: PER >= 16                                                                                                | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: age <= 27 with value/pot support                                                                                     | 1     | 2.3%          |
| starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support; extra: age <= 27 with value/pot support          | 1     | 2.3%          |

## Labeled 48 eval

| metric                                  | current v2 |      V3-1B |
| --------------------------------------- | ---------: | ---------: |
| mean gap                                |       2.46 |       2.17 |
| median gap                              |       0.78 |       0.77 |
| severe                                  |          4 |          2 |
| too_low                                 |         31 |         27 |
| too_high                                |          7 |         11 |
| candidate better / current better / tie |            | 6 / 5 / 37 |

## What to inspect next

- Inspect every `LOW_END_STARTER -> SOLID_STARTER` entrant in `lane_hits.csv` and `labeled_eval.csv`.
- Compare V3-1B against V3-1A only after this one-lane result is reviewed.
- Review whether the value core should be 57/57 or slightly higher before any implementation discussion.
- Keep the small-guard positive-defense BPM reliability issue separate from 1B.

## Recommendation

Do not implement directly from this dry-run. Use it as a distribution/cap/labeled calibration artifact for V3 first-layer discussion.
