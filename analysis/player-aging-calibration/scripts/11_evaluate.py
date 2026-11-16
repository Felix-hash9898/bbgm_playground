"""Scorecard on the INDEPENDENT test half of NBA players (and the 2014-2025 era as a second hold-out).

Design-to-estimator matching (selection structure):
  step design (no attrition)        -> NBA 'inclusive' estimator (survivor-robust), naive shown too
  population GameSim cross-sections -> NBA 'naive' estimator (both have attrition + minutes selection)
Per arm we report errors by age band for pseudo-BPM, minutes and component stats, individual
heterogeneity, extremes, cross-skill correlation, ability slope, longevity and age distribution, and we
list every (metric, band, subgroup) cell where a candidate is worse than BOTH baselines (counterexamples).
Outputs: results/scorecard.csv, results/scorecard_summary.json, results/counterexamples.csv
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import OUT_DATA, RESULTS, age_band, dump_json, wmean
from profile import DMETRICS

BANDS = ["19-22", "23-25", "26-28", "29-31", "32-34", "35+"]
COMP = ["pbpm", "mpg", "plays36", "pts36", "ts", "tpar", "ftr", "ast36", "tov_pct", "stl36", "blk36", "drb36", "orb36"]

pr = pd.read_parquet(OUT_DATA / "nba_pairs.parquet")
pr["band1"] = age_band(pr["age1"])


def nba_band(split=None, est="naive", era=None):
    d = pr if split is None else pr[pr["split"] == split]
    if era is not None:
        d = d[d["season"] >= era]
    out = {}
    for c in COMP:
        if est == "naive":
            q = d[d["consecutive"] & (d["min"] >= 250) & (d["n_min"] >= 250)].dropna(subset=[f"d_{c}"])
            w = 2 / (1 / q["min"] + 1 / q["n_min"])
        else:
            q = d[(d["min"] >= 500) & d["consecutive"] & (d["n_min"] >= 50)].dropna(subset=[f"d_{c}"])
            w = q["min"]
        q = q.assign(w=w)
        out[c] = q.groupby("band1").apply(lambda x: wmean(x[f"d_{c}"], x["w"]), include_groups=False)
    return pd.DataFrame(out)


T = {"test_naive": nba_band("test", "naive"), "test_incl": nba_band("test", "inclusive"),
     "fit_naive": nba_band("fit", "naive"), "fit_incl": nba_band("fit", "inclusive"),
     "era2014_naive": nba_band(None, "naive", 2014), "era2014_incl": nba_band(None, "inclusive", 2014)}
scale = T["test_naive"].std()  # between-band spread of each NBA curve: errors are expressed in these units


def load_design(prefix):
    bc = pd.read_csv(RESULTS / f"{prefix}_band_curves.csv")
    return bc[bc["arm"] != "noise"].pivot_table(index="band", columns=["arm", "metric"], values="mean")


rows, counter = [], []
designs = {"step": ("step", "test_incl"), "population": ("pop_xs", "test_naive")}
for dname, (prefix, tgt) in designs.items():
    try:
        bc = load_design(prefix)
    except FileNotFoundError:
        continue
    arms = sorted({a for a, _ in bc.columns})
    het = pd.read_csv(RESULTS / f"{prefix}_heterogeneity.csv")
    ext = pd.read_csv(RESULTS / f"{prefix}_extremes.csv")
    cor = pd.read_csv(RESULTS / f"{prefix}_corr_summary.csv").set_index("arm")
    ab = pd.read_csv(RESULTS / f"{prefix}_ability_slope.csv")
    nh = pd.read_csv(RESULTS / "nba_profile_test_heterogeneity.csv")
    nx = pd.read_csv(RESULTS / "nba_profile_test_extremes.csv").set_index("band")
    na = pd.read_csv(RESULTS / "nba_profile_test_ability_slope.csv").set_index("band")
    ncor = json.loads((RESULTS / "nba_profile_corr.json").read_text())["test"]
    for arm in arms:
        r = {"design": dname, "arm": arm, "target": tgt}
        errs = {}
        for c in COMP:
            sim = bc[(arm, c)].reindex(BANDS)
            for tname in [tgt, tgt.replace("test", "era2014")]:
                nb = T[tname][c].reindex(BANDS)
                e = (sim - nb) / scale[c]
                if tname == tgt:
                    errs[c] = e
                r[f"rmse_{c}_{tname}"] = float(np.sqrt(np.nanmean(e ** 2)))
        r["rmse_pbpm"] = r[f"rmse_pbpm_{tgt}"]
        r["rmse_components_mean"] = float(np.mean([r[f"rmse_{c}_{tgt}"] for c in COMP if c != "pbpm"]))
        for b in BANDS:
            r[f"bias_pbpm_{b}"] = float(bc[(arm, "pbpm")].get(b, np.nan) - T[tgt]["pbpm"].get(b, np.nan))
        h = het[(het["arm"] == arm) & (het["metric"] == "pbpm")].set_index("band")["sd_true"]
        hn = nh[nh["metric"] == "pbpm"].set_index("band")["sd_true"]
        r["het_pbpm_log_ratio"] = float(np.nanmean(np.log((h.reindex(BANDS) + 1e-3) / (hn.reindex(BANDS) + 1e-3))))
        for m in ["tpar", "plays36"]:
            hm = het[(het["arm"] == arm) & (het["metric"] == m)].set_index("band")["sd_true"]
            hnm = nh[nh["metric"] == m].set_index("band")["sd_true"]
            r[f"het_{m}_ratio"] = float(np.nanmean(hm.reindex(BANDS) / hnm.reindex(BANDS)))
        e = ext[ext["arm"] == arm].set_index("band")
        r["ext_p_dn3_excess"] = float(np.nanmean(e["p_dn3"].reindex(BANDS) - nx["p_dn3"].reindex(BANDS)))
        r["ext_p_up3_excess"] = float(np.nanmean(e["p_up3"].reindex(BANDS) - nx["p_up3"].reindex(BANDS)))
        r["corr_offdiag"] = float(cor.loc[arm, "mean_offdiag"]) if arm in cor.index else np.nan
        r["corr_offdiag_nba"] = ncor["mean_offdiag"]
        r["eigen1_share"] = float(cor.loc[arm, "first_eigen_share"]) if arm in cor.index else np.nan
        a = ab[ab["arm"] == arm].set_index("band")["slope"]
        r["ability_slope_err"] = float(np.nanmean(a.reindex(BANDS) - na["slope"].reindex(BANDS)))
        rows.append(r)
        for c in COMP:
            for b in BANDS:
                counter.append({"design": dname, "arm": arm, "metric": c, "band": b, "abs_err": float(abs(errs[c].get(b, np.nan)))})

sc = pd.DataFrame(rows)
# longevity / age distribution (population design) vs NBA
pop_lon = RESULTS / "pop_longevity.csv"
if pop_lon.exists():
    lon = pd.read_csv(pop_lon).set_index("arm")
    ages = json.loads((RESULTS / "pop_age_summary.json").read_text())
    nba = json.loads((RESULTS / "nba_summary.json").read_text())
    nba_age = pd.read_csv(RESULTS / "nba_age_distribution.csv").query("era=='2015-25'").set_index("age")["min_share"]
    pad = pd.read_csv(RESULTS / "pop_age_distribution.csv")
    nhz = pd.read_csv(RESULTS / "nba_exit_hazard.csv").groupby("age").apply(lambda d: np.average(d["mean"], weights=d["size"]), include_groups=False)
    phz = pd.read_csv(RESULTS / "pop_exit_hazard.csv")
    for i, r in sc.iterrows():
        if r["design"] != "population" or r["arm"] not in lon.index:
            continue
        L = lon.loc[r["arm"]]
        sc.loc[i, "career_mean_seasons"] = L["mean_seasons"]
        sc.loc[i, "career_final_age_p50"] = L["final_age_p50"]
        sc.loc[i, "career_final_age_p90"] = L["final_age_p90"]
        A = ages[r["arm"]]
        sc.loc[i, "min_mean_age"] = A.get("min_weighted_mean_age_xs")
        sc.loc[i, "min_share_ge33"] = A.get("min_share_age_ge_33_xs")
        sc.loc[i, "min_share_le22"] = A.get("min_share_age_le_22_xs")
        s = pad[pad["arm"] == r["arm"]].set_index("age")["min_share"].reindex(range(19, 41)).fillna(0)
        sc.loc[i, "age_dist_L1"] = float(np.abs(s - nba_age.reindex(range(19, 41)).fillna(0)).sum())
        h = phz[phz["arm"] == r["arm"]].set_index("age")["mean"].reindex(range(26, 38))
        sc.loc[i, "exit_hazard_rmse_26_37"] = float(np.sqrt(np.nanmean((h - nhz.reindex(range(26, 38))) ** 2)))
    sc.attrs["nba_ref"] = {"career_mean_seasons": nba["career_length_seasons"]["mean"], "final_age_p50": nba["career_final_age_quantiles"]["0.5"],
                           "final_age_p90": nba["career_final_age_quantiles"]["0.9"], "min_mean_age_2015_25": nba["min_weighted_mean_age_2015_25"],
                           "min_share_ge33": nba["min_share_age_ge_33_2015_25"], "min_share_le22": nba["min_share_age_le_22_2015_25"]}
sc.to_csv(RESULTS / "scorecard.csv", index=False)

# counterexamples: candidate cells worse than BOTH baselines by > 0.25 band-spread units
ce = pd.DataFrame(counter)
out = []
for (dname, c, b), d in ce.groupby(["design", "metric", "band"]):
    base = d[d["arm"].isin(["official", "playground"])].set_index("arm")["abs_err"]
    if len(base) < 2:
        continue
    for _, x in d[~d["arm"].isin(["official", "playground"])].iterrows():
        if x["abs_err"] > base.max() + 0.25:
            out.append({**x.to_dict(), "official_err": base["official"], "playground_err": base["playground"]})
pd.DataFrame(out).to_csv(RESULTS / "counterexamples.csv", index=False)
dump_json({"scorecard": sc.to_dict(orient="records"), "nba_ref": sc.attrs.get("nba_ref", {})}, RESULTS / "scorecard_summary.json")
pd.set_option("display.width", 250)
show = ["design", "arm", "rmse_pbpm", "rmse_components_mean", "het_pbpm_log_ratio", "het_tpar_ratio", "het_plays36_ratio", "ext_p_dn3_excess",
        "corr_offdiag", "ability_slope_err"] + [f"bias_pbpm_{b}" for b in BANDS]
print(sc[show].round(3).to_string())
extra = [c for c in ["career_mean_seasons", "career_final_age_p50", "career_final_age_p90", "min_mean_age", "min_share_ge33", "min_share_le22", "age_dist_L1", "exit_hazard_rmse_26_37"] if c in sc]
if extra:
    print(sc[sc["design"] == "population"][["arm"] + extra].round(3).to_string())
    print(sc.attrs.get("nba_ref"))
print("counterexamples:", len(out))
