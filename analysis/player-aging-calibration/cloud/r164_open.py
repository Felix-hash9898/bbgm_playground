"""Plan, audit and score the frozen R16.4 short open-league experiment (A Playground, B V9, C R16, F R16.4)."""
import argparse
import gzip
import json
import sys
from importlib import import_module
from pathlib import Path
from statistics import mean, median

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE / "scripts"))
import r16_acceptance as r16  # noqa: E402
from r164_open_freeze import checksum, digest  # noqa: E402

review = import_module("147_r164_open_review")
MATRIX = r16.read_json(HERE / "cloud/r164_open_matrix.json")
ARMS = {"A": ("playground", None), "B": ("v9s_l4", None), "C": ("v9s_l4", "r16_midrange"), "F": ("v9s_l4", "r16_midrange"),
        "G": ("v9s_l4g", "r16_midrange")}
CANDIDATES = ("F", "G")


def cells(stage):
    return MATRIX[stage]["cells"]


def lines(path):
    return [json.loads(x) for x in path.read_text().splitlines()] if path.exists() else []


def read_cell(folder, cell, release):
    meta = r16.read_json(folder / "cell.json")
    arm, start, years = cell["arm"], cell["start"], cell["years"]
    r16.require(all(meta[k] == v for k, v in cell.items()) and meta["freeze"] == release and not meta["day"] and
                bool(meta["components"]) == (arm in CANDIDATES), f"{folder}: mismatched runner receipt")
    archive, = folder.glob("full__*.json.gz")
    with gzip.open(archive, "rt") as f:
        run = json.load(f)
    r16.require((run["arm"], run["gs"]) == ARMS[arm] and run["years"] == years and run["seed"] == cell["seed"], f"{folder}: wrong league")
    seasons = list(range(start, start + years))
    r16.audit_hooks(run, seasons)
    for field in ("snapshots", "timings"):
        r16.require([row["season"] for row in run[field]] == [y + 1 for y in seasons], f"{folder}: incomplete {field}")
    r16.require(all(t["gcExposed"] and 0 < t["heapMB"] < 5500 and t["rearms"] <= 2 for t in run["timings"]), f"{folder}: GC or Auto Play integrity")
    bad = {"timeout", "giveUp", "researchHookError", "autoPlayError", "unhandledRejection"}
    beats = lines(folder / "heartbeat.jsonl")
    r16.require(beats and not any(b["event"] in bad for b in beats), f"{folder}: bad heartbeat")
    components = lines(folder / "components.jsonl")
    if arm in CANDIDATES:
        r16.require([c["season"] for c in components] == seasons, f"{folder}: components inactive")
        # Information boundary: identity is learned at the opening only and nobody who arrives later carries one.
        r16.require(all(c["finish"]["late"] == 0 and c["finish"]["installed"] > 0 for c in components), f"{folder}: finishing boundary")
        marks = [c["finish"]["installed"] for c in components]
        r16.require(all(b <= a for a, b in zip(marks, marks[1:])), f"{folder}: finishing identity grew after the opening")
        r16.require(components[0]["style"]["adjusted"] == 0 and
                    all((c["style"]["adjusted"] > 0) == (c["factor"] >= .8) for c in components[1:]), f"{folder}: style response")
    else:
        r16.require(all("finish" not in c and "style" not in c for c in components), f"{folder}: component leak")
    for row in lines(folder / "market.jsonl"):
        r16.require(arm in CANDIDATES, f"{folder}: market trial in control")
        if row["event"] == "lateSign":
            r16.require(row["postPayroll"] == row["after"] and row["daysLeft"] <= 8 and row["injury"] == 0 and
                        row["exception"] in ("bird", "capSpace"), f"{folder}: illegal late signing {row['sid']}")
    for row in lines(folder / "rotation.jsonl"):
        r16.require(row["teamGames"] > 0 and (arm in CANDIDATES) == bool(row["rows"]), f"{folder}: rotation activity")
    return run


