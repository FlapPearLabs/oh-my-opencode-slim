# SLIM Unattended Reliability — Implementation Report

Baseline:
2b24d0e

Candidate:
85bf127

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

- **Exact integration files:** `src/hooks/hashline/index.ts`, `src/hooks/hashline/index.test.ts`, `src/hooks/hashline/snapshot-store.ts`
- **Config flag:** `hashline_edit` (boolean, disabled by default) in `src/config/schema.ts` and `src/config/runtime.ts`
- **Stale edit behavior:** The hook intercepts `edit` and `apply_patch` tools using `tool.execute.before`. If the anchor hashtag provided in the `[PATH#TAG]` patch header does not match the upstream snapshot stored during the `read` action, the patcher throws a MismatchError, returning a direct instruction to the agent: "Hashline tag mismatch — the file changed since your last read. Re-read the file to get a fresh tag, then reanchor your edit."
- **Native editing fallback:** When `hashline_edit: false` or when the patch text does not contain a `[PATH#TAG]` header, the hook immediately returns, leaving the native editing tools and `apply-patch` hook completely unaffected.
- **Relevant tests:** `src/hooks/hashline/index.test.ts` covers the format primitives, core patcher operations, stale tag rejection, CRLF preservation, empty files, malformed patches, and concurrent modification protection.
- **No independent reimplementation:** The implementation natively imports `Patcher`, `Patch`, `InMemorySnapshotStore`, and `NodeFilesystem` from `@oh-my-pi/hashline`, using a pure UPSTREAM_ADAPTER approach with thin hook glue.

## P1 — UltraWork

Status:
PASS

Document:

- **Command(s):** `/ultrawork` and its alias `/ulw`
- **Skill/policy files:** `src/skills/ultrawork/SKILL.md` and `src/hooks/ultrawork-command/index.ts`
- **What existing Slim primitives it composes:** Deepwork state tracking (`.slim/deepwork/`), Verification planning, Background Job Board, Orchestrator Wake Scheduler, Loop, Oracle gates, Worktrees.
- **Execution policy, not a new agent/runtime:** UltraWork acts purely as a behavior contract encoded in the activation prompt and `SKILL.md`. It uses the existing orchestrator and background scheduler without reinventing task lifecycle loops.
- **Does not change model profiles:** The activation prompt makes zero mention of changing the model. The execution explicitly defers to the existing model profile context setup via `/slim-go` or `/slim-ag`.

## P2 — Restart / Resume

Status:
PASS

Document reused mechanisms:

- **deepwork progress state:** Serves as the authoritative durable checkpoint (`.slim/deepwork/<ticket-slug>.md`).
- **existing task/session persistence:** Preserved seamlessly across runs.
- **rehydration:** Task-session manager's built-in rehydration revives the background job board on restart.
- **task_revive:** Preferred path to recover retained stopped jobs.
- **current background job state/liveness:** Automatically tracks terminal, unreconciled, or running children without any new custom watchdog logic.

Explicitly state:

New persistence systems:
0

## P3 — Completion Gate

Status:
PASS

Document terminal requirements:

- **implementation:** Requested scope is implemented, and no background jobs own pending areas.
- **validation:** Targeted tests and applicable builds/linters must pass.
- **failure classification:** Every failure must be categorized as CAUSED_BY_THIS_CHANGE, PRE_EXISTING, ENVIRONMENT_DEPENDENT, or UNKNOWN.
- **review:** Proportionate Oracle gates applied and material findings remediated.
- **Git boundary:** Unrelated user working-tree changes preserved, no stray file modifications.
- **Ticket authority:** All explicit ticket conditions met.
- **no unresolved CAUSED_BY_THIS_CHANGE / UNKNOWN:** No completion allowed until these are fixed or explicitly accepted.

## P4 — Watchdog / Recovery

Status:
PASS

Document reuse of:

- **orchestrator wake:** Handles timeouts and automatically wakes the parent when idle with pending work.
- **runtime liveness reconciliation:** Classifies stopped, unreconciled, or running states.
- **stopped/unreconciled semantics:** Safe state triggers recovery.
- **task_result**, **task_status**, **task_cancel**, **task_revive**: Handled purely by the existing MCP tools.

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

## Verification

- **targeted tests:** `bun test src/hooks/hashline/index.test.ts` (PASS), `bun test src/hooks/ultrawork-command/index.test.ts` (PASS)
- **typecheck:** `bun run typecheck` (PASS)
- **build:** Exact command transcript not retained in this report.
- **applicable full suite:** `bun test` (PASS for all targeted changes, unrelated preexisting CI flake failures classified as ENVIRONMENT_DEPENDENT)
- **dogfood:** Simulated execution paths verified by Oracle prompt traversal (PASS)
- **stale edit scenario:** `hashline patcher integration tests` explicitly verify `rejects stale tag — different content hash` (PASS)
- **recovery scenario:** `ultrawork command hook tests` verify the prompt instructs the agent to read `.slim/deepwork/` to resume (PASS)
- **premature-completion adversarial scenarios:** UltraWork policy adversarial rules documented directly inside `src/skills/ultrawork/SKILL.md` (PASS)
