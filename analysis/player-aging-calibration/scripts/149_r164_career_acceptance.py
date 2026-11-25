"""Product acceptance on careers, replacing script 146 for decisions.

146 compared BBGM ratings of players seen in both years. That drops everyone who left the league, uses windows that only
six-year survivors can enter (late bloomers, prime length), and reads real BBGM ratings as truth although they carry about
3 points of seasonal measurement error and changed construction between eras. Here every league, NBA included, is measured
with the SAME box production formula and league-relative rank. Cohorts are fixed before the outcome, absent players stay
in the denominator, and age/status windows have equal length for everyone.

Production per 36 = points above shot cost + rebounds, assists, steals, blocks, minus turnovers (as in script 140).
Season value = (production per 36 - bench level) x minutes / 36; ranks are within the season. It undervalues defence.
"""
import argparse
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path
from statistics import mean, pstdev

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE / "cloud"))
import r16_acceptance as r16  # noqa: E402

ref = r16.ref
BANDS = [("19-22", 19, 22), ("23-25", 23, 25), ("26-29", 26, 29), ("30-32", 30, 32), ("33+", 33, 50)]


def net36(b):
    return 36 * (b["pts"] - b["fga"] - .44 * b["fta"] + .7 * b["orb"] + .3 * b["drb"] + .7 * b["ast"] + b["stl"] + .7 * b["blk"] - b["tov"]) / b["min"]


def season_table(boxes):
    """Rank by season value; everyone else is absent."""
    rows = {s: b for s, b in boxes.items() if b["min"] >= 100}
    bench = [(net36(b), b["min"]) for b in rows.values() if 250 <= b["min"] <= 900]
    level = sum(v * m for v, m in bench) / sum(m for _, m in bench)
    value = {s: (net36(b) - level) * b["min"] / 36 for s, b in rows.items()}
    order = sorted(value, key=lambda s: -value[s])
    return {s: dict(rank=i + 1, value=value[s], net=net36(rows[s]), min=rows[s]["min"], box=rows[s]) for i, s in enumerate(order)}


def nba_world(first, last):
    nba, bios, _ = r16.source_data()
    return {y: season_table(nba[y]) for y in range(first, last + 1)}, {s: b["bornYear"] for s, b in bios.items() if b.get("bornYear")}


def sim_world(path, history, born):
    """Real seasons before the opening come from NBA, so opening cohorts are identical in every arm."""
    with gzip.open(path, "rt") as f:
        run = json.load(f)
    ix = r16.player_index(run)
    last = run["start"] + run["years"] - 1
    world = {y: t for y, t in history.items() if y < run["start"]}
    for y in range(run["start"], last + 1):
        world[y] = season_table({s: p["by_year"][y] for s, p in ix.items() if y in p["by_year"]})
    ages = dict(born)
    ages.update({s: p["born"] for s, p in ix.items()})
    return world, ages, run


def cohort_rows(world, born, start, last):
    """Fixed opening cohorts (real season start-1), same people in every arm and NBA."""
    t0 = start - 1
    base = world[t0]
    groups = defaultdict(list)
    for s, r in base.items():
        if s not in born:
            continue
        age = t0 - born[s]
        band = next((l for l, a, b in BANDS if a <= age <= b), None)
        if not band:
            continue
        if r["rank"] <= 30:
            groups["top30 all"].append(s)
            groups[f"top30 {'<=25' if age <= 25 else '26-29' if age <= 29 else '30+'}"].append(s)
        elif r["rank"] <= 120:
            groups[f"rank31-120 {band}"].append(s)
        elif r["min"] >= 500:
            groups[f"bench {band}"].append(s)
    out = {}
    for g, ids in groups.items():
        if len(ids) < 8:
            continue
        row = dict(n=len(ids))
        for h in (1, 3, 5):
            if t0 + h > last:
                continue
            later = [world[t0 + h].get(s) for s in ids]
            row[f"min h{h}"] = mean(r["min"] if r else 0 for r in later)
            row[f"500 h{h}"] = mean(bool(r and r["min"] >= 500) for r in later)
            row[f"top30 h{h}"] = mean(bool(r and r["rank"] <= 30) for r in later)
            row[f"top120 h{h}"] = mean(bool(r and r["rank"] <= 120) for r in later)
            row[f"value h{h}"] = mean(r["value"] if r else 0 for r in later)
        out[g] = row
    return out


