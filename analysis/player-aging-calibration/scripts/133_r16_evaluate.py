"""Score R16 as fixed input, paired growth loop, and open league on separate panels."""
import csv
import gzip
import json
import sys
from collections import defaultdict
from importlib import import_module
from statistics import correlation, mean, stdev

r151 = import_module("128_r151_replay_eval")
HERE, load, RESULT = r151.HERE, r151.load, r151.RESULTS
SIM = r151.SIM
STATIC = (2009, 2013, 2015, 2017, 2025, 2026)
PROD = "unchanged"
CANDIDATE = "r16_career"
MIDRANGE = "r16_midrange"
R15 = "r15_rel_D_ef_r08_fm"
COUNT = (*r151.COUNT, "pf")
CASES = {
    "curryst01": "Curry · high-volume movement shooter",
    "derozde01": "DeRozan · high-volume mid-range",
    "jokicni01": "Jokić · passing center",
    "goberru01": "Gobert · rim finisher / protector",
    "adamsst01": "Adams · low-volume interior specialist",
    "antetgi01": "Antetokounmpo · rim-pressure star",
    "doncilu01": "Dončić · young high-usage creator",
    "whitede01": "White · expanding secondary role",
    "paulch01": "Paul · aging organizer",
    "tuckepj01": "Tucker · low-volume shooting specialist",
    "lopezbr01": "Lopez · change from post to stretch",
    "wembavi01": "Wembanyama · young stretch rim protector",
    "duncati01": "Duncan · historical interior star",
    "nashst01": "Nash · historical lead organizer",
    "holidjr01": "Holiday · two-way secondary guard",
}
EMPTY = dict.fromkeys(COUNT, 0)
METRICS = ("tpar", "ts", "p2", "ftr", "pts36", "plays36", "ast36", "drb36", "blk36",
           "stl36", "rim", "post", "mid")


def read_csv(path):
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rt") as f:
        return list(csv.DictReader(f))


def write(name, rows):
    path = RESULT / f"r16_{name}.csv"
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(dict.fromkeys(k for row in rows for k in row)))
        writer.writeheader()
        writer.writerows(rows)


def box(rows):
    total = dict.fromkeys(COUNT, 0.0)
    for row in rows:
        for key in COUNT:
            total[key] += float(row.get(key) or 0)
    return total


def actual():
    stats = defaultdict(list)
    with (HERE.parents[1] / "data/real-player-stats.basketball.json").open() as f:
        for row in json.load(f)["stats"]:
            if row["season"] >= 2004 and not row.get("playoffs"):
                stats[row["season"], row["slug"]].append(row)
    by_year = defaultdict(dict)
    for (year, sid), rows in stats.items():
        by_year[year][sid] = box(rows)
    by_year[2026] = {row["sid"]: box([row]) for row in read_csv(HERE / "data/r16_nba_2026_box.csv")}
    zone_records = {}
    for name in ("zone_history_hist", "zone_history"):
        zone_records.update(json.loads((SIM / f"r5_inputs/{name}.json").read_text()))
    # Use only scored NBA reference seasons. This is outside the candidate.
    for year, players in by_year.items():
        for sid, row in players.items():
            z = zone_records.get(str(year + 1), {}).get(sid)
            if z:
                row.update(zip(("fgaAtRim", "fgaLowPost", "fgaMidRange"), z[:3], strict=True))
    return by_year


def rates(r):
    num = r["fga"] + .44 * r["fta"]
    z = sum(r[k] for k in ("fgaAtRim", "fgaLowPost", "fgaMidRange"))
    ratio = lambda x, y: x / y if y > 0 else None
    return {
        "tpar": ratio(r["tpa"], r["fga"]), "ts": ratio(r["pts"], 2 * num),
        "p2": ratio(r["fg"] - r["tp"], r["fga"] - r["tpa"]), "ftr": ratio(r["fta"], r["fga"]),
        "pts36": ratio(36 * r["pts"], r["min"]), "plays36": ratio(36 * (num + r["tov"]), r["min"]),
        **{f"{k}36": ratio(36 * r[k], r["min"]) for k in ("ast", "drb", "blk", "stl")},
        "rim": ratio(r["fgaAtRim"], z), "post": ratio(r["fgaLowPost"], z), "mid": ratio(r["fgaMidRange"], z),
    }


