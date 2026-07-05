# candidate_1A HIGH_END_ROTATION dry-run

This is an artifact-only ablation. It tests only one candidate-only lane, `HIGH_END_ROTATION` at 7%-12% cap. It does not modify `src/`, formal `scoreTier`, formal `MODEL_TIERS`, sandbox v2, existing score CSVs, or sampling.

## Safety verdict

Verdict: **inconclusive**.

Reasons:

- labeled too_high increased 7 -> 8
- HIGH_END_ROTATION count is 33 (>30)

Tripwire read:

- all-active upgraded: 33
- all-active HIGH_END_ROTATION count: 33
- current MINIMUM_LEVEL -> HIGH_END_ROTATION: 6
- rostered mid-cap per 30 teams delta: 6.2%
- top15 mid-cap per 30 teams delta: 6.2%
- labeled severe: 4 -> 2
- labeled too_high: 7 -> 8

## Current vs candidate_1A distribution

Current all-active:

| tier                   | count | %     | avg age | avg MPG | avg valueNoPot | avg contractValue | avg BPM |
| ---------------------- | ----- | ----- | ------- | ------- | -------------- | ----------------- | ------- |
| SUPERSTAR_MAX          | 3     | 0.5%  | 23.667  | 36.851  | 72.402         | 72.727            | 12.442  |
| STAR_NEAR_MAX          | 19    | 3.0%  | 25.737  | 35.837  | 68.255         | 68.317            | 7.672   |
| YOUNG_PROVEN_STARTER   | 24    | 3.8%  | 23.875  | 32.468  | 62.221         | 62.754            | 3.047   |
| LOW_END_STARTER        | 63    | 9.9%  | 28.444  | 30.014  | 59.17          | 58.957            | 1.597   |
| SPECIALIST_ROTATION    | 9     | 1.4%  | 27      | 19.12   | 53.815         | 53.736            | -0.704  |
| YOUNG_UPSIDE_SUSPECT   | 26    | 4.1%  | 21.769  | 18.393  | 53.266         | 55.032            | -1.501  |
| VETERAN_ROTATION_GUARD | 14    | 2.2%  | 30.643  | 25.325  | 56.291         | 55.794            | 3.105   |
| LOW_ROTATION_PLUS      | 10    | 1.6%  | 25.1    | 10.615  | 52.594         | 52.862            | -0.614  |
| VETERAN_MINIMUM_PLUS   | 6     | 0.9%  | 32.167  | 20.423  | 55.905         | 55.381            | -0.532  |
| MINIMUM_LEVEL          | 460   | 72.6% | 26.222  | 10.697  | 45.442         | 45.967            | -4.448  |

candidate_1A all-active:

| tier                   | count | %     | avg age | avg MPG | avg valueNoPot | avg contractValue | avg BPM |
| ---------------------- | ----- | ----- | ------- | ------- | -------------- | ----------------- | ------- |
| SUPERSTAR_MAX          | 3     | 0.5%  | 23.667  | 36.851  | 72.402         | 72.727            | 12.442  |
| STAR_NEAR_MAX          | 19    | 3.0%  | 25.737  | 35.837  | 68.255         | 68.317            | 7.672   |
| YOUNG_PROVEN_STARTER   | 24    | 3.8%  | 23.875  | 32.468  | 62.221         | 62.754            | 3.047   |
| LOW_END_STARTER        | 63    | 9.9%  | 28.444  | 30.014  | 59.17          | 58.957            | 1.597   |
| HIGH_END_ROTATION      | 33    | 5.2%  | 26.606  | 25.309  | 56.344         | 56.647            | 0.91    |
| SPECIALIST_ROTATION    | 6     | 0.9%  | 27      | 16.021  | 52.453         | 52.205            | -1.721  |
| YOUNG_UPSIDE_SUSPECT   | 15    | 2.4%  | 21.467  | 14.391  | 51.362         | 53.468            | -2.588  |
| VETERAN_ROTATION_GUARD | 4     | 0.6%  | 31      | 23.798  | 58.253         | 57.72             | 5.465   |
| LOW_ROTATION_PLUS      | 10    | 1.6%  | 25.1    | 10.615  | 52.594         | 52.862            | -0.614  |
| VETERAN_MINIMUM_PLUS   | 3     | 0.5%  | 33.667  | 16.938  | 54.085         | 53.544            | -0.938  |
| MINIMUM_LEVEL          | 454   | 71.6% | 26.225  | 10.458  | 45.278         | 45.807            | -4.518  |

Full four-pool distribution is in `contract_market_artifacts/contract_market_candidate1a_high_rotation_distribution.csv`.

## Transition matrix

Top all-active movements:

| current tier           | candidate tier    | count | % of current | direction | steps | focus |
| ---------------------- | ----------------- | ----- | ------------ | --------- | ----- | ----- |
| YOUNG_UPSIDE_SUSPECT   | HIGH_END_ROTATION | 11    | 42.3%        | up        | 2     | yes   |
| VETERAN_ROTATION_GUARD | HIGH_END_ROTATION | 10    | 71.4%        | up        | 3     | no    |
| MINIMUM_LEVEL          | HIGH_END_ROTATION | 6     | 1.3%         | up        | 6     | yes   |
| SPECIALIST_ROTATION    | HIGH_END_ROTATION | 3     | 33.3%        | up        | 1     | yes   |
| VETERAN_MINIMUM_PLUS   | HIGH_END_ROTATION | 3     | 50.0%        | up        | 5     | no    |

Focus transitions:

