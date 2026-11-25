"""Score the final R16.4 round: candidate K unchanged, three separate verdicts. Fixed before any result. Needs pandas.

P1 2015-26 first: every gate and bound of the classes / replication rounds with K in I's place, on seeds no arm has seen
   (2021/36-38, 2024/58-60), F of the same seeds, archived A and H. A failure is a HOLD for the candidate.
P2 2006-14: eighteen seasons from the 2008 opening (A, F, K; seeds 91-93). Every class through 2025 is real, so careers, ages,
   ability counts and efficiency are compared with the same players' NBA careers and the same NBA seasons.
P3 earlier eras, and the only fully independent test of the growth correction: openings 1998 and 2001 (F, K; three seeds, six
   seasons). Their outcomes end in 2003 and 2006; the fitted openings' outcomes start in 2007. The 2008/2012/2017 openings of
   the growth round shared players and seasons with the fitted ones, so they were not fully independent.
   "Reasonable" = K is not worse than F, abilities stay near the real level and no band is absurd. "Generalizes" (misfit <= .85 F)
   is reported as a claim, not a gate."""
import argparse
import json
from collections import defaultdict
from importlib import import_module
from math import log
from pathlib import Path
from statistics import mean

import r164_growth_score as growth

rep, suc, long, base, audit = growth.rep, growth.suc, growth.long, growth.base, growth.audit
HERE = growth.HERE
GROW = HERE / "results/r164_cloud/run_45643807853"
OLD, EARLY = "2008", ("1998", "2001")


def row(window, area, metric, value, rule, passed):
    return dict(window=window, area=area, metric=metric, value=value, rule=rule, passed=bool(passed))


def nba_window(first, last):
    """NBA seasons first..last measured like the leagues, plus efficiency."""
    nba, bios, _ = long.r16.source_data()
    world = {y: long.acc.season_table(nba[y]) for y in range(2004, 2027)}
    born = {s: b["bornYear"] for s, b in bios.items() if b.get("bornYear")}
    draft = {s: b["draftYear"] for s, b in bios.items() if b.get("draftRound") in (1, 2) and b.get("draftYear")}
    out = {}
    for y in range(first, last + 1):
        out[y] = long.season_row(world[y], {s: y - born[s] for s in world[y] if s in born}, exp={s: y - draft[s] for s in world[y] if s in draft})
        tot = {k: sum(r["box"][k] for r in world[y].values()) for k in ("pts", "fg", "fga", "tp", "tpa", "fta")}
        out[y].update(ts=tot["pts"] / (2 * (tot["fga"] + .44 * tot["fta"])), tpar=tot["tpa"] / tot["fga"])
    return out, long.careers(world, {s: d for s, d in draft.items() if first - 1 <= d <= last - 12}, 12, last)


def ability(real_frame, y):
    o = sorted(real_frame[real_frame.season == y].ovr, reverse=True)
    return dict(top300=mean(o[:300]), o55=sum(x >= 55 for x in o), o60=sum(x >= 60 for x in o))


def league_ability(ix, y):
    o = sorted((p["rating"][y]["ovr"] for p in ix.values() if y in p["rating"] and y in p["by_year"]), reverse=True)
    return dict(top300=mean(o[:300]), o55=sum(x >= 55 for x in o), o60=sum(x >= 60 for x in o))


def classes(leagues, frame, first, last):
    """Real players by draft class, first..last: at 55+ and 60+ after 4, 6, 8 years. Real side from the rating file, so a player the
    league never used still counts; absence counts as below."""
    out, known = {}, frame[frame.draftYear.between(first, last)]
    for lag in (4, 6, 8):
        use = known[(known.season == known.draftYear + lag) & (known.season <= last + 8)]
        for level in (55, 60):
            simulated = mean(sum(p["rating"].get(p["draft"]["year"] + lag, {"ovr": 0})["ovr"] >= level for s, p in ix.items()
                                 if not s.startswith("generated_") and first <= p["draft"]["year"] <= last and p["draft"]["year"] + lag <= last + 8) for ix in leagues)
            out[lag, level] = [float((use.ovr >= level).sum()), simulated]
    return out


