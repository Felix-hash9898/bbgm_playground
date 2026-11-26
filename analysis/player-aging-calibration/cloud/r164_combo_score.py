"""Score the frozen final bundle with its same-seed K and selected-growth controls."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
from statistics import mean

import r164_ablation as a
from r164_ablation_archive_audit import read_cell as read_archived_cell
import r164_combo_plan as planning
import r164_combo_pot as potential
import r164_quality_score as quality
import r164_trajectory_score as tr

fin, rep, op, row = a.fin, a.rep, a.op, a.row
MODERN = a.MODERN
WINDOWS = (*MODERN, "2008", "1998")


def read_certified(folder, arm, start, seed, years, manifest, *, archived=False):
    reader = read_archived_cell if archived else op.read_cell
    world = reader(folder, dict(arm=arm, start=start, seed=seed, years=years), manifest)
    if world["start"] != start or not world["selfTest"]["ok"]:
        raise ValueError(f"Wrong opening or formula self-test in {folder}")
    return world


def load(cells, workspace, plan):
    archive = workspace / "results/r164_cloud"
    ablation = archive / f"run_{planning.ABLATION}/cells"
    source = plan["source_runs"][planning.ABLATION]
    release = op.digest()
    identities, worlds, folders, ledgers = set(), {}, {}, {}
    fresh = plan["fresh_controls"]
    control_source = fresh["launch"]
    prior = archive / f"run_{control_source['run']}/cells"
    inputs = [(spec, cells, release) for spec in plan["include"]]
    inputs += [(spec, prior, control_source["release"]) for spec in fresh["cells"]]
    for spec, source_cells, cell_release in inputs:
        w, seed, arm, years = (spec[k] for k in ("start", "seed", "arm", "years"))
        folder = source_cells / f"r164-cell-{op.r16.key(spec)}"
        config = plan["treatment"] if arm == "T" else plan["controls"][arm]
        metadata = json.loads((folder / "cell.json").read_text())
        if metadata["components"] != ",".join(config["component_flags"]):
            raise ValueError(f"Wrong component receipt in {folder}")
        if not metadata["sha"] or not metadata["run"]:
            raise ValueError(f"Missing cloud release in {folder}")
        if source_cells == prior:
            if (metadata["sha"], str(metadata["run"])) != (control_source["commit"], str(control_source["run"])):
                raise ValueError(f"Wrong fresh control in {folder}")
        else:
            identities.add((metadata["sha"], metadata["run"]))
        key = str(w), seed, arm
        worlds[key] = read_certified(folder, arm, w, seed, years, cell_release)
        folders[key] = folder
        pot = op.lines(folder / "opening_pot.jsonl")
        markets = op.lines(folder / "combo_opening_market.jsonl")
        if len(markets) != 1 or markets[0]["season"] != w:
            raise ValueError(f"Expected opening availability ledger in {folder}")
        x = worlds[key]["opening"]
        operates = "openingPot" in config["component_flags"]
        if operates != bool(pot) or len(pot) > 1:
            raise ValueError(f"Unexpected POT activity in {folder}")
        if pot:
            before, after = x, pot[0]["after"]
            if (pot[0]["season"] != w or any(after[k] != value for k, value in before.items() if k != "potential")
                    or after["potential"] == before["potential"]):
                raise ValueError(f"Unexpected effect outside opening POT in {folder}")
            if any(r["after"] < r["ovr"] or not 19 <= r["age"] <= 26 for r in pot[0]["rows"]):
                raise ValueError(f"Invalid opening POT receipt in {folder}")
        aligned = "draftAlignment" in config["component_flags"]
        classes = op.lines(folder / "classes.jsonl")
        if any(("alignment" in r) != aligned for r in classes) or (
                aligned and classes and not any(r["alignment"]["pairs"] > 0 for r in classes)):
            raise ValueError(f"Unexpected generated draft effect in {folder}")
        ledgers[key] = (markets[0]["market"], pot[0]["rows"] if pot else [])
    if len(identities) != 1:
        raise ValueError("Combination cells came from multiple releases")

    for w, (years, seeds) in planning.MATCHED.items():
        for seed in seeds:
            for arm, original in plan["archive_comparison"].items():
                folder = ablation / f"r164-cell-{w}-{seed}-{original}"
                key = str(w), seed, arm
                metadata = json.loads((folder / "cell.json").read_text())
                if (metadata["sha"], str(metadata["run"])) != (source["commit"], str(source["run"])):
                    raise ValueError(f"Wrong archived control in {folder}")
                worlds[key] = read_certified(folder, original, w, seed, years, source["release"], archived=True)
                folders[key] = folder
    for (w, seed, arm), world in worlds.items():
        if world["opening"] != worlds[w, seed, "K"]["opening"]:
            raise ValueError(f"Opening mismatch in {w}/{seed}/{arm}")
        control = w, seed, "K"
        if (w, seed, arm) in ledgers and control in ledgers:
            if ledgers[w, seed, arm][0] != ledgers[control][0]:
                raise ValueError(f"Opening market mismatch in {w}/{seed}/{arm}")
    return worlds, folders, ledgers, release, identities.pop()


def archived_08(workspace):
    old = workspace / "results/r164_cloud" / tr.FINAL.name
    release = op.checksum(old / "freeze_final.json")
    files = defaultdict(list)
    for cell in op.cells("final"):
        if cell["start"] == 2008 and cell["arm"] in "AF":
            folder = old / "cells" / f"r164-cell-{op.r16.key(cell)}"
            op.read_cell(folder, cell, release)
            files[cell["arm"]].append(next(folder.glob("full__*.json.gz")))
    return ({arm: a.league_summary(p) for arm, p in files.items()},
            {arm: [a.audit.read(f)[0] for f in p] for arm, p in files.items()})


def modern_protection(blobs, summaries, workspace):
    eco, nba = a.long.nba_panel(12)
    anchors2024 = quality.anchors(workspace)
    # Reuse the original 2021 baselines with the same selection as the ablation.
    archive = workspace / "results/r164_cloud"
    controls = []
    for old, stage, kind, accepted in (
        (rep.LONG, "long", "long", "AH"), (rep.SUCC, "succession", "succession", "AH"),
        (rep.CLASSES, "classes", "classes", "AH"), (fin.growth.REPL, "replication", "replication", "AH"),
        (tr.FINAL, "final", "final", "F"),
    ):
        root = archive / old.name
        release = op.checksum(root / f"freeze_{kind}.json")
        for cell in op.cells(stage):
            if cell["start"] == 2021 and cell["arm"] in accepted:
                path = root / "cells" / f"r164-cell-{op.r16.key(cell)}"
                op.read_cell(path, cell, release)
                controls.append(("2021", cell["arm"], cell["seed"], path))
    anchors2021 = {arm: a.league_summary(a.paths(controls, "2021", arm)) for arm in "AFH"}
    arms = tuple(sorted({arm for _, _, arm in blobs}))
    distances, by_seed, gates = {}, {}, []
    for w, anchors in (("2021", anchors2021), ("2024", anchors2024)):
        f = [path for (window, _, arm), path in blobs.items() if (window, arm) == (w, "T")]
        old, _ = rep.score(w, dict(anchors, I=summaries[w, "T"]), nba, eco, f)
        gates += [g for g in old if not g["metric"].startswith(("distance of 12-season careers", "career distance I over"))]
        distances[w] = {arm: a.career_distance(summaries[w, arm], nba) for arm in arms}
        delta = distances[w]["T"] - distances[w]["K"]
        gates.append(row(w, "career", "career distance minus K", delta, "<= .03", delta <= .03))
        for arm in arms:
            f = blobs[w, planning.FRESH[int(w)], arm]
            by_seed[f"{w}/{planning.FRESH[int(w)]}/{arm}"] = a.career_distance(a.long.league(next(f.glob("full__*.json.gz")), 12), nba)
    ratio = mean(d["T"] for d in distances.values()) / mean(d["K"] for d in distances.values())
    gates.append(row("2021+2024", "career", "equal-window distance ratio", ratio, "<= 1.05", ratio <= 1.05))
    return gates, dict(distance=distances, new_seed_distance=by_seed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cells", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("workspace_research", type=Path)
    args = parser.parse_args()
    workspace = args.workspace_research.resolve()
    path = op.HERE / "cloud/r164_combo_matrix.json"
    plan = json.loads(path.read_text())
    if plan != planning.build(workspace / "results/r164_cloud"):
        raise ValueError("The active matrix differs from the frozen independent evidence")
    worlds, blobs, ledgers, release, (commit, run) = load(args.cells, workspace, plan)
    arms = tuple(sorted({arm for _, _, arm in blobs}))
    groups = {(w, arm): [next(p.glob("full__*.json.gz")) for (x, _, y), p in blobs.items() if (w, arm) == (x, y)]
              for w in WINDOWS for arm in arms}
    summaries = {key: a.league_summary(paths) for key, paths in groups.items()}
    gates, report = modern_protection(blobs, summaries, workspace)
    baseline = "U" if "U" in arms else "K"

    modern = [(arm, f) for (w, _, arm), f in blobs.items() if w in MODERN]
    tr.panel.HERE = workspace
    frame = tr.panel_of(modern)
    scale = tr.traj.scale_of(frame)
    measured = {arm: tr.traj.measure(frame[frame.src == arm], scale) for arm in ("NBA", *arms)}
    moves = {arm: tr.turnover([f for a_, f in modern if a_ == arm]) for arm in arms}
    errors = {a_: tr.traj.errors(measured[a_], measured["NBA"]) for a_ in arms}
    gates += a.protections("T", measured, moves)

    target_arm = plan["growth_base"]
    if target_arm in "NQ":
        gates += [dict(g, metric=g["metric"].replace("N vs K", "T vs K"))
                  for g in a.trajectory_targets("N", dict(errors, N=errors["T"]))]
    if target_arm in "OQ":
        gates += [dict(g, metric=g["metric"].replace("O vs K", "T vs K").replace("O minus K", "T minus K"))
                  for g in a.trajectory_targets("O", dict(errors, O=errors["T"]))]
    report.update(errors=errors, measured=measured)

    real = a.audit.pd.read_parquet(workspace / "data/bbgm_real_ratings.parquet").drop_duplicates(["season", "slug"])
    real_map = {(r.slug, r.season): r.ovr for r in real.itertuples()}
    idx = {key: [a.audit.read(path) for path in files] for key, files in groups.items() if key[0] in ("2008", "1998")}
    reg08, idx08 = archived_08(workspace)
    seasons, nba08 = fin.nba_window(2008, 2025)
    old, _ = fin.old_era(dict(reg08, K=summaries["2008", "T"]),
                         dict(idx08, K=[ix for ix, _, _ in idx["2008", "T"]]), real, (2008, 2017), nba08, seasons, "2008")
    delta = a.career_distance(summaries["2008", "T"], nba08) - a.career_distance(summaries["2008", "K"], nba08)
    gates += old + [row("2008", "career", "career distance minus K", delta, "<= .03", delta <= .03)]
    gates += a.early_protection("T", idx, summaries, real_map, real)

    if "draftAlignment" in plan["optional"]:
        groups2024 = {arm: quality.level_detail(frame[(frame.src == arm) & frame.start.eq(2024)]) for arm in (baseline, "T")}
        report["generated_levels"] = groups2024
        for origin, kind, bound in (("all", "two_way", 1), ("all", "corr", .05), ("generated", "corr", .05)):
            delta = groups2024["T"][origin][kind] - groups2024[baseline][origin][kind]
            gates.append(row("2024", "generated", f"{origin} {kind} minus base", delta, f">= {bound}", delta >= bound))
    report["early_opportunities"] = {}
    for w in MODERN:
        pairs = [(worlds[w, seed, baseline], t, *ledgers[w, seed, "T"])
                 for (window, seed, arm), t in worlds.items() if (window, arm) == (w, "T")]
        rows, details = potential.gates(w, pairs, require_calibration=False)
        gates += rows
        report["early_opportunities"][w] = details

    args.output.mkdir()
    result = dict(release=release, commit=commit, run=run, plan=plan, gates=gates,
                  verdict=planning.check_verdict(gates), report=report)
    (args.output / "receipt.json").write_text(json.dumps(result, indent=2, default=str) + "\n")
    print(result["verdict"], sum(g["passed"] for g in gates), "/", len(gates))
    for g in gates:
        if not g["passed"]:
            print("FAIL", g["window"], g["area"], g["metric"], g["value"], g["rule"])


if __name__ == "__main__":
    main()
