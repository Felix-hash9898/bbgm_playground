# Contract Market Boundary40 Selection Report

Scope: boundary/challenge calibration set only. This does not replace validation20, does not act as a final test, and does not change model rules.

Inputs:

- `real_saves/BBGM_League_3_2025_re_sign_players.json.gz`
- `contract_market_artifacts/contract_market_anchor_targets.json`
- `contract_market_artifacts/contract_market_validation20_candidates.csv`
- `tools/contract-market-proxy-core.mjs`
- `tools/contract-market-tier-score.mjs`
- `tools/contract-market-validation20.mjs`
- `temp/bbgm_contract_review_sample_v3.html`

## Exclusion Rules

- Excluded anchor15 pids: 1294, 361, 225, 8, 1669, 906, 1479, 1409, 65, 1363, 1266, 1744, 187, 578, 517
- Excluded validation20 pids: 1824, 1712, 727, 1703, 1705, 1339, 734, 1519, 45, 1603, 153, 812, 1672, 665, 379, 1618, 95, 340, 484, 459
- Boundary40 selected pids have no overlap with either excluded set.

## Bucket Targets And Cases

### A. MINIMUM / FRINGE NEGATIVE

Selection target: Low-minute, negative-impact players to validate player-specific minimum and true minimum-level contracts.

| case | global id | pid | player            | age | pos | demand | cap% | model tier    | challenge tags                                         |
| ---- | --------- | --- | ----------------- | --- | --- | ------ | ---- | ------------- | ------------------------------------------------------ |
| A-01 | B40-01    | 12  | Al-Farouq Aminu   | 35  | F   | $3.71M | 2.4% | MINIMUM_LEVEL | award_old_decline;player_minimum_sensitive             |
| A-02 | B40-02    | 67  | Bogdan Bogdanović | 33  | SG  | $3.71M | 2.4% | MINIMUM_LEVEL | guard_age_31_plus_length_risk;player_minimum_sensitive |
| A-03 | B40-03    | 127 | Pat Connaughton   | 32  | GF  | $3.71M | 2.4% | MINIMUM_LEVEL | guard_age_31_plus_length_risk;player_minimum_sensitive |
| A-04 | B40-04    | 251 | Andrew Harrison   | 31  | PG  | $3.71M | 2.4% | MINIMUM_LEVEL | guard_age_31_plus_length_risk;player_minimum_sensitive |

| case | global id | player            | selection rationale                                                                                                                                                           |
| ---- | --------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01 | B40-01    | Al-Farouq Aminu   | A. MINIMUM / FRINGE NEGATIVE boundary sample: demand $3.71M (2.4%) with 4.9 MPG, -0.2 EWA, -5.4 BPM. Challenge tags: award_old_decline, player_minimum_sensitive.             |
| A-02 | B40-02    | Bogdan Bogdanović | A. MINIMUM / FRINGE NEGATIVE boundary sample: demand $3.71M (2.4%) with 6.6 MPG, -0.6 EWA, -6.7 BPM. Challenge tags: guard_age_31_plus_length_risk, player_minimum_sensitive. |
| A-03 | B40-03    | Pat Connaughton   | A. MINIMUM / FRINGE NEGATIVE boundary sample: demand $3.71M (2.4%) with 7.9 MPG, -0.8 EWA, -7.2 BPM. Challenge tags: guard_age_31_plus_length_risk, player_minimum_sensitive. |
| A-04 | B40-04    | Andrew Harrison   | A. MINIMUM / FRINGE NEGATIVE boundary sample: demand $3.71M (2.4%) with 7.4 MPG, -0.8 EWA, -7 BPM. Challenge tags: guard_age_31_plus_length_risk, player_minimum_sensitive.   |

### B. MINIMUM_PLUS / FUNCTIONAL VET

Selection target: Older functional players with one useful skill but limited role, to separate minimum-plus from multi-year money.

