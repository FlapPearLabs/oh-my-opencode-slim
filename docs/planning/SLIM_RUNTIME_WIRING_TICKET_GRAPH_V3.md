# Slim Runtime Wiring Ticket Graph V3

Status: **APPROVED — FROZEN FOR EXECUTION AFTER USER APPROVAL**

Authority: [Slim Runtime Wiring Acceptance Spec V1](SLIM_RUNTIME_WIRING_ACCEPTANCE_SPEC_V1.md), frozen at commit `16bb77f8209542a6bcc1ca11a48203867d8a3378`.

This is a new decomposition from the frozen V1 specification. It does not edit,
rename, or inherit authority from `SLIM_RUNTIME_WIRING_TICKET_GRAPH_V2_1.md`,
which is reference material only.

## Global execution boundary

- Every implementation ticket starts from the accepted predecessor SHA, preserves
  unrelated working-tree changes, and creates no scheduler, job board, daemon,
  persistence store, watchdog, completion engine, or provider/account runtime.
- A real-host ticket uses a disposable fixture; it does not mutate Slim source,
  credentials, account/proxy configuration, or unrelated OpenCode state.
- `NO_CODE_CHANGE` is a successful outcome where the evidence proves that the
  current host/configuration already satisfies the ticket.
- Before changing broadly, run the ticket's deterministic checks. Classify each
  existing validation failure as `CAUSED_BY_THIS_CHANGE`, `PRE_EXISTING`,
  `ENVIRONMENT_DEPENDENT`, or `UNKNOWN`; completion permits neither unresolved
  `CAUSED_BY_THIS_CHANGE` nor `UNKNOWN`.

## Dependency graph

```text
URV1-00 baseline classification
  ├─ URV1-01 WorkIntent carrier/seam probe ─ URV1-02 adapter/reconstruction ─ URV1-03 wake/reconciliation
  ├─ URV1-04 profile diagnosis ─ URV1-04A conditional profile correction
  ├─ URV1-05 UltraWork Skill discovery
  ├─ URV1-06 Hashline diagnosis ─ URV1-06A conditional Hashline correction ─ URV1-07 Hashline host proof
  └─ URV1-08 Explorer/Oracle provider-route proof

URV1-03, URV1-04, [URV1-04A if defect], URV1-05, URV1-06, [URV1-06A if defect]
  ├─ URV1-07 final-candidate Hashline host proof
  └─ URV1-08 final-candidate Explorer/Oracle route proof

URV1-07, URV1-08 ─ URV1-09 final-candidate matrix assembly/acceptance
  ─ URV1-10 independent review and documentation handoff
```

The WorkIntent lane is intentionally serial: the host carrier must be proven
before a minimal adapter is written, and the adapter must reconstruct correctly
before the existing wake seam is changed. Conditional `A` tickets exist only if
a preceding diagnosis proves a source defect; the other lanes are independent.

## Tickets

### URV1-00 — Baseline and validation classification

- **Identity:** Wave 0; LOW risk; `DIAGNOSIS / NO_CODE_CHANGE`.
- **Authority:** Spec §§2, 3, 11.1, 12, 16; all Global execution boundaries.
- **Objective:** Pin the exact candidate SHA and record the current executable
  validation baseline before any implementation or host fixture work.
- **Preconditions / blocked_by:** none. Required state: clean checkout of the
  frozen-spec descendant and an identified OpenCode binary/version for later
  real-host work.
- **In scope:** `bun run check:ci`, typecheck/build/release and affected-test
  availability; exact failure classification; fixture metadata template.
  **Out of scope:** fixing unrelated failures, changing dependencies, or running
  a destructive acceptance fixture.
- **Likely files / ownership surfaces:** no source owner expected; final evidence
  artifact path is selected under existing review/documentation conventions.
- **Current / required behavior:** checks may be unavailable in a fresh clone;
  the ticket must distinguish missing local prerequisites from repository
  failures. Required result is a truthful baseline, not an artificial green run.
- **Implementation constraints / failure semantics:** do not install, upgrade,
  or pin OpenCode merely to change a result. `UNKNOWN` failure classification
  blocks downstream acceptance.
- **Acceptance criteria:** 1. Record candidate SHA and `git status`. 2. Record
  exact commands, outputs, environment prerequisites, and classifications. 3.
  Identify the accepted OpenCode binary/version capture method. 4. Publish no
  code change unless a documentation-only baseline record is explicitly needed.
- **Test plan / deterministic validation:** run the applicable commands from
  Spec §12 and `git diff --check`; preserve raw outputs as evidence.
- **Real-runtime evidence:** not required; record `NOT_PROVEN` for host claims.
- **Git boundary / non-interference:** read-only unless an evidence document is
  explicitly requested; no credentials/configuration changes.
- **Definition of done / handoff-review packet:** exact SHA, command ledger,
  classified failures, fixture metadata template, and a `NO_CODE_CHANGE` or
  documented evidence commit.
- **Model routing:** GPT-5.6 Luna, low reasoning; mechanical baseline audit;
  `DIAGNOSIS`.

