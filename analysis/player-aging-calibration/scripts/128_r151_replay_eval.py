"""Score whole-league replay arms and audit the seasonal archive contrasts.

The exposure bridge is an exact accounting identity, distinct from the
interventions in run_r151_replay.sh. It works on regular-season box totals.
"""
import csv
import gzip
import json
import math
from collections import defaultdict
from importlib import import_module

inputs = import_module("125_r151_rating_replay_inputs")
HERE, load = inputs.HERE, inputs.load
SIM = HERE / "sim"
RESULTS = HERE / "results"
D = "r15_D_ef_r08_fm"
B = "three_era_p_cap2"
A = "unchanged"
COUNT = ("gp", "min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "tov",
         "ast", "drb", "orb", "blk", "stl", "fgaAtRim", "fgaLowPost", "fgaMidRange")


def write(name, rows, compressed=False):
    path = RESULTS / f"r151_{name}.csv"
    output = gzip.open(path.with_suffix(".csv.gz"), "wt", newline="") if compressed else path.open("w", newline="")
    with output as f:
        writer = csv.DictWriter(f, fieldnames=list(dict.fromkeys(k for r in rows for k in r)))
        writer.writeheader()
        writer.writerows(rows)


def summed(rows):
    total = dict.fromkeys(COUNT, 0.0)
    for r in rows:
        for k in COUNT:
            total[k] += float(r.get(k) or 0)
    return total


def static(season, folder, arm, seed=None):
    seed = seed if seed is not None else {2009: 1181, 2025: 2511}[season]
    with gzip.open(SIM / folder / f"r5__{season}__{arm}__{seed}__full.csv.gz", "rt") as f:
        rows = list(csv.DictReader(f))
    assert len({r["pid"] for r in rows}) == len(rows)
    assert 1230 * 480 <= sum(float(r["min"]) for r in rows) < 1230 * 490
    assert all(r["sid"] for r in rows)
    players = {r["sid"]: summed([r]) for r in rows}
    assert len(players) == len(rows)
    return players, {r["sid"]: r for r in rows}


def archive(world, season):
    players = {}
    for p in world["players"]:
        stats = [r for r in p["stats"] if r["season"] == season and r["tid"] >= 0 and not r.get("playoffs")]
        if stats:
            sid = p.get("srID") or f"generated_{p['pid']}"
            assert sid not in players
            players[sid] = summed(stats)
    return players


def nba_box(seasons):
    with (HERE.parents[1] / "data/real-player-stats.basketball.json").open() as f:
        box = defaultdict(list)
        for r in json.load(f)["stats"]:
            if r["season"] in seasons and not r.get("playoffs"):
                box[r["season"], r["slug"]].append(r)
    return {s: {sid: summed(rows) for (season, sid), rows in box.items() if s == season} for s in seasons}


def components(row):
    return {
        "ts": (row["pts"], 2 * (row["fga"] + .44 * row["fta"])),
        "ftr": (row["fta"], row["fga"]),
        "p2": (row["fg"] - row["tp"], row["fga"] - row["tpa"]),
        "p3": (row["tp"], row["tpa"]),
        "tpar": (row["tpa"], row["fga"]),
    }


def metrics(players):
    t = summed(players.values())
    z = sum(t[k] for k in ("fgaAtRim", "fgaLowPost", "fgaMidRange"))
    assert z == 0 or int(z) == int(t["fga"] - t["tpa"])
    return {
        **{k: n / d for k, (n, d) in components(t).items()},
        "rim_share_2pa": t["fgaAtRim"] / z if z else "",
        "post_share_2pa": t["fgaLowPost"] / z if z else "",
        "mid_share_2pa": t["fgaMidRange"] / z if z else "",
        "ast_per_fg": t["ast"] / t["fg"],
        "ast_top10_share": sum(sorted((r["ast"] for r in players.values()), reverse=True)[:10]) / t["ast"],
        "drb_per_48": 48 * t["drb"] / t["min"],
        "orb_per_48": 48 * t["orb"] / t["min"],
        "blk_per_48": 48 * t["blk"] / t["min"],
        "stl_per_48": 48 * t["stl"] / t["min"],
        "mpg36_count": sum(r["gp"] >= 40 and r["min"] >= 36 * r["gp"] for r in players.values()),
        "min_top60_share": sum(sorted((r["min"] for r in players.values()), reverse=True)[:60]) / t["min"],
        "shot_opportunity_per_48": 48 * (t["fga"] + .44 * t["fta"] + t["tov"]) / t["min"],
    }


