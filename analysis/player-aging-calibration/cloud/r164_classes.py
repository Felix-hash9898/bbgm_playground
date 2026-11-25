"""Score the classes round: I (F plus the second draft class rule) against A, F, H and the NBA. Fixed before any I result.

Every gate and bound of the succession round is reused unchanged (r164_succession.gates). H failed four of them in both windows.
Three gates are new and belong to what this rule claims: the best rookies have real draft ages, H's career gain is kept, and
free throw accuracy (generated players shot it too badly) does not drift. 2024/52 is also printed alone; it was never tuned on."""
import argparse
import gzip
import json
from pathlib import Path
from statistics import mean

import r164_succession as suc

HERE, long, base, op, r16 = suc.HERE, suc.long, suc.base, suc.op, suc.r16
LONG, SUCC = HERE / "results/r164_cloud/run_45518982285", HERE / "results/r164_cloud/run_45539949243"
TOP15 = (.30, .70)  # share of the best 15 first-year players per generated class drafted at 19 or 20; real drafts 2012-25 .49


def read_run(folder):
    with gzip.open(next(folder.glob("full__*.json.gz")), "rt") as f:
        return json.load(f)


def top15_young(folders):
    shares = []
    for folder in folders:
        run = read_run(folder)
        last = run["snapshots"][-1]["season"]
        classes = {}
        for sid, p in r16.player_index(run).items():
            d = p["draft"]["year"]
            if sid.startswith("generated_") and 2030 <= d < last and d + 1 in p["rating"]:
                classes.setdefault(d, []).append((p["rating"][d + 1]["ovr"], d - p["born"]))
        shares += [mean(age <= 20 for _, age in sorted(c, key=lambda x: -x[0])[:15]) for c in classes.values() if len(c) >= 30]
    return mean(shares)


def ft_drift(folders, first):
    out = []
    for folder in folders:
        made, tried = {}, {}
        for p in r16.player_index(read_run(folder)).values():
            for y, b in p["by_year"].items():
                made[y] = made.get(y, 0) + b["ft"]
                tried[y] = tried.get(y, 0) + b["fta"]
        pct = lambda years: sum(made[y] for y in years) / sum(tried[y] for y in years)
        out.append(pct(range(first + 14, first + 18)) - pct(range(first + 3, first + 6)))
    return mean(out)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("cells", type=Path); p.add_argument("output", type=Path)
    a = p.parse_args()
    eco, nba = long.nba_panel(12)
    source = []  # (window, arm, seed, folder)
    for cell in op.cells("classes"):
        folder = a.cells / f"r164-cell-{r16.key(cell)}"
        op.read_cell(folder, cell, suc.digest())
        source.append((str(cell["start"]), cell["arm"], cell["seed"], folder))
    for root, stage, freeze in ((LONG, "long", "freeze_long.json"), (SUCC, "succession", "freeze_succession.json")):
        for cell in op.cells(stage):
            if cell["arm"] in "AFH":
                folder = root / "cells" / f"r164-cell-{r16.key(cell)}"
                op.read_cell(folder, cell, suc.checksum(root / freeze))
                source.append((str(cell["start"]), cell["arm"], cell["seed"], folder))
    leagues = {(w, arm, seed): long.league(next(folder.glob("full__*.json.gz")), 12) for w, arm, seed, folder in source}
    results, report, info = [], {}, []
    for w in ("2021", "2024"):
        m = {arm: base.merge([v for (x, y, _), v in leagues.items() if (x, y) == (w, arm)]) for arm in "AFHI"}
        target = suc.nba_generated_share(int(w) + 17)
        rows, d = suc.gates({"A": m["A"], "F": m["F"], "H": m["I"]}, nba, eco, target, w, int(w))
        dh = base.distance(m["H"]["careers_all"], nba)
        mine = [f for x, arm, _, f in source if (x, arm) == (w, "I")]
        young, ft = top15_young(mine), ft_drift(mine, int(w))
        rows += [
            dict(window=w, area="classes", metric="best 15 rookies per generated class drafted at 19-20", value=young,
                 rule=f"{TOP15[0]} - {TOP15[1]} (real .49)", passed=TOP15[0] <= young <= TOP15[1]),
            dict(window=w, area="classes", metric="career distance I over the first class rule", value=d["H"] / dh, rule="<= 1.10", passed=d["H"] <= 1.10 * dh),
            dict(window=w, area="drift", metric="free throw accuracy, last four seasons minus seasons 4-6", value=ft, rule="+-.02", passed=abs(ft) <= .02),
        ]
        results += rows
        report[w] = dict(merged=m, distance=dict(A=d["A"], F=d["F"], H=dh, I=d["H"]), nba_generated=target)
        if w == "2024":
            one = {arm: base.merge([leagues[(w, arm, 52)]]) for arm in "AFI"}
            info, _ = suc.gates({"A": one["A"], "F": one["F"], "H": one["I"]}, nba, eco, target, w, int(w))
    a.output.mkdir()
    verdict = "REVIEW" if all(g["passed"] for g in results) else "HOLD"
    (a.output / "receipt.json").write_text(json.dumps(dict(release=suc.digest(), verdict=verdict, gates=results, independent_seed_52=info,
        nba_careers=nba, nba_ecology=eco, report=report), indent=1) + "\n")
    for g in results:
        print("pass" if g["passed"] else "FAIL", g["window"], f"{g['value']:+.3f}", g["rule"], "|", g["area"], g["metric"].replace("H - ", "I - ").replace(", H", ", I"))
    for g in info:
        print("  2024/52 alone", "pass" if g["passed"] else "FAIL", f"{g['value']:+.3f}", g["rule"], "|", g["metric"])
    print(verdict)


if __name__ == "__main__":
    main()
