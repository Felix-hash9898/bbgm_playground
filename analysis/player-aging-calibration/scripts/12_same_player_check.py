"""Same-player, selection-matched test (the most direct one available).

For real players in the 2022/2023/2024 real-roster saves: the simulated one-year change (step design,
arm X vs arm 'none', env-corrected pseudo-BPM) is compared with THE SAME players' actual change from
season s to s+1 in the NBA (league-adjusted, from nba_pairs). Only players with >= 250 min in both
seasons in BOTH worlds are kept, so survivor selection is identical by construction. Split by the
player hash into fit/test; the test half is the independent evaluation.
Output: results/same_player_check.csv, results/same_player_summary.json
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import OUT_DATA, RESULTS, dump_json, player_split

SEASON = {"BBGM_League_11_2022_preseason.json.gz": 2022, "BBGM_League_10_2023_preseason.json.gz": 2023,
          "BBGM_League_9_2024_preseason.json.gz": 2024}
sp = pd.read_parquet(OUT_DATA / "step_pairs.parquet")
sp = sp[sp["save"].isin(SEASON)].copy()
sp["season"] = sp["save"].map(SEASON)
sp = sp[(sp["min"] >= 250) & (sp["n_min"] >= 250)]
sim = sp.groupby(["arm", "srID", "season"]).agg(d_sim=("d_pbpm", "mean"), d_mpg_sim=("d_mpg", "mean"),
                                                 d_plays_sim=("d_plays36", "mean"), age1=("age1", "first")).reset_index()
real = pd.read_parquet(OUT_DATA / "nba_pairs.parquet")
real = real[real["consecutive"] & (real["min"] >= 250) & (real["n_min"] >= 250)]
real = real[["slug", "season", "d_pbpm", "d_mpg", "d_plays36", "hm_min", "band1", "pos_group"]].rename(columns={"slug": "srID"})
m = sim.merge(real, on=["srID", "season"])
m["split"] = m["srID"].map(player_split)
m.to_csv(RESULTS / "same_player_check.csv", index=False)
rows = []
for (arm, split, band), d in m.groupby(["arm", "split", "band1"]):
    w = d["hm_min"]
    rows.append({"arm": arm, "split": split, "band": band, "n": len(d),
                 "sim": np.average(d["d_sim"], weights=w), "real": np.average(d["d_pbpm"], weights=w),
                 "se_diff": np.sqrt(np.average((d["d_sim"] - d["d_pbpm"] - np.average(d["d_sim"] - d["d_pbpm"], weights=w)) ** 2, weights=w) / len(d)),
                 "sim_mpg": np.average(d["d_mpg_sim"], weights=w), "real_mpg": np.average(d["d_mpg"], weights=w),
                 "sim_plays": np.average(d["d_plays_sim"], weights=w), "real_plays": np.average(d["d_plays36"], weights=w),
                 "corr_sim_real": d["d_sim"].corr(d["d_pbpm"])})
t = pd.DataFrame(rows)
t["bias"] = t["sim"] - t["real"]
t.to_csv(RESULTS / "same_player_bands.csv", index=False)
summ = {}
for (arm, split), d in t.groupby(["arm", "split"]):
    summ[f"{arm}|{split}"] = {"rmse_bias": float(np.sqrt(np.average(d["bias"] ** 2, weights=d["n"]))), "n": int(d["n"].sum())}
dump_json(summ, RESULTS / "same_player_summary.json")
pd.set_option("display.width", 250)
print(t[t.split == "test"].pivot_table(index="band", columns="arm", values="bias").round(2))
print(t[t.split == "test"].pivot_table(index="band", columns="arm", values=["real", "se_diff", "n"]).round(2).iloc[:, [0, 5, 10]])
print({k: v for k, v in summ.items()})
