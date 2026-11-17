"""GameSim mechanism probes (sim/output/jac__*): response of a player's box-score profile to a single-rating
perturbation with rotation inputs (valueNoPot, roster order) frozen.

Estimator (per perturbation, save, seed): DiD = [mean(treated) - mean(untreated)]_perturbed
                                              - [mean(treated) - mean(untreated)]_base   (minutes-weighted)
so league-wide shifts and the treated/untreated composition cancel. SE from the spread over save x seed.
Also: (i) the structural three-point ceiling and the 3PA choice rule (index.ts: P(3PA) = 0.67 x scaled(
shootingThreePointer) x threePointTendencyFactor, decided BEFORE rim/post/mid and independent of them);
(ii) specialists audit: real players whose real 3PA rate exceeds what the rule can produce.
Outputs: results/gamesim_response.csv, results/gamesim_3pt_ceiling.json
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import OUT_DATA, RESULTS, SIM_OUT, SAVES, dump_json
from profile import box_metrics, read_gz_csv

# local runs (Node 25, M1) and cloud runs (Node 24, GitHub runner) are each paired with their OWN base runs:
# GameSim output is deterministic per environment but not bit-identical across Node versions.
CLOUD = SIM_OUT.parent / "output_cloud" / "probes"
local_files = [f for f in sorted(SIM_OUT.glob("jac__*.csv.gz")) if "sorted__" not in f.name]
cloud_files = sorted(CLOUD.glob("jac__*.csv.gz")) if CLOUD.exists() else []
J = pd.concat([read_gz_csv(f).assign(source="local") for f in local_files] +
              [read_gz_csv(f).assign(source="cloud") for f in cloud_files], ignore_index=True)
J["save_file"] = J["save"]
J["save"] = J["source"] + ":" + J["save"]
J["age"] = J["age"]
J = pd.concat([box_metrics(g) for _, g in J.groupby(["save", "perturb", "seed"])], ignore_index=True)
J["rim_share"] = J["fgaAtRim"] / J["fga"].replace(0, np.nan)
J["post_share"] = J["fgaLowPost"] / J["fga"].replace(0, np.nan)
J["mid_share"] = J["fgaMidRange"] / J["fga"].replace(0, np.nan)
OUTS = ["mpg", "plays36", "pts36", "ts", "tpar", "rim_share", "post_share", "mid_share", "ftr", "ast36", "tov_pct", "stl36", "blk36",
        "drb36", "orb36", "pbpm"]
J = J[J["min"] >= 300]


def gap(d, c):
    t, u = d[d["treated"] == 1], d[d["treated"] == 0]
    return np.average(t[c].dropna(), weights=t.loc[t[c].notna(), "min"]) - np.average(u[c].dropna(), weights=u.loc[u[c].notna(), "min"])


rows = []
base = {(s, sd): d for (s, p, sd), d in J.groupby(["save", "perturb", "seed"]) if p == "base"}
for (save, pert, seed), d in J.groupby(["save", "perturb", "seed"]):
    if pert == "base" or (save, seed) not in base:
        continue
    b = base[(save, seed)]
    rows.append({"perturb": pert, "save": save, "seed": seed, **{c: gap(d, c) - gap(b, c) for c in OUTS}})
R = pd.DataFrame(rows)
summ = R.groupby("perturb")[OUTS].agg(["mean", "sem"])
flat = []
for pert, r in summ.iterrows():
    for c in OUTS:
        flat.append({"perturb": pert, "metric": c, "effect": r[(c, "mean")], "se": r[(c, "sem")]})
F = pd.DataFrame(flat)
F.to_csv(RESULTS / "gamesim_response.csv", index=False)

# the 3-point audit below uses the local base runs only (one environment)
J = J[J["source"] == "local"].assign(save=lambda d: d["save_file"])

# ---- three-point ceiling implied by the choice rule (no forced/late-clock threes, factor = 1)
def p3(comp):
    s = comp if comp <= 0.55 else 0.55 + (comp - 0.55) * (0.3 / 0.45)
    s2 = s * (0.1 / 0.35) if s < 0.35 else (0.1 + (s - 0.35) * (0.35 / 0.1) if s < 0.45 else s)
    return 0.67 * s2


ceil = {"p3_at_composite_1.0": p3(1.0), "p3_at_tp90_oiq70": p3((0.1 * 70 + 90) / 110), "p3_at_tp80_oiq60": p3((0.1 * 60 + 80) / 110)}
# specialists: real 3PA rate vs the rule's prediction for their ratings (league factor read from each save)
import gzip
fac = {}
for f in sorted({*J["save"].unique()}):
    d = json.load(gzip.open(SAVES / f))
    ga = d["gameAttributes"]
    ga = {x["key"]: x["value"] for x in ga} if isinstance(ga, list) else ga
    v = ga.get("threePointTendencyFactor", 1)
    fac[f] = v[-1]["value"] if isinstance(v, list) else v
real = pd.read_parquet(OUT_DATA / "nba_player_seasons.parquet")[["slug", "season", "tpar", "min", "name"]]
SEAS = {"BBGM_League_11_2022_preseason.json.gz": 2022, "BBGM_League_10_2023_preseason.json.gz": 2023, "BBGM_League_9_2024_preseason.json.gz": 2024,
        "BBGM_League_8_2025_preseason.json.gz": 2025, "BBGM_League_8_2026_preseason.json.gz": 2026}
b = J[J["perturb"] == "base"].groupby(["save", "srID"]).agg(tpar_sim=("tpar", "mean"), r_tp=("r_tp", "first"), r_oiq=("r_oiq", "first"),
                                                            r_fg=("r_fg", "first"), min_sim=("min", "mean")).reset_index()
b["season"] = b["save"].map(SEAS)
b["factor"] = b["save"].map(fac)
b["p3_rule"] = [p3((0.1 * o + t) / 110) * f for t, o, f in zip(b["r_tp"], b["r_oiq"], b["factor"])]
m = b.merge(real.rename(columns={"slug": "srID"}), on=["srID", "season"])
m = m[(m["min"] >= 1000)]
ceil.update({"league_threePointTendencyFactor": fac, "max_rule_p3_with_factor": {k: p3(1.0) * v for k, v in fac.items()},
             "share_real_tpar_above_rule_max": float((m["tpar"] > m["factor"] * p3(1.0) + 0.05).mean()),
             "n_real_ge_0.6": int((m["tpar"] >= 0.6).sum()), "sim_tpar_of_real_ge_0.6_mean": float(m.loc[m["tpar"] >= 0.6, "tpar_sim"].mean()),
             "real_tpar_of_real_ge_0.6_mean": float(m.loc[m["tpar"] >= 0.6, "tpar"].mean()),
             "corr_sim_rule": float(np.corrcoef(m["tpar_sim"], m["p3_rule"])[0, 1])})
m.sort_values("tpar", ascending=False).head(25).to_csv(RESULTS / "gamesim_3pt_specialists.csv", index=False)
dump_json(ceil, RESULTS / "gamesim_3pt_ceiling.json")
pd.set_option("display.width", 250)
piv = F.pivot_table(index="perturb", columns="metric", values="effect")
print(piv[["mpg", "plays36", "pts36", "ts", "tpar", "rim_share", "mid_share", "post_share", "ast36", "stl36", "blk36", "pbpm"]].round(3).to_string())
print(F.pivot_table(index="perturb", columns="metric", values="se")[["plays36", "tpar", "pbpm"]].round(3))
print(json.dumps({k: v for k, v in ceil.items() if not isinstance(v, dict)}, indent=1))
