# Evaluations

Test orchestrator routing and quality without running the full model.

## How It Works

Two-step process: collect outputs, then score them.

## Step 1: Collect Outputs (Interactive)

```bash
bun run collect --suite orchestrator-routing --out /tmp/outputs.json
```

This shows each eval prompt. For each one:
1. Copy the prompt into a fresh OpenCode session
2. Get the response
3. Paste it back
4. End with `.` on its own line

The collect CLI generates the outputs file that eval needs.

## Step 2: Score Them

```bun run eval --suite orchestrator-routing --outputs-file /tmp/outputs.json
```

## Available Suites

- `orchestrator-routing` — Does the orchestrator route to the right agent?
- `fixer-execution` — Does the fixer produce correct output?

## Precheck

Validate eval suites before running:

```bash
bun run precheck
```

## Notes

- You can't run eval without first running collect (or manually creating the JSON file)
- Results are saved to `src/evals/results/`
