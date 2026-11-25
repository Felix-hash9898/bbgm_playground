"""Score the growth round: K (I + corrected mean growth, recalibrated generated classes, lifted speculative file classes).

Fixed before any result. Needs pandas. Three questions:
1. Whole product: every gate and bound of cloud/r164_classes.py with K in I's place, against archived F and H of the same seeds
   and archived A (seeds 2021/33-35, 2024/53-57). The same gates for J (no file lift) are attribution, not a verdict.
2. Growth itself, in eras the correction was never fitted on (openings 2008, 2012, 2017; F and J, three seeds each): the real
   opening players' counts at 55+ and 60+ after one to five years (scripts/156). J's misfit must be at most .85 of F's, and no
   age band with at least 12 real players three or five years on may be off by more than 35% at 55+.
3. The gap that started this round: 2021 opening, players born 2000-05 at 60+ in 2026 (real 34; archived I 63, A 76). K must
   close at least a third of I's excess, and careers must not be traded for it (career distance K <= 1.05 I, same seeds)."""
import argparse
import json
from collections import defaultdict
from importlib import import_module
from pathlib import Path
from statistics import mean

import r164_replication as rep

suc, long, base, op, r16, HERE = rep.suc, rep.long, rep.base, rep.op, rep.r16, rep.HERE
audit = import_module("156_r164_growth_audit")
REPL = HERE / "results/r164_cloud/run_45580643418"
ERAS = (2008, 2012, 2017)
SEEDS = {"2021": (33, 34, 35), "2024": (53, 54, 55, 56, 57)}


def born_2000_05(folder):
    ix, _, _ = audit.read(next(folder.glob("full__*.json.gz")))
    return sum(2000 <= p["born"] <= 2005 and not s.startswith("generated_") and p["rating"].get(2026, {"ovr": 0})["ovr"] >= 60 and
               not (p["retiredYear"] and p["retiredYear"] < 2026) for s, p in ix.items())


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("cells", type=Path); p.add_argument("output", type=Path)
    a = p.parse_args()
    eco, nba = long.nba_panel(12)
    fresh = list(rep.load(a.cells, "growth", suc.digest(), "FJK"))
    old = [x for root, stage, freeze in ((rep.LONG, "long", "freeze_long.json"), (rep.SUCC, "succession", "freeze_succession.json"),
                                         (rep.CLASSES, "classes", "freeze_classes.json"), (REPL, "replication", "freeze_replication.json"))
           for x in rep.load(root / "cells", stage, suc.checksum(root / freeze), "AFHI")]
    lg = {(w, arm, seed): long.league(next(f.glob("full__*.json.gz")), 12) for w, arm, seed, f in fresh + old
          if w in SEEDS and (arm == "A" or seed in SEEDS[w])}
    results, attribution, report = [], [], {}
    for w in SEEDS:
        m = {arm: base.merge([v for k, v in lg.items() if k[:2] == (w, arm)]) for arm in "AFHIJK"}
        for arm, rows in (("K", results), ("J", attribution)):
            got, _ = rep.score(w, dict(m, I=m[arm]), nba, eco, [f for x, y, _, f in fresh if (x, y) == (w, arm)])
            rows += got
        d = {arm: base.distance(m[arm]["careers_all"], nba) for arm in m}
        results.append(dict(window=w, area="career", metric="career distance K / I, same seeds", value=d["K"] / d["I"], rule="<= 1.05", passed=d["K"] <= 1.05 * d["I"]))
        report[w] = dict(merged=m, distance=d)
    real, tables = audit.real_ratings(), {}
    for arm in "FJ":
        runs = defaultdict(list)
        for w, y, _, f in fresh:
            if y == arm and int(w) in ERAS:
                runs[int(w)].append(audit.read(next(f.glob("full__*.json.gz"))))
        tables[arm] = audit.table(runs, real)
    fit = {arm: audit.misfit(t) for arm, t in tables.items()}
    results.append(dict(window="eras", area="growth", metric=f"misfit J / F, unseen eras (F {fit['F']:.2f})", value=fit["J"] / fit["F"], rule="<= .85", passed=fit["J"] <= .85 * fit["F"]))
    for band in audit.BANDS:
        for lag in (3, 5):
            r, s = tables["J"][band, lag, 55]
            if r >= 12:
                results.append(dict(window="eras", area="growth", metric=f"55+ after {lag} years, opening age {band[0]}-{band[1]}, J / real (real {r:.0f}, F {tables['F'][band, lag, 55][1]:.0f})",
                                    value=s / r, rule=".65 - 1.35", passed=.65 <= s / r <= 1.35))
    ratings = audit.pd.read_parquet(HERE / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"])
    target = int(((ratings.season == 2026) & ratings.bornYear.between(2000, 2005) & (ratings.ovr >= 60)).sum())
    count = {arm: mean(born_2000_05(f) for w, y, seed, f in fresh + old if w == "2021" and y == arm and seed in SEEDS[w]) for arm in "IJK"}
    close = (count["I"] - count["K"]) / (count["I"] - target)
    results.append(dict(window="2021", area="growth", metric=f"share of I's excess closed, born 2000-05 at 60+ in 2026 (real {target}, I {count['I']:.1f}, J {count['J']:.1f}, K {count['K']:.1f})",
                        value=close, rule=">= .33", passed=close >= .33))
    a.output.mkdir()
    verdict = "REVIEW" if all(g["passed"] for g in results) else "HOLD"
    flat = {arm: {f"{b[0]}-{b[1]} lag {lag} {level}+": v for (b, lag, level), v in t.items()} for arm, t in tables.items()}
    (a.output / "receipt.json").write_text(json.dumps(dict(release=suc.digest(), verdict=verdict, gates=results, attribution_J=attribution, misfit=fit,
        eras=flat, nba_careers=nba, nba_ecology=eco, report=report), indent=1) + "\n")
    other = {(g["window"], g["metric"]): g for g in attribution}
    for g in results:
        o = other.get((g["window"], g["metric"]))
        print("pass" if g["passed"] else "FAIL", g["window"], f"{g['value']:+.3f}", g["rule"], "|", g["area"], g["metric"].replace("H - ", "K - ").replace(", H", ", K"),
              f"| J {o['value']:+.3f} {'pass' if o['passed'] else 'fail'}" if o else "")
    print(verdict, sum(g["passed"] for g in results), "of", len(results))


if __name__ == "__main__":
    main()