def tier(r):
    return "out" if not r or r["min"] < 250 else "top15" if r["rank"] <= 15 else "top60" if r["rank"] <= 60 else "top150" if r["rank"] <= 150 else "rest"


def transitions(world, born, start, last, horizon=3):
    """Every base season inside the league, full denominator, by age. 'out' includes unsigned, injured and retired."""
    rows = defaultdict(list)
    for y in range(start, last - horizon + 1):
        for s, r in world[y].items():
            if s in born and r["min"] >= 500:
                age = y - born[s]
                later = world[y + horizon].get(s)
                band = next((l for l, a, b in BANDS if a <= age <= b), None)
                if band:
                    rows[band].append((r, later, tier(r), tier(later)))
    out = {}
    for band, v in rows.items():
        stay = [x for x in v if x[2] in ("top15", "top60")]
        mid = [x for x in v if x[2] in ("top150", "rest")]
        bench = [x for x in v if x[2] == "rest"]
        out[band] = dict(n=len(v), stars=len(stay),
            star_still_top60=mean(x[3] in ("top15", "top60") for x in stay) if len(stay) >= 10 else None,
            star_out=mean(x[3] == "out" for x in stay) if len(stay) >= 10 else None,
            rise_to_top60=mean(x[3] in ("top15", "top60") for x in mid) if len(mid) >= 20 else None,
            bench_to_top150=mean(x[3] in ("top15", "top60", "top150") for x in bench) if len(bench) >= 20 else None,
            halved=mean((x[1]["value"] if x[1] else 0) < .5 * x[0]["value"] for x in v if x[0]["rank"] <= 150) if sum(x[0]["rank"] <= 150 for x in v) >= 20 else None,
            out=mean(x[3] == "out" for x in v),
            net_change=mean(x[1]["net"] - x[0]["net"] for x in v if x[1] and x[1]["min"] >= 500))
    return out


def bloom(world, born, start, last):
    """Late bloomers and stalls with one equal window: players aged 22-24 in the base season, judged four seasons later."""
    late, stall, early, n = 0, 0, 0, 0
    for y in range(start, last - 3):
        for s, r in world[y].items():
            if s not in born or not 22 <= y - born[s] <= 24 or r["min"] < 500:
                continue
            n += 1
            four = [world[y + h].get(s) for h in (3, 4) if y + h <= last]
            best = max((x["value"] if x else 0) for x in four)
            late += r["rank"] > 120 and best >= sorted((v["value"] for v in world[y + 3].values()), reverse=True)[99]
            stall += best <= r["value"]
            early += r["rank"] <= 60
    return dict(n=n, unranked_to_top100=late / n, no_better_after_3_4=stall / n, already_top60=early / n) if n >= 30 else {}


STYLE = ("tpar", "ast36", "orb36", "drb36", "stl36", "blk36", "plays36", "ftr")


def style_stats(b):
    r = ref.rates(b)
    return dict(tpar=r["tpar"], ast36=r["ast36"], orb36=36 * b["orb"] / b["min"], drb36=r["drb36"], stl36=r["stl36"], blk36=r["blk36"],
                plays36=r["plays36"], ftr=b["fta"] / b["fga"])


def independence(world, born, start, last):
    """Do a player's abilities move separately on the floor? Yearly changes of eight box skills, scaled by league spread."""
    change = defaultdict(list)
    lag3 = defaultdict(list)
    seq = []
    for y in range(start, last):
        sds = None
        regs = {s: style_stats(r["box"]) for s, r in world[y].items() if r["min"] >= 1000 and r["box"]["fga"] >= 200}
        sds = {k: pstdev(v[k] for v in regs.values()) for k in STYLE}
        for s, a in regs.items():
            b = world[y + 1].get(s)
            if b and b["min"] >= 1000 and b["box"]["fga"] >= 200 and s in born:
                q = style_stats(b["box"])
                for k in STYLE:
                    change[k].append((q[k] - a[k]) / sds[k])
                c = world.get(y + 2, {}).get(s)
                if c and c["min"] >= 1000:
                    seq.append((b["net"] - world[y][s]["net"], c["net"] - b["net"]))
            d = world.get(y + 3, {}).get(s)
            if d and d["min"] >= 1000 and d["box"]["fga"] >= 200:
                q = style_stats(d["box"])
                for k in STYLE:
                    lag3[k].append((a[k], q[k]))
    cs = [abs(r16.corr(change[a], change[b])) for i, a in enumerate(STYLE) for b in STYLE[i + 1:]]
    return dict(n=len(change["tpar"]), mean_abs_corr=mean(cs), change_sd=mean(pstdev(change[k]) for k in STYLE),
                net_momentum=r16.corr(*zip(*seq)) if len(seq) > 30 else None, **{f"lag3 {k}": r16.corr(*zip(*v)) for k, v in lag3.items() if len(v) > 40})


