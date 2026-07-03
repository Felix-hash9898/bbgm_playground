# Contract Market Proxy Exploration

Inputs:

- `real_saves/BBGM_League_3_2025_re_sign_players.json.gz`
- `temp/bbgm_contract_review_notes_v3.json`
- `contract_market_artifacts/contract_market_anchor_targets.json`

Scope: standalone proxy dump only. This script does not import or modify formal game logic. Shared proxy formulas live in `tools/contract-market-proxy-core.mjs` and replicate the basketball branches of `player/value.ts`, `contracts/contractValue.ts`, contract min/max helpers, option effective-offer helpers, and `player/compositeRating.ts`. `COMPOSITE_WEIGHTS` is read from `src/common/constants.basketball.ts` at runtime.

League context: season 2025, phase 7, salary cap $154.65M, min $1.30M, global max $51.55M. Active-player OVR normalization used by `value.ts`: mean 49.205, std 11.586.

## Anchor Overview

| pid | player | age | pos | ovr | pot | valueNoPot | value | prem | contractValue | demand | normal current | option | cap% | eligibleMax | target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1294 | Sam Hauser | 28 | F | 56 | 56 | 52.9 | 50.3 | -2.6 | 52.4 | $10.53M | $3.16M | player | 2.0% | $38.66M | SPECIALIST_ROTATION |
| 361 | Skal Labissière | 29 | FC | 56 | 56 | 52.2 | 49.1 | -3.1 | 51.8 | $9.56M | $4.16M | player | 2.7% | $46.40M | MINIMUM_LEVEL |
| 225 | Rudy Gobert | 33 | C | 55 | 55 | 52 | 47.8 | -4.2 | 51.5 | $8.98M | $3.83M |  | 2.5% | $54.13M | VETERAN_MINIMUM_PLUS |
| 8 | Jarrett Allen | 27 | C | 72 | 74 | 66.5 | 64.9 | -1.6 | 66.2 | $34.14M | $33.11M | player | 21.4% | $46.40M | STAR_NEAR_MAX |
| 1669 | Alperen Şengün | 23 | C | 64 | 72 | 59.6 | 63.7 | 4.1 | 60.4 | $24.25M | $18.18M |  | 11.8% | $38.66M | YOUNG_PROVEN_STARTER |
| 906 | Ayo Dosunmu | 25 | SG | 69 | 72 | 63.2 | 64.3 | 1.1 | 63.4 | $29.36M | $22.72M | player | 14.7% | $38.66M | YOUNG_PROVEN_STARTER |
| 1479 | Jaden McDaniels | 25 | F | 63 | 67 | 58.5 | 59.7 | 1.2 | 58.7 | $21.36M | $12.43M |  | 8.0% | $38.66M | LOW_END_STARTER |
| 1409 | Vit Krejci | 25 | G | 54 | 58 | 51.1 | 52.2 | 1 | 51.4 | $8.73M | $3.15M |  | 2.0% | $38.66M | LOW_ROTATION_PLUS |
| 65 | Eric Bledsoe | 36 | G | 55 | 55 | 51.6 | 46.9 | -4.6 | 51 | $8.18M | $3.96M |  | 2.6% | $54.13M | VETERAN_MINIMUM_LEVEL |
| 1363 | Keon Johnson | 23 | SG | 59 | 68 | 54 | 59.2 | 5.2 | 55.5 | $14.49M | $7.51M |  | 4.9% | $38.66M | YOUNG_UPSIDE_SUSPECT |
| 1266 | Jalen Green | 23 | SG | 72 | 78 | 68.6 | 70.6 | 2.1 | 69 | $38.86M | $38.12M | player | 24.6% | $46.40M | SUPERSTAR_MAX |
| 1744 | Isaiah Todd | 24 | PF | 60 | 67 | 56.2 | 59.1 | 2.8 | 56.8 | $18.04M | $8.14M |  | 5.3% | $38.66M | LOW_END_STARTER |
| 187 | Tyler Ennis | 31 | PG | 55 | 55 | 51.3 | 47.2 | -4.1 | 50.8 | $7.86M | $4.11M | player | 2.7% | $54.13M | VETERAN_MINIMUM_LEVEL |
| 578 | Dennis Schröder | 32 | G | 56 | 56 | 53.6 | 49.3 | -4.3 | 53.1 | $12.94M | $3.99M |  | 2.6% | $54.13M | VETERAN_ROTATION_GUARD |
| 517 | London Perrantes | 31 | PG | 61 | 61 | 56.2 | 51.7 | -4.5 | 55.7 | $17.46M | $8.98M | player | 5.8% | $46.40M | LOW_END_STARTER_GUARD_LENGTH_RISK |

