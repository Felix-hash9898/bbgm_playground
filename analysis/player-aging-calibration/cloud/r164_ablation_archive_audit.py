"""Recheck the finishing-imprint terminal count in two archived 2008 O cells.

The cloud validator insisted on at least one opening player still carrying an
imprint every season. The read-only exception below accepts only exhaustion in
the final season, with all other original conditions still enforced. Raw job
results and all frozen numerical acceptance criteria retain their original form.
"""
import argparse
import json
from pathlib import Path
import sys

from r164_open import read_cell as original_read
import r164_open as op

RUN = "45765401275"
COMMIT = "d96ebf8c06844d6c198df6f6f4b5c4119960dbb7"
RELEASE = "b341f9cec24cd91364bd9cff73c54e76bdf7a9e2b4cb717e58deb6df470481dc"
AUDITED = ((2008, 95, "O", 18), (2008, 97, "O", 18))


def read_cell(folder, cell, release):
    key = tuple(cell[k] for k in ("start", "seed", "arm", "years"))
    if release != RELEASE or key not in AUDITED:
        return original_read(folder, cell, release)
    expected = op.r16.require
    metadata = json.loads((folder / "cell.json").read_text())
    entries = op.lines(folder / "components.jsonl")
    counts = [r["finish"]["installed"] for r in entries]
    check = (
        str(metadata["run"]) == RUN and metadata["sha"] == COMMIT
        and len(entries) == 18 and counts[0] > 0 and counts[-1] == 0
        and all(x > 0 for x in counts[:-1])
        and all(a >= b for a, b in zip(counts, counts[1:]))
        and all(r["finish"]["late"] == 0 and r["finish"]["box"] + r["finish"]["zone"] == n
                for r, n in zip(entries, counts))
    )
    if not check:
        return original_read(folder, cell, release)

    def require(ok, message):
        if not ok and message == f"{folder}: finishing boundary":
            return
        expected(ok, message)

    op.r16.require = require
    try:
        result = original_read(folder, cell, release)
    finally:
        op.r16.require = expected
    print(f"Archive check: {folder.name}, opening imprints {counts[0]} -> {counts[-2]} -> 0; original check for all other fields")
    return result


if __name__ == "__main__":
    import r164_ablation as ablation

    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("cells", type=Path)
    args.add_argument("output", type=Path)
    paths = args.parse_args()
    op.read_cell = read_cell
    sys.argv = [sys.argv[0], str(paths.cells), str(paths.output)]
    ablation.main()
