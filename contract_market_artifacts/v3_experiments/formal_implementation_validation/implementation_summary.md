# Formal Implementation Validation

Scope: validates the formal implementation only. This run writes only `contract_market_artifacts/v3_experiments/formal_implementation_validation/` and does not rewrite historical review artifacts.

## Implementation Mapping

- V1/current base: `scoreBaseTier` in `tools/contract-market-tier-score.mjs` preserves the prior formal tier rules.
- V3-AB first layer: formal `scoreTier` starts from `scoreBaseTier`, then applies only 1A `HIGH_END_ROTATION` and 1B-B `SOLID_STARTER`.
- V3 ranges: `HIGH_END_ROTATION` is 7%-12% cap; `SOLID_STARTER` is 12%-17% cap.
- V2 placement: `scoreContractMarketPlacement` migrates the V2 range-internal point placement and years logic into the formal helper.
- Not migrated: sandbox old-demand sanity and trade-exploit audit fields; those remain validation/debug concepts, not formal point inputs.

## Current vs Formal V3 Distribution

| model     | counts                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| current   | {"SUPERSTAR_MAX":3,"STAR_NEAR_MAX":19,"YOUNG_PROVEN_STARTER":24,"LOW_END_STARTER":63,"SPECIALIST_ROTATION":9,"YOUNG_UPSIDE_SUSPECT":26,"VETERAN_ROTATION_GUARD":14,"LOW_ROTATION_PLUS":10,"VETERAN_MINIMUM_PLUS":6,"MINIMUM_LEVEL":460}                                          |
| formal_v3 | {"SUPERSTAR_MAX":3,"STAR_NEAR_MAX":19,"YOUNG_PROVEN_STARTER":24,"SOLID_STARTER":17,"LOW_END_STARTER":46,"HIGH_END_ROTATION":33,"SPECIALIST_ROTATION":6,"YOUNG_UPSIDE_SUSPECT":15,"VETERAN_ROTATION_GUARD":4,"LOW_ROTATION_PLUS":10,"VETERAN_MINIMUM_PLUS":3,"MINIMUM_LEVEL":454} |

## Focus Transitions

| currentTier            | formalTier        | count | percentageOfCurrentTierText | avgPointDeltaM |
| ---------------------- | ----------------- | ----- | --------------------------- | -------------- |
| LOW_END_STARTER        | SOLID_STARTER     | 17    | 27.0%                       | 8.135          |
| YOUNG_UPSIDE_SUSPECT   | HIGH_END_ROTATION | 11    | 42.3%                       | 9.622          |
| VETERAN_ROTATION_GUARD | HIGH_END_ROTATION | 10    | 71.4%                       | 7.319          |
| MINIMUM_LEVEL          | HIGH_END_ROTATION | 6     | 1.3%                        | 12.212         |

## Entrants

- HIGH_END_ROTATION entrants: 33
- SOLID_STARTER entrants: 17
- conflicts: 0

## Labeled Eval Summary

| dataset            | formal_n | formal_mean_gap_m | formal_median_gap_m | formal_in_range | formal_fine | formal_acceptable | formal_review | formal_major | formal_too_low | formal_too_high |
| ------------------ | -------- | ----------------- | ------------------- | --------------- | ----------- | ----------------- | ------------- | ------------ | -------------- | --------------- |
| validation20       | 20       | 1.699             | 0.6                 | 4               | 16          | 2                 | 2             | 0            | 10             | 6               |
| boundary40         | 28       | 1.645             | 0.755               | 8               | 23          | 2                 | 3             | 0            | 17             | 3               |
| blind_validation30 | 27       | 1.341             | 0.05                | 13              | 21          | 3                 | 2             | 1            | 5              | 9               |

## Artifact Reproduction

- ab_combined_audit validation/boundary max point diff: 0.01M
- blind_validation30 max V3 point diff: 0.01M

## Team Top15 Payroll Sanity

