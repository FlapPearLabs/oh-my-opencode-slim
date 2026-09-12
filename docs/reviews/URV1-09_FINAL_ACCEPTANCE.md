# URV1-09 Final Acceptance Matrix

Status: **PREP_ONLY — NOT EXECUTED — NOT PASS**

Authority: [Slim Runtime Wiring Acceptance Spec V1](../planning/SLIM_RUNTIME_WIRING_ACCEPTANCE_SPEC_V1.md) (Frozen SHA: `16bb77f8209542a6bcc1ca11a48203867d8a3378`)
Ticket: [Slim Runtime Wiring Ticket Graph V3](../planning/SLIM_RUNTIME_WIRING_TICKET_GRAPH_V3.md) (Ticket URV1-09, Frozen SHA: `9bac2333d5a2963a05f39e130fffc587336096c9`)
Construction Overlay: [URV1 Parallel Execution Overlay V1.1](../planning/URV1_PARALLEL_EXECUTION_OVERLAY_V1.1.md)
Baseline SHA: `7903be97539d13df31e64c69ce8966984861b5f4`
Candidate Git SHA: `PENDING_CANDIDATE_SHA`

---

## 1. Scope & Execution Guardrails

This document establishes the pre-constructed 16-case Final Acceptance Matrix structure for the URV1 milestone.
- **Preparation Only**: All execution results and actual behavior columns are initialized to `NOT_RUN`. No tests have been certified as passing in this preparation phase.
- **Candidate Binding Required**: Final acceptance execution cannot begin until Lane 03 implementation is converged, reviewed, and integrated into a candidate SHA.
- **Zero-Human Constraint**: Unattended reliability runs must exhibit zero human intervention during automated runs. Any manual prompt or action increments the human intervention counter and fails the case.
- **No Test Framework Project**: This document is an evaluation matrix and report ledger; it does not add an unvetted test framework to production source.

---

## 2. Environment & Binary Metadata Block

| Parameter | Specification | Captured Runtime Value |
| --- | --- | --- |
| Candidate Git SHA | Target candidate commit | `PENDING_CANDIDATE_SHA` |
| Node.js Version | `>= 20.x` | `NOT_RUN` |
| OS Platform | `win32` / `linux` / `darwin` | `NOT_RUN` |
| npm / bun / pnpm | As defined by repository | `NOT_RUN` |
| Execution Timestamp | ISO 8601 UTC | `NOT_RUN` |
| Acceptance Evaluator | Model / Operator identity | `NOT_RUN` |

---

## 3. Failure Classification Taxonomy

Any non-passing test or scenario must be categorized according to the standard failure taxonomy:
- `CAUSED_BY_THIS_CHANGE`: Regression or bug directly introduced by the URV1 implementation. Blocks acceptance.
- `PRE_EXISTING`: Flaw existed prior to URV1 integration (verified by reproduction against baseline SHA).
- `ENVIRONMENT_DEPENDENT`: External environment failure (network timeout, provider rate limit, OS permissions).
- `UNKNOWN`: Unclassified anomaly. Treated as blocking until investigated and reclassified.

---

## 4. Same-SHA Evidence Reuse & Rerun Rules

1. **Exact-SHA Coupling**: Evidence collected in URV1-07 (Hashline proof) and URV1-08 (Specialist routes) may be incorporated into this matrix **only if** executed on the identical Candidate Git SHA.
2. **Mandatory Rerun on SHA Invalidation**: If any subsequent code change or merge produces a new Git commit, all real-host proof executions must be rerun against the new SHA. Stale evidence cannot be carried forward.

---

## 5. The 16-Case Final Acceptance Matrix