| case | global id | pid | player         | age | pos | demand | cap% | model tier    | challenge tags                                                                                             |
| ---- | --------- | --- | -------------- | --- | --- | ------ | ---- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| B-01 | B40-05    | 649 | John Wall      | 35  | PG  | $6.69M | 4.3% | MINIMUM_LEVEL | specialist_high_skill_low_minutes;guard_age_31_plus_length_risk;award_old_decline;player_minimum_sensitive |
| B-02 | B40-06    | 39  | Will Barton    | 34  | GF  | $8.80M | 5.7% | MINIMUM_LEVEL | guard_age_31_plus_length_risk;award_old_decline;player_minimum_sensitive                                   |
| B-03 | B40-07    | 241 | Blake Griffin  | 36  | FC  | $9.09M | 5.9% | MINIMUM_LEVEL | high_ewa_low_minutes;award_old_decline;player_minimum_sensitive                                            |
| B-04 | B40-08    | 280 | Justin Holiday | 36  | GF  | $8.86M | 5.7% | MINIMUM_LEVEL | specialist_high_skill_low_minutes;guard_age_31_plus_length_risk;award_old_decline;player_minimum_sensitive |

| case | global id | player         | selection rationale                                                                                                                                                                                                                     |
| ---- | --------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | B40-05    | John Wall      | B. MINIMUM_PLUS / FUNCTIONAL VET boundary sample: demand $6.69M (4.3%) with 17.1 MPG, 0 EWA, -2.6 BPM. Challenge tags: specialist_high_skill_low_minutes, guard_age_31_plus_length_risk, award_old_decline, player_minimum_sensitive.   |
| B-02 | B40-06    | Will Barton    | B. MINIMUM_PLUS / FUNCTIONAL VET boundary sample: demand $8.80M (5.7%) with 13.2 MPG, 0.6 EWA, -1.1 BPM. Challenge tags: guard_age_31_plus_length_risk, award_old_decline, player_minimum_sensitive.                                    |
| B-03 | B40-07    | Blake Griffin  | B. MINIMUM_PLUS / FUNCTIONAL VET boundary sample: demand $9.09M (5.9%) with 11.3 MPG, 2.7 EWA, 5.6 BPM. Challenge tags: high_ewa_low_minutes, award_old_decline, player_minimum_sensitive.                                              |
| B-04 | B40-08    | Justin Holiday | B. MINIMUM_PLUS / FUNCTIONAL VET boundary sample: demand $8.86M (5.7%) with 17.4 MPG, 0.1 EWA, -3.6 BPM. Challenge tags: specialist_high_skill_low_minutes, guard_age_31_plus_length_risk, award_old_decline, player_minimum_sensitive. |

### C. LOW_ROTATION

Selection target: Real rotation-edge players around 10-18 MPG whose role/sample size makes low-end AAV uncertain.

| case | global id | pid  | player             | age | pos | demand  | cap% | model tier           | challenge tags                                             |
| ---- | --------- | ---- | ------------------ | --- | --- | ------- | ---- | -------------------- | ---------------------------------------------------------- |
| C-01 | B40-09    | 1245 | Keyonte George     | 22  | G   | $9.22M  | 6.0% | YOUNG_UPSIDE_SUSPECT | young_high_pot_low_current                                 |
| C-02 | B40-10    | 1280 | Jordan Hall        | 23  | SF  | $10.37M | 6.7% | MINIMUM_LEVEL        | young_high_pot_low_current                                 |
| C-03 | B40-11    | 1467 | Bennedict Mathurin | 23  | GF  | $8.46M  | 5.5% | MINIMUM_LEVEL        | young_high_pot_low_current;high_ewa_low_minutes            |
| C-04 | B40-12    | 1659 | Alex Sarr          | 20  | FC  | $12.02M | 7.8% | YOUNG_UPSIDE_SUSPECT | young_high_pot_low_current;defense_rebound_big_low_scoring |

