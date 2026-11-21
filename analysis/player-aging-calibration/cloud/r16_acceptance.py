"""Dispatch, audit and score the frozen R16 A/B/C experiment. Python 3.11+ stdlib."""
import argparse
import csv
import gzip
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from importlib import import_module
from pathlib import Path
from statistics import correlation, mean, median, stdev

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE / "scripts"))
ref = import_module("133_r16_evaluate")
ARMS = {"A": ("playground", None), "B": ("v9s_l4", None), "C": ("v9s_l4", "r16_midrange")}
MATRIX = json.loads((HERE / "cloud/r16_matrix.json").read_text())
SKILLS = "stre spd jmp endu ins dnk ft fg tp oiq diq drb pss reb".split()
CASE_IDS = list(ref.CASES) + ["smartma01", "dortlu01", "hartjo01", "carusal01"]
OPENING_CAP = {2006: 49500, 2011: 58050, 2015: 63050, 2021: 109150, 2024: 136000}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def avg(values):
    values = list(values)
    return mean(values) if values else None


def corr(x, y):
    return correlation(x, y) if len(x) >= 3 and min(stdev(x), stdev(y)) > 0 else None


def write_csv(path, rows):
    if rows:
        with path.open("w", newline="") as f:
            writer = csv.DictWriter(f, list(dict.fromkeys(k for row in rows for k in row)))
            writer.writeheader()
            writer.writerows(rows)


def matrix(stage):
    return [{"arm": arm, "start": start, "years": years, "seed": seed,
             "timeout": 8 + 20 * years if years < 18 else 355}
            for start, years, seeds in MATRIX[stage]["windows"] for seed in seeds for arm in ARMS]


def key(cell):
    return f"{cell['start']}-{cell['seed']}-{cell['arm']}"


def source_data():
    nba = ref.actual()
    real = json.loads((ROOT / "data/real-player-data.basketball.json").read_text())
    ratings = {(r["season"], r["slug"]): r for r in real["ratings"]}
    return nba, real["bios"], ratings


def opening_pair(runs):
    a, b, c = (runs[k]["opening"] for k in ARMS)
    for field in ("players", "teams", "env", "playerCount", "potential"):
        require(a[field] == b[field] == c[field], f"Opening mismatch in {field}: {a[field]}, {b[field]}, {c[field]}")


def cell_id(data, cell):
    require((data["arm"], data["gs"]) == ARMS[cell["arm"]], f"{key(cell)}: wrong treatment")
    require((data["start"], data["seed"]) == (cell["start"], cell["seed"]), f"{key(cell)}: wrong opening or seed")
    sig = data["selfTest"]["corrIq24"]
    require(data["selfTest"]["ok"] and (sig > .7 if cell["arm"] == "A" else sig < .5), f"{key(cell)}: wrong formula")
    env = data["opening"]["env"]
    require(env["spectator"] and env["realPlayerDeterminism"] == 0, f"{key(cell)}: wrong league mode")
    require(env["salaryCap"] == OPENING_CAP[cell["start"]], f"{key(cell)}: wrong opening salary environment")


def audit_hooks(data, years, probe=False):
    log = data["gsLog"]
    if data["gs"] is None:
        require(not log, "Production GameSim has research hook activity")
        return
    require([x["season"] for x in log] == list(years), "Missing/extra hook seasons")
    for i, h in enumerate(log):
        calls = h["calls"]
        expected_model = None if h["factor"] < .8 else "C2"
        require(h["twoPointModel"] == expected_model, f"{h['season']}: wrong era model")
        require(expected_model or h["midrangeKept"] == 0, "Early era unexpectedly preserved midrange")
        require((calls.get("mix", 0) > 0) == bool(expected_model), "Unexpected two-point mix activity")
        require(calls["three"] > 0 and calls.get("three_missing", 0) / calls["three"] < .08, "Three-choice hook coverage failed")
        require(math.isfinite(calls["anchor_c"]) and calls["anchor_c"] > 0, "Broken 3PA anchor")
        pre, post = (h["regularChoiceCalls"][k] for k in ("beforeDeadline", "afterDeadline"))
        require(pre > 0 and (probe or post > 0), "Regular season shot-phase telemetry incomplete")
        if i:
            prior_calls = log[i - 1]["regularChoiceCalls"]
            previous = sum(prior_calls.values())
            previous_players = h["previousChoicePlayers"]
            require(previous_players > 200 and .43 * previous < h["previousChoiceDecisions"] <= previous,
                    f"{h['season']}: previous regular choice history too small")
    require(log[0]["previousChoiceDecisions"] == 0, "Opening read future simulated choices")


def read_json(path):
    return json.loads(path.read_text())


def probe(root, start=2024, seed=41):
    data = {k: read_json(root / k / "probe.json") for k in ARMS}
    for k, run in data.items():
        cell_id(run, {"arm": k, "start": start, "seed": seed})
        audit_hooks(run, [start], probe=True)
        require(run["gamesPlayed"] > 0 and len(run["snapshot"]["market"]) > 400, f"{k}: no day/market receipt")
    require(data["C"]["gsLog"][0]["midrangeKept"] > 0, "2024 did not use pre-opening midrange records")
    opening_pair(data)
    require(data["A"]["box"] == data["B"]["box"] != data["C"]["box"],
            "Opening day should keep A/B box scores and activate C")
    print("A/B/C opening, growth swap, no-op production GameSim and R16 day verified")