def old_era(m, players, frame, window, nba_careers, seasons, label):
    """m: arm -> merged league, players: arm -> list of player indexes, seasons: NBA rows of the same years."""
    K, F, A = m["K"], m["F"], m["A"]
    years = sorted(seasons); tail, early = years[-4:], years[3:6]
    nba = lambda k: mean(seasons[y][k] for y in tail)
    d = {a: base.distance(m[a]["careers_all"], nba_careers) for a in m}
    c = K["careers_all"]
    rows = [
        row(label, "succession", f"minutes share aged 22 or less minus NBA {nba('young22'):.3f}", K["tail"]["young22"] - nba("young22"), "+-.04", abs(K["tail"]["young22"] - nba("young22")) <= .04),
        row(label, "succession", f"minutes share aged 33 or more minus NBA {nba('old33'):.3f}", K["tail"]["old33"] - nba("old33"), "+-.06", abs(K["tail"]["old33"] - nba("old33")) <= .06),
        row(label, "succession", "first-year minutes share", K["tail"]["exp1"], ">= .045", K["tail"]["exp1"] >= .045),
        row(label, "succession", f"mean age minus NBA {nba('mean_age'):.2f}", K["tail"]["mean_age"] - nba("mean_age"), "+-1.2", abs(K["tail"]["mean_age"] - nba("mean_age")) <= 1.2),
        row(label, "career", "career distance of the classes of 2007-13 to their NBA careers, K", d["K"], f"< A ({d['A']:.3f}) and <= 1.05 F ({1.05 * d['F']:.3f})", d["K"] < d["A"] and d["K"] <= 1.05 * d["F"]),
        row(label, "career", "eight or more regular seasons, K - NBA", c["eight_plus"] - nba_careers["eight_plus"], "+-.10", abs(c["eight_plus"] - nba_careers["eight_plus"]) <= .10),
        row(label, "career", "top-30 seasons per star, K / NBA", c["star_top30_seasons"] / nba_careers["star_top30_seasons"], ".70 - 1.45", .70 <= c["star_top30_seasons"] / nba_careers["star_top30_seasons"] <= 1.45),
        row(label, "career", "mean retirement age of 5000+ minute careers", K["retire"], "33.5 - 38", 33.5 <= K["retire"] <= 38),
        row(label, "market", "healthy proven 62+ unused, per season", K["mean"]["idle62"], "<= .15", K["mean"]["idle62"] <= .15),
        row(label, "market", "top-five payroll / cap, K - F", K["mean"]["pay_top5"] - F["mean"]["pay_top5"], "<= .08", K["mean"]["pay_top5"] - F["mean"]["pay_top5"] <= .08),
        row(label, "market", "team win SD, K - F", K["mean"]["win_sd"] - F["mean"]["win_sd"], "<= .025", K["mean"]["win_sd"] - F["mean"]["win_sd"] <= .025),
    ]
    for k, bound in (("ts", .025), ("tpar", .08)):
        change = mean(K["seasons"][y][k] for y in tail) - mean(K["seasons"][y][k] for y in early)
        want = nba(k) - mean(seasons[y][k] for y in early)
        rows.append(row(label, "efficiency", f"{k} change, last four seasons minus seasons 4-6, K - NBA change ({want:+.3f})", change - want, f"+-{bound}", abs(change - want) <= bound))
    mid = years[4:14]
    r = {k: mean(ability(frame, y)[k] for y in mid) for k in ("top300", "o55", "o60")}
    s = {arm: {k: mean(league_ability(ix, y)[k] for ix in players[arm] for y in mid) for k in r} for arm in players}
    rows += [
        row(label, "ability", f"top-300 OVR, seasons 5-14, K - real ({r['top300']:.1f})", s["K"]["top300"] - r["top300"], "+-3", abs(s["K"]["top300"] - r["top300"]) <= 3),
        row(label, "ability", f"players at 55+, seasons 5-14, K / real ({r['o55']:.0f}; A {s['A']['o55']:.0f}, F {s['F']['o55']:.0f})", s["K"]["o55"] / r["o55"], ".75 - 1.30", .75 <= s["K"]["o55"] / r["o55"] <= 1.30),
        row(label, "ability", f"players at 60+, seasons 5-14, K / real ({r['o60']:.0f}; A {s['A']['o60']:.0f}, F {s['F']['o60']:.0f})", s["K"]["o60"] / r["o60"], ".70 - 1.40 and no further from 1 than A", .70 <= s["K"]["o60"] / r["o60"] <= 1.40 and abs(log(s["K"]["o60"] / r["o60"])) <= abs(log(s["A"]["o60"] / r["o60"]))),
    ]
    tables = {arm: classes(players[arm], frame, *window) for arm in players}
    fit = {arm: audit.misfit(t) for arm, t in tables.items()}
    rows.append(row(label, "growth", f"real classes {window[0]}-{window[1]}, 55+ and 60+ after 4, 6, 8 years: misfit K / F (F {fit['F']:.2f}, A {fit['A']:.2f})", fit["K"] / fit["F"], "<= 1 and below A", fit["K"] <= fit["F"] and fit["K"] < fit["A"]))
    for (lag, level), (a, b) in tables["K"].items():
        if level == 55:
            rows.append(row(label, "growth", f"real classes {window[0]}-{window[1]}, 55+ after {lag} years, K / real (real {a:.0f}, A {tables['A'][lag, level][1]:.0f}, F {tables['F'][lag, level][1]:.0f})", b / a, ".70 - 1.40", .70 <= b / a <= 1.40))
    return rows, dict(distance=d, ability_real=r, ability=s, classes={a: {f"{k[0]}y {k[1]}+": v for k, v in t.items()} for a, t in tables.items()})


