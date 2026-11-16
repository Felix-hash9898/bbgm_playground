"""Identical aging-profile computations for NBA pairs and GameSim pairs (methodological parity).

A 'pairs' frame has one row per player and consecutive season pair with columns
  age1 (age in the second season), min, n_min (minutes in the two seasons), d_<metric> (league-
  adjusted change), <metric> (level in the first season) and optional group columns.
"""
from __future__ import annotations

import gzip
import io
import json

import numpy as np
import pandas as pd
import statsmodels.api as sm

from common import RESULTS, age_band, wmean

PB = json.loads((RESULTS / "pseudo_bpm_model.json").read_text())
PB_FEATS = ["pts36", "ts", "ast36", "tov36", "orb36", "drb36", "stl36", "blk36", "fga36", "fta36", "tpa36", "pf36"]
DMETRICS = ["pbpm", "ts", "plays36", "pts36", "tpar", "ftr", "ast36", "tov_pct", "orb36", "drb36", "stl36", "blk36", "tpa36", "mpg"]
CC = ["ts", "tpar", "ftr", "ast36", "tov_pct", "orb36", "drb36", "stl36", "blk36", "plays36"]


def read_gz_csv(path):
    return pd.read_csv(io.BytesIO(gzip.decompress(path.read_bytes())))


def box_metrics(df: pd.DataFrame, league_min: float = 500) -> pd.DataFrame:
    """Rates + pseudo-BPM from raw season totals (one league-season per call)."""
    d = df.copy()
    m = d["min"].replace(0, np.nan)
    tsa = d["fga"] + 0.44 * d["fta"]
    d["ts"] = d["pts"] / (2 * tsa.replace(0, np.nan))
    d["tpar"] = d["tpa"] / d["fga"].replace(0, np.nan)
    d["ftr"] = d["fta"] / d["fga"].replace(0, np.nan)
    d["tov_pct"] = d["tov"] / (tsa + d["tov"]).replace(0, np.nan)
    d["plays36"] = (tsa + d["tov"]) / m * 36
    for c in ["pts", "ast", "orb", "drb", "stl", "blk", "tov", "fga", "fta", "tpa", "pf"]:
        d[f"{c}36"] = d[c] / m * 36
    d["mpg"] = d["min"] / d["gp"].replace(0, np.nan)
    base = d[d["min"] >= league_min]
    pb = PB["coef"]["const"]
    for c in PB_FEATS:
        lm = wmean(base[c], base["min"])
        pb = pb + PB["coef"][f"{c}_rel"] * (d[c] - lm)
    d["pbpm"] = pb
    return d


def league_means(d: pd.DataFrame, cols, min_cut=250):
    b = d[d["min"] >= min_cut]
    return {c: wmean(b[c], b["min"]) for c in cols}


def make_pairs(d0: pd.DataFrame, d1: pd.DataFrame, key="pid", carry=()) -> pd.DataFrame:
    """d0, d1: per-player box-metric frames for consecutive seasons (same league)."""
    L0, L1 = league_means(d0, DMETRICS), league_means(d1, DMETRICS)
    cols = [key, "min"] + DMETRICS + list(carry)
    a = d0[[c for c in cols if c in d0]].copy()
    b = d1[[key, "min", "age"] + DMETRICS].rename(columns={c: f"n_{c}" for c in ["min"] + DMETRICS}).rename(columns={"age": "age1"})
    p = a.merge(b, on=key)
    for c in DMETRICS:
        p[f"d_{c}"] = p[f"n_{c}"] - p[c] - (L1[c] - L0[c])
    return p


def finish(p: pd.DataFrame) -> pd.DataFrame:
    p = p.copy()
    p["hm_min"] = 2 / (1 / p["min"] + 1 / p["n_min"])
    p["band1"] = age_band(p["age1"])
    return p