def cohort_profiles(ref, fixtures):
    eligible = [sid for sid, r in ref.items() if r["min"] >= 500 and r["fga"] >= 150]
    common = [sid for sid in eligible if all(run.get(sid, EMPTY)["min"] >= 300 and run.get(sid, EMPTY)["fga"] >= 75
                                               for run in fixtures.values())]
    return eligible, common


def identity_group(r):
    q = rates(r)
    tpar = q["tpar"]
    yield "all"
    if tpar < .08:
        yield "non_shooters"
    if tpar >= .50:
        yield "high_three_share"
    if q["ast36"] >= 6:
        yield "organizers"
    if q["blk36"] >= 1.5 and q["drb36"] >= 7:
        yield "rim_defenders"
    if q["pts36"] >= 24:
        yield "high_scorers"
    if q["mid"] is not None and q["mid"] >= .38:
        yield "midrange-heavy"


def league_summary(year, arm, players, stage):
    row = box(players.values())
    top = sorted((r["ast"] for r in players.values()), reverse=True)[:10]
    return {"stage": stage, "season": year, "arm": arm, **rates(row),
            "ast_per_make": row["ast"] / row["fg"],
            "ast_top10_share": sum(top) / row["ast"],
            "mpg36_count": sum(r["gp"] >= 40 and r["min"] >= 36 * r["gp"] for r in players.values())}


def conditional_scores(stage, season, real, fixtures):
    eligible, common = cohort_profiles(real, fixtures)
    groups = defaultdict(list)
    for sid in common:
        for group in identity_group(real[sid]):
            groups[group].append(sid)
    stats = {a: {p: rates(b) for p, b in d.items()} for a, d in {"NBA": real, **fixtures}.items()}
    scores = []
    for group, ids in groups.items():
        for arm, run in stats.items():
            for key in METRICS:
                pairs = [(stats["NBA"][sid][key], run[sid][key]) for sid in ids
                         if stats["NBA"][sid][key] is not None and run[sid][key] is not None]
                if not pairs:
                    continue
                ys, xs = zip(*pairs)
                scores.append({
                    "stage": stage, "season": season, "group": group, "arm": arm, "metric": key,
                    "n": len(pairs), "mean": mean(xs), "nba_mean": mean(ys),
                    "signed_bias": mean(x - y for x, y in zip(xs, ys)),
                    "mae": mean(abs(x - y) for x, y in zip(xs, ys)),
                    "corr": correlation(xs, ys) if len(set(xs)) > 1 and len(set(ys)) > 1 else None,
                })
            if group == "all":
                scores.extend({"stage": stage, "season": season, "group": group, "arm": arm, "metric": label,
                               "n": len(v), "mean": mean(v), "nba_mean": None}
                              for label, v in (("specialists_ge55", [run[sid]["tpar"] >= .55 for sid in ids]),
                                               ("nonshooter_spill", [run[sid]["tpar"] > .15 for sid in ids if stats["NBA"][sid]["tpar"] < .08]))
                              if v)
    coverage = [
        {"stage": stage, "season": season, "arm": arm, "eligible_n": len(eligible), "paired_n": len(common),
         "zero_gp": sum(run.get(sid, EMPTY)["gp"] == 0 for sid in eligible),
         "below_300_min": sum(run.get(sid, EMPTY)["min"] < 300 for sid in eligible)}
        for arm, run in fixtures.items()
    ]
    return scores, coverage


