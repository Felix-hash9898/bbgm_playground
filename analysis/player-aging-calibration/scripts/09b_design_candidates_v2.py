"""Round-2 candidate design with a TEMPORAL hold-out.

Targets use ONLY NBA pairs whose second season is <= 2018 (all players). Every pair with first season
>= 2019 (second season 2020-2025), including the 2022-2024 seasons of the same-player check, is unseen.
The OVR conversion (d_pbpm = 0.073 + 0.365 d_ovr) comes from round-1 GameSim pairs (no NBA data).

Specs (added to sim/formulas/candidate_specs.json; round-1 specs kept unchanged for reproducibility):
  A2        Playground structure, per-age base solved to the <=2018 target (research table)
  A2r       A2 base averaged within bands and rounded to 0.1 (the implementable table that is tested)
  B2        A2r + shared noise halved and multiplier U(0.6,1.2), base re-solved
  pg_stre   Playground + ONLY: stre ageModifier 0 from age 29 (bonus kept <= 28)
  pg_diq    Playground + ONLY: diq ageModifier +1 at ages <= 23 (was +4 / +3); oiq unchanged
  A2r_stre  A2r + the stre change (no re-solve: isolates the stre effect on top of A2r)
"""
from __future__ import annotations

import copy
import json

import numpy as np
import pandas as pd

from bbgm_dev import KEYS
from cand_specs import PLAYGROUND, T, develop_spec, with_base
from common import HERE, OUT_DATA, RESULTS, bbgm_ovr, dump_json, wmean

pr = pd.read_parquet(OUT_DATA / "nba_pairs.parquet")
train = pr[pr["season1"] <= 2018]
incl = train[(train["min"] >= 500) & train["consecutive"] & (train["n_min"] >= 50)].dropna(subset=["d_pbpm"])
g = incl.groupby("age1").apply(lambda d: pd.Series({"m": wmean(d["d_pbpm"], d["min"]), "n": len(d)}), include_groups=False)
g = g[(g.index >= 20) & (g.index <= 39) & (g["n"] >= 20)]
poly = np.poly1d(np.polyfit(g.index.values, g["m"].values, 3, w=np.sqrt(g["n"].values)))
ages = np.arange(19, 46)
t_pbpm = {a: float(poly(max(a, 20))) if a <= 39 else float(poly(39)) - 0.25 * (a - 39) for a in ages}
t_ovr = {a: (v - 0.073) / 0.365 for a, v in t_pbpm.items()}

r = pd.read_parquet(OUT_DATA / "bbgm_real_ratings.parquet")
r = r[(r["season"].between(2005, 2018)) & r["has_nba_stats"] & (r["min"] >= 250)]  # starting ratings: training seasons only
POP = {}
for a in ages:
    POP[a] = r[r["age"] == a - 1]
    if len(POP[a]) < 150:
        lo, hi = (a - 4, a + 1) if a > 30 else (a - 1, a + 3)
        POP[a] = r[r["age"].between(lo - 1, hi - 1)]
REPS = 30


def mean_dovr(spec, age, seed=11):
    d = POP[age]
    R0 = {k: np.repeat(d[k].to_numpy(float), REPS) for k in ["hgt"] + KEYS}
    R1 = develop_spec(R0, np.full(len(R0["hgt"]), age), np.random.default_rng(seed + age), spec)
    dv = bbgm_ovr(R1) - bbgm_ovr(R0)
    return float(dv.mean()), float(dv.std())


def solve_base(spec, cap=(-8.0, 8.0)):
    bases = {}
    for a in ages:
        lo, hi = cap
        for _ in range(22):
            mid = (lo + hi) / 2
            m, _ = mean_dovr(with_base(spec, {**{x: 0 for x in ages}, a: mid}), a)
            lo, hi = (mid, hi) if m < t_ovr[a] else (lo, mid)
        bases[int(a)] = round((lo + hi) / 2, 2)
    return with_base(spec, bases)


BANDS = [(19, 22), (23, 25), (26, 27), (28, 28), (29, 31), (32, 35), (36, 40), (41, 43), (44, 99)]


def band_round(spec):
    vals = dict(zip(spec["base"]["edges"] + [45], spec["base"]["vals"]))
    edges, out = [], []
    for lo, hi in BANDS:
        xs = [vals[a] for a in range(lo, min(hi, 45) + 1) if a in vals and a < 44]
        v = round(float(np.mean(xs)), 1) if xs else out[-1] - 1.0
        edges.append(hi)
        out.append(v)
    s = copy.deepcopy(spec)
    s["base"] = T(edges[:-1], out)
    return s


A2 = solve_base(copy.deepcopy(PLAYGROUND))
A2r = band_round(A2)
B0 = copy.deepcopy(A2r)
B0["noise"] = [{"maxAge": 23, "sd": 2.5, "lo": -2, "hi": 10}, {"maxAge": 25, "sd": 2.5, "lo": -2, "hi": 5},
               {"maxAge": 999, "sd": 1.5, "lo": -1, "hi": 2}]
B0["mult"] = [0.6, 1.2]
B2 = band_round(solve_base(B0))
pg_stre = copy.deepcopy(PLAYGROUND)
pg_stre["mods"]["stre"] = T([25, 28], [1, 1.5, 0])
pg_diq = copy.deepcopy(PLAYGROUND)
pg_diq["mods"]["diq"] = T([23, 28, 31, 35, 40], [1, 0, 1, 2, 2.5, 2])
A2r_stre = copy.deepcopy(A2r)
A2r_stre["mods"]["stre"] = T([25, 28], [1, 1.5, 0])

path = HERE / "sim" / "formulas" / "candidate_specs.json"
specs = json.loads(path.read_text())
new = {"A2": A2, "A2r": A2r, "B2": B2, "pg_stre": pg_stre, "pg_diq": pg_diq, "A2r_stre": A2r_stre}
specs.update(new)
path.write_text(json.dumps(specs, indent=1) + "\n")

emu = {name: {int(a): round(mean_dovr(s, a, 99)[0], 2) for a in [20, 22, 24, 26, 28, 30, 32, 34, 36, 38]}
       for name, s in [("playground", PLAYGROUND), *new.items()]}
dump_json({"train_pairs": int(len(incl)), "target_pbpm": {int(k): round(v, 3) for k, v in t_pbpm.items()},
           "target_ovr": {int(k): round(v, 3) for k, v in t_ovr.items()},
           "bases": {k: v["base"] for k, v in new.items()}, "emulated_mean_dovr": emu}, RESULTS / "candidate_design_v2.json")
print(pd.DataFrame(emu).round(2))
print({k: v["base"] for k, v in new.items() if k in ("A2r", "B2")})
