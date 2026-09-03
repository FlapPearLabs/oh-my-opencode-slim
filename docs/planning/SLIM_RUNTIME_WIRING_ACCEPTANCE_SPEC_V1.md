# Slim Runtime Wiring Acceptance Spec V1

Status: **APPROVED — FROZEN FOR TICKET DECOMPOSITION**

Implementation status: **NOT STARTED — TICKET DECOMPOSITION AUTHORIZED; IMPLEMENTATION REQUIRES USER APPROVAL**

Repository: `FlapPearLabs/oh-my-opencode-slim`

Planning branch: `work/slim-unattended-reliability`

Approved implementation baseline: `547c3afc07d22f0e91af2db675e0d2d257ba1dd2`

This document supersedes prior planning conclusions only where it explicitly
states a newer approved authority. The legacy
`SLIM_RUNTIME_WIRING_TICKET_GRAPH_V2_1.md` remains reference material only.

This specification is the authority for the final runtime-wiring and real-host acceptance phase of the Slim Unattended Reliability V1 program.

Do not implement from this document directly until `/toticket` decomposition has been independently reviewed and accepted.

---

## 1. Purpose

The Unattended Reliability work has already established the intended architecture:

- P0 Hashline for stale-edit protection;
- P1 UltraWork as a long-running execution policy;
- P2 restart/resume by composing existing Slim persistence and rehydration;
- P3 completion discipline using existing progress, TODO, validation, review, and reconciliation surfaces;
- P4 watchdog/recovery by reusing existing wake, liveness, task-result, and revive behavior.

The approved D-01 addition is one bounded WorkIntent adapter that wraps
OpenCode-native session history and lifecycle hooks. It is not a Goal runtime,
job board, scheduler, daemon, database, completion engine, or persistence
subsystem.

The remaining work is not a redesign.

The remaining work is to make the implemented capabilities consistently discoverable, correctly routed, explicitly configurable, and mechanically proven in the **real OpenCode runtime**.

The target is a Slim V1 where the following capabilities coexist and work together:

```text
model-profile routing
        +
UltraWork
        +
Deepwork / Loop
        +
background specialists
        +
Hashline stale-edit protection
        +
validation / Oracle review
        +
resume / reconciliation / wake
        =
reliable long-running Ticket execution
```

---

## 2. Current Accepted Runtime Evidence

The latest real OpenCode acceptance established the following behavior.

### 2.1 Proven working

The current host demonstrated:

- OpenCode starts with PowerShell 7.6.5 resolved from `C:\Program Files\PowerShell\7\pwsh.exe`;
- Slim loads successfully;
- `/slim-go`, `/slim-ag`, `/slim-profile` commands are present;
- `/deepwork` is present and not regressed;
- `/loop` is present and not regressed;
- `/ultrawork` is a registered command;
- a real `/ultrawork` run completed a disposable Ticket with zero human interventions;
- the Orchestrator created a progress artifact;
- verification planning was observed;
- real background child sessions were dispatched;
- real child task/session IDs were produced;
- terminal background results, including terminal failure results, were reconciled by the parent;
- implementation completed;
- targeted tests passed;
- broader validation passed;
- observed completion behavior did not terminate prematurely in that run;
- restart/resume behavior passed the real acceptance exercised by the host;
- native edit behavior remained functional;
- the Slim source repository and credentials were not modified by the acceptance fixture.

These capabilities are **not to be reimplemented**.

### 2.2 Remaining findings

The same acceptance exposed the following unresolved runtime findings:

1. `ultrawork` was not discoverable through the Orchestrator's allowed Skill surface even though `/ultrawork` command execution itself worked.
2. `hashline_edit` was absent from the active host tool set and native `read` did not produce a `[path#TAG]` annotation.
3. Runtime reporting conflated or ambiguously reported **model profile**, **preset**, and **host model override** authority.
4. The observed Orchestrator model was `google/antigravity-gemini-3.1-pro`, while the acceptance report called the routing state anomalous without proving whether this was an intentional host override.
5. Real Explorer and Oracle child sessions were dispatched, but their provider/model calls terminated with `Insufficient balance`.
6. The parent correctly reconciled those terminal failures, but a successful real Oracle review was therefore not observed.
7. Hashline stale-edit rejection and reread/reanchor recovery were not proven in the real host because the Hashline feature was not present in the active tool set.

These findings define the scope of this specification.

