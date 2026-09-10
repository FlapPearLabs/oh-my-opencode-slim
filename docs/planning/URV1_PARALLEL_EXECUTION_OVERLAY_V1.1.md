# URV1 Parallel Execution Overlay V1.1

> **NON-NORMATIVE PLANNING DOCUMENT**
>
> This document is a non-normative construction scheduling overlay. It does **not** modify, supersede, or weaken the frozen Acceptance Spec (`16bb77f8209542a6bcc1ca11a48203867d8a3378`) or the frozen Ticket Graph (`9bac2333d5a2963a05f39e130fffc587336096c9`).
>
> All frozen semantic invariants, acceptance requirements, and verification gates remain strictly authoritative. This overlay only identifies which implementation preparation and scaffolding activities may safely proceed concurrently without mutating shared production surfaces or bypassing final exact-SHA acceptance sequencing.

---

## 1. Executive Result

**Verdict:** `PARALLELIZATION_READY`

Construction scheduling can be safely parallelized into four concurrent workstreams:
1. **Lane 03**: Authorized production source and focused TDD implementation for orchestrator wake and canonical terminal outcome reconciliation.
2. **Lane 07-PREP**: Hashline real-host proof fixture, test-workspace generator, and evidence capture protocol preparation (zero production source changes).
3. **Lane 08-PREP**: Explorer/Oracle specialist route test harnesses, disposable session configuration, and transcript validation protocol preparation (zero production source changes).
4. **Lane 09-PREP**: 16-case unattended acceptance matrix skeleton, validation classifier, report schema, and evidence aggregation harness preparation (zero production source changes).

Final candidate binding, real-host proof execution, end-to-end acceptance certification, and independent review remain strictly serialized downstream of Lane 03 code completion and candidate SHA freezing.

---

## 2. Authority & Provenance Baseline

- **Repository**: `FlapPearLabs/oh-my-opencode-slim`
- **Authority Branch**: `work/slim-unattended-reliability`
- **Current Remote / Local HEAD**: `88eb377e9cd9e171e13ff94de667b82472b7f9d9`
- **Integrated Source Baseline SHA**: `52f1d3cef1bd6ecad68cb4cd6a9e32d8503aa0d6`
- **Frozen Acceptance Spec SHA**: `16bb77f8209542a6bcc1ca11a48203867d8a3378`
- **Frozen Ticket Graph SHA**: `9bac2333d5a2963a05f39e130fffc587336096c9`
- **Runtime Handoff**: `docs/handoffs/URV1_HANDOFF_2026-09-11.md`

---

## 3. Scoped Corrections from V1 Overlay

