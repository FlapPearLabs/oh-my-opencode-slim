---
name: evaluate
description: Run the eval suite to verify orchestrator routing and progressive disclosure quality
---

# Eval Suite

## Run

```bash
# Validate eval cases before running
bun run precheck

# Run with default suite
bun run collect --out /tmp/outputs.json
bun run eval --outputs-file /tmp/outputs.json

# Or specify suite explicitly
bun run collect --suite orchestrator-routing --out /tmp/outputs.json

# Run evals against collected outputs
bun run eval --suite orchestrator-routing --outputs-file /tmp/outputs.json
```

## What it tests

- **Routing decisions**: Does the orchestrator route to the right agent? (trivial edits → direct, UI → @designer, multi-file → @fixer, architecture → @oracle, research → @librarian)
- **Progressive disclosure**: Does the agent read reference files when triggering skills? (reflect, clonedeps, verification-planning, deepwork)

## How to read

- Pass rate per eval case (0-100%)
- Per-assertion breakdown (which assertions passed/failed)
- Results saved to `src/evals/results/`

## Notes

- `references_read` assertion uses `referenceContent` — a unique string from the reference file. This verifies the agent actually read the file, not just mentioned "references/".
- The `collect` CLI interactively gathers agent outputs. The `eval` CLI scores them.
- No CI integration yet — run manually before merge to catch regressions.