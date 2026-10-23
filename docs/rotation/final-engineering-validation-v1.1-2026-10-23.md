# BBGM Rotation — Final Engineering Validation v1.1

Date: 2026-10-23

## Decision

This branch is ready for **ChatGPT's independent v1.1 code review**, not authorized for merge. The algorithm is unchanged from fixed candidate `755f0c2bfa63565c3787307816c45efb0b021bb2`; this engineering round updates four obsolete behavioral assertions while retaining their fixtures and meaningful regression checks. No production source, formal `main`, save, or deployment was changed.

The four legacy failures were contract mismatches, not permission to delete coverage. The replacements passed the candidate suite and were tested against temporary, reverted mutants that represented the relevant wrong behaviors. There is no new Rotation Blocker or Significant regression from these changes. Repository-wide tests and static checks still have baseline failures, so this is not a claim that the repository is fully green or a formal merge Go.

## Exact comparison

- Main: `ac9345383dcf4fe555a121cfe6bbe9bfb1b8cf54`.
- Algorithm candidate: `755f0c2bfa63565c3787307816c45efb0b021bb2`.
- Review data: `325a1cbf5a7f9e13ca95e60c4d65a264ac543307`.
- Runtime/dependencies: Node `v24.19.0`, same shared dependency tree and Vitest `v4.1.2`; CPU quota 2, RAM 8 GiB. `pnpm` was not used to install or mutate dependencies.
- Direct, corrected six-file command on both worktrees: `./node_modules/.bin/vitest run src/worker/core/team/basketballMinutes.test.ts src/worker/core/team/reconcileBasketballRotation.test.ts src/worker/api/updateBasketballMinutes.test.ts src/worker/core/game/loadTeams.basketball.test.ts src/worker/core/GameSim.basketball/dynamicMinutesGameSim.test.ts src/ui/views/Roster/rosterBalance.test.ts`.

| Scope | Main | Candidate |
|---|---:|---:|
| Six shared Rotation/API/Roster/GameSim files | 149/149 pass | 151/151 pass |
| Candidate's additional continuity, Override-boundary and real-roster injury tests | — | 10/10 pass across 3 files |
| Full `node --run test` (Vitest defaults) | 1,173 passed, 2 failed, 17 skipped; 11 failed files, 7 skipped files; 1 unhandled error; 448.97s | 1,205 passed, 2 failed, 17 skipped; 11 failed files, 7 skipped files; 1 unhandled error; 397.19s |
| Full build | pass | pass |
| Full ESLint | 464 errors, 0 warnings | 464 errors, 0 warnings |
| Full TypeScript check | 183 diagnostics | 183 diagnostics; same normalized diagnostic set |
| Changed-file ESLint / format / diff check | n/a | pass / pass / pass |

The full-suite candidate has more passing tests/files because commit 755 includes additional Rotation coverage. Its shorter wall time is not treated as a performance improvement. Both full runs share the following non-Rotation failures: nine Football test modules fail during import because `PLAYER_STATS_TABLES.gameHighs!.stats` is undefined in `src/worker/views/playerGameLogSeries.basketball.ts`; `tools/update-real-player-data.test.ts` cannot spawn D49/D51 child processes (`EPERM`); `realRosters/updateRandomDebutsForever.test.ts` exceeds its 60-second timeout; and Vitest reports an unhandled IPv6 `listen EPERM` on `::1`. These are shared-environment/main failures, not changed by this branch. No Football/system workaround was made.

One unmodified API test, `an Auto profile write removes only the Current Override newly above its hard cap`, failed in an earlier Main-only six-file run because its generated fixture had no player for which `floor(Short/High) > Long/Low`; it passed unchanged on the corrected rerun. Candidate passed both runs. This is recorded as a baseline test-fixture stability issue, not counted as a candidate regression or silently called fixed.

## Four authorized behavior-contract replacements

| Old failing assertion and preserved fixture | Why the old assertion was wrong | Replacement behavior and mutation sensitivity |
|---|---|---|
| `basketballMinutes.test.ts`: reserve must always stay at or below 10 minutes. The original six-available-player injury fixture is retained. | No universal weak-reserve cap is part of the product contract; injury burden and available alternatives matter. | The six-player injury case allows a high emergency allocation while enforcing injured-player zero and 240-minute conservation. A second 12-player fixture puts a stronger OVR82, zero-plan alternative after a weak OVR20 reserve in roster order and verifies the stronger alternative receives more coverage. A temporary OVR-blind allocator mutant failed this comparison. |
| Same file: Current Override must preserve exactly two Short reserves. | Depth is a soft preference, not a fixed active-player count, particularly after pins and injuries. | Retains one downward pin, two zero pins, one upward pin, and exact current override assertions; verifies injured-player zero, 240 total, and legal per-player bounds. |
| Same file: injury allocation must activate exactly 2/3/5 reserves for Short/Normal/Long. | UI and design define preferred depth, not a hard headcount or zero-mask. | Retains the 14-player injury input and all 3×3 Core/Depth profiles. Separately checks Auto plan totals/bounds, Long's tail allocation versus Short on this fixture, distinct adjacent Depth plans, and High>Balanced>Low top-core minutes. Injury cases preserve zero injured minutes and total/bounds without forcing headcount. A temporary mutant that made every depth use Normal failed. |
| `dynamicMinutesGameSim.test.ts`: saved Custom zero-plan reserves must remain DNP after injury. | UI permits zero-plan reserves to participate in injury coverage; explicit Prevent injury increase/Lock is the control for users who want that protection. | Retains `loadTeams` injury input, verifies pin exactness, injured-player zero, total 240, and that some eligible zero-plan player is promoted. It verifies the saved Custom `minutesByPid` is unchanged and reloads the healthy roster to verify all original minutes/zeroes return. A temporary mutant forbidding zero-plan promotion failed. |