### URV1-01 — WorkIntent canonical carrier and lifecycle seam probe

- **Identity:** Wave 1; MEDIUM risk; `DIAGNOSIS / NO_CODE_CHANGE`.
- **Authority:** Spec §§3.1, 5.1–5.4, 10.4, 12.10–12.12, 16.
- **Objective:** Prove the exact existing OpenCode session-history carrier and
  Slim transform/rehydration seams that can persist and reconstruct one bounded
  `slim.work-intent.v1` tool/result envelope without a new storage system.
- **Preconditions / blocked_by:** URV1-00. Required state: frozen-spec SHA and
  a local host/runtime fixture capable of showing session-history records.
- **In scope:** inspect host history ordering (`time_created`, then host message
  ID), tool/result envelopes, session binding, compaction hook, and current
  message-history transform. Produce a source/evidence map for URV1-02.
  **Out of scope:** adding a carrier, writing a record, touching wake logic, or
  treating free text/outbound synthetic transforms as persistence.
- **Likely files / ownership surfaces:** `src/index.ts` transform wiring,
  `src/utils/task-session-manager/`, OpenCode history API adapter, and existing
  compaction hook registration; exact files are findings, not assumptions.
- **Current / required behavior:** current host history is authoritative but no
  WorkIntent exists. Required proof identifies a Slim-controlled tool/result
  envelope that is actually retained in the current session, and rejects an
  unsuitable seam.
- **Implementation constraints / failure semantics:** no DB/files/locks/revision
  sequence. If the carrier cannot prove current-session provenance, ordering, or
  compaction survival, report `BLOCKED_BY_HOST_SEAM` rather than inventing one.
- **Acceptance criteria:** 1. Identify the canonical host part and session-ID
  binding. 2. Demonstrate ordering/tie-break source. 3. Demonstrate how the
  latest record can be retained across `experimental.session.compacting`. 4.
  Demonstrate why synthetic output/free text is rejected. 5. Give a bounded
  envelope feasibility result (8 KiB and field caps) for URV1-02.
- **Test plan / deterministic validation:** source-level trace plus a minimal
  non-mutating fixture/history inspection; preserve input/output samples.
- **Real-runtime evidence:** `INTEGRATION_SIMULATION` or `REAL_RUNTIME` only if
  a real session history is inspected; otherwise label it `NOT_PROVEN`.
- **Git boundary / non-interference:** no source/config/credential changes; no
  dispatch is authorized.
- **Definition of done / handoff-review packet:** carrier decision, exact seam
  map, evidence samples, rejected alternatives, and explicit go/no-go for
  URV1-02.
- **Model routing:** GPT-5.6 Luna, medium reasoning; bounded code/runtime
  investigation; `DIAGNOSIS`.

### URV1-02 — Minimal WorkIntent adapter and reconstruction

- **Identity:** Wave 2; HIGH risk; `CODE_CHANGE`.
- **Authority:** Spec §§3.1, 5.1–5.5, 10.1, 10.4, 11.3, 12.10–12.14, 13, 15.
- **Objective:** Add only the bounded WorkIntent adapter selected by URV1-01:
  write/read canonical session-history envelopes and reconstruct a safe in-memory
  view through compaction and plugin/session reload.
- **Preconditions / blocked_by:** URV1-00 and URV1-01 with a proven carrier.
  Required state: clean implementation worktree at the accepted predecessor SHA.
- **In scope:** schema, fixed origin marker and current-session binding, field
  limits, host ordering, `UNKNOWN` reconstruction, and existing transform/
  rehydration integration. **Out of scope:** scheduling, dispatch, job records,
  filesystem/database persistence, revision/timestamp scheme, and completion
  inference.
- **Likely files / ownership surfaces:** new small WorkIntent helper adjacent to
  existing session-history utilities; `src/index.ts` lifecycle registration;
  existing compaction/transform seam; focused tests. Final names follow the
  URV1-01 seam map.
- **Current / required behavior:** no canonical WorkIntent is reconstructed.
  Required behavior selects exactly one newest record from historical canonical
  candidates by host order, and yields `UNKNOWN` for a malformed, conflicting,
  truncated, foreign, or cross-session latest candidate without fallback.
- **Implementation constraints / failure semantics:** serialized envelope <=8
  KiB; objective/success criteria <=2,000 chars each; phaseRef <=1,000;
  evidenceRefs <=8x256. `complete`/`blocked` only record existing authority;
  reload never dispatches work. Preserve prompt-cache safety.
- **Acceptance criteria:** 1. Valid canonical current-session envelope round
  trips. 2. Fixed bounds and provenance reject invalid records. 3. Host order
  selects the newest record without a new timestamp/revision. 4. Latest invalid
  candidate yields `UNKNOWN` and never falls back. 5. Valid state survives
  compaction/reload as an in-memory reconstruction. 6. No dispatch occurs due
  only to reconstruction.
