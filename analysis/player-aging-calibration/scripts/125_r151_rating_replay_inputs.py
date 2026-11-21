"""R15.1 static replay inputs. Existing 2009 A/V9 swaps are verified and reused.

Replay uses the first archived rating row for the target year. These exports can
include permanent injury effects. Static roles are recomputed unless the harness
explicitly holds the real inputs to the rotation controller fixed. Unmatched
real players retain real ratings. The observed-roster scenario is a synthetic
2009 graph built from first recorded stints, including zero-GP team rows.
"""
import copy
import csv
import gzip
import json
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
INPUT = HERE / "sim/r5_inputs"
RATINGS = ("hgt", "stre", "spd", "jmp", "endu", "ins", "dnk", "ft", "fg", "tp",
           "oiq", "diq", "drb", "pss", "reb", "ovr", "pot")
SOURCES = {
    2009: {
        "A": "output_full_r11/full__2005__playground__11",
        "V9": "output_full_r11/full__2005__v9s_l4__11",
        "R15": "output_r15_multi2005/full__2005__playground+r15_rel_D_ef_r08_fm__11",
    },
    2025: {
        "A": "output_full_r13m/full__2021__playground__21",
        "B": "output_full_r13m/full__2021__playground+three_anchor_rel_cap2__21",
        "V9": "output_full_r13m/full__2021__v9s_l4+three_anchor_rel_cap2__21",
    },
}
FACTORS = (
    "numGames", "pace", "threePointTendencyFactor", "threePointAccuracyFactor",
    "twoPointAccuracyFactor", "ftAccuracyFactor", "blockFactor", "stealFactor",
    "turnoverFactor", "orbFactor", "injuryRate", "foulRateFactor",
    "foulsNeededToFoulOut", "quarterLength", "numPeriods", "homeCourtAdvantage",
)


def load(path):
    with gzip.open(path, "rt") as stream:
        return json.load(stream)


def keep_input(name, data):
    path = INPUT / f"{name}.json.gz"
    if path.exists():
        if load(path) != data:
            raise ValueError(f"Existing input differs: {path}")
        return
    path.write_bytes(gzip.compress(json.dumps(data).encode(), mtime=0))


def ratings_in(player, season):
    return next((r for r in player["ratings"] if r["season"] == season), None)


def replay(base, archive, season):
    source_ratings = {}
    for player in archive["players"]:
        sid = player.get("srID")
        rating = ratings_in(player, season)
        if sid and rating:
            if sid in source_ratings:
                raise ValueError(f"Duplicate archive identity {sid}")
            source_ratings[sid] = rating
    out = copy.deepcopy(base)
    matched = []
    for player in out["players"]:
        if player["tid"] < 0:
            continue
        sid = player.get("srID")
        rating = source_ratings.get(sid)
        if rating is not None:
            player["ratings"][-1].update({key: rating[key] for key in RATINGS})
            matched.append(sid)
    return out, matched


def observed_rosters(base, archive, season):
    """Move the 2009 season's observed team pool into the static harness.

    This does not recover preseason assignments or timing of transactions.
    Retained players keep the replay's histories and position. Players outside
    the real roster bring archive ratings and lagged box history.
    """
    out = copy.deepcopy(base)
    known = {p["srID"]: p for p in out["players"] if p.get("srID")}
    next_pid = max(p["pid"] for p in out["players"]) + 1
    players = []
    for p in archive["players"]:
        stint = next((s for s in p["stats"] if s["season"] == season and s["tid"] >= 0), None)
        if stint is None:
            continue
        sid = p.get("srID")
        if sid in known:
            player = known[sid]
        else:
            rating = ratings_in(p, season)
            if rating is None:
                raise ValueError(f"Missing 2009 rating for {sid or p['pid']}")
            player = copy.deepcopy(out["players"][0])
            player.update(pid=next_pid, srID=sid or f"generated_{p['pid']}", real=p["real"],
                          firstName="", lastName=str(next_pid), born={"year": p["born"], "loc": ""},
                          draft={**p["draft"], "tid": -1, "originalTid": -1},
                          ratings=[{**rating, "skills": [], "fuzz": 0}], pos=rating["pos"],
                          stats=[{**s, "playoffs": False} for s in p["stats"] if season - 2 <= s["season"] < season])
            # Keep the static harness's PER availability consistent between roster states.
            for s in player["stats"]:
                s.pop("per", None)
            next_pid += 1
        player["tid"] = stint["tid"]
        players.append(player)
    counts = Counter(p["tid"] for p in players)
    assert counts.keys() == {t["tid"] for t in base["teams"]} and min(counts.values()) >= 10
    out["players"] = sorted(players, key=lambda player: player["pid"])
    return out


def main():
    with (HERE.parents[1] / "data/real-player-data.basketball.json").open() as stream:
        events = json.load(stream)["scheduledEventsGameAttributes"]
    fixed_factors = {}
    for season in (2007, 2008, 2009):
        factors_this_year = {}
        for event in events:
            if (event["season"], event["phase"]) <= (season, 1):
                factors_this_year.update({key: event["info"][key] for key in FACTORS if key in event["info"]})
        fixed_factors[season] = factors_this_year
    (INPUT / "r151_fixed_era_factors.json").write_text(json.dumps(fixed_factors, indent=2) + "\n")
    coverage = []
    factors = []
    for season, worlds in SOURCES.items():
        base = load(INPUT / f"R5_{season}_static.json.gz")
        static_attrs = base["gameAttributes"]
        overrides = {}
        for event in events:
            if (event["season"], event["phase"]) <= (season, 1):
                overrides.update(event["info"])
        aligned = {**base, "gameAttributes": {
            **static_attrs, **{key: overrides[key] for key in FACTORS if key in overrides},
        }}
        for key in FACTORS:
            old, new = static_attrs.get(key), aligned["gameAttributes"].get(key)
            factors.append((season, key, old, new, old != new))
        keep_input(f"R5_{season}_r151Aligned_static", aligned)
        for tag, file in worlds.items():
            archive = load(HERE / f"sim/{file}.json.gz")
            swapped, matched = replay(base, archive, season)
            if season == 2009 and tag in {"A", "V9"}:
                keep_input(f"R5_{season}_replay{tag}_static", swapped)
            swapped["gameAttributes"] = aligned["gameAttributes"]
            keep_input(f"R5_{season}_r151Aligned{tag}_static", swapped)
            rostered = [p for p in base["players"] if p["tid"] >= 0]
            seen = set(matched)
            coverage.extend((season, tag, p["srID"], p["srID"] in seen) for p in rostered)
            print(season, tag, "swapped", len(matched), "kept original", len(rostered) - len(matched))
            if season == 2009 and tag == "A":
                composed = observed_rosters(swapped, archive, season)
                keep_input("R5_2009_r151ObservedRoster_static", composed)
                print("Observed roster:", len(composed["players"]), "players")
    for name, header, rows in [
        ("replay_coverage", ("season", "world", "sid", "swapped"), coverage),
        ("replay_factors", ("season", "factor", "historical_static", "schedule_aligned", "changed"), factors),
    ]:
        with (HERE / f"results/r151_{name}.csv").open("w", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(header)
            writer.writerows(rows)


if __name__ == "__main__":
    main()
