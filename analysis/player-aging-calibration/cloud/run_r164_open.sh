#!/usr/bin/env bash
set -euo pipefail

r=analysis/player-aging-calibration
[[ $# == 5 || ( $# == 6 && ${6} == day ) ]] || { echo 'Usage: run_r164_open.sh <A|B|C|F|G|H|I|J|K|L|M> <start> <seed> <years> <new-output-dir> [day]' >&2; exit 2; }
arm=$1 start=$2 seed=$3 years=$4 out=$5
release=$(python3 -B "$r/cloud/r164_open_freeze.py" verify)
components=
case "$arm" in
    A) dev=playground; gs= ;;
    B) dev=v9s_l4; gs= ;;
    C) dev=v9s_l4; gs=r16_midrange ;;
    F) dev=v9s_l4; gs=r16_midrange; components=finish,rookies,market,style ;;
    G) dev=v9s_l4g; gs=r16_midrange; components=finish,rookies,market,style ;;
    H) dev=v9s_l4; gs=r16_midrange; components=finish,rookies,market,style,prospects ;;
    I) dev=v9s_l4; gs=r16_midrange; components=finish,rookies,market,style,classes ;;
    J) dev=v9s_l4j; gs=r16_midrange; components=finish,rookies,market,style,classes,growth ;;
    K) dev=v9s_l4j; gs=r16_midrange; components=finish,rookies,market,style,classes,growth,files ;;
    L) dev=v9s_l4l; gs=r16_midrange; components=finish,rookies,market,style,classes,growth,files,composition ;;
    M) dev=v9s_l4m; gs=r16_midrange; components=finish,rookies,market,style,classes,growth,files,composition,calm ;;
    *) exit 2 ;;
esac
probe=0
[[ ${6:-} != day ]] || probe=1
mkdir -- "$out"
unset AGING_R16_TRADE_PROBE AGING_R151_ROLE AGING_RUN FULL_SELFTEST_ONLY FULL_PROBE_AUTOPLAY FULL_GS_STRICT FULL_DIAG R164_STATIC_POT R164_UNIT
R164="$components" R164_ROOKIE_LOG=1 FULL_RUN=1 FULL_ACCEPTANCE=1 FULL_ARM="$dev" FULL_GS_ARM="$gs" FULL_START="$start" FULL_SEED="$seed" \
    FULL_YEARS="$years" FULL_OUT="$out" FULL_PROBE_DAY="$probe" FULL_SEASON_TIMEOUT_MS=1200000 \
    NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144} --expose-gc" \
    pnpm exec vitest run "$r/sim/full_league.test.ts" --config "$r/sim/r164.config.ts" --maxWorkers=1 --no-file-parallelism \
    2>&1 | tee "$out/vitest.log"
python3 -B - "$out/cell.json" "$release" "$arm" "$start" "$seed" "$years" "$components" "$probe" <<'PY'
import json, os, sys
from pathlib import Path

out, freeze, arm, start, seed, years, components, probe = sys.argv[1:]
Path(out).write_text(json.dumps(dict(freeze=freeze, arm=arm, start=int(start), seed=int(seed), years=int(years), components=components,
    day=bool(int(probe)), sha=os.getenv("GITHUB_SHA"), run=os.getenv("GITHUB_RUN_ID")), indent=2) + "\n")
PY