def volatility(world, born, start, last):
    """Year-to-year spread of production per 36 among regulars in both seasons, by age, with the same box noise everywhere."""
    out = {}
    for label, lo, hi in BANDS:
        d = [world[y + 1][s]["net"] - r["net"] for y in range(start, last) for s, r in world[y].items()
             if s in born and lo <= y - born[s] <= hi and r["min"] >= 1000 and s in world[y + 1] and world[y + 1][s]["min"] >= 1000]
        if len(d) >= 25:
            out[label] = dict(n=len(d), mean=mean(d), sd=pstdev(d), up3=mean(x >= 3 for x in d), down3=mean(x <= -3 for x in d))
    return out


def evaluate(world, born, start, last):
    return dict(cohorts=cohort_rows(world, born, start, last), transitions=transitions(world, born, start, last), bloom=bloom(world, born, start, last),
                independence=independence(world, born, start, last), volatility=volatility(world, born, start, last))


def average(items):
    """Mean over seeds of nested numbers; a key must exist in every seed."""
    if isinstance(items[0], dict):
        return {k: average([i[k] for i in items]) for k in items[0] if all(k in i for i in items)}
    values = [i for i in items if i is not None]
    return mean(values) if values else None


def table(result, section, keys):
    names = list(result)
    groups = [g for g in result[names[0]][section] if all(g in result[n][section] for n in names)]
    for g in groups:
        for k in keys:
            vals = [result[n][section][g].get(k) for n in names]
            if vals[0] is None:
                continue
            print(f"{g:16s} {k:18s} n={result[names[0]][section][g].get('n', 0):<5.0f}" + "".join(f"{'' if v is None else format(v, '9.3f'):>9s}" for v in vals))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("start", type=int)
    p.add_argument("last", type=int)
    p.add_argument("leagues", nargs="+", help="label=archive, repeat a label to average seeds")
    p.add_argument("--output", type=Path)
    a = p.parse_args()
    history, born = nba_world(a.start - 2, a.last)
    result = {"NBA": evaluate(history, born, a.start, a.last)}
    groups = defaultdict(list)
    for item in a.leagues:
        label, path = item.split("=", 1)
        world, ages, run = sim_world(path, history, born)
        if run["start"] != a.start or run["start"] + run["years"] - 1 < a.last:
            raise SystemExit(f"{path}: league does not cover {a.start}-{a.last}")
        groups[label].append(evaluate(world, ages, a.start, a.last))
    for label, items in groups.items():
        result[label] = average(items)
    print(" " * 43, *(f"{n:>8s}" for n in result))
    print("FIXED OPENING COHORTS"); table(result, "cohorts", ("min h1", "min h3", "min h5", "500 h3", "500 h5", "top30 h3", "top30 h5", "top120 h3", "top120 h5"))
    print("THREE-YEAR TRANSITIONS"); table(result, "transitions", ("star_still_top60", "star_out", "rise_to_top60", "bench_to_top150", "halved", "out", "net_change"))
    print("VOLATILITY"); table(result, "volatility", ("mean", "sd", "up3", "down3"))
    for section in ("bloom", "independence"):
        print(section.upper())
        for k in result["NBA"][section]:
            print(f"{k:38s}" + "".join(f"{'' if r[section].get(k) is None else format(r[section][k], '9.3f'):>9s}" for r in result.values()))
    if a.output:
        a.output.write_text(json.dumps(result, indent=1) + "\n")
