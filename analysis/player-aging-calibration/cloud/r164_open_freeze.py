"""Install or verify the R16.4 research overlay on the frozen R16 engine (9644944a6 + R16 overlay)."""
import argparse
import json
import shutil
from pathlib import Path

from r16_freeze import BASE, RESEARCH, ROOT, checksum, git, source_verify

FROZEN_R16 = "9e932c89ebcbb5386fb257e75a6032e3864e43014eb25e13b52d4a7278cdde29"
FOLDER = ROOT / RESEARCH
MANIFEST = "cloud/r164_open_freeze.json"
WORKFLOW = "cloud/aging-calibration-r164-open.yml"
ROUTE = Path(".github/workflows/aging-calibration-r164-open.yml")
FILES = (
    WORKFLOW, "cloud/r164_open.py", "cloud/r164_open_matrix.json", "cloud/r164_open_freeze.py", "cloud/run_r164_open.sh",
    "cloud/r164_long.py", "scripts/147_r164_open_review.py", "scripts/149_r164_career_acceptance.py", "scripts/152_r164_long.py",
    "sim/r164.config.ts", "sim/r164_contract.ts", "sim/r164_finishing.ts", "sim/r164_rookies.ts", "sim/r164_runtime.ts", "sim/r164_style.ts", "sim/r164_growth.ts", "sim/r164_prospects.ts", "cloud/r164_succession.py", "sim/r164_classes.ts", "cloud/r164_classes.py", "cloud/r164_replication.py", "cloud/r164_growth_score.py", "scripts/156_r164_growth_audit.py",
    "sim/r163_market.ts", "sim/r163_style.ts",
)


def expected():
    return {"base": BASE, "r16_freeze": FROZEN_R16, "files": {f: checksum(FOLDER / f) for f in FILES}}


def digest():
    if json.loads((FOLDER / MANIFEST).read_text()) != expected():
        raise ValueError("R16.4 overlay differs from its freeze manifest")
    return checksum(FOLDER / MANIFEST)


def verify_engine(target):
    path = target / RESEARCH / "cloud/r16_freeze.json"
    if checksum(path) != FROZEN_R16:
        raise ValueError("Wrong R16 freeze")
    spec = json.loads(path.read_text())
    source_verify(target, spec)
    if any(checksum(target / RESEARCH / f) != sig for f, sig in spec["overlay"].items()):
        raise ValueError("A frozen R16 research input was changed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("record", "check", "verify", "install", "paths"))
    parser.add_argument("target", type=Path, nargs="?")
    args = parser.parse_args()
    if args.action == "record":
        (FOLDER / MANIFEST).write_text(json.dumps(expected(), indent=2) + "\n")
    freeze = digest()
    if args.action == "paths":
        print(*(str(RESEARCH / f) for f in (*FILES, MANIFEST)), ROUTE, sep="\n")
        return
    if args.action == "verify":
        verify_engine(ROOT)
        if checksum(ROOT / ROUTE) != checksum(FOLDER / WORKFLOW):
            raise ValueError("Installed workflow differs from the research mirror")
    if args.action == "install":
        target = args.target.resolve()
        if target == ROOT or not (target / ".git").exists():
            raise ValueError("Install only into a separate checkout that already has the R16 overlay")
        verify_engine(target)
        for f in (*FILES, MANIFEST):
            dest = target / RESEARCH / f
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(FOLDER / f, dest)
        (target / ROUTE).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(FOLDER / WORKFLOW, target / ROUTE)
    print(freeze)


if __name__ == "__main__":
    main()