| Case ID | Authority Spec Ref | Trigger / Scenario | Fixture Context | Expected Behavior | Actual Behavior | Evidence Level | Duplicate Dispatch | Human Count | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TC-01 | SPEC-01 | Clean session startup | Default config | Default agent initializes without wake loop or crash | `NOT_RUN` | L0 (Unit) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-02 | SPEC-02 | WorkIntent explicit initialization | Initial prompt with intent | Intent correctly parsed and stored in session context | `NOT_RUN` | L0 (Unit) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-03 | SPEC-02 | WorkIntent carrier discovery from prompt | In-flight message with intent | Reconstructed WorkIntent matches prompt payload | `NOT_RUN` | L0 (Unit) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-04 | SPEC-02 | WorkIntent discovery from filesystem | Local directory metadata | Reconstructed WorkIntent matches persisted file state | `NOT_RUN` | L0 (Unit) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-05 | SPEC-03 | Missing WorkIntent continuation check | Wake gate evaluation | Normal continuation suppressed when WorkIntent absent | `NOT_RUN` | L0 (Unit) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-06 | SPEC-03 | WorkIntent `waiting_for_user` check | WorkIntent state set to user wait | Normal continuation suppressed | `NOT_RUN` | L0 (Unit) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-07 | SPEC-03 | WorkIntent `complete` check | WorkIntent state set to complete | Normal continuation suppressed; task halts cleanly | `NOT_RUN` | L0 (Unit) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-08 | SPEC-04 | Canonical terminal child result (`completed`) | Child background job finishes | Exactly one reconciliation wake dispatched to parent | `NOT_RUN` | L1 (Integration) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-09 | SPEC-04 | Circular `terminalUnreconciled` check | Parent wake gate evaluation | Reconciliation wake bypasses circular gate cleanly | `NOT_RUN` | L1 (Integration) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-10 | SPEC-04 | Duplicate terminal outcome event | Repeated child outcome event | Duplicate event ignored; exactly-once consumption | `NOT_RUN` | L1 (Integration) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-11 | SPEC-04 | Stale generation / occurrence outcome | Stale task generation payload | Stale outcome ignored without waking parent | `NOT_RUN` | L1 (Integration) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-12 | SPEC-04 | `stopped` status without native task result | External cancellation | Not treated as canonical terminal result; no false wake | `NOT_RUN` | L1 (Integration) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-13 | SPEC-05 | Real user-wait active | Prompt awaits human answer | Wake gate suppresses continuation dispatch | `NOT_RUN` | L1 (Integration) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-14 | SPEC-05 | Active fallback route | Fallback flag active | Wake gate suppresses continuation dispatch | `NOT_RUN` | L1 (Integration) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-15 | SPEC-06 | Hashline real-host proof | Disposable test repo | TAG1 capture, valid edit, stale rejection with byte-level 0-mutation proof, TAG2 reanchor | `NOT_RUN` | L2 (Real Host) | `NOT_RUN` | 0 | `NOT_RUN` |
| TC-16 | SPEC-07 | Explorer & Oracle specialist routes | Real LLM provider routes | Both specialist subagents execute to completion and reconcile into parent | `NOT_RUN` | L2 (Real Host) | `NOT_RUN` | 0 | `NOT_RUN` |

---

## 6. Validation Command Ledger

When candidate SHA is ready, execute:
```bash
# 1. Static & Typecheck Gates
npm run typecheck
npm run check:ci

# 2. Automated Test Suite (TC-01 through TC-14)
npm test

# 3. Real-Host Hashline Proof (TC-15)
# In accordance with URV1-07 protocol
# Capture stdout transcript and verify byte-level non-mutation

# 4. Real-Host Specialist Route Proof (TC-16)
# In accordance with URV1-08 protocol
# Capture Explorer and Oracle runs and verify zero duplicate dispatches
```

---

## 7. Evidence Integrity Checklist

- [ ] All 16 test cases evaluated against the same Git SHA.
- [ ] No provisional or fabricated results in Actual Behavior.
- [ ] Duplicate dispatch count is verified 0 for all scenarios.
- [ ] Human intervention count is verified 0 for all scenarios.
- [ ] Any test failures classified under Section 3 taxonomy.
- [ ] Artifact paths recorded and accessible.

---

## 8. Final Acceptance Verdict

- **Overall Status**: `NOT_RUN`
- **Total Passing**: `0 / 16`
- **Blocking Failures**: `0`
- **Certification**: Awaiting candidate integration and live execution.