| V1 Area | V1 Defect / Error | V1.1 Correction | Evidence & Authority |
|---|---|---|---|
| **Path Authority** | Proposed creating non-existent test framework directories: `tests/hashline/`, `tests/routes/explorer/`, `tests/routes/oracle/`, `tests/acceptance/`. | Removed all `INVENTED_UNSUPPORTED` paths. Repository tests are colocated in `src/`. Proof preparation is restricted to disposable workspaces, fixture directories, and evidence schemas. | Repository layout: all unit/integration tests reside under `src/**/*.test.ts`. Frozen tickets 07/08/09 are proof/acceptance tickets, not repo test frameworks. |
| **Execution Model** | Overused `Can Build Now = YES` for proof and acceptance tickets (07/08/09). | Replaced with explicit 5-dimensional breakdown: `CAN_PREPARE_NOW`, `CAN_IMPLEMENT_AUTHORIZED_SOURCE_NOW`, `CAN_RUN_PROVISIONAL_RUNTIME_CHECK_NOW`, `CAN_RUN_FINAL_EXACT_SHA_PROOF_NOW`, `CAN_ISSUE_FINAL_PASS_NOW`. | Frozen Ticket Graph V3 sections for URV1-07, URV1-08, and URV1-09 designate them as `REAL_RUNTIME_PROOF` and `FINAL_REAL_RUNTIME_ACCEPTANCE`. |
| **URV1-07 Contracts** | Claimed URV1-07 required a shared `WorkIntent` mock contract. | Removed `WorkIntent` mock requirement for URV1-07. URV1-07 is an independent Hashline real-host proof depending only on candidate SHA binding. | Frozen Spec Section 3 & Ticket Graph URV1-07: Hashline proof tests peer edits, TAG1/TAG2 verification, and stale line rejection, completely independent of WorkIntent. |
| **URV1-08 Mocks** | Implied mock routes could substitute for real reconciliation evidence. | Clarified that mocks are strictly limited to local scaffold development. Final PASS requires real Explorer/Oracle child execution with live provider routing and parent reconciliation. | Frozen Spec Section 4 & Ticket Graph URV1-08: Requires live specialist routes, canonical terminal status, provider error handling, and exact-SHA evidence. |
| **URV1-09 Scope** | Suggested building an acceptance framework inside the repository. | Clarified that URV1-09 preparation is strictly matrix, report skeleton, and evidence aggregation tooling. Final execution requires frozen candidate SHA. | Frozen Ticket Graph URV1-09: Requires 16-case matrix execution across real runtime instances, not an in-repo unit testing framework. |
| **URV1-03 Ownership** | Included unrelated supervisor refactoring (`src/utils/background-job-supervisor.ts`). | Removed supervisor refactor (`UNSUPPORTED`). Scoped ownership strictly to confirmed surfaces: `src/hooks/orchestrator-wake/`, `src/index.ts`, `src/utils/background-job-coordinator.ts`, and read-only consumption of `src/utils/work-intent.ts`. | Latest handoff `URV1_HANDOFF_2026-09-11.md` and frozen Ticket Graph URV1-03 implementation boundary. |
| **Prerequisites** | Stated URV1-03 had "Prerequisites: None". | Corrected to "Prerequisites: URV1-00 and URV1-02 — already satisfied at current authority baseline". | Frozen Ticket Graph V3: URV1-03 explicitly blocked by URV1-02. URV1-02 was integrated at baseline SHA `52f1d3c...`. |

---

## 4. Multi-Dimensional Dependency Matrix

Edges may hold multiple dependency classifications simultaneously (e.g., contract freeze allows concurrent scaffolding, while final validation remains acceptance-bound).

| Downstream Ticket | Upstream Dependency | Existing DAG Edge | Dependency Classification | Blocks Coding / Prep? | Blocks Final PASS? | Required Contract / Artifact | Candidate SHA Sensitive? | Evidence Authority |
|---|---|---|---|---|---|---|---|---|
| **URV1-03** | URV1-02 | `URV1-03 blocked_by URV1-02` | `CONTRACT_DEPENDENCY` + `HARD_IMPLEMENTATION_DEPENDENCY` | **NO** (URV1-02 already merged) | **NO** (URV1-02 satisfied) | `WorkIntentAdapter` API & `WorkIntent` schema (frozen in `src/utils/work-intent.ts`) | YES (Local suite must pass on candidate SHA) | `URV1_HANDOFF_2026-09-11.md` Section "URV1-02 Result" |
| **URV1-07** | URV1-06 / URV1-03 | `URV1-07 blocked_by URV1-06` | `ACCEPTANCE_ONLY_DEPENDENCY` | **NO** (Preparation startable now) | **YES** (Requires candidate SHA) | Hashline tool protocol & edit mutation contract (`src/hooks/hashline/`) | **YES** (Real-host transcript & hashes must match candidate SHA) | Frozen Spec Section 3; Ticket Graph URV1-07 |
| **URV1-08** | URV1-03 | `URV1-08 blocked_by URV1-03` | `CONTRACT_DEPENDENCY` + `ACCEPTANCE_ONLY_DEPENDENCY` | **NO** (Preparation startable now) | **YES** (Requires candidate SHA with wake/reconciliation integrated) | Child outcome schema: `(taskId, generation, resultOccurrence, status)` from coordinator | **YES** (Real child execution & parent reconciliation on candidate SHA) | Frozen Spec Section 4; Ticket Graph URV1-08 |
| **URV1-09** | URV1-03, URV1-07, URV1-08 | `URV1-09 blocked_by URV1-03, 07, 08` | `CONTRACT_DEPENDENCY` + `ACCEPTANCE_ONLY_DEPENDENCY` + `INTEGRATION_DEPENDENCY` | **NO** (Matrix & report prep startable now) | **YES** (Requires all candidate code & proof artifacts) | 16-case matrix schema & evidence directory schema (`docs/reviews/`) | **YES** (All 16 cases must be certified against exact same candidate SHA) | Frozen Spec Section 5; Ticket Graph URV1-09 |
| **URV1-10** | URV1-09 | `URV1-10 blocked_by URV1-09` | `ACCEPTANCE_ONLY_DEPENDENCY` | **NO** (Review checklist template startable now) | **YES** (Requires complete candidate artifact suite) | Independent review evidence standard (L1 Fresh Grounding Protocol) | **YES** (Review evaluates exact candidate SHA) | Frozen Ticket Graph URV1-10 |

