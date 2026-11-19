"""R13-M: pre-registered scoring of the cloud experiment (results/r13_preregistration.md, section "R13.1").
WRITTEN BEFORE ANY R13-M RESULT WAS SEEN (2026-11-19, while the run was in preflight).  Implementation choices for
points the pre-registration leaves open are fixed here, always on the STRICT side:
  - cohort per season = real players with NBA >= 500 min and >= 150 FGA that season (scripts/109) and >= 300 sim min in
    EVERY modern run (A/B/C/D x 3 seeds = 12 runs; "in every run").  Sensitivity: cohort over the A and B runs only.
  - pooled seeds = stacked player-seed rows (mean of per-seed errors; no averaging of sims before the error).
  - "league" 3PA / TS for T3 / T5 = cohort sums (like-for-like with the NBA, scripts/109).  Sensitivity: whole league.
  - T5 / T6 must hold in EVERY season AND pooled over 2021-2025.  T4 every season.
  - T7: star persistence (scripts/102) top10 / top30 at k = 3 for 26-30 and 31-34, each within +-0.05 of A;
    exit hazard (scripts/100 D) every age band x tier cell within +-0.05 of A (cells with n < 30 are reported, still
    scored; a noise reference A-seed vs A-seed is printed but not used for the decision); generated-player minutes
    share B - A <= 0.02 in every season.
  - Long run (seed 31): whole-league 3PA share |B - A| <= 0.03 every season; share of players (>= 500 min, >= 150 FGA)
    with 3PA share >= 0.55 in [0.10, 0.35] every season (B); generated players aged <= 24 (same filter) share >= 0.55
    <= 2 x real players aged <= 24 standardised to the generated age mix (pooled seasons; n < 20 real -> not evaluable).
  - 2005 guard (B seeds 11-13 vs R11 playground 11-13; seasons 2006-2012; cohort over the 6 runs): per-player 3PA MAE
    B <= A every season; share >= 0.40 in 2012 B >= A and >= 0.5 x NBA; TS gap |B| - |A| <= 0.005 every season and
    pooled; spill B - A <= 0.02 every season; scripts/102 star top10 / top30 (k = 3) and survivor-free activity (share of
    the 2005 start cohort with >= 500 min, horizon 1-7 pooled, by age band; scripts/77 definition) within +-0.05.
  - D: |gap_A| - |gap_D| >= 0.010 every season 2021-2025 AND |drift_D - drift_NBA| <= 0.03 for the mid-range share
    of 2PA 2022 -> 2025 (NBA from sim/r5_inputs/zone_history.json, key = season + 1, cohort players).
Usage: python 110_r13m_eval.py     Output: results/r13m_*.csv (+ stdout)
"""
import gzip, json, os, sys, types
import numpy as np, pandas as pd

if "statsmodels" not in sys.modules:
    _sm = types.ModuleType("statsmodels"); _sm.api = types.ModuleType("statsmodels.api")
    sys.modules["statsmodels"] = _sm; sys.modules["statsmodels.api"] = _sm.api
from profile import box_metrics
from common import HERE, OUT_DATA, RESULTS

DIR, R11 = HERE / "sim" / os.environ.get("R13M_DIR", "output_full_r13m"), HERE / "sim/output_full_r11"
MSEEDS = [int(x) for x in os.environ.get("R13M_SEEDS", "21,22,23").split(",")]  # dry run on the smoke: R13M_DIR=... R13M_SEEDS=1 R13M_LAST=2022
LAST = int(os.environ.get("R13M_LAST", "2025"))
TAG = os.environ.get("R13M_TAG", "")
ARMS = {"A": "playground", "B": "playground+three_anchor_rel_cap2", "C": "v9s_l4+three_anchor_rel_cap2", "D": "playground+three_anchor_rel_cap2_mix"}
K = ["gp", "min", "pts", "fga", "fg", "tpa", "tp", "fta", "ft", "orb", "drb", "ast", "tov", "stl", "blk", "pf",
     "fgaAtRim", "fgAtRim", "fgaLowPost", "fgLowPost", "fgaMidRange", "fgMidRange"]