---

## 3. Architectural Invariants

The implementation MUST preserve all of the following.

### 3.1 No new orchestration runtime

Do not add a new:

- scheduler;
- job board;
- task manager;
- recovery manager;
- checkpoint database;
- watchdog engine;
- completion engine;
- autonomous execution loop;
- persistence subsystem.

The WorkIntent adapter approved in this specification is permitted only as a
thin adapter over OpenCode session history. It does not change any of the
counts above.

Target:

```text
New runtime state machines: 0
New persistence systems: 0
New scheduler: 0
New job board: 0
New watchdog engine: 0
New completion engine: 0
Duplicate UltraWork engine: 0
New provider/account orchestration system: 0
Duplicate scheduler: NO
Duplicate job board: NO
```

### 3.2 UltraWork remains policy/composition

UltraWork MUST continue to compose existing Slim primitives instead of owning parallel machinery.

Expected reused primitives include, where applicable:

- Deepwork progress state;
- verification-planning;
- background task dispatch;
- task/session IDs;
- task status/result/cancel/revive;
- existing background job board;
- orchestrator wake;
- liveness reconciliation;
- Loop semantics;
- Oracle;
- worktree/file ownership discipline;
- existing Git boundary checks.

### 3.3 Model profiles are orthogonal to behavior

Model-profile selection MUST alter model/variant routing only.

Changing between model profiles MUST NOT change:

- Skill availability;
- MCP availability;
- agent prompts;
- agent permissions except model-specific capability constraints required by the host;
- UltraWork behavior;
- Deepwork behavior;
- Loop behavior;
- background orchestration semantics;
- completion semantics.

### 3.4 Hashline remains optional and lightweight

The package MUST retain the current lightweight distribution contract:

- `@oh-my-pi/hashline` is an optional peer at runtime;
- it is not unintentionally bundled into the normal distribution;
- Slim loads normally without the peer when Hashline is disabled;
- native OpenCode read/edit/apply-patch behavior remains valid without Hashline;
- enabling Hashline without the peer produces a clear, actionable failure/degradation rather than a plugin-wide crash.

The project default MAY remain disabled to protect the lightweight baseline.

However, the controlled acceptance environment defined by this spec MUST enable Hashline and prove the feature end to end.

### 3.5 Existing user/provider state is outside implementation ownership

Implementation and acceptance MUST NOT mutate:

- Google OAuth credentials;
- Antigravity account credentials;
- Sub2API credentials/configuration;
- proxy configuration;
- unrelated OpenCode configuration;
- unrelated user working-tree changes.

Provider quota/balance may be observed and classified, but must not be silently repaired by changing architecture.

---

## 4. Authority Model: Profile, Preset, Host Override

The runtime MUST distinguish these concepts explicitly.

### 4.1 Model profile

The Slim model-profile feature is the selected routing family, such as:

- `opencode-go`;
- `antigravity`.

The selected model profile has separate **active** and **staged** state where restart activation is required.

### 4.2 Preset

A preset such as `production`, if present in current repository authority, is a configuration/policy preset and MUST NOT be reported as though it were the selected Slim model profile unless the repository explicitly defines them as the same concept.

### 4.3 Host explicit model override

A host/OpenCode explicit per-agent model override has higher precedence than the selected Slim model profile.

Required precedence remains:

```text
user-owned explicit host override
    > selected Slim model profile
    > preset
    > agent factory/default
```

A model resolved from an intentional host override is **not a routing bug merely because it differs from a preset or profile default**.

### 4.4 Required reporting

Runtime inspection and acceptance reports MUST expose separately:

```text
MODEL_PROFILE_ACTIVE
MODEL_PROFILE_STAGED
PRESET
HOST_ORCHESTRATOR_OVERRIDE
RESOLVED_ORCHESTRATOR_MODEL
RESOLUTION_AUTHORITY
```

Do not collapse these values into one generic `profile` field.

### 4.5 Profile commands

`/slim-ag` and `/slim-go` MUST preserve the accepted staged/active semantics.

For an explicit profile switch:

- stage the selected Slim model profile;
- clear only a stale host model override that is provably Slim-managed under
  existing authority;
- preserve a user-explicit or unknown-origin host model override;
- when ownership cannot be proven, preserve host state and report the conflict;
- require restart where current host semantics require restart;
- after restart, resolve the intended profile mapping;
- retain identical shared Skills and orchestration behavior.