def case_rows(stage, year, reference, fixtures):
    rows = []
    for arm, data in {"NBA": reference, **fixtures}.items():
        for sid, name in CASES.items():
            r = data.get(sid)
            if r is not None:
                rows.append({"stage": stage, "season": year, "arm": arm, "sid": sid, "case": name, "gp": r["gp"],
                             "min": r["min"], "fga": r["fga"], **rates(r)})
    return rows


def league_from_open(run, year):
    return {p.get("srID") or f"generated_{p['pid']}": box(rows) for p in run["players"]
            if (rows := [x for x in p["stats"] if x["season"] == year and x["tid"] >= 0])}


def current_static():
    result = {}
    for season in STATIC:
        arms = (PROD, CANDIDATE, MIDRANGE) if season in (2017, 2025, 2026) else (PROD, CANDIDATE)
        runs = {}
        signatures = {}
        for arm in arms:
            rows = read_csv(SIM / f"output_r16_static/r5__{season}__{arm}__1610__full.csv.gz")
            runs[arm] = {r["sid"] or f"generated_{r['pid']}": box([r]) for r in rows}
            keys = [k for k in rows[0] if k in ("pid", "sid", "tid", "age", "ovr") or k.startswith("r_")]
            signatures[arm] = [tuple(r[k] for k in keys) for r in rows]
            assert len(runs[arm]) == len(rows)
            assert 1230 * 480 <= sum(float(r["min"]) for r in rows) < 1230 * 490
        assert all(sig == signatures[PROD] for sig in signatures.values())
        result[season] = runs
    return result


def load_fixed(start, seed, arms, folder):
    out = defaultdict(dict)
    for arm in arms:
        f = SIM / f"{folder}/r151roll_v9s_l4_era__{start}__{arm}__{seed}__y2.csv.gz"
        by_year = defaultdict(dict)
        for row in read_csv(f):
            by_year[int(row["season"])][row["sid"]] = row
        for s, data in by_year.items():
            out[s][arm] = data
    for s, arms in out.items():
        pr = arms[PROD]
        for arm in arms.values():
            assert arm.keys() == pr.keys()
            for p, r in arm.items():
                assert all(r[k] == pr[p][k] for k in ("age", "tid", "ovr", *(f"r_{key}" for key in ("oiq", "diq", "tp", "ins", "reb", "pss"))))
    return out


def fixed_boxes(out):
    return {s: {arm: {sid: box([r]) for sid, r in rows.items()} for arm, rows in arms.items()} for s, arms in out.items()}


def current_fixed():
    out = load_fixed(2021, 1621, (PROD, R15, CANDIDATE, MIDRANGE), "output_r16_fixed")
    assert out[2021][CANDIDATE] == out[2021][R15], "Opening behavior must preserve R15 on identical inputs"
    assert out[2021][CANDIDATE] == out[2021][MIDRANGE], "Opening prior without zone data must preserve R16"
    return fixed_boxes(out)


def current_transition():
    out = load_fixed(2015, 1615, (PROD, MIDRANGE), "output_r16_transition")
    return fixed_boxes(out)


def style_changes(seasons, reference, stage):
    rows = []
    for season in sorted(seasons)[1:]:
        current, prev = seasons[season], seasons[season - 1]
        ids = set(reference[season]) & set(reference[season - 1])
        common = [sid for sid in sorted(ids) if all(d[sid]["fga"] >= 150 for d in (reference[season], reference[season - 1]))
                  and all(d.get(sid, EMPTY)["fga"] >= 75 and d.get(sid, EMPTY)["min"] >= 300
                          for fixture in (current, prev) for d in fixture.values())]
        labels = ["NBA", *current]
        changes = {}
        for arm in labels:
            d0, d1 = (reference[season - 1], reference[season]) if arm == "NBA" else (prev[arm], current[arm])
            changes[arm] = [rates(d1[sid])["tpar"] - rates(d0[sid])["tpar"] for sid in common]
        for arm in labels:
            x, y = changes[arm], changes["NBA"]
            genuine_moves = [i for i, q in enumerate(y) if abs(q) >= .10]
            stable = [i for i, q in enumerate(y) if abs(q) < .05]
            rows.append({"stage": stage, "season": season, "arm": arm, "n": len(common),
                         "change_sd": stdev(x), "nba_sd": stdev(y),
                         "change_corr": correlation(x, y),
                         "change_mae": mean(abs(a - b) for a, b in zip(x, y)),
                         "nba_big_change_n": len(genuine_moves),
                         "big_change_mae": mean(abs(x[i] - y[i]) for i in genuine_moves),
                         "nba_stable_n": len(stable), "n_stable_mae": mean(abs(x[i] - y[i]) for i in stable)})
    return rows