The temporary mutants were reverted before final checks; production source remains byte-for-byte unchanged from 755. Thus the revised tests do not pass regardless of behavior: they detect ignoring quality, ignoring Depth, and silently treating healthy Custom zero as a permanent injury DNP.

## Inherited basketball evidence and decision relevance

No allocator or GameSim code changed in this round, so repeating tens of thousands of games would not add decision value. The fixed candidate's real-GameSim evidence remains in [`rotation-injury-integration-review.md`](../rotation-injury-integration-review.md) and the previous independent supplement at `review/rotation-final-gate-2026-10-23`. The portable real-roster GameSim test was rerun: 3 files / 10 tests pass. Full-team tables and scenario definitions are preserved in those reports.

Key prior paired-seed real GameSim findings (targets / actual minutes where shown):

- **LAL LeBron 0→1:** Main changes from `40.00/37.95` to `1.47/6.68`; candidate stays `32.14/33.02` to `32.14/33.16`. Positive-minute McClung/Nunn rank swap falls from Main's `44/27 → 27/44` discontinuity to a stable `27.60/27.60` candidate allocation.
- **IND York:** target `41.48 → 29.50`, actual `36.74 → 27.96`; worst observed energy `0.377 → 0.781`; maximum continuous stint `32.00 → 12.73` minutes.
- **ORL Ross:** target `40.00 → 31.16`, actual `35.59 → 29.99`. This redistributes real center/forward minutes (including Lopez and Mo Wagner); it is not a universal improvement for every player.
- **MIL Override + Lock + injured Thanasis:** final 755 fixes the prior cross-stage discontinuity. In 100 complete games per state/arm, Carter targets were `3.597 → 3.805` across the one-minute edit, actual `2.87 → 3.31`; injured Thanasis stayed zero, protected incumbents stayed pinned, and all roster minutes were reported in the inherited review table. This supersedes the pre-755 MIL failure; do not treat the earlier candidate's `17 → 3.75` Carter result as current.
- **Core/Depth:** three-team Rated/No-Ratings controlled injury studies found High/Low target preference remains visible and contracts with injury burden alongside lower low-energy exposure; Long/Short sometimes swap sub-minute tail roles, but no material full-roster or score risk was established. No fixed 2/3/5 rule is warranted.
- **Longer horizon:** reuse the 96 multi-team seasons and 40 NYK seasons. The NYK estimate was −1.05 wins, 95% interval [−2.85,+0.75], with a worst −14 season associated with a worse randomized injury path. This does not establish a systematic loss effect and does not rule out moderate negative effects. Earlier rated calendar results 244→227 wins and No-Ratings new injuries 103→124 remain adverse signals, not erased; the fixed candidate's unchanged no-Override path is not represented as a fix for them.

The older four failures therefore had stale hard-coded policies, while the real regression contracts remain covered. There is no demonstrated broad regression in basketball quality or user control. Remaining merge-decision risks are the repository's non-green shared test/static baseline, finite held-out coverage, and unresolved seasonal noise/negative signals—not a newly found failure in the revised tests.

## Changed files and boundaries

Only these files differ from 755 in this review commit:

- `src/worker/core/team/basketballMinutes.test.ts`: replaces the three obsolete minute/headcount assertions with quality, feasibility, injury, and soft-preference behavior checks while retaining inputs.
- `src/worker/core/GameSim.basketball/dynamicMinutesGameSim.test.ts`: replaces the permanent-DNP assertion with injury-promotion and healthy-Custom persistence/reload checks.
- `docs/rotation/final-engineering-validation-v1.1-2026-10-23.md`: this reproducible comparison and decision note.

No production source, unrelated lint fix, fixture data, or large research output is added. No test is skipped, and no failure threshold was reduced.

## Reproduction

Use the repo's Node 24 environment and installed dependencies. Run the six-file command listed above in both worktrees. Candidate-only regressions:

```sh
./node_modules/.bin/vitest run \
  src/worker/core/team/basketballInjuryContinuity.test.ts \
  src/worker/core/team/basketballOverrideBoundary.regression.test.ts \
  src/worker/core/GameSim.basketball/injuryRotationRealRoster.test.ts
```

Full comparison uses unmodified repository defaults:

```sh
node --run test
node --run lint-js
node --run lint-ts
node --run build
```

Review only: ChatGPT's independent v1.1 approval and explicit user authorization are still required before any formal integration.
