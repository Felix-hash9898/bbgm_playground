"""Design candidate formulas using ONLY the NBA fit half (players hashed to 'fit').

1. Target: fit-half NBA 'inclusive' mean change of pseudo-BPM by age (survivor-robust estimator matching
   the attrition-free step design), smoothed by a weighted cubic in age (20-39), converted to an OVR target
   with the GameSim step conversion d_pbpm = 0.073 + 0.365 * d_ovr (results/step pairs; both baselines).
2. For each candidate structure, the per-age base table is solved (bisection, common random numbers) so
   the emulator's mean one-year OVR change on real starting ratings (2005-2025) equals the target.
   Thus A, B, C share the same mean OVR curve and differ only in variance / rating composition.
3. Verifies the spec interpreter reproduces the Official and Playground ports.
Writes sim/formulas/candidate_specs.json and results/candidate_design.json.
"""
from __future__ import annotations

import copy
import json

import numpy as np
import pandas as pd

from bbgm_dev import KEYS, develop_season
from cand_specs import OFFICIAL, PLAYGROUND, T, develop_spec, with_base
from common import HERE, OUT_DATA, RESULTS, bbgm_ovr, dump_json, wmean

# ---- 1. fit-half target
pr = pd.read_parquet(OUT_DATA / "nba_pairs.parquet")
pr = pr[pr["split"] == "fit"]
incl = pr[(pr["min"] >= 500) & pr["consecutive"] & (pr["n_min"] >= 50)].dropna(subset=["d_pbpm"])
naive = pr[pr["consecutive"] & (pr["min"] >= 250) & (pr["n_min"] >= 250)].dropna(subset=["d_pbpm"])
g = incl.groupby("age1").apply(lambda d: pd.Series({"m": wmean(d["d_pbpm"], d["min"]), "n": len(d)}), include_groups=False)
g = g[(g.index >= 20) & (g.index <= 39) & (g["n"] >= 20)]
coef = np.polyfit(g.index.values, g["m"].values, 3, w=np.sqrt(g["n"].values))
poly = np.poly1d(coef)
ages = np.arange(19, 46)
t_pbpm = {}
for a in ages:
    if a < 20:
        t_pbpm[a] = float(poly(20))
    elif a <= 39:
        t_pbpm[a] = float(poly(a))
    else:
        t_pbpm[a] = float(poly(39)) - 0.25 * (a - 39)  # extrapolation beyond the data: steady extra decline
SLOPE, ICPT = 0.365, 0.073
t_ovr = {a: (v - ICPT) / SLOPE for a, v in t_pbpm.items()}

# ---- starting population: real ratings rows 2005-2025 with NBA minutes (one row = one starting player)
r = pd.read_parquet(OUT_DATA / "bbgm_real_ratings.parquet")
r = r[(r["season"].between(2005, 2025)) & r["has_nba_stats"] & (r["min"] >= 250)]
POP = {a: r[r["age"] == a - 1] for a in ages}
for a in ages:  # thin cells at the extremes borrow the nearest ages
    if len(POP[a]) < 150:
        lo, hi = (a - 4, a + 1) if a > 30 else (a - 1, a + 3)
        POP[a] = r[r["age"].between(lo - 1, hi - 1)]
REPS = 30


def mean_dovr(spec, age, seed=11):
    d = POP[age]
    R0 = {k: np.repeat(d[k].to_numpy(float), REPS) for k in ["hgt"] + KEYS}
    rng = np.random.default_rng(seed + age)
    R1 = develop_spec(R0, np.full(len(R0["hgt"]), age), rng, spec)
    dv = bbgm_ovr(R1) - bbgm_ovr(R0)
    return float(dv.mean()), float(dv.std())


def solve_base(spec):
    bases = {}
    for a in ages:
        lo, hi = -12.0, 10.0
        for _ in range(22):
            mid = (lo + hi) / 2
            s = with_base(spec, {**{x: 0 for x in ages}, a: mid})
            m, _ = mean_dovr(s, a)
            if m < t_ovr[a]:
                lo = mid
            else:
                hi = mid
        bases[int(a)] = round((lo + hi) / 2, 2)
    return with_base(spec, bases)