def career_open(runs):
    info = []
    for arm, run in runs.items():
        for s in (2021, 2022):
            now, previous = league_from_open(run, s), league_from_open(run, s - 1)
            established = [sid for sid, row in previous.items() if row["min"] >= 1000]
            gp = [now.get(sid, EMPTY)["gp"] for sid in established]
            injured = [i for p in run["players"] for i in p.get("injuries", ()) if i["season"] == s]
            minute = sum(p["min"] for p in now.values())
            moves = [t for p in run["players"] if p.get("srID") for t in p["transactions"] if t["season"] == s]
            high = [p for p in run["players"] if (r := next((r for r in p["ratings"] if r["season"] == s), None))
                    and r["ovr"] >= 70 and now.get(p.get("srID"), EMPTY)["gp"] > 0]
            retire = sum(p["retiredYear"] == s and previous.get(p.get("srID"), EMPTY)["min"] >= 500 for p in run["players"])
            youth = sum(now.get(p.get("srID"), EMPTY)["min"] for p in run["players"] if s - p["born"] <= 22)
            old = sum(now.get(p.get("srID"), EMPTY)["min"] for p in run["players"] if s - p["born"] >= 33)
            info.append({"arm": arm, "season": s, "seed": run["seed"], "prior1000_n": len(gp),
                         "miss25pct": mean(x / 82 < .75 for x in gp), "zero_gp_prior1000": sum(x == 0 for x in gp),
                         "recorded_injuries_incl_postseason": len(injured),
                         "recorded_trade_player_moves": sum(t["type"] == "trade" for t in moves),
                         "recorded_new_fa_moves": sum(t["type"] == "freeAgent" for t in moves),
                         "retired_prior500": retire, "active_real_ovr70": len(high),
                         "real_min_share_age22_or_less": youth / minute, "real_min_share_age33_or_more": old / minute,
                         "generated_min_share": sum(r["min"] for sid, r in now.items() if sid.startswith("generated_")) / minute})
    return info