Do not build an override-provenance database or routing framework. Do not
change accepted model mappings unless current repository authority proves the
mapping has intentionally changed.

---

## 5. WorkIntent Continuity and Recovery

### 5.1 Purpose and ownership

WorkIntent provides bounded, session-level engineering intent continuity for
unattended work. Its only responsibilities are recording and reconstructing:

- objective;
- success criteria;
- state: `active`, `waiting_for_user`, `complete`, or `blocked`;
- a short phase/progress reference;
- bounded evidence references.

The canonical record kind is `slim.work-intent.v1`. WorkIntent is a thin
adapter around OpenCode-native session persistence and lifecycle seams, not an
independent runtime subsystem. It does not own dispatch, scheduling, a job
board, fallback, worktrees, CI, review, or completion decisions.

### 5.2 Persistence and provenance

OpenCode session history is the sole persistence authority. The canonical
record MUST be a Slim-controlled tool/result envelope actually persisted by
OpenCode in the current session history. A synthetic outgoing message transform
or ordinary model free text is not a canonical record and MUST NOT be accepted
as one.

The parser accepts only one envelope per canonical host part, with all of:

- `kind: "slim.work-intent.v1"`;
- a fixed Slim-origin marker;
- a binding to the current session ID; and
- a schema-valid bounded payload.

The record has no mutable revision or timestamp. Host message ordering is the
freshness authority: `time_created`, then host message ID as its stable tie
breaker. Later non-canonical messages do not change the selected record.

The serialized envelope MUST be at most 8 KiB. The objective and success
criteria are each at most 2,000 characters, `phaseRef` is at most 1,000
characters, and `evidenceRefs` contains at most 8 references of at most 256
characters each. These are fixed validation limits, not user configuration.

Do not create or import:

- JSON state files, filesystem ledgers, SQLite/databases, a custom persistence
  service, checkpoint store, file locks, or a garbage-collection subsystem;
- a revision or timestamp sequence solely to decide record freshness;
- a Goal/Boulder/task runtime merely to store WorkIntent.

### 5.3 Reconstruction and UNKNOWN

Host-ordered session history defines freshness. The final recognizable
canonical-record candidate is authoritative. If that candidate is malformed,
truncated, schema-invalid, conflicting within the same canonical message, or
not provably Slim-originated, reconstructed WorkIntent is `UNKNOWN`.

`UNKNOWN` MUST NOT fall back to an older WorkIntent record. Falling back could
resurrect an older active state after a later `blocked` or `complete` record
became unreadable. Reload reconstructs only the in-memory view and MUST NOT
dispatch work merely because a historical record exists.

### 5.4 Compaction continuity

Use OpenCode `experimental.session.compacting` and the existing Slim/OpenCode
message/history-transform seam. The latest bounded canonical WorkIntent record
must remain reconstructable across compaction; free-text progress is not a
recovery authority.

When valid WorkIntent cannot be reconstructed after compaction, state is
`UNKNOWN` and autonomous continuation is suppressed. No compaction manager is
authorized.

### 5.5 State recording and normal-wake gate

WorkIntent records a result of existing authority; it does not independently
derive a completion, a block, or a continuation decision. Existing completion
authority determines the applicable facts first. Only then may the adapter
record `complete`. Likewise, `blocked` may be recorded only by the existing
owner of the blocking condition, never from elapsed time, idle detection, or a
failed prompt attempt.

Before the existing normal orchestrator wake reserves work or calls
`promptAsync`, it MUST evaluate reconstructed WorkIntent after its host-state
snapshot has been read and before its final normal-continuation decision:

- no valid canonical record or reconstructed `UNKNOWN` suppresses normal
  continuation;
- `waiting_for_user`, `complete`, and `blocked` suppress normal continuation;
- `active` permits normal continuation only when the existing continuation
  predicates also hold.

A real user message does not itself rewrite WorkIntent to `active`. It is
processed by the normal host/Slim path; an authorized Slim action may then
write a new canonical `active` record. The narrow reconciliation wake in
Section 10.2 is the only exception to this normal-continuation suppression,
and it authorizes consumption of a reliably observed terminal result only.

## 6. UltraWork Skill Discovery Requirement

The runtime acceptance already proved that `/ultrawork` command execution can drive a real autonomous run.

The remaining defect is **Skill discovery/permission consistency**.

### 6.1 Required behavior