def summary(out, arm):
    """One number per question, for one league."""
    after = [r for r in out["young"] if r["arm"] == arm and r["year"] > out["start"]]
    share = lambda sel, k: sum(r[k] * r["n"] for r in sel) / sum(r["n"] for r in sel)
    first = [r for r in after if r["exp"] == 1 and r["pick"] != "second"]
    rookies = [r for r in after if r["exp"] == 1]
    style = [r for r in out["style"] if r["arm"] == arm]
    mid = lambda k: median(r[k] for r in style if r[k] is not None) if any(r[k] is not None for r in style) else None
    league = {r["year"]: r for r in out["league"] if r["arm"] == arm}
    nba = {r["year"]: r for r in out["league"] if r["arm"] == "NBA"}
    err = {k: mean(abs(league[y][k] - nba[y][k]) for y in league) for k in ("ts", "p2", "ftr", "tpar")}
    idle = [r for r in out["idle"][arm] if r["injury"] == 0 and r["ovr"] >= 62 and r["minutes"][0] == 0]
    money = out["money"][arm][1:]
    careers = out["careers"][arm]
    return dict(first500=share(first, "p500"), first500_nba=share(first, "nba500"), rookie500=share(rookies, "p500"),
                rookie500_nba=share(rookies, "nba500"), idle62=len(idle), idle_names=[(r["sid"], r["year"]) for r in idle],
                top5=mean(m["top5"] for m in money), peak=max(m["peak"] for m in money), mean_pay=mean(m["mean"] for m in money),
                win_sd=mean(m["win_sd"] for m in money), keep_3134=careers.get("31-34", {}).get("keep500"), keep_35=careers.get("35+", {}).get("keep500"),
                keep_2630=careers.get("26-30", {}).get("keep500"), p2_persist=out["persistence"][arm]["p2"], p2_persist_nba=out["persistence"]["NBA"]["p2"],
                three_slope=out["transfer"][arm]["three_slope"], three_lag=out["transfer"][arm]["three_lag"], three_lag_nba=out["transfer"]["NBA"]["three_lag"],
                p2_sd=out["persistence"][arm]["p2_sd"], p2_sd_nba=out["persistence"]["NBA"]["p2_sd"],
                **{k: mid(k) for k in ("sd_ratio", "change_mae", "level_mae", "spec_mean", "spill", "p2_mae", "usage_mae")},
                **{f"league_{k}": v for k, v in err.items()})


# name, text, value(F, C), bound, direction. Fixed before any cloud result; medians over paired leagues.
def gates(rows):
    d = lambda k: [f[k] - c[k] for f, c in rows if f[k] is not None and c[k] is not None]
    seasons = sum(f["seasons"] for f, _ in rows)
    modern = [(f, c) for f, c in rows if f["start"] >= 2015]
    md = lambda k: [f[k] - c[k] for f, c in modern if f[k] is not None and c[k] is not None]
    yield "career", "first-round rookies reaching 500 minutes, F-C", median(md("first500")), .07, "min"
    yield "career", "first-round rookies reaching 500 minutes, F over NBA", median(f["first500"] - f["first500_nba"] for f, _ in modern), .05, "max"
    yield "career", "healthy proven 62+ unused all season per 10 league seasons, F", 10 * sum(f["idle62"] for f, _ in rows) / seasons, 1.0, "max"
    yield "career", "healthy proven 62+ unused all season, F-C total", sum(d("idle62")), 0, "max"
    for k, text in (("keep_2630", "26-30"), ("keep_3134", "31-34"), ("keep_35", "35+")):
        yield "career", f"rotation players aged {text} keeping 500 minutes, F-C", median(d(k)), -.05, "min"
    yield "identity", "own 2P% persistence F over C (self-feedback)", median(d("p2_persist")), .06, "max"
    yield "identity", "own 2P% spread F / NBA", median(f["p2_sd"] / f["p2_sd_nba"] for f, _ in rows), 1.20, "max"
    yield "identity", "player 2P% MAE, F-C", median(d("p2_mae")), .002, "max"
    yield "identity", "three-share change SD / NBA, F-C", median(md("sd_ratio")), 0, "min"
    # Error against one real individual's future rises with ANY natural evolution, so it is only a guard here. The product
    # question is whether ability reaches the floor and whether identity fades at a real pace.
    yield "identity", "three skill -> three share slope, F", median(f["three_slope"] for f, _ in modern), .20, "min"
    yield "identity", "three-share identity correlation, F-C", median(md("three_lag")), -.005, "max"
    yield "identity", "three-share identity correlation, F over NBA (not below)", median(f["three_lag"] - f["three_lag_nba"] for f, _ in modern), -.03, "min"
    yield "identity", "three-share level MAE, F-C", median(d("level_mae")), .012, "max"
    yield "identity", "three-share change MAE, F-C", median(d("change_mae")), .006, "max"
    yield "identity", "specialist three share, F-C", median(md("spec_mean")), -.015, "min"
    yield "identity", "non-shooter spill, F-C", median(d("spill")), .05, "max"
    for k, bound in (("league_ts", .006), ("league_p2", .008), ("league_ftr", .010), ("usage_mae", .25)):
        yield "game", f"{k} error, F-C", median(d(k)), bound, "max"
    yield "ecology", "top-five payroll / cap, F-C", median(d("top5")), .06, "max"
    yield "ecology", "highest payroll / cap, F-C", median(d("peak")), .20, "max"
    yield "ecology", "team win SD, F-C", median(d("win_sd")), .025, "max"