nba = pd.read_parquet(OUT_DATA / "nba_player_seasons.parquet").rename(columns={"slug": "sid"})
NB = nba.groupby(["sid", "season"])[["gp", "min", "pts", "fga", "fg", "tpa", "tp", "fta", "ft", "orb", "drb", "ast", "tov", "stl", "blk", "pf", "usgp"]].sum()
ZH = {**json.load(open(HERE / "sim/r5_inputs/zone_history_hist.json")), **json.load(open(HERE / "sim/r5_inputs/zone_history.json"))}
pd.set_option("display.width", 250); pd.set_option("display.max_columns", 60)


def load(path, start):
    d = json.load(gzip.open(path)); rows, rat = [], []
    for p in d["players"]:
        agg = {}
        for s in p["stats"]:
            if s["season"] < start or s.get("playoffs"):
                continue
            a = agg.setdefault(s["season"], dict.fromkeys(K, 0.0))
            for k in K:
                a[k] += float(s.get(k) or 0)
        for season, a in agg.items():
            rows.append({"pid": p["pid"], "sid": p.get("srID") or f"gen{p['pid']}", "real": bool(p.get("srID")), "season": season,
                         "age": season - p["born"], "draft": (p.get("draft") or {}).get("year"), **a})
        for r in p.get("ratings", []):
            if r["season"] >= start:
                rat.append({"pid": p["pid"], "sid": p.get("srID") or f"gen{p['pid']}", "real": bool(p.get("srID")), "season": r["season"],
                            "age": r["season"] - p["born"], "ovr": r["ovr"], "pot": r["pot"], "tp": r["tp"]})
    S = pd.DataFrame(rows); S = S[S["min"] > 0]
    return S, pd.DataFrame(rat).drop_duplicates(["pid", "season"], keep="last"), d


def rates(d):
    tsa = d.fga + .44 * d.fta
    return pd.DataFrame({"tpar": d.tpa / d.fga, "ts": d.pts / (2 * tsa), "plays36": 36 * (tsa + d.tov) / d["min"], "ftr": d.fta / d.fga,
                         "pts36": 36 * d.pts / d["min"], "ast36": 36 * d.ast / d["min"], "trb36": 36 * (d.orb + d.drb) / d["min"]}, index=d.index)


def lg(t):
    tsa = t.fga + .44 * t.fta
    return {"tpar": t.tpa / t.fga, "ts": t.pts / (2 * tsa), "p2": (t.fg - t.tp) / (t.fga - t.tpa), "p3": t.tp / t.tpa, "ftr": t.fta / t.fga}


def runs_of(start, arm, seeds, d=DIR):
    out = {}
    for s in seeds:
        f = d / f"full__{start}__{arm}__{s}.json.gz"
        if f.exists():
            out[s] = load(f, start)
    return out