For the Orchestrator in every supported shared-behavior configuration where UltraWork is intended to exist:

```text
available_skills
```

MUST include:

```text
ultrawork
```

The Orchestrator MUST be able to discover and load the UltraWork Skill through the normal bundled Skill discovery path.

### 6.2 Single authority

Prefer a single shared Skill authority.

Do not create profile-specific copies of the UltraWork Skill.

If presets own independent Skill allowlists, every relevant Orchestrator preset MUST receive the shared capability consistently, with regression coverage preventing drift.

### 6.3 Non-regression

Fixing UltraWork discovery MUST NOT remove or shadow:

- `deepwork`;
- `verification-planning`;
- `worktrees`;
- `codemap`;
- `clonedeps`;
- other currently intended bundled Orchestrator Skills.

### 6.4 Explicit skill-policy authority

Explicit user Skill policy remains authoritative. UltraWork must be
discoverable when normal/default policy permits it, a wildcard permits it, or
it is explicitly included. An explicit allowlist that omits `ultrawork` may
hide it; Slim MUST NOT silently bypass that user permission intent.

---

## 7. Hashline Runtime Availability Requirement

Hashline is a required **available capability** of the completed V1, while remaining optional in packaging/default configuration.

### 7.1 Config classification first

Before any code change, determine the resolved runtime value of:

```text
hashline_edit
```

Classify the prior acceptance result as one of:

- expected disabled state;
- missing peer;
- runtime registration bug;
- configuration-resolution bug;
- other proven defect.

Do not treat a deliberately disabled optional feature as a code failure.

### 7.2 Controlled acceptance mode

For final V1 acceptance, enable:

```text
hashline_edit: true
```

through the normal Slim configuration authority.

Ensure the exact compatible optional peer required by current repository authority is resolvable from the actual loaded Slim runtime.

### 7.3 Real host read annotation

With Hashline enabled and the peer installed, a real native OpenCode file `read` MUST preserve native rendering and add a Hashline anchor:

```text
[path#TAG]
```

The anchor MUST correspond to the normalized full-file snapshot and the actual seen line range.

### 7.4 Real host edit

The dedicated additive `hashline_edit` tool MUST be present in the real session tool set when enabled.

A valid current tag MUST allow a valid edit.

Native `edit` MUST remain independent and valid without a tag.

Native `apply_patch`, where the host exposes it, MUST remain independent and valid without a tag.

### 7.5 Stale-edit rejection

The final acceptance MUST prove in a real OpenCode host:

```text
read -> TAG1
external/native legitimate file mutation
hashline_edit using TAG1
```

Expected result:

```text
REJECT
```

The stale operation MUST NOT mutate the file.

Then:

```text
reread -> TAG2
hashline_edit using TAG2
```

MUST succeed.

### 7.6 Existing file safety remains authoritative

Preserve existing verified behavior for:

- BOM;
- CRLF;
- BOM + CRLF;
- partial-read `seenLines` enforcement;
- symlink/workspace containment;
- native edit non-regression;
- optional dependency isolation.

Do not rewrite the upstream Hashline algorithm.

---

## 8. Background Specialist Routing and Provider Failure Semantics

The previous real acceptance proved that real background dispatch and terminal failure reconciliation work.

It did **not** prove successful Explorer and Oracle model execution because the provider returned `Insufficient balance`.

### 8.1 Required classification

For every child probe, report:

```text
agent
resolved provider
resolved model
resolution authority
terminal status
provider error if any
parent reconciliation status
```

If the provider rejects the request for quota/balance reasons and routing is otherwise correct, classify it as:

```text
EXTERNAL_PROVIDER_RESOURCE_FAILURE
```

Do not modify orchestration to hide this condition.

### 8.2 Successful background proof before final acceptance

Before V1 can be marked ready for long unattended real-project dogfood, the controlled acceptance environment MUST provide a viable model/provider route and prove at least:

- one real Explorer child returns a usable result;
- one real Oracle child returns a usable review;
- the parent consumes/reconciles each result.

A terminal provider error is valid evidence for failure handling, but it is not evidence of successful specialist work.

### 8.3 No duplicate dispatch

A provider/resource failure MUST NOT cause uncontrolled duplicate respawn.

Existing bounded retry/revive/fallback semantics remain authoritative.

---

## 9. Real Oracle Requirement

Oracle dispatch is already proven.

