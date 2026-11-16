"""Population-level temporal hold-out: step2 arm curves (DiD-corrected, fixed common sample) vs NBA pairs whose
first season is >= 2019 (never used by any candidate design; targets used <= 2018). Both inclusive (primary for
the attrition-free step design) and naive NBA estimators are shown; NBA band SEs from a player bootstrap.
Output: results/step2_vs_nba_holdout.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DATA, RESULTS, wmean

rng = np.random.default_rng(3)
pr = pd.read_parquet(OUT_DATA / "nba_pairs.parquet")
ho = pr[pr["season"] >= 2019]
est = {"inclusive": (ho[(ho["min"] >= 500) & ho["consecutive"] & (ho["n_min"] >= 50)], "min"),
       "naive": (ho[ho["consecutive"] & (ho["min"] >= 250) & (ho["n_min"] >= 250)], "hm_min")}
rows = []
for name, (d, w) in est.items():
    d = d.dropna(subset=["d_pbpm"])
    for b, x in d.groupby("band1"):
        keys = x["slug"].unique()
        gi = x["slug"].map({k: i for i, k in enumerate(keys)}).to_numpy()
        v, ww = x["d_pbpm"].to_numpy(), x[w].to_numpy()
        bs = [np.sum(v * ww * c) / np.sum(ww * c) for c in (np.bincount(rng.integers(0, len(keys), len(keys)), minlength=len(keys))[gi] for _ in range(500))]
        rows.append({"estimator": name, "band": b, "nba": wmean(v, ww), "nba_se": float(np.std(bs)), "n": len(x)})
N = pd.DataFrame(rows)
C = pd.read_csv(RESULTS / "step2_curves_by_correction.csv")
C = C[C["correction"] == "did"].pivot_table(index="band", columns="arm", values="mean")
out = N.pivot_table(index="band", columns="estimator", values=["nba", "nba_se"]).round(3)
out.columns = [f"{a}_{b}" for a, b in out.columns]
out = out.join(C.round(3))
summ = {}
for arm in C.columns:
    for e in ["inclusive", "naive"]:
        summ[(arm, e)] = float(np.sqrt(np.mean((out[arm] - out[f"nba_{e}"]) ** 2)))
S = pd.Series(summ).unstack().round(3)
out.to_csv(RESULTS / "step2_vs_nba_holdout.csv")
S.to_csv(RESULTS / "step2_vs_nba_holdout_rmse.csv")
print(out.to_string()); print(S)
