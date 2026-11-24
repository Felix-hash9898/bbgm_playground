"""Install or validate the small R16.1 research overlay on the exact frozen engine."""
import argparse
import json
import shutil
from pathlib import Path

from r16_freeze import RESEARCH, ROOT, ROUTE as R16_WORKFLOW_ROUTE, checksum, git, source_verify

BASE = "cc51ae02a80d4f3d6f9e1039a5858f929c7a53b6"
FROZEN_R16 = "9e932c89ebcbb5386fb257e75a6032e3864e43014eb25e13b52d4a7278cdde29"
FOLDER = ROOT / RESEARCH
MANIFEST = "cloud/r161_open_freeze.json"
WORKFLOW = "cloud/aging-calibration-r161-open.yml"
ROUTE = Path(".github/workflows/aging-calibration-r161-open.yml")
FILES = (
    WORKFLOW, "cloud/r161_open.py", "cloud/r161_open_matrix.json", "cloud/r161_open_freeze.py",
    "cloud/run_r161_open.sh", "sim/r161.config.ts", "sim/r161_market.ts",
    "sim/r161_market_trace.ts", "sim/r161_open_output.ts", "sim/r161_style.ts",
)


def digest():
    manifest = FOLDER / MANIFEST
    expected = {"base": BASE, "r16_freeze": FROZEN_R16,
                "files": {f: checksum(FOLDER / f) for f in FILES}}
    if json.loads(manifest.read_text()) != expected:
        raise ValueError("R16.1 overlay differs from its freeze manifest")
    return checksum(manifest)


def verify_engine(target):
    path = target / RESEARCH / "cloud/r16_freeze.json"
    if checksum(path) != FROZEN_R16:
        raise ValueError("Wrong R16 freeze")
    spec = json.loads(path.read_text())
    source_verify(target, spec)
    if any(checksum(target / RESEARCH / f) != sig for f, sig in spec["overlay"].items()) or \
            checksum(target / R16_WORKFLOW_ROUTE) != spec["overlay"]["cloud/aging-calibration-r16.yml"]:
        raise ValueError("A frozen R16 research input was changed")
    if git(target, "rev-parse", "HEAD") != BASE and git(target, "rev-parse", "HEAD^") != BASE:
        raise ValueError("Use the exact R16 SHA or its single research child commit")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "verify", "install", "paths"))
    parser.add_argument("target", type=Path, nargs="?")
    args = parser.parse_args()
    freeze = digest()
    paths = [RESEARCH / f for f in (*FILES, MANIFEST)]
    if args.action == "paths":
        print(*(str(p) for p in [*paths, ROUTE]), sep="\n")
        return
    if args.action == "verify":
        verify_engine(ROOT)
        if checksum(ROOT / ROUTE) != checksum(FOLDER / WORKFLOW):
            raise ValueError("Installed workflow differs from the research mirror")
        if git(ROOT, "rev-parse", "HEAD") != BASE:
            diff = set(git(ROOT, "diff", "--name-only", "HEAD^", "HEAD").splitlines())
            if diff != {str(p) for p in [*paths, ROUTE]}:
                raise ValueError("The research child must contain exactly the release paths")
    if args.action == "install":
        if not args.target:
            parser.error("install requires a separate clean checkout")
        target = args.target.resolve()
        if target == ROOT or not (target / ".git").exists() or git(target, "rev-parse", "HEAD") != BASE \
                or git(target, "status", "--porcelain", "--untracked-files=all"):
            raise ValueError("Install only into a separate clean checkout of the exact R16 commit")
        verify_engine(target)
        for path in [*paths, ROUTE]:
            source = ROOT / path if path != ROUTE else FOLDER / WORKFLOW
            dest = target / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
    print(freeze)


if __name__ == "__main__":
    main()
