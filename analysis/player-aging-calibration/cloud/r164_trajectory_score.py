"""Score the trajectory round: L (K + OVR-neutral composition of growth + generated-class spread) and M (L + smaller permanent random
steps from 29). Fixed before any result; needs pandas. K is not changed by this: it stays the candidate unless an arm passes everything.

Seeds: 2021/36-38 and 2024/58-60 (the P1 seeds of run 45678905354; L and M were designed on other leagues), 2008/91-93, and
2012/121-123, 2017/171-173 for the real-ratings growth audit (F and J archived there; J and K grow the same way).
1 product     every gate and bound of the replication round with the arm in I's place (F same seeds, archived A and H).
2 careers     distance of 12-season careers <= 1.05 K, same seeds, both windows.
3 old era     every P2 gate K passed must still pass.
4 growth      misfit to the real ratings in 2012 / 2017 <= 1.15 J (both arms are meant to leave OVR alone).
5 trajectory  distances to the NBA of scripts/159, same seeds as K: what declines from 28 <= .75 K, at 19-24 <= K; rim protectors and ball hawks
              keeping their role <= .80 K, offensive roles <= 1.05 K; five-year persistence at 29-35: L <= 1.05 K, M <= .85 K; the other
              persistence cells <= K + .02; one-year collapse share at 30+ <= K.
6 combination two-way players in seasons 9-18 >= K + 1, correlation of offence and defence >= K + .05, sd of defensive IQ <= K.
7 protection  independence of skill changes (mean |r| <= .10, offence-defence <= K + .06 at each age); turnover over 18 seasons: stars of
              26-29 still top 60 after three years <= K + .05, rises to the top 60 at 26-29 >= .8 K, share out of the league after three years
              within .06 of the NBA at 26-29 and 30-32.
M is adopted if it passes all; else L if it passes all; else K stays."""
import argparse
import json
from collections import defaultdict
from importlib import import_module
from pathlib import Path
from statistics import mean

import r164_final_score as fin

rep, suc, long, base, audit, growth = fin.rep, fin.suc, fin.long, fin.base, fin.audit, fin.growth
HERE, pd = fin.HERE, audit.pd
traj, panel = import_module("159_r164_trajectory_acceptance"), import_module("157_r164_trajectory_panel")
acc = long.acc
FINAL = HERE / "results/r164_cloud/run_45678905354"
row = fin.row


def panel_of(cells):
    frames = [panel.nba_rows()] + [panel.league_rows(arm, next(f.glob("full__*.json.gz"))) for arm, f in cells]
    full = pd.concat(frames, ignore_index=True)
    full["min"] = full["min"].fillna(0)
    played = panel.finish(full)
    return full.join(played[[c for c in played.columns if c not in full.columns]])