def exposure_split(replay, opened, metric):
    q0 = {sid: components(r)[metric] for sid, r in replay.items()}
    q1 = {sid: components(r)[metric] for sid, r in opened.items()}
    common = sorted(sid for sid in q0.keys() & q1.keys() if q0[sid][1] > 0 and q1[sid][1] > 0)
    total0 = sum(n for n, d in q0.values()) / sum(d for n, d in q0.values())
    total1 = sum(n for n, d in q1.values()) / sum(d for n, d in q1.values())
    common0 = sum(q0[i][0] for i in common) / sum(q0[i][1] for i in common)
    common1 = sum(q1[i][0] for i in common) / sum(q1[i][1] for i in common)
    weights0 = [q0[i][1] for i in common]
    weights_minutes = [q0[i][1] * opened[i]["min"] / replay[i]["min"] for i in common]
    rates1 = [q1[i][0] / q1[i][1] for i in common]
    at_replay_weights = sum(w * r for w, r in zip(weights0, rates1)) / sum(weights0)
    at_open_minutes = sum(w * r for w, r in zip(weights_minutes, rates1)) / sum(weights_minutes)
    terms = {
        "remove_replay_only": common0 - total0,
        "same_player_box_rate": at_replay_weights - common0,
        "same_player_minutes": at_open_minutes - at_replay_weights,
        "same_player_exposure_per_min": common1 - at_open_minutes,
        "add_open_only": total1 - common1,
    }
    assert math.isclose(sum(terms.values()), total1 - total0, abs_tol=1e-12)
    return {"outcome": metric, "common_n": len(common), "open_minus_replay": total1 - total0, **terms,
            "replay_common_min_share": sum(replay[i]["min"] for i in common) / sum(r["min"] for r in replay.values()),
            "open_common_min_share": sum(opened[i]["min"] for i in common) / sum(r["min"] for r in opened.values())}


def fixed_years():
    results = {}
    for growth in ("none", "playground", "v9s_l4"):
        file = SIM / f"output_r151_fixedYears/r151roll_{growth}_era__2007__unchanged__1181__y2.csv.gz"
        with gzip.open(file, "rt") as f:
            by_season = defaultdict(dict)
            for row in csv.DictReader(f):
                by_season[int(row["season"])][row["sid"]] = row
        assert set(by_season) == {2007, 2008, 2009}
        baseline = by_season[2007]
        for season, rows in by_season.items():
            assert rows.keys() == baseline.keys()
            assert all(r["tid"] == baseline[sid]["tid"] and int(r["age"]) - int(baseline[sid]["age"]) == season - 2007
                       for sid, r in rows.items())
            if growth == "none":
                assert all(all(r[f"r_{k}"] == baseline[sid][f"r_{k}"] for k in inputs.RATINGS[:-2])
                           for sid, r in rows.items())
        results[growth] = by_season
    assert results["none"][2007] == results["playground"][2007] == results["v9s_l4"][2007]
    scored = {(growth, s): metrics({sid: summed([r]) for sid, r in rows.items()})
              for growth, seasons in results.items() for s, rows in seasons.items()}
    write("fixed_years", [
        {"growth": growth, "season": s, "rostered": len(results[growth][s]), **m,
         "ts_vs_no_development": m["ts"] - scored["none", s]["ts"],
         "ftr_vs_no_development": m["ftr"] - scored["none", s]["ftr"],
         "p2_vs_no_development": m["p2"] - scored["none", s]["p2"]}
        for (growth, s), m in scored.items()
    ])


