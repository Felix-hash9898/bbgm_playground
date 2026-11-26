"""Audit the short K/P POT pilot using the preregistered rules in R164_POT_PILOT.md."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
from statistics import mean, pstdev

import r164_open as op


def check(window, season, name, value, bound, passed):
    return dict(window=window, season=season, name=name, value=value, bound=bound, passed=bool(passed))


def seasonal(run, year):
    players = op.r16.player_index(run)
    boxes = {s: p["by_year"][year] for s, p in players.items() if year in p["by_year"]}
    mins = lambda sid: boxes.get(sid, {}).get("min", 0)
    summary = {}
    for round_ in (1, 2):
        picks = [s for s, p in players.items() if p["draft"]["year"] == year - 1 and p["draft"]["round"] == round_]
        summary[f"round{round_}_500"] = mean(mins(s) >= 500 for s in picks)
    cohort = [s for s, p in players.items() if p["real"] and 19 <= year - p["born"] <= 24 and year in p["rating"]
              and p["draft"]["year"] < year]
    summary["young_minutes"] = mean(mins(s) for s in cohort)
    totals = {k: sum(v[k] for v in boxes.values()) for k in ("pts", "fga", "fta")}
    summary["ts"] = totals["pts"] / (2 * (totals["fga"] + .44 * totals["fta"]))
    snap = run["snapshots"][year - run["start"]]
    summary["win_sd"] = pstdev(w / (w + l + t) for _, w, l, t, *_ in snap["teamRecords"] if w + l + t)
    summary["idle"] = sum(
        p["by_year"].get(year - 1, {}).get("min", 0) >= 1000 and mins(s) == 0
        and p["rating"].get(year, {}).get("ovr", 0) >= 62
        and not any(i["season"] == year and i["games"] >= 10 for i in p["injuries"])
        for s, p in players.items()
    )
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cells", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    freeze = op.digest()
    leagues, logs = defaultdict(dict), {}
    release_pairs = set()
    for cell in op.cells("pot"):
        start, seed, arm = (cell[k] for k in ("start", "seed", "arm"))
        folder = args.cells / f"r164-cell-{op.r16.key(cell)}"
        run = op.read_cell(folder, cell, freeze)
        if run["start"] != start or not run["selfTest"]["ok"]:
            raise ValueError(f"{start}/{seed}/{arm}: wrong simulation or formula")
        cell_receipt = json.loads((folder / "cell.json").read_text())
        expect = "finish,rookies,market,style,classes,growth,files" + (",openingPot" if arm == "P" else "")
        if cell_receipt["components"] != expect or not cell_receipt["sha"] or not cell_receipt["run"]:
            raise ValueError(f"{start}/{seed}/{arm}: wrong components or missing commit and run")
        release_pairs.add((cell_receipt["sha"], cell_receipt["run"]))
        logs[start, seed, arm] = op.lines(folder / "opening_pot.jsonl")
        leagues[start, seed][arm] = run
    if len(release_pairs) != 1:
        raise ValueError("Mixed cloud releases")
    commit, run_id = release_pairs.pop()
    checked, rows, report = {}, [], defaultdict(dict)
    for (start, seed), arms in leagues.items():
        before = arms["K"]["opening"]
        opening = logs[start, seed, "P"]
        if before != arms["P"]["opening"] or len(opening) != 1 or logs[start, seed, "K"]:
            raise ValueError(f"{start}/{seed}: wrong opening or POT hook activity")
        ledger = opening[0]
        after = ledger["after"]
        if (ledger["season"] != start or any(after[k] != v for k, v in before.items() if k != "potential")
                or after["potential"] == before["potential"]):
            raise ValueError(f"{start}/{seed}: the opening boundary is wrong")
        change = [p for p in ledger["rows"] if p["before"] != p["after"]]
        if any(p["after"] < p["ovr"] or not 19 <= p["age"] <= 26 for p in ledger["rows"]):
            raise ValueError(f"{start}/{seed}: changed an ineligible player or violated POT >= OVR")
        groups = {f"{lo}-{hi}": dict(n=len(group), pot_delta=mean(p["after"] - p["before"] for p in group),
                                     value_delta=mean(p["valueAfter"] - p["valueBefore"] for p in group))
                  for lo, hi in ((19, 22), (23, 26))
                  for group in [[p for p in ledger["rows"] if lo <= p["age"] <= hi]]}
        rows.append(check(start, start, f"{seed} POT updates", len(change), ">=100", len(change) >= 100))
        for age, stats in groups.items():
            rows.append(check(start, start, f"{seed} mean POT change, {age}", stats["pot_delta"], "<0", stats["pot_delta"] < 0))
        report[start][seed] = dict(changed=len(change), age=groups)
        checked[start, seed] = {arm: {year: seasonal(run, year) for year in (start, start + 1)} for arm, run in arms.items()}

    def bound(window, year, name, value, limit, key):
        passed = value >= limit if key == "min" else value <= limit
        rows.append(check(window, year, name, value, f"{'>=' if key == 'min' else '<='} {limit}", passed))

    for start in sorted(report):
        keys = [k for k in checked if k[0] == start]
        for year in (start, start + 1):
            for metric, limit, mode in (("round1_500", -.05, "min"), ("ts", .006, "max_abs"),
                                        ("win_sd", .025, "max_abs"), ("idle", 0, "max"), ("young_minutes", -60, "min")):
                if metric == "young_minutes" and year != start:
                    continue
                deltas = [checked[k]["P"][year][metric] - checked[k]["K"][year][metric] for k in keys]
                value = abs(mean(deltas)) if mode == "max_abs" else mean(deltas)
                bound(start, year, metric, value, limit, mode)
    args.output.mkdir()
    receipt = dict(freeze=freeze, commit=commit, run=run_id, verdict="REVIEW" if all(row["passed"] for row in rows) else "HOLD", gates=rows,
                   inputs=report, league={f"{w}/{seed}": v for (w, seed), v in checked.items()})
    (args.output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(receipt["verdict"], sum(r["passed"] for r in rows), "/", len(rows))


if __name__ == "__main__":
    main()
