"""Prepare and review the limited R16.1 open-league validation."""
import argparse
import gzip
import json
from pathlib import Path
from statistics import mean, median, stdev

import r16_acceptance as r16
from r161_open_freeze import BASE, FROZEN_R16, digest, checksum

MATRIX = r16.read_json(r16.HERE / "cloud/r161_open_matrix.json")
GS = {"C": "r16_midrange", "D": "r16_midrange", "E": "r161_adapt"}
WATCH = ("hardeja01", "lavinza01", "goberru01", "whitede01", "wembavi01", "adamsst01")


def lines(path):
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def read_cell(folder, cell, release):
    meta = r16.read_json(folder / "cell.json")
    arm, start, years = (cell[k] for k in ("arm", "start", "years"))
    r16.require(all(meta[k] == v for k, v in cell.items()) and meta["freeze"] == release
                and not meta["day"] and meta["market"] == (arm == "D") and meta["gs"] == GS[arm],
                f"{folder}: mismatched runner receipt")
    archive, = folder.glob("full__*.json.gz")
    with gzip.open(archive, "rt") as f:
        run = json.load(f)
    r16.require(run["gs"] == GS[arm] and run["years"] == years, f"{folder}: wrong arm or duration")
    r16.cell_id({**run, "gs": "r16_midrange"}, {**cell, "arm": "C"})
    seasons = list(range(start, start + years))
    r16.audit_hooks(run, seasons)
    for field in ("snapshots", "timings"):
        r16.require([row["season"] for row in run[field]] == [y + 1 for y in seasons], f"{folder}: incomplete {field}")
    r16.require(all(t["gcExposed"] and 0 < t["heapMB"] < 5500 and t["rearms"] <= 2 for t in run["timings"]),
                f"{folder}: GC or Auto Play integrity failure")
    failures = {"timeout", "giveUp", "researchHookError", "autoPlayError", "unhandledRejection"}
    heartbeat = lines(folder / "heartbeat.jsonl")
    r16.require(heartbeat and not any(row["event"] in failures for row in heartbeat), f"{folder}: bad heartbeat")
    payroll = lines(folder / "team_payroll.jsonl")
    r16.require([p["season"] for p in payroll] == [y + 1 for y in seasons] and
                all(p["cap"] == s["cap"] and p["luxuryPayroll"] > 0 and len(p["payroll"]) == 30 and
                    len({tid for tid, _ in p["payroll"]}) == 30 and min(v for _, v in p["payroll"]) > 0
                    for p, s in zip(payroll, run["snapshots"])), f"{folder}: incomplete payroll")
    signs = lines(folder / "incumbent_signings.jsonl")
    r16.require((arm == "D" or not signs) and all(p["priorTid"] == p["tid"] and p["faDays"] >= 14
                and p["after"] > p["before"] and p["phase"] == 8 for p in signs), f"{folder}: bad return counterfactual")
    responses = lines(folder / "style_response.jsonl")
    if arm == "E":
        r16.require([r["season"] for r in responses] == seasons and responses[0]["adjusted"] == 0 and
                    all((r["adjusted"] > 0) == (r["factor"] >= .8) for r in responses[1:]),
                    f"{folder}: missing or unexpected style response")
    else:
        r16.require(not responses, f"{folder}: style active in {arm}")
    return run, meta, payroll, signs


def read_archive(core, cell):
    folder = core / "cells" / f"r16-cell-{r16.key(cell)}"
    data = r16.read_json(core / "run.json")
    r16.require(data["headSha"] == BASE and data["databaseId"] == MATRIX["reuse"]["core_run"],
                "Core provenance mismatch")
    r16.require((folder / "freeze.txt").read_text().strip() == FROZEN_R16, "Core freeze mismatch")
    hashes = r16.read_json(core / "sha256.json")
    for name in ("full__*.json.gz", "heartbeat.jsonl", "freeze.txt"):
        file, = folder.glob(name)
        r16.require(checksum(file) == hashes[str(file.relative_to(core))], f"Archive mismatch: {file}")
    return r16.read_run(folder, cell)


def stats(index, sid, year):
    return index.get(sid, {}).get("by_year", {}).get(year, r16.ref.EMPTY)