def main():
    fixtures = {}
    sources = {}
    nba = nba_box((2009, 2025))
    for season, box in nba.items():
        fixtures[season, "NBA"] = box
        sources[season, "NBA"] = "data/real-player-stats.basketball.json"
    for season, worlds in inputs.SOURCES.items():
        for tag, fn in worlds.items():
            fixtures[season, f"open_{tag}"] = archive(load(SIM / f"{fn}.json.gz"), season)
            sources[season, f"open_{tag}"] = fn
        legacy_production = "output_r11_three_p" if season == 2009 else "output_r13_static"
        for arm, directory in [(A, legacy_production), (D, "output_r15_static")]:
            fixtures[season, f"legacyReal_{arm}"], _ = static(season, directory, arm)
            sources[season, f"legacyReal_{arm}"] = directory
    for folder, season, arms in [
        ("replayA", 2009, [A, D]), ("replayV9", 2009, [A, D]),
        ("alignedReal", 2009, [A, D]), ("alignedA", 2009, [A, D]),
        ("alignedV9", 2009, [A, D]), ("alignedR15", 2009, [D]),
        ("alignedReal", 2025, [A, B, D]), ("alignedA", 2025, [A, D]),
        ("alignedB", 2025, [B]), ("alignedV9", 2025, [B]),
    ]:
        for arm in arms:
            directory = f"output_r151_{folder}"
            fixtures[season, f"{folder}_{arm}"], _ = static(season, directory, arm)
            sources[season, f"{folder}_{arm}"] = directory
    controls = {}
    role_audit = []
    for seed in (1181, 1182):
        for folder in ("roleReal", "roleFixed", "roleFixedWithUsage", "roleReplay", "roleObservedRoster"):
            directory = f"output_r151_{folder}"
            label = f"{folder}_{seed}"
            fixtures[2009, label], controls[folder] = static(2009, directory, A, seed)
            sources[2009, label] = directory
        for sid, baseline in controls["roleReal"].items():
            for folder in ("roleFixed", "roleFixedWithUsage"):
                replay = controls[folder][sid]
                assert replay["order"] == baseline["order"]
                assert replay["ovr_end"] == baseline["ovr"]
            assert controls["roleReplay"][sid]["ovr"] == controls["roleFixed"][sid]["ovr"]
        real = controls["roleReal"]
        real_minutes = sum(float(r["min"]) for r in real.values())
        for folder in ("roleFixed", "roleFixedWithUsage", "roleReplay"):
            matched = controls[folder]
            value_deltas = [abs(float(r["value_no_pot"]) - float(matched[sid]["value_no_pot"]))
                            for sid, r in real.items()]
            role_audit.append({
                "seed": seed, "fixture": folder,
                "players_with_changed_order": sum(r["order"] != matched[sid]["order"] for sid, r in real.items()),
                "players_with_changed_end_value": sum(d > 0 for d in value_deltas),
                "max_abs_end_value_delta": max(value_deltas),
                "half_abs_min_change_over_real_min":
                    sum(abs(float(r["min"]) - float(matched[sid]["min"])) for sid, r in real.items()) /
                    (2 * real_minutes),
            })

    scored = {key: metrics(box) for key, box in fixtures.items()}
    write("replay_league", [
        {"season": season, "fixture": label, "source": sources[season, label], **result}
        for (season, label), result in scored.items()
    ])
    contrasts = []

    def contrast(season, label, before, after):
        r0, r1 = scored[season, before], scored[season, after]
        contrasts.append({"season": season, "contrast": label, "before": before, "after": after,
                          **{k: r1[k] - v for k, v in r0.items() if isinstance(v, (int, float)) and
                             isinstance(r1[k], (int, float))}})

    for season, spec in {
        2009: [("A", A), ("V9", A), ("R15", D)],
        2025: [("A", A), ("B", B), ("V9", B)],
    }.items():
        for tag, arm in spec:
            before, replay, opened = f"alignedReal_{arm}", f"aligned{tag}_{arm}", f"open_{tag}"
            contrast(season, f"{tag}_open_minus_static", before, opened)
            contrast(season, f"{tag}_replay_response", before, replay)
            contrast(season, f"{tag}_remaining_open_minus_replay", replay, opened)
    for season in nba:
        for arm in (A, D):
            contrast(season, "era_settings_" + arm, f"legacyReal_{arm}", f"alignedReal_{arm}")
        for folder in ("alignedReal", "alignedA"):
            contrast(season, "R15_GameSim_" + folder, f"{folder}_{A}", f"{folder}_{D}")
    contrast(2009, "R15_open_package", "open_A", "open_R15")
    contrast(2025, "V9_holding_GameSim_fixed", f"alignedB_{B}", f"alignedV9_{B}")
    contrast(2025, "V9_open_holding_GameSim_fixed", "open_B", "open_V9")
    for seed in (1181, 1182):
        for before, after, label in [
            ("roleReal", "roleFixed", "ratings_with_legacy_role_usage_inputs"),
            ("roleFixed", "roleFixedWithUsage", "release_usage_composite"),
            ("roleFixedWithUsage", "roleReplay", "release_rotation_inputs"),
            ("roleReplay", "roleObservedRoster", "substitute_observed_team_pool"),
            ("roleReal", "roleObservedRoster", "total_controlled"),
        ]:
            contrast(2009, f"{label}_{seed}", f"{before}_{seed}", f"{after}_{seed}")
    write("replay_contrasts", contrasts)

    split = []
    for season, spec in [(2009, [("A", A), ("V9", A), ("R15", D)]), (2025, [("A", A), ("B", B), ("V9", B)])]:
        for tag, arm in spec:
            replay, opened = fixtures[season, f"aligned{tag}_{arm}"], fixtures[season, f"open_{tag}"]
            for metric in ("ts", "ftr", "p2"):
                split.append({"season": season, "world": tag, **exposure_split(replay, opened, metric)})
    write("exposure_bridge", split)

    roster_rows = []
    base = fixtures[2009, f"legacyReal_{A}"]
    rotation = {sid: r["min"] for sid, r in base.items() if r["min"] >= 500}
    for world, formula in [("A", "playground"), ("V9", "v9s_l4")]:
        for seed in (11, 12, 13):
            exported = load(SIM / f"output_full_r11/full__2005__{formula}__{seed}.json.gz")
            opened = archive(exported, 2009)
            people = {p.get("srID"): p for p in exported["players"] if p.get("srID")}
            for sid, minutes in rotation.items():
                p, o = people.get(sid, {}), opened.get(sid, {})
                om = o.get("min", 0)
                if om >= 500:
                    state = "kept"
                elif om >= 100:
                    state = "100_to_499_minutes"
                elif o:
                    state = "team_row_below_100_minutes"
                elif p.get("retiredYear") is not None and p["retiredYear"] < 2009:
                    state = "retired_before_2009"
                else:
                    state = "no_regular_team_row_other"
                roster_rows.append({"world": world, "seed": seed, "sid": sid, "state": state,
                                    "static_min": minutes, "open_min": om, "open_gp": o.get("gp", 0)})
    write("rotation_membership", roster_rows)

    with (RESULTS / "r151_replay_coverage.csv").open() as f:
        coverage = list(csv.DictReader(f))
    weight_rows = []
    for season, spec in [(2009, [("A", A), ("V9", A), ("R15", D)]), (2025, [("A", A), ("B", B), ("V9", B)])]:
        for tag, arm in spec:
            matches = {r["sid"] for r in coverage if int(r["season"]) == season and r["world"] == tag and r["swapped"] == "True"}
            for folder in ("alignedReal", f"aligned{tag}"):
                box = fixtures[season, f"{folder}_{arm}"]
                weight_rows.append({"season": season, "world": tag, "fixture": folder,
                                    "matched_n": len(matches), "roster_n": len(box),
                                    "minutes_share": sum(box[sid]["min"] for sid in matches) /
                                    sum(r["min"] for r in box.values())})
    write("replay_weighted_coverage", weight_rows)
    write("role_audit", role_audit)
    fixed_years()
    for r in contrasts:
        print(r["season"], r["contrast"], *(f"{k}={r[k]:+.4f}" for k in ("ts", "ftr", "p2", "tpar")))


if __name__ == "__main__":
    main()