def read_run(folder, cell):
    files = list(folder.glob("full__*.json.gz"))
    require(len(files) == 1, f"{folder}: expected exactly one league archive")
    with gzip.open(files[0], "rt") as f:
        run = json.load(f)
    cell_id(run, cell)
    start, count = cell["start"], cell["years"]
    years = range(start, start + count)
    require(run["years"] == count, f"{key(cell)}: wrong duration")
    for field in ("snapshots", "timings"):
        require([row["season"] for row in run[field]] == [y + 1 for y in years], f"{key(cell)}: incomplete {field}")
    require(all(t["gcExposed"] and 0 < t["heapMB"] < 5500 and t["rearms"] <= 2 for t in run["timings"]),
            f"{key(cell)}: GC or Auto Play integrity failure")
    require(not any(x["event"] in {"timeout", "giveUp", "researchHookError", "autoPlayError", "unhandledRejection"}
                    for x in (json.loads(line) for line in (folder / "heartbeat.jsonl").open())),
            f"{key(cell)}: Auto Play error in heartbeat")
    audit_hooks(run, years)
    return run


def player_index(run):
    result = {}
    for p in run["players"]:
        obj = dict(p, by_year={})
        for row in p["stats"]:
            if row["tid"] >= 0:
                obj["by_year"].setdefault(row["season"], []).append(row)
        obj["by_year"] = {y: ref.box(rows) for y, rows in obj["by_year"].items()}
        obj["rating"] = {r["season"]: r for r in p["ratings"]}
        identity = p["srID"] or f"generated_{p['pid']}"
        require(identity not in result, f"Duplicate player identity {identity}")
        result[identity] = obj
    return result


def age_group(age):
    return next((label for cutoff, label in [(22, "19–22"), (25, "23–25"), (30, "26–30"),
                                             (35, "31–35")] if age <= cutoff), "36+")


def cohorts(nba, bios, year):
    """Eligibility is fixed at the previous NBA season, with no future breakout filter."""
    out = defaultdict(set)
    for sid, b in nba.get(year - 1, {}).items():
        if b["min"] < 750 or sid not in bios:
            continue
        bio = bios[sid]
        q = ref.rates(b)
        age = year - bio["bornYear"]
        for group in ref.identity_group(b):
            out[group].add(sid)
        if q["pts36"] >= 24 or q["ast36"] >= 7:
            out["star"].add(sid)
            out[f"star {age_group(age)}"].add(sid)
        if 23 <= age <= 29 and bio["pos"] in {"G", "GF", "F", "FG"} and 11 <= q["plays36"] <= 19 \
                and 3.2 <= q["ast36"] < 7 and (q["stl36"] >= 1.1 or q["blk36"] >= .65):
            out["white-like"].add(sid)
        if 23 <= age <= 29 and 10 <= q["plays36"] <= 19:
            out["other-role"].add(sid)
        if age >= 30:
            out["veteran"].add(sid)
    out["other-role"] -= out["white-like"]
    out["rookie-drafted"] = {sid for sid, bio in bios.items()
                            if bio.get("draftYear") == year - 1 and bio.get("draftRound") in (1, 2)}
    return out


def mean_error(ids, truth, observed, metric):
    errors = [abs(observed[s][metric] - truth[s][metric]) for s in ids
              if observed[s][metric] is not None and truth[s][metric] is not None]
    return avg(errors)


def median_by_window(values):
    windows = defaultdict(list)
    for start, value in values:
        windows[start].append(value)
    return [median(v) for _, v in sorted(windows.items())]


