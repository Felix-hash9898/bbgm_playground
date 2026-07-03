# Contract Market Tier Scoring Sandbox

Inputs:

- `real_saves/BBGM_League_3_2025_re_sign_players.json.gz`
- `contract_market_artifacts/contract_market_anchor_targets.json`

Scope: sandbox only. No `src` changes. Proxy calculations are imported from `tools/contract-market-proxy-core.mjs`, the same helper used by `tools/contract-market-proxy-explore.mjs`.

Hit rate on these anchors: 14/15. Hit means model tier matches the comparable manual target and model amount range overlaps the manual target range when one is specified. `LOW_END_STARTER_GUARD_LENGTH_RISK` is intentionally marked miss if the current normal/no-option guard length is still risky.

Validation human notes input: `temp/contract_market_validation20_human_notes.json` (0 entries loaded if present). This script is ready to read validation20 export JSON, but anchor tier scoring below only uses the fixed anchor targets.

## Anchor Results

| pid | player | target tier | model tier | target range | model range | model cap% | years | hit/miss | miss reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1294 | Sam Hauser | SPECIALIST_ROTATION | SPECIALIST_ROTATION | $5.00M-$7.00M | $5.41M-$8.51M | 3.5%-5.5% |  | HIT |  |
| 361 | Skal Labissière | MINIMUM_LEVEL | MINIMUM_LEVEL |  | $3.37M-$3.88M | 2.2%-2.5% |  | HIT |  |
| 225 | Rudy Gobert | VETERAN_MINIMUM_PLUS | VETERAN_MINIMUM_PLUS | $3.71M | $3.71M-$5.41M | 2.4%-3.5% |  | HIT |  |
| 8 | Jarrett Allen | STAR_NEAR_MAX | STAR_NEAR_MAX | $42.00M-$46.40M | $40.83M-$46.40M | 26.4%-30.0% |  | HIT |  |
| 1669 | Alperen Şengün | YOUNG_PROVEN_STARTER | YOUNG_PROVEN_STARTER | $26.00M-$34.00M | $26.29M-$34.80M | 17.0%-22.5% |  | HIT |  |
| 906 | Ayo Dosunmu | YOUNG_PROVEN_STARTER | YOUNG_PROVEN_STARTER | $28.00M-$34.00M | $26.29M-$34.80M | 17.0%-22.5% |  | HIT |  |
| 1479 | Jaden McDaniels | LOW_END_STARTER | LOW_END_STARTER | $13.00M-$20.00M | $9.28M-$18.56M | 6.0%-12.0% |  | HIT |  |
| 1409 | Vit Krejci | LOW_ROTATION_PLUS | LOW_ROTATION_PLUS | $3.00M-$5.00M | $3.09M-$5.41M | 2.0%-3.5% |  | HIT |  |
| 65 | Eric Bledsoe | VETERAN_MINIMUM_LEVEL | MINIMUM_LEVEL |  | $3.71M-$4.27M | 2.4%-2.8% |  | HIT |  |
| 1363 | Keon Johnson | YOUNG_UPSIDE_SUSPECT | YOUNG_UPSIDE_SUSPECT | $4.00M-$6.00M | $3.87M-$6.96M | 2.5%-4.5% |  | HIT |  |
| 1266 | Jalen Green | SUPERSTAR_MAX | SUPERSTAR_MAX | $46.40M | $46.40M | 30.0% |  | HIT |  |
| 1744 | Isaiah Todd | LOW_END_STARTER | LOW_END_STARTER | $8.00M-$14.00M | $9.28M-$18.56M | 6.0%-12.0% |  | HIT |  |
| 187 | Tyler Ennis | VETERAN_MINIMUM_LEVEL | MINIMUM_LEVEL |  | $3.71M-$4.27M | 2.4%-2.8% |  | HIT |  |
| 578 | Dennis Schröder | VETERAN_ROTATION_GUARD | VETERAN_ROTATION_GUARD | $6.00M-$8.00M | $6.19M-$9.28M | 4.0%-6.0% | 1-2 | HIT |  |
| 517 | London Perrantes | LOW_END_STARTER_GUARD_LENGTH_RISK | LOW_END_STARTER |  | $9.28M-$18.56M | 6.0%-12.0% |  | MISS | AAV aligns with starter tier, but 4-year guard length risk is not modeled by base tiers |

## Key Proxy Snapshot

