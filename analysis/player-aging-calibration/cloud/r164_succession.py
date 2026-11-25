"""Score the succession round: H (F plus real-age draft classes) against A, F and the NBA. Gates fixed before any H result.

Why not the long gates of r164_long.py: they required 85% generated minutes after eighteen seasons, but the opening file
carries real draft classes through 2028, so even an NBA-like league would show about 68% there. Here the same question is
asked against the NBA minute share of players with equally few seasons. The long verdict (HOLD) is not changed by this."""
import argparse
import json
import sys
from importlib import import_module
from pathlib import Path
from statistics import mean

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "scripts"))
import r16_acceptance as r16  # noqa: E402
import r164_long as base  # noqa: E402
import r164_open as op  # noqa: E402
from r164_open_freeze import checksum, digest  # noqa: E402

long, acc = base.long, base.long.acc
ARCHIVE = HERE / "results/r164_cloud/run_45518982285"
FIRST_GENERATED = 2029  # draft year of the first mostly generated class in every opening file
# Players born 2000-04 are about 1.6 times as many at 60+ as a usual real generation. They are 31-38 at the end of the 2021
# window and 34-41 at the end of the 2024 window, so the first window asks for less.
GENERATED = {"2021": .75, "2024": .85}; OLD = {"2021": .20, "2024": .18}


def nba_generated_share(last):
    """Mean NBA minute share (2012-26) of players drafted recently enough, averaged over the last four seasons."""
    nba, bios, _ = r16.source_data()
    drafted = {s: b["draftYear"] for s, b in bios.items() if b.get("draftYear")}
    shares = []
    for y in range(2012, 2027):
        t = acc.season_table(nba[y]); total = sum(r["min"] for r in t.values())
        shares.append({k: sum(r["min"] for s, r in t.items() if s in drafted and 1 <= y - drafted[s] <= k) / total for k in range(1, 20)})
    return mean(mean(s[y - FIRST_GENERATED] for s in shares) for y in range(last - 3, last + 1))


def gates(m, nba, eco, target, label, first):
    H, F, A = m["H"], m["F"], m["A"]
    t = lambda x, k: x["tail"][k]
    d = {a: base.distance(m[a]["careers_all"], nba) for a in m}
    rows = [
        ("succession", "generated minutes, last four seasons / NBA equivalent", t(H, "generated") / target, f">= {GENERATED[label]} (NBA equivalent {target:.3f}) and above F", t(H, "generated") >= GENERATED[label] * target and t(H, "generated") > t(F, "generated")),
        ("succession", "first-year minutes share, last four seasons", t(H, "exp1"), ">= .045", t(H, "exp1") >= .045),
        ("succession", "minutes share aged 22 or less", t(H, "young22"), ">= .075", t(H, "young22") >= .075),
        ("succession", "minutes share aged 33 or more", t(H, "old33"), f".05 - {OLD[label]} and below F", .05 <= t(H, "old33") <= OLD[label] and t(H, "old33") < t(F, "old33")),
        ("succession", "mean age minus NBA", t(H, "mean_age") - eco["mean_age"][0], "+-1.2", abs(t(H, "mean_age") - eco["mean_age"][0]) <= 1.2),
        ("ability", "top-300 OVR", t(H, "top300"), "53 - 60", 53 <= t(H, "top300") <= 60),
        ("ability", "players 70+", t(H, "ovr70"), "1 - 14", 1 <= t(H, "ovr70") <= 14),
        ("ability", "players 60+", t(H, "ovr60"), "40 - 120", 40 <= t(H, "ovr60") <= 120),
    ]
    for k, bound in (("ts", .015), ("p2", .02), ("tpar", .06), ("ftr", .03)):
        drift = t(H, k) - mean(H["seasons"][y][k] for y in (first + 3, first + 4, first + 5))
        rows.append(("drift", f"{k}, last four seasons minus seasons 4-6", drift, f"+-{bound}", abs(drift) <= bound))
    rows += [
        ("market", "healthy proven 62+ unused, per season", H["mean"]["idle62"], "<= .15", H["mean"]["idle62"] <= .15),
        ("market", "top-five payroll / cap, H - F", H["mean"]["pay_top5"] - F["mean"]["pay_top5"], "<= .08", H["mean"]["pay_top5"] - F["mean"]["pay_top5"] <= .08),
        ("market", "team win SD, H - F", H["mean"]["win_sd"] - F["mean"]["win_sd"], "<= .025", H["mean"]["win_sd"] - F["mean"]["win_sd"] <= .025),
        ("career", "distance of 12-season careers to NBA, H", d["H"], f"< A ({d['A']:.3f}) and <= 1.05 F ({d['F']:.3f})", d["H"] < d["A"] and d["H"] <= 1.05 * d["F"]),
        ("career", "share with eight or more regular seasons, H - NBA", H["careers_all"]["eight_plus"] - nba["eight_plus"], "+-.10", abs(H["careers_all"]["eight_plus"] - nba["eight_plus"]) <= .10),
        ("career", "top-30 seasons per star, H / NBA", H["careers_all"]["star_top30_seasons"] / nba["star_top30_seasons"], ".70 - 1.45", .70 <= H["careers_all"]["star_top30_seasons"] / nba["star_top30_seasons"] <= 1.45),
        ("career", "mean retirement age of 5000+ minute careers", H["retire"], "33.5 - 38", 33.5 <= H["retire"] <= 38),
    ]
    return [dict(window=label, area=a, metric=x, value=v, rule=r, passed=bool(ok)) for a, x, v, r, ok in rows], d


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("cells", type=Path); p.add_argument("output", type=Path)
    a = p.parse_args()
    release = digest()
    old = checksum(ARCHIVE / "freeze_long.json")
    eco, nba = long.nba_panel(12)
    runs = {"2021": {}, "2024": {}}
    for cell in op.cells("succession"):
        folder = a.cells / f"r164-cell-{r16.key(cell)}"
        op.read_cell(folder, cell, release)
        runs[str(cell["start"])].setdefault(cell["arm"], []).append(long.league(next(folder.glob("full__*.json.gz")), 12))
    for cell in op.cells("long"):
        folder = ARCHIVE / "cells" / f"r164-cell-{r16.key(cell)}"
        op.read_cell(folder, cell, old)
        runs["2021"].setdefault(cell["arm"], []).append(long.league(next(folder.glob("full__*.json.gz")), 12))
    results, report = [], {}
    for label, arms in runs.items():
        merged = {arm: base.merge(v) for arm, v in arms.items()}
        target = nba_generated_share(int(label) + 17)
        rows, d = gates(merged, nba, eco, target, label, int(label))
        results += rows
        report[label] = dict(merged=merged, distance=d, nba_generated=target)
    a.output.mkdir()
    verdict = "REVIEW" if all(g["passed"] for g in results) else "HOLD"
    (a.output / "receipt.json").write_text(json.dumps(dict(release=release, verdict=verdict, gates=results, nba_careers=nba, nba_ecology=eco, report=report), indent=1) + "\n")
    for g in results:
        print("pass" if g["passed"] else "FAIL", g["window"], f"{g['value']:+.3f}", g["rule"], "|", g["area"], g["metric"])
    print(verdict)


if __name__ == "__main__":
    main()
