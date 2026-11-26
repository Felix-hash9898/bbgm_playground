"""Generate the final combination matrix from verified independent score receipts."""
import argparse
from hashlib import sha256
import json
from pathlib import Path
import sys

ABLATION = "45765401275"
QUALITY = "45769475243"
POT = "45766883169"
COMBINATION = "45855924022"
MATCHED = {
    2021: (18, (71, 72, 73)),
    2024: (18, (81, 82, 83)),
    2008: (18, (95, 96, 97)),
    1998: (6, (101, 102)),
}
FRESH = {2021: 76, 2024: 90}
COMPONENTS = ("finish", "rookies", "market", "style", "classes", "growth", "files")
GROWTH = {"K": "v9s_l4j", "N": "v9s_l4l", "O": "v9s_l4o", "Q": "v9s_l4m"}


def read(path):
    return json.loads(path.read_text())


def identity(archive, run, kind, expected_cells):
    root = archive / f"run_{run}"
    launch = read(root / "launch.json")
    manifest = root / f"freeze_{kind}.json"
    release = sha256(manifest.read_bytes()).hexdigest()
    if (str(launch["run"]), launch["release"], launch["scheduled_cells"]) != (run, release, len(expected_cells)):
        raise ValueError(f"Unexpected launch identity in {root}")
    seen = set()
    for metadata in (root / "cells").glob("*/cell.json"):
        cell = read(metadata)
        if (str(cell["run"]), cell["sha"], cell["freeze"]) != (run, launch["commit"], release):
            raise ValueError(f"Mixed cells in {metadata}")
        key = (cell["start"], cell["seed"], cell["arm"], cell["years"])
        if key not in expected_cells:
            raise ValueError(f"Unscheduled cell in {metadata}")
        if key in seen:
            raise ValueError(f"Duplicate cell in {metadata}")
        seen.add(key)
    if seen != expected_cells:
        raise ValueError(f"Incomplete cells in {root}")
    return root, launch


def check_verdict(gates):
    if not gates or any(type(row["passed"]) is not bool for row in gates):
        raise ValueError("Expected nonempty Boolean gate results")
    return "REVIEW" if all(row["passed"] for row in gates) else "HOLD"


def check_score(launch, receipt):
    if (receipt["release"], receipt["commit"], str(receipt["run"])) != (
        launch["release"], launch["commit"], str(launch["run"])
    ):
        raise ValueError("Score does not match the recorded deployment")


def growth_choice(verdicts):
    if set(verdicts) != set(GROWTH) or set(verdicts.values()) - {"REVIEW", "HOLD"}:
        raise ValueError("Unexpected growth verdict")
    if all(verdicts[a] == "REVIEW" for a in "NOQ"):
        return "Q"
    return next((a for a in "NO" if verdicts[a] == "REVIEW"), "K")


def matrix(base, optional):
    controls = ("K",) if base == "K" else ("K", "U")
    out = []
    for start, (years, seeds) in MATCHED.items():
        for seed in seeds:
            out.append(dict(start=start, seed=seed, years=years, arm="T"))
    for start, seed in FRESH.items():
        for arm in (*controls, "T"):
            out.append(dict(start=start, seed=seed, years=18, arm=arm))

    base_components = COMPONENTS + (("calm",) if base in "OQ" else ())
    return dict(archive_comparison={a: ("K" if a == "K" else base) for a in controls}, include=out,
                treatment=dict(growth=GROWTH[base], component_flags=[*base_components, *optional]),
                controls={a: dict(growth=GROWTH["K" if a == "K" else base],
                                  component_flags=list(COMPONENTS if a == "K" else base_components)) for a in controls})


