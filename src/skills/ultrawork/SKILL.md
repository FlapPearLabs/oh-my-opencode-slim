---
name: ultrawork
description: Fully autonomous, unattended Ticket execution with completion gate, durable resume, and evidence-based DONE. Use for Tickets that should run to completion without user supervision. Composes deepwork, verification-planning, background orchestration, oracle gates, and the orchestrator wake scheduler.
---

# UltraWork

UltraWork is an execution policy for fully autonomous, unattended Ticket
execution. It composes existing Slim primitives — it is not a new runtime,
not a new background scheduler, not a new task manager.

**When to use:**
- A Ticket that should run to completion without requiring user supervision.
- Long unattended coding runs spanning multiple phases and specialists.
- When a human-supervised deepwork session would otherwise be needed but the
  user wants to delegate the entire Ticket autonomously.

**When NOT to use:**
- Interactive exploratory work where the user wants to guide each step.
- Simple single-file edits or trivial bug fixes (use deepwork or direct).
- Anything requiring genuine product decisions that cannot be derived from
  repository authority.

---

## Orthogonality

UltraWork is an **execution policy**. It composes with any model profile:

```
/slim-go + /ultrawork   — valid
/slim-ag + /ultrawork   — valid
/deepwork <task>        — supervised; UltraWork is the unsupervised complement
```

UltraWork does NOT select or change model profiles. Profile is set before
starting.

---

## Composition Model

```
/ultrawork <ticket>
       ↓
check .slim/deepwork/ for existing resume artifact
       ↓
run verification-planning (evidence path before implementation)
       ↓
plan dependency graph + specialist ownership
       ↓
background orchestration (Explorer/Librarian reconnaissance as needed)
       ↓
Fixer implementation lanes (background, ownership-tracked)
       ↓
hook-driven background completion
       ↓
reconcile results
       ↓
validation (targeted first, broader only when risk warrants)
       ↓
Oracle gate (proportionate, not automatic)
       ↓
bounded remediation if findings require it
       ↓
completion gate (all required checks pass)
       ↓
DONE
```

Do not invoke every specialist on every Ticket. Use risk-based routing:
- Explorer/Librarian: when the codebase or API is unfamiliar.
- Oracle: after each implementation phase, or when material risk warrants it.
- Council: only for critical trade-offs where disagreement is useful.
- Worktrees: only when isolated lane work is justified by risk.

---

## Durable Progress — Checkpoint / Resume

UltraWork always maintains a progress artifact for restart safety.

### Setup (before any planning or delegation)

1. Inspect `.gitignore` and `.ignore`. Add only missing entries:
   - `.gitignore`: must contain `.slim/deepwork/`
   - `.ignore`: must contain `!.slim/deepwork/` and `!.slim/deepwork/**`

2. Check `.slim/deepwork/` for an existing progress file for this Ticket.
   - If one exists: **read it first** and resume from the last recorded state.
   - If none: create `.slim/deepwork/<ticket-slug>.md`.

3. Keep the progress artifact updated after every major decision, phase
   completion, validation result, and scope change.

### On restart / re-entry

When UltraWork is resumed after an interruption:

1. Read `.slim/deepwork/<ticket-slug>.md` — this is the authoritative resume artifact.
2. Background job board rehydration happens automatically (the plugin rehydrates
   historical running tasks from message history on restart).
3. For each background job, classify its current state:

   | State | Action |
   |-------|--------|
   | `completed` | Consume terminal result; mark phase done in progress artifact. |
   | `running` (live busy) | Wait for hook-driven completion; continue independent work. |
   | `stopped, unreconciled` | Inspect partial state (Git/files); revive via `task_revive` when safe, or reroute. |
   | `failed` (terminal error) | Inspect cause; retry with bounded strategy or reroute. |
   | `cancelled` | Check retained session; revive or dispatch fresh work. |
   | `status uncertain` | Do not treat as completion; re-check or wait. |
   | `needs-verification` | Phase not marked complete in progress artifact; re-validate before advancing. |

