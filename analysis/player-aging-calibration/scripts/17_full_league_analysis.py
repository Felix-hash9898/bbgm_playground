"""Full BBGM league experiment (sim/output_full/full__2005__<arm>__<seed>.json.gz) vs the SAME real players'
actual 2005-2012 careers (Basketball-Reference panel).

Every sim league starts from the real 2005 preseason (real ratings, rosters, contracts; real draft classes
enter each year with their real rookie ratings) and runs the product's Auto Play: games, playoffs, draft,
re-signing, free agency, AI trades, retirement, injuries (incl. permanent losses), preseason development.
Only developSeason differs between arms. Seeds are paired at the start; trajectories then diverge, so
inference pools 2 seeds per arm and uses player-cluster bootstrap.

A  one-year delta curves (naive, >=250 min both seasons) vs real NBA pairs of the same seasons
B  same-player arcs: change from 2005 to 2005+k (k = 1..7) for players active in 2005, sim vs real,
   both requiring >=250 min in both seasons (selection matched player by player)
C  survival / retirement of the 2005 players and seasons played by the 2005-2008 draft classes
D  league age structure by season (minutes-weighted mean age, share of minutes at 33+ and <=22)
E  extremes (>=1500 min both seasons) and position groups
F  ecology side effects: rostered OVR level/spread, share of non-real (generated) players in minutes
Outputs: results/full_*.csv/json
"""
from __future__ import annotations

import gzip
import json

from pathlib import Path

import numpy as np
import pandas as pd

from common import OUT_DATA, RESULTS, SIM_OUT, age_band, dump_json, wmean
from profile import box_metrics, league_means

import os
FULL = Path(os.environ["FULL_DIR"]) if os.environ.get("FULL_DIR") else SIM_OUT.parent / "output_full"
M = ["pbpm", "mpg", "plays36", "pts36", "ts", "tpar", "ftr", "ast36", "tov_pct", "stl36", "blk36", "drb36", "orb36"]
BANDS = ["19-22", "23-25", "26-28", "29-31", "32-34", "35+"]
rng = np.random.default_rng(5)

# ---------------- load sim leagues
seasons_rows, players_meta, ratings_rows, dev_rows = [], [], [], []
RKEYS = ["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"]
START = None
for f in sorted(FULL.glob("full__*.json.gz")):
    d = json.load(gzip.open(f))
    arm, seed = d["arm"], d["seed"]
    START = d["start"]
    for p in d["players"]:
        players_meta.append({"arm": arm, "seed": seed, "pid": p["pid"], "srID": p["srID"], "real": p["real"], "born": p["born"],
                             "retiredYear": p["retiredYear"], "draft_year": p["draft"]["year"], "draft_pick": p["draft"]["pick"]})
        agg = {}
        for s in p["stats"]:
            a = agg.setdefault(s["season"], {k: 0.0 for k in s if k not in ("season", "tid")})
            for k, v in s.items():
                if k not in ("season", "tid"):
                    a[k] += float(v or 0)
        for season, a in agg.items():
            seasons_rows.append({"arm": arm, "seed": seed, "pid": p["pid"], "srID": p["srID"], "real": p["real"], "season": season,
                                 "age": season - p["born"], **a})
        for r in p["ratings"]:
            ratings_rows.append({"arm": arm, "seed": seed, "pid": p["pid"], "season": r["season"], "ovr": r["ovr"], "age": r["season"] - p["born"]})
        # preseason development only: last row of season s -> first row of season s+1 (excludes in-season injury rows)
        by = {}
        for r in p["ratings"]:
            by.setdefault(r["season"], []).append(r)
        for s1, rows1 in by.items():
            if s1 > START and s1 - 1 in by and not rows1[0].get("locked"):  # simulated preseasons only
                r0, r1 = by[s1 - 1][-1], rows1[0]
                dev_rows.append({"arm": arm, "seed": seed, "age": s1 - p["born"], **{f"p_{k}": r0[k] for k in RKEYS}, **{k: r1[k] for k in RKEYS}})