def build_full(archive):
    stage_paths = {
        ABLATION: archive / f"run_{ABLATION}/ablation_score/receipt.json",
        QUALITY: archive / f"run_{QUALITY}/quality_score/receipt.json",
        POT: archive / f"run_{POT}/pot_score/receipt_audit.json",
    }
    missing = [p for p in stage_paths.values() if not p.is_file()]
    if missing:
        raise FileNotFoundError(", ".join(str(p) for p in missing))
    expected = {
        ABLATION: {(w, seed, arm, years) for w, (years, seeds) in MATCHED.items() for seed in seeds for arm in "KNOQ"},
        QUALITY: {(2024, seed, arm, 18) for seed in range(86, 90) for arm in "KR"},
        POT: {(w, seed, arm, 2) for w, seeds in ((2021, (74, 75)), (2024, (84, 85))) for seed in seeds for arm in "KP"},
    }

    launches = {}
    scores = {run: read(path) for run, path in stage_paths.items()}
    for run, kind in ((ABLATION, "ablation"), (QUALITY, "quality"), (POT, "pot")):
        _, launches[run] = identity(archive, run, kind, expected[run])
    aging = scores[ABLATION]
    check_score(launches[ABLATION], aging)
    verdicts = {a: check_verdict(rows) for a, rows in aging["gates"].items()}
    base = growth_choice(verdicts)
    if (base, verdicts) != (aging["adopted"], aging["verdict"]):
        raise ValueError("Growth selection differs from frozen score")
    quality = scores[QUALITY]
    check_score(launches[QUALITY], quality)
    if check_verdict(quality["gates"]) != quality["verdict"]:
        raise ValueError("Inconsistent generated-player score")

    pot_raw = read(stage_paths[POT].with_name("receipt.json"))
    check_score(launches[POT], dict(pot_raw, release=pot_raw["freeze"]))
    pot = scores[POT]
    if (pot["total"], pot["original_verdict"], pot["original_passed"]) != (
        len(pot_raw["gates"]), pot_raw["verdict"], sum(row["passed"] for row in pot_raw["gates"])
    ):
        raise ValueError("POT audit does not match its unmodified source")
    pot_audits = {(r["original"]["window"], r["original"]["season"], r["original"]["name"]): r["passed"] for r in pot["audits"]}
    pot_passes = sum(pot_audits.get((r["window"], r["season"], r["name"]), r["passed"]) for r in pot_raw["gates"])
    pot_verdict = "REVIEW" if pot_passes == pot["total"] else "HOLD"
    if (pot_passes, pot_verdict) != (pot["passed"], pot["result_by_written_rules"]):
        raise ValueError("Inconsistent POT audit")

    features = []
    if pot_verdict == "REVIEW":
        features.append("openingPot")
    if quality["verdict"] == "REVIEW":
        features.append("draftAlignment")
    return dict(growth_base=base, optional=features, source_runs=launches,
                receipt_sha256={run: sha256(path.read_bytes()).hexdigest() for run, path in stage_paths.items()},
                **(matrix(base, features) if features else {"include": []}))


def build(archive):
    full = build_full(archive)
    expected = {(r["start"], r["seed"], r["arm"], r["years"]) for r in full["include"]}
    root, launch = identity(archive, COMBINATION, "combo", expected)
    score_path = root / "combo_score/receipt.json"
    score = read(score_path)
    check_score(launch, score)
    if score["plan"] != full or score["verdict"] != "HOLD" or check_verdict(score["gates"]) != "HOLD":
        raise ValueError("Subtraction requires the frozen full combination HOLD")
    failed = [g for g in score["gates"] if not g["passed"]]
    if full["growth_base"] != "N" or set(full["optional"]) != {"openingPot", "draftAlignment"} or (
            {g["area"] for g in failed} != {"POT", "generated"} or
            not any(g["metric"] == "2025 rookies: T minus U" and g["value"] <= -.10 for g in failed) or
            not all(g["value"] > 0 for g in failed if g["area"] == "generated")):
        raise ValueError("Subtraction does not match the opportunity loss and positive generated outcomes specified in R164_MINUS_POT.md")
    for w, seed, arm, _ in sorted(expected):
        if (w, arm) != (2024, "T"):
            continue
        ledger = root / "cells" / f"r164-cell-{w}-{seed}-{arm}" / "classes.jsonl"
        aligned = [row["draft"] for line in ledger.read_text().splitlines()
                   if (row := json.loads(line))["alignment"]["pairs"] > 0]
        if not aligned or min(aligned) <= 2025:
            raise ValueError(f"{ledger}: cannot isolate the near-term opportunity loss from R")
    options = ["draftAlignment"]
    rerun = matrix("N", options)
    controls = [cell for cell in rerun["include"] if cell["arm"] in rerun["controls"]]
    rerun["include"] = [cell for cell in rerun["include"] if cell["arm"] == "T"]
    return dict(full, optional=options, **rerun, fresh_controls=dict(launch=launch, cells=controls),
                prior_combo_receipt_sha256=sha256(score_path.read_bytes()).hexdigest())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = build(args.archive)
    except FileNotFoundError as error:
        parser.exit(2, f"Missing completed inputs: {error}\n")
    rendered = json.dumps(result, indent=2) + "\n"
    if args.output:
        with args.output.open("x") as handle:
            handle.write(rendered)
    else:
        sys.stdout.write(rendered)


if __name__ == "__main__":
    main()