- **Test plan / deterministic validation:** focused parser/order/bounds/provenance
  tests; compaction/reload fixture; `git diff --check`, affected tests, and
  applicable baseline commands from URV1-00.
- **Real-runtime evidence:** integration evidence is required here; final
  real-host proof is deferred to URV1-09.
- **Git boundary / non-interference:** no unrelated refactor; no files/DB/locks;
  preserve unrelated dirty changes and configuration.
- **Definition of done / handoff-review packet:** focused diff, test results,
  schema/limit evidence, compaction/reload result, cache-safety result, and
  explicit proof of zero new runtime subsystems.
- **Model routing:** GPT-5.6 Sol, high reasoning; state/provenance safety in a
  small adapter; `CODE_CHANGE`.

### URV1-03 — WorkIntent-aware wake and terminal reconciliation integration

- **Identity:** Wave 3; HIGH risk; `CODE_CHANGE`.
- **Authority:** Spec §§3.1, 5.5, 8.3, 9.2, 10.1–10.4, 11.2–11.3, 12.13–12.14.
- **Objective:** Gate the existing normal orchestrator wake by reconstructed
  WorkIntent and add the narrow, exactly-once reconciliation wake for reliably
  observed canonical terminal results.
- **Preconditions / blocked_by:** URV1-00 and URV1-02. Required state: adapter
  handoff shows valid/UNKNOWN reconstruction behavior and existing task lifecycle
  generation/result-occurrence seam is mapped.
- **In scope:** existing wake evaluation before normal `promptAsync`; existing
  coordinator terminal outcome for `completed`/`error`/`cancelled`; use of the
  task ID, generation, parent, and terminal result occurrence for one
  reconciliation consumption. **Out of scope:** changing task ownership,
  inventing a wake queue/ledger, retries, provider fallback, or a new loop.
- **Likely files / ownership surfaces:** `src/hooks/orchestrator-wake/`,
  `src/index.ts` lifecycle listener, `src/utils/background-job-coordinator.ts`,
  existing job-board result fields, and focused wake/background tests.
- **Current / required behavior:** normal wake lacks WorkIntent authority; a
  stopped-job path is not a native terminal result. Required behavior suppresses
  normal continuation for no record/`UNKNOWN`/`waiting_for_user`/`complete`/
  `blocked`; `active` still needs all existing predicates. It wakes once only
  to consume a canonical unreconciled terminal result, never for `stopped`
  without native result.
- **Implementation constraints / failure semantics:** reconciliation wake remains
  subject to existing real user-wait, fallback, and one-flight protections; only
  the circular unreconciled-result gate is bypassed. A user message does not
  blindly set `active`; an authorized normal path writes it. Completion is still
  determined by existing authority before WorkIntent records `complete`.
- **Acceptance criteria:** 1. Normal wake checks the reconstructed view after
  host snapshot and before final prompt decision. 2. Waiting/complete/blocked/
  UNKNOWN never normal-dispatch after reload. 3. Active state normal-dispatches
  once only when existing predicates pass. 4. Canonical terminal outcome wakes
  parent exactly once per `(task ID,generation,result occurrence)`, reconciles,
  then permits separately eligible continuation. 5. `stopped` without native
  result receives no reconciliation wake. 6. Duplicate/stale lifecycle events
  produce no duplicate dispatch. 7. DONE remains prohibited for unresolved
  result, TODO, validation, Oracle, Git/CI/review, or UNKNOWN facts.
- **Test plan / deterministic validation:** focused wake tests for all states;
  duplicate/stale generation; terminal/reconcile order; stopped/no-result;
  user-wait/fallback/one-flight; affected background tests and check suite.
- **Real-runtime evidence:** integration proof required; full fault injection and
  zero-human final proof are URV1-09.
- **Git boundary / non-interference:** touch only mapped existing seams; no
  automatic Git/CI/review action, no credentials, no scheduler/job board.
- **Definition of done / handoff-review packet:** reviewed diff, before/after
  predicate trace, test ledger, duplicate-dispatch result, and explicit
  reconciliation-vs-continuation evidence.
- **Model routing:** GPT-5.6 Sol, high reasoning; safety-critical integration;
  `CODE_CHANGE`.

### URV1-04 — Profile authority and reporting diagnosis

- **Identity:** Wave 1; MEDIUM risk; `DIAGNOSIS / NO_CODE_CHANGE`.
- **Authority:** Spec §§3.3, 4.1–4.5, 11.2, 12.2–12.5, 15.
- **Objective:** Determine whether profile/preset/host-override reporting or
  profile-switch behavior violates the authority model, and produce a bounded
  handoff only if a source defect is proven.
- **Preconditions / blocked_by:** URV1-00. Required state: a fixture with an
  explicit user-owned override and a known Slim-managed stale override case.
- **In scope:** reporting of the six required values; precedence; `/slim-go` and
  `/slim-ag` staged/active behavior. **Out of scope:** new provenance storage,
  model mapping redesign, credentials, or profile expansion.
