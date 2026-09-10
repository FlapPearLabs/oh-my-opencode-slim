# URV1-02 — Minimal WorkIntent Adapter and Reconstruction

TICKET:
URV1-02 — Minimal WorkIntent adapter and reconstruction

STATUS:
`CODE_CHANGE` — implemented and self-reviewed; pending independent exact-SHA
review and integration.

REPOSITORY:
FlapPearLabs/oh-my-opencode-slim

BRANCH:
`work/urv1-02-recovered`

EXACT BASE SHA:
`791d974ee964e2ba2cbb9fc2c439b54bdc7393bd`

FROZEN SPEC COMMIT:
`16bb77f8209542a6bcc1ca11a48203867d8a3378`

FROZEN GRAPH COMMIT:
`9bac2333d5a2963a05f39e130fffc587336096c9`

IMPLEMENTER:
Codex root (high-risk core implementation retained by the integrator)

RECOVERY NOTE:
The original temporary Git object store was removed between execution turns.
This branch reconstructs the previously reviewed candidate byte-for-byte from
its preserved worktree against the same exact base SHA; it receives fresh
fixed-SHA validation and independent reviews before integration.

HOST EVIDENCE:
Packaged plugin loaded successfully under isolated `opencode-ai@1.18.23`.
This proves the built package and new hook/tool wiring load in a real host
process. Tool-result persistence and post-compaction reconstruction remain
`INTEGRATION_SIMULATION` here and are reserved for the frozen URV1-09 fixture;
they are not mislabeled as end-to-end `REAL_RUNTIME` proof.

---

## 1. Outcome

URV1-02 adds one strict, bounded adapter around OpenCode's existing session
history. The orchestrator-only `slim_work_intent` tool returns a canonical
`slim.work-intent.v1` JSON envelope; OpenCode's normal completed-tool-result
history remains the sole persistence authority. The adapter reconstructs the
latest recognizable carrier in host order through the existing message
transform and `session.messages` API, keeps only a bounded in-memory view, and
returns `UNKNOWN` for an invalid, conflicting, truncated, foreign, or
cross-session latest candidate without falling back to older state.

It does not own scheduling, dispatch, wakes, task records, completion
inference, a database, a filesystem ledger, or a daemon. Wake/reconciliation
consumption remains exclusively URV1-03 scope.

## 2. Exact implementation surface

- `src/utils/work-intent.ts`: canonical envelope creation, strict parsing,
  host-order selection, safe `UNKNOWN`, bounded per-session in-memory views,
  history reconstruction, and transform reconstruction.
- `src/tools/work-intent.ts`: orchestrator-only recording tool with the fixed
  field limits and no continuation/completion logic.
- `src/index.ts`: registers the tool, supplies the existing
  `client.session.messages` reader, clears the bounded view on session delete,
  reconstructs in the existing message transform, and invalidates the
  pre-compaction view through `experimental.session.compacting` without
  injecting prompt content.
- `src/v2/setup.ts`: passes the already-available v2 context event `sessionID`
  into the reused v1 message-transform hook so current-session provenance
  remains enforceable when v2 message objects omit it, and maps the native
  `session.next.compaction.started` event to the same bounded cache
  invalidation used by v1.
- Focused tests cover v1/v2 carrier shapes, provenance, bounds, ordering,
  malformed-latest behavior, reload, compaction-shaped history omission,
  compacted-away carrier invalidation, bounded cache behavior, tool ownership,
  registration, and zero prompt wake.
- `docs/tools.md` and the three touched directory maps document only the new
  behavior and v2 binding seam.

## 3. Schema and fixed bounds

Canonical output keys are exactly:

```text
kind = slim.work-intent.v1
origin = oh-my-opencode-slim
sessionID
objective
successCriteria
state = active | waiting_for_user | complete | blocked
phaseRef?
evidenceRefs?
```

Unknown keys are rejected. Limits are fixed in code, not configurable:

- serialized envelope: at most 8 KiB UTF-8;
- objective: 1–2,000 characters;
- success criteria: 1–2,000 characters;
- phase reference: at most 1,000 characters;
- evidence references: at most 8 entries, each at most 256 characters.

No timestamp or revision exists in the envelope. The parser scans the
host-ordered message array and treats the final recognizable carrier candidate
as authoritative; later non-carrier messages do not change it. One host
message containing multiple carrier candidates is conflicting and therefore
`UNKNOWN`.

## 4. TDD and defect ledger

The implementation was driven through focused red/green slices:

1. Missing utility module → canonical v1 round-trip, strict provenance,
   bounds, host-order and no-fallback parser became green.
2. A test fixture initially carried a mismatched nested `messageID`; the
   production parser correctly returned `UNKNOWN`. The fixture was corrected,
   preserving strict structural binding.
3. Missing tool module → orchestrator-only recording and stale orchestrator
   mapping recovery became green.
4. v2 completed-tool result shape initially returned `UNKNOWN` → the same
   canonical payload is now read from v2 `state.result` without creating a
   second schema.
5. The v2 context bridge passed `{}` to the v1 message transform → it now
   passes `{sessionID: event.sessionID}`, with a regression assertion.
6. A mixed-session transform returned `UNKNOWN` but initially retained an
   older known cached view → a new failing regression exposed it; the adapter
   now replaces that scoped cached view with `UNKNOWN`.
7. Independent review exposed that the pre-compaction hook refreshed a cached
   `active` view before the host could discard its carrier. A focused regression
   first failed with `invalidateForCompaction is not a function`; the hook now
   invalidates that view, and the first post-compaction transform reconstructs
   from current host history. If the carrier is gone, the result is `UNKNOWN`.