S = pd.DataFrame(seasons_rows)
S = S[(S["min"] > 0) & (S["season"] >= START)]  # exports include real pre-league history (realStats=allActiveHOF)
S = pd.concat([box_metrics(g) for _, g in S.groupby(["arm", "seed", "season"])], ignore_index=True)
PM = pd.DataFrame(players_meta)
RT = pd.DataFrame(ratings_rows)
RT = RT[RT["season"] >= START].groupby(["arm", "seed", "pid", "season"]).last().reset_index()
arms = sorted(S["arm"].unique())
last_sim_season = int(S["season"].max())
first_season = int(S["season"].min())

# ---------------- real panel for the same seasons (league means from the real league)
R = pd.read_parquet(OUT_DATA / "nba_player_seasons.parquet")
R = R[(R["season"] >= first_season) & (R["season"] <= last_sim_season)]
R = pd.concat([box_metrics(g) for _, g in R.groupby("season")], ignore_index=True).rename(columns={"slug": "srID"})
bios = R[["srID", "pos_group"]].drop_duplicates("srID")


def pairs_of(df, key_cols, k=1):
    lm = pd.DataFrame([{**dict(zip(key_cols + ["season"], key)), **league_means(g, M)} for key, g in df.groupby(key_cols + ["season"])])
    a = df.copy()
    b = df.assign(season=df["season"] - k)
    m = a.merge(b, on=key_cols + ["pid", "season"], suffixes=("", "_n"))
    l0 = m[key_cols + ["season"]].merge(lm, on=key_cols + ["season"], how="left")
    l1 = m[key_cols + ["season"]].assign(season=m["season"] + k).merge(lm, on=key_cols + ["season"], how="left")
    for c in M:
        m[f"d_{c}"] = m[f"{c}_n"] - m[c] - (l1[c].to_numpy() - l0[c].to_numpy())
    m["hm_min"] = 2 / (1 / m["min"] + 1 / m["min_n"])
    m["band1"] = age_band(m["age"] + k)
    return m[(m["min"] >= 250) & (m["min_n"] >= 250)]


def band_table(m, col="d_pbpm", by="band1", n_boot=500, cluster="srID"):
    out = []
    for b, d in m.groupby(by):
        keys = d[cluster].astype(str).unique()
        gi = d[cluster].astype(str).map({k: i for i, k in enumerate(keys)}).to_numpy()
        x, w = d[col].to_numpy(float), d["hm_min"].to_numpy(float)
        ok = np.isfinite(x)
        x, w, gi = x[ok], w[ok], gi[ok]
        if len(x) < 10:
            continue
        est = np.sum(x * w) / np.sum(w)
        bs = []
        for _ in range(n_boot):
            c = np.bincount(rng.integers(0, len(keys), len(keys)), minlength=len(keys))[gi]
            bs.append(np.sum(x * w * c) / max(np.sum(w * c), 1e-9))
        out.append({by: b, "mean": est, "lo": np.percentile(bs, 2.5), "hi": np.percentile(bs, 97.5), "n": len(x)})
    return pd.DataFrame(out)


# ---------------- A: one-year delta curves
A_rows = []
realA = pairs_of(R.assign(pid=R["srID"]), [], 1)
for c in ["d_pbpm", "d_mpg", "d_plays36", "d_tpar", "d_ast36", "d_stl36", "d_blk36", "d_ts"]:
    t = band_table(realA, c)
    t["world"], t["metric"] = "NBA", c
    A_rows.append(t)
simA = {}
for arm in arms:
    m = pd.concat([pairs_of(g, ["arm", "seed"], 1) for _, g in S[S["arm"] == arm].groupby("seed")], ignore_index=True)
    m["srID"] = m["srID"].fillna("gen") + ":" + m["seed"].astype(str) + ":" + m["pid"].astype(str)
    simA[arm] = m
    for c in ["d_pbpm", "d_mpg", "d_plays36", "d_tpar", "d_ast36", "d_stl36", "d_blk36", "d_ts"]:
        t = band_table(m, c)
        t["world"], t["metric"] = arm, c
        A_rows.append(t)
A = pd.concat(A_rows)
A.to_csv(RESULTS / "full_A_one_year_curves.csv", index=False)