| case | global id | player             | selection rationale                                                                                                                                                   |
| ---- | --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-01 | B40-09    | Keyonte George     | C. LOW_ROTATION boundary sample: demand $9.22M (6.0%) with 15.9 MPG, 0.3 EWA, -3.3 BPM. Challenge tags: young_high_pot_low_current.                                   |
| C-02 | B40-10    | Jordan Hall        | C. LOW_ROTATION boundary sample: demand $10.37M (6.7%) with 13.7 MPG, 0.2 EWA, -3.7 BPM. Challenge tags: young_high_pot_low_current.                                  |
| C-03 | B40-11    | Bennedict Mathurin | C. LOW_ROTATION boundary sample: demand $8.46M (5.5%) with 17.4 MPG, 2.1 EWA, -3.9 BPM. Challenge tags: young_high_pot_low_current, high_ewa_low_minutes.             |
| C-04 | B40-12    | Alex Sarr          | C. LOW_ROTATION boundary sample: demand $12.02M (7.8%) with 14.2 MPG, 1.6 EWA, -0.1 BPM. Challenge tags: young_high_pot_low_current, defense_rebound_big_low_scoring. |

### D. GOOD_ROTATION / SPECIALIST

Selection target: Specialists and functional reserves near the 5.5%-8% and 8%-10% cap boundaries without defaulting to composite ratings.

| case | global id | pid  | player          | age | pos | demand  | cap%  | model tier           | challenge tags                                               |
| ---- | --------- | ---- | --------------- | --- | --- | ------- | ----- | -------------------- | ------------------------------------------------------------ |
| D-01 | B40-13    | 927  | Simisola Shittu | 25  | PF  | $12.73M | 8.2%  | MINIMUM_LEVEL        | specialist_high_skill_low_minutes                            |
| D-02 | B40-14    | 1593 | Jordan Poole    | 26  | G   | $16.04M | 10.4% | LOW_ROTATION_PLUS    | specialist_high_skill_low_minutes                            |
| D-03 | B40-15    | 1794 | Jaylen Wells    | 22  | GF  | $13.84M | 8.9%  | YOUNG_UPSIDE_SUSPECT | young_high_pot_low_current;specialist_high_skill_low_minutes |
| D-04 | B40-16    | 1525 | Keegan Murray   | 25  | F   | $9.54M  | 6.2%  | SPECIALIST_ROTATION  | specialist_high_skill_low_minutes                            |

| case | global id | player          | selection rationale                                                                                                                                                                 |
| ---- | --------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | B40-13    | Simisola Shittu | D. GOOD_ROTATION / SPECIALIST boundary sample: demand $12.73M (8.2%) with 18.1 MPG, -0.1 EWA, -1.7 BPM. Challenge tags: specialist_high_skill_low_minutes.                          |
| D-02 | B40-14    | Jordan Poole    | D. GOOD_ROTATION / SPECIALIST boundary sample: demand $16.04M (10.4%) with 15.6 MPG, 1.7 EWA, -0.6 BPM. Challenge tags: specialist_high_skill_low_minutes.                          |
| D-03 | B40-15    | Jaylen Wells    | D. GOOD_ROTATION / SPECIALIST boundary sample: demand $13.84M (8.9%) with 17 MPG, 0.7 EWA, -2.2 BPM. Challenge tags: young_high_pot_low_current, specialist_high_skill_low_minutes. |
| D-04 | B40-16    | Keegan Murray   | D. GOOD_ROTATION / SPECIALIST boundary sample: demand $9.54M (6.2%) with 14.9 MPG, 0 EWA, -4.3 BPM. Challenge tags: specialist_high_skill_low_minutes.                              |

### E. HIGH_END_ROTATION / SIXTH MAN

Selection target: Non-starters or unstable starters with real impact, covering the 10-15M and 15-20M challenge area.

