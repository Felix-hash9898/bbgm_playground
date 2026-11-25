"""Eighteen-season acceptance: whole careers, succession to generated players and league ecology, against the NBA.

Ecology: seasons from the third on, NBA reference = the same measure over 2010-26. Careers: real draft classes inside the
league (and generated ones) followed for a fixed number of seasons with absences counted, against NBA classes followed for
the same number of seasons. Production ranks use the box formula of script 149, the same for the NBA.
"""
import argparse
import gzip
import json
import sys
from collections import Counter, defaultdict
from importlib import import_module
from pathlib import Path
from statistics import mean, median, pstdev

sys.path.insert(0, str(Path(__file__).resolve().parent))
acc = import_module("149_r164_career_acceptance")
r16, ref = acc.r16, acc.ref


def season_row(table, ages, ratings=None, generated=None, exp=None):
    total = sum(r["min"] for r in table.values())
    share = lambda test: sum(r["min"] for s, r in table.items() if s in ages and test(ages[s])) / total
    top30 = [s for s, r in table.items() if r["rank"] <= 30]
    row = dict(players=len(table), regulars=sum(r["min"] >= 500 for r in table.values()), m2000=sum(r["min"] >= 2000 for r in table.values()),
               young22=share(lambda a: a <= 22), old33=share(lambda a: a >= 33), mean_age=sum(r["min"] * ages[s] for s, r in table.items() if s in ages) / total,
               top30_age=mean(ages[s] for s in top30 if s in ages), top30_value=mean(table[s]["value"] for s in top30))
    if ratings:
        o = sorted((r["ovr"] for r in ratings.values()), reverse=True)
        row.update(top300=mean(o[:300]), ovr60=sum(x >= 60 for x in o), ovr70=sum(x >= 70 for x in o), ovr75=sum(x >= 75 for x in o))
    if generated is not None:
        row["generated"] = sum(r["min"] for s, r in table.items() if s in generated) / total
    if exp is not None:
        row["exp1"] = sum(r["min"] for s, r in table.items() if exp.get(s) == 1) / total
        row["exp23"] = sum(r["min"] for s, r in table.items() if exp.get(s) in (2, 3)) / total
    return row


def careers(world, entry, span, last):
    """entry: player -> draft year (round 1-2). Follow draft+1 .. draft+span; every drafted player counts."""
    rows = []
    for s, d in entry.items():
        if d + span > last:
            continue
        seq = [world.get(d + k, {}).get(s) for k in range(1, span + 1)]
        rows.append(seq)
    if len(rows) < 60:
        return dict(n=len(rows))
    regular = [sum(bool(r and r["min"] >= 500) for r in q) for q in rows]
    last_reg = [max((k + 1 for k, r in enumerate(q) if r and r["min"] >= 500), default=0) for q in rows]
    first_reg = [next((k + 1 for k, r in enumerate(q) if r and r["min"] >= 500), None) for q in rows]
    best = [min((r["rank"] for r in q if r), default=999) for q in rows]
    star = [q for q in rows if any(r and r["rank"] <= 30 for r in q)]
    return dict(n=len(rows), regular_seasons=mean(regular), never=mean(x == 0 for x in regular), eight_plus=mean(x >= 8 for x in regular),
                early_exit=mean(0 < l <= 4 for l in last_reg), late_start=mean(f is not None and f >= 3 for f in first_reg),
                top30_ever=mean(b <= 30 for b in best), top100_ever=mean(b <= 100 for b in best), top10_ever=mean(b <= 10 for b in best),
                star_top30_seasons=mean(sum(bool(r and r["rank"] <= 30) for r in q) for q in star) if star else None,
                star_first_top30=median(next(k + 1 for k, r in enumerate(q) if r and r["rank"] <= 30) for q in star) if star else None,
                star_peak_year=median(max(range(len(q)), key=lambda k: q[k]["value"] if q[k] else -1) + 1 for q in star) if star else None,
                gap_seasons=mean(any(not (r and r["min"] >= 500) for r in q[f - 1:l]) for q, f, l in zip(rows, first_reg, last_reg) if f and l > f))


def nba_panel(span):
    nba, bios, _ = r16.source_data()
    world = {y: acc.season_table(nba[y]) for y in range(2005, 2027)}
    born = {s: b["bornYear"] for s, b in bios.items() if b.get("bornYear")}
    draft = {s: b["draftYear"] for s, b in bios.items() if b.get("draftRound") in (1, 2) and b.get("draftYear")}
    rows = [season_row(world[y], {s: y - born[s] for s in world[y] if s in born}, exp={s: y - draft[s] for s in world[y] if s in draft}) for y in range(2010, 2027)]
    eco = {k: (mean(r[k] for r in rows), pstdev(r[k] for r in rows)) for k in rows[0]}
    entry = {s: d for s, d in draft.items() if 2004 <= d <= 2026 - span}
    return eco, careers(world, entry, span, 2026)


