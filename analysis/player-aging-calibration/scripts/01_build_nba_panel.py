"""Build the real-NBA player-season panel (1947-2025 regular season) from the repo's own data files.

Inputs (read-only): data/real-player-stats.basketball.json, data/real-player-data.basketball.json
Outputs: data/nba_player_seasons.parquet  (one row per player-season, multi-team rows aggregated)
         data/bbgm_real_ratings.parquet   (BBGM real-player ratings, kept separate: NOT ability labels)
         results/panel_coverage.json
Age convention = season - bornYear, identical to BBGM (season 2025 == 2024-25).
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from common import DATA_IN, OUT_DATA, RESULTS, RATING_KEYS, bbgm_ovr, dump_json, player_split

stats = json.load(open(DATA_IN / "real-player-stats.basketball.json"))["stats"]
data = json.load(open(DATA_IN / "real-player-data.basketball.json"))
bios = data["bios"]

rs = pd.DataFrame([r for r in stats if not r.get("playoffs")])
COUNT = ["gp", "gs", "min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "trb", "ast",
         "stl", "blk", "tov", "pf", "ows", "dws", "vorp"]
RATE = ["usgp", "astp", "orbp", "drbp", "trbp", "stlp", "blkp", "obpm", "dbpm", "per", "ortg", "drtg"]
for c in COUNT + RATE:
    if c not in rs:
        rs[c] = np.nan
rs["min_w"] = rs["min"].fillna(0)

# team order within a season = row order in file (BBGM keeps chronological order)
rs["row"] = np.arange(len(rs))
first_team = rs.sort_values("row").groupby(["slug", "season"])["abbrev"].first()
last_team = rs.sort_values("row").groupby(["slug", "season"])["abbrev"].last()
nteams = rs.groupby(["slug", "season"])["abbrev"].nunique()

agg = rs.groupby(["slug", "season"])[COUNT].sum(min_count=1)
for c in RATE:
    tmp = rs.assign(_xw=rs[c] * rs["min_w"], _w=np.where(rs[c].notna(), rs["min_w"], 0))
    g = tmp.groupby(["slug", "season"])[["_xw", "_w"]].sum()
    agg[c] = g["_xw"] / g["_w"].replace(0, np.nan)
agg["first_team"] = first_team
agg["last_team"] = last_team
agg["n_teams"] = nteams
p = agg.reset_index()

# team games per season (for availability share)
team_games = {}
for season, teams in data["teamSeasons"].items():
    gms = [v["won"] + v["lost"] + v.get("tied", 0) + v.get("otl", 0) for v in teams.values()]
    team_games[int(season)] = int(np.median(gms))
p["team_games"] = p["season"].map(team_games)

b = pd.DataFrame.from_dict(bios, orient="index")
b.index.name = "slug"
b = b.reset_index()[["slug", "name", "bornYear", "height", "weight", "pos", "draftYear", "draftPick", "draftRound", "country"]]
p = p.merge(b, on="slug", how="left")
p["age"] = p["season"] - p["bornYear"]

# derived rates
fga, fta = p["fga"], p["fta"]
tsa = fga + 0.44 * fta
p["ts"] = p["pts"] / (2 * tsa.replace(0, np.nan))
p["tpar"] = p["tpa"] / fga.replace(0, np.nan)
p["ftr"] = p["fta"] / fga.replace(0, np.nan)
p["tp_pct"] = p["tp"] / p["tpa"].replace(0, np.nan)
p["ft_pct"] = p["ft"] / fta.replace(0, np.nan)
p["fg2_pct"] = (p["fg"] - p["tp"].fillna(0)) / (fga - p["tpa"].fillna(0)).replace(0, np.nan)
p["tov_pct"] = p["tov"] / (tsa + p["tov"]).replace(0, np.nan)
p["bpm"] = p["obpm"] + p["dbpm"]
p["ws48"] = (p["ows"] + p["dws"]) / p["min"].replace(0, np.nan) * 48
p["mpg"] = p["min"] / p["gp"].replace(0, np.nan)
p["gp_share"] = p["gp"] / p["team_games"]
for c in ["pts", "ast", "orb", "drb", "stl", "blk", "tov", "fga", "tpa", "fta"]:
    p[f"{c}36"] = p[c] / p["min"].replace(0, np.nan) * 36

# position group (bio position; height also kept)
pos = p["pos"].fillna("")
p["pos_group"] = np.select([pos.str.contains("C"), pos.str.contains("PG") | (pos == "G"),
                            pos.str.contains("F")], ["big", "guard", "wing"], "guard")
p.loc[pos.isin(["PF", "FC", "C", "F-C", "C-F"]), "pos_group"] = "big"
p["split"] = p["slug"].map(player_split)
p["era"] = pd.cut(p["season"], [0, 1979, 1999, 2014, 2100], labels=["pre1980", "1980-99", "2000-14", "2015-25"]).astype(str)

# career bookkeeping (observed NBA seasons only)
p = p.sort_values(["slug", "season"]).reset_index(drop=True)
p["career_season_idx"] = p.groupby("slug").cumcount() + 1
first = p.groupby("slug")["season"].transform("min")
last = p.groupby("slug")["season"].transform("max")
p["first_season"], p["last_season"] = first, last
p["debut_age"] = p.groupby("slug")["age"].transform("min")
p["final_age"] = p.groupby("slug")["age"].transform("max")
p["next_season_present"] = p.groupby("slug")["season"].shift(-1) == p["season"] + 1
p.to_parquet(OUT_DATA / "nba_player_seasons.parquet", index=False)

# BBGM real ratings (kept separate; documented as GameSim-fitted proxies)
r = pd.DataFrame(data["ratings"])
r = r.merge(b[["slug", "bornYear", "pos", "draftYear"]], on="slug", how="left")
r["age"] = r["season"] - r["bornYear"]
r["ovr"] = bbgm_ovr(r)
r = r.merge(p[["slug", "season", "min", "gp"]], on=["slug", "season"], how="left")
r["has_nba_stats"] = r["min"].notna()
r.to_parquet(OUT_DATA / "bbgm_real_ratings.parquet", index=False)

cov = {
    "player_seasons": int(len(p)),
    "players": int(p["slug"].nunique()),
    "seasons": [int(p["season"].min()), int(p["season"].max())],
    "with_bornYear": float(p["bornYear"].notna().mean()),
    "rows_by_era": p["era"].value_counts().to_dict(),
    "advanced_coverage_by_era": p.groupby("era")[["obpm", "usgp", "tpa", "tov"]].apply(lambda d: d.notna().mean()).round(3).to_dict(orient="index"),
    "ratings_rows": int(len(r)),
    "ratings_seasons": [int(r["season"].min()), int(r["season"].max())],
    "ratings_rows_without_nba_stats": int((~r["has_nba_stats"]).sum()),
    "ratings_rows_without_nba_stats_by_season_gt_2025": int(((~r["has_nba_stats"]) & (r["season"] > 2025)).sum()),
}
dump_json(cov, RESULTS / "panel_coverage.json")
print(json.dumps(cov, indent=1))