| pid | player | model tier | normal current | demand | contractValue | valueNoPot | value | MPG | start% | PER | EWA | BPM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1294 | Sam Hauser | SPECIALIST_ROTATION | $3.16M | $10.53M | 52.4 | 52.9 | 50.3 | 13.8 | 9.5% | 14.9 | 1.6 | 0.4 |
| 361 | Skal Labissière | MINIMUM_LEVEL | $4.16M | $9.56M | 51.8 | 52.2 | 49.1 | 11.5 | 4.3% | 9.3 | -0.4 | -4.3 |
| 225 | Rudy Gobert | VETERAN_MINIMUM_PLUS | $3.83M | $8.98M | 51.5 | 52 | 47.8 | 10.5 | 2.5% | 13.4 | 0.9 | -0.8 |
| 8 | Jarrett Allen | STAR_NEAR_MAX | $33.11M | $34.14M | 66.2 | 66.5 | 64.9 | 32.3 | 100.0% | 21.6 | 11.6 | 4.8 |
| 1669 | Alperen Şengün | YOUNG_PROVEN_STARTER | $18.18M | $24.25M | 60.4 | 59.6 | 63.7 | 29.9 | 100.0% | 17.6 | 6.3 | 1.1 |
| 906 | Ayo Dosunmu | YOUNG_PROVEN_STARTER | $22.72M | $29.36M | 63.4 | 63.2 | 64.3 | 36 | 100.0% | 20.2 | 7.5 | 7.1 |
| 1479 | Jaden McDaniels | LOW_END_STARTER | $12.43M | $21.36M | 58.7 | 58.5 | 59.7 | 28.3 | 100.0% | 16.3 | 4.5 | -0.7 |
| 1409 | Vit Krejci | LOW_ROTATION_PLUS | $3.15M | $8.73M | 51.4 | 51.1 | 52.2 | 7.8 | 0.0% | 14.8 | 1 | 1.5 |
| 65 | Eric Bledsoe | MINIMUM_LEVEL | $3.96M | $8.18M | 51 | 51.6 | 46.9 | 10.4 | 0.0% | 9.6 | -0.1 | -2.4 |
| 1363 | Keon Johnson | YOUNG_UPSIDE_SUSPECT | $7.51M | $14.49M | 55.5 | 54 | 59.2 | 22.4 | 61.0% | 10.4 | -0.1 | -2.9 |
| 1266 | Jalen Green | SUPERSTAR_MAX | $38.12M | $38.86M | 69 | 68.6 | 70.6 | 37.2 | 100.0% | 28.2 | 18.3 | 10.4 |
| 1744 | Isaiah Todd | LOW_END_STARTER | $8.14M | $18.04M | 56.8 | 56.2 | 59.1 | 28.9 | 100.0% | 15.2 | 2.4 | -1.5 |
| 187 | Tyler Ennis | MINIMUM_LEVEL | $4.11M | $7.86M | 50.8 | 51.3 | 47.2 | 7.9 | 0.0% | 9.1 | -0.5 | -3.3 |
| 578 | Dennis Schröder | VETERAN_ROTATION_GUARD | $3.99M | $12.94M | 53.1 | 53.6 | 49.3 | 20.3 | 45.1% | 16.3 | 3.7 | 1.2 |
| 517 | London Perrantes | LOW_END_STARTER | $8.98M | $17.46M | 55.7 | 56.2 | 51.7 | 26.5 | 100.0% | 13.5 | 2.2 | 0.7 |

## Miss Reasons

- London Perrantes: AAV aligns with starter tier, but 4-year guard length risk is not modeled by base tiers. Rule fired because starter role and adequate BBGM current value with at least neutral production support.

## Tier Range Rules

| tier | amount range |
| --- | --- |
| MINIMUM_LEVEL | player minimum to 1.15x player minimum |
| VETERAN_MINIMUM_PLUS | player minimum to 3.5% cap |
| LOW_ROTATION_PLUS | 2.0%-3.5% cap |
| SPECIALIST_ROTATION | 3.5%-5.5% cap |
| YOUNG_UPSIDE_SUSPECT | 2.5%-4.5% cap |
| VETERAN_ROTATION_GUARD | 4.0%-6.0% cap, length 1-2 years |
| LOW_END_STARTER | 6.0%-12.0% cap |
| YOUNG_PROVEN_STARTER | 17.0%-22.5% cap |
| STAR_NEAR_MAX | 88%-100% eligible max |
| SUPERSTAR_MAX | 100% eligible max |

## Rules That Need Validation

- The thresholds for `YOUNG_PROVEN_STARTER` vs `STAR_NEAR_MAX` are still coarse. They lean on `getContractValue`, `valueNoPot`, starter load, and EWA/VORP/BPM, but need a larger validation set around upper-end starters.
- `LOW_END_STARTER` currently treats starter role plus BBGM current value as enough. It needs validation for inefficient starters with strong minutes but weak impact stats.
- `YOUNG_UPSIDE_SUSPECT` uses potential premium and pot with role uncertainty. This should be checked against young athletic wings/guards who start because of roster context.
- `VETERAN_ROTATION_GUARD` has an explicit 1-2 year length rule, but other tiers do not yet model length risk. The London Perrantes style target shows that AAV and term need separate scoring.
- Specialist scoring uses 3pt composite and skill margin. It needs validation for defensive specialists, rebound-only bigs, and pass-first bench guards so specialist tiers do not become shooting-only.
- `On-Off` is included as context but deliberately not a hard tier splitter. A larger set should determine whether it adds signal after minutes and EWA/VORP/BPM.
