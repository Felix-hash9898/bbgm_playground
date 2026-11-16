"""Real-NBA aging targets from season-level box scores (1980-2025), with survivor-bias handling.

Every target is expressed in box-score space so it can be compared 1:1 with GameSim output
(BBGM ratings are never used as ability labels here).

Estimators of the mean one-year change at age a (pair a-1 -> a):
  naive      : both seasons >= 250 min, weight = harmonic mean of minutes (classic delta method)
  inclusive  : season a-1 >= 500 min, season a >= 50 min, weight = minutes(a-1)  (keeps players whose
               role collapsed; noisier)
  bound      : 'inclusive' + players with >=500 min at a-1 who never play again (or <50 min) imputed
               with the 15th percentile of the inclusive delta in the same age band (pessimistic bound)
All deltas are league-adjusted: minus the change of the league minutes-weighted mean between seasons.
Individual heterogeneity: Var(delta | minutes) = sigma_true^2 + k*(1/m0 + 1/m1); sigma_true from the
intercept of a weighted regression of squared demeaned deltas on (1/m0+1/m1).
Outputs: results/nba_*.csv/json, data/nba_pairs.parquet
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm

from common import OUT_DATA, RESULTS, age_band, dump_json, wmean

p = pd.read_parquet(OUT_DATA / "nba_player_seasons.parquet")
p = p[(p["season"] >= 1980) & p["age"].between(18, 45)].copy()

# ----- metrics computable both in NBA data and in GameSim box scores
p["plays36"] = (p["fga"] + 0.44 * p["fta"] + p["tov"]) / p["min"] * 36
p["tov36"] = p["tov"] / p["min"] * 36
p["pf36"] = p["pf"] / p["min"] * 36
METRICS = ["pbpm", "bpm", "obpm", "dbpm", "ts", "plays36", "pts36", "tpar", "ftr", "ast36", "tov_pct",
           "orb36", "drb36", "stl36", "blk36", "tpa36", "mpg"]

# ----- pseudo-BPM: linear box composite fitted to NBA BPM (fit split only), usable on GameSim output
base = p[p["min"] >= 500].copy()
lg = lambda d, c: d.groupby("season").apply(lambda x: wmean(x[c], x["min"]), include_groups=False)
FEATS = ["pts36", "ts", "ast36", "tov36", "orb36", "drb36", "stl36", "blk36", "fga36", "fta36", "tpa36", "pf36"]
p["fga36"] = p["fga"] / p["min"] * 36
p["fta36"] = p["fta"] / p["min"] * 36
base = p[p["min"] >= 500].copy()
league_means = {c: lg(base, c) for c in FEATS + METRICS[1:]}
for c in FEATS:
    p[f"{c}_rel"] = p[c] - p["season"].map(league_means[c])
X = p.loc[(p["min"] >= 500) & (p["split"] == "fit"), [f"{c}_rel" for c in FEATS]].dropna()
y = p.loc[X.index, "bpm"]
w = p.loc[X.index, "min"]
ok = y.notna()
pb_model = sm.WLS(y[ok], sm.add_constant(X[ok]), weights=w[ok]).fit()
Xt = p.loc[(p["min"] >= 500) & (p["split"] == "test"), [f"{c}_rel" for c in FEATS]].dropna()
yt = p.loc[Xt.index, "bpm"]
pred_t = pb_model.predict(sm.add_constant(Xt))
r2_test = 1 - np.average((yt - pred_t) ** 2, weights=p.loc[Xt.index, "min"]) / np.average((yt - np.average(yt, weights=p.loc[Xt.index, "min"])) ** 2, weights=p.loc[Xt.index, "min"])
p["pbpm"] = pb_model.predict(sm.add_constant(p[[f"{c}_rel" for c in FEATS]], has_constant="add"))
dump_json({"coef": pb_model.params.round(4).to_dict(), "r2_fit": pb_model.rsquared, "r2_test": r2_test,
           "league_means_2025": {c: float(league_means[c].get(2025, np.nan)) for c in FEATS}},
          RESULTS / "pseudo_bpm_model.json")
print("pseudo-BPM R2 fit", round(pb_model.rsquared, 3), "test", round(r2_test, 3))

# league means per season for league adjustment of deltas
base = p[p["min"] >= 250]
LM = {c: base.groupby("season").apply(lambda x: wmean(x[c], x["min"]), include_groups=False) for c in METRICS}

# ----- consecutive pairs
p = p.sort_values(["slug", "season"])
nxt = p.groupby("slug").shift(-1)
pairs = p.copy()
pairs["consecutive"] = nxt["season"] == p["season"] + 1
for c in METRICS + ["min", "gp", "gp_share", "first_team", "last_team", "n_teams"]:
    pairs[f"n_{c}"] = np.where(pairs["consecutive"], nxt[c], np.nan) if c not in ("first_team", "last_team") else np.where(pairs["consecutive"], nxt[c], None)
pairs["age1"] = pairs["age"] + 1
pairs["season1"] = pairs["season"] + 1
pairs["team_change"] = pairs["consecutive"] & ((pairs["n_first_team"] != pairs["last_team"]) | (pairs["n_n_teams"] > 1))
for c in METRICS:
    pairs[f"d_{c}"] = pairs[f"n_{c}"] - pairs[c] - (pairs["season1"].map(LM[c]) - pairs["season"].map(LM[c]))
pairs["hm_min"] = 2 / (1 / pairs["min"] + 1 / pairs["n_min"])
pairs["ever_again"] = pairs.groupby("slug")["season"].transform("max") > pairs["season"]
pairs = pairs[pairs["season"] <= 2024]
pairs["band1"] = age_band(pairs["age1"])
pairs["role"] = pd.cut(pairs["mpg"], [0, 15, 28, 60], labels=["bench<15", "rotation15-28", "starter28+"]).astype(str)
pairs["hgt_t"] = pd.qcut(pairs["height"], 3, labels=["short", "mid", "tall"]).astype(str)
pairs["draft_t"] = np.select([pairs["draftPick"].fillna(99) <= 14, pairs["draftRound"].fillna(9) == 1], ["lottery", "1st-late"], "2nd/undrafted")
lvl = pairs[pairs["min"] >= 500].groupby("band1")["bpm"].transform(lambda s: pd.qcut(s, 3, labels=False, duplicates="drop"))
pairs["level_t"] = lvl.map({0: "low", 1: "mid", 2: "high"})
pairs.to_parquet(OUT_DATA / "nba_pairs.parquet", index=False)

naive = pairs[pairs["consecutive"] & (pairs["min"] >= 250) & (pairs["n_min"] >= 250)]
incl = pairs[(pairs["min"] >= 500) & pairs["consecutive"] & (pairs["n_min"] >= 50)]
leavers = pairs[(pairs["min"] >= 500) & ~(pairs["consecutive"] & (pairs["n_min"] >= 50))]


def curve(df, col, wcol, by="age1", minn=40):
    g = df.dropna(subset=[col]).groupby(by)
    out = g.apply(lambda d: pd.Series({"mean": wmean(d[col], d[wcol]), "n": len(d)}), include_groups=False)
    return out[out["n"] >= minn]


rows = []
for c in METRICS:
    a = curve(naive, f"d_{c}", "hm_min")
    b = curve(incl, f"d_{c}", "min")
    for age in a.index:
        r = {"metric": c, "age": int(age), "naive": a.loc[age, "mean"], "n_naive": int(a.loc[age, "n"])}
        if age in b.index:
            r.update(inclusive=b.loc[age, "mean"], n_incl=int(b.loc[age, "n"]))
            # pessimistic bound: leavers at this age imputed with 15th pct of inclusive deltas in same band
            band = age_band([age])[0]
            q15 = incl.loc[incl["band1"] == band, f"d_{c}"].quantile(0.15)
            nl = int((leavers["age1"] == age).sum())
            wl = leavers.loc[leavers["age1"] == age, "min"].sum()
            wi = incl.loc[incl["age1"] == age, "min"].sum()
            r["bound"] = (b.loc[age, "mean"] * wi + q15 * wl) / (wi + wl)
            r["n_leavers"] = nl
        rows.append(r)
curves = pd.DataFrame(rows)
curves.to_csv(RESULTS / "nba_mean_delta_by_age.csv", index=False)

# cumulative curves (sum of deltas) anchored at age 27 = 0, for the 3 estimators
cum = []
for c in METRICS:
    d = curves[curves["metric"] == c].set_index("age").sort_index()
    for est in ["naive", "inclusive", "bound"]:
        s = d[est].dropna()
        s = s[(s.index >= 20) & (s.index <= 38)]
        lvl_ = s.cumsum()
        lvl_ = lvl_ - lvl_.get(27, 0)
        for age, v in lvl_.items():
            cum.append({"metric": c, "estimator": est, "age": age, "level_vs_27": v})
pd.DataFrame(cum).to_csv(RESULTS / "nba_cumulative_curve.csv", index=False)

# ----- heterogeneity (true SD of one-year change) by age band
het = []
for c in ["pbpm", "bpm", "ts", "plays36", "ast36", "tpar", "drb36", "blk36", "stl36", "mpg"]:
    for band, d in naive.dropna(subset=[f"d_{c}"]).groupby("band1"):
        dev = d[f"d_{c}"] - wmean(d[f"d_{c}"], d["hm_min"])
        xx = 1 / d["min"] + 1 / d["n_min"]
        if c == "mpg":
            sd_true = np.sqrt(np.average(dev ** 2, weights=d["hm_min"]))
            k = 0
        else:
            fit = sm.WLS(dev ** 2, sm.add_constant(xx), weights=np.ones(len(d))).fit()
            sd_true = np.sqrt(max(fit.params["const"], 0))
            k = fit.params.iloc[1]
        big = d[(d["min"] >= 1500) & (d["n_min"] >= 1500)]
        het.append({"metric": c, "band": band, "n": len(d), "sd_true": sd_true, "noise_k": k,
                    "sd_raw_1500": float(big[f"d_{c}"].std()) if len(big) > 20 else np.nan,
                    "p95_1500": float(big[f"d_{c}"].quantile(.95)) if len(big) > 20 else np.nan,
                    "p05_1500": float(big[f"d_{c}"].quantile(.05)) if len(big) > 20 else np.nan})
pd.DataFrame(het).to_csv(RESULTS / "nba_heterogeneity.csv", index=False)

# ----- extremes: big jumps / collapses in pseudo-BPM and BPM, high-minute pairs (both >= 1500)
big = naive[(naive["min"] >= 1500) & (naive["n_min"] >= 1500)]
ext = big.groupby("band1").apply(lambda d: pd.Series({
    "n": len(d), "p_up3_bpm": (d["d_bpm"] >= 3).mean(), "p_dn3_bpm": (d["d_bpm"] <= -3).mean(),
    "p_up3_pbpm": (d["d_pbpm"] >= 3).mean(), "p_dn3_pbpm": (d["d_pbpm"] <= -3).mean(),
    "sd_bpm": d["d_bpm"].std(), "sd_pbpm": d["d_pbpm"].std()}), include_groups=False)
ext.to_csv(RESULTS / "nba_extremes.csv")

# ----- cross-skill correlation of changes (structure of progs) for high-minute pairs
CC = ["ts", "tpar", "ftr", "ast36", "tov_pct", "orb36", "drb36", "stl36", "blk36", "plays36"]
cc = big[[f"d_{c}" for c in CC]].dropna()
corr = cc.corr()
corr.to_csv(RESULTS / "nba_delta_corr.csv")
z = (cc - cc.mean()) / cc.std()
ev = np.linalg.eigvalsh(np.corrcoef(z.T.values))[::-1]
mean_offdiag = (corr.values.sum() - len(CC)) / (len(CC) * (len(CC) - 1))

# ----- ability dependence: delta pbpm vs prior level (within age band, regression slope)
abil = []
for band, d in naive.dropna(subset=["d_pbpm", "pbpm"]).groupby("band1"):
    fit = sm.WLS(d["d_pbpm"], sm.add_constant(d["pbpm"]), weights=d["hm_min"]).fit()
    abil.append({"band": band, "slope_on_prior_pbpm": fit.params["pbpm"], "se": fit.bse["pbpm"], "n": len(d)})
pd.DataFrame(abil).to_csv(RESULTS / "nba_ability_slope.csv", index=False)

# ----- subgroup curves (naive, d_pbpm & d_mpg) for audit of player types
sub = []
for grp in ["pos_group", "role", "hgt_t", "draft_t", "level_t", "era", "team_change"]:
    for (gv, band), d in naive.groupby([grp, "band1"]):
        if len(d) < 40:
            continue
        sub.append({"group": grp, "value": str(gv), "band": band, "n": len(d),
                    "d_pbpm": wmean(d["d_pbpm"], d["hm_min"]), "d_bpm": wmean(d["d_bpm"], d["hm_min"]),
                    "d_ts": wmean(d["d_ts"], d["hm_min"]), "d_blk36": wmean(d["d_blk36"], d["hm_min"]),
                    "d_tpar": wmean(d["d_tpar"], d["hm_min"]), "d_mpg": wmean(d["d_mpg"], d["hm_min"])})
pd.DataFrame(sub).to_csv(RESULTS / "nba_subgroup_deltas.csv", index=False)

# ----- longevity & league age distribution
pl = pd.read_parquet(OUT_DATA / "nba_player_seasons.parquet")
pl = pl[pl["season"] >= 1980]
car = pl.groupby("slug").agg(first=("season", "min"), last=("season", "max"), n=("season", "nunique"),
                             debut_age=("age", "min"), final_age=("age", "max"), tot_min=("min", "sum"))
car = car[(car["first"] >= 1980) & (car["first"] <= 2005)]
pl2 = pl[pl["min"] > 0]
hz = pl2[pl2["season"] <= 2023].assign(exit=lambda d: d["season"] == d["slug"].map(car["last"]))
hz = hz[hz["slug"].isin(car.index)]
hz["tier"] = pd.cut(hz["mpg"], [0, 15, 28, 60], labels=["bench", "rotation", "starter"]).astype(str)
hazard = hz.groupby(["age", "tier"])["exit"].agg(["mean", "size"]).reset_index()
hazard = hazard[hazard["size"] >= 25]
hazard.to_csv(RESULTS / "nba_exit_hazard.csv", index=False)
agedist = []
for era, lo, hi in [("2015-25", 2015, 2025), ("2000-14", 2000, 2014), ("1980-99", 1980, 1999)]:
    d = pl[(pl["season"] >= lo) & (pl["season"] <= hi)]
    tot = d["min"].sum()
    for age, dd in d.groupby("age"):
        agedist.append({"era": era, "age": int(age), "min_share": dd["min"].sum() / tot,
                        "player_share": len(dd) / len(d)})
pd.DataFrame(agedist).to_csv(RESULTS / "nba_age_distribution.csv", index=False)
peak = pl[pl["min"] >= 1000].groupby("slug").filter(lambda d: len(d) >= 5)
peak_age = peak.loc[peak.groupby("slug")["bpm"].idxmax(), "age"]

summary = {
    "pairs_naive": int(len(naive)), "pairs_inclusive": int(len(incl)), "leavers": int(len(leavers)),
    "pseudo_bpm_r2_test": r2_test,
    "career_length_seasons": car["n"].describe().round(2).to_dict(),
    "career_final_age_mean": float(car["final_age"].mean()),
    "career_final_age_quantiles": car["final_age"].quantile([.1, .25, .5, .75, .9]).to_dict(),
    "min_weighted_mean_age_2015_25": float(np.average(pl.loc[pl.season >= 2015, "age"], weights=pl.loc[pl.season >= 2015, "min"])),
    "min_weighted_mean_age_1980_2025": float(np.average(pl["age"], weights=pl["min"])),
    "min_share_age_ge_33_2015_25": float(pl.loc[(pl.season >= 2015) & (pl.age >= 33), "min"].sum() / pl.loc[pl.season >= 2015, "min"].sum()),
    "min_share_age_le_22_2015_25": float(pl.loc[(pl.season >= 2015) & (pl.age <= 22), "min"].sum() / pl.loc[pl.season >= 2015, "min"].sum()),
    "peak_bpm_age": peak_age.describe().round(2).to_dict(),
    "delta_corr_mean_offdiag": float(mean_offdiag),
    "delta_corr_first_eigen_share": float(ev[0] / ev.sum()),
}
dump_json(summary, RESULTS / "nba_summary.json")
pd.set_option("display.width", 220)
print(curves[curves.metric == "pbpm"].round(3).to_string())
print(pd.DataFrame(het).query("metric in ['pbpm','bpm']").round(3).to_string())
print(ext.round(3))
print(summary)
