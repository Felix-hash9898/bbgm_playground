"""Vectorised Python ports of BBGM basketball developSeason (one call = one offseason).

OFFICIAL  = zengm-games/zengm 205d18eb  (identical behaviour to merge-base a94224c6e)
PLAYGROUND = Felix-hash9898/bbgm_playground 363bcbc6
Validated against the TypeScript originals by sim/aging_arms.test.ts (mode=port_check) and
scripts/03_port_check.py.  Ratings are integers; limitRating floors (Math.floor) and clips 0..100.

The structure of every formula is:
    base = calcBaseChange(age) + noise(age)          # ONE draw per player-season (shared by all ratings)
    base *= 1 + sign(base) * coachingEffect           # coachingEffect = 0 at default level
    for each rating k:  r_k += bound((base + ageMod_k(age)) * U(0.4, 1.4), lo_k, hi_k);  r_k = floor(clip)
    hgt: +1 with p=.01 at age<=20, another +1 with p=.001 at age<=21
"""
from __future__ import annotations

import numpy as np

KEYS = ["stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"]


def _step(age, edges, vals):
    """Piecewise constant: first i with age <= edges[i] -> vals[i]; else vals[-1]."""
    age = np.asarray(age)
    out = np.full(age.shape, vals[-1], dtype=float)
    for e, v in zip(reversed(edges), reversed(vals[: len(edges)])):
        out = np.where(age <= e, v, out)
    return out


def realgauss(rng, size, mu=0.0, sigma=1.0):
    return rng.normal(mu, sigma, size)


# ---------------------------------------------------------------- OFFICIAL
def official_base(age):
    return _step(age, [21, 25, 27, 29, 31, 34, 40, 43], [2, 1, 0, -1, -2, -3, -4, -5, -6])


def official_mods(age, rng):
    n = np.shape(age)
    shoot = _step(age, [27, 29, 31], [0, 0.5, 1.5, 2])
    iq = _step(age, [21, 23, 27, 29, 31], [4, 3, 0, 0.5, 1.5, 2])
    endu = np.where(age <= 23, rng.uniform(0, 9, n), _step(age, [30, 35, 40], [0, -2, -4, -8]))
    return {
        "stre": np.zeros(n), "spd": _step(age, [27, 30, 35, 40], [0, -2, -3, -4, -8]),
        "jmp": _step(age, [26, 30, 35, 40], [0, -3, -4, -5, -10]), "endu": endu,
        "dnk": _step(age, [27], [0, 0.5]), "ins": shoot, "ft": shoot, "fg": shoot, "tp": shoot,
        "oiq": iq, "diq": iq, "drb": shoot, "pss": shoot, "reb": shoot,
    }


def common_limits(age):
    iq_hi = np.where(age >= 24, 9, 7 + 5 * (24 - np.asarray(age)))
    inf = np.inf
    return {"stre": (-inf, inf), "spd": (-12, 2), "jmp": (-12, 2), "endu": (-11, 19), "dnk": (-3, 13),
            "ins": (-3, 13), "ft": (-3, 13), "fg": (-3, 13), "tp": (-3, 13), "oiq": (-3, iq_hi),
            "diq": (-3, iq_hi), "drb": (-2, 5), "pss": (-2, 5), "reb": (-2, 5)}


# ---------------------------------------------------------------- PLAYGROUND
def playground_base(age):
    return _step(age, [21, 25, 28, 31, 35, 40, 43], [2, 1, 0, -1, -2, -3, -4, -5])


def playground_mods(age, rng):
    n = np.shape(age)
    shoot = _step(age, [28, 31, 35], [0, 0.5, 1.5, 2])
    iq = _step(age, [21, 23, 28, 31, 35, 40], [4, 3, 0, 1, 2, 2.5, 2])
    athl = _step(age, [27, 28, 30, 32, 35, 38, 40], [0, -0.5, -1.5, -1.5, -2.0, -2.5, -3.5, -7.0])
    endu = np.where(age <= 23, rng.uniform(0, 9, n), _step(age, [31, 33, 36, 41], [0, -1, -2, -4, -8]))
    return {
        "stre": _step(age, [25, 32, 36], [1, 1.5, 0.5, 0]), "spd": athl, "jmp": athl.copy(), "endu": endu,
        "dnk": _step(age, [28], [0, 0.5]), "ins": shoot, "ft": shoot, "fg": shoot, "tp": shoot,
        "oiq": iq, "diq": iq, "drb": shoot, "pss": shoot, "reb": shoot,
    }


def playground_limits(age):
    lim = common_limits(age)
    lim["stre"] = (-8, 12)
    return lim


def noise(age, rng):
    n = np.shape(age)
    z = rng.normal(0, 1, n)
    young = np.clip(5 * z, -4, 20)
    mid = np.clip(5 * z, -4, 10)
    old = np.clip(3 * z, -2, 4)
    return np.where(age <= 23, young, np.where(age <= 25, mid, old))


FORMULAS = {
    "official": dict(base=official_base, mods=official_mods, limits=common_limits, noise=noise),
    "playground": dict(base=playground_base, mods=playground_mods, limits=playground_limits, noise=noise),
}


def develop_season(R: dict[str, np.ndarray], age: np.ndarray, rng: np.random.Generator,
                   formula: str | dict = "official", coaching_effect: float = 0.0,
                   per_rating_factor: bool = True) -> dict[str, np.ndarray]:
    """Return a NEW ratings dict after one offseason. R values are float arrays of integer ratings."""
    f = FORMULAS[formula] if isinstance(formula, str) else formula
    age = np.asarray(age)
    n = age.shape
    out = {k: np.asarray(v, float).copy() for k, v in R.items()}
    # height
    if "hgt" in out:
        u = rng.uniform(0, 1, n)
        out["hgt"] = out["hgt"] + ((u > 0.99) & (age <= 20) & (out["hgt"] <= 99)) * 1.0
        out["hgt"] = out["hgt"] + ((u > 0.999) & (age <= 21) & (out["hgt"] <= 99)) * 1.0
    base = f["base"](age) + f["noise"](age, rng)
    base = base * (1 + np.sign(base) * coaching_effect)
    mods = f["mods"](age, rng)
    lims = f["limits"](age)
    for k in KEYS:
        lo, hi = lims[k]
        mult = rng.uniform(0.4, 1.4, n)
        if "rating_noise_sd" in f:  # candidate formulas may add rating-specific idiosyncratic noise
            extra = rng.normal(0, 1, n) * f["rating_noise_sd"](age, k)
        else:
            extra = 0.0
        delta = np.clip((base + mods[k]) * mult + extra, lo, hi)
        out[k] = np.floor(np.clip(out[k] + delta, 0, 100))
    return out
