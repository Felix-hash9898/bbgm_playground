# Cloud runbook — round-2 heavy jobs

Per the user's instruction (2026-11-16, ~15:30) all heavy BBGM simulation was stopped on the M1 Air and
moves to cloud CPU. The local machine only does light analysis/preparation. Nothing below has been run
in the cloud yet.

## What still needs to run
| job | purpose | cost (M1-class core) | memory |
|---|---|---|---|
| `full <arm> <seed>` x 9 (arms `playground`, `official`, `A2r`; seeds 1-3) | full BBGM league from the real 2005 preseason, 8 seasons of the product's Auto Play (games, playoffs, draft of real classes, re-signing, FA, AI trades, contracts, retirement, injuries incl. permanent losses, preseason development); only `developSeason.basketball` differs (vi.mock) | ~4.75 min/season, ~40 min/job | peak < 3.5 GB with the per-season cleanup; budget 4 GB |
| `probes` | GameSim probes `young21sorted`/`old33sorted`: Playground age-21/33 mean change vector, then values and roster order recomputed (direct test of the minutes/role-reallocation hypothesis for the missing young-usage growth) | ~3 min | < 1 GB |

Already finished locally and kept: `sim/output/{step,step2,jac,population,xs,port_check}__*`, `sim/run_*.log`.
First full-league attempt (playground, seed 1) died at ~29.5 min with the 2.2 GB default heap
(`sim/run_round2.log`, `FATAL ERROR ... heap out of memory`): fake-indexeddb keeps every store in RAM.
Fix already in `sim/full_league.test.ts`: box scores, events, player feats and messages (unused by this
study) are cleared after each season; heap raised via `NODE_OPTIONS`. `output_full/` is empty.

## Environment
- Source: `git checkout 363bcbc6` of Felix-hash9898/bbgm_playground (product logic of the local worktree
  is identical: `src/worker` and `src/common` differ only by 3 test files). Then copy this whole
  `analysis/player-aging-calibration/` directory over it (harness, formulas, `candidate_specs.json`).
- Data: `data/real-player-data.basketball.json`, `data/real-player-stats.basketball.json` (in the repo);
  for `probes` also `real_saves/BBGM_League_9_2024_preseason.json.gz`, `real_saves/BBGM_League_8_2025_preseason.json.gz`
  (copy read-only; never write back to the user's saves).
- Node 24+ (local run used v25.9.0), `pnpm install`, vitest 4.1.2.

## Commands
```
cd <repo>
analysis/player-aging-calibration/sim/cloud_jobs.sh probes
analysis/player-aging-calibration/sim/cloud_jobs.sh all 3        # 9 full-league jobs, 3 in parallel
```
Outputs: `analysis/player-aging-calibration/sim/output_full/full__2005__<arm>__<seed>.json.gz`,
`output_full/progress.jsonl` (seconds and heap per season), `sim/output/jac__*__{young21sorted,old33sorted}__*.csv.gz`,
logs in `sim/logs_cloud/`. The harness refuses to overwrite existing outputs.

## Acceptance checks before analysis
1. 9 files in `output_full/`; each has `years: 8`, 8 timings, players with stats for seasons 2005-2012.
2. `progress.jsonl`: heapMB does not trend toward the limit.
3. First timings comparable across arms (same seed => identical league creation).

## Analysis after copying outputs back (light, can run locally)
```
cd analysis/player-aging-calibration/scripts
python -s -E 17_full_league_analysis.py      # full_* tables: arcs vs real careers, survival, age structure, ecology
python -s -E 16_gamesim_mechanisms.py        # adds the *sorted probes to gamesim_response.csv
```
Then fill REPORT.md section "完整联盟实验" (placeholders marked PENDING-CLOUD).

## Verification status of the prepared code (local, light only)
- `sim/full_league.test.ts`, `sim/aging_arms.test.ts`, `sim/formulas/candidates.ts`: syntax-only transpile with the
  project's TypeScript passed (2026-11-16). NOT type-checked and NOT executed after the last edits:
  the per-season store cleanup + heap fix in `full_league.test.ts` and the `young21sorted`/`old33sorted` probes are
  untested. Run one `FULL_YEARS=2` job first and check `progress.jsonl` (heapMB) before launching all 9 jobs.