def season_table(world, seasons, cohort_runs):
    """world: {label: {seed: (S, R, raw)}}; cohort over every run in cohort_runs (list of (label, seed))."""
    rows = []
    for season in seasons:
        N = NB.xs(season, level=1)
        ok = N[(N["min"] >= 500) & (N.fga >= 150)].index
        per = {(l, s): (lambda S: S[(S.season == season) & S.real])(world[l][s][0]).groupby("sid")[K].sum() for l, s in cohort_runs}
        coh = [p for p in ok if all(p in x.index and x.loc[p, "min"] >= 300 for x in per.values())]
        y = N.loc[coh]; ry = rates(y); lN = lg(y.sum()); lNw = lg(N.sum())
        z = ZH.get(str(season + 1)); zid = [p for p in coh if z and p in z]
        za = np.array([z[p] for p in zid]).sum(0) if zid else None
        for l in world:
            X, Y, W = [], [], []
            for s, (S, _, _) in world[l].items():
                x = S[S.season == season].groupby("sid")[K].sum()
                X.append(x.loc[coh]); Y.append(ry); W.append(x)
            if not X:
                continue
            x = pd.concat(X); rx = rates(x); yy = pd.concat(Y); L = lg(x.sum()); Lw = lg(sum(w.sum() for w in W))
            two = x.fgaAtRim.sum() + x.fgaLowPost.sum() + x.fgaMidRange.sum()
            xz = pd.concat([X[i].loc[zid] for i in range(len(X))]) if zid else None
            two_z = (xz.fgaAtRim.sum() + xz.fgaLowPost.sum() + xz.fgaMidRange.sum()) if zid else np.nan
            big = yy.tpar.values < .05
            r = {"season": season, "arm": l, "n": len(coh), "runs": len(X), "slope": np.polyfit(yy.tpar, rx.tpar, 1)[0],
                 "ge55": (rx.tpar >= .55).mean(), "ge55_nba": (ry.tpar >= .55).mean(), "ge40": (rx.tpar >= .40).mean(), "ge40_nba": (ry.tpar >= .40).mean(),
                 "spill": rx.tpar.values[big].mean(), "spill_nba": yy.tpar.values[big].mean()}
            for m in ["tpar", "ts", "plays36", "ftr", "pts36", "ast36", "trb36"]:
                r[f"mae_{m}"] = np.abs(rx[m].values - yy[m].values).mean()
            r["corr_plays36"] = np.corrcoef(rx.plays36, yy.plays36)[0, 1]; r["corr_ts"] = np.corrcoef(rx.ts, yy.ts)[0, 1]
            for k in ["tpar", "ts", "p2", "p3", "ftr"]:
                r[f"lg_{k}"], r[f"lg_{k}_nba"] = L[k], lN[k]
            r["lgw_tpar"], r["lgw_tpar_nba"], r["lgw_ts"], r["lgw_ts_nba"] = Lw["tpar"], lNw["tpar"], Lw["ts"], lNw["ts"]
            r["rim"], r["post"], r["mid"] = x.fgaAtRim.sum() / two, x.fgaLowPost.sum() / two, x.fgaMidRange.sum() / two
            if zid:
                r["mid_z"] = xz.fgaMidRange.sum() / two_z; r["rim_z"] = xz.fgaAtRim.sum() / two_z
                r["mid_z_nba"], r["rim_z_nba"] = za[2] / za[:3].sum(), za[0] / za[:3].sum()
                r["midfg_z"], r["midfg_z_nba"] = xz.fgMidRange.sum() / xz.fgaMidRange.sum(), za[5] / za[2]
                r["rimfg_z"], r["rimfg_z_nba"] = xz.fgAtRim.sum() / xz.fgaAtRim.sum(), za[3] / za[0]
            rows.append(r)
    T = pd.DataFrame(rows)
    T["ts_gap"] = T.lg_ts - T.lg_ts_nba; T["ts_gapw"] = T.lgw_ts - T.lgw_ts_nba
    return T


def pbpm_world(world_runs, start):
    """scripts/100 world: box_metrics per (seed, season) on every player with minutes; key = seed_pid."""
    parts = []
    for s, (S, _, _) in world_runs.items():
        for season, g in S.groupby("season"):
            b = box_metrics(g.assign(key=[f"{s}_{p}" for p in g.pid]))
            parts.append(b)
    return pd.concat(parts, ignore_index=True)


def wide(W, col):
    return W.pivot_table(index="key", columns="season", values=col, aggfunc="first", dropna=False)


def stars(W, k=int(os.environ.get("R13M_K", "3"))):  # k = 3 pre-registered; R13M_K only for the dry run
    PB, MN, AG = wide(W, "pbpm"), wide(W, "min"), wide(W, "age"); seasons = sorted(PB.columns)
    V = ((PB.fillna(-2) + 2).clip(lower=0) * MN.fillna(0) / 1000); out = []
    for t in seasons:
        if t + k not in seasons:
            continue
        el = MN[t] >= 1500; thr = PB.loc[el, t].quantile(.9)
        for ab, (lo, hi) in {"26-30": (26, 30), "31-34": (31, 34)}.items():
            ids = PB.index[el & (PB[t] >= thr) & AG[t].between(lo, hi)]
            v = V[t + k]; played = v[MN[t + k].fillna(0) > 0]; vv = v.reindex(ids).fillna(0)
            out.append({"t": t, "band": ab, "n": len(ids), "top10": (vv >= played.quantile(.9)).mean(), "top30": (vv >= played.quantile(.7)).mean()})
    O = pd.DataFrame(out)
    return O.groupby("band").apply(lambda x: pd.Series({c: np.average(x[c], weights=x.n) if x.n.sum() else np.nan for c in ["top10", "top30"]} | {"n": x.n.sum()}), include_groups=False)