4. **Never treat missing child, idle child, or status lookup failure as proof
   of successful completion.** Only explicit terminal task output proves
   completed/error/cancelled state.

5. Prefer `task_revive` over re-dispatching fresh tasks for stopped retained
   sessions to preserve session context and avoid duplicate work.

---

## Scheduler Discipline

Follow the background-orchestration scheduler model throughout:

- Record task/session IDs and ownership boundaries in the progress artifact.
- Only one writer owns a file at a time.
- Do not advance to the next phase while relevant jobs are running or terminal
  results are unreconciled.
- Continue only independent coordination work while waiting for background
  specialists.
- Reuse accepted evidence; do not re-scan the whole repository per wake.
- Do not respawn identical work before consuming existing results.

---

## Autonomy Contract

UltraWork continues autonomously unless one of these explicit stop conditions
is reached:

| Stop condition | Meaning |
|----------------|---------|
| `DONE` | All completion gates pass. |
| `BLOCKED_BY_USER` | A genuine human decision is required that cannot be derived from repository authority, OpenCode APIs, upstream docs, or tests. |
| `BLOCKED_BY_EXTERNAL_AUTHORITY` | An external system (CI, reviewer, external service) is blocking and cannot be unblocked autonomously. |
| `UNSAFE_TO_CONTINUE` | Continuing would cause irreversible harm (credential mutation, production data loss, scope creep beyond Ticket). |

**UltraWork must NOT stop merely because:**
- One implementation pass completed.
- A fixer returned success.
- Targeted tests passed but required broader validation remains.
- An Oracle produced findings (remediate, then continue).
- A background task errored once (diagnose, retry/reroute, continue).
- A model/provider transiently failed (foreground fallback handles this).
- One approach failed (try alternative; only stop after genuine budget exhaustion).
- Context became inconvenient.

When a subtask fails: diagnose → inspect partial state → retry/revive/reroute
when justified → continue. Do not stop to report an intermediate failure.

---

## Resource Discipline

Efficiency rules:
- Parallelize only truly independent work.
- One writer per file at a time.
- Use Explorer/Librarian read-only lanes for reconnaissance; avoid re-scanning.
- Avoid repeated Oracle calls with unchanged evidence.
- Reuse accepted research; record it in the progress artifact.
- Reuse child sessions via `task_revive` where appropriate.
- Use cheap faithful verification (typecheck, targeted tests) before expensive
  review (full suite, Oracle).
- Do not invoke Council unless a genuine trade-off requires multi-model judgment.

---

## Completion Gate (P3)

UltraWork may report DONE only after all applicable gates pass:

### IMPLEMENTATION gate
- [ ] Requested scope is implemented.
- [ ] No known owned TODO is incomplete.
- [ ] No unreconciled background job with owned scope.