def season_panels(runs, indexes, nba, bios, ratings, start, seed, years, panels):
    market = {}
    for arm, run in runs.items():
        for snap in run["snapshots"]:
            market[arm, snap["season"]] = {row[0]: row[1:] for row in snap["market"]}
    opening_groups = cohorts(nba, bios, start)
    prev_rates = {}
    for year in range(start, start + years):
        base = {"start": start, "seed": seed, "year": year}
        groups = cohorts(nba, bios, year)
        truth = nba.get(year, {})
        truth_rates = {sid: ref.rates(b) for sid, b in truth.items()}
        playable = {sid for sid, b in truth.items() if b["min"] >= 500 and b["fga"] >= 150}
        arm_boxes = {k: {sid: p["by_year"][year] for sid, p in ix.items() if year in p["by_year"]}
                     for k, ix in indexes.items()}
        shots = {k: {sid for sid, b in boxes.items() if b["min"] >= 300 and b["fga"] >= 75}
                 for k, boxes in arm_boxes.items()}
        pair_ids = {"B−A": playable & shots["A"] & shots["B"], "C−B": playable & shots["B"] & shots["C"]}
        rates = {k: {sid: ref.rates(b) for sid, b in boxes.items()} for k, boxes in arm_boxes.items()}
        for k, run in runs.items():
            ix, boxes = indexes[k], arm_boxes[k]
            snap = run["snapshots"][year - start]
            close = market[k, year + 1]
            if year == start:
                opened = {}
                # Opening affiliations are hashed. First season roster opportunity is captured by subsequent market.
            else:
                opened = market[k, year]
            team_records = [t for t in snap["teamRecords"] if sum(t[1:4]) > 0]
            team_games = sum(sum(t[1:4]) for t in team_records)
            minutes = sum(b["min"] for b in boxes.values())
            require(team_games >= 24 * 60 and team_games % 2 == 0 and 238 <= minutes / team_games <= 250,
                    f"{start}/{seed}/{k}: season {year} team/regular minutes mismatch ({team_games=} {minutes=})")
            require(len(close) >= 400 and len({t[0] for t in team_records}) >= 24 and snap["cap"] > 0,
                    f"{start}/{seed}/{k}: season {year} missing team/contract state")
            row = dict(base, arm=k, team_games=team_games, seconds=run["timings"][year - start]["seconds"],
                       heap_mb=run["timings"][year - start]["heapMB"], cap=snap["cap"], players=len(boxes),
                       win_pct_sd=stdev(t[1] / sum(t[1:4]) for t in team_records),
                       generated_min=sum(v["min"] for sid, v in boxes.items() if not ix[sid]["real"]) / minutes,
                       stars70=sum(p["rating"][year]["ovr"] >= 70 for sid, p in ix.items()
                                   if year in p["rating"] and boxes.get(sid, ref.EMPTY)["min"] >= 500),
                       heavy_mpg=sum(b["gp"] >= 40 and b["min"] / b["gp"] >= 36 for b in boxes.values()))
            total_rates = ref.rates(ref.box(boxes.values()))
            real_rates = ref.rates(ref.box(truth.values()))
            for metric in ("ts", "tpar", "p2", "ftr"):
                row[metric] = total_rates[metric]
                row[f"nba_{metric}"] = real_rates[metric]
            row["playoff_generated_min"] = None
            postseason = [(p["real"], s["min"]) for p in ix.values() for s in p.get("playoffs", []) if s["season"] == year]
            if postseason and sum(m for _, m in postseason) > 0:
                row["playoff_generated_min"] = sum(m for real, m in postseason if not real) / sum(m for _, m in postseason)
            mature_market = [p for p in ix.values() if p["pid"] in close and close[p["pid"]][0] >= 0]
            salary_share = [close[p["pid"]][1] / snap["cap"] for p in mature_market]
            row["salary_share_median"] = median(salary_share) if salary_share else None
            row["salary_share_ge25"] = avg(s >= .25 for s in salary_share)
            row["free_agents"] = sum(v[0] == -1 for v in close.values())
            row["retired"] = sum(p["retiredYear"] == year for p in ix.values())
            row["retire_age"] = avg(year - p["born"] for p in ix.values() if p["retiredYear"] == year)
            row["drafted"] = sum(p["draft"]["year"] == year and p["draft"]["pick"] > 0 for p in ix.values())
            for typ in ("freeAgent", "trade"):
                row[typ] = sum(t["type"] == typ and t["season"] == year for p in ix.values() for t in p["transactions"])
            rookie_rotation = [p for p in ix.values() if p["draft"]["year"] == year - 1 and p["draft"]["pick"] > 0]
            row["generated_draft_in_rotation"] = sum(not p["real"] and
                p["by_year"].get(year, ref.EMPTY)["min"] >= 500 for p in rookie_rotation)
            row["drafted_young_nba_contract"] = sum(p.get("firstNBAContract") is not None and
                p["firstNBAContract"]["season"] <= year for p in rookie_rotation)
            prior_rotation = [p for p in ix.values() if p["by_year"].get(year - 1, ref.EMPTY)["min"] >= 1000]
            row["prior_rotation_n"] = len(prior_rotation)
            row["prior_rotation_no_gp"] = avg(p["by_year"].get(year, ref.EMPTY)["gp"] == 0 for p in prior_rotation)
            row["prior_rotation_unsigned"] = avg(p["pid"] in opened and opened[p["pid"]][0] == -1 for p in prior_rotation)
            panels["league"].append(row)

            # Raw career opportunity uses a fixed denominator with zero minutes after DNP or exit.
            # Refresh rookie eligibility by draft class; keep role and star cohorts fixed at opening.
            for group, ids in (opening_groups | {"rookie-drafted": groups["rookie-drafted"]}).items():
                if not ids or not truth:
                    continue
                nbagp = sum(b["gp"] for b in truth.values())
                # Actual player MPG is reported below; compare total minutes directly in like seasons,
                # and use 82-team-game equivalents for lockout or pandemic schedules in the opportunity checks.
                sim_schedule = team_games / len(team_records)
                real_schedule = NBA_GAMES.get(year, 82)
                is_rotation = lambda b, schedule: b["min"] * 82 / schedule >= 500
                n_games_qualified = lambda b, schedule: b["gp"] >= .75 * schedule
                row = dict(base, arm=k, group=group, n=len(ids), ref_gp=nbagp)
                for tag, data, schedule in ((k, boxes, sim_schedule), ("NBA", truth, real_schedule)):
                    selected = [data.get(s, ref.EMPTY) for s in ids]
                    row[f"{tag}_min"] = avg(b["min"] * 82 / schedule for b in selected)
                    row[f"{tag}_rot"] = avg(is_rotation(b, schedule) for b in selected)
                    row[f"{tag}_gp75"] = avg(n_games_qualified(b, schedule) for b in selected)
                    row[f"{tag}_no_gp"] = avg(b["gp"] == 0 for b in selected)
                    row[f"{tag}_plays36"] = avg(ref.rates(b)["plays36"] for b in selected if b["min"] >= 300)
                ps = [ix[s] for s in ids if s in ix]
                row["not_in_league"] = sum(s not in ix for s in ids)
                row["ovr"] = avg(p["rating"][year]["ovr"] for p in ps if year in p["rating"])
                row["retired"] = sum(p["retiredYear"] is not None and p["retiredYear"] <= year for p in ps)
                row["next_fa"] = sum(p["pid"] in close and close[p["pid"]][0] == -1 for p in ps)
                row["first_contract"] = sum(p.get("firstNBAContract") is not None and p["firstNBAContract"]["season"] <= year for p in ps)
                panels["opportunity"].append(row)

            # Keep each opening cohort member, including no-minute and exited players.
            watch = {label: ids for label, ids in opening_groups.items() if label in
                     {"white-like", "other-role", "star", "veteran"}}
            watch["rookie-drafted"] = groups["rookie-drafted"]
            for sid in sorted(set.union(*watch.values())):
                p = ix.get(sid, {})
                b = boxes.get(sid, ref.EMPTY)
                q = ref.rates(b)
                r = p.get("rating", {}).get(year, {})
                previous = opened.get(p.get("pid"), [None] * 4)
                following = close.get(p.get("pid"), [None] * 4)
                panels["career"].append(dict(base, arm=k, sid=sid, age=year-bios[sid]["bornYear"],
                    cohorts=",".join(g for g, ids in watch.items() if sid in ids), gp=b["gp"], min=b["min"],
                    nba_gp=truth.get(sid, ref.EMPTY)["gp"] if truth else None,
                    nba_min=truth.get(sid, ref.EMPTY)["min"] if truth else None,
                    ovr=r.get("ovr"), pot=r.get("pot"), retired=p.get("retiredYear"), in_export=bool(p),
                    prior_tid=previous[0], prior_injury_games=previous[3], next_tid=following[0],
                    next_salary=following[1], next_exp=following[2], next_cap=snap["cap"],
                    salary_paid=avg(s["amount"] for s in p.get("salaryHistory", []) if s["season"] == year),
                    injury_games=sum(i["games"] for i in p.get("injuries", []) if i["season"] == year),
                    transaction_types=",".join(t["type"] for t in p.get("transactions", []) if t["season"] == year),
                    plays36=q["plays36"]))

            age_skill = defaultdict(list)
            careers = defaultdict(list)
            for sid, p in ix.items():
                before, after = p["rating"].get(year), p["rating"].get(year + 1)
                player_type = "star" if sid in opening_groups["star"] else \
                    "white-like" if sid in opening_groups["white-like"] else \
                    "interior" if "C" in p["ratings"][0]["pos"] else "perimeter"
                if year == start + years - 1:
                    history = [r for y, r in sorted(p["rating"].items()) if start <= y <= year and not r["locked"]
                               and p["by_year"].get(y, ref.EMPTY)["gp"] > 0]
                    if len(history) >= 3:
                        peak = max(history, key=lambda r: (r["ovr"], -r["season"]))
                        peak_age = peak["season"] - p["born"]
                        careers[player_type, bool(p["real"])].append((peak_age, peak["ovr"],
                            peak["season"] in (history[0]["season"], history[-1]["season"]),
                            history[-1]["ovr"] - peak["ovr"]))
                age = year + 1 - p["born"]
                if not before or not after or age < 19 or before["locked"] or after["locked"]:
                    continue
                # An edited real-ratings proxy exists only where both real rating rows are present.
                group = age_group(age)
                rb, ra = ratings.get((year, sid)), ratings.get((year + 1, sid))
                ds = {s: after[s] - before[s] for s in SKILLS}
                dref = {s: ra[s] - rb[s] for s in SKILLS} if rb and ra else None
                for etype in ("all", player_type):
                    age_skill[etype, group, "real" if p["real"] else "generated"].append(
                        dict(ds, ovr=after["ovr"] - before["ovr"], broad=sum(v >= 2 for v in ds.values()) >= 10,
                             pot=after["pot"] - before["pot"], ref_broad=None if dref is None else sum(v >= 2 for v in dref.values()) >= 10))
            for (kind, age, origin), rows in age_skill.items():
                panels["growth"].append(dict(base, arm=k, kind=kind, age=age, origin=origin, n=len(rows),
                    corr_iq=corr([r["oiq"] for r in rows], [r["diq"] for r in rows]),
                    **{f"delta_{s}": avg(r[s] for r in rows) for s in (*SKILLS, "ovr", "pot")},
                    broad=avg(r["broad"] for r in rows), ref_broad=avg(r["ref_broad"] for r in rows if r["ref_broad"] is not None)))
            for (ptype, is_real), values in careers.items():
                panels["peaks"].append(dict(base, arm=k, kind=ptype, real=is_real, n=len(values),
                    peak_age=median(v[0] for v in values), peak_ovr=median(v[1] for v in values),
                    endpoint_peak=avg(v[2] for v in values), peak_to_last=median(v[3] for v in values)))

            for sid in CASE_IDS:
                if sid not in ix and sid not in truth:
                    continue
                p = ix.get(sid, {})
                b, b_nba = boxes.get(sid, ref.EMPTY), truth.get(sid, ref.EMPTY)
                r = p.get("rating", {}).get(year, {})
                panels["cases"].append(dict(base, arm=k, sid=sid, gp=b["gp"], nba_gp=b_nba["gp"], min=b["min"],
                    nba_min=b_nba["min"], ovr=r.get("ovr"), pot=r.get("pot"), retired=p.get("retiredYear"),
                    prior_team=opened.get(p.get("pid"), [None])[0], next_team=close.get(p.get("pid"), [None])[0],
                    injury_games=sum(i["games"] for i in p.get("injuries", []) if i["season"] == year),
                    **rates[k].get(sid, {}), **{f"nba_{m}": v for m, v in ref.rates(b_nba).items()}))

        for contrast, ids in pair_ids.items():
            left, right = {"B−A": ("A", "B"), "C−B": ("B", "C")}[contrast]
            for group, sub in (groups | {"all": playable}).items():
                common = ids & sub
                row = dict(base, contrast=contrast, group=group, eligible=len(playable & sub), n=len(common))
                for metric in ref.METRICS:
                    row[f"base_{metric}"] = mean_error(common, truth_rates, rates[left], metric)
                    row[f"candidate_{metric}"] = mean_error(common, truth_rates, rates[right], metric)
                non = lambda k: avg(rates[k][s]["tpar"] >= .25 for s in common)
                row.update(base_spill=non(left), candidate_spill=non(right))
                panels["shot"].append(row)
            qmetrics = ("tpar", "ts", "pts36", "min")
            for sid in ids:
                left_box, right_box = arm_boxes[left][sid], arm_boxes[right][sid]
                if year == start or sid in CASE_IDS or max(abs(rates[left][sid]["tpar"] - rates[right][sid]["tpar"]),
                                                           abs(rates[left][sid]["ts"] - rates[right][sid]["ts"])) >= .15:
                    panels["tails"].append(dict(base, contrast=contrast, sid=sid, **{
                        f"{name}_{m}": data[m] for name, data in (
                            ("base", dict(rates[left][sid], min=left_box["min"])),
                            ("candidate", dict(rates[right][sid], min=right_box["min"])),
                            ("nba", dict(truth_rates[sid], min=truth[sid]["min"])),
                        ) for m in qmetrics
                    }))
        if prev_rates and truth:
            style_panel(panels["style"], base, rates, truth_rates, prev_rates, shots, opening_groups, indexes, bios)
        prev_rates = dict(rates, NBA=truth_rates, shots=shots, playable=playable)


