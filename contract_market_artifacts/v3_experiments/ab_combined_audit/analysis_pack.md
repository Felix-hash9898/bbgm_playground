# V3-AB combined analysis pack

## Audit answer

Is 1C necessary now? **inconclusive**.

The combined audit should be read as a first-layer diagnostic, not a final test. If H-02 / Simmons and V20-11 / AD are already in SOLID_STARTER, any remaining underpay on those cases is primarily a range/placement question unless a broader repeated LOW_END_STARTER miss pattern appears.

## Labeled 48 metrics

| metric     | current v2 | combined V3-AB |
| ---------- | ---------- | -------------- |
| mean gap   | 2.46       | 1.67           |
| median gap | 0.78       | 0.75           |
| severe     | 4          | 0              |
| too_low    | 31         | 27             |
| too_high   | 7          | 9              |

## One C audit

| check                                                                       | answer                                     | evidence                                                                                                                        | implication                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| conflict count                                                              | 0                                          | 0 players hit both 1A and 1B-B                                                                                                  | combined modules are separable on original current tier                              |
| H-02 / Simmons enters SOLID_STARTER                                         | yes                                        | Ben Simmons: LOW_END_STARTER -> SOLID_STARTER, module 1B-B, point 24.99 vs $30.00M-$35.00M, too_low, gap 5.01M                  | remaining miss is more likely SOLID_STARTER range/placement than first-layer capture |
| V20-11 / AD enters SOLID_STARTER                                            | yes                                        | Anthony Davis: LOW_END_STARTER -> SOLID_STARTER, module 1B-B, point 23.66 vs $24.00M-$28.00M, too_low, gap 0.34M                | remaining miss is more likely SOLID_STARTER range/placement than first-layer capture |
| remaining severe                                                            | 0                                          | none                                                                                                                            | no severe first-layer pressure from labeled 48                                       |
| remaining too_low >= 3M still in LOW_END_STARTER                            | 3                                          | boundary40 F-01 Shaedon Sharpe gap 5.15M; boundary40 G-02 Isaiah Stewart gap 4.54M; validation20 V20-10 Jason Preston gap 7.14M | not enough broad first-layer evidence by itself                                      |
| remaining too_low >= 3M already upgraded to HIGH_END_ROTATION/SOLID_STARTER | 2                                          | boundary40 E-02 HIGH_END_ROTATION gap 4.55M; boundary40 H-02 SOLID_STARTER gap 5.01M                                            | mixed evidence                                                                       |
| non-young current-impact starters still missed by 1B-B                      | 0                                          | none                                                                                                                            | does not justify broad 1C                                                            |
| broad 1C absorption risk                                                    | needs review; avoid broad absorption layer | 1A entrants 33; 1B-B entrants 17; LOW_END unresolved too_low 3                                                                  | do not recreate candidate_0 HIGH_IMPACT_STARTER-like catch-all                       |
| remaining_misses rows                                                       | 10                                         | 10 rows require manual audit after combined V3-AB                                                                               | use these rows to decide range/placement vs narrow 1C                                |