## Latest Regular Season Production

| pid | player | GP | GS | MPG | start% | PTS | TRB | AST | PER | EWA | VORP | BPM | USG | On-Off |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1294 | Sam Hauser | 74 | 7 | 13.8 | 9.5% | 6.6 | 1.9 | 0.5 | 14.9 | 1.6 | 0.6 | 0.4 | 17.6 | 0.9 |
| 361 | Skal Labissière | 47 | 2 | 11.5 | 4.3% | 3.7 | 2.7 | 0.6 | 9.3 | -0.4 | -0.3 | -4.3 | 16.8 | -16.9 |
| 225 | Rudy Gobert | 81 | 2 | 10.5 | 2.5% | 2.6 | 3.5 | 0.6 | 13.4 | 0.9 | 0.3 | -0.8 | 11.1 | -10.3 |
| 8 | Jarrett Allen | 82 | 82 | 32.3 | 100.0% | 18 | 10.1 | 3.1 | 21.6 | 11.6 | 4.5 | 4.8 | 23.2 | 11.3 |
| 1669 | Alperen Şengün | 76 | 76 | 29.9 | 100.0% | 15 | 7.9 | 4 | 17.6 | 6.3 | 1.8 | 1.1 | 23 | 3.4 |
| 906 | Ayo Dosunmu | 54 | 54 | 36 | 100.0% | 17.3 | 6.6 | 8.3 | 20.2 | 7.5 | 4.5 | 7.1 | 21.5 | 7 |
| 1479 | Jaden McDaniels | 76 | 76 | 28.3 | 100.0% | 12.3 | 6.9 | 1.1 | 16.3 | 4.5 | 0.7 | -0.7 | 19 | -0.5 |
| 1409 | Vit Krejci | 81 | 0 | 7.8 | 0.0% | 3 | 1 | 1.6 | 14.8 | 1 | 0.6 | 1.5 | 16.2 | 3.6 |
| 65 | Eric Bledsoe | 24 | 0 | 10.4 | 0.0% | 3 | 1.3 | 1.5 | 9.6 | -0.1 | 0 | -2.4 | 15.3 | 7 |
| 1363 | Keon Johnson | 59 | 36 | 22.4 | 61.0% | 6.6 | 3.6 | 1.5 | 10.4 | -0.1 | -0.3 | -2.9 | 15.6 | 11.5 |
| 1266 | Jalen Green | 70 | 70 | 37.2 | 100.0% | 34.8 | 7.5 | 4.8 | 28.2 | 18.3 | 8.2 | 10.4 | 38.3 | 9.7 |
| 1744 | Isaiah Todd | 57 | 57 | 28.9 | 100.0% | 13.1 | 6.9 | 0.9 | 15.2 | 2.4 | 0.2 | -1.5 | 20.5 | 1.7 |
| 187 | Tyler Ennis | 81 | 0 | 7.9 | 0.0% | 2 | 1 | 1.4 | 9.1 | -0.5 | -0.2 | -3.3 | 13.9 | -2.9 |
| 578 | Dennis Schröder | 82 | 37 | 20.3 | 45.1% | 8.7 | 2.5 | 4.9 | 16.3 | 3.7 | 1.4 | 1.2 | 20.2 | -0.1 |
| 517 | London Perrantes | 81 | 81 | 26.5 | 100.0% | 10 | 3.9 | 4.5 | 13.5 | 2.2 | 1.5 | 0.7 | 17.7 | 1.9 |

## BBGM Composite Ratings

