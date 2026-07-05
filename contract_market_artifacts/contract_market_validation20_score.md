# Contract Market Validation20 Score

Scope: sandbox report only. This uses `validation20` as calibration/training-extension evidence, not as a final test and not as a direct rule-edit recipe. No `src` files are changed.

Inputs:

- `temp/contract_market_validation20_human_notes.json`
- `contract_market_artifacts/contract_market_validation20_candidates.csv`
- `contract_market_artifacts/contract_market_anchor_targets.json`
- `tools/contract-market-tier-score.mjs`
- `tools/contract-market-proxy-core.mjs`

## Overview

- 20 cases: 20
- Range overlap count: 13/20
- Too low count: 7
- Too high count: 0
- Severe miss count: 0
- Direction counts: roughly aligned: 13, too low: 7

## Case Results

| case   | pid  | bucket                          | human note | parsed human range | inferred human tier                 | model tier             | model range     | overlap? | direction       | short reason                                                                                                                                                                  |
| ------ | ---- | ------------------------------- | ---------- | ------------------ | ----------------------------------- | ---------------------- | --------------- | -------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V20-01 | 1824 | max_near_max_high_star          | $46.40M    | $46.40M            | SUPERSTAR_MAX                       | SUPERSTAR_MAX          | $46.40M         | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-02 | 1712 | max_near_max_high_star          | $46.40M    | $46.40M            | SUPERSTAR_MAX                       | SUPERSTAR_MAX          | $46.40M         | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-03 | 727  | max_near_max_high_star          | $46.40M    | $46.40M            | SUPERSTAR_MAX                       | STAR_NEAR_MAX          | $40.83M-$46.40M | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-04 | 1703 | max_near_max_high_star          | $46.40M    | $46.40M            | SUPERSTAR_MAX                       | STAR_NEAR_MAX          | $40.83M-$46.40M | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-05 | 1705 | young_proven_young_starter      | $33.46M    | $33.46M            | GOOD_STARTER                        | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-06 | 1339 | young_proven_young_starter      | $40-46.40M | $40.00M-$46.40M    | HIGH_STARTER / YOUNG_PROVEN_STARTER | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | no       | too low         | human $40.00M-$46.40M; model $26.29M-$34.80M; same band amount-tier gap; direction signal only, needs anchor/boundary confirmation                                            |
| V20-07 | 734  | young_proven_young_starter      | 38-44      | $38.00M-$44.00M    | HIGH_STARTER / YOUNG_PROVEN_STARTER | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | no       | too low         | human $38.00M-$44.00M; model $26.29M-$34.80M; same band amount-tier gap; direction signal only, needs anchor/boundary confirmation                                            |
| V20-08 | 1519 | young_proven_young_starter      | 38–43      | $38.00M-$43.00M    | HIGH_STARTER / YOUNG_PROVEN_STARTER | STAR_NEAR_MAX          | $40.83M-$46.40M | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-09 | 45   | low_end_starter_good_rotation   | 22–27      | $22.00M-$27.00M    | SOLID_STARTER                       | LOW_END_STARTER        | $9.28M-$18.56M  | no       | too low         | human $22.00M-$27.00M; model $9.28M-$18.56M; cross-band amount-tier gap; direction signal only, needs anchor/boundary confirmation                                            |
| V20-10 | 1603 | low_end_starter_good_rotation   | 24–29      | $24.00M-$29.00M    | SOLID_STARTER                       | LOW_END_STARTER        | $9.28M-$18.56M  | no       | too low         | human $24.00M-$29.00M; model $9.28M-$18.56M; cross-band amount-tier gap; direction signal only, needs anchor/boundary confirmation                                            |
| V20-11 | 153  | low_end_starter_good_rotation   | 24–28      | $24.00M-$28.00M    | SOLID_STARTER                       | LOW_END_STARTER        | $9.28M-$18.56M  | no       | too low         | human $24.00M-$28.00M; model $9.28M-$18.56M; cross-band amount-tier gap; direction signal only, needs anchor/boundary confirmation                                            |
| V20-12 | 812  | low_end_starter_good_rotation   | 23–28      | $23.00M-$28.00M    | SOLID_STARTER                       | YOUNG_PROVEN_STARTER   | $26.29M-$34.80M | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-13 | 1672 | specialist_low_rotation         | 10–14      | $10.00M-$14.00M    | GOOD_ROTATION / SPECIALIST          | SPECIALIST_ROTATION    | $5.41M-$8.51M   | no       | too low         | human $10.00M-$14.00M; model $5.41M-$8.51M; adjacent amount-tier gap; direction signal only, needs anchor/boundary confirmation                                               |
| V20-14 | 665  | specialist_low_rotation         | 3-5，底薪  | $3.00M-$5.00M      | MINIMUM_LEVEL                       | VETERAN_MINIMUM_PLUS   | $3.71M-$5.41M   | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-15 | 379  | specialist_low_rotation         | 10-14      | $10.00M-$14.00M    | GOOD_ROTATION / SPECIALIST          | VETERAN_ROTATION_GUARD | $6.19M-$9.28M   | no       | too low         | human $10.00M-$14.00M; model $6.19M-$9.28M; adjacent amount-tier gap; term should be diagnosed separately from AAV; direction signal only, needs anchor/boundary confirmation |
| V20-16 | 1618 | specialist_low_rotation         | 8-12       | $8.00M-$12.00M     | GOOD_ROTATION / SPECIALIST          | SPECIALIST_ROTATION    | $5.41M-$8.51M   | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-17 | 95   | veteran_minimum_fringe_negative | 底薪       | $3.71M             | MINIMUM_LEVEL                       | MINIMUM_LEVEL          | $3.71M-$4.27M   | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-18 | 340  | veteran_minimum_fringe_negative | 底薪       | $3.71M             | MINIMUM_LEVEL                       | MINIMUM_LEVEL          | $3.71M-$4.27M   | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-19 | 484  | veteran_minimum_fringe_negative | 底薪       | $3.71M             | MINIMUM_LEVEL                       | MINIMUM_LEVEL          | $3.71M-$4.27M   | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |
| V20-20 | 459  | veteran_minimum_fringe_negative | 底薪       | $3.36M             | MINIMUM_LEVEL                       | MINIMUM_LEVEL          | $3.36M-$3.86M   | yes      | roughly aligned | range overlap; validation20 is supportive but not final-test evidence                                                                                                         |