---

## 5. Preparation vs. Implementation Matrix

| Ticket | CAN_PREPARE_NOW | CAN_IMPLEMENT_AUTHORIZED_SOURCE_NOW | CAN_RUN_PROVISIONAL_RUNTIME_CHECK_NOW | CAN_RUN_FINAL_EXACT_SHA_PROOF_NOW | CAN_ISSUE_FINAL_PASS_NOW | Boundary & Authority Constraints |
|---|---|---|---|---|---|---|
| **URV1-03** | YES | **YES** | YES (TDD test suite) | YES (Candidate CI) | **YES** (Post-review & CI pass) | Authorized to modify mapped wake/reconciliation source files under TDD. |
| **URV1-07** | **YES** (Fixtures, scripts) | **NO** (No code change authorized) | YES (On current HEAD) | **NO** (Requires post-03 SHA) | **NO** (Blocked on candidate SHA) | Real runtime proof. Prepares disposable target repo and mutation sequence. |
| **URV1-08** | **YES** (Harness, config) | **NO** (No code change authorized) | YES (Provisional routes) | **NO** (Requires post-03 SHA) | **NO** (Blocked on candidate SHA) | Real runtime proof. Prepares Explorer/Oracle test prompts and transcript capturer. |
| **URV1-09** | **YES** (Matrix, schemas) | **NO** (No code change authorized) | YES (Provisional matrix) | **NO** (Requires post-03 SHA) | **NO** (Blocked on candidate SHA) | Final acceptance assembly. Prepares 16-case matrix runner and validation ledger. |
| **URV1-10** | **YES** (Checklist template)| **NO** (No code change authorized) | NO | **NO** (Requires final artifacts) | **NO** (Blocked on URV1-09 PASS) | Fresh independent review. Templating allowed; review judgment must be fresh. |

---

## 6. Proposed Construction Lanes

### Lane 03 — Orchestrator Wake & Terminal Outcome Reconciliation
- **Focus**: Production source code and unit/integration tests for wake-gate and coordinator reconciliation.
- **Starting Baseline**: Current authority HEAD (`88eb377...` / `52f1d3c...`).
- **Prerequisites**: URV1-00, URV1-02 (satisfied).
- **Authorized Source Surfaces**:
  - `src/hooks/orchestrator-wake/index.ts` (`CONFIRMED_PRIMARY`)
  - `src/hooks/orchestrator-wake/index.test.ts` (`CONFIRMED_PRIMARY`)
  - `src/hooks/orchestrator-wake/wake-gate.ts` (`CONFIRMED_PRIMARY`)
  - `src/index.ts` (lifecycle listener) (`CONFIRMED_SHARED`)
  - `src/index.test.ts` (`CONFIRMED_SHARED`)
  - `src/utils/background-job-coordinator.ts` (`CONFIRMED_PRIMARY`)
  - `src/utils/background-job-coordinator.test.ts` (`CONFIRMED_PRIMARY`)
