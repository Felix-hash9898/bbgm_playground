"""Score the generated-draft alignment pilot on the preregistered K/R cells."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
from statistics import mean

import r164_ablation as ablation
import r164_trajectory_score as trajectory

rep, op, base, long, row = ablation.rep, ablation.op, ablation.base, ablation.long, ablation.row
WINDOW = "2024"
COMPONENTS = "finish,rookies,market,style,classes,growth,files"


def load_cells(root):
    release = op.digest()
    cells, openings, research_ids = [], defaultdict(dict), set()
    for cell in op.cells("quality"):
        arm, seed = cell["arm"], cell["seed"]
        folder = root / f"r164-cell-{op.r16.key(cell)}"
        world = op.read_cell(folder, cell, release)
        metadata = json.loads((folder / "cell.json").read_text())
        expected = COMPONENTS + (",draftAlignment" if arm == "R" else "")
        if metadata["components"] != expected or world["start"] != int(WINDOW) or not world["selfTest"]["ok"]:
            raise ValueError(f"{folder}: wrong treatment, opening or formula")
        if not metadata["sha"] or not metadata["run"]:
            raise ValueError(f"{folder}: expected a cloud run")
        research_ids.add((metadata["sha"], metadata["run"]))
        openings[seed][arm] = world["opening"]
        logs = op.lines(folder / "classes.jsonl")
        if any(("alignment" in log) != (arm == "R") for log in logs):
            raise ValueError(f"{folder}: generated treatment escaped its arm")
        if arm == "R" and (not logs or not any(log["alignment"]["pairs"] > 0 for log in logs)):
            raise ValueError(f"{folder}: the treatment was inactive")
        for log in logs:
            if arm == "R":
                count, gain = (log["alignment"][k] for k in ("pairs", "alignmentGain"))
                if count > log["n"] // 4 or count < 0 or gain < 0 or bool(count) != bool(gain):
                    raise ValueError(f"{folder}: invalid pairing ledger")
        cells.append((WINDOW, arm, seed, folder))
    if len(research_ids) != 1 or any(not pair["R"] == pair["K"] for pair in openings.values()):
        raise ValueError("Release or paired opening mismatch")
    return cells, release, research_ids.pop()


def anchors(workspace):
    def path(old_root, stage):
        return workspace / "results/r164_cloud" / old_root.name / stage

    archive = []
    for root, stage, frozen in (
        (rep.LONG, "long", "freeze_long.json"),
        (rep.SUCC, "succession", "freeze_succession.json"),
        (rep.CLASSES, "classes", "freeze_classes.json"),
        (trajectory.fin.growth.REPL, "replication", "freeze_replication.json"),
        (trajectory.FINAL, "final", "freeze_final.json"),
    ):
        wanted = "F" if stage == "final" else "AH"
        for cell in op.cells(stage):
            if cell["start"] != int(WINDOW) or cell["arm"] not in wanted:
                continue
            folder = path(root, "cells") / f"r164-cell-{op.r16.key(cell)}"
            op.read_cell(folder, cell, op.checksum(path(root, frozen)))
            archive.append((WINDOW, cell["arm"], cell["seed"], folder))
    return {arm: ablation.league_summary(ablation.paths(archive, WINDOW, arm)) for arm in "AFH"}


def level_detail(frame):
    d = trajectory.traj.base(frame)
    d = d[d["min"].ge(1000) & (d.season - d.start).between(8, 17)]
    two_way = (d.off_rank <= 30) & (d.def_rank <= 60)
    seasons = d.groupby(["league", "season"]).ngroups

    def metrics(sample):
        return dict(n=len(sample), two_way=float(two_way.loc[sample.index].sum() / seasons),
                    corr=float(sample.off36_rel.corr(sample.def36_rel)))
    return dict(all=metrics(d), generated=metrics(d[~d.real]), real=metrics(d[d.real]))


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("cells", type=Path)
    cli.add_argument("output", type=Path)
    cli.add_argument("workspace_research", type=Path)
    args = cli.parse_args()
    trajectory.panel.HERE = args.workspace_research.resolve()
    fresh, release, (commit, run) = load_cells(args.cells)
    eco, nba = long.nba_panel(12)
    leagues = {a: ablation.league_summary(ablation.paths(fresh, WINDOW, a)) for a in "KR"}
    old = anchors(args.workspace_research)
    modern = [(a, f) for _, a, _, f in fresh]
    panel = trajectory.panel_of(modern)
    scale = trajectory.traj.scale_of(panel)
    panels = {a: panel[panel.src == a] for a in "KR"}
    measured = {a: trajectory.traj.measure(p, scale) for a, p in panels.items()}
    level = {a: level_detail(p) for a, p in panels.items()}
    per_seed = {a: {league: level_detail(p[p.league == league]) for league in sorted(p.league.unique())}
                for a, p in panels.items()}
    moves = {a: trajectory.turnover([f for arm, f in modern if arm == a]) for a in "KR"}

    protected = {}
    for arm, league in leagues.items():
        folders = [f for a, f in modern if a == arm]
        p1, _ = rep.score(WINDOW, dict(old, I=league), nba, eco, folders)
        protected[arm] = [g for g in p1 if not g["metric"].startswith(("distance of 12-season careers", "career distance I over"))]
    guards = protected["R"]
    career = {a: ablation.career_distance(l, nba) for a, l in leagues.items()}
    delta = career["R"] - career["K"]
    guards.append(row(WINDOW, "career", "12-season distance minus same-seed K", delta, "<= .03", delta <= .03))
    other = [dict(g, window=WINDOW) for g in ablation.protections("R", measured, moves) if g["area"] != "two-way"]
    guards += other
    for group, metric, limit in (("all", "two_way", 1), ("all", "corr", .05), ("generated", "corr", .05)):
        diff = level["R"][group][metric] - level["K"][group][metric]
        guards.append(row(WINDOW, "target", f"{group}: {metric} difference vs K", diff, f">= {limit}", diff >= limit))
    verdict = "REVIEW" if all(g["passed"] for g in guards) else "HOLD"
    args.output.mkdir()
    (args.output / "receipt.json").write_text(json.dumps(
        dict(release=release, commit=commit, run=run, verdict=verdict, gates=guards, K_modern=protected["K"],
             per_seed=per_seed, levels=level, career_distance=career, measured=measured), indent=2, default=str) + "\n")
    for gate in guards:
        print("pass" if gate["passed"] else "FAIL", gate["area"], gate["metric"], gate["value"])
    print(verdict, sum(g["passed"] for g in guards), "/", len(guards))


if __name__ == "__main__":
    main()
