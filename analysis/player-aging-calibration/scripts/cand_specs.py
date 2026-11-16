"""Data-driven development specs shared by the Python emulator and the TS harness
(sim/formulas/candidates.ts interprets the same JSON). Includes data versions of the Official and
Playground formulas, used to verify that the spec interpreter reproduces both exactly."""
from __future__ import annotations

import copy

import numpy as np

from bbgm_dev import KEYS


def T(edges, vals):
    return {"edges": list(edges), "vals": list(vals)}


def look(t, age):
    age = np.asarray(age)
    out = np.full(age.shape, float(t["vals"][-1]))
    for e, v in zip(reversed(t["edges"]), reversed(t["vals"][: len(t["edges"])])):
        out = np.where(age <= e, float(v), out)
    return out


NOISE_BBGM = [{"maxAge": 23, "sd": 5, "lo": -4, "hi": 20}, {"maxAge": 25, "sd": 5, "lo": -4, "hi": 10},
              {"maxAge": 999, "sd": 3, "lo": -2, "hi": 4}]
LIM = {"stre": [-1e9, 1e9], "spd": [-12, 2], "jmp": [-12, 2], "endu": [-11, 19], "dnk": [-3, 13], "ins": [-3, 13],
       "ft": [-3, 13], "fg": [-3, 13], "tp": [-3, 13], "oiq": "iq", "diq": "iq", "drb": [-2, 5], "pss": [-2, 5], "reb": [-2, 5]}

_os = T([27, 29, 31], [0, 0.5, 1.5, 2])
_oiq = T([21, 23, 27, 29, 31], [4, 3, 0, 0.5, 1.5, 2])
OFFICIAL = {
    "base": T([21, 25, 27, 29, 31, 34, 40, 43], [2, 1, 0, -1, -2, -3, -4, -5, -6]), "noise": NOISE_BBGM, "mult": [0.4, 1.4],
    "mods": {"stre": T([], [0]), "spd": T([27, 30, 35, 40], [0, -2, -3, -4, -8]), "jmp": T([26, 30, 35, 40], [0, -3, -4, -5, -10]),
             "endu": T([30, 35, 40], [0, -2, -4, -8]), "dnk": T([27], [0, 0.5]), "ins": _os, "ft": _os, "fg": _os, "tp": _os,
             "oiq": _oiq, "diq": _oiq, "drb": _os, "pss": _os, "reb": _os},
    "limits": dict(LIM), "enduYoungUniform": True,
}
_ps = T([28, 31, 35], [0, 0.5, 1.5, 2])
_piq = T([21, 23, 28, 31, 35, 40], [4, 3, 0, 1, 2, 2.5, 2])
_path = T([27, 28, 30, 32, 35, 38, 40], [0, -0.5, -1.5, -1.5, -2.0, -2.5, -3.5, -7.0])
PLAYGROUND = {
    "base": T([21, 25, 28, 31, 35, 40, 43], [2, 1, 0, -1, -2, -3, -4, -5]), "noise": NOISE_BBGM, "mult": [0.4, 1.4],
    "mods": {"stre": T([25, 32, 36], [1, 1.5, 0.5, 0]), "spd": _path, "jmp": _path, "endu": T([31, 33, 36, 41], [0, -1, -2, -4, -8]),
             "dnk": T([28], [0, 0.5]), "ins": _ps, "ft": _ps, "fg": _ps, "tp": _ps, "oiq": _piq, "diq": _piq, "drb": _ps, "pss": _ps, "reb": _ps},
    "limits": {**LIM, "stre": [-8, 12]}, "enduYoungUniform": True,
}


def develop_spec(R, age, rng, spec):
    age = np.asarray(age)
    n = age.shape
    out = {k: np.asarray(v, float).copy() for k, v in R.items()}
    u = rng.uniform(0, 1, n)
    out["hgt"] = out["hgt"] + ((u > 0.99) & (age <= 20) & (out["hgt"] <= 99)) * 1.0
    out["hgt"] = out["hgt"] + ((u > 0.999) & (age <= 21) & (out["hgt"] <= 99)) * 1.0
    z = rng.normal(0, 1, n)
    nz = np.zeros(n)
    done = np.zeros(n, bool)
    for e in spec["noise"]:
        m = (age <= e["maxAge"]) & ~done
        nz = np.where(m, np.clip(e["sd"] * z, e["lo"], e["hi"]), nz)
        done |= m
    base = look(spec["base"], age) + nz
    for k in KEYS:
        mod = look(spec["mods"][k], age)
        if k == "endu" and spec.get("enduYoungUniform"):
            mod = np.where(age <= 23, rng.uniform(0, 9, n), mod)
        lim = spec["limits"][k]
        if lim == "iq":
            lo, hi = -3.0, np.where(age >= 24, 9.0, 7 + 5 * (24 - age))
        else:
            lo, hi = lim
        mult = rng.uniform(spec["mult"][0], spec["mult"][1], n)
        idio_t = (spec.get("idio") or {}).get(k)
        shock = rng.normal(0, 1, n) * look(idio_t, age) if idio_t else 0.0
        out[k] = np.floor(np.clip(out[k] + np.clip((base + mod) * mult + shock, lo, hi), 0, 100))
    return out


def with_base(spec, base_by_age: dict[int, float]):
    s = copy.deepcopy(spec)
    ages = sorted(base_by_age)
    s["base"] = T(ages[:-1], [round(base_by_age[a], 3) for a in ages])
    return s
