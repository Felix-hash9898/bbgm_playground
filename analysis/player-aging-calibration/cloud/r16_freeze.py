"""Verify, stage or list the exact file overlay that belongs on the isolated R16 ref."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

RESEARCH = Path("analysis/player-aging-calibration")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
FREEZE = "cloud/r16_freeze.json"
WORKFLOW = "cloud/aging-calibration-r16.yml"
ROUTE = Path(".github/workflows/aging-calibration-r16.yml")
BASE = "9644944a6e1efe0649bdd6388a95890dacfc10fc"
SOURCE_SCOPES = ("src", "data", "public", "tools", "package.json", "pnpm-lock.yaml", "tsconfig.json",
                 "vitest.config.ts", ".browserslistrc")
FILES = """
cloud/aging-calibration-r16.yml
cloud/r16_acceptance.py
cloud/r16_freeze.py
cloud/r16_matrix.json
cloud/run_r16_acceptance.sh
data/r16_nba_2026_box.csv
results/r5_era_fit.json
results/r5_mix_fit.json
results/r6_assist_fit.json
results/r6_foul_model.json
results/r6_usage_model.json
results/r6_usage_nba_fit.json
results/r7_drift_fit.json
scripts/125_r151_rating_replay_inputs.py
scripts/128_r151_replay_eval.py
scripts/133_r16_evaluate.py
sim/check_r13m_overlay.mjs
sim/fetchRealStats.ts
sim/formulas/candidate_specs.json
sim/formulas/candidates.ts
sim/formulas/official.developSeason.basketball.ts
sim/formulas/r4.ts
sim/formulas/r4_tendency.json
sim/formulas/r5.ts
sim/formulas/r5_arms.json
sim/formulas/v9.ts
sim/formulas/v9_specs.json
sim/full_league.test.ts
sim/r5.config.ts
sim/r5_inputs/era_mix_league.json
sim/r5_inputs/era_three_league.json
sim/r5_inputs/zone_history.json
sim/r5_inputs/zone_history_hist.json
sim/validate_full_output.mjs
sim/validate_gs_hooks.mjs
""".split()


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()


def checksum(f):
    return hashlib.sha256(f.read_bytes()).hexdigest()


def overlay_hashes(root):
    return {p: checksum(root / RESEARCH / p) for p in sorted(FILES)}


def source_verify(root, spec):
    actual = {p: git(root, "rev-parse", f"HEAD:{p}") for p in SOURCE_SCOPES}
    if actual != spec["source"]:
        raise ValueError(f"Wrong base engine, assets or config: {[p for p in actual if actual[p] != spec['source'][p]]}")
    if git(root, "status", "--porcelain", "--untracked-files=all", "--", *SOURCE_SCOPES):
        raise ValueError("Frozen source has local changes")


def install(target, spec):
    if target == ROOT or not (target / ".git").exists():
        raise ValueError("Use a separate clean worktree rooted at the frozen baseline")
    if git(target, "rev-parse", "HEAD") != BASE or git(target, "status", "--porcelain", "--untracked-files=all"):
        raise ValueError("Target must be clean and start exactly at the frozen baseline")
    source_verify(target, spec)
    for name in [*(RESEARCH / p for p in spec["overlay"]), RESEARCH / FREEZE]:
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, path)
    shutil.copyfile(ROOT / RESEARCH / WORKFLOW, target / ROUTE)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("record", "check-overlay", "verify", "install", "paths"))
    parser.add_argument("target", type=Path, nargs="?")
    args = parser.parse_args()
    path = ROOT / RESEARCH / FREEZE
    if args.command == "record":
        if path.exists():
            raise ValueError("Refusing to replace a published freeze manifest")
        source = {p: git(ROOT, "rev-parse", f"{BASE}:{p}") for p in SOURCE_SCOPES}
        path.write_text(json.dumps(dict(base=BASE, source=source, overlay=overlay_hashes(ROOT)), indent=2) + "\n")
    spec = json.loads(path.read_text())
    if spec["base"] != BASE or spec["overlay"] != overlay_hashes(ROOT):
        raise ValueError("Overlay does not match the frozen candidate")
    if args.command == "verify":
        source_verify(ROOT, spec)
        if checksum(ROOT / ROUTE) != spec["overlay"][WORKFLOW]:
            raise ValueError("Workflow differs from research mirror")
    if args.command == "install":
        if not args.target:
            parser.error("install requires a target worktree")
        install(args.target.resolve(), spec)
    if args.command == "paths":
        names = [*(RESEARCH / p for p in spec["overlay"]), RESEARCH / FREEZE, ROUTE]
        for name in names:
            print(name)
    else:
        print(checksum(path))


if __name__ == "__main__":
    main()
