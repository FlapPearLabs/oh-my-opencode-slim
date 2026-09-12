# src/hooks/orchestrator-wake/

## Responsibility

Orchestrator wake scheduler for unattended runtime execution. Provides three
distinct wake purposes:
1. **Normal continuation wake**: Periodic wake after continuous parent-idle time
   when incomplete TODOs remain and reconstructed WorkIntent is `active`.
   Suppressed by missing/unknown/waiting_for_user/complete/blocked WorkIntent,
   or by unresolved canonical terminal reconciliation (`hasTerminalUnreconciled`).
2. **Canonical terminal reconciliation wake**: Triggered by canonical child
   terminal outcomes (`completed`, `error`, `cancelled`). Reconciles a specific
   authoritative occurrence identity `(taskID, generation, occurrenceID)`.
   Prompts the orchestrator solely to observe and consume the terminal result and
   update authoritative state; does not authorize autonomous continuation.
3. **Stopped job recovery wake**: Immediate recovery wake for jobs that stopped
   without a native canonical terminal result. Preserved as a separate path from
   both normal continuation and reconciliation wakes (not blocked by
   `hasTerminalUnreconciled`).

Progress and reservation state is process-global so independently created hook
instances share one-flight execution and the two-wake no-progress cap. No
secondary wake ledgers exist.

## Design

- **Scheduler** (`index.ts`): `createOrchestratorWakeScheduler(ctx, options)`
  returns `{ event, observeChatMessage, triggerStoppedJobRecovery, triggerReconciliationWake, suppress }`.
  - Tracks per-session local state (`generation` symbol, timer, continuous
    idle flag) only; progress lives in the process gate.
  - Gates (`canSchedule(sessionID, purpose)`): config enabled, required session APIs present
    (`get`/`todo`/`children`/`status`/`promptAsync`), managed session,
    no input wait (`hasInputWait`), no fallback in progress, gate not stopped.
    When `purpose === 'continuation'`, also blocks on unresolved terminal
    child reconciliation (`hasTerminalUnreconciled`). Recovery wake bypasses this
    continuation gate.
  - Normal continuation reads host snapshot, verifies reconstructed WorkIntent is
    `active`, verifies no incomplete work / active children remain, computes
    fingerprint, and commits reservation before `promptAsync(ORCHESTRATOR_WAKE_TEXT)`.
  - Reconciliation wake (`triggerReconciliationWake`) validates the exact canonical
    occurrence `(taskID, generation, occurrenceID)`, revalidates all guards after
    the async host snapshot, and dispatches `ORCHESTRATOR_RECONCILIATION_WAKE_TEXT`
    narrowly instructing the orchestrator to consume the result without granting
    continuation authority.
  - `triggerStoppedJobRecovery`: immediate recovery wake for jobs that stopped
    without a native terminal result (separate from the periodic TODO wake).
  - `observeChatMessage`: real external user activity rearms the no-progress
    cap and records the observed model for continuation prompts.
- **Gate** (`wake-gate.ts`): Process-local reservation/progress store shared
  via `globalThis` + `Symbol.for` (`oh-my-opencode-slim.orchestrator-wake-gate`):
  - `tryBeginWakeEvaluation` / `releaseWakeEvaluation` / `retryAfterWakeEvaluation`:
    single in-flight evaluation per session with waiter re-queueing.
  - `commitWakeReservation`: marks a committed wake and sets `expectingWakeBusy`
    so the next busy preserves (not rearms) the no-progress cap.
  - `noteHostProgress` / `rearmWakeProgress`: fingerprint-unchanged counting
    and external-activity resets.
  - `getObservedWakeModel` / `setObservedWakeModel`: last-seen model for
    continuation prompts.
  - Bounded at `MAX_TRACKED_SESSIONS` (256) with insertion-ordered eviction.

## Flow

```
session.idle / session.status(idle)
    ↓
beginContinuousIdle() → arm interval timer
    ↓
evaluate() (one-flight via gate)
    ├─ read host snapshot (todo/children/status)
    ├─ active status? → end idle spell
    ├─ no incomplete todos (and not recovery)? → end idle spell
    ├─ fingerprint unchanged ≥ cap? → stop
    ├─ recheck immediately before promptAsync
    ├─ commitWakeReservation
    └─ promptAsync(internal wake reminder)
    ↓
busy (wake-initiated) → endIdleSpell(rearm=false)   [cap survives]
busy (external) / errors / user activity → rearm cap
```

## Integration

- **Consumer**: `src/index.ts` creates the scheduler and routes `event`,
  `chat.message` (`observeChatMessage`), `wait_for_user` (`suppress`),
  terminal outcome notifications (`triggerReconciliationWake`), and
  job-stopped recovery triggers (`triggerStoppedJobRecovery`) to it;
  config comes from `runtime.backgroundJobs.orchestratorWake` (`{ enabled, intervalMs }`).
- **BackgroundJobCoordinator seams**: supplies `hasTerminalUnreconciled`,
  `getJob`, `isJobTerminalUnreconciled`, and terminal outcome listeners
  propagating `(taskID, generation, occurrenceID, state)`.
- **WorkIntent seams**: supplies `getWorkIntent` for verifying `state === 'active'`
  on normal continuation wakes.
- **Task-session-manager seams**: `hasInputWait` (input-wait-tracker) and
  `parseContinuationModelSelection` (continuation-model-selection) gate and
  parameterize wake prompts.
- **SessionLifecycle**: registers `session.deleted` cleanup via the
  coordinator.
- **Dependencies**: `createInternalAgentTextPart` /
  `isInternalInitiatorPart` (`src/utils/internal-initiator.ts`), `log`,
  `isRecord`, `SessionLifecycle`, and the task-session-manager status/selection
  helpers.
- **Foreground-fallback**: `isFallbackInProgress` suppresses scheduling during
  fallback cycles.

## Error Handling

- SDK failures during evaluation suppress the wake (reservation already
  committed), clear the expecting-busy marker, and log; the timer re-arms via
  the finally block unless stopped.
- `server.instance.disposed` clears timers, releases owners, and drops pending
  recovery state.
- Model enrichment from `session.get` is fail-soft.

## Performance Considerations

- One unref'd timer per continuously-idle managed session; timers are cleared
  on any busy/error/wait/deletion.
- All process-global state is bounded and evicted LRU-style.
- Host snapshot reads are `Promise.all`-parallel and only happen inside the
  one-flight evaluation.