| case | global id | pid  | player           | age | pos | demand  | cap%  | model tier             | challenge tags                                            |
| ---- | --------- | ---- | ---------------- | --- | --- | ------- | ----- | ---------------------- | --------------------------------------------------------- |
| E-01 | B40-17    | 200  | Yogi Ferrell     | 32  | G   | $18.43M | 11.9% | VETERAN_ROTATION_GUARD | old_good_current_short_term;guard_age_31_plus_length_risk |
| E-02 | B40-18    | 1381 | Nikola Jović     | 22  | PF  | $19.94M | 12.9% | YOUNG_UPSIDE_SUSPECT   | young_high_pot_low_current                                |
| E-03 | B40-19    | 46   | Malik Beasley    | 29  | SG  | $18.74M | 12.1% | MINIMUM_LEVEL          | player_minimum_sensitive                                  |
| E-04 | B40-20    | 1717 | Julian Strawther | 23  | GF  | $17.51M | 11.3% | YOUNG_UPSIDE_SUSPECT   | young_high_pot_low_current                                |

| case | global id | player           | selection rationale                                                                                                                                                                 |
| ---- | --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | B40-17    | Yogi Ferrell     | E. HIGH_END_ROTATION / SIXTH MAN boundary sample: demand $18.43M (11.9%) with 21.2 MPG, 3 EWA, 3.5 BPM. Challenge tags: old_good_current_short_term, guard_age_31_plus_length_risk. |
| E-02 | B40-18    | Nikola Jović     | E. HIGH_END_ROTATION / SIXTH MAN boundary sample: demand $19.94M (12.9%) with 21.9 MPG, 2.7 EWA, 2.4 BPM. Challenge tags: young_high_pot_low_current.                               |
| E-03 | B40-19    | Malik Beasley    | E. HIGH_END_ROTATION / SIXTH MAN boundary sample: demand $18.74M (12.1%) with 22.2 MPG, 2.7 EWA, -0.8 BPM. Challenge tags: player_minimum_sensitive.                                |
| E-04 | B40-20    | Julian Strawther | E. HIGH_END_ROTATION / SIXTH MAN boundary sample: demand $17.51M (11.3%) with 21.8 MPG, 2.7 EWA, -0.3 BPM. Challenge tags: young_high_pot_low_current.                              |

### F. LOW_END_STARTER

Selection target: High-minute or high-starter-share players with ordinary efficiency or impact, to validate the 10%-14% cap band.

| case | global id | pid  | player                   | age | pos | demand  | cap%  | model tier      | challenge tags                                                                |
| ---- | --------- | ---- | ------------------------ | --- | --- | ------- | ----- | --------------- | ----------------------------------------------------------------------------- |
| F-01 | B40-21    | 1675 | Shaedon Sharpe           | 22  | SG  | $19.95M | 12.9% | LOW_END_STARTER | young_high_pot_low_current;low_ewa_but_starter                                |
| F-02 | B40-22    | 1383 | Mfiondu Kabengele        | 28  | FC  | $19.71M | 12.7% | LOW_END_STARTER | low_ewa_but_starter                                                           |
| F-03 | B40-23    | 1557 | Isaac Okoro              | 24  | GF  | $19.61M | 12.7% | LOW_END_STARTER | low_ewa_but_starter                                                           |
| F-04 | B40-24    | 100  | Kentavious Caldwell-Pope | 32  | SG  | $20.68M | 13.4% | LOW_END_STARTER | old_good_current_short_term;low_ewa_but_starter;guard_age_31_plus_length_risk |

