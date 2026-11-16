# Branch `aging-calibration-cloud-r2` (research only)

Isolated branch for running the round-2 heavy experiments of `analysis/player-aging-calibration/` on free
GitHub-hosted runners. Base: bbgm_playground `363bcbc6` with **no product-code change**. Added: the research
harness (`sim/`), formulas/candidate specs, analysis scripts and `.github/workflows/aging-calibration-r2.yml`.
`.github/workflows/nodejs.yml` is removed on this branch only, so pushes here do not run the full project CI.
Real saves used by the probes are already tracked in the repo (`real_saves/BBGM_League_{9_2024,8_2025}_preseason.json.gz`).
Not intended to be merged.
