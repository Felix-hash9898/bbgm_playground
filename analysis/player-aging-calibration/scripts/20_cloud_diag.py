"""Summarise cloud smoke diagnostics (memory growth sources and free-agency activity).
usage: python 20_cloud_diag.py <dir containing output_smoke/>
"""
from __future__ import annotations

import collections
import gzip
import json
import sys
from pathlib import Path

d = Path(sys.argv[1]) / "output_smoke"
for line in open(d / "diag.jsonl"):
    x = json.loads(line)
    print("season", x["season"], {k: round(v / 1048576) for k, v in x["memory"].items()}, "tids", x["tids"])
    print("  stores >=1MB:", {k: v for k, v in x["stores"].items() if v["mb"] >= 1})
    big = {}
    for k, v in x["cache"].items():
        if isinstance(v, dict):
            vv = {kk: n for kk, n in v.items() if n > 200}
            if vv:
                big[k] = vv
        elif v > 200:
            big[k] = v
    print("  cache collections >200:", big)
    print("  local >50:", {k: v for k, v in x["local"].items() if v > 50})
f = next(d.glob("full__*.json.gz"))
data = json.load(gzip.open(f))
c = collections.Counter()
for p in data["players"]:
    for t in p.get("transactions", []):
        c[(t["season"], t["phase"], t["type"])] += 1
print("transactions (season, phase, type):")
for k in sorted(c):
    print("  ", k, c[k])