Successful Oracle review remains required.

### 9.1 Minimal proof

Use a disposable repository and a small non-trivial diff.

A real Oracle run MUST produce:

- a real child/session ID;
- a real provider/model call;
- an actual review result;
- parent reconciliation of that review result.

### 9.2 UltraWork completion integration

A final targeted UltraWork acceptance MUST prove that when Oracle review is required:

```text
implementation
-> validation
-> Oracle
-> reconcile Oracle result
-> remediate material finding if present
-> completion gate
-> DONE
```

UltraWork MUST NOT declare DONE while a required material Oracle result remains unresolved.

---

## 10. Completion, Wake, and Recovery Requirements

Do not build a completion subsystem or state machine. Completion remains the
composition of existing runtime facts, UltraWork policy, and the mechanical
acceptance contract.

### 10.1 Completion requirements

DONE is prohibited while any applicable condition remains:

- WorkIntent is not `complete`;
- owned TODO/work is unfinished;
- a required child is active;
- a required terminal result is unreconciled;
- a required Oracle result or finding is unresolved;
- applicable validation is incomplete;
- a `CAUSED_BY_THIS_CHANGE` failure is unresolved;
- an `UNKNOWN` state is unresolved;
- the Git boundary is unknown; or
- required CI/review status has not been truthfully resolved.

CI/review queueing or dispatch is not PASS. Slim does not own an automatic
PR, merge, CI, or review state machine. External Git/CI/review facts must be
recorded truthfully.

### 10.2 Reconciliation wake

When a required child has a reliably observed terminal result that remains
`terminalUnreconciled`, the parent MAY be woken once so it can consume and
reconcile that result.

This reconciliation wake:

- is limited to result consumption, not normal autonomous continuation;
- originates only from the existing coordinator's canonical terminal outcome
  for `completed`, `error`, or `cancelled`, carrying the existing task ID,
  generation, parent, terminal state, and result occurrence;
- is deduplicated by that existing `(task ID, generation, terminal result
occurrence)` identity, with no second scheduler, job board, or wake ledger;
- remains subject to the existing real user-wait, fallback, and one-flight
  protections; it bypasses only the otherwise circular
  `terminalUnreconciled` continuation predicate for that one consumption;
- must not require `terminalUnreconciled = false` before waking the parent to
  reconcile that same result.

`stopped` without a native task result is not a canonical terminal outcome.
It remains on the existing stopped/unknown recovery path and MUST NOT trigger
this reconciliation wake. An uncertain or merely inferred child terminal state
is likewise not a terminal result.

### 10.3 Continuation wake

Normal autonomous continuation is permitted only after all required terminal
results have been reconciled and all applicable predicates hold:

- WorkIntent is `active`;
- unfinished owned work exists;
- no user wait is active;
- no required child is active;
- no fallback is active;
- no terminal reconciliation remains unresolved; and
- the existing continuation path can make progress.

Existing bounded no-progress behavior remains authoritative. Do not add an
aggressive OMO-style continuation loop. Human/user wait has higher authority
than autonomous continuation.

### 10.4 Restart and provider-recovery semantics

Existing behavior remains responsible for stopped/unreconciled child
classification, task result retrieval, safe task revive, orchestrator wake,
fallback, historical task rehydration, and durable progress reuse.

| Boundary                    | Required behavior                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin reload               | Reconstruct WorkIntent, reconstruct historical tasks, query real host runtime state, and do not duplicate dispatch.                                                                                        |
| Compaction                  | Preserve bounded WorkIntent and bounded task/reconciliation facts; do not rely on discarded free text.                                                                                                     |
| OpenCode process restart    | Restore only host-verifiable facts. Anything else remains `UNKNOWN` or the appropriate existing stopped/unreconciled classification. Do not infer success or redispatch merely because old history exists. |
| Provider fallback exhausted | Terminalize through existing semantics; do not fabricate success, retry forever, switch account silently, or mutate credentials/provider configuration.                                                    |

The final phase verifies these surfaces and their integration; it does not
replace them.

---

## 11. Real Runtime Acceptance Matrix

The final acceptance MUST be performed in a real OpenCode runtime, not solely via unit tests or integration simulation.

Evidence levels MUST be labeled as one of:

```text
UNIT
INTEGRATION_SIMULATION
REAL_RUNTIME
NOT_PROVEN
```

