# V3-1B SOLID_STARTER dry-run

This is an artifact-only ablation. It tests only one candidate-only lane, `SOLID_STARTER` at 12%-17% cap. It does not modify `src/`, formal `scoreTier`, formal `MODEL_TIERS`, sandbox v2, existing score CSVs, or sampling.

## Safety verdict

Verdict: **unsafe**.

Reasons:

- labeled too_high increased materially 7 -> 11
- SOLID_STARTER count is 43 (>30)
- LOW_END_STARTER -> SOLID_STARTER is 43 (>35)

Tripwire read:

- all-active upgraded: 43
- all-active SOLID_STARTER entrants: 43
- LOW_END_STARTER -> SOLID_STARTER: 43
- MINIMUM_LEVEL -> SOLID_STARTER: 0
- YOUNG_UPSIDE_SUSPECT -> SOLID_STARTER: 0
- rostered mid-cap per 30 teams delta: 7.0%
- top15 mid-cap per 30 teams delta: 7.0%
- labeled severe: 4 -> 2
- labeled too_high: 7 -> 11

## Current vs V3-1B distribution

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

V3-1B all-active:

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

Full four-pool distribution is in `distribution.csv`.

## Transition matrix

Top all-active movements:

| current tier    | candidate tier | count | % of current | direction | steps | focus |
| --------------- | -------------- | ----- | ------------ | --------- | ----- | ----- |
| LOW_END_STARTER | SOLID_STARTER  | 43    | 68.3%        | up        | 1     | yes   |

Focus transitions:

| current tier           | candidate tier | count | % of current | notes                                  |
| ---------------------- | -------------- | ----- | ------------ | -------------------------------------- |
| LOW_END_STARTER        | SOLID_STARTER  | 43    | 68.3%        | 43 of 63 current LOW_END_STARTER       |
| MINIMUM_LEVEL          | SOLID_STARTER  | 0     | 0.0%         | 0 of 460 current MINIMUM_LEVEL         |
| LOW_ROTATION_PLUS      | SOLID_STARTER  | 0     | 0.0%         | 0 of 10 current LOW_ROTATION_PLUS      |
| YOUNG_UPSIDE_SUSPECT   | SOLID_STARTER  | 0     | 0.0%         | 0 of 26 current YOUNG_UPSIDE_SUSPECT   |
| VETERAN_ROTATION_GUARD | SOLID_STARTER  | 0     | 0.0%         | 0 of 14 current VETERAN_ROTATION_GUARD |
| YOUNG_PROVEN_STARTER   | SOLID_STARTER  | 0     | 0.0%         | 0 of 24 current YOUNG_PROVEN_STARTER   |

## Lane hits

SOLID_STARTER entrants: 43.

| current tier    | count | % of entrants |
| --------------- | ----- | ------------- |
| LOW_END_STARTER | 43    | 100.0%        |

Signal pass counts and combinations are in `lane_hits.csv`.

## Cap-budget sanity

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

This does not require <=100%. Teams can operate over the cap and all-active is not formal payroll. The read is relative to current baseline.

## Labeled 48 downstream eval

| metric                                  | current v2 |      V3-1B |
| --------------------------------------- | ---------: | ---------: |
| mean gap                                |       2.46 |       2.17 |
| median gap                              |       0.78 |       0.77 |
| severe                                  |          4 |          2 |
| too_low                                 |         31 |         27 |
| too_high                                |          7 |         11 |
| candidate better / current better / tie |            | 6 / 5 / 37 |
| severe fixed                            |            |          2 |
| new severe                              |            |          0 |
| improved >= 3M                          |            |          5 |
| worsened >= 3M                          |            |          3 |
| too_low fixed                           |            |          4 |
| too_high added                          |            |          4 |

## Labeled SOLID_STARTER attribution

| dataset      | case   | bucket                        | human           | current tier    | current point | 1B point | 1B dir   | delta gap | signals                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------ | ----------------------------- | --------------- | --------------- | ------------- | -------- | -------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| boundary40   | F-02   | low_end_starter               | $10.00M-$16.00M | LOW_END_STARTER | 15.4          | 23.59    | too_high | 7.59      | starter-like role: starterShare >= .45; starter-like role: GS >= 30; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: PER >= 14; extra: EWA >= 5; extra: PER >= 16                                                                                                                                     |
| boundary40   | F-03   | low_end_starter               | $15.00M-$20.00M | LOW_END_STARTER | 14.43         | 22.71    | too_high | 2.14      | starter-like role: starterShare >= .45; starter-like role: GS >= 30; value core: valueNoPot >= 57 and contractValue >= 57; production: VORP >= .5; extra: age <= 27 with value/pot support                                                                                                                                                                            |
| boundary40   | G-01   | solid_starter                 | $12.00M-$20.00M | LOW_END_STARTER | 15.85         | 23.99    | too_high | 3.99      | starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support |
| boundary40   | G-02   | solid_starter                 | $20.00M-$25.00M | LOW_END_STARTER | 15.62         | 23.71    | inside   | -4.38     | starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: PER >= 14; extra: PER >= 16; extra: age <= 27 with value/pot support                                                                               |
| boundary40   | G-03   | solid_starter                 | $12.00M-$18.00M | LOW_END_STARTER | 16.03         | 24.17    | too_high | 6.17      | starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: VORP >= 1; extra: defense/rebounding/connector support; extra: shooting/spacing support   |
| boundary40   | H-02   | good_high_starter             | $30.00M-$35.00M | LOW_END_STARTER | 17.03         | 24.99    | too_low  | -7.96     | starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support |
| validation20 | V20-09 | low_end_starter_good_rotation | $22.00M-$27.00M | LOW_END_STARTER | 15.65         | 23.87    | inside   | -6.35     | starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16                                              |
| validation20 | V20-10 | low_end_starter_good_rotation | $24.00M-$29.00M | LOW_END_STARTER | 16.86         | 24.88    | inside   | -7.14     | starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: BPM >= 1; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: age <= 27 with value/pot support     |
| validation20 | V20-11 | low_end_starter_good_rotation | $24.00M-$28.00M | LOW_END_STARTER | 15.4          | 23.66    | too_low  | -8.26     | starter-like role: starterShare >= .45; starter-like role: GS >= 30; very high minutes: MPG >= 29; value core: valueNoPot >= 57 and contractValue >= 57; production: EWA >= 3; production: VORP >= .5; production: BPM >= 0; production: PER >= 14; extra: EWA >= 5; extra: VORP >= 1; extra: PER >= 16; extra: defense/rebounding/connector support                  |

Labeled SOLID_STARTER aggregate:

- count: 9
- improved: 5
- worsened: 4
- fixed severe: 2
- new severe: 0
- too_low fixed: 4
- too_high added: 4

## Future research note

Future research note: E-01 raised a small-guard positive-defense BPM reliability question. Do not fix it in 1B; separately audit whether small guards around 183cm with positive DBPM/BPM should receive full defensive credit in contract asks.

## Read

V3-1B is deliberately narrower than candidate_0. It does not enable 1A `HIGH_END_ROTATION`, does not create `HIGH_IMPACT_STARTER`, does not relax `LOW_END_STARTER`, and blocks current `MINIMUM_LEVEL`, `LOW_ROTATION_PLUS`, and `YOUNG_UPSIDE_SUSPECT` from direct SOLID_STARTER jumps.
