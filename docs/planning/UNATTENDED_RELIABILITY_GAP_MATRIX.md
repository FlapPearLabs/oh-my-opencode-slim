# Unattended Reliability Gap Matrix

Baseline: `2b24d0e` — fix: preserve model overrides across slim profiles
Branch: `work/slim-unattended-reliability`
Analysis date: 2026-09-02
Method: runtime-code + test tracing (docs alone not trusted); upstream package
installed and executed, not assumed.

---

## How to read this matrix

Each P0-P4 capability is classified as one of:

- **ALREADY_IMPLEMENTED** — production-grade runtime code exists; reuse directly.
- **PARTIALLY_IMPLEMENTED** — mechanism exists; needs thin glue/policy wiring.
- **MISSING** — needs new code (justified below).
- **NOT_NEEDED** — requirement does not apply, or is satisfied by composing
  existing architecture.

---

## P0 — Hash-Anchored Editing / Stale Edit Protection

### Capability: content-hash anchored edits with stale-anchor rejection

**Existing implementation:** None. No hash anchoring anywhere in `src/`.
`.out-of-scope/hashline.md` formally records this as out of scope
(issue #141, closed wontfix) on the grounds that it would require wrapping
OpenCode's core `read`/`edit` tools.

**Evidence:**
- `.out-of-scope/hashline.md:15-20` — "It belongs in OpenCode core itself or a
  dedicated standalone plugin, not in oh-my-opencode-slim."
- `src/hooks/apply-patch/index.ts` — mature fuzzy patch rescue
  (`rewritePatch`, prefix/suffix + `lcsRescue`). Rescues *ambiguity*; does
  **not** detect *staleness*. A file modified after read is silently accepted.
- `src/tools/index.ts:1-10` — plugin registers only additive tools; no
  `read`/`edit`/`write` wrapper exists.

**Classification: MISSING**

**Reuse plan:** Do not reimplement. Adapt `@oh-my-pi/hashline`. Also reuse the
existing `apply-patch` fuzzy-rescue path as the fallback when hashline is
disabled or unavailable — do not replace it.

**Missing seam:** Two narrow, cache-safe seams (both already precedented in
this repo):
1. `tool.execute.after` on `read` → append `[path#TAG]`. Precedent:
   `src/hooks/json-error-recovery/hook.ts:53-68` already mutates
   `output.output` in `tool.execute.after`.
2. A dedicated `hashline_edit` tool wrapping `Patcher`. Do **not** shadow the
   native `edit` tool — shadowing would break
   `HEALTH_CHECK.minTools`/`BASELINE_TOOL_NAMES` (`src/health-check.ts:16-32`)
   and violates "must not destroy native OpenCode editing".

### Upstream verification (measured, not assumed)

| Fact | Measurement |
|------|-------------|
| Package | `@oh-my-pi/hashline@18.1.2`, MIT, published 2026-09-01 |
| Versions | 190 (created 2026-05-27) — very fast release cadence |
| Core API | `Patcher`, `Patch.parse`, `SnapshotStore`, `Filesystem`, `computeFileHash`, `formatNumberedLines`, `formatHashlineHeader` |
| Tag | 4-hex content hash of whole normalized file text |
| Stale rejection | `MismatchError`, thrown from `Patcher.prepare` (**preflight** — a partial batch never lands) |
| Stale error text | "…copy the `[path#newhash]` header from that edit's response; otherwise re-read the file with `read` to refresh the tag before retrying." |

**This error message natively satisfies P0 requirement #6** (tell the agent to
reread / reanchor / retry) with no custom wording needed.

Executed-behaviour probes (Bun 1.3.13, Windows x64):

| Case | Result |
|------|--------|
| anchored replace | `op: "update"` |
| CRLF preservation | `"a\r\nb\r\n"` → `"A\r\nb\r\n"` — preserved |
| insert at head + `CUT` in one patch | `"ZERO\na\nb\n"` |
| concurrent writer modified file | `MismatchError`, file untouched |
| malformed tag `#ZZZZ` | parse error, names the bad header |
| nonexistent file | `"File not found: nope.ts. Use the write tool to create new files."` |
| overlapping hunks (`PUT 1.=3` + `PUT 2.=4`) | rejected: "Issue ONE hunk per range" |
| sequential edits with refreshed tag | both applied |

### Two blocking integration costs (measured)