Never promote UNIT or INTEGRATION_SIMULATION evidence to REAL_RUNTIME.

### 11.1 Evidence fixture and capture

Every acceptance fixture MUST pin the exact OpenCode binary/version, Slim
candidate SHA, PTY/interactive host context, session ID, and relevant
logs/artifacts. The OpenCode version pin is an acceptance-fixture
reproducibility requirement, not a permanent production compatibility lock.

For each matrix case record trigger, expected state, actual state, duplicate
dispatch (`YES`/`NO`), whether human input was required, and evidence level.

### 11.2 Minimum fault-injection matrix

The final REAL_RUNTIME acceptance includes at least:

|   # | Case                                                               |
| --: | ------------------------------------------------------------------ |
|   1 | Parent idle with active WorkIntent.                                |
|   2 | Idle while WorkIntent is `waiting_for_user`.                       |
|   3 | Compaction during unfinished work and child activity.              |
|   4 | Plugin reload and historical reconstruction.                       |
|   5 | Child idle without a proven terminal result.                       |
|   6 | Duplicate lifecycle events and stale generation.                   |
|   7 | Configured fallback after retryable provider failure.              |
|   8 | Auth/provider failure or fallback exhaustion terminalization.      |
|   9 | Stalled background task, bounded supervisor, and safe revive.      |
|  10 | Large tool output with truncation and compaction.                  |
|  11 | Refusal to DONE with unfinished, unreconciled, or `UNKNOWN` state. |
|  12 | Truthful Git/CI/review handoff.                                    |
|  13 | Real successful Explorer result and reconciliation.                |
|  14 | Real successful Oracle result and reconciliation.                  |
|  15 | Hashline valid/stale/reanchor real-host sequence.                  |
|  16 | Bounded zero-human-intervention UltraWork acceptance Ticket.       |

The matrix must additionally show PASS for Slim plugin loading, profile/preset/
override reporting, `/slim-go`, `/slim-ag`, `/slim-profile`, `/deepwork`,
`/loop`, `/ultrawork`, UltraWork Skill discovery, normal native edit behavior,
and applicable validation. It must record credentials modified as `NO`.

### 11.3 Mandatory WorkIntent outcome assertions

The WorkIntent cases in the matrix MUST assert these concrete outcomes:

- an `active` WorkIntent permits one normal wake only when every Section 10.3
  predicate holds, and produces no duplicate dispatch;
- after compaction or reload, `waiting_for_user` produces no `promptAsync` or
  dispatch until normal processing of a real user message results in a new,
  canonical `active` record;
- a malformed, conflicting, truncated, or foreign latest candidate reconstructs
  to `UNKNOWN`, falls back to no older record, and produces no normal
  continuation;
- `stopped` without a native terminal result produces no reconciliation wake;
- a canonical unreconciled terminal result produces exactly one reconciliation
  wake per existing terminal-result occurrence, consumes/reconciles the result,
  and only then permits any separately eligible normal continuation.

### 11.4 Acceptance Ticket

The final real UltraWork Ticket SHOULD remain bounded and disposable.

It must be large enough to require:

- repository inspection;
- verification planning;
- at least one background specialist;
- implementation across more than a trivial single literal edit;
- tests/validation;
- Oracle review;
- final completion gating.

Do not use the live Slim source repository as the destructive dogfood target.

Hashline stale-edit chaos SHOULD remain a separate real-host check rather than being injected into the first autonomous UltraWork happy-path acceptance unless there is a specific reason to combine them.

---

## 12. Test Requirements

Implementation tickets MUST add only tests justified by concrete changed behavior.

At minimum, the final codebase needs regression coverage for:

1. `ultrawork` is available to the Orchestrator through the intended shared Skill authority.
2. Model-profile switching does not alter shared Skill availability.
3. Runtime authority reporting distinguishes model profile, preset, host override, and resolved model.
4. Accepted Hashline unit/integration coverage remains green.
5. Existing profile-switch tests remain green.
6. Existing Deepwork tests remain green.
7. Existing Loop tests remain green.
8. Existing background orchestration tests remain green.
9. Release artifact verification remains green.
10. WorkIntent parser accepts only a canonical bounded, current-session
    envelope; enforces origin/session provenance and all fixed limits; and uses
    host ordering without a timestamp/revision field.
11. The latest malformed, conflicting, truncated, or foreign WorkIntent
    candidate yields `UNKNOWN` with no fallback to an older record.
