"""Compare paired open leagues on careers, opportunity, market, style and box scores against the same NBA seasons.

Usage: 147_r164_open_review.py START SEED YEARS LABEL=ARCHIVE [...] [--output FILE]. Every league must share the opening
fingerprint. All rates use the fixed real denominator (missing, injured and unsigned players count as zero minutes).
"""
import argparse
import gzip
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median, stdev

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "cloud"))
import r16_acceptance as r16  # noqa: E402

ref = r16.ref


def league_rows(run, index, year):
    rows = [p["by_year"][year] for p in index.values() if year in p["by_year"]]
    total = {k: sum(r[k] for r in rows) for k in ("min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "ast", "orb", "drb", "tov", "stl", "blk")}
    return total


def rates(b):
    return dict(ts=b["pts"] / (2 * (b["fga"] + .44 * b["fta"])), tpar=b["tpa"] / b["fga"], ftr=b["fta"] / b["fga"],
                p2=(b["fg"] - b["tp"]) / (b["fga"] - b["tpa"]), p3=b["tp"] / b["tpa"], ast36=36 * b["ast"] / b["min"],
                blk36=36 * b["blk"] / b["min"], tov36=36 * b["tov"] / b["min"])


def rows_of(index, sid, year):
    return index.get(sid, {}).get("by_year", {}).get(year, ref.EMPTY)


def young(index, nba, bios, year, games):
    out = {}
    for exp in (1, 2, 3):
        for label, low, high in (("lottery", 1, 14), ("late first", 15, 30), ("second", 31, 60)):
            ids = [s for s, b in bios.items() if b.get("draftYear") == year - exp and b.get("draftRound") in (1, 2)
                   and low <= 30 * (b["draftRound"] - 1) + b["draftPick"] <= high]
            if ids:
                out[exp, label] = (ids, [rows_of(index, s, year)["min"] * 82 / games for s in ids])
    return out


def style(indexes, nba, start, years):
    rows = []
    for year in range(start + 1, start + years):
        for arm, ix in indexes.items():
            prior, current = nba[year - 1], nba[year]
            ids = [s for s in prior.keys() & current.keys() if all(b[s]["min"] >= 500 and b[s]["fga"] >= 150 for b in (prior, current))
                   and all(rows_of(i, s, y)["fga"] >= 75 and rows_of(i, s, y)["min"] >= 300 for i in indexes.values() for y in (year - 1, year))]
            truth = [ref.rates(current[s])["tpar"] - ref.rates(prior[s])["tpar"] for s in ids]
            change = [ref.rates(rows_of(ix, s, year))["tpar"] - ref.rates(rows_of(ix, s, year - 1))["tpar"] for s in ids]
            level = [abs(ref.rates(rows_of(ix, s, year))["tpar"] - ref.rates(current[s])["tpar"]) for s in ids]
            spec = [s for s in ids if ref.rates(prior[s])["tpar"] >= .60]
            non = [s for s in ids if ref.rates(prior[s])["tpar"] <= .08]
            rows.append(dict(year=year, arm=arm, n=len(ids), sd_ratio=stdev(change) / stdev(truth), corr=r16.corr(change, truth),
                change_mae=mean(abs(a - b) for a, b in zip(change, truth)), level_mae=mean(level),
                spec_mean=mean(ref.rates(rows_of(ix, s, year))["tpar"] for s in spec) if spec else None,
                spec_nba=mean(ref.rates(current[s])["tpar"] for s in spec) if spec else None,
                spill=mean(ref.rates(rows_of(ix, s, year))["tpar"] >= .25 for s in non) if non else None, non_n=len(non),
                p2_mae=mean(abs(ref.rates(rows_of(ix, s, year))["p2"] - ref.rates(current[s])["p2"]) for s in ids
                            if ref.rates(rows_of(ix, s, year))["p2"] is not None),
                usage_mae=mean(abs(ref.rates(rows_of(ix, s, year))["plays36"] - ref.rates(current[s])["plays36"]) for s in ids)))
    return rows


def persistence(boxes, start, years):
    """Year-to-year correlation of own efficiency among regulars: above NBA means outcomes feed back into skill."""
    pairs = defaultdict(list)
    for y in range(start + 1, start + years):
        for sid in boxes[y - 1].keys() & boxes[y].keys():
            a, b = boxes[y - 1][sid], boxes[y][sid]
            if min(a["min"], b["min"]) >= 1000 and min(a["fga"] - a["tpa"], b["fga"] - b["tpa"]) >= 200:
                ra, rb = ref.rates(a), ref.rates(b)
                for k in ("p2", "ts", "plays36"):
                    pairs[k].append((ra[k], rb[k]))
    out = {"n": len(pairs["p2"])}
    for k, v in pairs.items():
        out[k] = r16.corr(*zip(*v))
        out[k + "_sd"] = stdev(x for x, _ in v)
    return out


def three_skill(r):
    """Product three-point choice of these ratings, as a logit."""
    v = (.1 * r["oiq"] + r["tp"]) / 110
    v = .55 + (v - .55) * (.3 / .45) if v > .55 else v
    v = v * (.1 / .35) if v < .35 else .1 + (v - .35) * 3.5 if v < .45 else v
    return logit(.67 * v)


def logit(p):
    p = min(.97, max(.01, p))
    return math.log(p / (1 - p))


def transfer(boxes, ratings, start, years):
    """Does a yearly ability change reach the floor (slope), and how long does a three-point identity last (lag correlation)?"""
    lag = min(3, years - 1)
    pairs, keep, ast = [], [], []
    regular = lambda b: b and b["min"] >= 1000 and b["fga"] >= 200
    for y in range(start, start + years):
        for sid, a in boxes[y].items():
            if not regular(a):
                continue
            b = boxes.get(y + 1, {}).get(sid)
            if regular(b) and ratings and sid in ratings.get(y, {}) and sid in ratings.get(y + 1, {}):
                r, t = ratings[y][sid], ratings[y + 1][sid]
                pairs.append((three_skill(t) - three_skill(r), logit(b["tpa"] / b["fga"]) - logit(a["tpa"] / a["fga"])))
                ast.append((t["pss"] - r["pss"], 36 * (b["ast"] / b["min"] - a["ast"] / a["min"])))
            c = boxes.get(y + lag, {}).get(sid)
            if regular(c):
                keep.append((a["tpa"] / a["fga"], c["tpa"] / c["fga"]))

    def slope(v):
        mx, my = mean(x for x, _ in v), mean(y for _, y in v)
        return sum((x - mx) * (y - my) for x, y in v) / sum((x - mx) ** 2 for x, _ in v)
    return dict(lag=lag, n=len(pairs), three_slope=slope(pairs) if len(pairs) > 40 else None, ast_slope=slope(ast) if len(ast) > 40 else None,
                three_lag=r16.corr(*zip(*keep)) if len(keep) > 40 else None)


def idle(run, index, start, years):
    """Healthy, proven, good players who open a season without a club, and what became of them."""
    out = []
    for k, snap in enumerate(run["snapshots"][:-1]):
        year = start + k + 1
        market = {row[0]: row[1:] for row in snap["market"]}
        for sid, p in index.items():
            now = market.get(p["pid"])
            before = p["by_year"].get(year - 1, ref.EMPTY)
            ovr = p["rating"].get(year, {}).get("ovr", 0)
            if not now or now[0] != -1 or before["min"] < 1000 or ovr < 58:
                continue
            played = [p["by_year"].get(y, ref.EMPTY)["min"] for y in range(year, start + years)]
            out.append(dict(year=year, sid=sid, age=year - p["born"], ovr=ovr, injury=now[3], minutes=[round(m) for m in played],
                            retired=p["retiredYear"]))
    return out


def careers(run, index, start, years):
    last = start + years - 1
    rows = defaultdict(list)
    for sid, p in index.items():
        for y in range(start + 1, last + 1):
            before = p["by_year"].get(y - 1, ref.EMPTY)
            if before["min"] < 1000:
                continue
            age = y - p["born"]
            band = "<=25" if age <= 25 else "26-30" if age <= 30 else "31-34" if age <= 34 else "35+"
            now = p["by_year"].get(y, ref.EMPTY)["min"]
            rows[band].append((now >= 500, now == 0, p["retiredYear"] is not None and p["retiredYear"] <= y))
    return {b: dict(n=len(r), keep500=mean(x[0] for x in r), zero=mean(x[1] for x in r), retired=mean(x[2] for x in r)) for b, r in rows.items()}


def nba_careers(nba, bios, start, years):
    rows = defaultdict(list)
    for y in range(start + 1, start + years):
        for sid, b in nba[y - 1].items():
            if b["min"] < 1000 or sid not in bios:
                continue
            age = y - bios[sid]["bornYear"]
            band = "<=25" if age <= 25 else "26-30" if age <= 30 else "31-34" if age <= 34 else "35+"
            now = nba[y].get(sid, ref.EMPTY)["min"]
            rows[band].append((now >= 500, now == 0))
    return {b: dict(n=len(r), keep500=mean(x[0] for x in r), zero=mean(x[1] for x in r)) for b, r in rows.items()}


def money(run, start):
    out = []
    for k, snap in enumerate(run["snapshots"]):
        y = start + k + 1
        pay = Counter()
        for _, tid, amount, exp, _ in snap["market"]:
            if tid >= 0 and exp >= y:
                pay[tid] += amount
        values = sorted((v / snap["cap"] for v in pay.values()), reverse=True)
        wins = [w / (w + l + t) for _, w, l, t, *_ in snap["teamRecords"] if w + l + t]
        out.append(dict(season=y, mean=mean(values), top5=mean(values[:5]), peak=values[0], low5=mean(values[-5:]), win_sd=stdev(wins)))
    return out


def review(start, seed, years, files):
    nba, bios, ratings = r16.source_data()
    runs = {}
    for label, path in files.items():
        with gzip.open(path, "rt") as f:
            runs[label] = json.load(f)
        r16.require(runs[label]["seed"] == seed and runs[label]["start"] == start and runs[label]["years"] >= years, f"{label}: other league")
    first = next(iter(runs.values()))["opening"]
    r16.require(all(r["opening"] == first for r in runs.values()), "Different opening fingerprints")
    for r in runs.values():
        r["snapshots"] = r["snapshots"][:years]
    ix = {a: r16.player_index(r) for a, r in runs.items()}
    out = dict(start=start, seed=seed, years=years, arms=list(runs), league=[], young=[], style=style(ix, nba, start, years), idle={}, careers={}, money={},
               generated={})
    for y in range(start, start + years):
        truth = {k: sum(b[k] for b in nba[y].values()) for k in ("min", "pts", "fg", "fga", "tp", "tpa", "ft", "fta", "ast", "blk", "tov")}
        out["league"].append(dict(year=y, arm="NBA", **rates(truth)))
        for a in runs:
            out["league"].append(dict(year=y, arm=a, **rates(league_rows(runs[a], ix[a], y))))
            rec = runs[a]["snapshots"][y - start]["teamRecords"]
            games = mean(sum(r[1:4]) for r in rec if sum(r[1:4]))
            for (exp, label), (ids, mins) in young(ix[a], nba, bios, y, games).items():
                actual = [nba[y].get(s, ref.EMPTY)["min"] for s in ids]
                out["young"].append(dict(year=y, arm=a, exp=exp, pick=label, n=len(ids), p500=mean(m >= 500 for m in mins),
                    nba500=mean(m >= 500 for m in actual), mean=mean(mins), nba_mean=mean(actual)))
    for a in runs:
        out["idle"][a] = idle(runs[a], ix[a], start, years)
        out["careers"][a] = careers(runs[a], ix[a], start, years)
        out["money"][a] = money(runs[a], start)
        last = start + years - 1
        rows = [(sid, p) for sid, p in ix[a].items() if sid.startswith("generated_") and last in p["by_year"]]
        total = sum(p["by_year"][last]["min"] for p in ix[a].values() if last in p["by_year"])
        out["generated"][a] = dict(players=len(rows), minutes=sum(p["by_year"][last]["min"] for _, p in rows) / total)
    out["persistence"] = {a: persistence({y: {s: p["by_year"][y] for s, p in ix[a].items() if y in p["by_year"]} for y in range(start, start + years)},
                                         start, years) for a in runs}
    out["persistence"]["NBA"] = persistence(nba, start, years)
    real = defaultdict(dict)
    for (y, sid), r in ratings.items():
        real[y][sid] = r
    out["transfer"] = {a: transfer({y: {s: p["by_year"][y] for s, p in ix[a].items() if y in p["by_year"]} for y in range(start, start + years)},
                                   {y: {s: p["rating"][y] for s, p in ix[a].items() if y in p["rating"]} for y in range(start, start + years)}, start, years) for a in runs}
    out["transfer"]["NBA"] = transfer({y: nba[y] for y in range(start, start + years)}, real, start, years)
    out["careers"]["NBA"] = nba_careers(nba, bios, start, years)
    return out


def show(out):
    arms = out["arms"]
    f = lambda v, n=3: "    -" if v is None else f"{v:.{n}f}"
    print("\nLEAGUE  ts / tpar / ftr / p2 / p3 / ast36 / blk36")
    for r in out["league"]:
        print(r["year"], f"{r['arm']:8s}", *(f(r[k]) for k in ("ts", "tpar", "ftr", "p2", "p3", "ast36", "blk36")))
    print("\nYOUNG (seasons after the opening): share reaching 500 minutes per 82 games / mean minutes")
    for exp in (1, 2, 3):
        for pick in ("lottery", "late first", "second"):
            sel = [r for r in out["young"] if r["exp"] == exp and r["pick"] == pick and r["year"] > out["start"]]
            if not sel:
                continue
            w = lambda a, k: sum(r[k] * r["n"] for r in sel if r["arm"] == a) / sum(r["n"] for r in sel if r["arm"] == a)
            print(exp, f"{pick:10s}", "n", sum(r["n"] for r in sel if r["arm"] == arms[0]), "NBA", f(w(arms[0], "nba500"), 2), f(w(arms[0], "nba_mean"), 0),
                  *(f"| {a} {f(w(a, 'p500'), 2)} {f(w(a, 'mean'), 0)}" for a in arms))
    print("\nSTYLE (median over seasons)")
    for a in arms:
        s = [r for r in out["style"] if r["arm"] == a]
        if not s:
            continue
        m = lambda k: median(r[k] for r in s if r[k] is not None) if any(r[k] is not None for r in s) else None
        print(f"{a:8s}", "n", m("n"), *(f"{k} {f(m(k))}" for k in ("sd_ratio", "corr", "change_mae", "level_mae", "spec_mean", "spec_nba", "spill", "p2_mae", "usage_mae")))
    print("\nPERSISTENCE of own 2P%, TS, plays/36 (year to year), and spread")
    for a, r in out["persistence"].items():
        print(f"{a:8s}", r["n"], *(f"{k} {f(r[k])} sd {f(r[k + '_sd'])}" for k in ("p2", "ts", "plays36")))
    print("\nTRANSFER three-point skill -> share slope, passing -> assists slope, 3PAr identity correlation")
    for a, r in out["transfer"].items():
        print(f"{a:8s}", r["n"], f(r["three_slope"]), f(r["ast_slope"]), f"lag{r['lag']}", f(r["three_lag"]))
    print("\nCAREERS after a 1000-minute season: keep 500+ / zero minutes / retired")
    for band in ("<=25", "26-30", "31-34", "35+"):
        print(f"{band:6s}", *(f"| {a} {f(out['careers'][a][band]['keep500'], 2)} {f(out['careers'][a][band]['zero'], 2)}" for a in arms + ["NBA"] if band in out["careers"][a]))
    print("\nIDLE proven players (OVR 58+, 1000 minutes the year before, no club at opening; healthy = injury 0)")
    for a in arms:
        rows = [r for r in out["idle"][a] if r["injury"] == 0]
        print(f"{a:8s} healthy {len(rows)}, 62+ {sum(r['ovr'] >= 62 for r in rows)}, whole season unused {sum(r['minutes'][0] == 0 for r in rows)};",
              "; ".join(f"{r['sid']} {r['year']} age {r['age']} ovr {r['ovr']} min {r['minutes'][0]}" for r in sorted(rows, key=lambda r: -r["ovr"])[:6]))
    print("\nMONEY payroll / cap: mean, top5, peak, low5, win SD")
    for a in arms:
        for r in out["money"][a][1:]:
            print(f"{a:8s}", r["season"], *(f(r[k]) for k in ("mean", "top5", "peak", "low5", "win_sd")))
    print("\nGENERATED", out["generated"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("start", "seed", "years"):
        parser.add_argument(key, type=int)
    parser.add_argument("leagues", nargs="+")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = review(args.start, args.seed, args.years, dict(x.split("=", 1) for x in args.leagues))
    show(result)
    if args.output:
        args.output.write_text(json.dumps(result, indent=1) + "\n")
