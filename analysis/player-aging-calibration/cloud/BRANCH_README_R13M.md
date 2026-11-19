# Round 13-M cloud branch
Branch `aging-calibration-cloud-r13m` = `aging-calibration-cloud-r11` (b30a3449a) + research overlay only
(no product src/ change; product files used by the harness are byte-identical to the local playground worktree).
Overlay = every module reachable from sim/full_league.test.ts and sim/r5.config.ts (checked by sim/check_r13m_overlay.mjs)
+ sim/formulas/index.ts + results/r13_preregistration.md + .github/workflows/aging-calibration-r13m.yml.
Pre-registration: results/r13_preregistration.md, section "R13.1" (written before any modern multi-season run).
Pushed after the user's explicit authorisation (2026-11-19). Push triggers the workflow once (preflight -> smoke -> full).
Runs: 44560536244 (87a71428b: preflight, 4 smokes, 17 full jobs) and 44563665774 (da53d53a4: arm-D rerun after the NaN-mix
fault; the main workflow's push trigger was removed in that commit so no other job was repeated).  Cloud "failure" marks
on the 2021-start jobs = validator salary bound (fixed afterwards in sim/validate_full_output.mjs; data valid, all
archives re-validated locally).  Results: REPORT.md section R13-M; scoring scripts/110_r13m_eval.py; diagnostics 111.
