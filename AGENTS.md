# Local execution constraints

This workspace is used on a MacBook Air M1. Apply these limits to all work here:

- Run at most one Node/Vitest test or performance task at any time.
- Invoke Vitest with `--maxWorkers=1 --no-file-parallelism`.
- Run browser tests with exactly one browser engine at a time.
- Never run tests, builds, lint, or performance experiments concurrently with each other.
- Do not run long simulation batches. Use the smallest experiment sufficient to identify a bottleneck or validate a change.
- Preserve unrelated worktree changes and research files. Never modify the user's original league archive or push without explicit authorization.
