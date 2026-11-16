"""Broad audit of BBGM real-player ratings (data/real-player-data.basketball.json) as development labels.

The ratings are GameSim-fitted proxies, so this audit asks, across eras/positions/roles/levels:
 A. Physical-constant check: hgt should be ~fixed (heightToRating of listed height + wingspan +-1). Year-to-
    year hgt changes and hgt-vs-height residuals measure fitting noise / data errors, not growth.
 B. Source discontinuities: per calendar season, SD of year-over-year rating changes for stable players
    (>=1000 min both seasons, same team) and the correlation of rating changes with the box-score changes
    they are supposed to encode (tp vs 3PA rate & 3P%, ft vs FT%, reb vs TRB%, pss vs AST%, hgt vs nothing).
 C. Rating changes vs stat changes overall (signal share): R^2 of Delta(stat) on Delta(ratings).
 D. GameSim reproduction (seasons 2022-2025): sim stats of real players given their real ratings (step arm
    'none') vs their actual NBA stats -> per-stat residual distribution by position/role/level, outliers.
 E. Ratings-space 'aging' implied by the fitted ratings, by rating and age (contrast only; NOT a target).
Named cases (Hauser, Whiteside, Ingram, Faried) are reported inside the broad tables, not on their own.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DATA, RATING_KEYS, RESULTS, SIM_OUT, dump_json
from profile import box_metrics, read_gz_csv

r = pd.read_parquet(OUT_DATA / "bbgm_real_ratings.parquet")
p = pd.read_parquet(OUT_DATA / "nba_player_seasons.parquet")
cols = ["slug", "season", "name", "height", "pos_group", "min", "mpg", "ts", "tpar", "tp_pct", "ft_pct", "trbp", "astp", "tov_pct",
        "blkp", "stlp", "ftr", "usgp", "bpm", "first_team", "last_team", "n_teams", "era", "split"]
r = r.drop(columns=["min", "gp"]).merge(p[cols], on=["slug", "season"], how="inner")
r["hgt_from_height"] = np.floor(np.clip(100 * (r["height"] - 66) / (93 - 66), 0, 100))
r["hgt_resid"] = r["hgt"] - r["hgt_from_height"]

# A. hgt as a physical constant
A = r[r["min"] >= 500].groupby("era").agg(n=("hgt", "size"), hgt_resid_mean=("hgt_resid", "mean"), hgt_resid_sd=("hgt_resid", "std"),
                                          share_abs_resid_gt10=("hgt_resid", lambda s: (s.abs() > 10).mean()))
r = r.sort_values(["slug", "season"])
prev = r.groupby("slug").shift(1)
pair = r[(prev["season"] == r["season"] - 1)].copy()
for k in RATING_KEYS + ["ovr", "tpar", "tp_pct", "ft_pct", "trbp", "astp", "tov_pct", "blkp", "stlp", "ftr", "usgp", "bpm", "ts"]:
    pair[f"d_{k}"] = pair[k] - prev.loc[pair.index, k]
pair["p_min"] = prev.loc[pair.index, "min"]
pair["same_team"] = (prev.loc[pair.index, "last_team"] == pair["first_team"]) & (pair["n_teams"] == 1)
stable = pair[(pair["min"] >= 1000) & (pair["p_min"] >= 1000)]
A2 = stable.groupby("era").agg(n=("d_hgt", "size"), d_hgt_sd=("d_hgt", "std"), share_hgt_changed=("d_hgt", lambda s: (s != 0).mean()),
                               share_abs_dhgt_ge5=("d_hgt", lambda s: (s.abs() >= 5).mean()))
A = A.join(A2, rsuffix="_pairs")
A.to_csv(RESULTS / "audit_A_hgt_constant.csv")

# B. discontinuities by calendar season
PROXY = {"tp": ["d_tpar", "d_tp_pct"], "ft": ["d_ft_pct"], "reb": ["d_trbp"], "pss": ["d_astp"], "drb": ["d_tov_pct"],
         "spd": ["d_stlp", "d_ftr"], "jmp": ["d_blkp", "d_trbp"], "hgt": ["d_blkp", "d_trbp"]}
rows = []
for s, d in stable.groupby("season"):
    if len(d) < 40:
        continue
    row = {"season": int(s), "n": len(d), "sd_d_ovr": d["d_ovr"].std(), "mean_abs_d_all": d[[f"d_{k}" for k in RATING_KEYS]].abs().mean().mean()}
    for k in RATING_KEYS:
        row[f"sd_d_{k}"] = d[f"d_{k}"].std()
    for k, prox in PROXY.items():
        for pr in prox:
            row[f"corr_d{k}_{pr}"] = d[f"d_{k}"].corr(d[pr])
    rows.append(row)
B = pd.DataFrame(rows)
B.to_csv(RESULTS / "audit_B_discontinuity_by_season.csv", index=False)
# flag seasons whose mean |delta| is > 1.5x the rolling median of the surrounding 10 seasons
med = B["mean_abs_d_all"].rolling(11, center=True, min_periods=5).median()
B["jump_flag"] = B["mean_abs_d_all"] > 1.5 * med
flags = B.loc[B["jump_flag"], ["season", "n", "mean_abs_d_all"]].to_dict(orient="records")

# C. how much of the rating change is explained by stat changes (and vice versa), by era
C = []
for era, d in stable.groupby("era"):
    for k, prox in PROXY.items():
        X = d[prox].dropna()
        y = d.loc[X.index, f"d_{k}"]
        if len(X) < 50:
            continue
        Xc = np.column_stack([np.ones(len(X)), X.values])
        beta, *_ = np.linalg.lstsq(Xc, y.values, rcond=None)
        resid = y.values - Xc @ beta
        C.append({"era": era, "rating": k, "proxies": "+".join(prox), "n": len(X), "r2": 1 - resid.var() / y.var(), "sd_d_rating": y.std()})
C = pd.DataFrame(C)
C.to_csv(RESULTS / "audit_C_rating_change_signal.csv", index=False)

# D. GameSim reproduction of real seasons (step arm 'none', seasons with real stats)
D_rows, outl = [], []
files = sorted(SIM_OUT.glob("step__*__none__*.csv.gz"))
if files:
    sim = pd.concat([read_gz_csv(f) for f in files], ignore_index=True)
    sim["age"] = sim["age_sim"]
    sim = pd.concat([box_metrics(g) for _, g in sim.groupby(["save", "seed"])], ignore_index=True)
    sim = sim.groupby(["srID", "season"]).agg({c: "mean" for c in ["min", "mpg", "ts", "tpar", "ftr", "ast36", "blk36", "stl36", "drb36", "orb36", "plays36", "pbpm", "tov_pct", "ovr", "r_fg", "r_tp", "r_hgt"]}).reset_index()
    # real level metrics with the same box_metrics() as the sim, per real season
    allp = pd.read_parquet(OUT_DATA / "nba_player_seasons.parquet")
    pb = pd.concat([box_metrics(g) for _, g in allp[allp["season"] >= 2020].groupby("season")])
    real = pb[["slug", "season", "min", "mpg", "ts", "tpar", "ftr", "ast36", "blk36", "stl36", "drb36", "orb36", "plays36", "pbpm", "tov_pct", "pos_group", "name"]]
    m = sim.merge(real.rename(columns={"slug": "srID"}), on=["srID", "season"], suffixes=("_sim", "_real"))
    m = m[(m["min_sim"] >= 500) & (m["min_real"] >= 500)]
    m["role"] = pd.cut(m["mpg_real"], [0, 15, 28, 60], labels=["bench", "rotation", "starter"]).astype(str)
    m["level"] = pd.qcut(m["pbpm_real"], 3, labels=["low", "mid", "high"]).astype(str)
    stats = ["ts", "tpar", "ftr", "ast36", "blk36", "stl36", "drb36", "orb36", "plays36", "pbpm", "tov_pct", "mpg"]
    for s in stats:
        m[f"res_{s}"] = m[f"{s}_sim"] - m[f"{s}_real"]
    for grp in ["pos_group", "role", "level"]:
        for gv, d in m.groupby(grp):
            row = {"group": grp, "value": gv, "n": len(d)}
            for s in stats:
                row[f"bias_{s}"] = d[f"res_{s}"].mean()
                row[f"corr_{s}"] = d[f"{s}_sim"].corr(d[f"{s}_real"])
            D_rows.append(row)
    overall = {"n": len(m), **{f"corr_{s}": float(m[f"{s}_sim"].corr(m[f"{s}_real"])) for s in stats},
               **{f"sd_res_{s}": float(m[f"res_{s}"].std()) for s in stats}}
    # outliers: largest standardized residuals on shot structure / efficiency
    for s in ["tpar", "ts", "ftr", "plays36", "pbpm"]:
        z = (m[f"res_{s}"] - m[f"res_{s}"].mean()) / m[f"res_{s}"].std()
        top = m.assign(z=z).reindex(z.abs().sort_values(ascending=False).index).head(8)
        for _, t in top.iterrows():
            outl.append({"stat": s, "name": t["name"], "season": int(t["season"]), "sim": t[f"{s}_sim"], "real": t[f"{s}_real"], "z": t["z"],
                         "r_fg": t["r_fg"], "r_tp": t["r_tp"], "r_hgt": t["r_hgt"]})
    named = m[m["name"].isin(["Sam Hauser", "Brandon Ingram", "Hassan Whiteside", "Kenneth Faried"])][["name", "season"] + [f"{s}_{w}" for s in ["tpar", "ts", "pbpm"] for w in ["sim", "real"]] + ["r_fg", "r_tp", "r_hgt"]]
    named.to_csv(RESULTS / "audit_D_named_cases.csv", index=False)
    pd.DataFrame(D_rows).to_csv(RESULTS / "audit_D_gamesim_reproduction.csv", index=False)
    pd.DataFrame(outl).to_csv(RESULTS / "audit_D_outliers.csv", index=False)
else:
    overall = {}

# E. ratings-space aging implied by fitted ratings (contrast only)
E = stable.groupby("age")[[f"d_{k}" for k in RATING_KEYS + ["ovr"]]].mean()
E["n"] = stable.groupby("age").size()
E[E["n"] >= 30].to_csv(RESULTS / "audit_E_fitted_rating_aging.csv")

summary = {"A_hgt_by_era": A.round(3).to_dict(orient="index"), "B_jump_seasons": flags,
           "C_signal_r2_median_by_rating": C.groupby("rating")["r2"].median().round(3).to_dict(),
           "D_overall": overall}
dump_json(summary, RESULTS / "audit_summary.json")
print(A.round(2))
print(B[["season", "n", "mean_abs_d_all", "sd_d_hgt", "sd_d_tp", "corr_dtp_d_tpar", "jump_flag"]].tail(30).round(2).to_string())
print(C.pivot_table(index="rating", columns="era", values="r2").round(2))
print(overall)