12. Compaction and plugin/session reload reconstruct valid WorkIntent without
    dispatching work; `waiting_for_user` suppresses normal wake after reload.
13. Normal wake permits an `active` WorkIntent only when existing predicates
    hold, while a canonical terminal result can issue its narrow reconciliation
    wake exactly once; `stopped` without a native result cannot issue it.
14. WorkIntent never independently derives DONE or `blocked`; existing
    completion/blocking authority must precede its record.

Required validation before final review:

```text
bun run check:ci
bun run typecheck
bun run build
bun run verify:release
bun test <targeted/affected tests>
bun test
```

Existing `check:ci` failures MUST be classified before broad remediation. Only
current V1-owned failures and failures that genuinely block final acceptance
may be fixed. If the applicable full suite has environment-dependent or
pre-existing failures, every failure must be classified:

- `CAUSED_BY_THIS_CHANGE`;
- `PRE_EXISTING`;
- `ENVIRONMENT_DEPENDENT`;
- `UNKNOWN`.

No unresolved `CAUSED_BY_THIS_CHANGE` or `UNKNOWN` failure is acceptable for completion.

---

## 13. Cache-Safety Requirement

Any implementation affecting agent prompts, tool surfaces, Skill discovery, configuration composition, or outgoing request payloads MUST respect `AGENTS.md` prompt-cache safety rules.

Do not introduce per-turn volatile content into stable prompt prefixes.

Any new transform that affects outgoing payload composition must be integrated into the repository's existing cache-safety harness and snapshot/tripwire coverage where applicable.

This phase should prefer configuration/registry wiring changes over new prompt mutation.

---

## 14. Documentation Requirements

After runtime behavior is mechanically proven, update documentation to distinguish clearly:

- model profile vs preset vs host model override;
- UltraWork command availability vs Skill discovery;
- Hashline capability availability vs Hashline enabled state;
- background dispatch/reconciliation vs successful specialist model execution;
- Oracle dispatch vs successful Oracle review;
- UNIT / INTEGRATION_SIMULATION / REAL_RUNTIME evidence.

Do not document a capability as real-runtime PASS based only on source inspection or tests.

---

## 15. Non-Goals

This specification does NOT authorize:

- a new agent architecture;
- redesign of UltraWork;
- replacement of Deepwork;
- replacement of Loop;
- new persistence storage;
- a WorkIntent JSON file, filesystem ledger, database, service, checkpoint
  store, file-lock protocol, garbage collector, or custom record-freshness
  sequence;
- new recovery state machine;
- new background scheduler;
- new completion manager;
- model-profile expansion beyond current accepted authority;
- automatic provider account purchase/top-up;
- OAuth changes;
- proxy changes;
- PowerShell host changes;
- OpenCode upgrade/downgrade;
- unrelated MCP redesign;
- unrelated Skill migration;
- merge to the default branch before final review.

---

## 16. Ticket Decomposition Contract

`/toticket` MUST decompose this specification into dependency-correct Tickets
that a lower-cost executor such as GPT-5.6 Luna can execute without having to
redesign the system. The old V2.1 graph is reference material only; this graph
must be decomposed from this frozen specification.

### 16.1 Required decomposition principles

Tickets MUST:

- follow dependency order rather than arbitrary numbering;
- separate code defects from acceptance/configuration work;
- avoid duplicating work already proven by real runtime;
- avoid one Ticket per prose section when multiple sections are one atomic seam;
- avoid combining unrelated runtime authorities into one giant Ticket;
- preserve the no-new-state-machine/no-new-persistence invariant;
- identify when a finding is potentially configuration-only and require diagnosis before code changes;
- include explicit `blocked_by` relationships;
- define a concrete acceptance boundary;
- define targeted tests and real-runtime evidence where required;
- specify files/areas likely owned without freezing implementation details prematurely.

Every Ticket MUST explicitly contain:

```text
IDENTITY: ID, title, Wave, risk, execution class
AUTHORITY: exact Spec sections and prior decisions/invariants
OBJECTIVE
PRECONDITIONS: blocked_by, required prior state/SHA/runtime prerequisites
IN SCOPE / OUT OF SCOPE
LIKELY FILES / OWNERSHIP SURFACES
CURRENT BEHAVIOR / REQUIRED BEHAVIOR
IMPLEMENTATION CONSTRAINTS / FAILURE SEMANTICS
NUMBERED ACCEPTANCE CRITERIA
TEST PLAN / DETERMINISTIC VALIDATION
REAL-RUNTIME EVIDENCE, when applicable
GIT BOUNDARY / NON-INTERFERENCE REQUIREMENTS
DEFINITION OF DONE / HANDOFF-REVIEW PACKET
MODEL ROUTING: recommended model, reasoning effort, reason, work type
```