## Bucket Summary

| bucket                          | cases | overlap | too low | too high | severe miss |
| ------------------------------- | ----- | ------- | ------- | -------- | ----------- |
| max_near_max_high_star          | 4     | 4       | 0       | 0        | 0           |
| young_proven_young_starter      | 4     | 2       | 2       | 0        | 0           |
| low_end_starter_good_rotation   | 4     | 1       | 3       | 0        | 0           |
| specialist_low_rotation         | 4     | 2       | 2       | 0        | 0           |
| veteran_minimum_fringe_negative | 4     | 4       | 0       | 0        | 0           |

## Complete Amount Ladder Coverage Check

This ladder is diagnostic only. It is used to inspect continuous amount/cap coverage from player minimum to eligible max, not to replace the current model.

| diagnostic ladder band              | definition                                   | example amount  | cap%        |
| ----------------------------------- | -------------------------------------------- | --------------- | ----------- |
| MINIMUM_LEVEL                       | player minimum to about 1.15x player minimum | $2.94M-$3.38M   | 1.9%-2.2%   |
| MINIMUM_PLUS                        | about 1.15x player minimum to 3.5% cap       | $3.38M-$5.41M   | 2.2%-3.5%   |
| LOW_ROTATION                        | 3.5%-5.5% cap                                | $5.41M-$8.51M   | 3.5%-5.5%   |
| GOOD_ROTATION / SPECIALIST          | 5.5%-8.0% cap                                | $8.51M-$12.37M  | 5.5%-8.0%   |
| HIGH_END_ROTATION                   | 8.0%-10.0% cap                               | $12.37M-$15.46M | 8.0%-10.0%  |
| LOW_END_STARTER                     | 10.0%-14.0% cap                              | $15.46M-$21.65M | 10.0%-14.0% |
| SOLID_STARTER                       | 14.0%-18.0% cap                              | $21.65M-$27.84M | 14.0%-18.0% |
| GOOD_STARTER                        | 18.0%-22.5% cap                              | $27.84M-$34.80M | 18.0%-22.5% |
| HIGH_STARTER / YOUNG_PROVEN_STARTER | 22.5%-30.0% cap                              | $34.80M-$46.40M | 22.5%-30.0% |
| STAR_NEAR_MAX                       | 30.0% cap to eligible max below exact max    | $46.40M         | 30.0%       |
| SUPERSTAR_MAX                       | eligible max                                 | $46.40M         | 30.0%       |

