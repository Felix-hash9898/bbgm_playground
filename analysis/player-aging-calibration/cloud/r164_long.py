"""Score the frozen R16.4 eighteen-season experiment (A, B, C, F; seeds 31, 32). Gates fixed before any long result."""
import argparse
import json
import sys
from collections import defaultdict
from importlib import import_module
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "scripts"))
import r16_acceptance as r16  # noqa: E402
import r164_open as op  # noqa: E402
from r164_open_freeze import digest  # noqa: E402

long = import_module("152_r164_long")
CAREER = ("regular_seasons", "never", "eight_plus", "early_exit", "late_start", "top30_ever", "top100_ever", "star_top30_seasons", "star_peak_year")


def distance(row, nba):
    return mean(abs(row[k] - nba[k]) / nba[k] for k in CAREER if row.get(k) is not None and nba[k])


def gates(m, nba, eco):
    F, C, A = m["F"], m["C"], m["A"]
    t = lambda x, k: x["tail"][k]
    between = lambda v, lo, hi: lo <= v <= hi
    yield "succession", "generated minutes, last four seasons", t(F, "generated"), ">= .85", t(F, "generated") >= .85
    yield "succession", "first-year minutes share, last four seasons", t(F, "exp1"), ">= .035 and >= C - .005", t(F, "exp1") >= .035 and t(F, "exp1") >= t(C, "exp1") - .005
    yield "succession", "minutes share aged 22 or less, last four seasons", t(F, "young22"), ">= .07", t(F, "young22") >= .07
    yield "succession", "minutes share aged 33 or more, last four seasons", t(F, "old33"), ".05 - .18", between(t(F, "old33"), .05, .18)
    yield "succession", "mean age, last four seasons, minus NBA", t(F, "mean_age") - eco["mean_age"][0], "+-1.2", abs(t(F, "mean_age") - eco["mean_age"][0]) <= 1.2
    yield "ability", "top-300 OVR, last four seasons", t(F, "top300"), "53 - 60", between(t(F, "top300"), 53, 60)
    yield "ability", "players 70+, last four seasons", t(F, "ovr70"), "1 - 14", between(t(F, "ovr70"), 1, 14)
    yield "ability", "players 60+, last four seasons", t(F, "ovr60"), "40 - 120", between(t(F, "ovr60"), 40, 120)
    for k, bound in (("ts", .015), ("p2", .02), ("tpar", .06), ("ftr", .03)):
        drift = t(F, k) - mean(F["seasons"][y][k] for y in (2024, 2025, 2026))
        yield "drift", f"{k}, last four seasons minus 2024-26", drift, f"+-{bound}", abs(drift) <= bound
    yield "market", "healthy proven 62+ unused, per season", F["mean"]["idle62"], "<= .15 and <= C", F["mean"]["idle62"] <= .15 and F["mean"]["idle62"] <= C["mean"]["idle62"] + 1e-9
    yield "market", "top-five payroll / cap, F - C", F["mean"]["pay_top5"] - C["mean"]["pay_top5"], "<= .08", F["mean"]["pay_top5"] - C["mean"]["pay_top5"] <= .08
    yield "market", "team win SD, F - C", F["mean"]["win_sd"] - C["mean"]["win_sd"], "<= .025", F["mean"]["win_sd"] - C["mean"]["win_sd"] <= .025
    d = {a: distance(m[a]["careers_all"], nba) for a in m}
    yield "career", "distance of 12-season careers to NBA, F", d["F"], f"< A ({d['A']:.3f}) and <= 1.05 C ({d['C']:.3f})", d["F"] < d["A"] and d["F"] <= 1.05 * d["C"]
    yield "career", "share with eight or more regular seasons, F - NBA", F["careers_all"]["eight_plus"] - nba["eight_plus"], "+-.10", abs(F["careers_all"]["eight_plus"] - nba["eight_plus"]) <= .10
    yield "career", "top-30 seasons per star, F / NBA", F["careers_all"]["star_top30_seasons"] / nba["star_top30_seasons"], ".70 - 1.45", between(F["careers_all"]["star_top30_seasons"] / nba["star_top30_seasons"], .70, 1.45)
    age = F["retire"]
    yield "career", "mean retirement age of 5000+ minute careers", age, "33.5 - 38", between(age, 33.5, 38)


def merge(runs):
    """Average seeds of one arm."""
    out = {p: {k: mean(r[p][k] for r in runs) for k in runs[0][p]} for p in ("mean", "tail")}
    out["seasons"] = {y: {k: mean(r["seasons"][y][k] for r in runs) for k in runs[0]["seasons"][y]} for y in runs[0]["seasons"]}
    for p in ("careers_all", "careers_real", "careers_generated"):
        out[p] = {k: (mean(r[p][k] for r in runs if r[p].get(k) is not None) if any(r[p].get(k) is not None for r in runs) else None) for k in runs[0][p]}
    out["retire"] = mean(r["retire_age"][0] for r in runs)
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("cells", type=Path); p.add_argument("output", type=Path)
    a = p.parse_args()
    release = digest()
    runs = defaultdict(list)
    for cell in op.cells("long"):
        folder = a.cells / f"r164-cell-{r16.key(cell)}"
        op.read_cell(folder, cell, release)
        runs[cell["arm"]].append(long.league(next(folder.glob("full__*.json.gz")), 12))
    eco, nba = long.nba_panel(12)
    merged = {arm: merge(v) for arm, v in runs.items()}
    results = [dict(area=x, metric=t, value=v, rule=r, passed=bool(ok)) for x, t, v, r, ok in gates(merged, nba, eco)]
    a.output.mkdir()
    verdict = "REVIEW" if all(g["passed"] for g in results) else "HOLD"
    (a.output / "receipt.json").write_text(json.dumps(dict(release=release, verdict=verdict, gates=results, distance={k: distance(v["careers_all"], nba) for k, v in merged.items()},
                                                            nba_careers=nba, merged=merged), indent=1) + "\n")
    for g in results:
        print("pass" if g["passed"] else "FAIL", f"{g['value']:+.3f}", g["rule"], "|", g["area"], g["metric"])
    print(verdict)


if __name__ == "__main__":
    main()