| # | Finding | Evidence |
|---|---------|----------|
| 1 | `Patcher` statically imports `recovery.ts` and `apply.ts`→`syntax.ts`, both of which import `@oh-my-pi/pi-natives`. The native blob is therefore **unavoidable** and cannot be tree-shaken out. | `src/patcher.ts:44` (`./recovery`), `src/apply.ts` (`./syntax`); `recovery.ts:9`, `syntax.ts:12` |
| 2 | `pi-natives` pulls a **169 MB** platform binary and **fails to load under Node 22** (works under Bun). `pi-natives-win32-x64` = 175,602,176 B; `du -sh node_modules` = 175 M. Under Node: `TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string` from `native/loader-state.js:778` (`initLoaderContext`). Under Bun: loads clean. | measured; `pi-natives` package.json `optionalDependencies` |

A 169 MB mandatory install is incompatible with this project's "slim" identity,
and a Node-incompatible native module is unacceptable as a hard dependency for
a plugin distributed on npm.

**Implementation decision:** adapt `@oh-my-pi/hashline` as an **opt-in optional
peer dependency** (`peerDependencies` + `peerDependenciesMeta.optional: true`),
dynamically imported only when `hashlineEdit: true`. When the package is absent
or the flag is off, behaviour is byte-identical to today (native `edit` +
`apply-patch` rescue). This satisfies P0 requirements #1 (optional/configurable)
and #2 (clean fallback) without imposing a 169 MB Bun-only native binary on
every Slim user.

Consequences accepted: feature is **off by default**; enabling it requires
`npm i @oh-my-pi/hashline`. Sub-path import restriction — the package's
`exports` map allows `@oh-my-pi/hashline/*`, but the root import is required
for `Patcher`, so there is no native-free subset.

Required integration work (thin):
- `NodeFsFilesystem extends Filesystem` using `node:fs/promises` — the shipped
  `NodeFilesystem` uses `Bun.file`/`Bun.write` and is Bun-only
  (`fs.d.ts`: "Disk-backed Filesystem using Bun's file APIs").
- Override `allowTagPathRecovery()` to refuse redirects outside the working
  tree (satisfies the symlink/path-safety test).
- `InMemorySnapshotStore` (bounded: 256 paths / 4 versions / 64 MiB).

---

## P1 — UltraWork Execution Policy

### Capability: `/ultrawork` — autonomous unattended Ticket execution

**Existing implementation:** every constituent primitive exists, but they are
**prompt-only skills**, not runtime state machines:

| Primitive | Reality |
|-----------|---------|
| `deepwork` | `src/hooks/deepwork/index.ts:6-24` — the entire runtime is an `activationPrompt()` string. State file `.slim/deepwork/<slug>.md` is **agent-authored markdown with no schema** ("Do not follow a rigid template", `SKILL.md:52`). |
| `loop` | `src/hooks/loop-command/index.ts:6-32` — prompt only. The session model (executing/verifying/done/escalated/cancelled) and `onLoopComplete`/`maxAttempts` exist **only in** `src/skills/loop-engineering/SKILL.md:21-26`; zero runtime hits. `historyDir()` regenerates a fresh random dir per invocation and never stores it → no cross-invocation resume. |
| `verification-planning` | Pure `SKILL.md` (112 lines). **Not** repository-aware — no package-manager/test-runner detection; it is a 6-step reasoning procedure with self-assessed `**Complete when:**` markers. |
| `worktrees` | Prompt-only. Ownership registry `.slim/worktrees.json` exists as a *documented JSON shape* (`SKILL.md:31-49`) but is written by the agent, and `SKILL.md:51-54` calls it "optional". |
| Oracle | `src/agents/oracle.ts:28`; dispatched by the model emitting `@oracle` in text. **Nothing gates on its results.** |

**Evidence:** `src/hooks/deepwork/index.ts`, `src/hooks/loop-command/index.ts`,
`src/skills/deepwork/SKILL.md`, `src/skills/verification-planning/SKILL.md`,
`src/agents/oracle.ts`, `src/cli/custom-skills-registry.ts:19-73`.

**Classification: PARTIALLY_IMPLEMENTED** — no `/ultrawork` command exists;
the orchestration machinery it must consume (background jobs, wake, reconcile,
revive, fallback) is fully implemented in code.

**Reuse plan:** UltraWork is a **command hook + skill policy**, nothing more.
It composes: `verification-planning` → background orchestration →
Explorer/Librarian → Fixer lanes → hook-driven completion → reconciliation →
Oracle (risk-gated) → completion gate.

**Missing seam:**
1. `src/hooks/ultrawork/index.ts` — `createUltraworkCommandHook()` following the
   canonical two-method shape (`registerCommand` /
   `handleCommandExecuteBefore`); wired at `src/index.ts:1033` and `:1292`.
   Precedent: `src/hooks/deepwork/index.ts:26`, `src/hooks/loop-command/index.ts:47`.