def league(path, span, skip=2):
    with gzip.open(path, "rt") as f:
        run = json.load(f)
    ix = r16.player_index(run)
    start, last = run["start"], run["start"] + run["years"] - 1
    gen = {s for s in ix if s.startswith("generated_")}
    world = {y: acc.season_table({s: p["by_year"][y] for s, p in ix.items() if y in p["by_year"]}) for y in range(start, last + 1)}
    out = dict(seasons={}, start=start, last=last)
    for y in range(start, last + 1):
        ages = {s: y - ix[s]["born"] for s in world[y]}
        exp = {s: y - ix[s]["draft"]["year"] for s in world[y] if ix[s]["draft"]["round"] in (1, 2)}
        rat = {s: ix[s]["rating"][y] for s in world[y] if y in ix[s]["rating"]}
        row = season_row(world[y], ages, rat, gen, exp)
        snap = run["snapshots"][y - start]
        wins = [w / (w + l + t) for _, w, l, t, *_ in snap["teamRecords"] if w + l + t]
        pay = Counter()
        for _, tid, amount, e, _ in snap["market"]:
            if tid >= 0 and e >= y + 1:
                pay[tid] += amount
        top = sorted((v / snap["cap"] for v in pay.values()), reverse=True)
        box = [r["box"] for r in world[y].values()]
        tot = {k: sum(b[k] for b in box) for k in ("pts", "fg", "fga", "tp", "tpa", "fta", "ast", "min")}
        row.update(win_sd=pstdev(wins), pay_mean=mean(top), pay_top5=mean(top[:5]), pay_peak=top[0], ts=tot["pts"] / (2 * (tot["fga"] + .44 * tot["fta"])),
                   tpar=tot["tpa"] / tot["fga"], p2=(tot["fg"] - tot["tp"]) / (tot["fga"] - tot["tpa"]), ftr=tot["fta"] / tot["fga"])
        idle = 0
        if y > start:
            market = {r[0]: r[1:] for r in run["snapshots"][y - start - 1]["market"]}
            for s, p in ix.items():
                now = market.get(p["pid"])
                before = p["by_year"].get(y - 1, ref.EMPTY)
                if now and now[0] == -1 and now[3] == 0 and before["min"] >= 1000 and p["rating"].get(y, {}).get("ovr", 0) >= 62 and p["by_year"].get(y, ref.EMPTY)["min"] == 0:
                    idle += 1
        row["idle62"] = idle
        out["seasons"][y] = row
    late = [out["seasons"][y] for y in range(start + skip, last + 1)]
    out["mean"] = {k: mean(r[k] for r in late) for k in late[0]}
    tail = [out["seasons"][y] for y in range(last - 3, last + 1)]
    out["tail"] = {k: mean(r[k] for r in tail) for k in tail[0]}
    entry = {s: p["draft"]["year"] for s, p in ix.items() if p["draft"]["round"] in (1, 2) and p["draft"]["year"] >= start - 1}
    out["careers_all"] = careers(world, entry, span, last)
    out["careers_real"] = careers(world, {s: d for s, d in entry.items() if s not in gen}, span, last)
    out["careers_generated"] = careers(world, {s: d for s, d in entry.items() if s in gen}, min(span, 8), last)
    ret = [p["retiredYear"] - p["born"] for p in ix.values() if p["retiredYear"] and start < p["retiredYear"] <= last and sum(b["min"] for y, b in p["by_year"].items() if y >= start) >= 5000]
    out["retire_age"] = (mean(ret), median(ret), len(ret)) if ret else None
    return out


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("leagues", nargs="+"); p.add_argument("--span", type=int, default=12); p.add_argument("--output", type=Path)
    a = p.parse_args()
    eco, nba_careers = nba_panel(a.span)
    runs = defaultdict(list)
    for item in a.leagues:
        label, path = item.split("=", 1)
        runs[label].append(league(path, a.span))
    avg = lambda items, part, k: mean(i[part][k] for i in items if i[part].get(k) is not None) if any(i[part].get(k) is not None for i in items) else None
    f = lambda v: "      -" if v is None else f"{v:7.3f}" if abs(v) < 10 else f"{v:7.1f}"
    print("ECOLOGY mean of seasons 3+ | last four seasons;   NBA 2010-26 mean (sd)")
    for k in next(iter(runs.values()))[0]["mean"]:
        ref_ = f"NBA {f(eco[k][0])} ({f(eco[k][1])})" if k in eco else " " * 21
        print(f"{k:12s} {ref_}", *(f"| {l} {f(avg(r, 'mean', k))} {f(avg(r, 'tail', k))}" for l, r in runs.items()))
    for part in ("careers_all", "careers_real", "careers_generated"):
        span = a.span if part != "careers_generated" else min(a.span, 8)
        base = nba_careers if span == a.span else nba_panel(span)[1]
        print(f"\n{part}: first {span} seasons of every drafted player")
        for k in base:
            print(f"{k:20s} NBA {f(base[k])}", *(f"| {l} {f(avg(r, part, k))}" for l, r in runs.items()))
    print("\nretirement age of careers with 5000+ minutes (mean, median, n)", {l: [r["retire_age"] for r in v] for l, v in runs.items()})
    print("\nOVR top300 / 60+ / 70+ / generated share / exp1 / young22 by season")
    for l, v in runs.items():
        for i in v:
            print(l, *(f"{y}:{r['top300']:.1f}/{r['ovr60']}/{r['ovr70']}/{r['generated']:.2f}/{r['exp1']:.3f}/{r['young22']:.2f}" for y, r in i["seasons"].items()))
    if a.output:
        a.output.write_text(json.dumps(dict(nba_ecology=eco, nba_careers=nba_careers, runs=runs), indent=1) + "\n")