NBA_GAMES = {2012: 66, 2020: 71, 2021: 72}


def style_panel(out, base, rates, truth, prev, shots, opening_groups, indexes, bios):
    year = base["year"]
    ids = prev["playable"] & set(truth) & shots["B"] & shots["C"] & prev["shots"]["B"] & prev["shots"]["C"]
    # Same exposures in each world and each year. The availability of those exposures is scored separately.
    for label, group in {"all": ids, "white-like": opening_groups["white-like"],
                         "veteran": opening_groups["veteran"], "star": opening_groups["star"]}.items():
        common = sorted(ids & group)
        if len(common) < 8:
            continue
        for arm in ("B", "C", "NBA"):
            current = rates[arm] if arm != "NBA" else truth
            lag = prev[arm]
            for metric in ("tpar", "mid", "ast36"):
                paired = [s for s in common if all(d[s][metric] is not None
                          for d in (current, lag, truth, prev["NBA"]))]
                if len(paired) < 8:
                    continue
                delta = [current[s][metric] - lag[s][metric] for s in paired]
                actual = [truth[s][metric] - prev["NBA"][s][metric] for s in paired]
                age = [year - bios[s]["bornYear"] for s in paired]
                plays = [current[s]["plays36"] - lag[s]["plays36"] for s in paired]
                row = dict(base, arm=arm, group=label, metric=metric, n=len(delta), sd=stdev(delta), mean=mean(delta),
                           abs_change=avg(map(abs, delta)), error=avg(abs(x-y) for x,y in zip(delta, actual)),
                           corr_nba=corr(delta, actual), corr_age=corr(delta, age), corr_plays=corr(delta, plays))
                if arm != "NBA":
                    tps, moved = [], []
                    for s in paired:
                        p = indexes[arm][s]
                        r, pr = p["rating"].get(year, {}), p["rating"].get(year - 1, {})
                        tps.append(r["tp"] - pr["tp"] if "tp" in r and "tp" in pr else 0)
                        main_tid = lambda y: max((b for b in p["stats"] if b["season"] == y),
                                                key=lambda b: b["min"])["tid"]
                        moved.append(main_tid(year) != main_tid(year - 1))
                    row["corr_tp_rating"] = corr(delta, tps)
                    row["mean_change_moved"] = avg(x for x, changed in zip(delta, moved) if changed)
                    row["mean_change_stayed"] = avg(x for x, changed in zip(delta, moved) if not changed)
                out.append(row)