2. `src/skills/ultrawork/SKILL.md` — autonomy contract, stop conditions,
   resource discipline, risk-based routing, completion gate.
3. `/ulw` alias — only if it fits `registerCommandHook` conventions cleanly.

**Implementation decision:** one command hook + one skill. **Zero new state
machines.** UltraWork does not touch model profiles.

### Non-duplication verification

| Claim | Verdict |
|-------|---------|
| UltraWork != Deepwork | Deepwork is a per-session workflow skill; UltraWork is an execution policy that invokes deepwork when complexity warrants it. |
| UltraWork != Loop | Loop is attempt-bounded; UltraWork is gate-bounded. UltraWork may use loop for a bounded sub-verification. |
| UltraWork != background runtime | Consumes `BackgroundJobBoard` + `task-session-manager`; creates no board, no scheduler, no task manager. |
| UltraWork != model profile change | Orthogonal by construction: the hook injects a prompt only; it never reads or writes agent/model config. |

---

## P2 — Durable Checkpoint / Resume

**Existing implementation:** partially implemented as *mechanisms*, with no
durable plan record:

- `rehydrateHistoricalRunningTasks()` — `src/hooks/task-session-manager/index.ts:53-143`.
  Rebuilds board entries from **host-persisted** `task` tool parts with
  `now: 0` so they can never be mistaken for a live observation; skips
  tombstoned IDs. This is genuine cross-restart recovery.
- `createRuntimeStatusReconciler()` — `runtime-status-reconciliation.ts:15`.
- `stop-confirmation.ts` — two-observation grace (`STOP_CONFIRMATION_GRACE_MS = 5_000`)
  before `markStopped(STOPPED_WITHOUT_TERMINAL_RESULT)`; a stopped job is
  **not reusable** (`background-job-board.ts:500-505`).
- `task_revive` (`src/tools/task-revive.ts:17`), `revived-run-tracker.ts`
  (bounded stabilization probes, commit `fd6e87d`).
- `BackgroundJobBoard` is **in-process only** and explicitly disclaims
  persistence (`background-job-store.ts:31-37`). The config key
  `checkpoint-compatible` is a *prompt-cache injection strategy*
  (`src/config/schema.ts:179-195`), **not** durability.

**Evidence:** as above; `src/utils/background-job-store.ts:31-37`.

**Classification: PARTIALLY_IMPLEMENTED**

**Missing seam:** there is **no durable, machine-readable record of the plan
itself**. `.slim/deepwork/<slug>.md` is free-form prose with no schema, so a
restarted session cannot reliably determine "which phases completed, with what
evidence".

**Reuse plan:** reuse `.slim/deepwork/<slug>.md` (already the established
artifact, already gitignored at `.gitignore:103`) and add a **minimal mandatory
schema** to the UltraWork skill — a phase table with explicit status and
evidence columns. No database, no new job ledger, no new persistence layer.

**Implementation decision:** glue only, expressed as the UltraWork skill's
progress contract.

### Resume state mapping

| State | Existing mechanism |
|-------|--------------------|
| completed | terminal `completed` — `parseTaskStateFromOutput`; phase row marked done |
| running | live `busy`/`retry` from runtime reconciler |
| stopped-unreconciled | `stopped` + `terminalUnreconciled`, 5 s grace |
| failed | terminal `error` |
| cancelled | terminal `cancelled` + `task_cancel` |
| unknown | `statusUncertain` — status lookup failed |
| needs-verification | phase marked done but no evidence recorded |

Never treat missing child / idle child / status-lookup failure as completion:
`session-runtime-status.ts:14-18` and `runtime-status-reconciliation.ts:112-115`
already encode absence as *unknown*.

---

## P3 — Ticket Completion Gate

**Existing implementation:** all primitives exist, **none is enforced**:
OpenCode TODOs, `verification-planning`, deepwork's Oracle convention (a
documented "1 initial + max 2 re-reviews" budget at `SKILL.md:118-122`, enforced
by nothing), loop success criteria (spec-only), Oracle review (advisory),
orchestrator-wake (fires while TODOs incomplete).

**Evidence:** `src/skills/verification-planning/SKILL.md`,
`src/skills/deepwork/SKILL.md:99-135`, `src/hooks/loop-command/index.ts`,
`src/hooks/orchestrator-wake/index.ts:112-117`.

**Classification: PARTIALLY_IMPLEMENTED**

