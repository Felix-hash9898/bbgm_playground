# ScoreTier Candidate Dry-Run Rules

These rules exist only inside `tools/contract-market-scoretier-candidate-dryrun.mjs`. They are not implementation, not v2.1, and not changes to `tools/contract-market-tier-score.mjs`.

## Candidate Rule Map

The candidate first layer keeps the top tiers strict and adds candidate-only middle tiers:

1. `SUPERSTAR_MAX`: keep current strict gate.
2. `STAR_NEAR_MAX`: keep current strict gate.
3. `HIGH_IMPACT_STARTER`: high-current-impact starter lane without age hard blocker.
4. `YOUNG_PROVEN_STARTER`: young productive starter or large-rotation lane.
5. `SOLID_STARTER`: bridge between low-end starter and young-proven/high-impact starter.
6. `HIGH_END_ROTATION`: sixth-man, high-end rotation, young productive rotation, connector, or portable shooting lane.
7. `LOW_END_STARTER`: softened starter-ish entry with value/production vetoes.
8. `SPECIALIST_ROTATION`: portable shooting/specialist lane.
9. Existing lower tiers and minimum fallback.

## Core Identity, Support Signals, Hard Vetoes

| candidate tier       | core identity                                  | support signals                                                                                                      | hard vetoes                                          |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| SUPERSTAR_MAX        | current strict superstar                       | current scoreTier superstar gate                                                                                     | unchanged                                            |
| STAR_NEAR_MAX        | current strict star/near-max                   | current scoreTier near-max gate                                                                                      | unchanged                                            |
| HIGH_IMPACT_STARTER  | non-young or young high-current-impact starter | starter role, contractValue/valueNoPot, EWA/VORP/BPM/PER, connector/defense support                                  | GP/MPG/valueNoPot floor, extreme low efficiency veto |
| YOUNG_PROVEN_STARTER | young productive starter/large rotation        | age/pot, role, contract/value support, production, portable skill                                                    | GP/MPG/valueNoPot floor                              |
| SOLID_STARTER        | starter bridge lane                            | starter-like role, valueNoPot, contractValue, neutral production, connector/scorer support                           | GP/MPG/valueNoPot floor                              |
| HIGH_END_ROTATION    | sixth-man/high-end rotation lane               | strong rotation role, creator/scorer, young productive rotation, portable shooting, connector defense, value support | GP/MPG/valueNoPot floor                              |
| LOW_END_STARTER      | starter-ish lower lane                         | role, starts/starterShare, valueNoPot, contractValue, some production                                                | GP/MPG/valueNoPot floor                              |
| SPECIALIST_ROTATION  | portable specialist                            | shooting package, role minutes, TS/volume, valueNoPot                                                                | GP/MPG floor                                         |

## Why This Is Softer Than Current scoreTier

- It does not require `establishedStarter` as the only starter-ish entry.
- It adds current-impact starter lanes for non-young players.
- It adds a `SOLID_STARTER` bridge between 12% and 17% cap.
- It adds a `HIGH_END_ROTATION` lane for sixth-man/scorer/connector/portable shooting profiles.
- It uses core identity + support signals + vetoes rather than pure all-AND gates.

## Why This Should Not Be Too Soft

- Top max/star tiers are still current strict gates.
- Middle lanes require role and value floors.
- Low production and low role profiles are still vetoed.
- Candidate-only tiers are range-mapped only inside this dry run.

## Likely Overfit Risks

- Labeled 48 can make the middle tiers look better even if full-league distribution inflates.
- HIGH_END_ROTATION can become too broad if shooting/creator/connector signals are too permissive.
- SOLID_STARTER can absorb too many ordinary starters if value floors are too low.
- Young productive lanes may overvalue young players with minutes but weak actual impact.

## Mechanisms Addressed

- missing high-end rotation / sixth-man lane
- over-hard establishedStarter gate
- missing veteran/current-impact starter lane
- low-end starter to young-proven gap

## Mechanisms Intentionally Not Touched

- v2 point weights
- trade value
- exact max snap
- formal `src/` logic
- formal `MODEL_TIERS`
