# ScoreTier Candidate Dry-Run

## Executive Summary

This is a dry run only. It does not modify `src/`, `scoreTier`, `MODEL_TIERS`, `scoreContractMarketV2`, existing v1/v2 score CSVs, or sampling.

Distribution-first read:

- All-active pool size: 634
- Contract-relevant pool size: 322
- Current top star tiers: 22
- Candidate top star tiers: 22
- Current minimum count: 460
- Candidate minimum count: 304
- All-active movement: unchanged 358, upgraded 276, downgraded 0
- Contract-relevant movement: unchanged 235, upgraded 87, downgraded 0

Safety read: distribution has safety concerns; the labeled 48 downstream eval also does not support this candidate.

## Current First-Layer Distribution

| tier                   | count | %     | avg age | avg MPG | avg value | avg valueNoPot | avg contractValue | avg BPM |
| ---------------------- | ----- | ----- | ------- | ------- | --------- | -------------- | ----------------- | ------- |
| SUPERSTAR_MAX          | 3     | 0.5%  | 23.67   | 36.85   | 74.13     | 72.4           | 72.73             | 12.44   |
| STAR_NEAR_MAX          | 19    | 3.0%  | 25.74   | 35.84   | 68.42     | 68.26          | 68.32             | 7.67    |
| YOUNG_PROVEN_STARTER   | 24    | 3.8%  | 23.88   | 32.47   | 64.88     | 62.22          | 62.75             | 3.05    |
| LOW_END_STARTER        | 63    | 9.9%  | 28.44   | 30.01   | 57.34     | 59.17          | 58.96             | 1.6     |
| SPECIALIST_ROTATION    | 9     | 1.4%  | 27      | 19.12   | 53.22     | 53.82          | 53.74             | -0.7    |
| YOUNG_UPSIDE_SUSPECT   | 26    | 4.1%  | 21.77   | 18.39   | 60.04     | 53.27          | 55.03             | -1.5    |
| VETERAN_ROTATION_GUARD | 14    | 2.2%  | 30.64   | 25.33   | 52.53     | 56.29          | 55.79             | 3.11    |
| LOW_ROTATION_PLUS      | 10    | 1.6%  | 25.1    | 10.62   | 53.6      | 52.59          | 52.86             | -0.61   |
| VETERAN_MINIMUM_PLUS   | 6     | 0.9%  | 32.17   | 20.42   | 51.54     | 55.91          | 55.38             | -0.53   |
| MINIMUM_LEVEL          | 460   | 72.6% | 26.22   | 10.7    | 46.81     | 45.44          | 45.97             | -4.45   |

## Candidate First-Layer Distribution

| tier                   | count | %     | avg age | avg MPG | avg value | avg valueNoPot | avg contractValue | avg BPM |
| ---------------------- | ----- | ----- | ------- | ------- | --------- | -------------- | ----------------- | ------- |
| SUPERSTAR_MAX          | 3     | 0.5%  | 23.67   | 36.85   | 74.13     | 72.4           | 72.73             | 12.44   |
| STAR_NEAR_MAX          | 19    | 3.0%  | 25.74   | 35.84   | 68.42     | 68.26          | 68.32             | 7.67    |
| HIGH_IMPACT_STARTER    | 75    | 11.8% | 27.05   | 30.97   | 60.08     | 60.67          | 60.67             | 2.85    |
| YOUNG_PROVEN_STARTER   | 17    | 2.7%  | 23.53   | 26.84   | 61.08     | 57.22          | 58.08             | 0.33    |
| SOLID_STARTER          | 29    | 4.6%  | 28.48   | 27.01   | 54.82     | 56.32          | 56.18             | -0.16   |
| HIGH_END_ROTATION      | 5     | 0.8%  | 26.8    | 21.91   | 54.61     | 55.04          | 55.11             | 0.8     |
| LOW_END_STARTER        | 54    | 8.5%  | 27.72   | 24.51   | 52.82     | 54.18          | 54.04             | -2.02   |
| SPECIALIST_ROTATION    | 24    | 3.8%  | 26.83   | 17.9    | 52.68     | 52.65          | 52.78             | -2.35   |
| YOUNG_UPSIDE_SUSPECT   | 11    | 1.7%  | 21.27   | 12.43   | 58.61     | 50.41          | 52.71             | -2.45   |
| VETERAN_ROTATION_GUARD | 2     | 0.3%  | 31.5    | 27.36   | 58.31     | 62.54          | 61.93             | 8.88    |
| LOW_ROTATION_PLUS      | 88    | 13.9% | 27.51   | 13.5    | 50.66     | 51.3           | 51.32             | -2.79   |
| VETERAN_MINIMUM_PLUS   | 3     | 0.5%  | 33.67   | 16.94   | 49.58     | 54.09          | 53.54             | -0.94   |
| MINIMUM_LEVEL          | 304   | 47.9% | 25.53   | 6.03    | 44.17     | 41.66          | 42.48             | -5.52   |

