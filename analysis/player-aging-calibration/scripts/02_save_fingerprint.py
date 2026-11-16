"""Fingerprint which development formula produced the simulated progs inside the user's saves,
and extract an observational BBGM-world panel (ratings + regular-season stats) from them.

For each save and each simulated offseason (season s > startingSeason), the observed mean change of
stre/spd/jmp/oiq/tp at ages 26-35 is compared with the change predicted for the SAME starting rows by
the Official and the Playground ports (Monte Carlo, 40 draws per row).  The two formulas differ most
in stre (Official ageMod 0 vs Playground +1..+1.5) and spd/jmp at 27-32.
Outputs: results/save_fingerprint.csv, data/save_panel.parquet
Read-only: saves are opened with gzip and never written.
"""
from __future__ import annotations

import gzip
import json
import sys

import numpy as np
import pandas as pd

from bbgm_dev import KEYS, develop_season
from common import OUT_DATA, RESULTS, SAVES, bbgm_ovr

LONG_SAVES = [
    "BBGM_League_7_2020_regular_season_4-0.json.gz",  # start 2007
    "BBGM_League_10_2028_draft.json.gz",  # start 2015
    "BBGM_League_6_2029_free_agency.json.gz",  # start 2017
    "BBGM_League_9_2022_re_sign_players.json.gz",  # start 2015
    "BBGM_League_3_2025_re_sign_players.json.gz",  # start 2018
]
rng = np.random.default_rng(20261116)
fp_rows, panel = [], []
for f in LONG_SAVES:
    d = json.load(gzip.open(SAVES / f))
    ga = d["gameAttributes"]
    ga = {x["key"]: x["value"] for x in ga} if isinstance(ga, list) else ga
    start, cur = ga["startingSeason"], ga["season"]
    teams_games = ga.get("numGames", 82)
    for p in d["players"]:
        born = p["born"]["year"]
        rr = {r["season"]: r for r in p["ratings"] if not r.get("locked")}
        st = {}
        for s in p.get("stats", []):
            if s.get("playoffs"):
                continue
            k = s["season"]
            agg = st.setdefault(k, {c: 0.0 for c in ["gp", "gs", "min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "pf", "ows", "dws", "obpm_x", "dbpm_x", "per_x"]})
            for c in ["gp", "gs", "min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "pf", "ows", "dws"]:
                agg[c] += float(s.get(c, 0) or 0)
            m = float(s.get("min", 0) or 0)
            agg["obpm_x"] += float(s.get("obpm", 0) or 0) * m
            agg["dbpm_x"] += float(s.get("dbpm", 0) or 0) * m
            agg["per_x"] += float(s.get("per", 0) or 0) * m
            agg["tid_last"] = s.get("tid")
        for season, r in rr.items():
            row = {"save": f, "pid": p["pid"], "srID": p.get("srID"), "season": season, "age": season - born,
                   "simulated_rating": season > start, "start": start, "draft_year": p["draft"]["year"],
                   "tid_now": p["tid"], "retired_year": p.get("retiredYear"), "pos": r.get("pos"),
                   "ovr_stored": r.get("ovr"), "pot_stored": r.get("pot"), "injury_games": None}
            row.update({k: r[k] for k in ["hgt"] + KEYS})
            if season in st:
                row.update(st[season])
            panel.append(row)
pan = pd.DataFrame(panel)
pan = pan[pan["season"] <= pan.groupby("save")["season"].transform("max")]
pan["ovr"] = bbgm_ovr(pan)
for c in ["obpm", "dbpm", "per"]:
    pan[c] = pan[f"{c}_x"] / pan["min"].replace(0, np.nan)
pan.drop(columns=[c for c in pan.columns if c.endswith("_x")], inplace=True)
pan.to_parquet(OUT_DATA / "save_panel.parquet", index=False)

# consecutive simulated offseasons
pan = pan.sort_values(["save", "pid", "season"])
prev = pan.groupby(["save", "pid"]).shift(1)
pair = pan[(prev["season"] == pan["season"] - 1) & pan["simulated_rating"]].copy()
for k in ["hgt"] + KEYS:
    pair[f"p_{k}"] = prev.loc[pair.index, k]
for (f, s), grp in pair.groupby(["save", "season"]):
    grp = grp[(grp["age"] >= 26) & (grp["age"] <= 35)]
    if len(grp) < 60:
        continue
    R0 = {k: np.repeat(grp[f"p_{k}"].to_numpy(float), 40) for k in ["hgt"] + KEYS}
    ages = np.repeat(grp["age"].to_numpy(), 40)
    res = {"save": f, "season": int(s), "n": len(grp)}
    sse = {}
    for form in ["official", "playground"]:
        R1 = develop_season(R0, ages, rng, form)
        sse[form] = 0.0
        for k in ["stre", "spd", "jmp", "oiq", "tp"]:
            pred = (R1[k] - R0[k]).reshape(-1, 40).mean(1)
            obs = grp[k].to_numpy(float) - grp[f"p_{k}"].to_numpy(float)
            res[f"{form}_{k}"] = round(float(pred.mean()), 3)
            res[f"obs_{k}"] = round(float(obs.mean()), 3)
            res[f"se_{k}"] = round(float(obs.std() / np.sqrt(len(obs))), 3)
            sse[form] += ((obs.mean() - pred.mean()) / max(obs.std() / np.sqrt(len(obs)), 1e-6)) ** 2
    res["chi2_official"], res["chi2_playground"] = round(sse["official"], 1), round(sse["playground"], 1)
    res["verdict"] = "official" if sse["official"] < sse["playground"] else "playground"
    if min(sse.values()) > 30:
        res["verdict"] += "?(neither fits)"
    fp_rows.append(res)
fp = pd.DataFrame(fp_rows)
fp.to_csv(RESULTS / "save_fingerprint.csv", index=False)
pd.set_option("display.width", 250)
print(fp[["save", "season", "n", "obs_stre", "official_stre", "playground_stre", "obs_spd", "official_spd", "playground_spd", "chi2_official", "chi2_playground", "verdict"]].to_string())