- **Likely files / ownership surfaces:** profile configuration, profile commands,
  reporting/status surface, and existing profile tests; exact seam is confirmed
  by diagnosis.
- **Current / required behavior:** existing output can conflate concepts.
  Required behavior reports `MODEL_PROFILE_ACTIVE`, `MODEL_PROFILE_STAGED`,
  `PRESET`, `HOST_ORCHESTRATOR_OVERRIDE`, `RESOLVED_ORCHESTRATOR_MODEL`, and
  `RESOLUTION_AUTHORITY` separately with precedence user override > Slim profile
  > preset > default.
- **Implementation constraints / failure semantics:** no source/config change is
  authorized. A proven defect must identify the exact seam and failure fixture
  for URV1-04A; otherwise close `NO_CODE_CHANGE`.
- **Acceptance criteria:** 1. Diagnose intentional override versus defect. 2.
  All six values are separately reported. 3. Profile switch preserves unknown
  host override. 4. Proven stale Slim override alone is clearable. 5. Shared
  Skill/orchestration behavior is unchanged. 6. A proven defect has a minimal,
  testable URV1-04A handoff; it is not repaired here.
- **Test plan / deterministic validation:** profile precedence/switch fixtures
  and affected existing tests; no test may rely on conflated labels.
- **Real-runtime evidence:** inspect reporting before and after required restart
  in a real host; label no-host evidence `NOT_PROVEN`.
- **Git boundary / non-interference:** no source/account/provider/config
  mutation; no prompt/Skill behavioral change.
- **Definition of done / handoff-review packet:** diagnosis, authority matrix,
  `NO_CODE_CHANGE` verdict or exact URV1-04A source/test handoff, and host
  output capture.
- **Model routing:** GPT-5.6 Luna, medium reasoning; constrained configuration
  diagnosis; `DIAGNOSIS / NO_CODE_CHANGE`.

### URV1-04A — Conditional profile authority/reporting correction

- **Identity:** Wave 2; MEDIUM risk; `CODE_CHANGE`, created only when URV1-04
  proves a source defect.
- **Authority:** Spec §§3.3, 4.1–4.5, 12.2–12.5, 13, 15; URV1-04 handoff.
- **Objective:** Correct only the proven profile authority/reporting defect and
  add its focused regression coverage.
- **Preconditions / blocked_by:** URV1-04 must provide a reproduced defect,
  exact seam, and approved minimal acceptance fixture; otherwise this ticket is
  skipped and URV1-04 is the terminal `NO_CODE_CHANGE` result.
- **In scope:** the exact reporting/profile-switch seam proven by URV1-04 and
  its focused tests. **Out of scope:** a provenance database, profile redesign,
  model mapping change, credentials, or behavior changes outside the defect.
- **Likely files / ownership surfaces:** only URV1-04-identified profile command,
  reporting, configuration, and test files.
- **Current / required behavior:** the documented reproduced defect is current;
  required behavior reports the six authority values separately and preserves
  user-explicit/unknown override while clearing only proven Slim stale state.
- **Implementation constraints / failure semantics:** no new persistent override
  ownership mechanism; ambiguity preserves host state and reports conflict.
- **Acceptance criteria:** 1. Reproduce URV1-04 defect before change. 2. Apply
  smallest correction. 3. Pass precedence/switch regression fixtures. 4. Prove
  no shared Skill/orchestration behavior drift. 5. Demonstrate target host output.
- **Test plan / deterministic validation:** URV1-04 fixture plus affected tests,
  cache-safety checks where applicable, and baseline validation classification.
- **Real-runtime evidence:** required only for changed reporting/profile switch;
  capture pre/post host output and restart semantics.
- **Git boundary / non-interference:** no credentials/provider/proxy mutation and
  no unrelated configuration cleanup.
- **Definition of done / handoff-review packet:** minimal diff, reproduced bug,
  tests, host evidence, and explicit no-new-subsystem confirmation.
- **Model routing:** GPT-5.6 Luna, medium reasoning; localized config/reporting
  fix; `CODE_CHANGE`.

### URV1-05 — UltraWork Skill discovery policy wiring

- **Identity:** Wave 1; MEDIUM risk; `CODE_CHANGE`.
- **Authority:** Spec §§3.2–3.3, 6.1–6.4, 12.1–12.3, 13, 15.
- **Objective:** Make `ultrawork` discoverable through the normal Orchestrator
  bundled Skill path wherever default/wildcard/explicit policy permits it,
  without bypassing an explicit deny-by-omission allowlist.
- **Preconditions / blocked_by:** URV1-00. Required state: source trace of the
  existing Skill registry/filter and representative default/wildcard/explicit
  allowlist fixtures.
- **In scope:** shared Skill authority, relevant preset allowlists, discovery
  filter, focused regression coverage. **Out of scope:** another UltraWork
  engine/Skill copy, profile-specific behavior, changing explicit user policy,
  or command semantics.
- **Likely files / ownership surfaces:** `src/hooks/filter-available-skills/`,
  shared Skill registry/metadata, relevant preset configuration, and tests.