### VALIDATION gate
- [ ] Targeted tests for the changed behavior pass.
- [ ] Typecheck / build / lint pass where applicable.
- [ ] Broader test suite run based on repository authority (not universally —
      use the project's own verification plan).

### FAILURE CLASSIFICATION gate
Every failing check must be classified as:

| Classification | Blocks DONE? |
|----------------|-------------|
| `CAUSED_BY_THIS_CHANGE` | **YES** — must fix or explicitly accept by authority |
| `PRE_EXISTING` | No — document and proceed |
| `ENVIRONMENT_DEPENDENT` | No — document reason |
| `UNKNOWN` | **YES** — must investigate before DONE |

UltraWork may not report DONE while `CAUSED_BY_THIS_CHANGE` or `UNKNOWN`
failures remain unresolved unless repository authority explicitly permits it.

### REVIEW gate
- [ ] Proportionate code review completed (Oracle gate after each phase).
- [ ] Material findings remediated or explicitly accepted by authority.

### GIT BOUNDARY gate
- [ ] Only intended files are staged/committed.
- [ ] Pre-existing user working-tree changes are preserved and unstaged.
- [ ] Credentials and provider state are untouched unless Ticket explicitly owns them.

### TICKET AUTHORITY gate
- [ ] All acceptance criteria from the Ticket are satisfied.
- [ ] `blocked_by` constraints are respected.
- [ ] No downstream Ticket was silently implemented.

---

## Relationship to Other Primitives

| Primitive | Role in UltraWork |
|-----------|-------------------|
| `deepwork` | Provides the progress artifact, phased execution model, and Oracle gate discipline. UltraWork uses it as a component. |
| `verification-planning` | Provides the evidence path before implementation. UltraWork runs it first. |
| `loop` | UltraWork can invoke `/loop` for bounded execute-verify cycles within a phase. |
| Background orchestration | The scheduler model UltraWork operates within. |
| Orchestrator wake | Fires automatically when parent is idle with incomplete TODOs. UltraWork inherits this. |
| `worktrees` | Used when isolated lane work is justified. UltraWork coordinates lane lifecycle. |
| Oracle | Risk-based review gate. Not automatic — only when material risk or uncertainty warrants. |
| `task_revive` | Preferred over fresh spawn for stopped retained sessions. |

---

## Oracle Gate Protocol

Every planned implementation phase should have an Oracle gate declared before
execution. Use the deepwork Oracle gate protocol:

- Batch material findings into one bounded remediation pass.
- Re-review only when remediation changes the reviewed decision/risk.
- Track attempt count (e.g., "Gate 2 — review attempt 1 of 3").
- After two re-reviews, record remaining risk in the progress artifact and
  surface it to the user unless authority explicitly permits proceeding.

---

## Watchdog Awareness

The orchestrator wake scheduler fires automatically after continuous idle time
with incomplete TODOs (default: 5-minute interval). UltraWork inherits this
watchdog behavior without additional configuration.

When woken by the scheduler:
- Check Background Job Board for stopped/unreconciled jobs first.
- Inspect partial state (Git/files) before deciding to revive or reroute.
- Do not cancel a running child merely because it is slow.
- Prefer `task_revive` over fresh spawn when a retained session exists.
- Use the stopped-job wake text as a signal to recover, not to abort.

---

## Progress Artifact Format

The `.slim/deepwork/<ticket-slug>.md` file should capture (adapt as needed):

```markdown
# UltraWork: <ticket-slug>

## Ticket
<original ticket text>

## Status
<current phase, last updated>

## Evidence Path
<output of verification-planning>

## Phases
- [ ] Phase 1: <name> — <status>
  - Specialist: <agent>
  - Ownership: <files/subsystems>
  - Oracle gate: <planned/done>
- [ ] Phase 2: ...

## Background Jobs
| Task ID | Agent | Objective | State |
|---------|-------|-----------|-------|
| ...     | ...   | ...       | ...   |

## Validation Results
<targeted tests, typecheck, broader suite>

## Failure Classification
<table of failures with CAUSED_BY_THIS_CHANGE / PRE_EXISTING / etc.>

## Oracle Findings
<gate results, remediation status>

## Completion Gate Status
- [ ] IMPLEMENTATION
- [ ] VALIDATION
- [ ] FAILURE_CLASSIFICATION
- [ ] REVIEW
- [ ] GIT_BOUNDARY
- [ ] TICKET_AUTHORITY

## Blockers / Open Questions
<anything requiring human decision>
```

---

## Safety Defaults

- Never stage or modify pre-existing user working-tree changes.
- Never mutate credentials, provider state, or session auth unless the Ticket
  explicitly owns them.
- Never implement downstream Tickets silently.
- Ask the user only for genuine authority/product decisions that cannot be
  derived from repository authority, existing tests, upstream docs, or
  OpenCode APIs.