def role_followup(run_groups, nba, bios):
    """Fixed opening denominator, per age/ability cohort and each seed; zeros count after exit."""
    rows = []
    for start, seed, years, runs in run_groups:
        g = cohorts(nba, bios, start)
        groups = {**{k: g[k] for k in ("white-like", "other-role", "star 26–30", "star 31–35", "star")},
                  "White": {"whitede01"} if "whitede01" in g["white-like"] else set()}
        maps = {arm: player_index(run) for arm, run in runs.items()}
        for year in range(start, min(2027, start + years)):
            for group, ids in groups.items():
                if not ids:
                    continue
                for arm, index in maps.items():
                    data = {s: index[s]["by_year"].get(year, ref.EMPTY) if s in index else ref.EMPTY for s in ids}
                    truth = nba.get(year, {})
                    vals = list(data.values())
                    row = dict(start=start, seed=seed, year=year, arm=arm, group=group, n=len(ids),
                               minutes=mean(b["min"] for b in vals),
                               nba_minutes=mean(truth.get(s, ref.EMPTY)["min"] for s in ids),
                               zero_gp=mean(b["gp"] == 0 for b in vals),
                               rotation=mean(b["min"] >= 500 for b in vals),
                               rotation_nba=mean(truth.get(s, ref.EMPTY)["min"] >= 500 for s in ids),
                               rostered_ovr=avg(index[s]["rating"][year]["ovr"] for s in ids if s in index
                                                and year in index[s]["rating"] and data[s]["min"] >= 500),
                               sg_names=",".join(sorted(ids)))
                    rows.append(row)
    return rows


