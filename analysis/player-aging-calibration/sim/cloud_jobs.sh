#!/bin/bash
# Cloud CPU jobs for round 2 (NOT to be run on the M1 Air; see ../CLOUD_RUNBOOK.md).
# Each job is an independent single vitest process; on a multi-core cloud host they may run in parallel,
# limited by RAM (budget ~4 GB per full-league job).
#   ./cloud_jobs.sh full <arm> <seed>      full BBGM league, 2005 real players, 8 seasons (~40 min on M1-class core)
#   ./cloud_jobs.sh probes                 GameSim probes young21sorted / old33sorted (~3 min)
#   ./cloud_jobs.sh all [parallelism]      everything below, xargs-parallel (default 3)
set -euo pipefail
cd "$(dirname "$0")/../../.."
VT="--project basketball --maxWorkers=1 --no-file-parallelism"
export NODE_OPTIONS="--max-old-space-size=4096"
LOGDIR=analysis/player-aging-calibration/sim/logs_cloud
mkdir -p "$LOGDIR"
case "${1:-}" in
  full)
    ARM="$2"; SEED="$3"
    FULL_RUN=1 FULL_ARM="$ARM" FULL_SEED="$SEED" FULL_YEARS="${FULL_YEARS:-8}" \
      npx vitest run analysis/player-aging-calibration/sim/full_league.test.ts $VT >> "$LOGDIR/full_${ARM}_${SEED}.log" 2>&1
    ;;
  probes)
    AGING_RUN=1 AGING_MODE=jacobian AGING_PERTURB=base,young21sorted,old33sorted \
      AGING_SAVES=BBGM_League_9_2024_preseason.json.gz,BBGM_League_8_2025_preseason.json.gz AGING_SEEDS=1001,2002 \
      npx vitest run analysis/player-aging-calibration/sim/aging_arms.test.ts $VT >> "$LOGDIR/probes.log" 2>&1
    ;;
  all)
    P="${2:-3}"
    "$0" probes
    for SEED in 1 2 3; do for ARM in playground official A2r; do echo "$ARM $SEED"; done; done \
      | xargs -P "$P" -L 1 sh -c '"$0" full "$1" "$2"' "$0"
    ;;
  *) echo "usage: $0 full <arm> <seed> | probes | all [parallelism]"; exit 2 ;;
esac