- **Read-Only Dependencies**:
  - `src/utils/work-intent.ts` (`READ_ONLY_CONSUMER`)
- **Forbidden Surfaces**:
  - `src/utils/background-job-supervisor.ts` (`UNSUPPORTED` - out of scope)
  - Modifying `WorkIntentAdapter` core schema
  - Adding persistent queues, daemons, schedulers, or background services
- **Deliverable**: Passing unit/integration test suite, Biome clean, typecheck clean, candidate commit.

### Lane 07-PREP — Hashline Disposable Fixture & Evidence Protocol
- **Focus**: Preparation of disposable repository fixtures, TAG1/TAG2 verification scripts, and evidence format templates for Hashline proof.
- **Starting Baseline**: Current authority HEAD.
- **Prerequisites**: URV1-06 (satisfied).
- **Authorized Surfaces**:
  - Disposable temporary test directories (e.g., `/tmp/hashline-fixture-*` or external disposable workspace)
  - Evidence schema drafts for `docs/reviews/URV1-07_HASHLINE_PROOF.md`
- **Forbidden Surfaces**:
  - Modifying any tracked files under `src/`
  - Creating permanent test suites under `tests/hashline/`
- **Deliverable**: Automated fixture generator script and evidence template ready to execute immediately when candidate SHA is frozen.

### Lane 08-PREP — Explorer & Oracle Route Evidence Protocol
- **Focus**: Test prompt specifications, model/provider routing configurations, transcript scrapers, and duplicate-count verification tooling for child agents.
- **Starting Baseline**: Current authority HEAD.
- **Prerequisites**: URV1-03 contract understanding (coordinator outcome format).
- **Authorized Surfaces**:
  - Disposable harness workspace for specialist dispatch
  - Evidence schema drafts for `docs/reviews/URV1-08_EXPLORER_ORACLE_PROOF.md`
- **Forbidden Surfaces**:
  - Modifying any tracked files under `src/`
  - Creating permanent test suites under `tests/routes/`
  - Mocking away real provider routes for final evidence
- **Deliverable**: Verification runner and transcript parser ready for candidate SHA execution.

### Lane 09-PREP — 16-Case Unattended Acceptance Matrix Framework
- **Focus**: Acceptance matrix definition (16 scenarios covering active continuation, terminal reconciliation, user wait, failure recovery, Hashline edits, and specialist delegation), validation classifier, and report template.
- **Starting Baseline**: Current authority HEAD.
- **Prerequisites**: Frozen Spec Section 5.
- **Authorized Surfaces**:
  - Acceptance report skeleton at `docs/reviews/URV1-09_FINAL_ACCEPTANCE.md`
  - Matrix definition runner / validation ledger scripts in disposable workspace
- **Forbidden Surfaces**:
  - Modifying production code in `src/`
  - Creating permanent test framework files under `tests/acceptance/`
  - Issuing a provisional PASS as final acceptance
- **Deliverable**: Complete, executable 16-case matrix runner and report skeleton ready for candidate evaluation.

---

## 7. Shared Contracts & Coordination Boundaries

No new Architecture Decision Records (ADRs) are required. All necessary interfaces are already frozen by existing documentation and merged baseline source code.

1. **WorkIntent State Contract**:
   - *Authority*: `src/utils/work-intent.ts` (integrated in URV1-02) and frozen Spec Section 2.
   - *Semantics*: States `active`, `waiting_for_user`, `complete`, `blocked`, `UNKNOWN`.
   - *Consumers*: Lane 03 (Wake evaluation), Lane 09-PREP (Acceptance test cases).
2. **Terminal Child Outcome Identity**:
   - *Authority*: `src/utils/background-job-coordinator.ts` and frozen Spec Section 2.4.
   - *Semantics*: Exactly-once reconciliation keyed on `(taskId, generation, resultOccurrence)`.
   - *Consumers*: Lane 03 (Wake trigger), Lane 08-PREP (Reconciliation verification), Lane 09-PREP.