- **Current / required behavior:** `/ultrawork` command works but discovery may
  omit it. Required behavior exposes it when policy permits and retains
  Deepwork, verification-planning, worktrees, codemap, clonedeps, and intended
  peers.
- **Implementation constraints / failure semantics:** explicit allowlist that
  omits `ultrawork` must continue to hide it; no silent permission bypass and no
  volatile prompt-prefix content.
- **Acceptance criteria:** 1. Default policy includes `ultrawork`. 2. Wildcard
  includes it. 3. Explicit inclusion includes it. 4. Explicit omission hides
  it. 5. Existing peer skills remain discoverable. 6. Model profile switching
  does not alter this behavior.
- **Test plan / deterministic validation:** discovery matrix tests, cache-safety
  snapshots/tripwire where the existing hook requires them, and affected suites.
- **Real-runtime evidence:** active session `available_skills` inspection for
  permitted and explicitly omitted cases.
- **Git boundary / non-interference:** no command rewrite, no new skill copies,
  no unrelated permission/config changes.
- **Definition of done / handoff-review packet:** small diff, discovery matrix,
  affected test results, cache-safety evidence, and runtime capture.
- **Model routing:** GPT-5.6 Luna, medium reasoning; focused registry wiring;
  `CODE_CHANGE`.

### URV1-06 — Hashline resolved-configuration and peer diagnosis

- **Identity:** Wave 1; LOW risk; `DIAGNOSIS / NO_CODE_CHANGE`.
- **Authority:** Spec §§3.4, 7.1–7.2, 7.6, 11.2, 12.4, 15.
- **Objective:** Classify the absent Hashline tool/read annotation before any
  code change as disabled configuration, absent optional peer, registration bug,
  configuration-resolution bug, or another proven defect.
- **Preconditions / blocked_by:** URV1-00. Required state: controlled fixture
  with normal Slim configuration authority and exact loaded runtime path.
- **In scope:** resolved `hashline_edit`, optional peer resolution, registration,
  native read/edit/apply-patch behavior. **Out of scope:** reimplementing
  Hashline, bundling the optional peer, changing default enablement, or editing
  unrelated host configuration.
- **Likely files / ownership surfaces:** current Hashline hook, runtime config
  resolution, package optional-peer metadata, and existing Hashline tests.
- **Current / required behavior:** prior host lacked the feature. Required result
  is a root-cause classification and, only if proven code defect, an exact
  URV1-06A handoff that preserves optional packaging/degradation behavior.
- **Implementation constraints / failure semantics:** no source/configuration
  change is authorized. Disabled optional feature is not a code failure; missing
  peer must degrade clearly without plugin crash. No upstream Hashline algorithm
  rewrite.
- **Acceptance criteria:** 1. Record resolved config. 2. Record peer presence
  from actual loaded runtime. 3. Record tool registration and native read state. 4. Classify one cause with evidence. 5. If a source defect is proven, give
  URV1-06A the exact seam and acceptance fixture; do not repair it here.
- **Test plan / deterministic validation:** existing Hashline tests plus focused
  config/peer fixture; run affected checks only after diagnosis.
- **Real-runtime evidence:** preliminary tool/read observation; complete stale
  sequence is URV1-07.
- **Git boundary / non-interference:** do not change project default, credentials,
  or unrelated OpenCode config; `NO_CODE_CHANGE` remains valid.
- **Definition of done / handoff-review packet:** classification, resolved-config
  evidence, peer evidence, `NO_CODE_CHANGE` verdict or URV1-06A handoff, and
  URV1-07-ready fixture instructions.
- **Model routing:** GPT-5.6 Luna, low reasoning; mechanical optional-feature
  diagnosis; `DIAGNOSIS / NO_CODE_CHANGE`.

### URV1-06A — Conditional Hashline runtime correction

- **Identity:** Wave 2; MEDIUM risk; `CODE_CHANGE`, created only when URV1-06
  proves a source registration/configuration-resolution defect.
- **Authority:** Spec §§3.4, 7.1–7.2, 7.6, 12.4, 13, 15; URV1-06 handoff.
- **Objective:** Correct only the diagnosed Hashline runtime defect while
  retaining optional-peer packaging and disabled-by-default behavior.
- **Preconditions / blocked_by:** URV1-06 must provide a reproduced source
  defect, exact owning seam, and focused acceptance fixture; otherwise skip this
  ticket and use the URV1-06 `NO_CODE_CHANGE` outcome.
- **In scope:** the proven Hashline config/registration seam and focused tests.
  **Out of scope:** Hashline algorithm rewrite, bundling the peer, default-enable,
  unrelated OpenCode config, or credentials.
- **Likely files / ownership surfaces:** only URV1-06-identified Hashline hook,
  configuration resolution, optional peer metadata, and tests.
- **Current / required behavior:** diagnosed defect prevents enabled capability.
  Required behavior registers the existing additive feature when configuration
  and compatible peer are present; disabled/missing-peer paths remain safe.
