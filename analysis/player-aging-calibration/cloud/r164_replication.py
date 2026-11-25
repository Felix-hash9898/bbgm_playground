"""Replicate the classes round on seeds no arm has seen: I against F and H of the same seeds, archived A, and the NBA.

Fixed before any result. I is unchanged. Every gate and bound of cloud/r164_classes.py is reused; only the leagues are new, and
only the new seeds decide. The classes verdict (HOLD, 40/44) is not changed by this. Why a replication and not a fix: the
career distance of one 2024 league has a sampling sd of .04 (players resampled), and the failed comparisons were I - F = .03
and I - H = .06 with one or two seeds each. Pooled seeds and the sampling error of the distance are printed as information."""
import argparse
import json
from pathlib import Path
from statistics import mean, pstdev

import r164_classes as cls

suc, long, base, op, r16 = cls.suc, cls.long, cls.base, cls.op, cls.r16
HERE, LONG, SUCC = cls.HERE, cls.LONG, cls.SUCC
CLASSES = HERE / "results/r164_cloud/run_45557113862"


def load(root, stage, release, arms):
    for cell in op.cells(stage):
        if cell["arm"] in arms:
            folder = root / f"r164-cell-{r16.key(cell)}"
            op.read_cell(folder, cell, release)
            yield str(cell["start"]), cell["arm"], cell["seed"], folder


def score(w, m, nba, eco, folders):
    target = suc.nba_generated_share(int(w) + 17)
    rows, d = suc.gates({"A": m["A"], "F": m["F"], "H": m["I"]}, nba, eco, target, w, int(w))
    dh = base.distance(m["H"]["careers_all"], nba)
    young, ft = cls.top15_young(folders), cls.ft_drift(folders, int(w))
    rows += [
        dict(window=w, area="classes", metric="best 15 rookies per generated class drafted at 19-20", value=young, rule=f"{cls.TOP15[0]} - {cls.TOP15[1]} (real .49)", passed=cls.TOP15[0] <= young <= cls.TOP15[1]),
        dict(window=w, area="classes", metric="career distance I over the first class rule", value=d["H"] / dh, rule="<= 1.10", passed=d["H"] <= 1.10 * dh),
        dict(window=w, area="drift", metric="free throw accuracy, last four seasons minus seasons 4-6", value=ft, rule="+-.02", passed=abs(ft) <= .02),
    ]
    return rows, dict(A=d["A"], F=d["F"], H=dh, I=d["H"])


def seed_spread(leagues, w, nba):
    """Mean and standard error over seeds of each arm's career distance, and of I - F and I - H on the same seeds."""
    one = {}
    for (x, arm, seed), v in leagues.items():
        if x == w:
            one.setdefault(arm, {})[seed] = base.distance(v["careers_all"], nba)
    se = lambda v: pstdev(v) / max(1, len(v) - 1) ** .5
    out = {arm: (mean(v.values()), se(list(v.values())), len(v)) for arm, v in one.items()}
    for other in "FH":
        pair = [one["I"][s] - one[other][s] for s in one.get("I", {}) if s in one.get(other, {})]
        out["I-" + other] = (mean(pair), se(pair), len(pair))
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("cells", type=Path); p.add_argument("output", type=Path)
    a = p.parse_args()
    eco, nba = long.nba_panel(12)
    new = list(load(a.cells, "replication", suc.digest(), "FHI"))
    old = [x for root, stage, freeze in ((LONG, "long", "freeze_long.json"), (SUCC, "succession", "freeze_succession.json"), (CLASSES, "classes", "freeze_classes.json"))
           for x in load(root / "cells", stage, suc.checksum(root / freeze), "AFHI")]
    leagues = {(w, arm, seed): long.league(next(f.glob("full__*.json.gz")), 12) for w, arm, seed, f in new + old}
    fresh = {(w, arm, seed) for w, arm, seed, _ in new}
    results, pooled, report = [], [], {}
    for w in ("2021", "2024"):
        pick = lambda arm, keys: base.merge([v for k, v in leagues.items() if k[:2] == (w, arm) and k in keys])
        seen = set(leagues) - fresh
        m = {arm: pick(arm, seen if arm == "A" else fresh) for arm in "AFHI"}
        mine = [f for x, arm, _, f in new if (x, arm) == (w, "I")]
        rows, d = score(w, m, nba, eco, mine)
        results += rows
        every = {arm: pick(arm, set(leagues)) for arm in "AFHI"}
        more, dp = score(w, every, nba, eco, mine + [f for x, arm, _, f in old if (x, arm) == (w, "I")])
        pooled += more
        report[w] = dict(merged=m, distance=d, pooled_distance=dp, seeds=seed_spread(leagues, w, nba))
    a.output.mkdir()
    verdict = "REVIEW" if all(g["passed"] for g in results) else "HOLD"
    (a.output / "receipt.json").write_text(json.dumps(dict(release=suc.digest(), verdict=verdict, gates=results, pooled_all_seeds=pooled,
        nba_careers=nba, nba_ecology=eco, report=report), indent=1) + "\n")
    for g, q in zip(results, pooled):
        print("pass" if g["passed"] else "FAIL", g["window"], f"{g['value']:+.3f}", g["rule"], "|", g["area"], g["metric"].replace("H - ", "I - ").replace(", H", ", I"),
              f"| all seeds {q['value']:+.3f} {'pass' if q['passed'] else 'fail'}")
    for w in report:
        print(w, "career distance by seed: mean, s.e., n", {k: tuple(round(x, 3) for x in v) for k, v in report[w]["seeds"].items()})
    print(verdict, sum(g["passed"] for g in results), "of", len(results))


if __name__ == "__main__":
    main()