| pid | player | skills | usage | passing | 3pt | reb | Di | Dp | ath |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1294 | Sam Hauser | 3 | 0.553 | 0.505 | 0.756 | 0.553 | 0.46 | 0.478 | 0.485 |
| 361 | Skal Labissière | Di | 0.5 | 0.489 | 0.389 | 0.604 | 0.573 | 0.497 | 0.533 |
| 225 | Rudy Gobert | Di Po R | 0.403 | 0.495 | 0.117 | 0.711 | 0.642 | 0.452 | 0.509 |
| 8 | Jarrett Allen | A Di Dp Po R V | 0.617 | 0.562 | 0.512 | 0.714 | 0.703 | 0.648 | 0.673 |
| 1669 | Alperen Şengün | Po R V | 0.624 | 0.608 | 0.462 | 0.642 | 0.565 | 0.548 | 0.541 |
| 906 | Ayo Dosunmu | 3 Di Dp | 0.604 | 0.625 | 0.652 | 0.601 | 0.575 | 0.621 | 0.601 |
| 1479 | Jaden McDaniels | Di R | 0.565 | 0.522 | 0.467 | 0.624 | 0.609 | 0.603 | 0.6 |
| 1409 | Vit Krejci | Ps | 0.512 | 0.631 | 0.526 | 0.488 | 0.44 | 0.468 | 0.467 |
| 65 | Eric Bledsoe |  | 0.504 | 0.614 | 0.461 | 0.456 | 0.503 | 0.476 | 0.439 |
| 1363 | Keon Johnson | A Dp | 0.48 | 0.544 | 0.417 | 0.436 | 0.526 | 0.621 | 0.644 |
| 1266 | Jalen Green | A Dp Po V | 0.758 | 0.626 | 0.576 | 0.535 | 0.538 | 0.657 | 0.658 |
| 1744 | Isaiah Todd | A Di R | 0.569 | 0.442 | 0.495 | 0.643 | 0.576 | 0.591 | 0.632 |
| 187 | Tyler Ennis |  | 0.478 | 0.604 | 0.492 | 0.468 | 0.475 | 0.491 | 0.489 |
| 578 | Dennis Schröder | Ps | 0.57 | 0.662 | 0.367 | 0.446 | 0.428 | 0.47 | 0.467 |
| 517 | London Perrantes |  | 0.546 | 0.598 | 0.53 | 0.524 | 0.522 | 0.566 | 0.569 |

## Top Simple Correlations vs Manual Target Buckets

| proxy | Pearson r |
| --- | --- |
| min | 0.963 |
| MPG | 0.944 |
| estimatedDemandNoRandom | 0.915 |
| starterShare | 0.912 |
| getContractValue | 0.904 |
| valueNoPot | 0.895 |
| value | 0.883 |
| ovr | 0.882 |
| pot | 0.879 |
| PER | 0.878 |

## What Looks Most Explanatory

- `estimatedDemandNoRandom`, `getContractValue`, `valueNoPot`, and `value` remain the strongest first-pass anchors because they reuse BBGM's current-production/PER/rating blend and salary conversion.
- Minute load and role proxies (`min`, `MPG`, `starterShare`) separate real starters from small-sample playoff or bench-only lines better than efficiency alone.
- `PER`, `EWA`, `VORP`, and `BPM` are useful when they agree with minutes. `EWA/VORP` help distinguish full-season value from high-rate small samples.
- Composite ratings explain archetype premiums: `usage` for primary scorers, `passing` for guards/creators, `rebounding/defenseInterior` for bigs, `defensePerimeter/athleticism` for wings and guards. Skill cutoff margin is more useful than label alone.

## What Looks Misleading

- Raw `pot` and `potentialPremium` can overstate young, limited-minute players. BBGM's `getContractValue` intentionally dampens trade-value upside for contract pricing, especially for age <= 24 with <1500 recent minutes.
- Small-sample `PER`, `On-Off`, `TS`, and `eFG` can mislead when latest regular season minutes are low.
- `On-Off` is context sensitive in a 15-player anchor set. It is a warning flag, not a tier driver.
- Skill labels are thresholded and fuzzed. A player barely above/below `3`, `Ps`, `R`, `Di`, `Dp`, or `A` should not jump tiers without the underlying composite margin and production support.

## Suggested Next Step for Tier Scoring

Use `estimatedDemandNoRandom` or `getContractValue` as the base market axis, then adjust with explicit modifiers:

1. Role/sample modifier from `min`, `MPG`, `starterShare`, and `GP`.
2. Production modifier from `EWA/VORP/BPM/PER`, with small-sample shrinkage.
3. Archetype modifier from composite ratings and skill margins.
4. Upside/risk modifier from age, `potentialPremium`, and recent minutes, capped so raw potential cannot dominate the BBGM contract-value base.
5. Clamp against `minContractForPlayer`, low-end young FA rules, and `eligibleMax`.

CSV contains the full dump, including all requested advanced stats, normal/no-option contract fields, and skill cutoff margins.