def exit_hazard(W):
    PB, MN, AG = wide(W, "pbpm"), wide(W, "min"), wide(W, "age"); seasons = sorted(PB.columns); rows = []
    for t in seasons:
        if t + 1 not in seasons:
            continue
        el = MN[t] >= 500
        tier = pd.cut(PB.loc[el, t].rank(pct=True), [0, 1 / 3, 2 / 3, 1], labels=["low", "mid", "top"])
        df = pd.DataFrame({"tier": tier, "out": MN.loc[el, t + 1].fillna(0) < 100,
                           "ab": pd.cut(AG.loc[el, t], [0, 24, 29, 32, 35, 60], labels=["<=24", "25-29", "30-32", "33-35", "36+"])})
        rows.append(df)
    D = pd.concat(rows)
    return D.groupby(["ab", "tier"], observed=True).out.agg(["mean", "size"]).rename(columns={"mean": "exit", "size": "n"})


def gen_minutes(world_runs):
    out = {}
    for s, (S, _, _) in world_runs.items():
        g = S.groupby("season").apply(lambda x: x.loc[~x.real, "min"].sum() / x["min"].sum(), include_groups=False)
        out[s] = g
    return pd.DataFrame(out).mean(axis=1)


crit = []


def C(block, name, value, rule, passed, note=""):
    crit.append({"block": block, "criterion": name, "value": value, "rule": rule, "pass": bool(passed), "note": note})
    return bool(passed)


# ===================================================================== modern 2021 (A/B/C/D x 21-23 x 5 seasons)
SEASONS = list(range(2021, LAST + 1))
M = {l: runs_of(2021, a, MSEEDS) for l, a in ARMS.items()}
M = {l: v for l, v in M.items() if v}
print("modern runs:", {l: sorted(v) for l, v in M.items()})
allruns = [(l, s) for l in M for s in M[l]]
T = season_table(M, SEASONS, allruns); T.to_csv(RESULTS / f"{TAG}r13m_modern_seasons.csv", index=False)
Tab = season_table({l: M[l] for l in "AB"}, SEASONS, [(l, s) for l in "AB" for s in M[l]]); Tab.to_csv(RESULTS / "r13m_modern_seasons_ABcohort.csv", index=False)
cols = ["season", "arm", "n", "slope", "ge55", "ge55_nba", "mae_tpar", "spill", "spill_nba", "mae_ts", "mae_plays36", "lg_tpar", "lg_tpar_nba",
        "lg_ts", "lg_ts_nba", "ts_gap", "lg_p2", "lg_p2_nba", "lg_ftr", "lg_ftr_nba", "rim_z", "rim_z_nba", "mid_z", "mid_z_nba"]
print("\n== modern per season (cohort over all 12 runs; pooled seeds)"); print(T[cols].round(3).to_string(index=False))
print("\n== extra per-player errors"); print(T[["season", "arm", "mae_ftr", "mae_pts36", "mae_ast36", "mae_trb36", "corr_plays36", "corr_ts", "lgw_tpar", "lgw_tpar_nba", "ts_gapw"]].round(3).to_string(index=False))