def aggregate_gates(stage, panels):
    gates = []

    def add(name, values, test, min_n=1, review=False):
        values = [v for v in values if v is not None]
        result = None if not values else median(values)
        status = "INSUFFICIENT" if len(values) < min_n else "PASS" if test(result) else "FAIL"
        gates.append(dict(metric=name, value=result, samples=len(values), verdict=status, review_only=review))

    def paired(rows, left, right, metric):
        a = {(r["start"], r["seed"], r["year"]): r[metric] for r in rows if r["arm"] == left}
        b = {(r["start"], r["seed"], r["year"]): r[metric] for r in rows if r["arm"] == right}
        return [b[k] - a[k] for k in sorted(a.keys() & b.keys()) if a[k] is not None and b[k] is not None]

    shots = [r for r in panels["shot"] if r["contrast"] == "C−B"]
    all_shots = [r for r in shots if r["group"] == "all" and r["eligible"] > 0]
    modern_shots = [r for r in all_shots if r["start"] >= 2015]
    league = panels["league"]
    modern = [r for r in league if r["start"] >= 2015 and r["nba_ts"] is not None]
    if stage in {"pilot", "core"}:
        add("C−B common real rotation coverage (worst year)", [min((r["n"] / r["eligible"] for r in all_shots), default=None)],
            lambda x: x >= .35)
        add("C−B modern 3PA-share MAE", [r["candidate_tpar"]-r["base_tpar"] for r in modern_shots],
            lambda x: x <= -.010, min_n=6)
        add("C−B modern 3PA-share improvement share", [avg(r["candidate_tpar"] < r["base_tpar"] for r in modern_shots)],
            lambda x: x >= .67)
        add("C−B modern 3PA-share worst window median", [
            max(median_by_window((r["start"], r["candidate_tpar"]-r["base_tpar"]) for r in modern_shots), default=None)
        ], lambda x: x <= -.005)
        add("C−B modern player TS MAE", [r["candidate_ts"]-r["base_ts"] for r in modern_shots],
            lambda x: x <= .004, min_n=6)
        for metric, tolerance, absolute in (("ts", .008, .025), ("p2", .012, .035), ("ftr", .014, .039)):
            rows = [dict(r, err=abs(r[metric]-r[f"nba_{metric}"])) for r in modern]
            add(f"C−B modern league {metric} absolute-error penalty", paired(rows, "B", "C", "err"),
                lambda x: x <= tolerance, min_n=6)
            add(f"C modern league {metric} largest pooled season error",
                [worst_season(rows, "C", "err")], lambda x: x <= absolute)
        spill = [r["candidate_spill"]-r["base_spill"] for r in shots
                 if r["group"] == "non_shooters" and r["n"] >= 12 and r["start"] >= 2015]
        add("C−B non-shooter spillover", spill, lambda x: x <= .05, min_n=2)
        md = [r["candidate_mid"]-r["base_mid"] for r in shots if r["group"] == "midrange-heavy" and r["n"] >= 10
              and r["candidate_mid"] is not None and r["base_mid"] is not None and r["start"] >= 2015]
        add("C−B high-midrange MAE", md, lambda x: x <= .035, min_n=2)
        add("C−B heavy minute count", paired(modern, "B", "C", "heavy_mpg"), lambda x: x <= 6, min_n=6)
        style = [r for r in panels["style"] if r["metric"] == "tpar" and r["group"] == "all" and r["start"] >= 2015]
        add("C−B 3PA-share change MAE", paired(style, "B", "C", "error"), lambda x: x <= .012, min_n=2)
        add("C−NBA 3PA-share change SD ratio", [v for r in style if r["arm"] == "C" for v in [
            r["sd"] / next(n["sd"] for n in style if n["arm"] == "NBA"
                          and all(n[k] == r[k] for k in ("start", "seed", "year")))]],
            lambda x: .4 <= x <= 1.45, min_n=2, review=True)

    if stage == "core":
        hist = [r for r in league if r["start"] < 2015]
        historical_shots = [r for r in all_shots if r["start"] < 2015]
        add("C−B early 3PA-share MAE", [r["candidate_tpar"]-r["base_tpar"] for r in historical_shots],
            lambda x: x <= .005, min_n=10)
        for metric, tolerance in (("ts", .010), ("p2", .012), ("ftr", .015)):
            rows = [dict(r, err=abs(r[metric]-r[f"nba_{metric}"])) for r in hist]
            add(f"C−B historical {metric} absolute-error penalty", paired(rows, "B", "C", "err"),
                lambda x: x <= tolerance, min_n=10)
            add(f"C−B historical {metric} worst pooled season penalty",
                [worst_season_difference(rows, "B", "C", "err")], lambda x: x <= 1.75*tolerance)
        for metric, tolerance in (("ts", .022), ("ftr", .028)):
            years = {(r["arm"], r["seed"], r["year"]): r for r in league if r["start"] == 2015}
            changes = [abs((years["C", seed, 2017][metric] - years["C", seed, 2016][metric]) -
                           (years["C", seed, 2017][f"nba_{metric}"] - years["C", seed, 2016][f"nba_{metric}"]))
                       for seed in (15, 16) if ("C", seed, 2017) in years and ("C", seed, 2016) in years]
            add(f"C 2016–17 era-switch NBA {metric} change gap", changes, lambda x: x <= tolerance, min_n=2)
        growth = [r for r in panels["growth"] if r["start"] >= 2015 and r["kind"] == "all"
                  and r["origin"] == "real" and r["age"] == "19–22" and r["n"] >= 25]
        add("B−A young broad ratings gains", paired(growth, "A", "B", "broad"), lambda x: x <= -.05, min_n=6)
        add("B−A OIQ/DIQ co-movement", paired(growth, "A", "B", "corr_iq"), lambda x: x <= -.20, min_n=6)
        add("C−B young broad ratings gains", paired(growth, "B", "C", "broad"), lambda x: abs(x) <= .08, min_n=6)
        for left, right in (("A", "B"), ("B", "C")):
            add(f"{right}−{left} modern rotation OVR≥70", paired(modern, left, right, "stars70"),
                lambda x: x <= (0 if right == "B" else 4), min_n=12)
            for group, tolerance in (("white-like", .10), ("other-role", .10), ("rookie-drafted", .09),
                                     ("star 26–30", .12), ("star 31–35", .12)):
                rows = [r for r in panels["opportunity"] if r["group"] == group and r["start"] >= 2015 and r["n"] >= 8
                        and (r["year"] >= r["start"] + 1 or group == "rookie-drafted")]
                group_rows = [dict(r, error=abs(r[r["arm"]+"_rot"]-r["NBA_rot"])) for r in rows]
                add(f"{right}−{left} {group} rotation-share error", paired(group_rows, left, right, "error"),
                    lambda x: x <= tolerance, min_n=6)
                if group in ("white-like", "rookie-drafted"):
                    add(f"{right}−{left} {group} fixed-cohort rotation share",
                        paired([dict(r, rotation=r[r["arm"]+"_rot"]) for r in rows], left, right, "rotation"),
                        lambda x: x >= -tolerance, min_n=6)
            add(f"{right}−{left} offseason former-rotation FA share",
                paired([r for r in modern if r["year"] > r["start"]], left, right, "prior_rotation_unsigned"),
                lambda x: x <= .04, min_n=8)
            vets = [dict(r, rotation=r[r["arm"]+"_rot"]) for r in panels["opportunity"]
                    if r["group"] == "veteran" and r["start"] < 2015 and r["year"] > r["start"]]
            add(f"{right}−{left} historical fixed veteran rotation share", paired(vets, left, right, "rotation"),
                lambda x: x >= -.12, min_n=6)
        white = [r for r in panels["roles"] if r["group"] == "white-like" and r["start"] >= 2015 and r["year"] > r["start"]]
        add("B−A White-type total minutes", paired(white, "A", "B", "minutes"), lambda x: x >= -225, min_n=6)
        add("C−B White-type total minutes", paired(white, "B", "C", "minutes"), lambda x: x >= -225, min_n=6)
        for left, right in (("A", "B"), ("B", "C")):
            windows = [min(median_by_window((start, v) for start in sorted({r["start"] for r in white})
                       for v in paired([r for r in white if r["start"] == start], left, right, "minutes")), default=None)]
            add(f"{right}−{left} White-type minutes worst window median", windows, lambda x: x >= -300)

    if stage == "long":
        late = [r for r in league if r["year"] >= r["start"] + 14]
        cand = [r for r in late if r["arm"] == "C"]
        for metric, bound in (("generated_min", .90), ("playoff_generated_min", .85)):
            add(f"Late C minimum {metric}", [min((r[metric] or 0 for r in cand), default=None)], lambda x: x >= bound)
        for metric, low, high in (("ts", .51, .66), ("tpar", .25, .62), ("win_pct_sd", .07, .24),
                                  ("stars70", 3, 32), ("retire_age", 24, 37), ("generated_draft_in_rotation", 12, 60),
                                  ("freeAgent", 25, 300), ("salary_share_median", .010, .14)):
            add(f"Late C {metric}", [r[metric] for r in cand], lambda x: low <= x <= high, min_n=8)
        add("Late C−A competition dispersion", paired(late, "A", "C", "win_pct_sd"), lambda x: abs(x) <= .055, min_n=8)
        add("Late C−B unsigned prior rotation", paired(late, "B", "C", "prior_rotation_unsigned"),
            lambda x: x <= .05, min_n=8)
    return gates