# ---------------- B: same-player arcs from 2005 (selection matched)
B_rows = []
realL = R.set_index(["srID", "season"])
for arm in arms:
    for seed, g in S[(S["arm"] == arm) & S["srID"].notna()].groupby("seed"):
        LMs = {s: league_means(x, M) for s, x in g.groupby("season")}
        LMr = {s: league_means(x, M) for s, x in R.groupby("season")}
        base = g[g["season"] == first_season].set_index("srID")
        for k in range(1, last_sim_season - first_season + 1):
            later = g[g["season"] == first_season + k].set_index("srID")
            ids = base.index.intersection(later.index)
            for sid in ids:
                if (sid, first_season) not in realL.index or (sid, first_season + k) not in realL.index:
                    continue
                s0, s1 = base.loc[sid], later.loc[sid]
                r0, r1 = realL.loc[(sid, first_season)], realL.loc[(sid, first_season + k)]
                if min(s0["min"], s1["min"], r0["min"], r1["min"]) < 250:
                    continue
                row = {"arm": arm, "seed": seed, "srID": sid, "k": k, "age0": int(s0["age"]), "hm_min": 2 / (1 / s1["min"] + 1 / r1["min"])}
                for c in ["pbpm", "mpg", "plays36", "tpar", "ast36"]:
                    ds = s1[c] - s0[c] - (LMs[first_season + k][c] - LMs[first_season][c])
                    dr = r1[c] - r0[c] - (LMr[first_season + k][c] - LMr[first_season][c])
                    row[f"sim_{c}"], row[f"real_{c}"], row[f"bias_{c}"] = ds, dr, ds - dr
                B_rows.append(row)
B = pd.DataFrame(B_rows)
B["band0"] = age_band(B["age0"])
B.to_csv(RESULTS / "full_B_same_player_arcs_rows.csv", index=False)
Bt = []
for arm in arms:
    for (k, b), d in B[B["arm"] == arm].groupby(["k", "band0"]):
        Bt.append({"arm": arm, "k": k, "band0": b, "n": len(d), "real": wmean(d["real_pbpm"], d["hm_min"]), "sim": wmean(d["sim_pbpm"], d["hm_min"]),
                   "bias": wmean(d["bias_pbpm"], d["hm_min"]), "bias_mpg": wmean(d["bias_mpg"], d["hm_min"]),
                   "bias_plays36": wmean(d["bias_plays36"], d["hm_min"]), "bias_tpar": wmean(d["bias_tpar"], d["hm_min"])})
Bt = pd.DataFrame(Bt)
Bt.to_csv(RESULTS / "full_B_same_player_arcs.csv", index=False)
# pooled across k with cluster bootstrap by player
Bp = []
for arm in arms:
    t = band_table(B[B["arm"] == arm].assign(band1=lambda x: x["band0"]), "bias_pbpm")
    t["arm"] = arm
    Bp.append(t)
Bp = pd.concat(Bp)
Bp.to_csv(RESULTS / "full_B_bias_by_start_age.csv", index=False)

# ---------------- C: survival and retirement of 2005 players; draft-class careers
real_active = R.groupby("srID")["season"].apply(set)
C_rows = []
p05 = PM[(PM["srID"].notna())]
s05 = S[(S["season"] == first_season) & S["srID"].notna() & (S["min"] >= 100)]
for arm in arms:
    for seed, g in S[S["arm"] == arm].groupby("seed"):
        start = s05[(s05["arm"] == arm) & (s05["seed"] == seed)]
        played = g.groupby("srID")["season"].apply(set)
        for k in range(1, last_sim_season - first_season + 1):
            for b, d in start.groupby(age_band(start["age"])):
                ids = d["srID"]
                sim_alive = np.mean([first_season + k in played.get(i, set()) for i in ids])
                real_alive = np.mean([first_season + k in real_active.get(i, set()) for i in ids])
                C_rows.append({"arm": arm, "seed": seed, "k": k, "band0": b, "n": len(ids), "sim_alive": sim_alive, "real_alive": real_alive})