def style_rows(start, seed, years, indexes, nba):
    """Compare same players in both arms and both seasons, with equal exposure rules."""
    rows = []
    for year in range(start + 1, start + years):
        prior, current = (nba[y] for y in (year - 1, year))
        eligible = {s for s in prior.keys() & current.keys() if
                    all(b[s]["min"] >= 500 and b[s]["fga"] >= 150 for b in (prior, current))}
        ids = sorted(s for s in eligible if all(stats(ix, s, y)["fga"] >= 75 and stats(ix, s, y)["min"] >= 300
                     for ix in indexes.values() for y in (year - 1, year)))
        r16.require(len(ids) >= max(20, .35 * len(eligible)), f"{start}/{seed}/{year}: style coverage below .35")
        actual = [(r16.ref.rates(prior[s]), r16.ref.rates(current[s])) for s in ids]
        truth = [b["tpar"] - a["tpar"] for a, b in actual]
        for arm, ix in indexes.items():
            observed = [tuple(r16.ref.rates(stats(ix, s, y)) for y in (year - 1, year)) for s in ids]
            change = [b["tpar"] - a["tpar"] for a, b in observed]
            mid = [(b["mid"], q["mid"]) for (p, q), (_, b) in zip(actual, observed)
                   if p["mid"] is not None and p["mid"] >= .38 and b["mid"] is not None]
            spill = [b["tpar"] >= .25 for (p, _), (_, b) in zip(actual, observed) if p["tpar"] <= .08]
            rows.append(dict(start=start, seed=seed, year=year, arm=arm, n=len(ids), eligible=len(eligible),
                sd_ratio=stdev(change) / stdev(truth), corr_nba=r16.corr(change, truth),
                level_mae=mean(abs(b["tpar"] - q["tpar"]) for (_, b), (_, q) in zip(observed, actual)),
                change_mae=mean(abs(a-b) for a,b in zip(change, truth)),
                spill=r16.avg(spill), spill_n=len(spill), mid_share=r16.avg(b for b, _ in mid), mid_n=len(mid),
                mid_mae=r16.avg(abs(b-q) for b,q in mid if q is not None), nba_mid_n=sum(q is not None for _, q in mid)))
    return rows


def style_gates(style):
    bounds = {"level_mae": .005, "change_mae": .004, "spill": .05, "mid_mae": .035}
    by_pair = {(r["start"], r["seed"], r["year"], r["arm"]): r for r in style}
    for start in sorted({r["start"] for r in style}):
        control = [row for row in style if row["start"] == start and row["arm"] == "C"]
        pairs = [(r, by_pair[start, r["seed"], r["year"], "E"]) for r in control]
        # Aggregate within each seed first so a longer window cannot mask a weak seed.
        for seed, rows in group(pairs, lambda p: p[0]["seed"]).items():
            ratio = median(b["sd_ratio"] for _, b in rows)
            yield dict(arm="E", start=start, seed=seed, metric="3PA change SD / NBA", value=ratio, bound=.40,
                       pass_gate=ratio >= .40, review_only=False)
            for metric, bound in bounds.items():
                ds = [b[metric]-a[metric] for a,b in rows if a[metric] is not None and b[metric] is not None]
                if not ds:
                    yield dict(arm="E", start=start, seed=seed, metric=metric, value=None, bound=bound,
                               pass_gate=None, review_only=True)
                    continue
                delta = median(ds)
                yield dict(arm="E", start=start, seed=seed, metric=metric, value=delta, bound=bound,
                           pass_gate=delta <= bound, review_only=False)


def group(rows, key):
    result = {}
    for row in rows:
        result.setdefault(key(row), []).append(row)
    return result