| case | global id | player                   | selection rationale                                                                                                                                                                         |
| ---- | --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | B40-21    | Shaedon Sharpe           | F. LOW_END_STARTER boundary sample: demand $19.95M (12.9%) with 29 MPG, 2.1 EWA, -1.2 BPM. Challenge tags: young_high_pot_low_current, low_ewa_but_starter.                                 |
| F-02 | B40-22    | Mfiondu Kabengele        | F. LOW_END_STARTER boundary sample: demand $19.71M (12.7%) with 28.7 MPG, 5.2 EWA, -0.4 BPM. Challenge tags: low_ewa_but_starter.                                                           |
| F-03 | B40-23    | Isaac Okoro              | F. LOW_END_STARTER boundary sample: demand $19.61M (12.7%) with 28.9 MPG, 1.7 EWA, -0.8 BPM. Challenge tags: low_ewa_but_starter.                                                           |
| F-04 | B40-24    | Kentavious Caldwell-Pope | F. LOW_END_STARTER boundary sample: demand $20.68M (13.4%) with 28.8 MPG, 2.1 EWA, -1 BPM. Challenge tags: old_good_current_short_term, low_ewa_but_starter, guard_age_31_plus_length_risk. |

### G. SOLID_STARTER

Selection target: Stable starters with some positive impact, covering the 14%-18% cap zone and the lower part of the current model gap.

| case | global id | pid  | player         | age | pos | demand  | cap%  | model tier      | challenge tags                                |
| ---- | --------- | ---- | -------------- | --- | --- | ------- | ----- | --------------- | --------------------------------------------- |
| G-01 | B40-25    | 51   | Jordan Bell    | 30  | C   | $24.76M | 16.0% | LOW_END_STARTER |                                               |
| G-02 | B40-26    | 1716 | Isaiah Stewart | 24  | FC  | $24.81M | 16.0% | LOW_END_STARTER | low_ewa_but_starter                           |
| G-03 | B40-27    | 20   | OG Anunoby     | 28  | F   | $24.60M | 15.9% | LOW_END_STARTER |                                               |
| G-04 | B40-28    | 1527 | Džanan Musa    | 26  | GF  | $25.03M | 16.2% | MINIMUM_LEVEL   | low_ewa_but_starter;high_usage_bad_efficiency |

| case | global id | player         | selection rationale                                                                                                                                        |
| ---- | --------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 | B40-25    | Jordan Bell    | G. SOLID_STARTER boundary sample: demand $24.76M (16.0%) with 30 MPG, 6.2 EWA, 3.1 BPM.                                                                    |
| G-02 | B40-26    | Isaiah Stewart | G. SOLID_STARTER boundary sample: demand $24.81M (16.0%) with 30.6 MPG, 4.9 EWA, -0.5 BPM. Challenge tags: low_ewa_but_starter.                            |
| G-03 | B40-27    | OG Anunoby     | G. SOLID_STARTER boundary sample: demand $24.60M (15.9%) with 29.7 MPG, 4.3 EWA, 2 BPM.                                                                    |
| G-04 | B40-28    | Džanan Musa    | G. SOLID_STARTER boundary sample: demand $25.03M (16.2%) with 32.3 MPG, 3.1 EWA, -0.7 BPM. Challenge tags: low_ewa_but_starter, high_usage_bad_efficiency. |

### H. GOOD_STARTER / HIGH_STARTER

Selection target: Clearly above ordinary starters but not near-max locks, emphasizing the 18%-22.5% and 22.5%-30% cap boundaries.

| case | global id | pid  | player      | age | pos | demand  | cap%  | model tier           | challenge tags |
| ---- | --------- | ---- | ----------- | --- | --- | ------- | ----- | -------------------- | -------------- |
| H-01 | B40-29    | 1403 | Kevin Knox  | 26  | F   | $30.91M | 20.0% | YOUNG_PROVEN_STARTER |                |
| H-02 | B40-30    | 589  | Ben Simmons | 29  | PG  | $30.99M | 20.0% | LOW_END_STARTER      |                |
| H-03 | B40-31    | 732  | LaMelo Ball | 24  | PG  | $30.81M | 19.9% | YOUNG_PROVEN_STARTER |                |
| H-04 | B40-32    | 1376 | Kai Jones   | 24  | C   | $30.67M | 19.8% | YOUNG_PROVEN_STARTER |                |

