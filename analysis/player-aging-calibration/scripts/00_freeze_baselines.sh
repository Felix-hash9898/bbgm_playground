#!/bin/bash
# Freeze the comparison baselines: copy the growth-chain source files of the two verified commits
# into baselines/ (read-only snapshots) and write a manifest with SHA-256 hashes.
# Requires that both commits exist locally (`git fetch origin master; git fetch personal main`).
# Never touches the working tree outside analysis/player-aging-calibration/.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OFFICIAL=205d18eb03b44d5c4bf1a86b86969b0ef11f278b
PLAYGROUND=363bcbc6ded48db7d60e764ab69db10b272201e9
FILES="src/worker/core/player/developSeason.basketball.ts src/worker/core/player/developSeason.ts
src/worker/core/player/develop.ts src/worker/core/player/genRatings.basketball.ts
src/worker/core/player/ovr.basketball.ts src/worker/core/player/potEstimator.ts
src/worker/core/player/limitRating.ts src/worker/core/player/shouldRetire.ts
src/worker/core/player/value.ts src/common/budgetLevels.ts src/common/constants.basketball.ts
src/worker/core/player/fuzzRating.ts src/worker/core/player/genFuzz.ts
src/worker/core/phase/newPhasePreseason.ts src/worker/core/player/addRatingsRow.ts
src/worker/core/realRosters/getLeagueInfo.ts src/worker/core/player/heightToRating.ts"
cd "$REPO"
MB=$(git merge-base $OFFICIAL $PLAYGROUND)
out="$HERE/baselines/MANIFEST.txt"
mkdir -p "$HERE/baselines"
{
  echo "official   = $OFFICIAL ($(git log -1 --format='%ad %s' --date=short $OFFICIAL))"
  echo "playground = $PLAYGROUND ($(git log -1 --format='%ad %s' --date=short $PLAYGROUND))"
  echo "merge-base = $MB ($(git log -1 --format='%ad %s' --date=short $MB))"
  echo "local worktree HEAD = $(git rev-parse HEAD) (worktree src growth chain + GameSim == playground: $(git diff --quiet $PLAYGROUND -- src/worker/core/player src/worker/core/GameSim.basketball src/common/constants.basketball.ts src/worker/core/game && echo yes || echo NO))"
  echo
} > "$out"
for tag in official:$OFFICIAL playground:$PLAYGROUND mergebase:$MB; do
  name=${tag%%:*}; sha=${tag#*:}
  for f in $FILES; do
    dest="$HERE/baselines/$name/$f"
    mkdir -p "$(dirname "$dest")"
    if git cat-file -e "$sha:$f" 2>/dev/null; then
      git show "$sha:$f" > "$dest"
      echo "$name $(shasum -a 256 "$dest" | cut -c1-16) $f" >> "$out"
    else
      echo "$name MISSING $f" >> "$out"
    fi
  done
done
# Behavioural diffs of the growth function itself
git diff $MB $OFFICIAL -- src/worker/core/player/developSeason.basketball.ts src/worker/core/player/developSeason.ts src/worker/core/player/develop.ts src/worker/core/player/potEstimator.ts > "$HERE/baselines/diff_mergebase_to_official.patch"
git diff $MB $PLAYGROUND -- src/worker/core/player/developSeason.basketball.ts src/worker/core/player/developSeason.ts src/worker/core/player/develop.ts src/worker/core/player/potEstimator.ts > "$HERE/baselines/diff_mergebase_to_playground.patch"
git diff $OFFICIAL $PLAYGROUND -- src/worker/core/player/developSeason.basketball.ts > "$HERE/baselines/diff_official_to_playground_developSeason.patch"
echo "frozen -> $HERE/baselines"