def worst_season(rows, arm, metric):
    buckets = defaultdict(list)
    for r in rows:
        if r["arm"] == arm:
            buckets[r["start"], r["year"]].append(r[metric])
    return max(map(mean, buckets.values()), default=None)


def worst_season_difference(rows, left, right, metric):
    a = {(r["start"], r["seed"], r["year"]): r[metric] for r in rows if r["arm"] == left}
    buckets = defaultdict(list)
    for r in rows:
        if r["arm"] == right:
            buckets[r["start"], r["year"]].append(r[metric] - a[r["start"], r["seed"], r["year"]])
    return max(map(mean, buckets.values()), default=None)


def score(stage, artifacts, output, freeze):
    nba, bios, ratings = source_data()
    panels = defaultdict(list)
    plan = matrix(stage)
    groups = defaultdict(list)
    for cell in plan:
        groups[cell["start"], cell["seed"], cell["years"]].append(cell)
    actual_folders = {p.name for p in artifacts.iterdir() if p.is_dir()}
    require(actual_folders == {f"r16-cell-{key(c)}" for c in plan}, "Missing or unexpected result folders")
    for (start, seed, years), cells in groups.items():
        runs = {}
        for cell in cells:
            folder = artifacts / f"r16-cell-{key(cell)}"
            require((folder / "freeze.txt").read_text().strip() == freeze, f"{key(cell)}: wrong candidate freeze")
            runs[cell["arm"]] = read_run(folder, cell)
        opening_pair(runs)
        indexes = {k: player_index(v) for k, v in runs.items()}
        season_panels(runs, indexes, nba, bios, ratings, start, seed, years, panels)
        if stage != "long":
            panels["roles"].extend(role_followup([(start, seed, years, runs)], nba, bios))
    gates = aggregate_gates(stage, panels)
    passed = all(g["verdict"] == "PASS" or g["review_only"] for g in gates)
    output.mkdir(parents=True, exist_ok=True)
    for label, rows in panels.items():
        write_csv(output / f"{label}.csv", rows)
    write_csv(output / "gates.csv", gates)
    receipt = dict(stage=stage, freeze=freeze, passed=passed, cells=len(plan), league_seasons=sum(c["years"] for c in plan),
                   workflow_run=os.environ.get("GITHUB_RUN_ID"), workflow_sha=os.environ.get("GITHUB_SHA"), gates=gates)
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    lines = [f"## R16 {stage} — {'PASS' if passed else 'HOLD'}", "",
             "| Gate | Median or named extreme | Cells | Verdict |", "|---|---:|---:|---|"]
    lines += [f"| {g['metric']} | {g['value'] if g['value'] is None else round(g['value'], 4)} | {g['samples']} | "
              f"{g['verdict']}{' (review)' if g['review_only'] else ''} |" for g in gates]
    summary = "\n".join(lines) + "\n"
    print(summary)
    if path := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(path, "a") as f:
            f.write(summary)
    return passed