def context_rows(start, seed, years, runs, indexes, nba, bios, payroll):
    rows = {"careers": [], "team_payroll": [], "rookies": [], "unemployment": [], "old_stars_without_harden": []}
    older_stars = r16.cohorts(nba, bios, start)["star 31–35"] - {"hardeja01"}
    for arm, run in runs.items():
        for y, snap in zip(range(start, start + years), run["snapshots"]):
            market = {row[0]: row[1:] for row in snap["market"]}
            prior = {row[0]: row[1:] for row in run["snapshots"][y-start-1]["market"]} if y > start else {}
            cap, actual = snap["cap"], payroll.get((arm, y+1), {})
            records = {row[0]: row[1:] for row in snap["teamRecords"]}
            games = [sum(r[:3]) for r in records.values() if sum(r[:3]) > 0]
            r16.require(len(games) == 30 and len(market) >= 400 and min(games) >= 60, "Incomplete regular season")
            t = {tid: sum(p[1] for p in market.values() if p[0] == tid and p[2] >= y+1) for tid in records}
            base = dict(start=start, seed=seed, year=y, arm=arm)
            money = dict(actual.get("payroll", []))
            for tid, nominal in t.items():
                row = records[tid]
                rows["team_payroll"].append(dict(base, tid=tid, cap_season=y+1, cap=cap, nominal=nominal,
                    actual=money.get(tid), luxury_line=actual.get("luxuryPayroll"), wins=row[0], losses=row[1],
                    playoff_rounds=row[-1]))
            ix = indexes[arm]
            if older_stars:
                b = [stats(ix,s,y) for s in older_stars]
                rows["old_stars_without_harden"].append(dict(base, n=len(b), min=mean(p["min"] for p in b),
                    rotation=mean(p["min"] >= 500 for p in b), zero_gp=mean(p["gp"] == 0 for p in b)))
            for sid, p in ix.items():
                opening = prior.get(p["pid"])
                ovr = p["rating"].get(y, {}).get("ovr", 0)
                previous_min = stats(ix,sid,y-1)["min"]
                if opening and opening[0] == -1 and ovr >= 65 and previous_min >= 500:
                    b = stats(ix,sid,y)
                    rows["unemployment"].append(dict(base, sid=sid, age=y-p["born"], ovr=ovr, previous_min=previous_min,
                        gp=b["gp"], minutes=b["min"], ask=opening[1], retired=p["retiredYear"]))
            for sid in WATCH:
                p = ix.get(sid, {})
                now = prior.get(p.get("pid"), [None]*4)
                future = market.get(p.get("pid"), [None]*4)
                b = stats(ix, sid, y)
                rows["careers"].append(dict(base, sid=sid, gp=b["gp"], minutes=b["min"], nba_minutes=nba[y].get(sid, r16.ref.EMPTY)["min"],
                    plays36=r16.ref.rates(b)["plays36"], ovr=p.get("rating", {}).get(y, {}).get("ovr"), retired=p.get("retiredYear"),
                    prior_tid=now[0], next_tid=future[0], next_salary=future[1], next_exp=future[2], prior_injury=now[3],
                    new_injury_games=sum(i["games"] for i in p.get("injuries", []) if i["season"]==y),
                    transactions=",".join(t["type"] for t in p.get("transactions", []) if t["season"]==y)))
            rookies = r16.cohorts(nba, bios, y)["rookie-drafted"]
            if rookies:
                rows["rookies"].append(dict(base, n=len(rookies),
                    rotation=mean(stats(ix,s,y)["min"] * 82 / mean(games) >= 500 for s in rookies)))
    return rows


def opening_role_gates(rows, rookies):
    for arm in ("D", "E"):
        for metric, threshold, data, predicate in [
            ("White-like rotation", -.10, rows, lambda r: r["group"] == "white-like"),
            ("White-like minutes", -225, rows, lambda r: r["group"] == "white-like"),
            ("Newly drafted real players rotation", -.09, rookies, lambda r: True),
        ]:
            field = "minutes" if metric.endswith("minutes") else "rotation"
            by_season = {(r["start"],r["seed"],r["year"],r["arm"]):r[field] for r in data if predicate(r)}
            d = [value - by_season[start,seed,year,"C"] for (start,seed,year,a),value in by_season.items()
                 if a == arm and start == 2021 and year > start]
            r16.require(len(d) == 10, f"Missing 2021 role panel for {arm}")
            delta = median(d)
            yield dict(arm=arm, start=2021, seed=None, metric=metric, value=delta, bound=threshold,
                       pass_gate=delta >= threshold, review_only=False)


