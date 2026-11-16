"""NBA aging profile computed with exactly the same functions as the GameSim profiles (profile.py).
Subsets: all pairs, no-team-change pairs (sim rosters never change), fit/test player halves, eras.
Output: results/nba_profile_<subset>_<table>.csv, results/nba_profile_corr.json
"""
from __future__ import annotations

import pandas as pd

from common import OUT_DATA, RESULTS, dump_json
from profile import ability_slope, band_curves, corr_structure, curves, extremes, finish, heterogeneity

p = pd.read_parquet(OUT_DATA / "nba_pairs.parquet")
p = p[p["consecutive"]].copy()
p["min"], p["n_min"] = p["min"].astype(float), p["n_min"].astype(float)
p = finish(p)
subsets = {
    "all": p, "stay": p[~p["team_change"].astype(bool)], "fit": p[p["split"] == "fit"], "test": p[p["split"] == "test"],
    "era2015": p[p["season"] >= 2014], "era1980_99": p[p["season"] <= 1998], "era2000_14": p[(p["season"] >= 1999) & (p["season"] <= 2013)],
}
corr = {}
for name, d in subsets.items():
    for f in [curves, band_curves, heterogeneity, extremes, ability_slope]:
        f(d).to_csv(RESULTS / f"nba_profile_{name}_{f.__name__}.csv", index=False)
    c, s = corr_structure(d)
    corr[name] = s
    if name in ("all", "stay"):
        c.to_csv(RESULTS / f"nba_profile_{name}_delta_corr.csv")
dump_json(corr, RESULTS / "nba_profile_corr.json")
print(corr)
print(band_curves(subsets["all"]).query("metric in ['pbpm','mpg']").round(3).to_string())
print(heterogeneity(subsets["stay"]).query("metric=='pbpm'").round(3).to_string())