def explore(output):
    """Earlier matched cap2-only A/V9 treatment, useful for role risk and cohort verification."""
    nba, bios, _ = source_data()
    folder = HERE / "sim/output_full_r13m"
    rows = []
    for seed in (21, 22, 23):
        runs = {}
        for arm, dev in (("cap2+Playground", "playground"), ("cap2+V9", "v9s_l4")):
            with gzip.open(folder / f"full__2021__{dev}+three_anchor_rel_cap2__{seed}.json.gz", "rt") as f:
                runs[arm] = json.load(f)
        rows.extend(role_followup([(2021, seed, 5, runs)], nba, bios))
    output.parent.mkdir(parents=True, exist_ok=True)
    write_csv(output, rows)


def prior_receipt(stage, receipt, freeze, run_id, sha):
    receipt = read_json(receipt)
    required = MATRIX[stage]["prior"]
    require(required and receipt["stage"] == required and receipt["passed"] is True and receipt["freeze"] == freeze,
            f"{stage} requires a successful, same-freeze {required} receipt")
    require(receipt["workflow_run"] == run_id and receipt["workflow_sha"] == sha, "Prior receipt run or SHA mismatch")
    plan = matrix(required)
    require(receipt["cells"] == len(plan) and receipt["league_seasons"] == sum(c["years"] for c in plan)
            and receipt["gates"] and all(g["verdict"] == "PASS" or g["review_only"] for g in receipt["gates"]),
            "Incomplete or inconsistent receipt")


def cli():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for command in ("matrix", "score", "prior"):
        p = sub.add_parser(command)
        p.add_argument("stage", choices=MATRIX)
        if command == "score":
            p.add_argument("artifacts", type=Path)
            p.add_argument("output", type=Path)
            p.add_argument("freeze")
        if command == "prior":
            p.add_argument("receipt", type=Path)
            p.add_argument("freeze")
            p.add_argument("run_id")
            p.add_argument("sha")
    for command in ("probe", "explore"):
        p = sub.add_parser(command)
        p.add_argument("path", type=Path)
    args = parser.parse_args()
    if args.command == "matrix":
        print(json.dumps({"include": matrix(args.stage)}, separators=(",", ":")))
    elif args.command == "probe":
        probe(args.path)
    elif args.command == "explore":
        explore(args.path)
    elif args.command == "prior":
        prior_receipt(args.stage, args.receipt, args.freeze, args.run_id, args.sha)
    else:
        sys.exit(0 if score(args.stage, args.artifacts, args.output, args.freeze) else 1)


if __name__ == "__main__":
    cli()
