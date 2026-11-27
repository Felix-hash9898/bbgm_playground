"""Score the preregistered Growth Next K / veteran-only / young-only factorial."""
import argparse
from importlib import import_module
import json
from pathlib import Path
from statistics import mean

import r164_combo_score as previous

a, op, row, tr = previous.a, previous.op, previous.row, previous.tr
fin, rep = a.fin, a.rep
pd = a.audit.pd
individual = import_module("160_r164_individual_audit")
ARMS = ("K", "V", "Y")
STAGES = {2021: (77, 78), 2024: (91, 92), 2008: (98,)}
COMPONENTS = "finish,rookies,market,style,classes,growth,files"
MODERN = ("2021", "2024")


def specs():
    return [dict(start=start, seed=seed, years=18, arm=arm)
            for start, seeds in STAGES.items() for seed in seeds for arm in ARMS]


def load(cells):
    worlds, folders, markets, ids = {}, {}, {}, set()
    release = op.digest()
    for cell in specs():
        start, seed, arm, years = (cell[k] for k in ("start", "seed", "arm", "years"))
        folder = cells / f"r164-cell-{op.r16.key(cell)}"
        meta = json.loads((folder / "cell.json").read_text())
        if meta["components"] != COMPONENTS or not meta["sha"] or not meta["run"]:
            raise ValueError(f"Unexpected runner configuration in {folder}")
        ids.add((meta["sha"], meta["run"]))
        ledgers = op.lines(folder / "combo_opening_market.jsonl")
        if len(ledgers) != 1 or ledgers[0]["season"] != start or (folder / "opening_pot.jsonl").exists():
            raise ValueError(f"Unexpected opening activity in {folder}")
        key = (str(start), seed, arm)
        folders[key], markets[key] = folder, ledgers[0]["market"]
        worlds[key] = previous.read_certified(folder, arm, start, seed, years, release)
    for (w, seed, arm), value in worlds.items():
        if value["opening"] != worlds[w, seed, "K"]["opening"] or markets[w, seed, arm] != markets[w, seed, "K"]:
            raise ValueError(f"Arms do not share the same opening in {w}/{seed}")
    if len(ids) != 1:
        raise ValueError("Expected a single research deployment")
    return worlds, folders, markets, release, ids.pop()


def anchor_2021(workspace):
    archive = workspace / "results/r164_cloud"
    controls = []
    for old, stage, accepted in (
        (rep.LONG, "long", "AH"), (rep.SUCC, "succession", "AH"), (rep.CLASSES, "classes", "AH"),
        (fin.growth.REPL, "replication", "AH"), (tr.FINAL, "final", "F"),
    ):
        root = archive / old.name
        release = op.checksum(root / f"freeze_{stage}.json")
        for cell in op.cells(stage):
            if cell["start"] == 2021 and cell["arm"] in accepted:
                folder = root / "cells" / f"r164-cell-{op.r16.key(cell)}"
                op.read_cell(folder, cell, release)
                controls.append(("2021", cell["arm"], cell["seed"], folder))
    return {arm: a.league_summary(a.paths(controls, "2021", arm)) for arm in "AFH"}


def collapse_rates(frame, folders):
    keys = individual.KEYS
    context = pd.concat([individual.simulated_context(arm, next(f.glob("full__*.json.gz")))
                         for (w, _, arm), f in folders.items() if w in MODERN], ignore_index=True)
    needed = list(dict.fromkeys([*keys, "start", "age", "min", "net36_rel", "off36_rel", "def36_rel", "gp", "mpg", "ovr", "tpar", "ts",
                                 "fga", "fta", "tov", "rank", *tr.traj.ROLES.values()]))
    active = frame[frame.src.ne("NBA")][needed].merge(context, on=keys, validate="one_to_one", how="left")
    active["usage36"] = (active.fga + .44 * active.fta + active.tov) * 36 / active["min"].where(active["min"].gt(0))
    active["start_rate"] = active.started / active.gp.where(active.gp.gt(0))
    pairs = individual.veteran_pairs(active)
    out = {}
    for arm, group in pairs.groupby("src"):
        out[arm] = {}
        for window, cohort in (("pooled", group), *[(w, group[group.start.eq(int(w))]) for w in MODERN]):
            stable = cohort[cohort.both & cohort.steady_role]
            if stable.empty:
                raise ValueError(f"No veteran steady-role observations in {arm}/{window}")
            out[arm][window] = dict(steady=float(stable.collapse.mean()), n=len(stable),
                                    no_permanent=float(stable[~stable.injured_permanently].collapse.mean()))
    return out


