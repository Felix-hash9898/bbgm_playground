"""Score the preregistered K/N/O/Q factorial. See R164_ABLATION.md."""
import argparse
import json
import gzip
from collections import defaultdict
from pathlib import Path
from statistics import mean

import r164_trajectory_score as trajectory

fin, rep, suc, long, base, audit = (
    trajectory.fin, trajectory.rep, trajectory.suc, trajectory.long, trajectory.base, trajectory.audit
)
op, row = rep.op, fin.row
ARMS = "KNOQ"
MODERN = ("2021", "2024")
COMPONENTS = "finish,rookies,market,style,classes,growth,files"


def load_fresh(root):
    release = suc.digest()
    cells = list(rep.load(root, "ablation", release, ARMS))
    commits, runs, openings = set(), set(), defaultdict(dict)
    for start, arm, seed, folder in cells:
        receipt = json.loads((folder / "cell.json").read_text())
        expected = COMPONENTS + (",calm" if arm in "OQ" else "")
        if receipt["components"] != expected:
            raise ValueError(f"{start}/{seed}/{arm}: component mismatch")
        with gzip.open(next(folder.glob("full__*.json.gz")), "rt") as file:
            league = json.load(file)
        if league["start"] != int(start) or not league["selfTest"]["ok"]:
            raise ValueError(f"{start}/{seed}/{arm}: wrong opening or formula self-test failed")
        openings[start, seed][arm] = league["opening"]
        commits.add(receipt["sha"])
        runs.add(receipt["run"])
    for (start, seed), arms in openings.items():
        if set(arms) != set(ARMS) or any(opening != arms["K"] for opening in arms.values()):
            raise ValueError(f"{start}/{seed}: mismatched opening across arms")
    if len(commits) != 1 or len(runs) != 1 or None in commits or None in runs:
        raise ValueError("Expected one cloud release commit and run")
    return cells, release, commits.pop(), runs.pop()


def paths(cells, window, arm):
    return [next(folder.glob("full__*.json.gz")) for w, a, _, folder in cells if (w, a) == (window, arm)]


def league_summary(paths):
    return base.merge([long.league(path, 12) for path in paths])


def career_distance(league, target):
    return base.distance(league["careers_all"], target)


def protections(arm, measured, moves):
    current, reference = measured[arm], measured["K"]
    gates = []

    def check(area, name, value, limit, minimum=False):
        gates.append(row("2021+2024", area, name, value, f"{'>=' if minimum else '<='} {limit:.6f}",
                         value >= limit if minimum else value <= limit))

    c = "30-40 one-year collapse share"
    check("trajectory", c, current["continuity"][c], reference["continuity"][c] + .005)
    for tag in ("19-24", "25-29", "30-40"):
        key = f"mean |r| of changes {tag}"
        check("growth", key, current["independence"][key], .10)
        key = f"offence-defence change corr {tag}"
        check("growth", key, abs(current["independence"][key]), abs(reference["independence"][key]) + .06)
    check("two-way", "two-way regulars, seasons 9-18",
          current["combos"]["two-way (off top 30 and def top 60) per season, seasons 9-18"],
          reference["combos"]["two-way (off top 30 and def top 60) per season, seasons 9-18"] - .75, True)
    key = "corr offence-defence, seasons 9-18"
    check("two-way", key, current["combos"][key], reference["combos"][key] - .04, True)
    values, nba = moves[arm]
    k, _ = moves["K"]
    key = "26-29", "star_still_top60"
    check("career", "stars still top 60 after three years", values[key], k[key] + .05)
    key = "26-29", "rise_to_top60"
    check("career", "rise to top 60", values[key], .80 * k[key], True)
    for age in ("26-29", "30-32"):
        check("career", f"three-year exits: {age}, error from NBA", abs(values[age, "out"] - nba[age]["out"]), .06)
    return gates


def trajectory_targets(arm, errors):
    comparisons = []
    if arm in "NQ":
        comparisons.append(("K" if arm == "N" else "O", {
            "composition_old": .75, "composition_young": 1.05, "roles_defence": .80, "roles_offence": 1.05,
        }))
    if arm in "OQ":
        reference = "K" if arm == "O" else "N"
        comparisons.append((reference, {"persistence_old_5y": .85}))
    gates = []
    for reference, targets in comparisons:
        for key, fraction in targets.items():
            limit = fraction * errors[reference][key]
            value = errors[arm][key]
            gates.append(row("2021+2024", "target", f"{key}: {arm} vs {reference}", value,
                             f"<= {limit:.6f}", value <= limit))
        if "persistence_old_5y" in targets:
            value = errors[arm]["persistence_other"] - errors[reference]["persistence_other"]
            gates.append(row("2021+2024", "target", f"other persistence: {arm} minus {reference}",
                             value, "<= .02", value <= .02))
    return gates