def score_B(T, tag):
    a, b = T[T.arm == "A"].set_index("season"), T[T.arm == "B"].set_index("season")
    ok = []
    ok.append(C(tag, "T1 per-player 3PA MAE lower every season", (b.mae_tpar - a.mae_tpar).round(4).tolist(), "B < A", (b.mae_tpar < a.mae_tpar).all()))
    ok.append(C(tag, "T2 share>=0.55 closer to NBA every season", ((b.ge55 - b.ge55_nba).abs() - (a.ge55 - a.ge55_nba).abs()).round(4).tolist(), "< 0", ((b.ge55 - b.ge55_nba).abs() < (a.ge55 - a.ge55_nba).abs()).all()))
    ok.append(C(tag, "T3 league 3PA share closer (cohort)", ((b.lg_tpar - b.lg_tpar_nba).abs() - (a.lg_tpar - a.lg_tpar_nba).abs()).round(4).tolist(), "< 0", ((b.lg_tpar - b.lg_tpar_nba).abs() < (a.lg_tpar - a.lg_tpar_nba).abs()).all()))
    C(tag + " (sens)", "T3 whole league", ((b.lgw_tpar - b.lgw_tpar_nba).abs() - (a.lgw_tpar - a.lgw_tpar_nba).abs()).round(4).tolist(), "< 0", ((b.lgw_tpar - b.lgw_tpar_nba).abs() < (a.lgw_tpar - a.lgw_tpar_nba).abs()).all(), "sensitivity only")
    ok.append(C(tag, "T4 non-shooter spill", (b.spill - a.spill).round(4).tolist(), "B - A <= 0.02 every season", ((b.spill - a.spill) <= .02).all()))
    d = (b.mae_ts - a.mae_ts); pooled = b.mae_ts.mean() - a.mae_ts.mean()
    ok.append(C(tag, "T5a per-player TS MAE", d.round(4).tolist() + [round(pooled, 4)], "<= 0.003 every season and pooled", (d <= .003).all() and pooled <= .003))
    g = b.ts_gap.abs() - a.ts_gap.abs(); gp = abs(b.ts_gap.mean()) - abs(a.ts_gap.mean())
    ok.append(C(tag, "T5b league TS gap", g.round(4).tolist() + [round(gp, 4)], "|B|-|A| <= 0.005 every season and pooled", (g <= .005).all() and gp <= .005))
    d = (b.mae_plays36 - a.mae_plays36); pooled = b.mae_plays36.mean() - a.mae_plays36.mean()
    ok.append(C(tag, "T6 per-player plays36 MAE", d.round(4).tolist() + [round(pooled, 4)], "<= 0.10 every season and pooled", (d <= .10).all() and pooled <= .10))
    return ok


okB = score_B(T, "B modern")
score_B(Tab, "B modern (sens: A/B cohort)")

# ---- T7 ecology
PBW = {l: pbpm_world(M[l], 2021) for l in M}
ST = {l: stars(PBW[l]) for l in M}; EX = {l: exit_hazard(PBW[l]) for l in M}; GM = {l: gen_minutes(M[l]) for l in M}
stt = pd.concat({l: ST[l] for l in M}, names=["arm"]); stt.to_csv(RESULTS / f"{TAG}r13m_modern_stars.csv")
ext = pd.concat({l: EX[l] for l in M}, names=["arm"]); ext.to_csv(RESULTS / f"{TAG}r13m_modern_exit.csv")
gmt = pd.DataFrame(GM); gmt.to_csv(RESULTS / f"{TAG}r13m_modern_generated_minutes.csv")
print("\n== stars (k=3, survivor-free)"); print(stt.round(3).unstack("arm").to_string())
print("\n== exit hazard"); print(ext.unstack("arm").round(3).to_string())
print("\n== generated-player minutes share"); print(gmt.round(4).to_string())
# noise reference: seed 21 vs seeds 22+23 of A (not used for decisions)
nA1, nA2 = {MSEEDS[0]: M["A"][MSEEDS[0]]}, {s: M["A"][s] for s in MSEEDS[1:] if s in M["A"]}
if nA2:
    e1, e2 = exit_hazard(pbpm_world(nA1, 2021)), exit_hazard(pbpm_world(nA2, 2021))
    print("noise ref (A seed21 vs A 22+23) exit |diff| max / mean:", round((e1.exit - e2.exit).abs().max(), 3), round((e1.exit - e2.exit).abs().mean(), 3))
    s1, s2 = stars(pbpm_world(nA1, 2021)), stars(pbpm_world(nA2, 2021))
    print("noise ref stars |diff|:", (s1[["top10", "top30"]] - s2[["top10", "top30"]]).abs().round(3).to_dict())