3. **Hashline Verification Protocol**:
   - *Authority*: `src/hooks/hashline/` and frozen Spec Section 3.
   - *Semantics*: Hash verification, TAG1/TAG2 sequential editing, rejection of stale line references without mutation.
   - *Consumers*: Lane 07-PREP, Lane 09-PREP.
4. **Evidence Schema Standard**:
   - *Authority*: Existing review documents in `docs/reviews/`.
   - *Semantics*: Exact SHA binding, command transcript, raw log captures, git diffs, PASS/FAIL criteria.
   - *Consumers*: Lanes 07-PREP, 08-PREP, 09-PREP, URV1-10.

---

## 8. Surface Ownership & Collision Map

| Source File / Surface | Lane Ownership | Collision Risk | Mitigation Strategy |
|---|---|---|---|
| `src/hooks/orchestrator-wake/index.ts` | **Lane 03 Sole Owner** | **LOW** | Only Lane 03 is authorized to edit. PREP lanes are forbidden from editing `src/`. |
| `src/hooks/orchestrator-wake/wake-gate.ts` | **Lane 03 Sole Owner** | **LOW** | Only Lane 03 is authorized to edit. |
| `src/index.ts` | **Lane 03 Sole Owner** | **LOW** | Narrow replacement of the `stopped && terminalUnreconciled` listener. |
| `src/utils/background-job-coordinator.ts` | **Lane 03 Sole Owner** | **LOW** | Only Lane 03 is authorized to edit. |
| `src/utils/work-intent.ts` | **Lane 03 (Read-Only)** | **NONE** | Frozen artifact from URV1-02; no modifications permitted. |
| `docs/reviews/` directory | Lanes 07/08/09/10 | **LOW** | Each lane writes to its own dedicated report file (`URV1-07_*.md`, `URV1-08_*.md`, `URV1-09_*.md`, `URV1-10_*.md`). |

---

## 9. Proposed Execution Topology & Final Convergence Sequence

```text
========================================================================================
CONSTRUCTION CONCURRENCY (Parallel Development & Scaffolding)
========================================================================================

   [Authority Baseline: 88eb377 / 52f1d3c]
                     |
      +--------------+---------------+--------------+
      |                              |              |
  [Lane 03]                     [Lane 07-PREP]  [Lane 08-PREP]  [Lane 09-PREP]
  - TDD Wake & Reconciliation   - Fixture Prep  - Route Prep    - 16-Case Matrix
  - Source edits in src/        - Evidence Spec - Harness Prep  - Report Skeleton
  - Focused test suite          - Zero src/ edit- Zero src/ edit- Zero src/ edit
      |                              |              |              |
  [Candidate Code Complete]          |              |              |
      |                              |              |              |
========================================================================================
INTEGRATION & CANDIDATE FREEZE (Serialization Boundary)
========================================================================================
      |
  [Candidate Integration & Review Gate]
  - Typecheck & Build
  - Full Test Suite Pass
  - Biome CI & git diff --check
  - Candidate SHA Frozen (e.g. SHA_CANDIDATE)
      |
      +------------------------------+--------------+--------------+
      |                                             |              |
========================================================================================
FINAL EXACT-SHA ACCEPTANCE & PROOF EXECUTION (Strictly Serialized)
========================================================================================
      |                                             |              |
  [URV1-07 Real Proof]                       [URV1-08 Real Proof]  |
  - Run Hashline proof on SHA_CANDIDATE     - Run Explorer/Oracle  |
  - Capture transcripts & hashes             on SHA_CANDIDATE      |
  - PASS Evidence Artifact Generated         - PASS Evidence Art.  |
      |                                             |              |
      +------------------------------+--------------+              |
                                     |                             |
                                     v                             v
                        [URV1-09 Final Acceptance Execution]
                        - Execute all 16 matrix cases on SHA_CANDIDATE
                        - Aggregate URV1-07 & URV1-08 evidence
                        - Verify zero human interventions
                        - Issue URV1-09 PASS Verdict
                                     |
                                     v
                        [URV1-10 Independent Review]
                        - Fresh grounding review of SHA_CANDIDATE
                        - Validate complete proof chain
                        - Final merge clearance
```

