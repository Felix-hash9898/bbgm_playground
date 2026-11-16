"""Step design: same real players, same engine, one offseason of development under each formula.

For each save x seed: arm 'none' season (age a, no development) vs arm X season (age a+1, developed).
Pairs are league-adjusted like the NBA pairs. Because the whole league develops at once (no entrants),
league-relative pseudo-BPM changes are shifted by the minutes-weighted environment change; the
corrected change adds beta * wmean(delta ovr) where beta = d pbpm / d ovr from the 'none' cross-section.
Noise-only pairs (none seed A vs none seed B) give the pure GameSim sampling noise as a null.
Outputs: results/step_*.csv/json
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd
import statsmodels.api as sm

from common import OUT_DATA, RESULTS, SIM_OUT, dump_json, wmean
from profile import (DMETRICS, ability_slope, band_curves, box_metrics, corr_structure, curves, extremes, finish,
                     heterogeneity, make_pairs, read_gz_csv)

files = sorted(SIM_OUT.glob("step__*.csv.gz"))
raw = pd.concat([read_gz_csv(f) for f in files], ignore_index=True)
raw["age"] = raw["age_sim"]
bios = pd.read_parquet(OUT_DATA / "nba_player_seasons.parquet")[["slug", "pos_group", "height"]].drop_duplicates("slug")
raw = raw.merge(bios.rename(columns={"slug": "srID"}), on="srID", how="left")
arms = [a for a in raw["arm"].unique() if a != "none"]
seeds = sorted(raw["seed"].unique())
print("arms", arms, "seeds", seeds, "saves", raw["save"].nunique())

runs = {k: box_metrics(g) for k, g in raw.groupby(["save", "arm", "seed"])}
pairs, noise_pairs, env = [], [], []
for save in raw["save"].unique():
    for seed in seeds:
        d0 = runs.get((save, "none", seed))
        if d0 is None:
            continue
        b0 = d0[d0["min"] >= 500]
        beta = sm.WLS(b0["pbpm"], sm.add_constant(b0["ovr"]), weights=b0["min"]).fit().params["ovr"]
        for arm in arms:
            d1 = runs.get((save, arm, seed))
            if d1 is None:
                continue
            p = make_pairs(d0, d1, carry=("ovr", "r_hgt", "pos_group", "srID"))
            p = p.merge(d1[["pid", "ovr"]].rename(columns={"ovr": "n_ovr"}), on="pid")
            p["d_ovr"] = p["n_ovr"] - p["ovr"]
            shift = wmean(p["d_ovr"], (p["min"] + p["n_min"]) / 2)
            p["d_pbpm_rel"] = p["d_pbpm"]
            p["d_pbpm"] = p["d_pbpm"] + beta * shift
            p["arm"], p["save"], p["seed"] = arm, save, seed
            env.append({"save": save, "seed": seed, "arm": arm, "beta_pbpm_per_ovr": beta, "env_shift_ovr": shift,
                        "env_shift_pbpm": beta * shift})
            pairs.append(p)
    # noise-only: none seed i vs none seed j (identical ratings)
    if len(seeds) >= 2 and (save, "none", seeds[0]) in runs and (save, "none", seeds[1]) in runs:
        q = make_pairs(runs[(save, "none", seeds[0])], runs[(save, "none", seeds[1])], carry=("ovr",))
        q["arm"], q["save"] = "noise", save
        noise_pairs.append(q)
pairs = finish(pd.concat(pairs, ignore_index=True))
noise = finish(pd.concat(noise_pairs, ignore_index=True)) if noise_pairs else None
pairs.to_parquet(OUT_DATA / "step_pairs.parquet", index=False)
dump_json(pd.DataFrame(env).groupby("arm")[["beta_pbpm_per_ovr", "env_shift_ovr", "env_shift_pbpm"]].mean().to_dict(orient="index"),
          RESULTS / "step_environment_shift.json")

# rating-space deltas of the same players
rs = pairs.groupby(["arm", "age1"]).apply(lambda d: pd.Series({"d_ovr": d["d_ovr"].mean(), "sd_ovr": d["d_ovr"].std(), "n": len(d)}),
                                         include_groups=False).reset_index()
rs.to_csv(RESULTS / "step_rating_delta_by_age.csv", index=False)

out_curves, out_band, out_het, out_ext, out_abil, corr_rows = [], [], [], [], [], []
for arm, p in list(pairs.groupby("arm")) + ([("noise", noise)] if noise is not None else []):
    for f, lst in [(curves, out_curves), (band_curves, out_band), (heterogeneity, out_het), (extremes, out_ext), (ability_slope, out_abil)]:
        r = f(p)
        r["arm"] = arm
        lst.append(r)
    c, s = corr_structure(p)
    if c is not None:
        c.to_csv(RESULTS / f"step_delta_corr_{arm}.csv")
        corr_rows.append({"arm": arm, **s})
for name, lst in [("curves", out_curves), ("band_curves", out_band), ("heterogeneity", out_het), ("extremes", out_ext), ("ability_slope", out_abil)]:
    pd.concat(lst).to_csv(RESULTS / f"step_{name}.csv", index=False)
pd.DataFrame(corr_rows).to_csv(RESULTS / "step_corr_summary.csv", index=False)

# subgroups (position, role, height, level) - mean d_pbpm by band
pairs["role"] = pd.cut(pairs["mpg"], [0, 15, 28, 60], labels=["bench<15", "rotation15-28", "starter28+"]).astype(str)
pairs["hgt_t"] = pd.cut(pairs["r_hgt"], [-1, 40, 55, 101], labels=["short", "mid", "tall"]).astype(str)
sub = []
q = pairs[(pairs["min"] >= 250) & (pairs["n_min"] >= 250)]
q = q.assign(level_t=q.groupby(["arm", "band1"])["pbpm"].transform(lambda s: pd.qcut(s, 3, labels=["low", "mid", "high"]).astype(str)))
for grp in ["pos_group", "role", "hgt_t", "level_t"]:
    for (arm, gv, band), d in q.groupby(["arm", grp, "band1"]):
        if len(d) >= 25:
            sub.append({"arm": arm, "group": grp, "value": gv, "band": band, "n": len(d), "d_pbpm": wmean(d["d_pbpm"], d["hm_min"]),
                        "d_ts": wmean(d["d_ts"], d["hm_min"]), "d_blk36": wmean(d["d_blk36"], d["hm_min"]),
                        "d_tpar": wmean(d["d_tpar"], d["hm_min"]), "d_mpg": wmean(d["d_mpg"], d["hm_min"])})
pd.DataFrame(sub).to_csv(RESULTS / "step_subgroups.csv", index=False)
bc = pd.concat(out_band)
print(bc[bc.metric.isin(["pbpm", "mpg", "ts", "blk36", "ast36"])].pivot_table(index=["metric", "band"], columns="arm", values="mean").round(3))
print(pd.concat(out_het).query("metric=='pbpm'").pivot_table(index="band", columns="arm", values="sd_true").round(3))
print(pd.DataFrame(corr_rows))
