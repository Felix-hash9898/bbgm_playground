"""Real vs generated players under the SAME (Playground) formula, observational user saves.

(1) one-year pseudo-BPM / minutes / usage change of young players (age <= 25) in simulated seasons, split by
    real (srID) vs generated (no srID) players, against NBA naive targets;
(2) initial rating structure at ages 19-22: real players' first ratings in the league vs generated draftees'
    first ratings (level, athletic vs skill composition, ovr), to locate a cause before any special-casing.
Output: results/real_vs_generated.csv, results/real_vs_generated_ratings.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DATA, RATING_KEYS, RESULTS, age_band, wmean
from profile import box_metrics, make_pairs, finish

s = pd.read_parquet(OUT_DATA / "save_panel.parquet")
s["kind"] = np.where(s["srID"].notna(), "real", "generated")
sim = s[(s["season"] > s["start"]) & (s["min"].fillna(0) > 0)].copy()
sim["pid_s"] = sim["save"] + ":" + sim["pid"].astype(str)
sim = pd.concat([box_metrics(g) for _, g in sim.groupby(["save", "season"])], ignore_index=True)
pairs = []
for (save, season), d0 in sim.groupby(["save", "season"]):
    d1 = sim[(sim["save"] == save) & (sim["season"] == season + 1)]
    if len(d1):
        p = make_pairs(d0.rename(columns={"pid_s": "key"}), d1.rename(columns={"pid_s": "key"}), key="key", carry=("kind", "ovr"))
        pairs.append(p)
P = finish(pd.concat(pairs, ignore_index=True))
P = P[(P["min"] >= 250) & (P["n_min"] >= 250)]
rows = []
for (kind, b), d in P.groupby(["kind", "band1"]):
    rows.append({"kind": kind, "band": b, "n": len(d), "d_pbpm": wmean(d["d_pbpm"], d["hm_min"]), "d_mpg": wmean(d["d_mpg"], d["hm_min"]),
                 "d_plays36": wmean(d["d_plays36"], d["hm_min"]), "start_ovr": wmean(d["ovr"], d["hm_min"])})
R = pd.DataFrame(rows)
nba = pd.read_csv(RESULTS / "nba_profile_all_band_curves.csv").query("metric=='pbpm'").set_index("band")["mean"]
R["nba_naive_pbpm"] = R["band"].map(nba)
R.to_csv(RESULTS / "real_vs_generated.csv", index=False)

# initial rating structure at 19-22: first ratings row of each player in the league (real: their first row in the
# save for players who debut after the league started; generated: their first row)
first = s.sort_values("season").groupby(["save", "pid"]).head(1)
first = first[(first["season"] > first["start"]) & first["age"].between(19, 22)]
ATH = ["spd", "jmp", "stre", "endu"]
SK = ["ins", "dnk", "fg", "tp", "ft", "oiq", "diq", "drb", "pss", "reb"]
g = first.groupby("kind").agg(n=("pid", "size"), ovr=("ovr", "mean"), ovr_sd=("ovr", "std"), age=("age", "mean"),
                              **{k: (k, "mean") for k in RATING_KEYS})
g["athletic_mean"] = g[ATH].mean(axis=1)
g["skill_mean"] = g[SK].mean(axis=1)
g.to_csv(RESULTS / "real_vs_generated_ratings.csv")
pd.set_option("display.width", 250)
print(R.pivot_table(index="band", columns="kind", values=["d_pbpm", "n", "start_ovr", "d_mpg"]).round(2).to_string())
print(nba.round(2))
print(g.round(1).T.to_string())