## Transition Matrix Summary

Top all-active movements:

| current tier           | candidate tier       | count | % of current | direction | steps |
| ---------------------- | -------------------- | ----- | ------------ | --------- | ----- |
| MINIMUM_LEVEL          | LOW_ROTATION_PLUS    | 79    | 17.2%        | up        | 2     |
| MINIMUM_LEVEL          | LOW_END_STARTER      | 46    | 10.0%        | up        | 6     |
| LOW_END_STARTER        | HIGH_IMPACT_STARTER  | 41    | 65.1%        | up        | 4     |
| YOUNG_PROVEN_STARTER   | HIGH_IMPACT_STARTER  | 24    | 100.0%       | up        | 1     |
| LOW_END_STARTER        | SOLID_STARTER        | 14    | 22.2%        | up        | 2     |
| MINIMUM_LEVEL          | SPECIALIST_ROTATION  | 13    | 2.8%         | up        | 5     |
| MINIMUM_LEVEL          | SOLID_STARTER        | 8     | 1.7%         | up        | 8     |
| LOW_END_STARTER        | YOUNG_PROVEN_STARTER | 7     | 11.1%        | up        | 3     |
| YOUNG_UPSIDE_SUSPECT   | YOUNG_PROVEN_STARTER | 6     | 23.1%        | up        | 5     |
| YOUNG_UPSIDE_SUSPECT   | SPECIALIST_ROTATION  | 4     | 15.4%        | up        | 1     |
| VETERAN_ROTATION_GUARD | SOLID_STARTER        | 4     | 28.6%        | up        | 5     |
| VETERAN_ROTATION_GUARD | LOW_END_STARTER      | 4     | 28.6%        | up        | 3     |
| MINIMUM_LEVEL          | HIGH_IMPACT_STARTER  | 4     | 0.9%         | up        | 10    |
| MINIMUM_LEVEL          | YOUNG_PROVEN_STARTER | 3     | 0.7%         | up        | 9     |
| MINIMUM_LEVEL          | HIGH_END_ROTATION    | 3     | 0.7%         | up        | 7     |

Movement summary:

| pool              | count | unchanged | upgraded | downgraded | up 1 | up 2+ | down 1 | down 2+ |
| ----------------- | ----- | --------- | -------- | ---------- | ---- | ----- | ------ | ------- |
| all_active        | 634   | 358       | 276      | 0          | 28   | 248   | 0      | 0       |
| contract_relevant | 322   | 235       | 87       | 0          | 8    | 79    | 0      | 0       |

Movement by band:

| pool              | group                   | count | unchanged | upgraded | downgraded | up 1 | up 2+ |
| ----------------- | ----------------------- | ----- | --------- | -------- | ---------- | ---- | ----- |
| all_active        | posBand:guard           | 313   | 177       | 136      | 0          | 15   | 121   |
| all_active        | posBand:frontcourt      | 321   | 181       | 140      | 0          | 13   | 127   |
| all_active        | ageBand:32+             | 75    | 29        | 46       | 0          | 0    | 46    |
| all_active        | ageBand:28-31           | 131   | 56        | 75       | 0          | 0    | 75    |
| all_active        | ageBand:24-27           | 271   | 158       | 113      | 0          | 15   | 98    |
| all_active        | ageBand:age<=23         | 157   | 115       | 42       | 0          | 13   | 29    |
| all_active        | mpgBand:<10 MPG         | 294   | 282       | 12       | 0          | 0    | 12    |
| all_active        | mpgBand:26+ MPG         | 144   | 25        | 119      | 0          | 24   | 95    |
| all_active        | mpgBand:18-26 MPG       | 89    | 8         | 81       | 0          | 3    | 78    |
| all_active        | mpgBand:10-18 MPG       | 107   | 43        | 64       | 0          | 1    | 63    |
| all_active        | valueBand:valueNoPot<50 | 306   | 288       | 18       | 0          | 0    | 18    |
| all_active        | valueBand:50-55         | 173   | 43        | 130      | 0          | 3    | 127   |
| all_active        | valueBand:60+           | 71    | 23        | 48       | 0          | 21   | 27    |
| all_active        | valueBand:55-60         | 84    | 4         | 80       | 0          | 4    | 76    |
| contract_relevant | posBand:guard           | 161   | 123       | 38       | 0          | 5    | 33    |
| contract_relevant | posBand:frontcourt      | 161   | 112       | 49       | 0          | 3    | 46    |
| contract_relevant | ageBand:32+             | 50    | 26        | 24       | 0          | 0    | 24    |
| contract_relevant | ageBand:28-31           | 73    | 48        | 25       | 0          | 0    | 25    |
| contract_relevant | ageBand:24-27           | 121   | 100       | 21       | 0          | 2    | 19    |
| contract_relevant | ageBand:age<=23         | 78    | 61        | 17       | 0          | 6    | 11    |
| contract_relevant | mpgBand:<10 MPG         | 208   | 204       | 4        | 0          | 0    | 4     |
| contract_relevant | mpgBand:26+ MPG         | 36    | 6         | 30       | 0          | 7    | 23    |
| contract_relevant | mpgBand:10-18 MPG       | 48    | 19        | 29       | 0          | 0    | 29    |
| contract_relevant | mpgBand:18-26 MPG       | 30    | 6         | 24       | 0          | 1    | 23    |
| contract_relevant | valueBand:valueNoPot<50 | 215   | 207       | 8        | 0          | 0    | 8     |
| contract_relevant | valueBand:60+           | 17    | 6         | 11       | 0          | 6    | 5     |
| contract_relevant | valueBand:55-60         | 27    | 2         | 25       | 0          | 2    | 23    |
| contract_relevant | valueBand:50-55         | 63    | 20        | 43       | 0          | 0    | 43    |

## High-Tier Sanity Check

| tier                 | current count | current % | candidate count | candidate % | delta |
| -------------------- | ------------- | --------- | --------------- | ----------- | ----- |
| SUPERSTAR_MAX        | 3             | 0.5%      | 3               | 0.5%        | 0     |
| STAR_NEAR_MAX        | 19            | 3.0%      | 19              | 3.0%        | 0     |
| HIGH_IMPACT_STARTER  | 0             | 0.0%      | 75              | 11.8%       | 75    |
| YOUNG_PROVEN_STARTER | 24            | 3.8%      | 17              | 2.7%        | -7    |
| SOLID_STARTER        | 0             | 0.0%      | 29              | 4.6%        | 29    |
| HIGH_END_ROTATION    | 0             | 0.0%      | 5               | 0.8%        | 5     |

High-tier read:

- Superstar/star count did not obviously explode.
- HIGH_IMPACT_STARTER count is 75.
- SOLID_STARTER count is 29.
- HIGH_END_ROTATION count is 5.
- Minimum/low-end did not get over-cleared.

## Contract-Relevant Pool Distribution

Contract-relevant here means `tid === -1` or current no-option contract years <= 1. This is a proxy, not a formal negotiation pool.

Current:

