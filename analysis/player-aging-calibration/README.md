# Player aging / development calibration (BBGM basketball)

Research only: nothing under `src/` was modified. Read `REPORT.md` first; `DATA_SOURCES.md` has the
provenance and frozen baselines.

## Layout
| path | content |
|---|---|
| `baselines/` | frozen growth-chain sources of Official `205d18eb`, Playground `363bcbc6`, merge base; `MANIFEST.txt` with hashes; behavioural patches |
| `scripts/` | Python pipeline (numbered) + shared modules `common.py`, `bbgm_dev.py` (exact ports of both formulas), `cand_specs.py` (data-driven specs), `profile.py` (identical profile functions for NBA and GameSim) |
| `sim/aging_arms.test.ts` | GameSim research harness (modes `port_check`, `step`, `population`); skipped unless `AGING_RUN=1` |
| `sim/formulas/` | `official.developSeason.basketball.ts` (verbatim Official body, imports rewired, `helpers.entries` -> its upstream definition `Object.entries`), `candidates.ts` + `candidate_specs.json` |
| `sim/output/` | raw harness output (gzip CSV); `sim/run_*.log` |
| `data/` | derived panels (parquet): NBA player-seasons and pairs, BBGM real ratings, save panel, step pairs |
| `results/` | every table cited in the report |

## Reproduce
```
python3.15 -m venv venv && venv/bin/pip install -r ../form-research/requirements.txt
./run_all.sh "$PWD/venv/bin/python"
```
Each GameSim command is a single vitest process (`--maxWorkers=1 --no-file-parallelism`), run strictly
one after another. Costs on an M1 Air: port check 15 s, step design (30 seasons) 4.6 min per 3 arms,
population design (5 arms x 3 seeds x 30 years, 60 GameSim seasons) 9 min.

## Script map
| script | output |
|---|---|
| `00_freeze_baselines.sh` | `baselines/` |
| `01_build_nba_panel.py` | `data/nba_player_seasons.parquet`, `data/bbgm_real_ratings.parquet`, `results/panel_coverage.json` |
| `02_save_fingerprint.py` | `results/save_fingerprint.csv`, `data/save_panel.parquet` |
| `03_nba_aging.py` | `results/nba_*` (mean curves with 3 estimators, heterogeneity, extremes, correlations, subgroups, longevity, age distribution), `results/pseudo_bpm_model.json` |
| `04_port_check.py` | `results/port_check.json` (Python ports == TS) |
| `05_step_analysis.py` | `results/step_*` |
| `06_nba_profile.py` | `results/nba_profile_*` (same functions as the sim profiles; fit/test/era/stay subsets) |
| `07_population_analysis.py` | `results/pop_*` |
| `08_ratings_audit.py` | `results/audit_*` |
| `09_design_candidates.py` | `sim/formulas/candidate_specs.json`, `results/candidate_design.json` (fit half only) |
| `10_save_world.py` | `results/saveworld_*` |
| `11_evaluate.py` | `results/scorecard*.csv/json`, `results/counterexamples.csv` (test half) |
| `12_same_player_check.py` | `results/same_player_*` |

## Round 2 additions (see REPORT.md; round-1 report kept as REPORT_round1.md)
| script / file | output |
|---|---|
| `09b_design_candidates_v2.py` | temporal-hold-out candidates (targets from pairs with second season <= 2018): `A2`, `A2r`, `B2`, `pg_stre`, `pg_diq`, `A2r_stre` in `sim/formulas/candidate_specs.json`, `results/candidate_design_v2.json` |
| `13_nba_gamelog_panel.py` | `data/nba_gamelog_seasons.parquet` (2022-2026 game logs, odd/even split halves, BBR slug mapping) |
| `14_fingerprint_v2.py` | `results/fingerprint_v2*.{csv,json}` |
| `15_step2_analysis.py` | `results/step2_*` (fixed common sample, zero/beta/DiD corrections, paired contrasts, same-player hold-out test, noise decomposition, signal correlations, extremes) |
| `16_gamesim_mechanisms.py` | `results/gamesim_response.csv`, `results/gamesim_3pt_*` |
| `17_full_league_analysis.py` | `results/full_*` (needs cloud output `sim/output_full/`) |
| `18_holdout_population_check.py` | `results/step2_vs_nba_holdout*.csv` |
| `19_real_vs_generated.py` | `results/real_vs_generated*.csv` |
| `sim/aging_arms.test.ts` | + `AGING_CONTROL_FRAC` (step2), `AGING_MODE=jacobian` |
| `sim/full_league.test.ts` | full BBGM league via the product's Auto Play, formula swapped with `vi.mock` |
| `CLOUD_RUNBOOK.md`, `sim/cloud_jobs.sh` | heavy jobs to run in the cloud (not on the M1 Air) |

Step2 run (local, before the stop): `AGING_RUN=1 AGING_MODE=step AGING_CONTROL_FRAC=0.3 AGING_SEEDS=1001,2002,3003
AGING_ARMS=none,official,playground,A2r,B2,pg_stre,pg_diq,A2r_stre npx vitest run analysis/player-aging-calibration/sim/aging_arms.test.ts --project basketball --maxWorkers=1 --no-file-parallelism`