# ---- 3. interpreter check against the ports (means and SDs of d_ovr per age)
check = []
for name, spec in [("official", OFFICIAL), ("playground", PLAYGROUND)]:
    for a in [20, 23, 26, 29, 32, 35, 38]:
        d = POP[a]
        R0 = {k: np.repeat(d[k].to_numpy(float), REPS) for k in ["hgt"] + KEYS}
        ag = np.full(len(R0["hgt"]), a)
        x1 = bbgm_ovr(develop_spec(R0, ag, np.random.default_rng(1), spec)) - bbgm_ovr(R0)
        x2 = bbgm_ovr(develop_season(R0, ag, np.random.default_rng(2), name)) - bbgm_ovr(R0)
        check.append({"formula": name, "age": a, "spec_mean": x1.mean(), "port_mean": x2.mean(), "spec_sd": x1.std(), "port_sd": x2.std(),
                      "z": (x1.mean() - x2.mean()) / np.sqrt((x1.var() + x2.var()) / len(x1))})
check = pd.DataFrame(check)
assert check["z"].abs().max() < 4, check

# ---- 2. candidates
A = solve_base(copy.deepcopy(PLAYGROUND))

B0 = copy.deepcopy(PLAYGROUND)
B0["noise"] = [{"maxAge": 23, "sd": 2.5, "lo": -2, "hi": 10}, {"maxAge": 25, "sd": 2.5, "lo": -2, "hi": 5},
               {"maxAge": 999, "sd": 1.5, "lo": -1, "hi": 2}]
B0["mult"] = [0.6, 1.2]
B = solve_base(B0)

C0 = copy.deepcopy(B0)
m = C0["mods"]
m["stre"] = T([23, 28], [-0.5, 0.5, 0])
ath = T([23, 27, 28, 30, 32, 35, 38, 40], [-1, 0, -0.5, -1.5, -1.0, -1.25, -1.75, -2.75, -6.0])
m["spd"], m["jmp"] = ath, copy.deepcopy(ath)
m["diq"] = T([23, 28, 31, 35, 40], [1, 0, 1, 2, 2.5, 2])
m["reb"] = T([23, 28, 31, 35], [-0.5, 0, 0.5, 1.5, 2])
inside = T([23, 28, 31, 35], [0.5, 0, 0, 0.5, 1])
for k in ["ins", "fg", "drb"]:
    m[k] = copy.deepcopy(inside)
m["dnk"] = T([23, 28, 31], [0.5, 0, -0.5, 0])
for k in ["tp", "ft", "pss"]:
    m[k] = T([23, 28, 31, 35], [0.5, 0, 0.5, 1.5, 2])
C0["idio"] = {k: T([25], [1.5, 1.0]) for k in ["tp", "fg", "ins", "dnk", "drb", "pss"]}
C = solve_base(C0)

specs = {"cand_A_mean": A, "cand_B_mean_lowvar": B, "cand_C_mean_lowvar_types": C}
# official_spec: the Official formula expressed in the data-spec interpreter (validation arm for the TS port check)
(HERE / "sim" / "formulas" / "candidate_specs.json").write_text(json.dumps({**specs, "official_spec": OFFICIAL}, indent=1) + "\n")

summ = {"target_pbpm_poly_coef": coef.tolist(), "conversion": {"slope": SLOPE, "intercept": ICPT},
        "target_pbpm": {int(k): round(v, 3) for k, v in t_pbpm.items()}, "target_ovr": {int(k): round(v, 3) for k, v in t_ovr.items()},
        "interpreter_check_max_abs_z": float(check["z"].abs().max()),
        "emulated": {}}
for name, spec in [("official", OFFICIAL), ("playground", PLAYGROUND), *specs.items()]:
    summ["emulated"][name] = {int(a): [round(x, 3) for x in mean_dovr(spec, a, seed=99)] for a in [20, 22, 24, 26, 28, 30, 32, 34, 36, 38]}
dump_json(summ, RESULTS / "candidate_design.json")
print(json.dumps(summ["target_ovr"]))
print(pd.DataFrame({k: {a: v[0] for a, v in d.items()} for k, d in summ["emulated"].items()}).round(2))
print(pd.DataFrame({k: {a: v[1] for a, v in d.items()} for k, d in summ["emulated"].items()}).round(2))
print({k: v["base"] for k, v in specs.items()})
