"""Shared paths and helpers for the player-aging calibration study (read-only inputs)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent.parent  # analysis/player-aging-calibration
REPO = HERE.parent.parent
DATA_IN = REPO / "data"
SAVES = REPO / "real_saves"
OUT_DATA = HERE / "data"
RESULTS = HERE / "results"
FIGS = HERE / "figures"
SIM_OUT = HERE / "sim" / "output"
for d in (OUT_DATA, RESULTS, FIGS):
    d.mkdir(parents=True, exist_ok=True)

RATING_KEYS = ["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp",
               "oiq", "diq", "drb", "pss", "reb"]


def bbgm_ovr(r: pd.DataFrame | dict) -> np.ndarray:
    """Exact port of src/worker/core/player/ovr.basketball.ts (identical in both baselines)."""
    g = (lambda k: np.asarray(r[k], dtype=float))
    x = (0.159 * (g("hgt") - 47.5) + 0.0777 * (g("stre") - 50.2) + 0.123 * (g("spd") - 50.8)
         + 0.051 * (g("jmp") - 48.7) + 0.0632 * (g("endu") - 39.9) + 0.0126 * (g("ins") - 42.4)
         + 0.0286 * (g("dnk") - 49.5) + 0.0202 * (g("ft") - 47.0) + 0.0726 * (g("tp") - 47.1)
         + 0.133 * (g("oiq") - 46.8) + 0.159 * (g("diq") - 46.7) + 0.059 * (g("drb") - 54.8)
         + 0.062 * (g("pss") - 51.3) + 0.01 * (g("fg") - 47.0) + 0.01 * (g("reb") - 51.4) + 48.5)
    fudge = np.select(
        [x >= 68, x >= 50, x >= 42, x >= 31],
        [8.0, 4 + (x - 50) * (4 / 18), -5 + (x - 42) * (9 / 8), -5 - (42 - x) * (5 / 11)],
        default=-10.0,
    )
    # JS Math.round rounds .5 up
    return np.clip(np.floor(x + fudge + 0.5), 0, 100)


def player_split(slug: str) -> str:
    """Deterministic 50/50 player-level split: 'fit' vs 'test' (independent hold-out set)."""
    h = int(hashlib.sha256(slug.encode()).hexdigest()[:8], 16)
    return "fit" if h % 2 == 0 else "test"


def wmean(x, w):
    x = np.asarray(x, float)
    w = np.asarray(w, float)
    m = np.isfinite(x) & np.isfinite(w) & (w > 0)
    if m.sum() == 0:
        return np.nan
    return float(np.sum(x[m] * w[m]) / np.sum(w[m]))


def wvar(x, w):
    mu = wmean(x, w)
    x = np.asarray(x, float)
    w = np.asarray(w, float)
    m = np.isfinite(x) & np.isfinite(w) & (w > 0)
    return float(np.sum(w[m] * (x[m] - mu) ** 2) / np.sum(w[m]))


def dump_json(obj, path: Path):
    path.write_text(json.dumps(obj, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)) + "\n")


def age_band(a):
    a = np.asarray(a)
    return np.select([a <= 22, a <= 25, a <= 28, a <= 31, a <= 34], ["19-22", "23-25", "26-28", "29-31", "32-34"], "35+")
