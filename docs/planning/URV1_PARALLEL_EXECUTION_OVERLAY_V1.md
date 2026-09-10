# URV1 PARALLEL EXECUTION OVERLAY V1

**NON-NORMATIVE**

* **Important:** This document does NOT modify the frozen Acceptance Spec or the frozen Ticket Graph. Frozen semantic and acceptance requirements remain authoritative.
* This document only changes recommended construction scheduling.
* Final acceptance dependencies remain binding as outlined in the frozen documentation.

---

## 1. Executive Result

`PARALLELIZATION_READY`

---

## 2. Authority

* **Branch:** `work/slim-unattended-reliability`
* **Current SHA:** `57fa99f9123d3fb7061ecf569498811885276ca2`
* **Integrated Source SHA:** `52f1d3cef1bd6ecad68cb4cd6a9e32d8503aa0d6`
* **Frozen Spec SHA:** `16bb77f8209542a6bcc1ca11a48203867d8a3378`
* **Frozen Ticket Graph SHA:** `9bac2333d5a2963a05f39e130fffc587336096c9`

---

## 3. Key Finding

**Acceptance ordering != construction ordering**

The current DAG establishes logical dependencies and the sequence for final verifiable acceptance. However, for construction, we can decouple the preparation of test scaffolding, sub-component implementation, and harness setup from the final integration and proof phases. Specifically:

1. **URV1-07** (Hashline real-runtime proof) test scaffolding and call harness can be implemented simultaneously with URV1-03 without waiting for Wake behaviors to be complete.
2. **URV1-08** (Explorer/Oracle Harness) routing logic and fixture creation can proceed concurrently, binding to the frozen `WorkIntent` contract.
3. **URV1-09** (Acceptance framework) can have its test runners, evidence collector, and matrix schemas assembled concurrently before any final implementation is ready.

By treating the existing DAG boundaries as `ACCEPTANCE_ONLY_DEPENDENCY` where applicable, we unlock parallel lanes.

---

## 4. Dependency Classification Matrix

| Downstream | Upstream | Existing DAG Edge | Dependency Type | Blocks Coding? | Blocks Final PASS? | Contract Needed | Final-SHA Rerun? | Evidence |
| ---------- | -------- | ----------------- | --------------- | -------------- | ------------------ | --------------- | ---------------- | -------- |
| URV1-03 | URV1-02 | 02 → 03 | CONTRACT_DEPENDENCY | NO | YES | `WorkIntent` semantics | NO | `src/utils/work-intent.ts` |
| URV1-07 | URV1-03, 06 | 03,06 → 07 | ACCEPTANCE_ONLY_DEPENDENCY | NO | YES | Fixture expectations | YES | Hashline proof must run on final assembled runtime |
| URV1-08 | URV1-03 | 03 → 08 | CONTRACT_DEPENDENCY | NO | YES | Route routing schema | YES | Test execution must observe real wake |
| URV1-09 | URV1-03,07,08| 03,07,08 → 09 | HARD_IMPLEMENTATION_DEPENDENCY | NO (Framework) | YES | Evidence schema | YES | Final integrated test verdicts |
| URV1-10 | URV1-09 | 09 → 10 | HARD_IMPLEMENTATION_DEPENDENCY | YES | YES | Final codebase | NO | Independent Review must assess final code |

---

## 5. Ticket Parallelization Matrix

| Ticket | Can Analyze Now | Can Build Now | Can Test Now | Can Prepare Fixture Now | Can Produce Final PASS Now | Final-SHA Sensitive | Reason |
| ------ | --------------: | ------------: | -----------: | ----------------------: | -------------------------: | ------------------: | ------ |
| URV1-03| YES | YES | YES | YES | NO | YES | Interface is frozen from 02 |
| URV1-07| YES | YES | NO (Final) | YES | NO | YES | Needs final integration for valid real-runtime evidence |
| URV1-08| YES | YES | YES (Mock)| YES | NO | YES | Provider route harness depends on mocked intents initially |
| URV1-09| YES | YES | NO | YES | NO | YES | Runners can be built, final verdict needs complete paths |
| URV1-10| YES | NO | NO | NO | NO | NO | Must audit the final completed work objectively |

---

## 6. Proposed Construction Lanes

**Lane 03 — Wake/Reconciliation**
* **Starting SHA:** `57fa99f9123d3fb7061ecf569498811885276ca2`
* **Prerequisites:** None 
* **Owned Files:** `src/hooks/orchestrator-wake/wake-gate.ts`, `src/utils/background-job-coordinator.ts`, `src/utils/background-job-supervisor.ts`
* **Shared Files:** `src/index.ts`, `src/utils/work-intent.ts`
* **Deliverable:** Core reconciliation and promptAsync behavior mechanism
* **Provisional:** Final PASS waits for integration and regression check
* **Final-SHA Rerun:** YES