- **Implementation constraints / failure semantics:** no peer bundling; enabled
  without peer gives actionable degradation, not plugin crash; native tools stay
  independent; no configuration persistence is introduced.
- **Acceptance criteria:** 1. Reproduce defect. 2. Apply smallest correction. 3. Prove disabled normal load. 4. Prove enabled/missing peer degradation. 5.
  Pass existing/focused Hashline tests. 6. Hand off an enabled fixture to URV1-07.
- **Test plan / deterministic validation:** existing Hashline tests, focused
  resolved-config/registration fixture, affected validation from URV1-00.
- **Real-runtime evidence:** preliminary active-tool/read proof required; full
  TAG1/TAG2 stale sequence remains URV1-07.
- **Git boundary / non-interference:** no default change, peer vendoring,
  credential change, or unrelated host configuration mutation.
- **Definition of done / handoff-review packet:** minimal diff, reproduced bug,
  disabled/missing-peer results, test ledger, and URV1-07 fixture pin.
- **Model routing:** GPT-5.6 Luna, medium reasoning; localized optional-feature
  fix; `CODE_CHANGE`.

### URV1-07 — Hashline real-host valid/stale/reanchor proof

- **Identity:** Wave 4; MEDIUM risk; `REAL_RUNTIME_PROOF`.
- **Authority:** Spec §§3.4, 7.2–7.6, 11.1–11.2, 12.4, 15.
- **Objective:** In a controlled real host, prove Hashline tool availability,
  read annotation, valid edit, stale rejection without mutation, reread/reanchor
  recovery, and native edit/apply-patch independence.
- **Preconditions / blocked_by:** URV1-00, URV1-03, URV1-04, URV1-05, and
  URV1-06, plus URV1-04A/URV1-06A only when their diagnoses proved source
  defects. Required state: the final runtime candidate SHA is frozen, all
  runtime source changes are reviewed, and a valid enabled peer/config fixture
  is available.
- **In scope:** disposable workspace and true host `read`/`hashline_edit`/native
  tool interactions. **Out of scope:** changing Hashline source except a prior
  URV1-06A defect fix; using the live Slim source as target.
- **Likely files / ownership surfaces:** no production source expected; fixture
  file and evidence artifact only.
- **Current / required behavior:** tool/annotation was unproven. Required
  behavior produces `[path#TAG]`, accepts current tag, rejects TAG1 after a
  legitimate mutation without touching the file, then accepts TAG2 after reread.
- **Implementation constraints / failure semantics:** the native tools must work
  without a tag; BOM/CRLF/seen-lines/workspace-safety coverage remains intact.
  A missing tool or unannotated native read is a failure, not a simulated pass.
- **Acceptance criteria:** 1. Pin runtime/Slim SHA/session. 2. Capture read TAG1. 3. Capture valid edit. 4. Mutate legitimately and prove stale rejection/no
  mutation. 5. Capture TAG2 and successful reanchor edit. 6. Prove native edit
  and applicable apply-patch independence. 7. Record evidence level REAL_RUNTIME.
- **Test plan / deterministic validation:** byte/line comparison before and after
  rejected edit; existing Hashline regression suite; fixture cleanup validation.
- **Real-runtime evidence:** mandatory, interactive PTY/session logs plus file
  hashes/diffs and tool outputs.
- **Git boundary / non-interference:** disposable repo only; no credentials,
  configuration persistence, or changes to Slim source in proof run.
- **Definition of done / handoff-review packet:** final-candidate SHA, exact
  fixture metadata, full tool transcript, stale/no-mutation proof, native-tool
  proof, and test ledger. Any later runtime-source SHA invalidates this proof.
- **Model routing:** GPT-5.6 Luna, medium reasoning; controlled host acceptance;
  `REAL_RUNTIME_PROOF`.

### URV1-08 — Explorer/Oracle provider-route and reconciliation proof

- **Identity:** Wave 4; MEDIUM risk; `REAL_RUNTIME_PROOF / DIAGNOSIS`.
- **Authority:** Spec §§3.5, 8.1–8.3, 9.1, 10.2–10.4, 11.2, 12.8, 15.
- **Objective:** Prove a viable configured route for one real Explorer and one
  real Oracle result and parent reconciliation; classify resource failures
  truthfully without route/account mutation or duplicate respawn.
- **Preconditions / blocked_by:** URV1-00, URV1-03, URV1-04, and URV1-05, plus
  URV1-04A only when URV1-04 proved a source defect. Required state: final
  runtime candidate SHA is frozen, a controlled route is already available to
  the user/host, and a disposable repository has a small non-trivial Oracle diff.
- **In scope:** per-child agent/provider/model/resolution-authority/terminal
  status/provider-error/parent-reconciliation evidence; existing failure and
  bounded fallback behavior. **Out of scope:** buying/top-up, OAuth/proxy edits,
  hidden provider switching, or a new fallback manager.
- **Likely files / ownership surfaces:** no source change expected; existing
  background task and provider diagnostics are handoff-only if a source defect
  is proven.
