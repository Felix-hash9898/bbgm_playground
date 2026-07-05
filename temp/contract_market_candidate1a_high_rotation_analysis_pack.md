# candidate_1A HIGH_END_ROTATION analysis pack

## One-page summary

- Experiment: one-lane ablation for `HIGH_END_ROTATION`.
- Range: 7%-12% cap, dry-run only.
- Entrants: 33 all-active.
- Upgrades: 33 all-active.
- MINIMUM_LEVEL -> HIGH_END_ROTATION: 6.
- Labeled severe: 4 -> 2.
- Labeled too_high: 7 -> 8.
- Verdict: inconclusive.

## Exact candidate_1A rule

See `temp/contract_market_candidate1a_high_rotation_rules.md`.

## Exact differences vs current scoreTier

The current `scoreTier` result is computed first. candidate_1A changes only players below current `LOW_END_STARTER` who pass the new HIGH_END_ROTATION hard floor, role support, core identity, value/production support, and score gate. All other current tiers stay unchanged.

## Distribution tables

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

## Cap-budget summary

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

## Transition red flags

| current tier         | candidate tier    | count | % of current | notes                                 |
| -------------------- | ----------------- | ----- | ------------ | ------------------------------------- |
| MINIMUM_LEVEL        | HIGH_END_ROTATION | 6     | 1.3%         | 6 of 460 current MINIMUM_LEVEL        |
| LOW_ROTATION_PLUS    | HIGH_END_ROTATION | 0     | 0.0%         | 0 of 10 current LOW_ROTATION_PLUS     |
| SPECIALIST_ROTATION  | HIGH_END_ROTATION | 3     | 33.3%        | 3 of 9 current SPECIALIST_ROTATION    |
| YOUNG_UPSIDE_SUSPECT | HIGH_END_ROTATION | 11    | 42.3%        | 11 of 26 current YOUNG_UPSIDE_SUSPECT |
| LOW_END_STARTER      | HIGH_END_ROTATION | 0     | 0.0%         | 0 of 63 current LOW_END_STARTER       |

## Lane hit signal combinations

| combination                                                                                                                                                                                                                                                                       | count | % of entrants |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------- |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; creator/scorer core; production support: EWA/VORP/BPM/PER                                                                                                | 5     | 15.2%         |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; young productive core; connector/defense core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER | 3     | 9.1%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; creator/scorer core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                           | 2     | 6.1%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; creator/scorer core; portable shooting core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER   | 2     | 6.1%          |
| real role fallback: MPG >= 22; creator/scorer core; young productive core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                              | 2     | 6.1%          |
| real role fallback: GP >= 55 and MPG >= 20; portable shooting core; young productive core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                              | 2     | 6.1%          |
| real role fallback: MPG >= 22; creator/scorer core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                                                     | 1     | 3.0%          |
| real role fallback: GP >= 55 and MPG >= 20; connector/defense core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                                     | 1     | 3.0%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; portable shooting core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                        | 1     | 3.0%          |
| real role fallback: GP >= 55 and MPG >= 20; creator/scorer core; portable shooting core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                | 1     | 3.0%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; connector/defense core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                        | 1     | 3.0%          |
| real role fallback: MPG >= 22; creator/scorer core; connector/defense core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                             | 1     | 3.0%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; young productive core; production support: EWA/VORP/BPM/PER                                                                                              | 1     | 3.0%          |
| real role fallback: MPG >= 22; young productive core; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER                                                                                                                                                    | 1     | 3.0%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; young productive core; value support: valueNoPot >= 55; value support: contractValue >= 55                                                               | 1     | 3.0%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; creator/scorer core; value support: valueNoPot >= 55; production support: EWA/VORP/BPM/PER                                                               | 1     | 3.0%          |
| real role fallback: GP >= 55 and MPG >= 20; portable shooting core; young productive core; value support: contractValue >= 55                                                                                                                                                     | 1     | 3.0%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; portable shooting core; production support: EWA/VORP/BPM/PER                                                                                             | 1     | 3.0%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; creator/scorer core; young productive core; value support: valueNoPot >= 55; value support: contractValue >= 55; production support: EWA/VORP/BPM/PER    | 1     | 3.0%          |
| strong rotation role: GP >= 50 and MPG >= 22; real role fallback: MPG >= 22; real role fallback: GP >= 55 and MPG >= 20; young productive core; value support: contractValue >= 55                                                                                                | 1     | 3.0%          |