**Lane 07 — Hashline Proof Preparation**
* **Starting SHA:** `57fa99f9123d3fb7061ecf569498811885276ca2`
* **Prerequisites:** None
* **Owned Files:** `tests/hashline/`, Hashline fixtures
* **Shared Files:** Test integration points
* **Deliverable:** Automated harness for validating Hashline edit vs stale bounds
* **Provisional:** The execution run itself
* **Final-SHA Rerun:** YES

**Lane 08 — Explorer/Oracle Route Harness**
* **Starting SHA:** `57fa99f9123d3fb7061ecf569498811885276ca2`
* **Prerequisites:** None
* **Owned Files:** `tests/routes/explorer/`, `tests/routes/oracle/`
* **Shared Files:** `src/utils/work-intent.ts`, test runners
* **Deliverable:** Scaffolding to exercise standard routing scenarios
* **Provisional:** Tests will run against mocked WorkIntents until integration
* **Final-SHA Rerun:** YES

**Lane 09 — Acceptance Framework Assembly**
* **Starting SHA:** `57fa99f9123d3fb7061ecf569498811885276ca2`
* **Prerequisites:** None
* **Owned Files:** `tests/acceptance/`
* **Shared Files:** None directly 
* **Deliverable:** Execution runner, report generator, and matrix schema
* **Provisional:** The final script execution
* **Final-SHA Rerun:** YES

**Lane Integration — Convergence & Final Output**
* **Starting SHA:** Post-lanes
* **Prerequisites:** Lane 03, 07, 08, 09
* **Deliverable:** Final evidence generation, conflict resolution in shared bounds (e.g. `index.ts`), running the Final Pass checks.

---

## 7. Shared Contracts Required Before Forking

Minimal infrastructure is needed since the specifications freeze most aspects. 

* **Contract:** **WorkIntent Fixture Mocking Schema**
  * **Semantics:** Mock shape for intents passing between lanes before final runtime convergence.
  * **Consumers:** Lanes 07, 08, 09
  * **Already Frozen:** Partially via `URV1-02`. A quick ADR/Contract update to standardize test mocks would be useful.
  * **New ADR Necessary:** NO (use a standard JSON contract fixture file).

---

## 8. Collision Map

| Shared Surface | Collision Risk | Mitigating Action |
| ------------- | ---------------| ----------------- |
| `src/utils/work-intent.ts` | MEDIUM | Lane 03 has primary ownership of extending methods. L08/L09 rely on it read-only. Conflict manageable via rebase. |
| `src/index.ts` | HIGH | Multiple lanes registering hooks or routes. Integration lane must explicitly own convergence here. |
| Final Acceptance Evidence | LOW | Write paths for test reporting must use lane-specific namespaces (`/reports/07/`, `/reports/08/`) before assembling. |

---

## 9. Proposed Execution Topology

```text
       STARTABLE NOW
             |
 +-----------+-----------+-----------+
 |           |           |           |
03          07          08          09
(Wake) (Hashline Fix.) (Route Harness) (Acc. Runner)
 |           |           |           |
 +-----------+-----------+-----------+
             |
       INTEGRATION (Resolve index.ts, mock removal)
             |
    FINAL CANDIDATE SHA
             |
             v 
      SHA-SENSITIVE 
       FINAL RERUNS (07 Hashline, 08 Routes)
             |
             v
            09 (Final Acceptance Assembly)
             |
             v
            10 (Independent Review)
```

---

## 10. ADR / CI Prework Recommendation

* **Zero new ADRs required.** The frozen Spec + Ticket Graph is sufficient contractually.
* **One Contract Document needed:** A shared `[TEST_FIXTURE_MANIFEST]` to provide uniform mock JSON of a `WorkIntent` state for Lanes 07 and 08 to develop against.
* **No CI changes required** before starting parallel implementation.

---

## 11. Recommended Next Dispatch

Maximum recommended simultaneous streams: **4**

| Lane | Action | Dispatch Routing |
| ---- | ------ | ---------------- |
| URV1-03 | Implement Wake & Reconciliation Gate | `SOL_REQUIRED_AT_BOUNDARY` (Core architecture) |
| URV1-07 | Build Hashline Fixture & Proof harness | `CHEAP_MODEL_SAFE` |
| URV1-08 | Build Route Harness & Fixtures | `CHEAP_MODEL_SAFE` |
| URV1-09 | Scaffold Acceptance Matrix Runner | `CHEAP_MODEL_WITH_REVIEW_GATE` |

---

## 12. Risks / Unknowns

* **Integration Complexity at `src/index.ts`:**
  * **Unknown:** How complex the registry convergence will be between the Wake hook and the Explorer/Oracle routed hooks.
  * **Why:** Unclear how many separate hook registrations will be generated before integration.
  * **Blocks:** Does not block construction, blocks Integration Merge.
  * **Resolution:** Rebased conflict resolution in the Integration step.

* **Hashline API Availability:**
  * **Unknown:** Whether the external real-runtime environment will rate-limit or fail unexpectedly during parallel fixture scaffolding runs.
  * **Why:** External system dependency.
  * **Blocks:** Could sporadically block Lane 07 harness testing, but will not block Lane 03 work.
  * **Resolution:** Graceful error handling in the test runner scaffolding.