- **Current / required behavior:** prior calls reached terminal `Insufficient
balance` and were reconciled. Required behavior classifies that as
  `EXTERNAL_PROVIDER_RESOURCE_FAILURE` when routing is correct, while final
  acceptance needs successful Explorer and Oracle outputs.
- **Implementation constraints / failure semantics:** provider resource failure
  must terminalize through existing behavior, never fabricate success, retry
  forever, silently switch accounts, or duplicate dispatch. A discovered source
  defect is `BLOCKED_FOR_NEW_CODE_TICKET`, not authorization to patch here.
- **Acceptance criteria:** 1. Capture all seven required fields for each child. 2. Produce useful real Explorer result and parent reconciliation. 3. Produce
  real Oracle review and parent reconciliation. 4. If a resource failure occurs,
  classify it truthfully and record bounded/no-duplicate behavior. 5. Do not
  call a terminal error successful specialist work.
- **Test plan / deterministic validation:** background result/reconciliation
  checks; if a source defect is discovered, preserve a fixture for a separately
  authorized code ticket rather than changing source.
- **Real-runtime evidence:** mandatory real child/session IDs, provider/model
  calls, child outputs, and parent consumption records.
- **Git boundary / non-interference:** no credentials/account/proxy/config edits;
  use disposable repo; no production PR/merge action.
- **Definition of done / handoff-review packet:** final-candidate SHA, two
  successful result records, reconciliation evidence, failure classification if
  observed, duplicate count, and `NO_CODE_CHANGE` or a precise blocked-for-new-
  ticket handoff. Any later runtime-source SHA invalidates this proof.
- **Model routing:** GPT-5.6 Sol, medium reasoning; external-route evidence and
  safety classification; `REAL_RUNTIME_PROOF / DIAGNOSIS`.

### URV1-09 — Final-candidate bounded unattended acceptance assembly

- **Identity:** Wave 5; HIGH risk; `FINAL_REAL_RUNTIME_ACCEPTANCE`.
- **Authority:** Spec §§2–15, especially §§9.2, 10.1–10.4, 11.1–11.4, 12–14,
  17; this entire frozen graph.
- **Objective:** Assemble and execute the bounded, disposable, zero-human-
  intervention UltraWork acceptance matrix on one final runtime candidate SHA,
  filling only cases not already proven by same-SHA prerequisite evidence.
- **Preconditions / blocked_by:** URV1-00, URV1-03, URV1-04, URV1-05, URV1-07,
  and URV1-08, plus URV1-04A only if URV1-04 proved a source defect. Required
  state: all source changes reviewed/clean, one frozen final runtime candidate
  SHA, viable specialist route, controlled Hashline fixture, and no unresolved
  `CAUSED_BY_THIS_CHANGE`/`UNKNOWN` validation failure.
- **In scope:** real runtime fixture pins; all 16 cases; completion discipline;
  successful Explorer/Oracle; Hashline proof incorporation; truthful Git/CI/
  review handoff; final runtime evidence. **Out of scope:** implementation of
  deferred defects, documentation claims, default-branch merge, actual
  PR/CI/review automation, credential/configuration changes, or new runtime
  machinery.
- **Likely files / ownership surfaces:** disposable fixture and existing review
  artifact location only; source files require a new Ticket if a defect appears.
- **Current / required behavior:** several components are individually proven or
  classified, but no cohesive same-SHA fault-injection proof exists. Required
  behavior meets every Spec §11 matrix outcome without treating simulation as
  real runtime or reusing stale evidence.
- **Implementation constraints / failure semantics:** a failed case stops final
  acceptance and is classified; do not patch opportunistically. A prerequisite
  proof whose runtime SHA differs from the final candidate is stale and must be
  re-executed here. Continuation is bounded: no aggressive loop, normal
  continuation only after reconciliation; reconciliation wake remains distinct
  and exactly-once. DONE is prohibited while any applicable Spec §10.1 fact
  remains unresolved.
- **Acceptance criteria:** 1. Pin binary/version, candidate SHA, PTY/session,
  logs and artifacts. 2. Assemble cases 1–16 with trigger/expected/actual,
  duplicate dispatch and human-input fields. 3. Reuse #13/#14 only from URV1-08
  and #15 only from URV1-07 when their runtime SHA equals this candidate;
  otherwise rerun them. 4. Execute every remaining same-SHA matrix case. 5.
  Assert all five concrete WorkIntent outcomes in §11.3. 6. Prove profile
  reporting, commands, UltraWork discovery, native edit, and applicable
  validation. 7. Prove required Oracle completion order. 8. Record credentials
  modified `NO`. 9. Classify all check failures and resolve all caused/unknown
  ones. 10. Produce truthful Git/CI/review state without calling queued work PASS.
- **Test plan / deterministic validation:** full Spec §12 command ledger plus
  affected tests, matrix fixture assertions, `git diff --check`, exact SHA/clean
  boundary checks, and evidence artifact integrity checks.
- **Real-runtime evidence:** mandatory for every matrix case; `UNIT` or
  `INTEGRATION_SIMULATION` is supplemental only and never substitutes for it.