8. A fresh recovered-SHA review then proved that v2 did not route compaction to
   that invalidation hook. The first focused test failed because the bridge did
   not exist. Current official OpenCode source at
   `d6855b6b47a8433462ac6aeeba882ccf734cb7f1` defines the native
   `session.next.compaction.started` event with a top-level `sessionID`; the
   existing v2 event pump now recognizes only that exact event, accepts the
   current top-level `sessionID` or the already-supported beta `properties`
   envelope, and invokes the existing v1 invalidation callback before other
   event consumers. Unknown or malformed events do nothing. No compaction
   manager or new event subsystem was added.
9. WorkBuddy Pro and Antigravity independently identified a narrow race in
   which an already in-flight pre-compaction history read could resolve after
   invalidation and restore stale `known` state. A deterministic deferred-read
   regression first returned `known`. The adapter now rotates one ephemeral,
   process-local view token whenever the bounded view changes, including the
   compaction boundary; both fulfilled and rejected history reads crossing a
   later view change return `UNKNOWN` and cannot overwrite it. This token is
   never persisted or serialized and is neither session state, a timestamp,
   nor a record-order version.
10. A subsequent fresh Pro review identified that an ordinary transient host
    history error was cached as `UNKNOWN`, preventing later carrier-free
    transforms from retrying the existing history path. A regression first
    remained `UNKNOWN` after the host recovered. The catch path now clears any
    stale view and returns uncached `UNKNOWN`; the next ordinary transform can
    reconstruct again without a timer, retry loop, or scheduler. Token-mismatched
    failures still leave any newer post-compaction view untouched.
11. The next fresh Pro review identified the corresponding non-compaction
    interleaving: an ordinary older history read could overwrite a carrier that
    a concurrent transform had already observed. A deferred-read regression
    first restored the older `active` state over a newer `waiting_for_user`
    record. Rotating the same single view token on every remember/clear makes
    all asynchronous history commits conditional on no later view mutation;
    no additional map, lock, queue, or persisted version was introduced.

No adjacent production behavior was refactored.

## 5. Validation ledger

| Validation | Result |
| --- | --- |
| Focused WorkIntent/tool/v2/plugin tests | `67 pass / 0 fail / 170 expect()` |
| Cache-safety properties, snapshots, and tripwire | `17 pass / 0 fail / 3 snapshots / 32 expect()` |
| Full test suite | `2445 pass / 0 fail / 3 snapshots / 6209 expect()` across 146 files |
| `bun run typecheck` | exit 0 |
| `bun run build` | exit 0 |
| `bun run verify:release` | exit 0; packed install/import verification passed |
| `OPENCODE_SMOKE_VERSION=1.18.23 bun run verify:host-smoke` | exit 0; packaged plugin loaded in isolated real host |
| `git diff --check` | exit 0 |
| Biome on every changed TypeScript file | clean |
| `bun run check:ci` | exit 1: repository baseline has 15 pre-existing errors; none is in a URV1-02 changed TypeScript file |

`verify:release` removes its generated/checked-in tarball as part of cleanup.
That side effect was detected immediately and the byte-identical HEAD version
was restored; the final diff does not delete or modify the artifact.

## 6. Compaction, reload, and prompt-cache behavior

- A fresh adapter reconstructs from the session-scoped host history reader,
  proving plugin reload does not depend on prior process memory.
- On v1, `experimental.session.compacting` invalidates the session's old
  in-memory view before compaction. On v2, the existing event pump maps the
  native `session.next.compaction.started` event to that same invalidation.
  The first post-compaction transform therefore reconstructs from current host
  history when its visible messages omit the carrier. If the carrier was
  compacted away, the result is `UNKNOWN`.
- An in-flight history read that crosses a compaction boundary or any newer view
  mutation is discarded as `UNKNOWN`; a later carrier-free transform can
  perform a fresh host read.
- A host-history transport failure is fail-closed for the current transform but
  is not cached, so an ordinary later transform can recover through the same
  bounded reader.
- Ordinary carrier-free transforms do not repeat the same history read for an
  already reconstructed session; compaction is the explicit invalidation
  boundary.
- `experimental.session.compacting` adds no context string, replaces no prompt,
  and calls no `promptAsync`.
- Message transforms do not add, rewrite, or reorder any provider-visible
  message. The WorkIntent scan is observational, so prompt bytes and existing
  cache behavior are unchanged.
- Reload/compaction reconstruction itself has no path to dispatch, schedule,
  reserve, wake, or mark work complete.

## 7. Failure semantics

- Invalid JSON, oversized output, wrong origin/kind/session, unknown keys,
  invalid state, field-limit violations, structural v1 part-binding mismatch,
  multiple carriers in one message, mixed scoped sessions, and history-reader
  failures all fail closed to `UNKNOWN`.
- A visible invalid latest candidate overwrites an older in-memory known view
  with `UNKNOWN`.
- `UNKNOWN` never searches backward for an older valid record.
- Missing history is `UNKNOWN`, never an inferred `active`, `blocked`, or
  `complete` state.

## 8. Architecture invariant accounting

```text
new database/filesystem ledger/service/daemon: 0
new scheduler/job board/dispatch owner: 0
new completion or blocked-state inference engine: 0
new autonomous wake path: 0
new runtime subsystem count: 0
new bounded adapter: 1
new public recording tool: 1
```

The adapter's in-memory map is capped (default 128 sessions), cleared by the
existing session lifecycle, and reconstructable from OpenCode authority. It is
not an additional persistence subsystem.

## 9. Remaining boundary

URV1-02 deliberately does not consume reconstructed state in continuation
policy. URV1-03 must evaluate it after the host-state snapshot and before the
normal-wake decision, while keeping terminal-result reconciliation wake
separate and exactly once. URV1-09 remains responsible for the frozen real-host
fault-injection claims, including actual persisted carrier visibility and
compaction/reload behavior.
