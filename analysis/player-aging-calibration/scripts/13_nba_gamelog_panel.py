"""Season-level NBA panel 2022-2026 from game logs (analysis/form-research/data/processed/nba_panel.parquet,
regular season), with SPLIT-HALF totals (each player's odd vs even appearances) for a direct measurement-
noise estimate, mapped to Basketball-Reference slugs (real-player-data bios) by normalised name.

2026 (= 2025-26) is not in data/real-player-stats.basketball.json, so it is a season never touched by any
fit in this study: it extends the same-player check to the 2025 save (pairs 2025 -> 2026).
Output: data/nba_gamelog_seasons.parquet, results/gamelog_mapping.json
"""
from __future__ import annotations

import json
import re
import unicodedata

import numpy as np
import pandas as pd

from common import DATA_IN, OUT_DATA, REPO, RESULTS, dump_json

gl = pd.read_parquet(REPO / "analysis/form-research/data/processed/nba_panel.parquet",
                     columns=["game_id", "date", "season", "player_id", "player_name", "team", "minutes", "pts", "fgm", "fga",
                              "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "ast", "stl", "blk", "tov", "pf", "playoffs"])
gl = gl[(~gl["playoffs"]) & (gl["minutes"] > 0)].copy()
gl["season_end"] = gl["season"].str[:4].astype(int) + 1
gl = gl.sort_values(["player_id", "season_end", "date", "game_id"])
gl["app"] = gl.groupby(["player_id", "season_end"]).cumcount() + 1
gl["half"] = np.where(gl["app"] % 2 == 1, 1, 2)
ren = {"minutes": "min", "fgm": "fg", "fg3m": "tp", "fg3a": "tpa", "ftm": "ft", "oreb": "orb", "dreb": "drb"}
gl = gl.rename(columns=ren)
C = ["min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "pf"]
full = gl.groupby(["player_id", "season_end"]).agg(**{c: (c, "sum") for c in C}, gp=("game_id", "nunique"),
                                                    name=("player_name", "first"), team=("team", "last")).reset_index()
for h in (1, 2):
    hh = gl[gl["half"] == h].groupby(["player_id", "season_end"]).agg(**{f"h{h}_{c}": (c, "sum") for c in C},
                                                                     **{f"h{h}_gp": ("game_id", "nunique")}).reset_index()
    full = full.merge(hh, on=["player_id", "season_end"], how="left")


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z ]", "", s.lower().replace("-", " "))
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


bios = json.load(open(DATA_IN / "real-player-data.basketball.json"))["bios"]
b = pd.DataFrame([{"slug": k, "nname": norm(v["name"]), "bornYear": v["bornYear"], "draftYear": v["draftYear"]} for k, v in bios.items()])
full["nname"] = full["name"].map(norm)
# candidates: same normalised name; disambiguate by plausibility (draftYear <= season, age 18-45)
m = full.merge(b, on="nname", how="left")
m = m[m["slug"].isna() | ((m["draftYear"] <= m["season_end"]) & (m["season_end"] - m["bornYear"]).between(18, 45))]
dup = m.groupby(["player_id", "season_end"])["slug"].transform("nunique")
m = m[dup <= 1]
m["age"] = m["season_end"] - m["bornYear"]
m = m.rename(columns={"season_end": "season"})
m.to_parquet(OUT_DATA / "nba_gamelog_seasons.parquet", index=False)
cov = {"player_seasons": int(len(full)), "mapped": int(m["slug"].notna().sum()),
       "min_share_mapped": float(m.loc[m["slug"].notna(), "min"].sum() / full["min"].sum()),
       "by_season": m.groupby("season").apply(lambda d: round(float(d.loc[d["slug"].notna(), "min"].sum() / d["min"].sum()), 4), include_groups=False).to_dict()}
dump_json(cov, RESULTS / "gamelog_mapping.json")
print(cov)