---

## 10. Model Routing & Capability Allocation

To optimize token efficiency and execution velocity, tasks are segmented by structural entropy:

### 1. CHEAP_MODEL_SAFE (Low Entropy / Mechanical)
- Generating disposable Hashline fixture repositories and test files (Lane 07-PREP).
- Writing transcript scrapers and regex validators for CLI outputs (Lane 08-PREP).
- Formulating the Markdown table structure and schema for the 16-case matrix (Lane 09-PREP).
- Drafting review document templates and checklists (Lane 10-PREP).
- Executing deterministic verification commands (`npm test`, `npm run typecheck`, `biome check`, `git diff --check`).

### 2. CHEAP_MODEL_WITH_REVIEW_GATE (Medium Entropy / Constrained Implementation)
- Implementing isolated predicate functions in `src/hooks/orchestrator-wake/wake-gate.ts` strictly adhering to pre-written failing unit tests.
- Implementing focused unit tests covering individual WorkIntent state transitions in `src/hooks/orchestrator-wake/index.test.ts`.

### 3. SOL_REQUIRED_AT_BOUNDARY (High Entropy / Architectural & Verification Authority)
- Resolving wake/reconciliation circular predicate edge cases (`terminalUnreconciled` vs continuation gating).
- Verifying exactly-once outcome consumption semantics and stale generation prevention in coordinator hooks.
- Reviewing candidate integration diffs for unintended side effects or cache-safety violations.
- Evaluating live provider route anomalies, model degradation, or ambiguous runtime proof failures.
- Synthesizing final URV1-09 16-case unattended matrix results.
- Performing the fresh, independent L1 final review for URV1-10.

---

## 11. Risks & Unknowns

| Risk / Unknown | Cause & Nature | Blocking Status | Resolution Strategy |
|---|---|---|---|
| **Hashline Native Tool Availability** | URV1-07 requires native Hashline tool execution on the host machine. If host tool integration differs from test environment, proof cannot complete. | Does not block preparation; blocks final URV1-07 PASS. | Lane 07-PREP creates environment validation probes to test tool presence before running candidate proof. |
| **Provider Route Flakiness** | URV1-08 requires live API responses from Explorer/Oracle configured models. Rate limits, timeouts, or provider changes may induce false failures. | Does not block preparation; blocks final URV1-08 PASS. | Lane 08-PREP incorporates retry and error-classification probes distinguishing provider infrastructure errors from internal reconciliation defects. |
| **Circular Wake Gate Deadlock** | In URV1-03, improper predicate order could cause `terminalUnreconciled` to suppress the exact wake meant to reconcile it. | Blocks Lane 03 completion. | TDD tests in Lane 03 must enforce the strict separation between reconciliation wake bypass and normal continuation gating. |
| **Candidate SHA Invalidation** | Any bug fix required during 07, 08, or 09 proof execution changes the candidate SHA, requiring re-execution of all proofs. | Operational cost risk; does not block architecture. | Ensure Lane 03 passes comprehensive local TDD and self-review before freezing candidate SHA for downstream proofs. |

---

## 12. Quality Gate & Cleanliness Verification

### Verification Checklist
1. **Frozen Acceptance Spec**: Unmodified (`git status` confirms clean).
2. **Frozen Ticket Graph**: Unmodified (`git status` confirms clean).
3. **Production Source Code**: Unmodified (`git status` confirms clean).
4. **Test Suites**: Unmodified (`git status` confirms clean).
5. **Overlay Document**: Clean formatting, no trailing whitespace, fully evidence-grounded.

---
*End of URV1 Parallel Execution Overlay V1.1*