def turnover(folders):
    history, born = acc.nba_world(2004, 2026)
    nba = acc.transitions(history, born, 2006, 2026)
    out = defaultdict(list)
    for f in folders:
        world, ages, run = acc.sim_world(next(f.glob("full__*.json.gz")), history, born)
        t = acc.transitions(world, ages, run["start"] + 2, run["start"] + run["years"] - 1)
        for band in ("26-29", "30-32"):
            for k in ("star_still_top60", "rise_to_top60", "out"):
                out[band, k].append(t[band][k])
    return {k: mean(v) for k, v in out.items()}, nba


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("cells", type=Path); p.add_argument("output", type=Path)
    a = p.parse_args()
    eco, nba = long.nba_panel(12)
    sig = suc.checksum
    fresh = list(rep.load(a.cells, "trajectory", suc.digest(), "LM"))
    final = list(rep.load(FINAL / "cells", "final", sig(FINAL / "freeze_final.json"), "AFK"))
    era = list(rep.load(fin.GROW / "cells", "growth", sig(fin.GROW / "freeze_growth.json"), "FJ"))
    old = [x for root, stage, freeze in ((rep.LONG, "long", "freeze_long.json"), (rep.SUCC, "succession", "freeze_succession.json"),
                                         (rep.CLASSES, "classes", "freeze_classes.json"), (growth.REPL, "replication", "freeze_replication.json"))
           for x in rep.load(root / "cells", stage, sig(root / freeze), "AH")]
    pick = lambda cells, w, arm: [f for x, y, _, f in cells if (x, y) == (w, arm)]
    leagues = lambda fs: [long.league(next(f.glob("full__*.json.gz")), 12) for f in fs]
    frame = pd.read_parquet(HERE / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"])
    real = audit.real_ratings()
    modern = [(y, f) for x, y, _, f in fresh + [c for c in final if c[1] == "K"] if x in ("2021", "2024")]
    full = panel_of(modern)
    scale = traj.scale_of(full)
    measured = {s: traj.measure(full[full.src == s], scale) for s in ("NBA", "K", "L", "M")}
    errors = {s: traj.errors(measured[s], measured["NBA"]) for s in "KLM"}
    move = {s: turnover([f for y, f in modern if y == s]) for s in "KLM"}
    seasons, careers08 = fin.nba_window(2008, 2025)
    arch08 = {arm: (base.merge(leagues(pick(final, "2008", arm))), [audit.read(next(f.glob("full__*.json.gz")))[0] for f in pick(final, "2008", arm)]) for arm in "AFK"}
    def old_rows(mk, ix):
        return fin.old_era({"A": arch08["A"][0], "F": arch08["F"][0], "K": mk}, {"A": arch08["A"][1], "F": arch08["F"][1], "K": ix}, frame, (2008, 2017), careers08, seasons, "2008")[0]
    k08 = {g["metric"].split(" (")[0]: g["passed"] for g in old_rows(*arch08["K"])}
    results, report = {}, dict(errors=errors, measured=measured)
    for arm in "LM":
        rows, K = [], errors["K"]
        for w in ("2021", "2024"):
            m = {"A": base.merge(leagues(pick(old, w, "A"))), "H": base.merge(leagues(pick(old, w, "H"))), "F": base.merge(leagues(pick(final, w, "F"))), "I": base.merge(leagues(pick(fresh, w, arm)))}
            rows += rep.score(w, m, nba, eco, pick(fresh, w, arm))[0]
            dx, dk = base.distance(m["I"]["careers_all"], nba), base.distance(base.merge(leagues(pick(final, w, "K")))["careers_all"], nba)
            rows.append(row(w, "careers", f"career distance {arm} / K, same seeds (K {dk:.3f})", dx / dk, "<= 1.05", dx <= 1.05 * dk))
        for g in old_rows(base.merge(leagues(pick(fresh, "2008", arm))), [audit.read(next(f.glob("full__*.json.gz")))[0] for f in pick(fresh, "2008", arm)]):
            if k08[g["metric"].split(" (")[0]]:
                rows.append(g)
        tables = {}
        for label, cells, name in (("J", era, "J"), (arm, fresh, arm)):
            runs = {int(w): [audit.read(next(f.glob("full__*.json.gz"))) for f in pick(cells, w, name)] for w in ("2012", "2017")}
            tables[label] = audit.misfit(audit.table(runs, real))
        rows.append(row("2012+2017", "growth", f"misfit to real ratings {arm} / J (J {tables['J']:.2f})", tables[arm] / tables["J"], "<= 1.15", tables[arm] <= 1.15 * tables["J"]))
        e, t = errors[arm], measured[arm]
        for key, factor in (("composition_old", .75), ("composition_young", 1), ("roles_defence", .8), ("roles_offence", 1.05), ("persistence_old_5y", .85 if arm == "M" else 1.05)):
            rows.append(row("2021+2024", "trajectory", f"{key}: distance to the NBA {arm} / K ({e[key]:.3f} / {K[key]:.3f})", e[key] / K[key], f"<= {factor}", e[key] <= factor * K[key]))
        rows.append(row("2021+2024", "trajectory", "other persistence cells, distance minus K", e["persistence_other"] - K["persistence_other"], "<= .02", e["persistence_other"] <= K["persistence_other"] + .02))
        c, ck = t["continuity"], measured["K"]["continuity"]
        rows.append(row("2021+2024", "trajectory", f"one-year collapse share at 30+ (K {ck['30-40 one-year collapse share']:.3f}, NBA {measured['NBA']['continuity']['30-40 one-year collapse share']:.3f})", c["30-40 one-year collapse share"], "<= K", c["30-40 one-year collapse share"] <= ck["30-40 one-year collapse share"]))
        x, xk = t["combos"], measured["K"]["combos"]
        two, cor, sd = "two-way (off top 30 and def top 60) per season, seasons 9-18", "corr offence-defence, seasons 9-18", "sd diq of regulars, seasons 9-18"
        rows += [row("2021+2024", "combination", f"two-way players per season, seasons 9-18 (K {xk[two]:.1f})", x[two], ">= K + 1", x[two] >= xk[two] + 1),
                 row("2021+2024", "combination", f"correlation of offence and defence, seasons 9-18 (K {xk[cor]:+.2f})", x[cor], ">= K + .05", x[cor] >= xk[cor] + .05),
                 row("2021+2024", "combination", f"sd of defensive IQ of regulars, seasons 9-18 (K {xk[sd]:.1f})", x[sd], "<= K", x[sd] <= xk[sd])]
        i, ik = t["independence"], measured["K"]["independence"]
        for band in ("19-24", "25-29", "30-40"):
            r, o = f"mean |r| of changes {band}", f"offence-defence change corr {band}"
            rows += [row("2021+2024", "protection", r, i[r], "<= .10", i[r] <= .10), row("2021+2024", "protection", f"{o} (K {ik[o]:.2f})", i[o], "<= K + .06", i[o] <= ik[o] + .06)]
        (v, nb), (vk, _) = move[arm], move["K"]
        rows += [row("2021+2024", "protection", f"26-29 stars still top 60 after three years (K {vk['26-29', 'star_still_top60']:.3f}, NBA {nb['26-29']['star_still_top60']:.3f})", v["26-29", "star_still_top60"], "<= K + .05", v["26-29", "star_still_top60"] <= vk["26-29", "star_still_top60"] + .05),
                 row("2021+2024", "protection", f"26-29 rises to the top 60 (K {vk['26-29', 'rise_to_top60']:.3f}, NBA {nb['26-29']['rise_to_top60']:.3f})", v["26-29", "rise_to_top60"], ">= .8 K", v["26-29", "rise_to_top60"] >= .8 * vk["26-29", "rise_to_top60"])]
        for band in ("26-29", "30-32"):
            n = nb[band]["out"]
            rows.append(row("2021+2024", "protection", f"{band} out of the league after three years minus NBA {n:.3f} (K {vk[band, 'out']:.3f})", v[band, "out"] - n, "+-.06", abs(v[band, "out"] - n) <= .06))
        results[arm] = rows
    verdict = {arm: "REVIEW" if all(g["passed"] for g in v) else "HOLD" for arm, v in results.items()}
    adopted = "M" if verdict["M"] == "REVIEW" else "L" if verdict["L"] == "REVIEW" else "K"
    a.output.mkdir()
    (a.output / "receipt.json").write_text(json.dumps(dict(release=suc.digest(), verdict=verdict, adopted=adopted, gates=results, report=report), indent=1, default=str) + "\n")
    for arm, rows in results.items():
        for g in rows:
            print(arm, "pass" if g["passed"] else "FAIL", g["window"], f"{g['value']:+.3f}", g["rule"], "|", g["area"], g["metric"].replace("H - ", f"{arm} - ").replace(", H", f", {arm}"))
        print(arm, verdict[arm], sum(g["passed"] for g in rows), "of", len(rows))
    print("adopted:", adopted)


if __name__ == "__main__":
    main()