def early_eras(cells, real, frame):
    runs = defaultdict(lambda: defaultdict(list))
    merged = defaultdict(lambda: defaultdict(list))
    for w, arm, _, f in cells:
        path = next(f.glob("full__*.json.gz"))
        runs[arm][int(w)].append(audit.read(path))
        merged[w][arm].append(long.league(path, 12))
    tables = {arm: audit.table(runs[arm], real) for arm in "FK"}
    fit = {arm: audit.misfit(t) for arm, t in tables.items()}
    rows = [row("early", "growth", f"misfit K / F, openings 1998 and 2001 (F {fit['F']:.2f})", fit["K"] / fit["F"], "<= 1 (claim of generalization: <= .85)", fit["K"] <= fit["F"])]
    for band in audit.BANDS:
        for lag in (3, 5):
            r, s = tables["K"][band, lag, 55]
            if r >= 12:
                rows.append(row("early", "growth", f"55+ after {lag} years, opening age {band[0]}-{band[1]}, K / real (real {r:.0f}, F {tables['F'][band, lag, 55][1]:.0f})", s / r, ".60 - 1.50", .60 <= s / r <= 1.50))
    for w in EARLY:
        last = int(w) + 5
        tail = range(last - 3, last + 1)
        r = mean(ability(frame, y)["top300"] for y in tail)
        s = mean(league_ability(ix, y)["top300"] for ix, _, _ in runs["K"][int(w)] for y in tail)
        K, F = ({k: mean(l["tail"][k] for l in merged[w][arm]) for k in ("young22", "old33", "mean_age", "win_sd", "pay_top5")} for arm in "KF")
        rows += [row(w, "ability", f"top-300 OVR, last four seasons, K - real ({r:.1f})", s - r, "+-3", abs(s - r) <= 3),
                 row(w, "succession", f"minutes share aged 33 or more, K (F {F['old33']:.3f})", K["old33"], ".05 - .22", .05 <= K["old33"] <= .22),
                 row(w, "market", "team win SD, K - F", K["win_sd"] - F["win_sd"], "<= .025", K["win_sd"] - F["win_sd"] <= .025)]
    return rows, dict(misfit=fit, tables={arm: {f"{b[0]}-{b[1]} lag {lag} {level}+": v for (b, lag, level), v in t.items()} for arm, t in tables.items()})


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("cells", type=Path); p.add_argument("output", type=Path)
    a = p.parse_args()
    eco, nba = long.nba_panel(12)
    fresh = list(rep.load(a.cells, "final", suc.digest(), "AFK"))
    old = [x for root, stage, freeze in ((rep.LONG, "long", "freeze_long.json"), (rep.SUCC, "succession", "freeze_succession.json"),
                                         (rep.CLASSES, "classes", "freeze_classes.json"), (growth.REPL, "replication", "freeze_replication.json"))
           for x in rep.load(root / "cells", stage, suc.checksum(root / freeze), "AH")]
    frame = audit.pd.read_parquet(HERE / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"])
    real, results, report = audit.real_ratings(), {"P1": [], "P2": [], "P3": []}, {}
    for w in ("2021", "2024"):
        new = {arm: base.merge([long.league(next(f.glob("full__*.json.gz")), 12) for x, y, _, f in fresh if (x, y) == (w, arm)]) for arm in "FK"}
        m = dict({arm: base.merge([long.league(next(f.glob("full__*.json.gz")), 12) for x, y, _, f in old if (x, y) == (w, arm)]) for arm in "AH"}, F=new["F"], I=new["K"])
        rows, d = rep.score(w, m, nba, eco, [f for x, y, _, f in fresh if (x, y) == (w, "K")])
        results["P1"] += rows
        report[w] = dict(distance=d, merged=dict(m, K=m.pop("I")))
    mine = [(arm, next(f.glob("full__*.json.gz"))) for x, arm, _, f in fresh if x == OLD]
    seasons, careers = nba_window(int(OLD), int(OLD) + 17)
    results["P2"], report[OLD] = old_era({arm: base.merge([long.league(path, 12) for y, path in mine if y == arm]) for arm in "AFK"},
                                         {arm: [audit.read(path)[0] for y, path in mine if y == arm] for arm in "AFK"},
                                         frame, (2008, 2017), careers, seasons, OLD)
    results["P3"], report["early"] = early_eras([x for x in fresh if x[0] in EARLY], real, frame)
    a.output.mkdir()
    verdict = {k: "REVIEW" if all(g["passed"] for g in v) else "HOLD" for k, v in results.items()}
    (a.output / "receipt.json").write_text(json.dumps(dict(release=suc.digest(), verdict=verdict, gates=results, nba_careers=nba, nba_ecology=eco, report=report), indent=1, default=str) + "\n")
    for part, rows in results.items():
        for g in rows:
            print(part, "pass" if g["passed"] else "FAIL", g["window"], f"{g['value']:+.3f}", g["rule"], "|", g["area"], g["metric"].replace("H - ", "K - ").replace(", H", ", K"))
        print(part, verdict[part], sum(g["passed"] for g in rows), "of", len(rows))


if __name__ == "__main__":
    main()