def curves(p, min_cut=250, minn=25):
    q = p[(p["min"] >= min_cut) & (p["n_min"] >= min_cut)]
    out = []
    for c in DMETRICS:
        for age, d in q.dropna(subset=[f"d_{c}"]).groupby("age1"):
            if len(d) >= minn:
                out.append({"metric": c, "age": int(age), "mean": wmean(d[f"d_{c}"], d["hm_min"]), "n": len(d)})
    return pd.DataFrame(out)


def band_curves(p, min_cut=250):
    q = p[(p["min"] >= min_cut) & (p["n_min"] >= min_cut)]
    out = []
    for c in DMETRICS:
        for band, d in q.dropna(subset=[f"d_{c}"]).groupby("band1"):
            out.append({"metric": c, "band": band, "mean": wmean(d[f"d_{c}"], d["hm_min"]), "n": len(d)})
    return pd.DataFrame(out)


def heterogeneity(p, metrics=("pbpm", "ts", "plays36", "ast36", "tpar", "drb36", "blk36", "stl36", "mpg")):
    """True SD of the one-year change by age band.  Var(d | minutes) = s2_band + k*(1/m0 + 1/m1):
    band-specific intercepts, ONE pooled sampling-noise slope k per metric (stable across bands)."""
    q = p[(p["min"] >= 250) & (p["n_min"] >= 250)]
    out = []
    for c in metrics:
        d = q.dropna(subset=[f"d_{c}"]).copy()
        d = d[d.groupby("band1")["band1"].transform("size") >= 30]
        if d.empty:
            continue
        d["dev"] = d[f"d_{c}"] - d.groupby("band1")[f"d_{c}"].transform("mean")
        d["xx"] = 1 / d["min"] + 1 / d["n_min"]
        if c == "mpg":
            k = 0.0
        else:
            X = pd.get_dummies(d["band1"], dtype=float)
            X["xx"] = d["xx"]
            k = float(sm.OLS(d["dev"] ** 2, X).fit().params["xx"])
        for band, dd in d.groupby("band1"):
            s2 = float(np.mean(dd["dev"] ** 2) - k * np.mean(dd["xx"]))
            out.append({"metric": c, "band": band, "n": len(dd), "sd_true": float(np.sqrt(max(s2, 0))),
                        "sd_raw": float(np.sqrt(np.mean(dd["dev"] ** 2))), "noise_k": k})
    return pd.DataFrame(out)


def extremes(p, cut=1500):
    q = p[(p["min"] >= cut) & (p["n_min"] >= cut)].dropna(subset=["d_pbpm"])
    rows = []
    for band, d in q.groupby("band1"):
        rows.append({"band": band, "n": len(d), "p_up3": float((d["d_pbpm"] >= 3).mean()),
                     "p_dn3": float((d["d_pbpm"] <= -3).mean()), "p_up2": float((d["d_pbpm"] >= 2).mean()),
                     "p_dn2": float((d["d_pbpm"] <= -2).mean()), "sd": float(d["d_pbpm"].std()),
                     "q01": float(d["d_pbpm"].quantile(.01)), "q99": float(d["d_pbpm"].quantile(.99))})
    return pd.DataFrame(rows)


def corr_structure(p, cut=1500):
    q = p[(p["min"] >= cut) & (p["n_min"] >= cut)][[f"d_{c}" for c in CC]].dropna()
    if len(q) < 30:
        return None, {}
    c = q.corr()
    ev = np.linalg.eigvalsh(c.values)[::-1]
    off = (c.values.sum() - len(CC)) / (len(CC) * (len(CC) - 1))
    return c, {"n": len(q), "mean_offdiag": float(off), "first_eigen_share": float(ev[0] / ev.sum())}


def ability_slope(p):
    q = p[(p["min"] >= 250) & (p["n_min"] >= 250)].dropna(subset=["d_pbpm", "pbpm"])
    out = []
    for band, d in q.groupby("band1"):
        if len(d) < 30:
            continue
        fit = sm.WLS(d["d_pbpm"], sm.add_constant(d["pbpm"]), weights=d["hm_min"]).fit()
        out.append({"band": band, "slope": float(fit.params["pbpm"]), "se": float(fit.bse["pbpm"]), "n": len(d)})
    return pd.DataFrame(out)