| team | formalTop15PointPayrollM | deltaM | deltaCapPct | highEndRotation_n | solidStarter_n |
| ---- | ------------------------ | ------ | ----------- | ----------------- | -------------- |
| MIA  | 177.77                   | 37.38  | 24.2%       | 3                 | 1              |
| UTA  | 76.67                    | 29.4   | 19.0%       | 2                 | 1              |
| LAC  | 199.06                   | 28.65  | 18.5%       | 3                 | 0              |
| HOU  | 123.23                   | 27.98  | 18.1%       | 3                 | 0              |
| LAL  | 152.32                   | 27.63  | 17.9%       | 2                 | 1              |
| PHI  | 155.92                   | 25.42  | 16.4%       | 2                 | 1              |
| DET  | 189.3                    | 25.23  | 16.3%       | 2                 | 1              |
| MIL  | 123.77                   | 23.33  | 15.1%       | 2                 | 0              |

## Review Queue

| source             | caseId  | pid  | name                | humanRangeText  | currentTier          | formalTier           | responsibleModule | formalPointM | formalDirection | formalGapM | formalGapBand | priorArtifactPointM | formalMinusPriorArtifactPointM | notes                        |
| ------------------ | ------- | ---- | ------------------- | --------------- | -------------------- | -------------------- | ----------------- | ------------ | --------------- | ---------- | ------------- | ------------------- | ------------------------------ | ---------------------------- |
| blind_validation30 | BV30-25 | 741  | RJ Barrett          | 25-35           | MINIMUM_LEVEL        | HIGH_END_ROTATION    | 1A                | 16.44        | too_low         | 8.56       | major         | 16.44               | 0                              | major human-range miss       |
| blind_validation30 | BV30-28 | 347  | Luke Kennard        | 28-38           | STAR_NEAR_MAX        | STAR_NEAR_MAX        | none              | 45.66        | too_high        | 7.66       | review        | 45.66               | 0                              | review-band human-range miss |
| validation20       | V20-10  | 1603 | Jason Preston       | $24.00M-$29.00M | LOW_END_STARTER      | LOW_END_STARTER      | none              | 16.86        | too_low         | 7.14       | review        | 16.86               | 0                              | review-band human-range miss |
| validation20       | V20-06  | 1339 | Isaiah Jackson      | $40.00M-$46.40M | YOUNG_PROVEN_STARTER | YOUNG_PROVEN_STARTER | none              | 33.47        | too_low         | 6.53       | review        | 33.48               | -0.01                          | review-band human-range miss |
| boundary40         | G-03    | 20   | OG Anunoby          | $12.00M-$18.00M | LOW_END_STARTER      | SOLID_STARTER        | 1B-B              | 24.17        | too_high        | 6.17       | review        | 24.17               | 0                              | review-band human-range miss |
| blind_validation30 | BV30-29 | 108  | Willie Cauley-Stein | 4-8             | VETERAN_MINIMUM_PLUS | HIGH_END_ROTATION    | 1A                | 13.86        | too_high        | 5.86       | review        | 13.86               | 0                              | review-band human-range miss |
| boundary40         | F-01    | 1675 | Shaedon Sharpe      | $20.00M-$30.00M | LOW_END_STARTER      | LOW_END_STARTER      | none              | 14.85        | too_low         | 5.15       | review        | 14.85               | 0                              | review-band human-range miss |
| boundary40         | H-02    | 589  | Ben Simmons         | $30.00M-$35.00M | LOW_END_STARTER      | SOLID_STARTER        | 1B-B              | 24.99        | too_low         | 5.01       | review        | 24.99               | 0                              | review-band human-range miss |

## Read

Formal V3 reproduces prior V3-AB point artifacts within 0.15M tolerance.
HIGH_END_ROTATION should be manually watched: 2 review queue rows are in that tier.
SOLID_STARTER stability check: 2 review queue rows are in that tier.
