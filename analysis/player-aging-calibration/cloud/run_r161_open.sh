#!/usr/bin/env bash
set -euo pipefail

r=analysis/player-aging-calibration
[[ $# == 5 || ( $# == 6 && ${6} == day ) ]] || {
    echo 'Usage: run_r161_open.sh <C|D|E> <start> <seed> <years> <new-output-dir> [day]' >&2
    exit 2
}
arm=$1 start=$2 seed=$3 years=$4 out=$5
release=$(python3 -B "$r/cloud/r161_open_freeze.py" verify)
python3 -B - "$r/cloud/r161_open_matrix.json" "$arm" "$start" "$seed" "$years" <<'PY'
import json
import sys
from pathlib import Path

file, arm, start, seed, years = sys.argv[1:]
if {"arm": arm, "start": int(start), "seed": int(seed), "years": int(years)} not in json.loads(Path(file).read_text())["run"]:
    raise SystemExit("Cell is outside the R16.1 open league matrix")
PY
case "$arm" in
    C) gs=r16_midrange; market=0 ;;
    D) gs=r16_midrange; market=1 ;;
    E) gs=r161_adapt; market=0 ;;
esac
probe=0
[[ ${6:-} != day ]] || probe=1
mkdir -- "$out"
unset AGING_R16_TRADE_PROBE AGING_R151_ROLE FULL_SELFTEST_ONLY FULL_PROBE_AUTOPLAY FULL_GS_STRICT FULL_DIAG
FULL_RUN=1 FULL_ACCEPTANCE=1 FULL_ARM=v9s_l4 FULL_GS_ARM="$gs" FULL_START="$start" FULL_SEED="$seed" FULL_YEARS="$years" \
    FULL_OUT="$out" FULL_PROBE_DAY="$probe" FULL_SEASON_TIMEOUT_MS=1200000 \
    R161_OPEN=1 R161_RETURN_MARKET="$market" R161_MARKET_TEST=0 R161_STYLE_TEST=0 R161_CAPTURE=0 \
    R161_TRACE_FROM="$start" R161_TRACE_TO="$((start + years - 1))" R161_TRACE_IDS=hardeja01,lavinza01 \
    NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144} --expose-gc" \
    pnpm exec vitest run "$r/sim/full_league.test.ts" --config "$r/sim/r161.config.ts" --maxWorkers=1 --no-file-parallelism \
    2>&1 | tee "$out/vitest.log"
python3 -B - "$out/cell.json" "$release" "$arm" "$start" "$seed" "$years" "$market" "$gs" "$probe" <<'PY'
import json, os, sys
from pathlib import Path

out, freeze, arm, start, seed, years, market, gs, probe = sys.argv[1:]
Path(out).write_text(json.dumps(dict(freeze=freeze, arm=arm, start=int(start), seed=int(seed), years=int(years),
    market=bool(int(market)), gs=gs, day=bool(int(probe)), sha=os.getenv("GITHUB_SHA"), run=os.getenv("GITHUB_RUN_ID")), indent=2) + "\n")
PY