for l in [x for x in "BCD" if x in M]:
    tag = "B modern" if l == "B" else f"{l} modern (report)"
    dst = (ST[l][["top10", "top30"]] - ST["A"][["top10", "top30"]])
    r1 = C(tag, "T7 star persistence k=3 (26-30/31-34 top10/top30)", dst.round(3).values.ravel().tolist(), "|.| <= 0.05", (dst.abs() <= .05).all().all())
    de = (EX[l].exit - EX["A"].exit).dropna()
    r2 = C(tag, "T7 exit hazard every age x tier cell", round(de.abs().max(), 3), "max |.| <= 0.05", (de.abs() <= .05).all(),
           f"worst cell {de.abs().idxmax()} n={int(EX['A'].n.get(de.abs().idxmax(), 0))}; cells>0.05: {[(c, round(v, 3)) for c, v in de.items() if abs(v) > .05]}")
    dg = GM[l] - GM["A"]
    r3 = C(tag, "T7 generated-player minutes share", dg.round(4).tolist(), "B - A <= 0.02 every season", (dg <= .02).all())
    if l == "B":
        okB += [r1, r2, r3]

# ---- D exploratory gate; C report vs A and B
a, dd = T[T.arm == "A"].set_index("season"), T[T.arm == "D"].set_index("season")
if len(dd):
    shrink = a.ts_gap.abs() - dd.ts_gap.abs()
    C("D modern (explore)", "TS gap shrinks >= 0.010 every season", shrink.round(4).tolist(), ">= 0.010", (shrink >= .010).all())
    drift_d, drift_n = dd.mid_z[LAST] - dd.mid_z[2022], dd.mid_z_nba[LAST] - dd.mid_z_nba[2022]
    C("D modern (explore)", "mid-range share of 2PA drift 2022->2025 vs NBA", [round(drift_d, 4), round(drift_n, 4), round(drift_d - drift_n, 4)], "|D - NBA| <= 0.03", abs(drift_d - drift_n) <= .03,
      f"A drift {a.mid_z[LAST] - a.mid_z[2022]:.4f}")
    okD = score_B(T.replace({"arm": {"B": "_B", "D": "B"}}), "D vs A (same T1-T6, report)")
if "C" in M:
    cc = score_B(T.replace({"arm": {"B": "_B", "C": "B"}}), "C vs A (T1-T6, report)")
    cb = score_B(T.replace({"arm": {"A": "_A", "B": "A", "C": "B"}}), "C vs B (T1-T6, report)")

# ---- growth / opportunity diagnostics (real players, preseason OVR change by age; modern)
grow = []
for l in M:
    for s, (S, R, _) in M[l].items():
        Rw = R.pivot_table(index="pid", columns="season", values="ovr"); Ag = R.pivot_table(index="pid", columns="season", values="age")
        for t in range(2021, LAST):
            if t + 1 not in Rw:
                continue
            dlt = (Rw[t + 1] - Rw[t]).dropna(); ag = Ag.loc[dlt.index, t]
            for band, (lo, hi) in {"19-22": (19, 22), "23-26": (23, 26), "27-30": (27, 30), "31-34": (31, 34), "35+": (35, 50)}.items():
                m = ag.between(lo, hi)
                grow.append({"arm": l, "seed": s, "t": t, "band": band, "n": int(m.sum()), "d_ovr": dlt[m].mean(), "sd": dlt[m].std(), "p_ge5": (dlt[m] >= 5).mean()})
G = pd.DataFrame(grow); G.to_csv(RESULTS / f"{TAG}r13m_modern_growth.csv", index=False)
print("\n== preseason OVR change by age (pooled seeds, t=2021-2024)")
print(G.groupby(["band", "arm"]).apply(lambda x: pd.Series({"n": x.n.sum(), "d_ovr": np.average(x.d_ovr, weights=x.n), "sd": np.average(x.sd, weights=x.n), "p_ge5": np.average(x.p_ge5, weights=x.n)}), include_groups=False).unstack("arm").round(3).to_string())

