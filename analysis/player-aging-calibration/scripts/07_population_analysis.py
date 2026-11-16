"""Population design: multi-year league (development + retirement + draft + roster selection) per formula.

Outputs
  results/pop_longevity.csv        career length / final age of generated players (complete careers)
  results/pop_age_distribution.csv  rostered-player age shares (steady state) and GameSim minutes shares
  results/pop_exit_hazard.csv       P(last rostered season | age)
  results/pop_xs_*                  delta-method profile from consecutive GameSim cross-sections
  results/pop_rating_delta.csv      steady-state rating-space change by age (rostered both years)
Arms present in sim/output are analysed automatically; AGING_POP_ARMS env may restrict them.
"""
from __future__ import annotations

import os
import re

import numpy as np
import pandas as pd

from common import RESULTS, SIM_OUT, dump_json, wmean
from profile import (ability_slope, band_curves, box_metrics, corr_structure, curves, extremes, finish, heterogeneity,
                     make_pairs, read_gz_csv)

pop = pd.concat([read_gz_csv(f) for f in sorted(SIM_OUT.glob("population__*.csv.gz"))], ignore_index=True)
xs_files = sorted(SIM_OUT.glob("xs__*.csv.gz"))
xs = pd.concat([read_gz_csv(f) for f in xs_files], ignore_index=True) if xs_files else None
if os.environ.get("AGING_POP_ARMS"):
    keep = os.environ["AGING_POP_ARMS"].split(",")
    pop = pop[pop["arm"].isin(keep)]
    xs = xs[xs["arm"].isin(keep)] if xs is not None else None
YEARS = int(pop["year"].max())

# ---------------- longevity (generated players with complete careers: drafted in years 1..YEARS-16)
gen = pop[(pop["origin"] == "generated")]
first_year = gen.groupby(["arm", "seed", "pid"])["year"].transform("min")
gen = gen[first_year <= YEARS - 16]
car = gen[gen["rostered"] == 1].groupby(["arm", "seed", "pid"]).agg(n=("year", "nunique"), final_age=("age", "max"), debut_age=("age", "min"),
                                                                       peak_ovr=("ovr", "max"))
peak_age = gen[gen["rostered"] == 1].sort_values("ovr").groupby(["arm", "seed", "pid"]).tail(1).set_index(["arm", "seed", "pid"])["age"]
car["peak_age"] = peak_age
lon = car.groupby("arm").agg(players=("n", "size"), mean_seasons=("n", "mean"), median_seasons=("n", "median"),
                             p75_seasons=("n", lambda s: s.quantile(.75)), final_age_mean=("final_age", "mean"),
                             final_age_p50=("final_age", "median"), final_age_p90=("final_age", lambda s: s.quantile(.9)),
                             peak_ovr_age_mean=("peak_age", "mean"), peak_ovr_age_p50=("peak_age", "median"))
lon.to_csv(RESULTS / "pop_longevity.csv")
# exit hazard by age: rostered at age a and never rostered again
r = pop[pop["rostered"] == 1]
last = r.groupby(["arm", "seed", "pid"])["year"].transform("max")
r = r.assign(exit=(last == r["year"]) & (r["year"] < YEARS))
r = r[r["year"].between(10, YEARS - 1)]
hz = r.groupby(["arm", "age"])["exit"].agg(["mean", "size"]).reset_index()
hz[hz["size"] >= 50].to_csv(RESULTS / "pop_exit_hazard.csv", index=False)

# ---------------- age distribution in steady state (years 20..YEARS)
ss = pop[(pop["rostered"] == 1) & (pop["year"] >= 20)]
ad = ss.groupby(["arm", "age"]).size().rename("n").reset_index()
ad["player_share"] = ad["n"] / ad.groupby("arm")["n"].transform("sum")
if xs is not None:
    xm = xs.groupby(["arm", "age"])["min"].sum().rename("min").reset_index()
    xm["min_share"] = xm["min"] / xm.groupby("arm")["min"].transform("sum")
    ad = ad.merge(xm[["arm", "age", "min_share"]], on=["arm", "age"], how="left")
ad.to_csv(RESULTS / "pop_age_distribution.csv", index=False)
agesum = {}
for arm, d in ss.groupby("arm"):
    agesum[arm] = {"mean_age_rostered": float(d["age"].mean()), "share_age_ge_33": float((d["age"] >= 33).mean()),
                   "share_age_le_22": float((d["age"] <= 22).mean())}
    if xs is not None:
        x = xs[xs["arm"] == arm]
        agesum[arm].update({"min_weighted_mean_age_xs": float(np.average(x["age"], weights=x["min"])),
                            "min_share_age_ge_33_xs": float(x.loc[x["age"] >= 33, "min"].sum() / x["min"].sum()),
                            "min_share_age_le_22_xs": float(x.loc[x["age"] <= 22, "min"].sum() / x["min"].sum())})
dump_json(agesum, RESULTS / "pop_age_summary.json")

# ---------------- rating-space steady-state deltas (rostered both years, years >= 10)
pp = pop.sort_values(["arm", "seed", "pid", "year"])
prv = pp.groupby(["arm", "seed", "pid"]).shift(1)
ok = (prv["year"] == pp["year"] - 1) & (pp["year"] >= 10) & (prv["rostered"] == 1)
rd = pd.DataFrame({"arm": pp["arm"], "age": pp["age"], "d_ovr": pp["ovr"] - prv["ovr"]})[ok]
rd = rd.groupby(["arm", "age"])["d_ovr"].agg(["mean", "std", "size"]).reset_index()
rd.to_csv(RESULTS / "pop_rating_delta.csv", index=False)

# ---------------- consecutive GameSim cross-sections -> delta-method profile (the NBA analogue)
if xs is not None:
    allp = []
    for (arm, seed), d in xs.groupby(["arm", "seed"]):
        years = sorted(d["year"].unique())
        for y in years:
            if y + 1 in years:
                d0 = box_metrics(d[d["year"] == y])
                d1 = box_metrics(d[d["year"] == y + 1])
                p = make_pairs(d0, d1, carry=("ovr",))
                p["arm"], p["seed"], p["y"] = arm, seed, y
                allp.append(p)
    xp = finish(pd.concat(allp, ignore_index=True))
    xp.to_parquet(SIM_OUT.parent / "pop_xs_pairs.parquet", index=False)
    tabs = {k: [] for k in ["curves", "band_curves", "heterogeneity", "extremes", "ability_slope"]}
    cs = []
    for arm, p in xp.groupby("arm"):
        for f in [curves, band_curves, heterogeneity, extremes, ability_slope]:
            t = f(p)
            t["arm"] = arm
            tabs[f.__name__].append(t)
        c, s = corr_structure(p)
        if c is not None:
            cs.append({"arm": arm, **s})
            c.to_csv(RESULTS / f"pop_xs_delta_corr_{arm}.csv")
    for k, v in tabs.items():
        pd.concat(v).to_csv(RESULTS / f"pop_xs_{k}.csv", index=False)
    pd.DataFrame(cs).to_csv(RESULTS / "pop_xs_corr_summary.csv", index=False)
    print(pd.concat(tabs["band_curves"]).query("metric in ['pbpm','mpg']").pivot_table(index=["metric", "band"], columns="arm", values="mean").round(3))
    print(pd.DataFrame(cs))
print(lon.round(2))
print(agesum)
