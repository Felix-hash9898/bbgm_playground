"""Round-2 step design analysis (sim/output/step2__*): fixed common sample, three environment corrections,
strict paired comparisons with player-cluster bootstrap CIs, same-player test on hold-out seasons, and
noise decomposition validated three ways.

Design facts used: (1) 30% of players (hash of save|pid) are never developed in any arm = DiD controls;
(2) developed ratings are identical across the 3 game seeds of an arm (dev RNG seeded by save only), so
Cov(delta_seed_i, delta_seed_j), i != j, is the noise-free variance of the development effect;
(3) every season total also has an odd/even-appearance split, as do the NBA game logs.

Environment corrections for the league-relative pseudo-BPM change of a developed player:
  zero : none
  beta : + beta * wmean(delta ovr of ALL players)   (round-1 method; beta from the 'none' cross-section)
  did  : - wmean(delta of CONTROL players in the same save x seed x arm)   (independent, no model)
Outputs: results/step2_*.csv/json, data/step2_pairs.parquet
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import statsmodels.api as sm

from common import OUT_DATA, RESULTS, SIM_OUT, age_band, dump_json, wmean
from profile import CC, DMETRICS, box_metrics, league_means, read_gz_csv

rng = np.random.default_rng(7)
BANDS = ["19-22", "23-25", "26-28", "29-31", "32-34", "35+"]
SAVE_SEASON = {"BBGM_League_11_2022_preseason.json.gz": 2022, "BBGM_League_10_2023_preseason.json.gz": 2023,
               "BBGM_League_9_2024_preseason.json.gz": 2024, "BBGM_League_8_2025_preseason.json.gz": 2025,
               "BBGM_League_8_2026_preseason.json.gz": 2026}
M = ["pbpm", "mpg", "plays36", "pts36", "ts", "tpar", "ftr", "ast36", "tov_pct", "stl36", "blk36", "drb36", "orb36"]


def halves(df, h):
    """Box metrics computed on one split half (h1_* columns, or total minus h1)."""
    d = df.copy()
    cols = ["gp", "min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "ast", "tov", "stl", "blk", "pf"]
    for c in cols:
        d[c] = df[f"h1_{c}"] if h == 1 else df[c] - df[f"h1_{c}"]
    return box_metrics(d)


raw = pd.concat([read_gz_csv(f) for f in sorted(SIM_OUT.glob("step2__*.csv.gz"))], ignore_index=True)
raw["age"] = raw["age_sim"]
arms = [a for a in raw["arm"].unique() if a != "none"]
runs, runs_h = {}, {}
for k, g in raw.groupby(["save", "arm", "seed"]):
    runs[k] = box_metrics(g)
    runs_h[k] = (halves(g, 1), halves(g, 2))

# ---------------- pairs per (save, seed, arm) with three env corrections
P = []
for (save, arm, seed), d1 in runs.items():
    if arm == "none":
        continue
    d0 = runs[(save, "none", seed)]
    L0, L1 = league_means(d0, M), league_means(d1, M)
    a = d0[["pid", "srID", "min", "ovr", "age", "control", "r_hgt"] + M].merge(
        d1[["pid", "min", "ovr", "age"] + M].rename(columns={c: f"n_{c}" for c in ["min", "ovr", "age"] + M}), on="pid")
    for c in M:
        a[f"d_{c}"] = a[f"n_{c}"] - a[c] - (L1[c] - L0[c])
    # split-half deltas (for NBA-comparable noise estimates and noise-free cross-skill covariances)
    for h in (1, 2):
        h0, h1 = runs_h[(save, "none", seed)][h - 1], runs_h[(save, arm, seed)][h - 1]
        Lh0, Lh1 = league_means(h0, M), league_means(h1, M)
        hh = h0[["pid"] + M].merge(h1[["pid"] + M], on="pid", suffixes=("", "_n"))
        for c in M:
            hh[f"dh{h}_{c}"] = hh[f"{c}_n"] - hh[c] - (Lh1[c] - Lh0[c])
        a = a.merge(hh[["pid"] + [f"dh{h}_{c}" for c in M]], on="pid", how="left")
    b0 = d0[d0["min"] >= 500]
    beta = sm.WLS(b0["pbpm"], sm.add_constant(b0["ovr"]), weights=b0["min"]).fit().params["ovr"]
    a["d_ovr"] = a["n_ovr"] - a["ovr"]
    w_all = (a["min"] + a["n_min"]) / 2
    ctl = a[(a["control"] == 1) & (a["min"] >= 250) & (a["n_min"] >= 250)]
    for c in M:
        a[f"d_{c}_zero"] = a[f"d_{c}"]
        a[f"d_{c}_did"] = a[f"d_{c}"] - wmean(ctl[f"d_{c}"], 2 / (1 / ctl["min"] + 1 / ctl["n_min"]))
    a["d_pbpm_beta"] = a["d_pbpm"] + beta * wmean(a["d_ovr"], w_all)
    a["beta"], a["env_did_pbpm"] = beta, wmean(ctl["d_pbpm"], 2 / (1 / ctl["min"] + 1 / ctl["n_min"]))
    a["save"], a["arm"], a["seed"] = save, arm, seed
    P.append(a)
P = pd.concat(P, ignore_index=True)
P["band1"] = age_band(P["n_age"])
P["hm_min"] = 2 / (1 / P["min"] + 1 / P["n_min"])
P.to_parquet(OUT_DATA / "step2_pairs.parquet", index=False)
env = P.groupby(["arm"]).agg(beta=("beta", "mean"), env_did_pbpm=("env_did_pbpm", "mean")).reset_index()
env["env_beta_pbpm"] = P.groupby("arm").apply(lambda d: (d["d_pbpm_beta"] - d["d_pbpm_zero"]).mean(), include_groups=False).values
env.to_csv(RESULTS / "step2_env_corrections.csv", index=False)

# ---------------- FIXED common sample: developed players with >=250 min in both seasons in EVERY arm and seed
ok = (P["control"] == 0) & (P["min"] >= 250) & (P["n_min"] >= 250)
cnt = P[ok].groupby(["save", "pid"]).size()
need = len(arms) * P["seed"].nunique()
common = set(cnt[cnt == need].index)
Q = P[ok & pd.Series(list(zip(P["save"], P["pid"]))).isin(common).values].copy()
# player-level mean over seeds (same developed ratings in every seed)
agg = {f"d_{c}_{e}": "mean" for c in M for e in ["zero", "did"]}
agg.update({"d_pbpm_beta": "mean", "hm_min": "mean", "n_age": "first", "srID": "first", "r_hgt": "first", "pbpm": "mean", "mpg": "mean"})
PL = Q.groupby(["arm", "save", "pid"]).agg(agg).reset_index()
PL["band1"] = age_band(PL["n_age"])
PL["season"] = PL["save"].map(SAVE_SEASON)


def boot_band_means(df, col, n=1000, cluster="pid_key"):
    """Weighted band means with player-cluster bootstrap 95% CI."""
    out = {}
    df = df.assign(pid_key=df["save"] + ":" + df["pid"].astype(str))
    for b, d in df.groupby("band1"):
        keys = d["pid_key"].unique()
        idx = {k: i for i, k in enumerate(keys)}
        gi = d["pid_key"].map(idx).to_numpy()
        x, w = d[col].to_numpy(float), d["hm_min"].to_numpy(float)
        est = np.sum(x * w) / np.sum(w)
        bs = []
        for _ in range(n):
            pick = rng.integers(0, len(keys), len(keys))
            cntk = np.bincount(pick, minlength=len(keys))[gi]
            bs.append(np.sum(x * w * cntk) / np.sum(w * cntk))
        out[b] = (est, *np.percentile(bs, [2.5, 97.5]), len(keys))
    return out


# ---------------- (a) arm curves under each correction + paired arm differences
rows = []
for arm in arms:
    for e, col in [("zero", "d_pbpm_zero"), ("beta", "d_pbpm_beta"), ("did", "d_pbpm_did")]:
        for b, (m, lo, hi, n) in boot_band_means(PL[PL["arm"] == arm], col).items():
            rows.append({"arm": arm, "correction": e, "band": b, "mean": m, "lo": lo, "hi": hi, "n": n})
curves = pd.DataFrame(rows)
curves.to_csv(RESULTS / "step2_curves_by_correction.csv", index=False)
pair_rows = []
wide = PL.pivot_table(index=["save", "pid", "band1"], columns="arm", values="d_pbpm_did").reset_index()
wide = wide.merge(PL[PL["arm"] == "playground"][["save", "pid", "hm_min"]], on=["save", "pid"])
for x, y in [("playground", "official"), ("A2r", "playground"), ("B2", "A2r"), ("pg_stre", "playground"), ("pg_diq", "playground"),
             ("A2r_stre", "A2r"), ("A2r", "official")]:
    if x not in wide or y not in wide:
        continue
    d = wide.assign(diff=wide[x] - wide[y])
    for b, (m, lo, hi, n) in boot_band_means(d, "diff").items():
        pair_rows.append({"contrast": f"{x}-{y}", "band": b, "mean": m, "lo": lo, "hi": hi, "n": n})
pd.DataFrame(pair_rows).to_csv(RESULTS / "step2_paired_contrasts.csv", index=False)

# ---------------- (b) same-player test on hold-out seasons (game-log panel 2022-2026; 2026 never used anywhere)
gls = pd.read_parquet(OUT_DATA / "nba_gamelog_seasons.parquet").dropna(subset=["slug"])
gls = pd.concat([box_metrics(g.assign(gp=g["gp"])) for _, g in gls.groupby("season")], ignore_index=True)
LM = {s: league_means(d, M) for s, d in gls.groupby("season")}
real = gls[["slug", "season", "min"] + M].merge(gls[["slug", "season", "min"] + M].assign(season=lambda d: d["season"] - 1),
                                               on=["slug", "season"], suffixes=("", "_n"))
for c in M:
    real[f"real_{c}"] = real[f"{c}_n"] - real[c] - real["season"].map(lambda s: LM[s + 1][c] - LM[s][c])
real = real[(real["min"] >= 250) & (real["min_n"] >= 250)]
SP = PL.merge(real[["slug", "season"] + [f"real_{c}" for c in M]], left_on=["srID", "season"], right_on=["slug", "season"])
# common across arms
cntp = SP.groupby(["save", "pid"])["arm"].nunique()
SP = SP[SP.set_index(["save", "pid"]).index.isin(cntp[cntp == len(arms)].index)]
srows = []
for arm in arms:
    for c in M:
        d = SP[SP["arm"] == arm].assign(diff=lambda x: x[f"d_{c}_did"] - x[f"real_{c}"])
        for b, (m, lo, hi, n) in boot_band_means(d, "diff", n=600).items():
            srows.append({"arm": arm, "metric": c, "band": b, "bias": m, "lo": lo, "hi": hi, "n": n,
                          "real": wmean(d.loc[d["band1"] == b, f"real_{c}"], d.loc[d["band1"] == b, "hm_min"]),
                          "sim": wmean(d.loc[d["band1"] == b, f"d_{c}_did"], d.loc[d["band1"] == b, "hm_min"])})
SB = pd.DataFrame(srows)
SB.to_csv(RESULTS / "step2_same_player.csv", index=False)
# overall pbpm RMSE across bands, under each environment correction, and a PAIRED bootstrap (the same
# resampled players for every arm) of RMSE differences vs Playground
spb = SP.assign(pid_key=SP["save"] + ":" + SP["pid"].astype(str))
keys = spb["pid_key"].unique()
kidx = {k: i for i, k in enumerate(keys)}
ARR = {}
for arm in arms:
    d = spb[spb["arm"] == arm].set_index("pid_key").loc[keys]
    for e, col in [("zero", "d_pbpm_zero"), ("beta", "d_pbpm_beta"), ("did", "d_pbpm_did")]:
        ARR[(arm, e)] = (d[col].to_numpy() - d["real_pbpm"].to_numpy(), d["hm_min"].to_numpy(), d["band1"].to_numpy())


def rmse_from(diff, w, band, cnt):
    ms, ns = [], []
    for b in BANDS:
        m = (band == b) & (cnt > 0)
        if m.sum() == 0:
            continue
        ww = w[m] * cnt[m]
        ms.append(np.sum(diff[m] * ww) / np.sum(ww))
        ns.append(cnt[m].sum())
    return float(np.sqrt(np.average(np.square(ms), weights=ns)))


B = 1000
counts = [np.bincount(rng.integers(0, len(keys), len(keys)), minlength=len(keys)) for _ in range(B)]
ones = np.ones(len(keys))
rm = []
for e in ["zero", "beta", "did"]:
    base = np.array([rmse_from(*ARR[("playground", e)], c) for c in counts])
    for arm in arms:
        bs = np.array([rmse_from(*ARR[(arm, e)], c) for c in counts])
        dlt = bs - base
        rm.append({"correction": e, "arm": arm, "rmse": rmse_from(*ARR[(arm, e)], ones), "delta_vs_playground": float(np.median(dlt)),
                   "delta_lo": float(np.percentile(dlt, 2.5)), "delta_hi": float(np.percentile(dlt, 97.5)),
                   "p_better_than_playground": float((dlt < 0).mean()), "players": len(keys)})
pd.DataFrame(rm).to_csv(RESULTS / "step2_same_player_rmse.csv", index=False)
# hold-out-only subset: the 2025 save (pair 2025 -> 2026, a season unseen by every analysis)
SB26 = []
for arm in arms:
    d = SP[(SP["arm"] == arm) & (SP["season"] == 2025)]
    SB26.append({"arm": arm, "n": len(d), "bias_pbpm_all_ages": float(np.average(d["d_pbpm_did"] - d["real_pbpm"], weights=d["hm_min"])),
                 "bias_le25": float(np.average((d["d_pbpm_did"] - d["real_pbpm"])[d["n_age"] <= 25], weights=d["hm_min"][d["n_age"] <= 25])),
                 "bias_ge30": float(np.average((d["d_pbpm_did"] - d["real_pbpm"])[d["n_age"] >= 30], weights=d["hm_min"][d["n_age"] >= 30]))})
pd.DataFrame(SB26).to_csv(RESULTS / "step2_same_player_2026.csv", index=False)

# ---------------- (c) noise decomposition (sim) validated three ways
nd = []
for arm in ["none_noise"] + arms:
    if arm == "none_noise":
        continue
    d = P[(P["arm"] == arm) & (P["control"] == 0) & (P["min"] >= 250) & (P["n_min"] >= 250)]
    for b, db in d.groupby("band1"):
        w = db.pivot_table(index=["save", "pid"], columns="seed", values="d_pbpm_did")
        w = w.dropna()
        if len(w) < 30:
            continue
        cs = w.columns
        covs = [np.cov(w[cs[i]], w[cs[j]])[0, 1] for i in range(len(cs)) for j in range(i + 1, len(cs))]
        tot = float(np.mean([w[c].var() for c in cs]))
        # split-half estimator on the same rows: noise var of delta = Var(dh1 - dh2)/4 * ... (each half has half the minutes)
        dh = db.dropna(subset=["dh1_pbpm", "dh2_pbpm"])
        noise_sh = float(np.var(dh["dh1_pbpm"] - dh["dh2_pbpm"]) / 4)
        nd.append({"arm": arm, "band": b, "n": len(w), "sd_total": np.sqrt(tot), "sd_signal_crossseed": float(np.sqrt(max(np.mean(covs), 0))),
                   "sd_signal_splithalf": float(np.sqrt(max(tot - noise_sh, 0))), "sd_noise_splithalf": np.sqrt(noise_sh)})
ND = pd.DataFrame(nd)
ND.to_csv(RESULTS / "step2_noise_decomposition.csv", index=False)

# NBA game-log pairs: split-half true SD (same estimator) for the same age bands
gl_h = pd.read_parquet(OUT_DATA / "nba_gamelog_seasons.parquet").dropna(subset=["slug"])
rowsn = []
H = {}
for h in (1, 2):
    dd = gl_h.copy()
    for c in ["gp", "min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "pf"]:
        dd[c] = gl_h[f"h{h}_{c}"]
    H[h] = pd.concat([box_metrics(g) for _, g in dd.groupby("season")], ignore_index=True)
full = gls
pairs_n = full[["slug", "season", "age", "min"] + M].merge(full[["slug", "season", "min"] + M].assign(season=lambda d: d["season"] - 1),
                                                         on=["slug", "season"], suffixes=("", "_n"))
for c in M:
    pairs_n[f"d_{c}"] = pairs_n[f"{c}_n"] - pairs_n[c] - pairs_n["season"].map(lambda s: LM[s + 1][c] - LM[s][c])
for h in (1, 2):
    Hh = H[h]
    LMh = {s: league_means(d, M) for s, d in Hh.groupby("season")}
    x = Hh[["slug", "season"] + M].merge(Hh[["slug", "season"] + M].assign(season=lambda d: d["season"] - 1), on=["slug", "season"], suffixes=("", "_n"))
    for c in M:
        x[f"dh{h}_{c}"] = x[f"{c}_n"] - x[c] - x["season"].map(lambda s: LMh[s + 1][c] - LMh[s][c])
    pairs_n = pairs_n.merge(x[["slug", "season"] + [f"dh{h}_{c}" for c in M]], on=["slug", "season"], how="left")
pairs_n = pairs_n[(pairs_n["min"] >= 250) & (pairs_n["min_n"] >= 250)]
pairs_n["band1"] = age_band(pairs_n["age"] + 1)
for b, db in pairs_n.dropna(subset=["dh1_pbpm", "dh2_pbpm"]).groupby("band1"):
    tot = float(db["d_pbpm"].var())
    noise = float(np.var(db["dh1_pbpm"] - db["dh2_pbpm"]) / 4)
    cross = float(np.cov(db["dh1_pbpm"], db["dh2_pbpm"])[0, 1])
    rowsn.append({"band": b, "n": len(db), "sd_total": np.sqrt(tot), "sd_signal_splithalf": np.sqrt(max(tot - noise, 0)),
                  "sd_signal_crosshalf": np.sqrt(max(cross, 0)), "sd_noise_splithalf": np.sqrt(noise)})
NN = pd.DataFrame(rowsn)
NN.to_csv(RESULTS / "nba_gamelog_noise_decomposition.csv", index=False)

# ---------------- (d) noise-free cross-skill correlation of changes (cross-half covariances), sim vs NBA
def crosshalf_corr(df, cols):
    d = df.dropna(subset=[f"dh1_{c}" for c in cols] + [f"dh2_{c}" for c in cols])
    C = np.zeros((len(cols), len(cols)))
    for i, a in enumerate(cols):
        for j, b in enumerate(cols):
            C[i, j] = 0.5 * (np.cov(d[f"dh1_{a}"], d[f"dh2_{b}"])[0, 1] + np.cov(d[f"dh2_{a}"], d[f"dh1_{b}"])[0, 1])
    sd = np.sqrt(np.clip(np.diag(C), 1e-12, None))
    R = np.clip(C / np.outer(sd, sd), -1, 1)
    off = R[~np.eye(len(cols), dtype=bool)]
    return float(np.mean(off)), float(np.mean(np.abs(off))), len(d)


CCm = ["ts", "tpar", "ftr", "ast36", "tov_pct", "orb36", "drb36", "stl36", "blk36", "plays36"]
cr = [{"world": "NBA 2022-26", **dict(zip(["mean_offdiag", "mean_abs_offdiag", "n"], crosshalf_corr(pairs_n[pairs_n["min"] >= 1000], CCm)))}]
for arm in arms:
    d = P[(P["arm"] == arm) & (P["control"] == 0) & (P["min"] >= 1000) & (P["n_min"] >= 1000)]
    cr.append({"world": arm, **dict(zip(["mean_offdiag", "mean_abs_offdiag", "n"], crosshalf_corr(d, CCm)))})
# second set: the six volume/rate stats that also carry signal for undeveloped CONTROL players, so the
# co-movement created by GameSim role/environment coupling (controls) can be separated from development
CC6 = ["ast36", "orb36", "drb36", "stl36", "blk36", "plays36"]
cr.append({"world": "NBA 2022-26 [6 stats]", **dict(zip(["mean_offdiag", "mean_abs_offdiag", "n"], crosshalf_corr(pairs_n[pairs_n["min"] >= 1000], CC6)))})
for arm in arms:
    for ctl in (0, 1):
        d = P[(P["arm"] == arm) & (P["control"] == ctl) & (P["min"] >= 1000) & (P["n_min"] >= 1000)]
        cr.append({"world": f"{arm} [6 stats] {'control (no development)' if ctl else 'developed'}",
                   **dict(zip(["mean_offdiag", "mean_abs_offdiag", "n"], crosshalf_corr(d, CC6)))})
pd.DataFrame(cr).to_csv(RESULTS / "step2_signal_corr.csv", index=False)

# ---------------- (e) extremes on the common sample (observed single-season deltas, >=1500 min both, NBA game-log pairs)
ex = []
for arm in arms:
    d = Q[(Q["arm"] == arm) & (Q["min"] >= 1500) & (Q["n_min"] >= 1500)]
    for b, db in d.groupby("band1"):
        ex.append({"world": arm, "band": b, "n": len(db), "p_up3": float((db["d_pbpm_did"] >= 3).mean()), "p_dn3": float((db["d_pbpm_did"] <= -3).mean())})
nb = pairs_n[(pairs_n["min"] >= 1500) & (pairs_n["min_n"] >= 1500)]
for b, db in nb.groupby("band1"):
    ex.append({"world": "NBA 2022-26", "band": b, "n": len(db), "p_up3": float((db["d_pbpm"] >= 3).mean()), "p_dn3": float((db["d_pbpm"] <= -3).mean())})
pd.DataFrame(ex).to_csv(RESULTS / "step2_extremes.csv", index=False)

dump_json({"arms": arms, "common_players": len(common), "same_player_rows": int(len(SP) // max(len(arms), 1))}, RESULTS / "step2_summary.json")
pd.set_option("display.width", 260)
print(env.round(3))
print(curves[curves.correction == "did"].pivot_table(index="band", columns="arm", values="mean").round(2))
print(pd.DataFrame(pair_rows).round(2).to_string())
print(SB[SB.metric == "pbpm"].pivot_table(index="band", columns="arm", values="bias").round(2))
print(pd.DataFrame(rm).round(3).to_string())
print(pd.DataFrame(SB26).round(2))
print(ND.round(2).to_string()); print(NN.round(2))
print(pd.DataFrame(cr).round(3))
print(pd.DataFrame(ex).pivot_table(index="band", columns="world", values="p_up3").round(3).to_string())
print(pd.DataFrame(ex).pivot_table(index="band", columns="world", values="p_dn3").round(3).to_string())