# ===================================================================== long run (seed 31, 15 seasons)
LR = {l: runs_of(2021, ARMS[l], [31]) for l in "AB"}
if all(LR[l] for l in "AB"):
    rows = []
    for l in "AB":
        S, R, _ = LR[l][31]
        for season, g in S.groupby("season"):
            e = g[(g["min"] >= 500) & (g.fga >= 150)]; tp = e.tpa / e.fga
            r = R[R.season == season]
            t_ = g[K].sum(); L = lg(t_); two = t_.fgaAtRim + t_.fgaLowPost + t_.fgaMidRange
            rows.append({"arm": l, "season": season, "lg_tpar": L["tpar"], "lg_ts": L["ts"], "lg_p2": L["p2"], "lg_ftr": L["ftr"], "mid": t_.fgaMidRange / two, "rim": t_.fgaAtRim / two,
                         "ge55": (tp >= .55).mean(), "n_rot": len(e), "gen_min": g.loc[~g.real, "min"].sum() / g["min"].sum(),
                         "ovr_top10": r.ovr.nlargest(10).mean(), "ovr_ge65": int((r.ovr >= 65).sum()),
                         "ovr_mean_rot": r[r.pid.isin(e.pid)].ovr.mean(), "age_rot": np.average(e.age, weights=e["min"]),
                         "tp_rating_rot": r[r.pid.isin(e.pid)].tp.mean()})
    LT = pd.DataFrame(rows); LT.to_csv(RESULTS / f"{TAG}r13m_long_seasons.csv", index=False)
    print("\n== long run seed 31"); print(LT.round(3).to_string(index=False))
    a, b = LT[LT.arm == "A"].set_index("season"), LT[LT.arm == "B"].set_index("season")
    okB.append(C("B long", "league 3PA share |B - A| <= 0.03 every season", round((b.lg_tpar - a.lg_tpar).abs().max(), 4), "max <= 0.03", ((b.lg_tpar - a.lg_tpar).abs() <= .03).all()))
    okB.append(C("B long", "share >= 0.55 in [0.10, 0.35] every season", [round(b.ge55.min(), 3), round(b.ge55.max(), 3)], "[0.10, 0.35]", b.ge55.between(.10, .35).all()))
    S, _, _ = LR["B"][31]; e = S[(S["min"] >= 500) & (S.fga >= 150) & (S.age <= 24)].assign(g55=lambda x: x.tpa / x.fga >= .55)
    gen, real = e[~e.real], e[e.real]
    rr = real.groupby("age").g55.mean(); w = gen.age.value_counts(normalize=True)
    std_real = (rr.reindex(w.index) * w).sum() / w[rr.reindex(w.index).notna()].sum() if len(real) else np.nan
    ev = len(real) >= 20 and len(gen) >= 20
    okB.append(C("B long", "generated <=24 share>=0.55 <= 2 x real same age", [round(gen.g55.mean(), 3), round(std_real, 3), len(gen), len(real)], "gen <= 2 x real (age-standardised)",
                 (gen.g55.mean() <= 2 * std_real) if ev else False, "" if ev else "NOT EVALUABLE (n < 20) -> counted as fail"))
    for l in "AB":
        e = LR[l][31][0]; e = e[(e["min"] >= 500) & (e.fga >= 150) & (e.age <= 24)]
        print(l, "<=24 ge55 generated / real:", round((e[~e.real].tpa / e[~e.real].fga >= .55).mean(), 3), len(e[~e.real]), "/", round((e[e.real].tpa / e[e.real].fga >= .55).mean(), 3), len(e[e.real]))
    LW = {l: pbpm_world(LR[l], 2021) for l in "AB"}
    print("\n== long-run stars k=3"); print(pd.concat({l: stars(LW[l]) for l in "AB"}, names=["arm"]).round(3).unstack("arm").to_string())
    print("\n== long-run exit hazard"); print(pd.concat({l: exit_hazard(LW[l]) for l in "AB"}, names=["arm"]).unstack("arm").round(3).to_string())
else:
    print("long run missing:", {l: list(v) for l, v in LR.items()})