| current tier         | candidate tier    | count | % of current | notes                                 |
| -------------------- | ----------------- | ----- | ------------ | ------------------------------------- |
| MINIMUM_LEVEL        | HIGH_END_ROTATION | 6     | 1.3%         | 6 of 460 current MINIMUM_LEVEL        |
| LOW_ROTATION_PLUS    | HIGH_END_ROTATION | 0     | 0.0%         | 0 of 10 current LOW_ROTATION_PLUS     |
| SPECIALIST_ROTATION  | HIGH_END_ROTATION | 3     | 33.3%        | 3 of 9 current SPECIALIST_ROTATION    |
| YOUNG_UPSIDE_SUSPECT | HIGH_END_ROTATION | 11    | 42.3%        | 11 of 26 current YOUNG_UPSIDE_SUSPECT |
| LOW_END_STARTER      | HIGH_END_ROTATION | 0     | 0.0%         | 0 of 63 current LOW_END_STARTER       |

## Lane hits

HIGH_END_ROTATION entrants: 33.

| current tier           | count | % of entrants |
| ---------------------- | ----- | ------------- |
| VETERAN_ROTATION_GUARD | 10    | 30.3%         |
| VETERAN_MINIMUM_PLUS   | 3     | 9.1%          |
| SPECIALIST_ROTATION    | 3     | 9.1%          |
| MINIMUM_LEVEL          | 6     | 18.2%         |
| YOUNG_UPSIDE_SUSPECT   | 11    | 33.3%         |

Signal pass counts and combinations are in `contract_market_artifacts/contract_market_candidate1a_high_rotation_lane_hits.csv`.

## Cap-budget sanity

| pool               | model        | count | total min cap | total mid cap | total max cap | mid per 30 teams | delta vs current |
| ------------------ | ------------ | ----- | ------------- | ------------- | ------------- | ---------------- | ---------------- |
| all_active         | current      | 634   | 2377.3%       | 2787.5%       | 3197.7%       | 92.9%            | 0.0%             |
| all_active         | candidate_1A | 634   | 2511.8%       | 2977.9%       | 3444.0%       | 99.3%            | 190.4%           |
| rostered_active    | current      | 460   | 1990.5%       | 2356.2%       | 2721.9%       | 78.5%            | 0.0%             |
| rostered_active    | candidate_1A | 460   | 2122.1%       | 2542.1%       | 2962.1%       | 84.7%            | 185.9%           |
| top15_roster_proxy | current      | 431   | 1947.0%       | 2308.6%       | 2670.1%       | 77.0%            | 0.0%             |
| top15_roster_proxy | candidate_1A | 431   | 2078.6%       | 2494.5%       | 2910.4%       | 83.1%            | 185.9%           |
| contract_relevant  | current      | 322   | 914.8%        | 1053.8%       | 1192.8%       | 35.1%            | 0.0%             |
| contract_relevant  | candidate_1A | 322   | 957.2%        | 1113.7%       | 1270.2%       | 37.1%            | 59.9%            |

This does not require <=100%. Teams can operate over the cap and all-active is not formal payroll. The read is relative to current baseline.

## Labeled 48 downstream eval

| metric                                  | current v2 | candidate_1A |
| --------------------------------------- | ---------: | -----------: |
| mean gap                                |       2.46 |         2.01 |
| median gap                              |       0.78 |         0.75 |
| severe                                  |          4 |            2 |
| too_low                                 |         31 |           28 |
| too_high                                |          7 |            8 |
| candidate better / current better / tie |            |   4 / 4 / 40 |
| severe fixed                            |            |            2 |
| new severe                              |            |            0 |
| improved >= 3M                          |            |            3 |
| worsened >= 3M                          |            |            0 |
| too_low fixed                           |            |            3 |
| too_high added                          |            |            1 |

## Labeled HIGH_END_ROTATION attribution

| dataset    | case | bucket                      | human           | current tier           | current point | 1A point | 1A dir   | delta gap | signals                                                                                                                                                                                              |
| ---------- | ---- | --------------------------- | --------------- | ---------------------- | ------------- | -------- | -------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| boundary40 | E-01 | high_end_rotation_sixth_man | $8.00M-$12.00M  | VETERAN_ROTATION_GUARD | 7.77          | 14.82    | too_high | 2.59      | real role fallback: GP >= 55 and MPG >= 20; creator/scorer core; portable shooting core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER   |
| boundary40 | E-02 | high_end_rotation_sixth_man | $20.00M-$30.00M | YOUNG_UPSIDE_SUSPECT   | 5.73          | 15.45    | too_low  | -9.72     | real role fallback: GP >= 55 and MPG >= 20; portable shooting core; young productive core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER |
| boundary40 | E-04 | high_end_rotation_sixth_man | $12.00M-$18.00M | YOUNG_UPSIDE_SUSPECT   | 5.6           | 15.15    | inside   | -6.4      | real role fallback: GP >= 55 and MPG >= 20; portable shooting core; young productive core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER |
| boundary40 | G-04 | solid_starter               | $12.00M-$18.00M | MINIMUM_LEVEL          | 3.44          | 15.51    | inside   | -8.56     | real role fallback: MPG >= 22; creator/scorer core; portable shooting core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                |

Labeled HIGH_END_ROTATION aggregate:

- count: 4
- improved: 3
- worsened: 1
- fixed severe: 2
- new severe: 0
- too_low fixed: 3
- too_high added: 1

## Read

candidate_1A is deliberately narrower than candidate_0. It does not create `HIGH_IMPACT_STARTER`, does not create `SOLID_STARTER`, does not relax `LOW_END_STARTER`, does not relax `LOW_ROTATION_PLUS`, and protects current `LOW_END_STARTER` and above from being rewritten by this ablation.
