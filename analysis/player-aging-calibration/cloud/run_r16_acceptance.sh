#!/usr/bin/env bash
set -euo pipefail

r=analysis/player-aging-calibration
usage='Usage: run_r16_acceptance.sh <A|B|C> <start> <seed> <years> <new-output-dir> [day]'
[[ $# == 5 || ( $# == 6 && ${6} == day ) ]] || { echo "$usage" >&2; exit 2; }
case "$1" in
    A) arm=playground; gs= ;;
    B) arm=v9s_l4; gs= ;;
    C) arm=v9s_l4; gs=r16_midrange ;;
    *) echo "$usage" >&2; exit 2 ;;
esac
[[ "$2" =~ ^[0-9]{4}$ && "$3" =~ ^[0-9]+$ && "$4" =~ ^[0-9]+$ ]] || { echo "$usage" >&2; exit 2; }
mkdir -- "$5"

# Overrides research-only knobs inherited from a caller or developer shell.
unset AGING_R16_TRADE_PROBE AGING_R151_ROLE FULL_SELFTEST_ONLY FULL_PROBE_AUTOPLAY FULL_GS_STRICT FULL_DIAG
probe=0
[[ ${6:-} != day ]] || probe=1
FULL_RUN=1 FULL_ACCEPTANCE=1 FULL_ARM="$arm" FULL_GS_ARM="$gs" FULL_START="$2" FULL_SEED="$3" FULL_YEARS="$4" \
    FULL_OUT="$5" FULL_PROBE_DAY="$probe" FULL_SEASON_TIMEOUT_MS=1200000 \
    NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144} --expose-gc" \
    pnpm exec vitest run "$r/sim/full_league.test.ts" --config "$r/sim/r5.config.ts" --maxWorkers=1 --no-file-parallelism \
    2>&1 | tee "$5/vitest.log"
