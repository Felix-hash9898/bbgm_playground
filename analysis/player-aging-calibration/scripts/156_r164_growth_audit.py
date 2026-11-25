"""Real opening players of every archived league followed for five years against their real ratings, by opening age.

Counts at 55+ and 60+ are used because a real player that good stays in the data; absence counts as below. Each start weighs the
same however many leagues it has. Arms of different growth are never pooled.
Usage: 156_r164_growth_audit.py ARM[,ARM] [start ...]   (pandas venv)"""
import gzip
import json
import re
import sys
from collections import defaultdict
from importlib import import_module
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "scripts"))
r16 = import_module("149_r164_career_acceptance").r16
BANDS = ((19, 20), (21, 22), (23, 25), (26, 28), (29, 31), (32, 35))


def real_ratings():
    R = pd.read_parquet(HERE / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"])
    return {(a, b): c for a, b, c in zip(R.slug, R.season, R.ovr)}


def read(path):
    with gzip.open(path, "rt") as f:
        run = json.load(f)
    return r16.player_index(run), run["start"], run["start"] + run["years"] - 1


def table(runs, real, lags=(1, 2, 3, 4, 5), levels=(55, 60)):
    """runs: start -> [(players, start, last)]; returns (band, lag, level) -> [real, simulated], starts weighing equally."""
    out = defaultdict(lambda: [0.0, 0.0])
    for start, leagues in runs.items():
        for lag in lags:
            y = start + lag
            use = [ix for ix, _, last in leagues if y <= min(last, 2026)]
            for ix in use:
                for s, p in ix.items():
                    age = start - p["born"]
                    if s.startswith("generated_") or start not in p["rating"] or p["draft"]["year"] >= start or (s, start) not in real:
                        continue
                    band = next((b for b in BANDS if b[0] <= age <= b[1]), None)
                    if band:
                        for level in levels:
                            cell = out[band, lag, level]
                            cell[0] += (real.get((s, y), 0) >= level) / len(use)
                            cell[1] += (p["rating"].get(y, {"ovr": 0})["ovr"] >= level) / len(use)
    return out


def misfit(t):
    return sum((s - r) ** 2 / (r + 2) for r, s in t.values()) / len(t)


if __name__ == "__main__":
    arms, starts = sys.argv[1].split(","), [int(x) for x in sys.argv[2:]]
    real = real_ratings()
    for arm in arms:
        runs = defaultdict(list)
        for path in sorted(HERE.glob("results/r164_cloud/run_*/cells/r164-cell-*/full__*.gz")):
            m = re.search(r"r164-cell-(\d+)-(\d+)-([A-Z])$", path.parent.name)
            if m[3] == arm and int(m[1]) <= 2022 and (not starts or int(m[1]) in starts):
                runs[int(m[1])].append(read(path))
        t = table(runs, real)
        print(arm, {k: len(v) for k, v in runs.items()}, "misfit", round(misfit(t), 2))
        for level in (55, 60):
            for band in BANDS:
                print(f"  {level}+ age {band[0]}-{band[1]}", *(f"lag{lag} {t[band, lag, level][0]:.0f}->{t[band, lag, level][1]:.0f}" for lag in (1, 3, 5)))