- **Git boundary / non-interference:** no destructive use of Slim source; no
  merge/default-branch action; no credentials, provider account, OAuth, proxy,
  or unrelated user-tree mutation.
- **Definition of done / handoff-review packet:** final matrix with evidence
  levels, raw artifacts, validation classifications, exact candidate SHA,
  remaining external blockers if any, and architecture-invariant count. A failed
  external provider route is reported as an external blocker, never converted
  into a false PASS. Handoff is to URV1-10; this ticket cannot issue `SAFE_*`.
- **Model routing:** GPT-5.6 Sol, high reasoning; high-stakes integration and
  acceptance synthesis; `FINAL_REAL_RUNTIME_ACCEPTANCE`.

### URV1-10 — Independent final review and documentation handoff

- **Identity:** Wave 6; HIGH risk; `INDEPENDENT_REVIEW / DOCUMENTATION`.
- **Authority:** Spec §§11.1–11.4, 12–14, 16.3, 17; URV1-09 exact candidate-SHA
  evidence packet.
- **Objective:** Independently review final real-runtime evidence on its exact
  runtime candidate SHA `C`, then update documentation in a documentation-only
  descendant `D` using only mechanically proven, correctly classified results.
- **Preconditions / blocked_by:** URV1-09. Required state: clean exact runtime
  candidate SHA `C`, complete final matrix/artifacts, validation classifications,
  and an independent reviewer who did not execute URV1-09. Documentation SHA
  `D` may be created only after review of `C` and must descend from `C`.
- **In scope:** same-runtime-SHA review; Spec §14 documentation updates distinguishing
  profile/preset/host override, UltraWork command/Skill discovery, Hashline
  availability/enabled state, dispatch/reconciliation/successful specialist
  execution, Oracle dispatch/successful review, and evidence levels. **Out of
  scope:** source fixes, rerunning an implementation lane, merge/PR/CI action,
  or upgrading a failed/unknown fact to PASS.
- **Likely files / ownership surfaces:** existing user/runtime documentation and
  final review artifact location; no runtime source file.
- **Current / required behavior:** evidence may exist without an independent
  same-runtime-SHA verdict or documentation distinction. Required behavior
  preserves `UNIT`, `INTEGRATION_SIMULATION`, `REAL_RUNTIME`, and `NOT_PROVEN`
  truthfully.
- **Implementation constraints / failure semantics:** documentation cannot claim
  a real-runtime PASS from source inspection or tests. `D` may change only
  documentation/review artifacts; it must prove `C` is an ancestor and that no
  runtime source changed in `C..D`. A missing, inconsistent, or failed matrix
  artifact yields review failure/blocker; it is not repaired by speculative prose
  or source edits.
- **Acceptance criteria:** 1. Verify `C` equals every URV1-09 matrix runtime
  evidence SHA. 2. Audit all 16 matrix rows, WorkIntent outcomes, validation
  classifications, architecture counts, and non-interference claims. 3. Update
  all six Spec §14 distinctions only where evidence supports them, producing `D`. 4. Verify `C` is an ancestor of `D` and `C..D` contains no runtime source
  change. 5. Produce independent PASS or a precise blocker. 6. Only PASS may
  state `SAFE_TO_MERGE: YES` and
  `SAFE_FOR_LONG_UNATTENDED_REAL_PROJECT_DOGFOOD: YES`, recording both `C` and
  `D`.
- **Test plan / deterministic validation:** verify artifact hashes/paths, run
  `git diff --check`, confirm docs map to cited evidence, `git merge-base --is-
ancestor C D`, and diff `C..D` to verify only documentation/review artifacts.
- **Real-runtime evidence:** reviews URV1-09 evidence; performs no substitute
  simulation. Missing real-host evidence remains `NOT_PROVEN`.
- **Git boundary / non-interference:** documentation/review changes only; no
  source, default-branch, credential, provider, proxy, or host config mutation.
- **Definition of done / handoff-review packet:** independent review verdict for
  runtime SHA `C`, documentation/review SHA `D`, proof that `C` is an ancestor
  and no runtime source changed in `C..D`, documentation diff, evidence map,
  `SAFE_*` values, and remaining blockers. This is the sole graph exit for a
  final acceptance verdict.
- **Model routing:** GPT-5.6 Sol, high reasoning; independent evidence review and
  precise documentation; `INDEPENDENT_REVIEW / DOCUMENTATION`.

## Graph invariants and freeze gate

| Invariant                                                | Graph result  |
| -------------------------------------------------------- | ------------- |
| New runtime state machines                               | 0             |
| New persistence systems                                  | 0             |
| New scheduler / job board / watchdog / completion engine | 0 / 0 / 0 / 0 |
| Duplicate UltraWork engine                               | 0             |
| Provider/account orchestration                           | 0             |
| Implementation begun by this graph                       | NO            |

The graph passed independent review and is frozen. No Ticket authorizes
implementation until the user approves execution.
