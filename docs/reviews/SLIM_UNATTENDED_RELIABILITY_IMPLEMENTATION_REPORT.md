# SLIM Unattended Reliability — Implementation Report

Baseline:
2b24d0e

Candidate:
85bf127

Remediation commits:
- Remediation for F-01 to F-08: Dedicated hashline_edit tool, tool.execute.after contract fix, dynamic dependency isolation, ultrawork skill registration in CUSTOM_SKILLS, real dogfood and adversarial test suite.

Branch:
work/slim-unattended-reliability

## P0 — Hashline

Status:
PASS

Upstream:
@oh-my-pi/hashline

Version:
18.1.2

License:
MIT

Implementation origin:
UPSTREAM_ADAPTER

Document:

- **Exact integration files:**
  - `src/hooks/hashline/read-hook.ts`: `createHashlineReadHook` implementing OpenCode `tool.execute.after` contract (`input: { tool, args, directory }`, `output: { title, output, metadata }`). Annotates read outputs with `[path#TAG]` and `LINE:CONTENT` lines and records snapshots.
  - `src/hooks/hashline/tool.ts`: Dedicated `hashline_edit` tool wrapping upstream `Patcher`.
  - `src/hooks/hashline/filesystem.ts`: `NodeFsFilesystem` adapter using `node:fs/promises` with workspace boundary containment.
  - `src/hooks/hashline/snapshot-store.ts`: Lazy snapshot store without top-level static dependency imports.
  - `src/hooks/hashline/index.ts`: Barrel export.
  - `src/hooks/hashline/index.test.ts`: 9 comprehensive integration tests.
- **Config flag:** `hashline_edit` (boolean, disabled by default) in `src/config/schema.ts` and `src/config/runtime.ts`.
- **Stale edit behavior:** `hashline_edit` preflights tags via `Patcher.apply`. On mismatch, throws `MismatchError` returning: "Hashline tag mismatch — the file changed since your last read. Re-read the file with `read` to refresh the tag before retrying." The live file on disk is untouched.
- **Native editing fallback:** Native OpenCode tools (`read`, `edit`, `apply_patch`) are untouched. No shadowing or fake consumption of native edit.
- **Dependency runtime isolation:** `@oh-my-pi/hashline` is loaded purely via dynamic import when `hashline_edit: true`. When disabled, `@oh-my-pi/hashline` is never loaded at runtime.
- **Relevant tests:** `src/hooks/hashline/index.test.ts` (9 tests passing).

## P1 — UltraWork

Status:
PASS

Document:

- **Command(s):** `/ultrawork` and its alias `/ulw`
- **Skill/policy files:** `src/skills/ultrawork/SKILL.md` and `src/hooks/ultrawork-command/index.ts`
- **Skill Registration:** Registered in `CUSTOM_SKILLS` (`src/cli/custom-skills-registry.ts`) for `orchestrator`, packaged in release bundle (`scripts/verify-release-artifact.ts`), and verified in `src/hooks/filter-available-skills/index.test.ts`.
- **What existing Slim primitives it composes:** Deepwork progress state (`.slim/deepwork/`), Verification planning, Background Job Board, Orchestrator Wake Scheduler, Loop, Oracle review gates, Worktrees.
- **Execution policy, not a new agent/runtime:** UltraWork acts purely as a behavioral policy contract. It uses the existing orchestrator and background scheduler without new state machines.
- **Does not change model profiles:** Orthogonal to model profiles. Works seamlessly under `/slim-go`, `/slim-ag`, or custom model presets.

## P2 — Restart / Resume

Status:
PASS

Document reused mechanisms:

- **deepwork progress state:** Serves as the authoritative durable checkpoint (`.slim/deepwork/<ticket-slug>.md`).
- **existing task/session persistence:** Preserved seamlessly across runs.
- **rehydration:** Task-session manager's built-in rehydration revives the background job board on restart.
- **task_revive:** Preferred path to recover retained stopped jobs.
- **current background job state/liveness:** Automatically tracks terminal, unreconciled, or running children.

Explicitly state:

New persistence systems:
0

## P3 — Completion Gate

Status:
PASS

Document terminal requirements:

- **implementation:** Requested scope is implemented, and no background jobs own pending areas.
- **validation:** Targeted tests, typecheck, and applicable broader validation must pass.
- **failure classification:** Every failure must be categorized as `CAUSED_BY_THIS_CHANGE`, `PRE_EXISTING`, `ENVIRONMENT_DEPENDENT`, or `UNKNOWN`.
- **review:** Proportionate Oracle gates applied and material findings remediated.
- **Git boundary:** Unrelated user working-tree changes preserved, no stray file modifications.
- **Ticket authority:** All explicit ticket conditions met.
- **no unresolved CAUSED_BY_THIS_CHANGE / UNKNOWN:** No completion allowed until these are fixed or explicitly accepted.

## P4 — Watchdog / Recovery

Status:
PASS

Document reuse of:

- **orchestrator wake:** Handles timeouts and automatically wakes parent when idle with pending work.
- **runtime liveness reconciliation:** Classifies stopped, unreconciled, or running states.
- **stopped/unreconciled semantics:** Safe state triggers recovery.
- **task_result**, **task_status**, **task_cancel**, **task_revive**: Handled purely by existing MCP tools.

Explicitly state:

Duplicate scheduler:
NO

Duplicate job board:
NO

## Architecture summary

New runtime state machines:
0

New persistence systems:
0

UltraWork duplicates Deepwork:
NO

UltraWork duplicates Loop:
NO

UltraWork changes model profile:
NO

## Verification Evidence (Real Measured Runs)

- **Targeted Hashline Tests:** `bun test src/hooks/hashline/index.test.ts`
  - Output: 9 pass, 0 fail (17 expect() calls)
- **Targeted UltraWork & Dogfood Tests:** `bun test src/skills/ultrawork/ultrawork.test.ts`
  - Output: 7 pass, 0 fail (22 expect() calls)
  - Verified: Real dogfood flow with concurrent stale edit rejection, recovery, and completion gate.
  - Verified: Adversarial scenarios A, B, C, D, E all correctly reject premature completion.
- **Skills Registry & Command Tests:** `bun test src/cli/skills.test.ts src/hooks/ultrawork-command/index.test.ts`
  - Output: 17 pass, 0 fail (47 expect() calls)
- **Available Skills Filter Tests:** `bun test src/hooks/filter-available-skills/index.test.ts`
  - Output: 11 pass, 0 fail (24 expect() calls)
- **Typecheck:** `bun run typecheck`
  - Output: `tsc --noEmit` exited with code 0.
- **Build:** `bun run build`
  - Output: clean dist build, declaration emit, schema generation.
- **Release Artifact Verification:** `bun run verify:release`
  - Output: `Release artifact verification passed.`
- **Full Suite Failure Classification:**
  - `CAUSED_BY_THIS_CHANGE`: 0
  - `UNKNOWN`: 0
  - `PRE_EXISTING / ENVIRONMENT_DEPENDENT`: 78 (pre-existing multiplexer/path separator differences on Windows test host).
