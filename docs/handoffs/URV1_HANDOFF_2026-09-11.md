# URV1 Runtime Reliability Handoff

## Intake Authority

- Repository: `FlapPearLabs/oh-my-opencode-slim`
- Authority branch: `work/slim-unattended-reliability`
- Integrated code base SHA:
  `52f1d3cef1bd6ecad68cb4cd6a9e32d8503aa0d6`
- Frozen Acceptance Spec SHA:
  `16bb77f8209542a6bcc1ca11a48203867d8a3378`
- Frozen ticket graph SHA:
  `9bac2333d5a2963a05f39e130fffc587336096c9`

The current remote branch HEAD is expected to be a descendant of the integrated
code base SHA because this handoff document is committed after that code. Before
working, fetch the branch, verify the ancestry relationship, and verify a clean
working tree. If the branch or ancestry differs, stop and resolve the authority
change instead of relying on this handoff.

Do not modify the frozen Spec or ticket graph. Do not run `/toticket`. Do not
merge into the default branch.

## Completed Work

- URV1-00: baseline validation complete.
- URV1-01: WorkIntent carrier and lifecycle seam probe complete.
- URV1-02: WorkIntent adapter and reconstruction complete, independently
  reviewed, integrated, and pushed.
- URV1-04: profile-authority diagnosis complete.
- URV1-04A: profile-authority correction complete and integrated.
- URV1-05: UltraWork discovery complete as `NO_CODE_CHANGE`.
- URV1-06: Hashline diagnosis complete as `NO_CODE_CHANGE`.
- URV1-06A: skipped because no implementation defect required it.

URV1-03 has not been implemented. Work is paused at its TDD implementation
boundary.

## URV1-02 Result

URV1-02 added a bounded WorkIntent adapter that reuses OpenCode session-history
persistence and Slim's existing transform/rehydration paths. It supports
reconstruction after compaction and plugin/session reload. Invalid, corrupt,
conflicting, foreign, or inconsistent state resolves to `UNKNOWN` without
falling back to an older record.

It did not add a database, filesystem ledger, daemon, service, scheduler, job
board, completion engine, or automatic dispatch owner.

Integrated validation at the code base SHA:

- Full suite: 2,450 passed, 0 failed, 3 snapshots, 6,241 expectations.
- Focused WorkIntent suite: 69 passed, 0 failed, 180 expectations.
- Typecheck: passed.
- Build: passed.
- Release artifact verification: passed.
- Packaged plugin smoke on OpenCode 1.18.23: passed.
- Two independent exact-candidate-SHA WorkBuddy Pro reviews: passed.
- Frozen Spec and ticket graph: unchanged.

One non-blocking review note remains: `reconstructTransform` is observational
and does not modify provider-visible messages, but it is not mirrored in
`src/hooks/cache-safety-harness.test.ts`. This is a test-harness completeness
debt, not a proven runtime or cache-safety defect. Do not broaden URV1-03 to
address it unless its authority is explicitly reopened.

## Next Authorized Ticket: URV1-03

URV1-03 integrates WorkIntent with the existing orchestrator wake path and adds
the narrow, exactly-once reconciliation wake for reliably observed canonical
terminal child results.

The required semantic distinction is:

1. A reconciliation wake may wake the parent once to consume a canonical
   terminal result that remains `terminalUnreconciled`.
2. A normal continuation wake is allowed only after required terminal results
   are reconciled and every remaining continuation predicate holds.

`terminalUnreconciled` must not suppress the wake needed to reconcile that same
result. The reconciliation path may bypass only this circular predicate. It
remains subject to existing real-user-wait, fallback, and one-flight
protections.

Only reliable coordinator outcomes for `completed`, `error`, or `cancelled`
qualify. `stopped` without a native task result is not canonical and must not
receive a reconciliation wake.

Normal continuation requires all of the following:

- reconstructed WorkIntent state is `active`;
- unfinished owned work exists;
- no real user wait is active;
- no required child is active;
- no fallback is active;
- no terminal reconciliation remains unresolved; and
- the existing bounded progress gate permits continuation.

Missing WorkIntent, `UNKNOWN`, `waiting_for_user`, `complete`, and `blocked`
must suppress normal continuation.

## Mapped Implementation Surfaces

- `src/hooks/orchestrator-wake/index.ts`
- `src/hooks/orchestrator-wake/index.test.ts`
- `src/hooks/orchestrator-wake/wake-gate.ts`
- `src/index.ts`
- `src/index.test.ts`
- `src/utils/background-job-coordinator.ts`
- existing background-job generation and result-occurrence fields
- focused task-session-manager/background-job tests

The current suspicious wiring is in `src/index.ts`: a terminal-outcome listener
wakes on `stopped && terminalUnreconciled`. That behavior conflicts with the
frozen URV1-03 requirement and must be replaced narrowly, not generalized into
a new wake system.

## URV1-03 Test Contract

Add failing tests before implementation for:

- every WorkIntent state and the missing-record case;
- active-state continuation with every existing predicate enforced;
- one reconciliation wake for a canonical terminal outcome;
- reconciliation before separately eligible continuation;
- duplicate outcome suppression;
- stale generation/result-occurrence suppression;
- no reconciliation wake for `stopped` without a native result;
- real-user-wait, fallback, and one-flight suppression; and
- reconstructed WorkIntent evaluation after the host snapshot and before
  `promptAsync`.

## Implementation Boundaries

- Reuse `WorkIntentAdapter` and the existing coordinator terminal-outcome seam.
- Reuse task ID, generation, parent session, terminal state, and result
  occurrence.
- Do not add another scheduler, queue, wake ledger, database, service, daemon,
  retry engine, completion subsystem, or job board.
- Do not change task ownership or provider fallback behavior.
- Do not add automatic Git, CI, review, PR, or merge ownership.
- Do not copy an aggressive OMO-style continuation loop.
- Preserve prompt-cache safety and bounded no-progress behavior.

## Required Code-Change Gate

For any URV1-03 candidate:

1. TDD and focused tests.
2. Full test suite.
3. Typecheck and build.
4. Biome `check:ci` and `git diff --check`.
5. Root self-review.
6. Fresh independent review of the exact candidate SHA.
7. Root CI on that reviewed SHA.
8. Fresh final independent review of the same exact SHA.
9. Only then integrate and push the authority branch.

Any source change creates a new review target. Do not reuse review conclusions
from an older SHA.