| tier                   | count | %     | avg MPG | avg valueNoPot | avg contractValue |
| ---------------------- | ----- | ----- | ------- | -------------- | ----------------- |
| STAR_NEAR_MAX          | 5     | 1.6%  | 34.58   | 67.47          | 67.27             |
| YOUNG_PROVEN_STARTER   | 7     | 2.2%  | 32.94   | 62.33          | 62.99             |
| LOW_END_STARTER        | 18    | 5.6%  | 30.09   | 59.52          | 59.17             |
| SPECIALIST_ROTATION    | 6     | 1.9%  | 18.89   | 53.53          | 53.48             |
| YOUNG_UPSIDE_SUSPECT   | 5     | 1.6%  | 21.53   | 55.48          | 56.98             |
| VETERAN_ROTATION_GUARD | 5     | 1.6%  | 24.54   | 57.85          | 57.34             |
| LOW_ROTATION_PLUS      | 3     | 0.9%  | 7.72    | 50.84          | 51.44             |
| VETERAN_MINIMUM_PLUS   | 3     | 0.9%  | 20.68   | 56.32          | 55.82             |
| MINIMUM_LEVEL          | 270   | 83.9% | 8.08    | 42.64          | 43.16             |

Candidate:

| tier                   | count | %     | avg MPG | avg valueNoPot | avg contractValue |
| ---------------------- | ----- | ----- | ------- | -------------- | ----------------- |
| STAR_NEAR_MAX          | 5     | 1.6%  | 34.58   | 67.47          | 67.27             |
| HIGH_IMPACT_STARTER    | 21    | 6.5%  | 31.16   | 60.81          | 60.69             |
| YOUNG_PROVEN_STARTER   | 6     | 1.9%  | 26.04   | 57.4           | 58.29             |
| SOLID_STARTER          | 7     | 2.2%  | 26.11   | 56.93          | 56.77             |
| HIGH_END_ROTATION      | 2     | 0.6%  | 21.71   | 55.24          | 55.07             |
| LOW_END_STARTER        | 13    | 4.0%  | 23.82   | 53.43          | 53.22             |
| SPECIALIST_ROTATION    | 11    | 3.4%  | 17.44   | 52.57          | 52.53             |
| YOUNG_UPSIDE_SUSPECT   | 1     | 0.3%  | 17.21   | 52.39          | 54.54             |
| VETERAN_ROTATION_GUARD | 2     | 0.6%  | 27.36   | 62.54          | 61.93             |
| LOW_ROTATION_PLUS      | 35    | 10.9% | 12.65   | 50.98          | 50.94             |
| VETERAN_MINIMUM_PLUS   | 1     | 0.3%  | 10.51   | 51.99          | 51.49             |
| MINIMUM_LEVEL          | 218   | 67.7% | 5.76    | 40.43          | 41.09             |

## Labeled 48 Downstream Eval

Candidate tier is temporarily connected to dry-run ranges and the unchanged v2 point placement formula. This does not overwrite original v2 outputs.

| metric            |          current v2 |    candidate dry-run |
| ----------------- | ------------------: | -------------------: |
| mean gap          |                2.46 |                 3.06 |
| median gap        |                0.78 |                 0.97 |
| severe            |                   4 |                    6 |
| too_low           |                  31 |                   18 |
| too_high          |                   7 |                   20 |
| better/tie        | current 10 / tie 29 | candidate 9 / tie 29 |
| severe fixed      |                     |                    3 |
| new severe        |                     |                    5 |
| improved by >= 3M |                     |                    4 |
| worsened by >= 3M |                     |                    7 |

Big labeled movements are in `contract_market_artifacts/contract_market_scoretier_candidate_labeled_eval.csv`; the report intentionally avoids over-indexing on individual player names.

## Overfit Risk Notes

- Labeled 48 are calibration/support cases, not final test.
- Candidate lanes were motivated by mechanism classes, but this dry-run still needs distribution scrutiny before any implementation discussion.
- Human ranges are used only for downstream eval, not inside `candidateScoreTier`.
- Trade value is not used.

## Whether Candidate Rules Look Safe Enough For Further Discussion

Not yet. Distribution safety concerns plus worse labeled 48 downstream metrics make this candidate unsuitable as-is.

## What Needs Adjustment Before Any Implementation

- Review whether HIGH_END_ROTATION and SOLID_STARTER counts are reasonable at full-league scale.
- Check contract-relevant pool specifically before judging market inflation.
- Inspect transitions that upgrade by 2+ tiers as a class, not as single-player anecdotes.
- Keep max/star gates strict unless separate evidence supports changes.
- Do not implement until a smaller v2.1A proposal is written and reviewed.