def archived(cell):
    """Published R16 cell of the same opening, checked against its saved hash. None for a seed that has no archive."""
    root = HERE / f"results/r16_cloud/run_{MATRIX['reuse'][str(cell['start'])]}"
    folder = root / "cells" / f"r16-cell-{r16.key(cell)}"
    if not folder.exists():
        return None
    r16.read_run(folder, cell)
    path = next(folder.glob("full__*.json.gz"))
    r16.require(checksum(path) == r16.read_json(root / "sha256.json")[str(path.relative_to(root))], f"Archive mismatch: {path}")
    return path


def score(stage, artifacts, output):
    release = digest()
    wanted = cells(stage)
    r16.require({p.name for p in artifacts.iterdir() if p.is_dir()} == {f"r164-cell-{r16.key(c)}" for c in wanted}, "Missing or unexpected cells")
    leagues = {}
    for cell in wanted:
        folder = artifacts / f"r164-cell-{r16.key(cell)}"
        read_cell(folder, cell, release)
        leagues.setdefault((cell["start"], cell["seed"], cell["years"]), {})[cell["arm"]] = next(folder.glob("full__*.json.gz"))
    output.mkdir()
    pairs, table, extra = [], [], []
    for (start, seed, years), files in sorted(leagues.items()):
        for arm in "ABC":
            if arm not in files:
                path = archived(dict(arm=arm, start=start, seed=seed, years=years))
                if path:
                    files[arm] = path
        out = review.review(start, seed, years, {a: files[a] for a in "ABCFG" if a in files})
        (output / f"review_{start}_{seed}.json").write_text(json.dumps(out, indent=1) + "\n")
        s = {a: dict(summary(out, a), start=start, seed=seed, arm=a, seasons=years) for a in out["arms"]}
        table.extend(s.values())
        if "F" in s:
            pairs.append((s["F"], s["C"]))
        if "G" in s:
            extra.append((s["G"], s["C"]))
    results = [dict(area=a, metric=t, value=v, bound=b, rule=r, passed=v >= b if r == "min" else v <= b) for a, t, v, b, r in gates(pairs)]
    if extra:  # exploratory growth tilt: reported beside F, it cannot pass on these gates alone
        (output / "growth_tilt.json").write_text(json.dumps([dict(area=a, metric=t, value=v, bound=b, rule=r) for a, t, v, b, r in gates(extra)], indent=1) + "\n")
    r16.write_csv(output / "summary.csv", table)
    verdict = "REVIEW" if all(g["passed"] for g in results) else "HOLD"
    (output / "receipt.json").write_text(json.dumps(dict(stage=stage, release=release, verdict=verdict, long="HOLD", gates=results), indent=1) + "\n")
    for g in results:
        print("pass" if g["passed"] else "FAIL", f"{g['value']:+.3f} ({g['rule']} {g['bound']})", g["area"], g["metric"])
    print(verdict)
    return verdict == "REVIEW"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="action", required=True)
    m = subs.add_parser("matrix"); m.add_argument("stage", choices=("stage1", "stage2"))
    c = subs.add_parser("cell"); c.add_argument("folder", type=Path); c.add_argument("arm", choices=ARMS)
    for k in ("start", "seed", "years"):
        c.add_argument(k, type=int)
    s = subs.add_parser("score"); s.add_argument("stage", choices=("stage1", "stage2")); s.add_argument("artifacts", type=Path); s.add_argument("output", type=Path)
    a = parser.parse_args()
    if a.action == "matrix":
        print(json.dumps({"include": cells(a.stage)}))
    elif a.action == "cell":
        cell = {k: getattr(a, k) for k in ("arm", "start", "seed", "years")}
        r16.require(cell in cells("stage1") + cells("stage2"), "Cell outside the matrix")
        read_cell(a.folder, cell, digest())
        print("cell verified")
    elif not score(a.stage, a.artifacts, a.output):
        raise SystemExit(3)
