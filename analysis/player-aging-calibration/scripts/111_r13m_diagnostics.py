"""R13-M post-hoc diagnostics (NOT decision criteria; written after scripts/110 was scored).
1. Why B's per-player 3PA-share advantage decays (2021 -0.060 -> 2025 +0.025 vs A): for the players of each season's cohort
   who were also in the 2021 cohort, compare sim(t) with NBA(t) and with two frozen references: the arm's own 2021 value
   carried forward and the NBA 2021 value carried forward; year-to-year persistence corr(tpar_t-1, tpar_t) and SD of the
   one-season change (sim vs NBA).  Signed error by NBA 3PA-share group.
2. D two-point structure by season: 2P% by zone vs NBA (cohort, zone history).
3. OVR ecology at the end of the modern runs (3 seeds): players >= 65 / >= 70 OVR, top-10 mean, per arm.
Output: results/r13m_diag_{decay,groups,ecology}.csv
"""
import importlib.util, io, contextlib, os, sys
import numpy as np, pandas as pd

os.environ.setdefault("R13M_TAG", "diagtmp_")
spec = importlib.util.spec_from_file_location("e110", os.path.join(os.path.dirname(__file__), "110_r13m_eval.py"))
E = importlib.util.module_from_spec(spec)
# reuse the loaders only: execute the module up to its definitions (it runs the full scoring on import -> silence it)
with contextlib.redirect_stdout(io.StringIO()):
    spec.loader.exec_module(E)
for f in E.RESULTS.glob("diagtmp_*"):
    f.unlink()
M, NB, rates, K = E.M, E.NB, E.rates, E.K
SEASONS = range(2021, 2026)

per = {}  # (arm, seed) -> per-season sid frame of rates
for l in M:
    for s, (S, R, _) in M[l].items():
        x = S[S.real].groupby(["sid", "season"])[K].sum()
        per[(l, s)] = x.join(rates(x))
N = NB.join(rates(NB))
okN = lambda p, t: (p, t) in N.index and N.loc[(p, t), "min"] >= 500 and N.loc[(p, t), "fga"] >= 150
okS = lambda p, t: all((p, t) in v.index and v.loc[(p, t), "min"] >= 300 for v in per.values())
base = [p for p in N.xs(2021, level=1).index if okN(p, 2021) and okS(p, 2021)]
rows, grows = [], []
for t in SEASONS:
    coh = [p for p in base if okN(p, t) and okS(p, t)]
    y = N.loc[[(p, t) for p in coh], "tpar"].to_numpy(); y0 = N.loc[[(p, 2021) for p in coh], "tpar"].to_numpy()
    grp = pd.cut(y, [-1, .05, .35, .55, 2], labels=["<0.05", "0.05-0.35", "0.35-0.55", ">=0.55"])
    for l in M:
        e_t, e_f, e_n, pers, dsd = [], [], [], [], []
        for s in M[l]:
            v = per[(l, s)]
            x = v.loc[[(p, t) for p in coh], "tpar"].to_numpy(); x0 = v.loc[[(p, 2021) for p in coh], "tpar"].to_numpy()
            e_t.append(np.abs(x - y).mean()); e_f.append(np.abs(x0 - y).mean())
            if t > 2021:
                prev = [p for p in coh if (p, t - 1) in v.index and v.loc[(p, t - 1), "min"] >= 300]
                a = v.loc[[(p, t - 1) for p in prev], "tpar"].to_numpy(); b = v.loc[[(p, t) for p in prev], "tpar"].to_numpy()
                pers.append(np.corrcoef(a, b)[0, 1]); dsd.append(np.std(b - a))
            for gname in grp.categories:
                m = np.asarray(grp == gname)
                if m.sum():
                    grows.append({"season": t, "arm": l, "seed": s, "group": gname, "n": int(m.sum()), "signed_err": (x[m] - y[m]).mean(), "mae": np.abs(x[m] - y[m]).mean()})
        r = {"season": t, "arm": l, "n": len(coh), "mae_t": np.mean(e_t), "mae_own2021_frozen": np.mean(e_f), "mae_nba2021_frozen": np.abs(y0 - y).mean()}
        if t > 2021:
            prevN = [p for p in coh if okN(p, t - 1)]
            a = N.loc[[(p, t - 1) for p in prevN], "tpar"].to_numpy(); b = N.loc[[(p, t) for p in prevN], "tpar"].to_numpy()
            r |= {"persist": np.mean(pers), "persist_nba": np.corrcoef(a, b)[0, 1], "chg_sd": np.mean(dsd), "chg_sd_nba": np.std(b - a)}
        rows.append(r)
D = pd.DataFrame(rows); D.to_csv(E.RESULTS / "r13m_diag_decay.csv", index=False)
G = pd.DataFrame(grows).groupby(["season", "group", "arm"]).apply(lambda x: pd.Series({"n": x.n.iloc[0], "signed_err": x.signed_err.mean(), "mae": x.mae.mean()}), include_groups=False).reset_index()
G.to_csv(E.RESULTS / "r13m_diag_groups.csv", index=False)
pd.set_option("display.width", 250)
print("== decay: fixed 2021-cohort survivors (mae_t = arm vs NBA(t); frozen = carry the 2021 value forward)"); print(D.round(4).to_string(index=False))
print("\n== signed error by NBA 3PA-share group"); print(G.pivot_table(index=["season", "group"], columns="arm", values="signed_err").round(3).to_string())

# 3. OVR ecology at the last season of each modern run
eco = []
for l in M:
    for s, (S, R, _) in M[l].items():
        for t in (2021, 2026):
            r = R[R.season == t]
            act = S[S.season == min(t, 2025)].pid.unique()
            r = r[r.pid.isin(act)] if t == 2021 else r
            eco.append({"arm": l, "seed": s, "season": t, "n": len(r), "ovr_ge65": int((r.ovr >= 65).sum()), "ovr_ge70": int((r.ovr >= 70).sum()), "top10": r.ovr.nlargest(10).mean(), "p90": r.ovr.quantile(.9)})
EC = pd.DataFrame(eco); EC.to_csv(E.RESULTS / "r13m_diag_ecology.csv", index=False)
print("\n== OVR ecology (mean of 3 seeds; 2026 = preseason after the last simulated season)")
print(EC.groupby(["season", "arm"])[["n", "ovr_ge65", "ovr_ge70", "top10", "p90"]].agg(["mean", "std"]).round(2).to_string())