def early_protection(arm, index, summaries, real, ratings):
    counts = {a: audit.table({1998: index["1998", a]}, real) for a in (arm, "K")}
    fit, reference = (audit.misfit(counts[a]) for a in (arm, "K"))
    gates = [row("1998", "growth", "55+/60+ misfit minus K", fit - reference, "<= .20", fit - reference <= .20)]
    for band in audit.BANDS:
        for lag in (3, 5):
            n, simulated = counts[arm][band, lag, 55]
            if n >= 12:
                ratio = simulated / n
                gates.append(row("1998", "growth", f"{band} 55+ at lag {lag}", ratio, ".60 - 1.50", .60 <= ratio <= 1.50))
    years = range(2000, 2004)
    ovr = mean(fin.league_ability(ix, y)["top300"] for ix, _, _ in index["1998", arm] for y in years)
    ovr -= mean(fin.ability(ratings, y)["top300"] for y in years)
    old = summaries["1998", arm]["tail"]["old33"]
    win = summaries["1998", arm]["tail"]["win_sd"] - summaries["1998", "K"]["tail"]["win_sd"]
    gates += [row("1998", "ability", "top-300 OVR minus real", ovr, "+-3", abs(ovr) <= 3),
              row("1998", "succession", "33+ minutes share", old, ".05 - .22", .05 <= old <= .22),
              row("1998", "ecology", "win SD minus K", win, "<= .025", win <= .025)]
    return gates


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cells", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    fresh, release, commit, run = load_fresh(args.cells)
    new = {(w, arm): paths(fresh, w, arm) for w in (*MODERN, "2008", "1998") for arm in ARMS}
    all_leagues = {path: long.league(path, 12) for group in new.values() for path in group}
    summaries = {k: base.merge([all_leagues[path] for path in group]) for k, group in new.items()}

    anchors = [cell for root, stage, freeze in (
        (rep.LONG, "long", "freeze_long.json"),
        (rep.SUCC, "succession", "freeze_succession.json"),
        (rep.CLASSES, "classes", "freeze_classes.json"),
        (fin.growth.REPL, "replication", "freeze_replication.json"),
    ) for cell in rep.load(root / "cells", stage, suc.checksum(root / freeze), "AH")]
    final = []
    final_release = suc.checksum(trajectory.FINAL / "freeze_final.json")
    for cell in op.cells("final"):
        if cell["start"] in (2008, 2021, 2024) and cell["arm"] in "AF":
            folder = trajectory.FINAL / "cells" / f"r164-cell-{rep.r16.key(cell)}"
            op.read_cell(folder, cell, final_release)
            final.append((str(cell["start"]), cell["arm"], cell["seed"], folder))
    ecology, nba = long.nba_panel(12)
    modern_anchors = {(w, a): league_summary(paths(anchors + final, w, a)) for w in MODERN for a in "AFH"}

    modern = [(arm, f) for w, arm, _, f in fresh if w in MODERN]
    panel = trajectory.panel_of(modern)
    scale = trajectory.traj.scale_of(panel)
    measured = {arm: trajectory.traj.measure(panel[panel.src == arm], scale) for arm in ("NBA", *ARMS)}
    errors = {arm: trajectory.traj.errors(measured[arm], measured["NBA"]) for arm in ARMS}
    moves = {arm: trajectory.turnover([f for a, f in modern if a == arm]) for arm in ARMS}

    index = {k: [audit.read(path) for path in group] for k, group in new.items() if k[0] not in MODERN}
    ratings = audit.pd.read_parquet(fin.HERE / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"])
    real = audit.real_ratings()
    seasons08, nba08 = fin.nba_window(2008, 2025)
    anchor08 = {a: paths(final, "2008", a) for a in "AF"}
    summaries08 = {a: league_summary(group) for a, group in anchor08.items()}
    indexes08 = {a: [audit.read(path)[0] for path in group] for a, group in anchor08.items()}

    distances = {arm: {w: career_distance(summaries[w, arm], nba) for w in MODERN} for arm in ARMS}
    paired_distances = {f"{w}/{seed}/{arm}": career_distance(all_leagues[next(f.glob("full__*.json.gz"))], nba)
                        for w, arm, seed, f in fresh if w in MODERN}
    gates = {}
    for arm in ARMS:
        rows = []
        for window in MODERN:
            anchors_for_window = {a: modern_anchors[window, a] for a in "AFH"}
            folders = [f for w, a, _, f in fresh if (w, a) == (window, arm)]
            p1, _ = rep.score(window, dict(anchors_for_window, I=summaries[window, arm]), nba, ecology, folders)
            rows += [g for g in p1 if not g["metric"].startswith(("distance of 12-season careers", "career distance I over"))]
            delta = distances[arm][window] - distances["K"][window]
            rows.append(row(window, "career", "distance minus same-seed K", delta, "<= .03", delta <= .03))
        ratio = mean(distances[arm].values()) / mean(distances["K"].values())
        rows.append(row("2021+2024", "career", "equal-window ratio to same-seed K", ratio, "<= 1.05", ratio <= 1.05))

        old = summaries["2008", arm]
        old_gates, _ = fin.old_era(dict(summaries08, K=old), dict(indexes08, K=[ix for ix, _, _ in index["2008", arm]]),
                                   ratings, (2008, 2017), nba08, seasons08, "2008")
        delta = career_distance(old, nba08) - career_distance(summaries["2008", "K"], nba08)
        rows += old_gates + [row("2008", "career", "distance minus same-seed K", delta, "<= .03", delta <= .03)]
        rows += early_protection(arm, index, summaries, real, ratings)
        rows += protections(arm, measured, moves) + trajectory_targets(arm, errors)
        gates[arm] = rows
    verdict = {arm: "REVIEW" if all(g["passed"] for g in rows) else "HOLD" for arm, rows in gates.items()}
    adopted = ("Q" if all(verdict[a] == "REVIEW" for a in "NOQ") else
               "N" if verdict["N"] == "REVIEW" else "O" if verdict["O"] == "REVIEW" else "K")
    args.output.mkdir()
    (args.output / "receipt.json").write_text(json.dumps(dict(
        release=release, commit=commit, run=run, verdict=verdict, adopted=adopted, gates=gates,
        errors=errors, measured=measured, career_distance=distances, career_distance_per_seed=paired_distances,
    ), indent=1, default=str) + "\n")
    for arm, rows in gates.items():
        for gate in rows:
            print(arm, "pass" if gate["passed"] else "FAIL", gate["window"], gate["metric"], gate["value"], gate["rule"])
        print(arm, verdict[arm], sum(g["passed"] for g in rows), "/", len(rows))
    print("adopted:", adopted)


if __name__ == "__main__":
    main()