def score(worlds, folders, markets, workspace):
    groups = {(w, arm): [f for (window, _, name), f in folders.items() if (window, name) == (w, arm)]
              for w in (*MODERN, "2008") for arm in ARMS}
    files = {k: [next(f.glob("full__*.json.gz")) for f in fs] for k, fs in groups.items()}
    summaries = {k: a.league_summary(ps) for k, ps in files.items()}
    eco, nba = a.long.nba_panel(12)
    anchors = {"2021": anchor_2021(workspace), "2024": previous.quality.anchors(workspace)}
    distances = {w: {arm: a.career_distance(summaries[w, arm], nba) for arm in ARMS} for w in MODERN}
    tr.panel.HERE = workspace
    frame = tr.panel_of([(arm, f) for (w, _, arm), f in folders.items() if w in MODERN])
    scale = tr.traj.scale_of(frame)
    measured = {arm: tr.traj.measure(frame[frame.src.eq(arm)], scale) for arm in ("NBA", *ARMS)}
    errors = {arm: tr.traj.errors(measured[arm], measured["NBA"]) for arm in ARMS}
    moves = {arm: tr.turnover(groups["2021", arm] + groups["2024", arm]) for arm in ARMS}
    stable = collapse_rates(frame, folders)
    levels = {w: {arm: previous.quality.level_detail(frame[frame.src.eq(arm) & frame.start.eq(int(w))])["all"]
                  for arm in ARMS} for w in MODERN}
    ratings = pd.read_parquet(workspace / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"])
    real_seasons, nba08 = fin.nba_window(2008, 2025)
    old, old_index = previous.archived_08(workspace)
    history = {arm: a.career_distance(summaries["2008", arm], nba08) for arm in ARMS}
    gates, details = {}, {}

    def relative(g, w, area, metric, value, threshold, minimum=False):
        g.append(row(w, area, metric, value, f"{'>=' if minimum else '<='} {threshold:.8f}",
                     value >= threshold if minimum else value <= threshold))

    for arm in ("V", "Y"):
        g = [p for p in a.protections(arm, measured, moves) if p["area"] != "two-way"]
        details[arm] = {}
        for w in MODERN:
            p1, _ = rep.score(w, dict(anchors[w], I=summaries[w, arm]), nba, eco, groups[w, arm])
            g += [p for p in p1 if p["area"] in ("succession", "drift", "market", "career")
                  and not p["metric"].startswith(("distance of 12-season careers", "career distance I over"))]
            relative(g, w, "career", "distance minus K", distances[w][arm] - distances[w]["K"], .03)
            relative(g, w, "two-way", "two-way regulars minus K", levels[w][arm]["two_way"] - levels[w]["K"]["two_way"], -1.75, True)
            pairs = [(worlds[w, seed, "K"], worlds[w, seed, arm], markets[w, seed, arm], []) for seed in STAGES[int(w)]]
            rows, details[arm][w] = previous.potential.gates(w, pairs, require_calibration=False)
            g += [dict(p, area="opportunity", metric=p["metric"].replace("T minus U", f"{arm} minus K")) for p in rows]
        combined = "2021+2024"
        ratio = mean(d[arm] for d in distances.values()) / mean(d["K"] for d in distances.values())
        relative(g, combined, "career", "equal-window distance ratio", ratio, 1.05)
        relative(g, combined, "trajectory", "steady role collapse rate minus K", stable[arm]["pooled"]["steady"]-stable["K"]["pooled"]["steady"], .0075)
        for kind, bound in (("two-way (off top 30 and def top 60) per season", -1), ("corr offence-defence", -.06)):
            key = kind + ", seasons 9-18"
            relative(g, combined, "two-way", key + " minus K", measured[arm]["combos"][key]-measured["K"]["combos"][key], bound, True)

        ref, trial = errors["K"], errors[arm]
        targets = ({"composition_old": .80*ref["composition_old"], "roles_defence": .85*ref["roles_defence"], "composition_young": ref["composition_young"]+.02}
                   if arm == "V" else {"composition_old": ref["composition_old"]+.02, "roles_defence": ref["roles_defence"]+.02, "composition_young": .90*ref["composition_young"]})
        for name, threshold in targets.items():
            relative(g, combined, "target", name, trial[name], threshold)

        ix = [a.audit.read(p)[0] for p in files["2008", arm]]
        p2, details[arm]["2008"] = fin.old_era(dict(old, K=summaries["2008", arm]), dict(old_index, K=ix), ratings,
                                                (2008, 2017), nba08, real_seasons, "2008")
        g += [p for p in p2 if p["area"] in ("succession", "career", "efficiency", "market")]
        relative(g, "2008", "career", "distance minus K", history[arm]-history["K"], .03)
        gates[arm] = g
    return dict(gates=gates, verdict={arm: previous.planning.check_verdict(g) for arm, g in gates.items()},
                distances=distances, distance_2008=history, stable_roles=stable, two_way=levels, errors=errors,
                measured=measured, details=details, league_summaries={f"{w}/{a_}": v for (w, a_), v in summaries.items()})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cells", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("workspace", type=Path)
    args = parser.parse_args()
    worlds, folders, markets, release, (commit, run) = load(args.cells)
    result = score(worlds, folders, markets, args.workspace.resolve())
    args.output.mkdir()
    (args.output / "receipt.json").write_text(json.dumps(dict(result, release=release, commit=commit, run=run), indent=2, default=str) + "\n")
    for arm, gates in result["gates"].items():
        print(arm, result["verdict"][arm], sum(g["passed"] for g in gates), "/", len(gates))
        for g in gates:
            if not g["passed"]:
                print(g["window"], g["area"], g["metric"], g["value"], g["rule"])
