# URV1-08 Specialist Route Proof Protocol

Status: **PREP_ONLY — NOT FINAL EVIDENCE — NOT PASS**

Authority: [Slim Runtime Wiring Ticket Graph V3](../planning/SLIM_RUNTIME_WIRING_TICKET_GRAPH_V3.md) (Ticket URV1-08)
Baseline SHA: `7903be97539d13df31e64c69ce8966984861b5f4`
Target Candidate SHA: `PENDING_CANDIDATE_SHA`

---

## 1. Scope & Non-Normative Declaration

This document defines the exact preparation and execution protocol for the URV1-08 Specialist Route Real-Host Proof.
In accordance with `SLIM_RUNTIME_WIRING_TICKET_GRAPH_V3.md` and `URV1_PARALLEL_EXECUTION_OVERLAY_V1.1.md`:
- This document is preparation only and does NOT constitute proof of compliance or ticket acceptance.
- Final PASS requires live real-host execution capturing 1 real Explorer task and 1 real Oracle review against the post-URV1-03 integrated candidate SHA.
- No production source or test code has been altered by this preparation lane.

---

## 2. Objective & Acceptance Contract

The objective of URV1-08 is to verify that specialist subagent routing (Explorer and Oracle) executes through real configured provider routes and that their terminal outcomes reconcile cleanly into parent orchestrator context without duplicate dispatches or circular wake stalls.

### Required Child Outcomes
1. **One Real Explorer Child Execution**:
   - Agent: `explorer`
   - Configured Provider / Model route
   - Task: Read-only codebase reconnaissance / file symbol survey in a target repository
   - Terminal status: `completed` (or canonical `error`/`cancelled` if resource-bounded)
   - Parent reconciliation: Parent observes completion and incorporates findings without duplicate dispatch.
2. **One Real Oracle Child Execution**:
   - Agent: `oracle`
   - Configured Provider / Model route
   - Task: Non-trivial multi-file code review with candidate diff
   - Terminal status: `completed` (or canonical `error`/`cancelled` if resource-bounded)
   - Parent reconciliation: Parent observes review verdict and reconciles result.

### Strict Retry Bounds Rule
- **No Retry Engine**: There shall be no retry engine, no queue, and no silent re-invocation loop.
- **No Synthetic Pass**: Transient network or provider errors must be faithfully classified (`ENVIRONMENT_DEPENDENT` or `PRE_EXISTING`).
- **Bounded Observational Repeats**: If an observational rerun is needed to distinguish transient provider outages from deterministic failures, it is strictly capped at a maximum of 2 attempts. Every attempt and failure transcript must be permanently recorded.

---

## 3. Evidence Protocol Schema

For both Explorer and Oracle executions, the final proof run must record:

| Evidence Field | Explorer Specification | Oracle Specification | Observed / Bound Value |
| --- | --- | --- | --- |
| Candidate Git SHA | Exact 40-char Candidate SHA | Exact 40-char Candidate SHA | `PENDING_CANDIDATE_SHA` |
| Child Session / Task ID | Task UUID or Session ID | Task UUID or Session ID | `NOT_RUN` |
| Agent Role | `explorer` | `oracle` | `NOT_RUN` |
| Resolved Provider | Configured LLM Provider | Configured LLM Provider | `NOT_RUN` |
| Resolved Model | Configured Model Identifier | Configured Model Identifier | `NOT_RUN` |
| Route Authority | `oh-my-opencode-slim.json` / dynamic route | `oh-my-opencode-slim.json` / dynamic route | `NOT_RUN` |
| Terminal Status | `completed` / `error` / `cancelled` | `completed` / `error` / `cancelled` | `NOT_RUN` |
| Provider Error Captured | Yes / None | Yes / None | `NOT_RUN` |
| Output Digest / Excerpt | Structured reconnaissance findings | Structured review findings / verdict | `NOT_RUN` |
| Parent Reconciliation Status | Successfully observed and consumed | Successfully observed and consumed | `NOT_RUN` |
| Duplicate Dispatch Count | Must be exactly 0 | Must be exactly 0 | `NOT_RUN` |
| Transcript Artifact | `docs/evidence/urv1-08/explorer.log` | `docs/evidence/urv1-08/oracle.log` | `NOT_RUN` |

---

## 4. Test Scenario Definitions & Prompts

### Scenario A: Real Explorer Reconnaissance
- **Target Repository**: Clean checkout or disposable fixture directory.
- **Task Prompt**:
  ```text
  Explore the directory structure of the target repository. Report all TypeScript files under src/hooks, identify their exported symbols, and return a concise JSON summary of hook entry points.
  ```
- **Expected Terminal Behavior**:
  - Explorer spawns under assigned provider/model.
  - Generates read-only tool calls (`Glob`, `Read`, `Grep`).
  - Finishes with status `completed`.
  - Parent reconciliation wake consumes the result without circular trigger.

### Scenario B: Real Oracle Architecture & Code Review
- **Target Context**: A non-trivial diff across two files (e.g. adding a typed event interface).
- **Task Prompt**:
  ```text
  Review the provided patch between commit A and commit B. Evaluate adherence to TypeScript strictness, check for potential null-pointer dereferences, verify that error paths return canonical error types, and produce an independent acceptance verdict.
  ```
- **Expected Terminal Behavior**:
  - Oracle executes review using configured reasoning model route.
  - Outputs structured review feedback with actionable findings.
  - Reconciled into parent context exactly once.

---

## 5. Execution Script Template

```bash
#!/usr/bin/env bash
set -euo pipefail

# URV1-08 Proof Execution Script Template
# To be executed against the final integrated candidate SHA

CANDIDATE_SHA="$(git rev-parse HEAD)"
echo "Executing URV1-08 proof against Candidate SHA: ${CANDIDATE_SHA}"

# 1. Verify provider credentials and active routes
echo "Checking provider route availability..."

# 2. Execute Explorer Run
echo "Dispatching Explorer specialist..."
# Captures child session, stdout transcript, and checks parent wake event

# 3. Execute Oracle Run
echo "Dispatching Oracle specialist..."
# Captures child session, stdout transcript, and checks parent wake event

# 4. Verify Duplicate Dispatch Count is Zero
echo "Auditing event log for duplicate dispatches..."

# 5. Emit Proof Summary
echo "URV1-08 Specialist proof run complete."
```

---

## 6. Readiness Assessment

- **Preparation Status**: `READY`
- **Source Changes in this Lane**: None (`src/**` untouched)
- **Remaining Blockers for Final PASS**:
  1. Post-URV1-03 candidate SHA integration and freeze.
  2. Live real-host execution with network access to configured specialist providers.
  3. Parent reconciliation verification in running agent runtime.