# ===================================================================== 2005 guard (B 11-13 vs R11 playground 11-13)
GB = runs_of(2005, ARMS["B"], [11, 12, 13]); GA = runs_of(2005, "playground", [11, 12, 13], R11)
if GB and GA:
    GW = {"A": GA, "B": GB}
    GT = season_table(GW, list(range(2005, 2013)), [(l, s) for l in GW for s in GW[l]]); GT.to_csv(RESULTS / f"{TAG}r13m_guard2005_seasons.csv", index=False)
    print("\n== 2005 guard per season"); print(GT[cols + ["ge40", "ge40_nba"]].round(3).to_string(index=False))
    a, b = GT[(GT.arm == "A") & (GT.season >= 2006)].set_index("season"), GT[(GT.arm == "B") & (GT.season >= 2006)].set_index("season")
    okB.append(C("B guard 2005", "per-player 3PA MAE not worse every season", (b.mae_tpar - a.mae_tpar).round(4).tolist(), "B <= A", (b.mae_tpar <= a.mae_tpar).all()))
    okB.append(C("B guard 2005", "share>=0.40 in 2012 >= control and >= 0.5 x NBA", [round(b.ge40[2012], 3), round(a.ge40[2012], 3), round(b.ge40_nba[2012], 3)], "B >= A and B >= 0.5 NBA",
                 b.ge40[2012] >= a.ge40[2012] and b.ge40[2012] >= .5 * b.ge40_nba[2012]))
    g = b.ts_gap.abs() - a.ts_gap.abs(); gp = abs(b.ts_gap.mean()) - abs(a.ts_gap.mean())
    okB.append(C("B guard 2005", "league TS gap not worse", g.round(4).tolist() + [round(gp, 4)], "|B|-|A| <= 0.005 every season and pooled", (g <= .005).all() and gp <= .005))
    okB.append(C("B guard 2005", "non-shooter spill", (b.spill - a.spill).round(4).tolist(), "B - A <= 0.02 every season", ((b.spill - a.spill) <= .02).all()))
    GPW = {l: pbpm_world(GW[l], 2005) for l in GW}
    gs = {l: stars(GPW[l]) for l in GW}; dst = gs["B"][["top10", "top30"]] - gs["A"][["top10", "top30"]]
    print("\n== guard stars"); print(pd.concat(gs, names=["arm"]).round(3).unstack("arm").to_string())
    okB.append(C("B guard 2005", "star persistence k=3 within 0.05", dst.round(3).values.ravel().tolist(), "|.| <= 0.05", (dst.abs() <= .05).all().all()))
    # survivor-free activity of the 2005 start cohort (scripts/77: NBA 2004 >= 500 min, on a 2005 roster, absent = 0)
    v0 = NB.xs(2004, level=1); v0 = set(v0.index[v0["min"] >= 500]); act = []
    for l in GW:
        for s, (S, _, _) in GW[l].items():
            r05 = S[(S.season == 2005) & S.sid.isin(v0) & (S.draft.fillna(9999) <= 2004)]
            ages = r05.groupby("sid").age.first(); mins = S.groupby(["sid", "season"])["min"].sum()
            for h in range(1, 8):
                for sid, a0 in ages.items():
                    act.append({"arm": l, "seed": s, "h": h, "band": "19-22" if a0 <= 22 else "23-25" if a0 <= 25 else "26-28" if a0 <= 28 else "29-31" if a0 <= 31 else "32+",
                                "ge500": mins.get((sid, 2005 + h), 0) >= 500})
    AC = pd.DataFrame(act).groupby(["band", "arm"]).ge500.mean().unstack("arm"); AC.to_csv(RESULTS / f"{TAG}r13m_guard2005_activity.csv")
    print("\n== guard survivor-free activity (share >= 500 min, h 1-7 pooled)"); print(AC.round(3).to_string())
    okB.append(C("B guard 2005", "survivor-free activity by age band within 0.05", (AC.B - AC.A).round(3).tolist(), "|.| <= 0.05", ((AC.B - AC.A).abs() <= .05).all()))
else:
    print("guard missing", list(GB), list(GA)); okB.append(C("B guard 2005", "guard runs present", 0, "present", False))

CR = pd.DataFrame(crit); CR.to_csv(RESULTS / f"{TAG}r13m_criteria.csv", index=False)
print("\n== CRITERIA"); print(CR.to_string(index=False))
print("\nB official decision:", "GO" if all(okB) else "NO-GO", f"({sum(okB)}/{len(okB)} hard criteria pass)")
