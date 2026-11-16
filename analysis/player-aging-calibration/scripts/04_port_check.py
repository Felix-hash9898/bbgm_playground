"""Validate the Python ports (bbgm_dev.py) against the TypeScript formulas (sim port_check output).
Pass criterion per (formula, archetype, age, rating): |mean_py - mean_ts| < 4 * SE and |sd_py/sd_ts - 1| < 5%.
Output: results/port_check.json
"""
from __future__ import annotations

import gzip
import io

import numpy as np
import pandas as pd

from bbgm_dev import KEYS, develop_season
from common import RESULTS, SIM_OUT, bbgm_ovr, dump_json

ts = pd.read_csv(io.BytesIO(gzip.decompress((SIM_OUT / "port_check__official+playground+official_spec.csv.gz").read_bytes())))
arche = {
    "avg": dict(hgt=47, stre=50, spd=50, jmp=50, endu=45, ins=45, dnk=50, ft=50, fg=50, tp=50, oiq=50, diq=50, drb=50, pss=50, reb=50),
    "star": dict(hgt=55, stre=60, spd=70, jmp=70, endu=70, ins=60, dnk=75, ft=80, fg=75, tp=75, oiq=80, diq=70, drb=75, pss=70, reb=55),
    "low": dict(hgt=40, stre=35, spd=40, jmp=40, endu=30, ins=30, dnk=35, ft=35, fg=35, tp=30, oiq=30, diq=30, drb=35, pss=35, reb=40),
}
N = 20000
rng = np.random.default_rng(7)
rows = []
for form in ["official", "playground"]:
    for an, base in arche.items():
        for age in range(19, 41):
            R0 = {k: np.full(N, float(v)) for k, v in base.items()}
            R1 = develop_season(R0, np.full(N, age), rng, form)
            d = {k: R1[k] - R0[k] for k in ["hgt"] + KEYS}
            d["ovr"] = bbgm_ovr(R1) - bbgm_ovr(R0)
            for k, v in d.items():
                rows.append({"arm": form, "archetype": an, "age": age, "key": k, "mean_py": v.mean(), "sd_py": v.std()})
py = pd.DataFrame(rows)
m = py.merge(ts, on=["arm", "archetype", "age", "key"])
m["se"] = np.sqrt((m["sd_py"] ** 2 + m["sd"] ** 2) / N)
m["z"] = (m["mean_py"] - m["mean"]) / m["se"].replace(0, np.nan)
m["sd_ratio"] = m["sd_py"] / m["sd"].replace(0, np.nan)
bad = m[(m["z"].abs() > 4) | ((m["sd_ratio"] - 1).abs() > 0.05)]
# official_spec (candidate engine re-expressing the official formula) must also match official TS
spec = ts[ts.arm == "official_spec"].merge(ts[ts.arm == "official"], on=["archetype", "age", "key"], suffixes=("_spec", "_off"))
spec["z"] = (spec["mean_spec"] - spec["mean_off"]) / np.sqrt((spec["sd_spec"] ** 2 + spec["sd_off"] ** 2) / N).replace(0, np.nan)
out = {
    "n_cells": int(len(m)), "n_fail": int(len(bad)), "max_abs_z": float(m["z"].abs().max()),
    "max_sd_ratio_dev": float((m["sd_ratio"] - 1).abs().max()),
    "fails": bad[["arm", "archetype", "age", "key", "mean_py", "mean", "sd_py", "sd", "z"]].head(20).to_dict(orient="records"),
    "official_spec_vs_official_max_abs_z": float(spec["z"].abs().max()),
    "official_spec_fail_cells": int((spec["z"].abs() > 4).sum()),
}
dump_json(out, RESULTS / "port_check.json")
print(out)