| case | global id | player      | selection rationale                                                                                      |
| ---- | --------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| H-01 | B40-29    | Kevin Knox  | H. GOOD_STARTER / HIGH_STARTER boundary sample: demand $30.91M (20.0%) with 33.3 MPG, 7.5 EWA, 2.7 BPM.  |
| H-02 | B40-30    | Ben Simmons | H. GOOD_STARTER / HIGH_STARTER boundary sample: demand $30.99M (20.0%) with 31.2 MPG, 9 EWA, 8.4 BPM.    |
| H-03 | B40-31    | LaMelo Ball | H. GOOD_STARTER / HIGH_STARTER boundary sample: demand $30.81M (19.9%) with 34.5 MPG, 11.2 EWA, 6.1 BPM. |
| H-04 | B40-32    | Kai Jones   | H. GOOD_STARTER / HIGH_STARTER boundary sample: demand $30.67M (19.8%) with 31.3 MPG, 8 EWA, 4.2 BPM.    |

### I. STAR_NEAR_MAX

Selection target: Near-max candidates with strong impact but room for human judgment, including the $34.8M-$40.8M current-model gap.

| case | global id | pid  | player           | age | pos | demand  | cap%  | model tier    | challenge tags            |
| ---- | --------- | ---- | ---------------- | --- | --- | ------- | ----- | ------------- | ------------------------- |
| I-01 | B40-33    | 1422 | Saben Lee        | 26  | PG  | $37.98M | 24.6% | STAR_NEAR_MAX |                           |
| I-02 | B40-34    | 1247 | Josh Giddey      | 23  | GF  | $37.63M | 24.3% | STAR_NEAR_MAX | high_usage_bad_efficiency |
| I-03 | B40-35    | 1821 | Patrick Williams | 24  | PF  | $38.49M | 24.9% | STAR_NEAR_MAX |                           |
| I-04 | B40-36    | 1840 | Trae Young       | 27  | PG  | $36.62M | 23.7% | STAR_NEAR_MAX | high_usage_bad_efficiency |

| case | global id | player           | selection rationale                                                                                                                   |
| ---- | --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| I-01 | B40-33    | Saben Lee        | I. STAR_NEAR_MAX boundary sample: demand $37.98M (24.6%) with 37.2 MPG, 10.7 EWA, 8.7 BPM.                                            |
| I-02 | B40-34    | Josh Giddey      | I. STAR_NEAR_MAX boundary sample: demand $37.63M (24.3%) with 37.2 MPG, 13.8 EWA, 7.1 BPM. Challenge tags: high_usage_bad_efficiency. |
| I-03 | B40-35    | Patrick Williams | I. STAR_NEAR_MAX boundary sample: demand $38.49M (24.9%) with 35.6 MPG, 10.8 EWA, 3.6 BPM.                                            |
| I-04 | B40-36    | Trae Young       | I. STAR_NEAR_MAX boundary sample: demand $36.62M (23.7%) with 38.7 MPG, 15.8 EWA, 9 BPM. Challenge tags: high_usage_bad_efficiency.   |

### J. UPPER STAR / MAX BORDERLINE

Selection target: Upper near-max candidates and max-borderline stars. These are not exact max locks; exact max calibration is covered by anchor15 and validation20.

| case | global id | pid  | player            | age | pos | demand  | cap%  | model tier    | challenge tags |
| ---- | --------- | ---- | ----------------- | --- | --- | ------- | ----- | ------------- | -------------- |
| J-01 | B40-37    | 834  | Justin Champagnie | 24  | SF  | $43.01M | 27.8% | STAR_NEAR_MAX |                |
| J-02 | B40-38    | 739  | Scottie Barnes    | 24  | F   | $40.39M | 26.1% | STAR_NEAR_MAX |                |
| J-03 | B40-39    | 1604 | Joshua Primo      | 23  | GF  | $40.23M | 26.0% | STAR_NEAR_MAX |                |
| J-04 | B40-40    | 904  | Luka Dončić       | 26  | G   | $38.81M | 25.1% | STAR_NEAR_MAX |                |