`NO_CODE_CHANGE` is a valid Ticket outcome. Avoid both artificial micro-Tickets
and giant diagnosis-plus-implementation-plus-acceptance Tickets.

### 16.2 Expected decomposition shape

The graph must include code-change, diagnosis, runtime-proof, and final
acceptance Tickets. It will likely need independent lanes for concepts such as:

- runtime authority/profile/preset/override diagnosis and reporting;
- UltraWork Skill discovery wiring;
- Hashline resolved-config/peer/runtime activation and real-host proof;
- successful Explorer/Oracle provider routing probes and reconciliation proof;
- final bounded real-runtime UltraWork acceptance and evidence publication.

This list is a decomposition hint, **not a required Ticket list**.

`/toticket` should consolidate or split these only when repository dependency boundaries justify it.

### 16.3 Ticket review gate

After `/toticket`, independently review the graph for Spec coverage, no
invented or missing requirements, boundary clarity, non-overlapping ownership,
a valid DAG, mechanical acceptance, lower-cost executor clarity, preservation
of the no-new-orchestration invariant, and final Definition-of-Done coverage.
Repair graph-only defects autonomously. Return to the user only if repair
would require changing frozen product semantics or this specification.

Then:

```text
STOP
```

Do not implement any Ticket.

Implementation may begin only after the user receives an explicit review
verdict approving the frozen Ticket graph.

---

## 17. Definition of Done

Slim Unattended Reliability V1 is complete only when all of the following are true:

```text
UltraWork command                     PASS
UltraWork Skill discovery             PASS
Real bounded UltraWork run            PASS
Human interventions                   0
Successful Explorer child             PASS
Explorer reconciliation               PASS
Successful Oracle child               PASS
Oracle reconciliation                 PASS
Completion waits for required Oracle  PASS
Deepwork regression                   PASS
Loop regression                       PASS
Profile authority reporting           PASS
/slim-ag contract                     PASS
/slim-go contract                     PASS
Hashline enabled acceptance            PASS
Hashline read annotation              PASS
Hashline valid edit                    PASS
Hashline stale rejection              PASS
Hashline stale mutation               NO
Hashline reread/reanchor               PASS
Native edit regression                PASS
Restart/resume                        PASS
New runtime state machines            0
New persistence systems               0
Duplicate scheduler                   NO
Duplicate job board                   NO
Targeted tests                        PASS
Typecheck                             PASS
Build                                 PASS
Release artifact verification         PASS
Applicable full suite                 PASS or fully classified with no CAUSED/UNKNOWN
Credentials modified                  NO
Proxy modified                        NO
Git boundary                          PASS
Independent final review              PASS
```

Only then may the final review state:

```text
SAFE_TO_MERGE: YES
SAFE_FOR_LONG_UNATTENDED_REAL_PROJECT_DOGFOOD: YES
```

Until then:

```text
SAFE_TO_MERGE: NO
```

---

## 18. Required `/toticket` Output

The decomposition should return a review packet containing at least:

```text
SLIM_RUNTIME_WIRING_TICKET_GRAPH

Spec:
docs/planning/SLIM_RUNTIME_WIRING_ACCEPTANCE_SPEC_V1.md

Spec status:
APPROVED — FROZEN FOR TICKET DECOMPOSITION

Tickets:
- <ID>
  title: ...
  objective: ...
  blocked_by: ...
  scope: ...
  non_goals: ...
  acceptance: ...
  tests: ...
  real_runtime_evidence: ...
  likely_files: ...
  risk: LOW / MEDIUM / HIGH
  recommended_model: ...

Critical path:
...

Parallelizable lanes:
...

Architecture invariant check:
New runtime state machines proposed: <number>
New persistence systems proposed: <number>
Duplicate scheduler proposed: YES / NO
Duplicate job board proposed: YES / NO

Implementation started:
NO

READY_FOR_CHATGPT_TICKET_REVIEW:
YES
```

No Ticket implementation is authorized by this spec publication alone.