C = pd.DataFrame(C_rows)
C.to_csv(RESULTS / "full_C_survival.csv", index=False)
Cs = C.groupby(["arm", "band0", "k"])[["sim_alive", "real_alive", "n"]].mean().reset_index()
# seasons played through the window by real draftees 2005-2008 (enter with real rookie ratings)
D_rows = []
for arm in arms:
    for seed, g in S[(S["arm"] == arm) & S["srID"].notna()].groupby("seed"):
        meta = PM[(PM["arm"] == arm) & (PM["seed"] == seed) & PM["srID"].notna()]
        for dy in range(first_season, first_season + 4):
            ids = meta.loc[meta["draft_year"] == dy, "srID"]
            ids = [i for i in ids if i in real_active.index or i in set(g["srID"])]
            sim_n = [len({s for s in g.loc[g["srID"] == i, "season"] if s > dy}) for i in ids]
            real_n = [len({s for s in real_active.get(i, set()) if dy < s <= last_sim_season}) for i in ids]
            D_rows.append({"arm": arm, "seed": seed, "draft_year": dy, "n": len(ids), "sim_seasons": float(np.mean(sim_n)), "real_seasons": float(np.mean(real_n)),
                           "sim_min_total": float(g[g["srID"].isin(ids) & (g["season"] > dy)]["min"].sum() / max(len(ids), 1)),
                           "real_min_total": float(R[R["srID"].isin(ids) & (R["season"] > dy)]["min"].sum() / max(len(ids), 1))})
Dd = pd.DataFrame(D_rows)
Dd.to_csv(RESULTS / "full_C_draft_classes.csv", index=False)

# ---------------- D: age structure per season
agerows = []
for (w, seed, season), g in pd.concat([S.assign(w=S["arm"]), R.assign(w="NBA", seed=0)]).groupby(["w", "seed", "season"]):
    if season == first_season:
        continue
    tot = g["min"].sum()
    agerows.append({"world": w, "seed": seed, "season": season, "mean_age": float(np.average(g["age"], weights=g["min"])),
                    "share_ge33": float(g.loc[g["age"] >= 33, "min"].sum() / tot), "share_le22": float(g.loc[g["age"] <= 22, "min"].sum() / tot),
                    "share_ge35": float(g.loc[g["age"] >= 35, "min"].sum() / tot)})
AG = pd.DataFrame(agerows)
AG.to_csv(RESULTS / "full_D_age_structure.csv", index=False)

# ---------------- E: extremes and position groups (one-year pairs)
E_rows, G_rows = [], []
worlds = {"NBA": realA, **simA}
for w, m in worlds.items():
    big = m[(m["min"] >= 1500) & (m["min_n"] >= 1500)]
    for b, d in big.groupby("band1"):
        E_rows.append({"world": w, "band": b, "n": len(d), "p_up3": float((d["d_pbpm"] >= 3).mean()), "p_dn3": float((d["d_pbpm"] <= -3).mean()),
                       "sd": float(d["d_pbpm"].std())})
    mm = m.copy()
    mm["sid"] = mm["srID"].astype(str).str.split(":").str[0]
    mm = mm.drop(columns=[c for c in mm.columns if c.startswith("pos_group")]).merge(bios.rename(columns={"srID": "sid"}), on="sid", how="left")
    for (pg, b), d in mm.dropna(subset=["pos_group"]).groupby(["pos_group", "band1"]):
        G_rows.append({"world": w, "pos_group": pg, "band": b, "n": len(d), "d_pbpm": wmean(d["d_pbpm"], d["hm_min"]),
                       "d_mpg": wmean(d["d_mpg"], d["hm_min"])})
pd.DataFrame(E_rows).to_csv(RESULTS / "full_E_extremes.csv", index=False)
pd.DataFrame(G_rows).to_csv(RESULTS / "full_E_position_groups.csv", index=False)

