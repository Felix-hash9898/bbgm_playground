"""Observational Playground world: the user's long-running saves (all simulated offseasons fingerprinted as
the Playground formula, results/save_fingerprint.csv). Full BBGM machinery (FA, trades, injuries, real
retirement with WS). Only simulated seasons (season > startingSeason) are used, and pairs need both
seasons simulated. Same profile functions as for NBA and GameSim.
Outputs: results/saveworld_*.csv/json
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DATA, RESULTS, dump_json
from profile import band_curves, box_metrics, corr_structure, extremes, finish, heterogeneity, make_pairs

s = pd.read_parquet(OUT_DATA / "save_panel.parquet")
s = s[(s["season"] > s["start"]) & (s["min"].fillna(0) > 0)].copy()
s["pid_s"] = s["save"] + ":" + s["pid"].astype(str)
s = pd.concat([box_metrics(g) for _, g in s.groupby(["save", "season"])], ignore_index=True)
pairs = []
for (save, season), d0 in s.groupby(["save", "season"]):
    d1 = s[(s["save"] == save) & (s["season"] == season + 1)]
    if len(d1) == 0:
        continue
    p = make_pairs(d0.rename(columns={"pid_s": "key"}), d1.rename(columns={"pid_s": "key"}), key="key")
    pairs.append(p)
pairs = finish(pd.concat(pairs, ignore_index=True))
bc = band_curves(pairs)
bc.to_csv(RESULTS / "saveworld_band_curves.csv", index=False)
heterogeneity(pairs).to_csv(RESULTS / "saveworld_heterogeneity.csv", index=False)
extremes(pairs).to_csv(RESULTS / "saveworld_extremes.csv", index=False)
c, cs = corr_structure(pairs)

late = s[s["season"] >= s["start"] + 6]
tot = late["min"].sum()
ad = late.groupby("age")["min"].sum() / tot
ad.rename("min_share").to_csv(RESULTS / "saveworld_age_distribution.csv")
last = s.groupby(["save", "pid"])["season"].transform("max")
maxs = s.groupby("save")["season"].transform("max")
hz = s[s["season"] < maxs].assign(exit=lambda d: last.loc[d.index] == d["season"]).groupby("age")["exit"].agg(["mean", "size"])
hz[hz["size"] >= 30].to_csv(RESULTS / "saveworld_exit_hazard.csv")
summ = {"pairs": int(len(pairs)), "corr": cs,
        "min_weighted_mean_age": float(np.average(late["age"], weights=late["min"])),
        "min_share_age_ge_33": float(late.loc[late["age"] >= 33, "min"].sum() / tot),
        "min_share_age_le_22": float(late.loc[late["age"] <= 22, "min"].sum() / tot)}
dump_json(summ, RESULTS / "saveworld_summary.json")
print(bc.query("metric in ['pbpm','mpg','plays36','tpar','stl36']").pivot_table(index="band", columns="metric", values="mean").round(3))
print(heterogeneity(pairs).query("metric=='pbpm'").round(3))
print(summ)