def score(core, artifacts, output, run_id, sha):
    release = digest()
    expected = {f"r161-cell-{r16.key(c)}" for c in MATRIX["run"]}
    r16.require({p.name for p in artifacts.iterdir() if p.is_dir()} == expected, "Missing or unexpected R16.1 cells")
    nba, bios, _ = r16.source_data()
    panels = {k: [] for k in ("style", "roles", "careers", "team_payroll", "rookies", "signings",
                             "unemployment", "old_stars_without_harden")}
    gates = []
    for (start, seed, years), cells in group(MATRIX["run"], lambda c:(c["start"],c["seed"],c["years"])).items():
        runs = {}
        payroll = {}
        signs = []
        if start == MATRIX["reuse"]["start"]:
            for arm in MATRIX["reuse"]["arms"]:
                runs[arm] = read_archive(core, dict(arm=arm, start=start, seed=seed, years=years))
        for cell in cells:
            arm = cell["arm"]
            data, meta, pay, events = read_cell(artifacts / f"r161-cell-{r16.key(cell)}", cell, release)
            r16.require(meta["run"] == run_id and meta["sha"] == sha, "Mixed workflow runs or SHAs")
            runs[arm] = data
            payroll.update({(arm, p["season"]): p for p in pay})
            signs.extend(events)
        r16.require(all(run["opening"] == runs["C"]["opening"] for run in runs.values()), "Different opening fingerprints")
        indexes = {arm: r16.player_index(run) for arm, run in runs.items()}
        panels["style"].extend(style_rows(start, seed, years, {a:indexes[a] for a in ("C","E")}, nba))
        panels["roles"].extend(r16.role_followup([(start, seed, years, runs)], nba, bios))
        for name, rows in context_rows(start, seed, years, runs, indexes, nba, bios, payroll).items():
            panels[name].extend(rows)
        panels["signings"].extend(dict(row, start=start, seed=seed, arm="D") for row in signs)
        if "D" in indexes:
            for sid in (("hardeja01", "lavinza01") if seed == 21 else ("hardeja01",)):
                signed = any(p.get("id") == sid and p["season"] == 2022 for p in signs)
                minutes = min(stats(indexes["D"], sid, y)["min"] for y in (2023, 2024))
                gates.append(dict(arm="D", start=start, seed=seed, metric=f"{sid} incumbent signing and min in 2023/24",
                                  value=minutes, bound=500, pass_gate=signed and minutes >= 500, review_only=False))
    gates.extend(style_gates(panels["style"]))
    gates.extend(opening_role_gates(panels["roles"], panels["rookies"]))
    output.mkdir()
    for name, rows in dict(panels, gates=gates).items():
        r16.write_csv(output / f"{name}.csv", rows)
    automated = {a: all(g["pass_gate"] for g in gates if g["arm"]==a and not g["review_only"]) for a in ("D","E")}
    verdict = {a: "REVIEW" if ok else "HOLD" for a,ok in automated.items()}
    (output / "receipt.json").write_text(json.dumps(dict(run=run_id, sha=sha, release=release,
        new_cells=len(expected), league_seasons=sum(c["years"] for c in MATRIX["run"]),
        verdict=verdict, long="HOLD", gates=gates), indent=2)+"\n")
    print(json.dumps(verdict))
    return all(automated.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="action", required=True)
    subs.add_parser("matrix")
    cell = subs.add_parser("cell")
    cell.add_argument("folder", type=Path)
    cell.add_argument("arm", choices=GS)
    for key in ("start","seed","years"):
        cell.add_argument(key, type=int)
    review = subs.add_parser("score")
    for key in ("core", "artifacts", "output"):
        review.add_argument(key, type=Path)
    review.add_argument("--run", required=True)
    review.add_argument("--sha", required=True)
    args = parser.parse_args()
    if args.action == "matrix":
        print(json.dumps({"include":MATRIX["run"]}, separators=(",",":")))
    elif args.action == "cell":
        spec = {k:getattr(args,k) for k in ("arm","start","seed","years")}
        r16.require(spec in MATRIX["run"], "Cell is outside the R16.1 open league matrix")
        read_cell(args.folder, spec, digest())
        print(f"Complete cell {r16.key(spec)}")
    else:
        raise SystemExit(0 if score(args.core, args.artifacts, args.output, args.run, args.sha) else 3)


if __name__ == "__main__":
    main()