# ---------------- F: ecology
eco = []
for (arm, seed, season), g in S.groupby(["arm", "seed", "season"]):
    rr = RT[(RT["arm"] == arm) & (RT["seed"] == seed) & (RT["season"] == season)].merge(g[["pid", "min"]], on="pid")
    eco.append({"arm": arm, "seed": seed, "season": season, "players_with_minutes": len(g),
                "ovr_mean_minw": float(np.average(rr["ovr"], weights=rr["min"])) if len(rr) else np.nan,
                "ovr_sd_rostered": float(rr["ovr"].std()) if len(rr) else np.nan,
                "share_min_nonreal": float(g.loc[g["srID"].isna(), "min"].sum() / g["min"].sum())})
pd.DataFrame(eco).to_csv(RESULTS / "full_F_ecology.csv", index=False)

# ---------------- G: verify the vi.mock formula swap (observed preseason changes vs the arm's own formula)
from cand_specs import OFFICIAL, PLAYGROUND, develop_spec
from bbgm_dev import KEYS as DKEYS
from common import HERE as _HERE
SPECS = {"official": OFFICIAL, "playground": PLAYGROUND, **json.loads((_HERE / "sim/formulas/candidate_specs.json").read_text())}
DV = pd.DataFrame(dev_rows)
ver = []
grng = np.random.default_rng(11)
for arm, d in DV.groupby("arm"):
    d = d[d["age"].between(20, 36)]
    R0 = {k: np.repeat(d[f"p_{k}"].to_numpy(float), 20) for k in RKEYS}
    ages = np.repeat(d["age"].to_numpy(), 20)
    for form in sorted({arm, "official", "playground"}):
        R1 = develop_spec(R0, ages, grng, SPECS[form])
        for lo, hi in [(20, 23), (24, 28), (29, 32), (33, 36)]:
            m = (d["age"] >= lo) & (d["age"] <= hi)
            mm = np.repeat(m.to_numpy(), 20)
            for k in ["stre", "spd", "tp", "oiq"]:
                obs = (d.loc[m, k] - d.loc[m, f"p_{k}"]).to_numpy(float)
                ver.append({"arm": arm, "formula": form, "ages": f"{lo}-{hi}", "rating": k, "obs": obs.mean(),
                            "pred": float((R1[k] - R0[k])[mm].mean()), "se": obs.std() / np.sqrt(len(obs))})
VER = pd.DataFrame(ver)
VER["z"] = (VER["obs"] - VER["pred"]) / VER["se"]
VER.to_csv(RESULTS / "full_G_formula_swap_check.csv", index=False)
fit = VER.groupby(["arm", "formula"])["z"].apply(lambda z: float(np.sqrt(np.mean(z ** 2)))).unstack()
fit.to_csv(RESULTS / "full_G_formula_swap_rms_z.csv")
print("formula swap check (RMS z; the arm's own formula should fit best; coaching levels not modelled):")
print(fit.round(2))

summary = {"arms": arms, "seeds": sorted(map(int, S["seed"].unique())), "seasons": [first_season, last_sim_season],
           "same_player_arc_rows": int(len(B)),
           "rmse_bias_by_start_age": {arm: float(np.sqrt(np.average(Bp[Bp.arm == arm]["mean"] ** 2, weights=Bp[Bp.arm == arm]["n"]))) for arm in arms}}
dump_json(summary, RESULTS / "full_summary.json")
pd.set_option("display.width", 250)
print(A[A.metric == "d_pbpm"].pivot_table(index="band1", columns="world", values="mean").round(2))
print(Bp.pivot_table(index="band1", columns="arm", values=["mean", "lo", "hi"]).round(2).to_string())
print(Cs.pivot_table(index=["band0", "k"], columns="arm", values="sim_alive").join(Cs[Cs.arm == arms[0]].set_index(["band0", "k"])["real_alive"]).round(2).to_string())
print(Dd.groupby("arm")[["sim_seasons", "real_seasons", "sim_min_total", "real_min_total"]].mean().round(1))
print(AG.groupby("world")[["mean_age", "share_ge33", "share_le22", "share_ge35"]].mean().round(3))
print(pd.DataFrame(eco).groupby("arm")[["ovr_mean_minw", "ovr_sd_rostered", "share_min_nonreal"]].agg(["first", "last"]).round(2))
print(summary)
