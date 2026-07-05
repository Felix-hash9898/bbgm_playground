# V3-1B-narrow analysis pack

## One-page summary

| variant | verdict      | entrants | LOW_END -> SOLID | rostered delta/30 | top15 delta/30 | severe | too_high | too_low fixed | too_high added |
| ------- | ------------ | -------- | ---------------- | ----------------- | -------------- | ------ | -------- | ------------- | -------------- |
| A       | inconclusive | 19       | 19 (30.2%)       | 3.1%              | 3.1%           | 4->2   | 7->9     | 2             | 2              |
| B       | inconclusive | 17       | 17 (27.0%)       | 2.8%              | 2.8%           | 4->2   | 7->8     | 1             | 1              |
| C       | inconclusive | 10       | 10 (15.9%)       | 1.5%              | 1.5%           | 4->3   | 7->7     | 0             | 0              |

## Exact rules

See `rules.md`.

## Exact differences vs current scoreTier

Current scoreTier is computed first. The only candidate-only change is mapping a narrowed subset of current LOW_END_STARTER players into SOLID_STARTER at 12%-17% cap. All blocked transitions must remain 0. No 1A HIGH_END_ROTATION or HIGH_IMPACT_STARTER logic is active.

## Files to inspect

- `variant_comparison.csv`: A/B/C top-line comparison.
- `lane_hits.csv`: signal combinations, BPM buckets, production buckets, role buckets, exception usage.
- `labeled_eval.csv`: labeled 48 point changes.
- `cap_budget.csv`: four-pool cap burden.
- `transition_matrix.csv`: current tier movement.

## Recommendation

Do not implement directly. Use this sweep to decide whether B is a viable default envelope, whether C is too narrow, or whether the bridge needs another 1B revision before moving to V3-1C.
