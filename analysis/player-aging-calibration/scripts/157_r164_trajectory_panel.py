"""One player-season panel for individual trajectories: archived leagues (ratings, box, BPM) and the NBA in the same columns.

NBA rows: official box (2004-26), BPM where the source has it (to 2025), and the BBGM real ratings of the same season, which are an
estimate by the ratings' authors and not a measurement of ability. Skills are r_*. Rates are per 36 minutes; `_rel` columns subtract the
minutes-weighted league mean of that season (ratio for shares), which removes era and engine level differences.
Usage (pandas venv): 157_r164_trajectory_panel.py OUTPUT.parquet ARM=path [ARM=path ...]"""
import gzip
import json
import sys
from importlib import import_module
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "scripts"))
acc = import_module("149_r164_career_acceptance")
r16 = acc.r16
SKILLS = ["hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp", "oiq", "diq", "drb", "pss", "reb"]
BOX = ["min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "ast", "tov", "stl", "blk", "pf"]


def finish(d):
    """Rates, value and rank by league season."""
    d = d[d["min"] >= 100].copy()
    per = 36 / d["min"]
    for k in ("pts", "fga", "tpa", "fta", "orb", "drb", "ast", "tov", "stl", "blk", "pf"):
        d[k + "36"] = d[k] * per
    d["net36"] = per * (d.pts - d.fga - .44 * d.fta + .7 * d.orb + .3 * d.drb + .7 * d.ast + d.stl + .7 * d.blk - d.tov)
    d["off36"] = per * (d.pts - d.fga - .44 * d.fta + .7 * d.orb + .7 * d.ast - d.tov)
    d["def36"] = per * (.3 * d.drb + d.stl + .7 * d.blk)
    d["ts"] = d.pts / (2 * (d.fga + .44 * d.fta)).clip(lower=1)
    d["tpar"] = d.tpa / d.fga.clip(lower=1)
    d["ftr"] = d.fta / d.fga.clip(lower=1)
    d["rim_share"] = d.rim / d.fga.clip(lower=1)
    d["mpg"] = d["min"] / d.gp.clip(lower=1)
    group = d.groupby(["src", "league", "season"])
    w = lambda k: (d[k] * d["min"]).groupby([d.src, d.league, d.season]).transform("sum") / group["min"].transform("sum")
    for k in ("pts36", "fga36", "tpa36", "fta36", "orb36", "drb36", "ast36", "tov36", "stl36", "blk36", "pf36", "net36", "off36", "def36", "ts", "tpar", "ftr", "rim_share"):
        d[k + "_rel"] = d[k] - w(k)
    for k in ("obpm", "dbpm"):
        have = d[k].notna()
        d.loc[have, k + "_rel"] = d.loc[have, k]
    d["value"] = (d.net36_rel + 1.5) * d["min"] / 36
    d["rank"] = group["value"].rank(ascending=False, method="first")
    return d


def league_rows(label, path):
    with gzip.open(path, "rt") as f:
        run = json.load(f)
    name = f"{run['start']}-{run['seed']}"
    rows = []
    for sid, p in r16.player_index(run).items():
        raw = {}
        for s in p["stats"]:
            if s["tid"] >= 0:
                raw.setdefault(s["season"], []).append(s)
        for y, r in p["rating"].items():
            if y < run["start"] and y not in p["by_year"]:
                continue
            row = dict(src=label, league=name, start=run["start"], id=sid, real=not sid.startswith("generated_"), season=y, born=p["born"], age=y - p["born"], draft=p["draft"]["year"],
                       pick=p["draft"]["pick"] + 30 * max(0, p["draft"]["round"] - 1) if p["draft"]["round"] else 99, ovr=r["ovr"], pos=r["pos"], retired=p["retiredYear"] if p["retiredYear"] and p["retiredYear"] < 3000 else np.nan,
                       **{"r_" + k: r[k] for k in SKILLS})
            b = raw.get(y) if y >= run["start"] else None
            if b:
                row.update({k: sum(s[k] for s in b) for k in BOX}, gp=sum(s["gp"] for s in b), rim=sum(s["fgaAtRim"] for s in b), mid=sum(s["fgaMidRange"] for s in b))
                m = max(1, row["min"])
                row.update({k: sum((s[k] or 0) * s["min"] for s in b) / m for k in ("obpm", "dbpm")})
            rows.append(row)
    return pd.DataFrame(rows)


def nba_rows():
    nba, bios, _ = r16.source_data()
    real = pd.read_parquet(HERE / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"]).set_index(["slug", "season"])
    adv = pd.read_parquet(HERE / "data/nba_player_seasons.parquet").drop_duplicates(["season", "slug"]).set_index(["slug", "season"])
    rows = []
    for y in range(2005, 2027):
        for sid, b in nba[y].items():
            if sid not in bios or not bios[sid].get("bornYear"):
                continue
            bio = bios[sid]
            row = dict(src="NBA", league="NBA", start=0, id=sid, real=True, season=y, born=bio["bornYear"], age=y - bio["bornYear"], draft=bio.get("draftYear", np.nan),
                       pick=(bio.get("draftPick") or 99) + 30 * (bio["draftRound"] - 1) if bio.get("draftRound") in (1, 2) else 99, pos=bio.get("pos"), gp=b["gp"], **{k: b[k] for k in BOX},
                       rim=b.get("fgaAtRim", np.nan), mid=b.get("fgaMidRange", np.nan))
            if (sid, y) in real.index:
                row.update({"r_" + k: real.at[(sid, y), k] for k in SKILLS}, ovr=real.at[(sid, y), "ovr"])
            if (sid, y) in adv.index:
                row.update(obpm=adv.at[(sid, y), "obpm"], dbpm=adv.at[(sid, y), "dbpm"])
            rows.append(row)
    return pd.DataFrame(rows)


if __name__ == "__main__":
    out, items = sys.argv[1], sys.argv[2:]
    frames = [nba_rows()]
    for item in items:
        frames.append(league_rows(*item.split("=", 1)))
    full = pd.concat(frames, ignore_index=True)
    full["min"] = full["min"].fillna(0)
    played = finish(full)
    cols = [c for c in played.columns if c not in full.columns]
    full = full.join(played[cols])
    full.to_parquet(out)
    print(full.groupby("src").agg(rows=("id", "size"), leagues=("league", "nunique"), played=("rank", "count")))