| case | global id | player            | selection rationale                                                                                       |
| ---- | --------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| J-01 | B40-37    | Justin Champagnie | J. UPPER STAR / MAX BORDERLINE boundary sample: demand $43.01M (27.8%) with 35.9 MPG, 12 EWA, 6.3 BPM.    |
| J-02 | B40-38    | Scottie Barnes    | J. UPPER STAR / MAX BORDERLINE boundary sample: demand $40.39M (26.1%) with 32.8 MPG, 13.2 EWA, 8.4 BPM.  |
| J-03 | B40-39    | Joshua Primo      | J. UPPER STAR / MAX BORDERLINE boundary sample: demand $40.23M (26.0%) with 37.7 MPG, 10.1 EWA, 9.3 BPM.  |
| J-04 | B40-40    | Luka Dončić       | J. UPPER STAR / MAX BORDERLINE boundary sample: demand $38.81M (25.1%) with 36.8 MPG, 15.8 EWA, 10.4 BPM. |

## Coverage Check

- Case count: 40
- Bucket count: 10 x 4 cases
- Minimum to max coverage: selected demands run from $3.71M to $43.01M; player-specific minimum rows are included.
- Max-end note: after excluding anchor15 and validation20 pids, the selected pool's strongest available max-proximity sample is J-01 Justin Champagnie at $43.01M (27.8%); after excluding anchor15 and validation20, this set does not force exact-max cases. J bucket is used to test whether upper-star / near-max candidates should be pushed to exact max or remain below max.
- Current model gap $18.56M-$26.29M coverage: 10 cases (E-02 Nikola Jović $19.94M; E-03 Malik Beasley $18.74M; F-01 Shaedon Sharpe $19.95M; F-02 Mfiondu Kabengele $19.71M; F-03 Isaac Okoro $19.61M; F-04 Kentavious Caldwell-Pope $20.68M; G-01 Jordan Bell $24.76M; G-02 Isaiah Stewart $24.81M; G-03 OG Anunoby $24.60M; G-04 Džanan Musa $25.03M).
- Current model gap $34.80M-$40.83M coverage: 7 cases (I-01 Saben Lee $37.98M; I-02 Josh Giddey $37.63M; I-03 Patrick Williams $38.49M; I-04 Trae Young $36.62M; J-02 Scottie Barnes $40.39M; J-03 Joshua Primo $40.23M; J-04 Luka Dončić $38.81M).
- Player-specific minimum coverage: 9 cases tagged `player_minimum_sensitive`.
- Years/term risk coverage: 10 cases tagged for guard age, old-current-value, or award/decline term risk.

Nearest selected samples to requested cap boundaries:

| cap boundary | nearest case | player                   | demand  | demand cap% | bucket                   |
| ------------ | ------------ | ------------------------ | ------- | ----------- | ------------------------ |
| 5.5%         | C-03         | Bennedict Mathurin       | $8.46M  | 5.5%        | low_rotation             |
| 8.0%         | C-04         | Alex Sarr                | $12.02M | 7.8%        | low_rotation             |
| 10.0%        | D-02         | Jordan Poole             | $16.04M | 10.4%       | good_rotation_specialist |
| 14.0%        | F-04         | Kentavious Caldwell-Pope | $20.68M | 13.4%       | low_end_starter          |
| 18.0%        | G-04         | Džanan Musa              | $25.03M | 16.2%       | solid_starter            |
| 22.5%        | I-04         | Trae Young               | $36.62M | 23.7%       | star_near_max            |
| 30.0%        | J-01         | Justin Champagnie        | $43.01M | 27.8%       | superstar_max_lock       |

## Notes

- Buckets intentionally favor boundary and conflict samples over the most typical examples.
- Composite ratings are used internally only for selection tags and debug details; the blind review page does not display them.
- AAV bucket placement and years/term risk should remain separate review questions.