**Missing seam:** one explicit, thin completion contract
(IMPLEMENTATION + VALIDATION + FAILURE_CLASSIFICATION + REVIEW + GIT_BOUNDARY +
TICKET_AUTHORITY). No CI framework, no generic test-runner detection.

**Implementation decision:** pure skill policy in the UltraWork skill. The
failure taxonomy (CAUSED_BY_THIS_CHANGE / PRE_EXISTING / ENVIRONMENT_DEPENDENT /
UNKNOWN) is a prompt-level classification discipline, not a code system —
consistent with "do not build an enormous generic CI framework".

Non-overgeneralization: the gate defers to repository authority. It never
demands `npm test`/`bun test`/`pytest`/`cargo test` universally; it uses
verification-planning plus the repo's own scripts.

---

## P4 — Unattended Watchdog / Recovery

**Existing implementation: ALREADY_IMPLEMENTED, comprehensively.**

| Requirement | Mechanism |
|-------------|-----------|
| parent idle + incomplete work → wake | `createOrchestratorWakeScheduler` (`orchestrator-wake/index.ts:219`), `ORCHESTRATOR_WAKE_TEXT` |
| terminal unreconciled → consume | `reconcileInjectedTerminalJobs` → `markReconciled` (`board-injection.ts:1015,1069`) |
| stopped retained child → recovery | `ORCHESTRATOR_STOPPED_JOB_WAKE_TEXT` + `triggerStoppedJobRecovery` (`:43`, `:648`) |
| stopped retained child → revive | `task_revive` + `createRevivedRunTracker` |
| transient provider/runtime failure | foreground fallback (`isFailoverError`, 429/5xx/transport) |
| writer failure after partial edits | `git`/file inspection before replacement (policy) |
| no progress | fingerprint unchanged ≥ 2 wakes → `progress.stopped = true` (`wake-gate.ts:153-155`, `ORCHESTRATOR_WAKE_UNCHANGED_CAP = 2`) |
| human/external blocker | `wait_for_user` tool |
| wall-clock runaway | `BackgroundJobSupervisor` (opt-in) |

**Evidence:** `src/hooks/orchestrator-wake/index.ts` (whole file),
`src/hooks/orchestrator-wake/wake-gate.ts`, `runtime-status-reconciliation.ts`,
`idle-reconciliation.ts`, `stop-confirmation.ts`, `src/hooks/foreground-fallback/`,
`src/utils/background-job-supervisor.ts`.

**Classification: ALREADY_IMPLEMENTED**

**Missing seam:** none. Do **not** build a second watchdog. UltraWork only adds
policy: prefer `task_revive` over fresh spawn for retained stopped sessions, and
inspect partial state before replacing a failed writer.

**Implementation decision:** NOT_NEEDED as new code.

### Stall detection mapping

Good — the existing scheduler already uses authoritative evidence (session
status, child state, TODO fingerprint, task result), not "no UI output for N
seconds". Anti-storm: single in-flight evaluation slot via `globalThis`
(`wake-gate.ts:82`), two-snapshot TOCTOU re-read (`index.ts:425`, `:490`),
fingerprint cap, and `noteHostProgress` reset.

---

## Summary

| Priority | Capability | Classification | New code |
|----------|-----------|---------------|----------|
| P0 | Hash-anchored editing | **MISSING** | Yes: `hashline_edit` tool + read-side tagging hook + optional peer dep |
| P1 | UltraWork execution policy | **PARTIALLY_IMPLEMENTED** | Yes: command hook + SKILL.md |
| P2 | Durable checkpoint/resume | **PARTIALLY_IMPLEMENTED** | No: schema contract inside P1 skill |
| P3 | Ticket completion gate | **PARTIALLY_IMPLEMENTED** | No: policy inside P1 skill |
| P4 | Unattended watchdog/recovery | **ALREADY_IMPLEMENTED** | No |

**New runtime state machines: 0**
**New persistence systems: 0**

### Cache-safety obligations (from `AGENTS.md:109-143`)

Any new hook must:
- inject only via `src/hooks/cache-safe-injection.ts`;
- never mutate or reorder earlier messages;
- keep transforms a pure function of input + file content (no
  `Date.now()`/`Math.random()`) — otherwise
  `src/cache-safety-tripwire.test.ts` fails;
- if a `experimental.chat.messages.transform` step is added, update
  `createPipeline()` in `src/hooks/cache-safety-harness.test.ts:53` and the
  drift guard in `src/hooks/cache-safety.property.test.ts:339-392`.

`tool.execute.after` mutation of `output.output` is cache-safe (tool results
are appended once at execution time and never re-rendered) and is already done
by `json-error-recovery`. The read-side tag append uses exactly this seam.