Current MODEL_TIERS projected onto the V20-01 salary context (salary cap $154.65M, player minimum $2.94M, eligible max $46.40M):

| current model tier     | range type        | example amount  | cap%        | years |
| ---------------------- | ----------------- | --------------- | ----------- | ----- |
| MINIMUM_LEVEL          | minimumMultiplier | $2.94M-$3.38M   | 1.9%-2.2%   |       |
| VETERAN_MINIMUM_PLUS   | capPct            | $2.94M-$5.41M   | 1.9%-3.5%   |       |
| LOW_ROTATION_PLUS      | capPct            | $3.09M-$5.41M   | 2.0%-3.5%   |       |
| YOUNG_UPSIDE_SUSPECT   | capPct            | $3.87M-$6.96M   | 2.5%-4.5%   |       |
| SPECIALIST_ROTATION    | capPct            | $5.41M-$8.51M   | 3.5%-5.5%   |       |
| VETERAN_ROTATION_GUARD | capPct            | $6.19M-$9.28M   | 4.0%-6.0%   | 1-2   |
| LOW_END_STARTER        | capPct            | $9.28M-$18.56M  | 6.0%-12.0%  |       |
| YOUNG_PROVEN_STARTER   | capPct            | $26.29M-$34.80M | 17.0%-22.5% |       |
| STAR_NEAR_MAX          | eligibleMaxPct    | $40.83M-$46.40M | 26.4%-30.0% |       |
| SUPERSTAR_MAX          | eligibleMaxPct    | $46.40M         | 30.0%       |       |

Coverage findings:

- current MODEL_TIERS leave amount gaps: $18.56M-$26.29M before YOUNG_PROVEN_STARTER; $34.80M-$40.83M before STAR_NEAR_MAX
- current MODEL_TIERS overlap in low/mid bands: VETERAN_MINIMUM_PLUS touches $2.94M-$3.38M; LOW_ROTATION_PLUS touches $3.09M-$5.41M; YOUNG_UPSIDE_SUSPECT touches $3.87M-$5.41M; SPECIALIST_ROTATION touches $5.41M-$6.96M; VETERAN_ROTATION_GUARD touches $6.19M-$8.51M
- amount bands and player-type labels are mixed in MODEL_TIERS, so coverage diagnostics should be separated from archetype/term rules
- LOW_END_STARTER upper edge is below the suggested 10%-14% cap diagnostic band
- Low-end coverage depends on player-specific minimums, so veteran minimum cases should not be evaluated against a fixed dollar floor.
- The current table has player-type/archetype tiers such as `YOUNG_UPSIDE_SUSPECT`, `VETERAN_ROTATION_GUARD`, and `YOUNG_PROVEN_STARTER` mixed with amount bands. That makes amount coverage, archetype selection, and term risk harder to diagnose independently.
- There is no current standalone 12%-17% cap amount band between `LOW_END_STARTER` and `YOUNG_PROVEN_STARTER`, and no explicit 22.5%-30% high-starter band other than the young-proven starter archetype.

## Systemic Direction Signals

- Validation20 shows direction signals, not final conclusions. Any tier movement should be verified against anchor targets plus boundary/challenge samples.
- The strongest amount signal is whether the current model leaves mid/high-starter gaps: validation cases in the $22M-$29M and $38M-$44M zones often sit between existing current-model bands or depend on eligible-max logic.
- Minimum and minimum-plus cases need player-specific minimum handling. Notes marked `底薪` were parsed against each player's actual minimum, not a fixed dollar value.
- AAV tier and years/term logic should be diagnosed separately. Current `MODEL_TIERS` only has an explicit years hint for `VETERAN_ROTATION_GUARD`; validation20 notes mostly encode amount, not term.
- Anchor consistency is stronger where validation20 misses point in the same direction as existing anchors. Where validation20 conflicts with anchors or lacks comparable anchors, treat it as a challenge-sample request rather than a rule change.

## Next Steps

- Add boundary samples around 5.5%/8%/10%/14%/18%/22.5%/30% cap to verify gaps and overlaps independently of these 20 cases.
- Add challenge samples for $20M-$35M starters, including inefficient starters, young upside starters, and stable veterans with lower term tolerance.
- Add near-max samples below exact eligible max to separate `STAR_NEAR_MAX` from `SUPERSTAR_MAX`.
- Add veteran-minimum and minimum-plus samples with different years of experience so player-specific minimum behavior is covered.
- Split AAV amount-tier scoring from years/term scoring before changing formal rules; term risk should not be hidden inside amount bands.