def current_open(candidate):
    suffix = {
        PROD: "playground",
        "B_cap2": "playground+three_anchor_rel_cap2",
        "C_v9_cap2": "v9s_l4+three_anchor_rel_cap2",
        "D_old": "playground+three_anchor_rel_cap2_mix",
        candidate: f"v9s_l4+{candidate}",
    }
    runs = {arm: load(SIM / f"{'output_r16_open2021_regular' if arm == candidate else 'output_full_r13m'}/full__2021__{s}__21.json.gz")
            for arm, s in suffix.items()}
    opened = runs[candidate]
    assert opened["years"] == 2 and len(opened["gsLog"]) == 2
    first, second = opened["gsLog"]
    assert first["previousChoicePlayers"] == first["previousChoiceDecisions"] == 0
    assert second["previousChoicePlayers"] >= 350
    assert .80 < second["previousChoiceDecisions"] / first["calls"]["three"] < 1, "Regular-season learning coverage"
    assert all(s["twoPointModel"] == "C2" and s["calls"]["mix"] > 0 for s in opened["gsLog"])
    if candidate == MIDRANGE:
        assert first["midrangeKept"] == 0 and second["midrangeKept"] > 0
    incomplete = SIM / "output_r16_open2021/full__2021__v9s_l4+r16_career__21.json.gz"
    audit = {}
    if incomplete.exists():
        early = load(incomplete)
        # No 2021 midrange data, so changing the training ledger affects only
        # the following season. First-year on-court behavior must be identical.
        assert league_from_open(early, 2021) == league_from_open(opened, 2021)
        audit = {"incomplete_first_attempt_choice_decisions": early["gsLog"][1]["previousChoiceDecisions"],
                 "first_year_box_scores_equal_after_fix": True}

    def opening_ratings(league):
        return {p.get("srID") or f"generated_{p['pid']}": r for p in league["players"]
                if (r := next((r for r in p["ratings"] if r["season"] == 2021), None)) and p.get("srID")}

    a, b, c = (opening_ratings(runs[key]) for key in (PROD, candidate, "C_v9_cap2"))
    assert a.keys() == b.keys() == c.keys()
    assert all(all(v == b[sid][k] for k, v in r.items() if k != "pot") for sid, r in a.items())
    assert b == c, "Opening ratings should match the existing V9 run"
    write("open_career", career_open(runs))
    (RESULT / "r16_open_hook_check.json").write_text(json.dumps({
        "opening_real_skills_matched_to_playground": len(a), "opening_real_ratings_matched_to_v9": len(c),
        "opening_pot_differs_from_playground": sum(r["pot"] != b[sid]["pot"] for sid, r in a.items()),
        "seed": opened["seed"], "self_test": opened["selfTest"],
        "seasons": opened["gsLog"], **audit,
    }, indent=2) + "\n")
    return {s: {arm: league_from_open(r, s) for arm, r in runs.items()} for s in (2021, 2022)}


def main():
    if len(sys.argv) not in (2, 3) or sys.argv[1] not in ("static", "fixed", "transition", "open"):
        raise SystemExit("Pass static, fixed, transition or open [r16_career|r16_midrange].")
    stage = sys.argv[1]
    candidate = sys.argv[2] if len(sys.argv) == 3 else CANDIDATE
    if candidate not in (CANDIDATE, MIDRANGE) or (stage != "open" and len(sys.argv) == 3):
        raise SystemExit("Select an R16 arm for open-league scoring only.")
    reference = actual()
    seasons = current_open(candidate) if stage == "open" else {
        "static": current_static, "fixed": current_fixed, "transition": current_transition,
    }[stage]()
    league, scores, coverage, cases, examples = [], [], [], [], []
    for season, fixtures in seasons.items():
        ref = reference[season]
        league.extend(league_summary(season, arm, records, stage) for arm, records in {"NBA": ref, **fixtures}.items())
        numbers, counts = conditional_scores(stage, season, ref, fixtures)
        scores.extend(numbers)
        coverage.extend(counts)
        cases.extend(case_rows(stage, season, ref, fixtures))
        _, coherent = cohort_profiles(ref, fixtures)
        for arm in (CANDIDATE, MIDRANGE):
            if arm not in fixtures:
                continue
            for metric in ("tpar", "ts", "plays36", "pts36", "ast36", "blk36"):
                diffs = []
                for sid in coherent:
                    a, b, y = (rates(base[sid])[metric] for base in (fixtures[PROD], fixtures[arm], ref))
                    diffs.append((abs(b - y) - abs(a - y), sid, a, b, y))
                diffs.sort()
                for which, few in (("improved", diffs[:4]), ("worse", diffs[-4:])):
                    for v, sid, a, b, y in few:
                        examples.append({"season": season, "arm": arm, "metric": metric, "rank": which, "sid": sid,
                                         "nba": y, "baseline": a, "candidate": b, "delta_absolute_error": v})
    for name, rows in [("league", league), ("players", scores), ("coverage", coverage), ("cases", cases), ("tails", examples)]:
        write(f"{stage}_{name}", rows)
    if stage != "static":
        write(f"{stage}_style_change", style_changes(seasons, reference, stage))


if __name__ == "__main__":
    main()
