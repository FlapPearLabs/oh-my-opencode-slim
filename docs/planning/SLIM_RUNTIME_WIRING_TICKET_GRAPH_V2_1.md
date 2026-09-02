SLIM_RUNTIME_WIRING_TICKET_GRAPH_V2_1

Spec:
docs/planning/SLIM_RUNTIME_WIRING_ACCEPTANCE_SPEC_V1.md

Spec status:
DRAFT — TICKET DECOMPOSITION AUTHORITY

Tickets:
- SLIM-V1-01
  title: Runtime Authority Diagnosis
  objective: Diagnose the "Active profile: production" reporting confusion to determine if it is a true code defect or merely a testing/reporting conflation of MODEL PROFILE, PRESET, and HOST OVERRIDE.
  blocked_by: none
  scope: Profile, preset, and override resolution reporting; `/slim-ag` and `/slim-go` override clearing logic.
  non_goals: Replacing the model profile architecture.
  acceptance: Accurate differentiation of MODEL_PROFILE_ACTIVE, PRESET, and HOST_ORCHESTRATOR_OVERRIDE in reporting.
  tests: Update existing tests if reporting format changes.
  real_runtime_evidence: Live verification of reporting accuracy under different configurations.
  likely_files: src/config/profile.ts, src/hooks/profile-commands/index.ts
  risk: LOW
  Recommended model:
  Gemini 3.1 Flash
  Reasoning effort:
  LOW
  Reason:
  Primarily investigation and diagnosis of reporting outputs, low risk of breaking core logic.
  Work type:
  Diagnosing configuration precedence and log/report outputs, possible NO_CODE_CHANGE.

- SLIM-V1-02
  title: UltraWork Skill Discovery Wiring
  objective: Fix the defect where UltraWork is not dynamically discoverable in `available_skills` despite the `/ultrawork` command functioning.
  blocked_by: none
  scope: Skill discovery registry and `available_skills` hook/filter logic.
  non_goals: Creating new state machines or a separate UltraWork skill instance per profile.
  acceptance: `ultrawork` is properly listed in `available_skills` across all intended shared-behavior configs; `deepwork`, `verification-planning`, and other skills are not shadowed.
  tests: Unit tests for skill filtering and discovery.
  real_runtime_evidence: Runtime inspection of available skills in an active session.
  likely_files: src/hooks/filter-available-skills/index.ts, src/skills/ultrawork/SKILL.md
  risk: LOW
  Recommended model:
  Gemini 3.1 Pro
  Reasoning effort:
  MEDIUM
  Reason:
  Touches cache-sensitive hook injection paths and requires robust handling of skill filtering.
  Work type:
  Code changes to hook wiring and skill registry.

- SLIM-V1-03
  title: Hashline Runtime Activation Diagnosis
  objective: Diagnose why Hashline was inactive in the previous acceptance. Check if it is disabled in config, if the optional peer is missing, or if there is a runtime registration bug.
  blocked_by: none
  scope: `hashline_edit` config resolution, optional peer dependency loading (`@oh-my-pi/hashline`), tool registration.
  non_goals: Reimplementing Hashline (already in `src/hooks/hashline/`).
  acceptance: Root cause identified. If config-disabled or peer absent, execute acceptance-environment remediation only. If code defect, implement scoped remediation.
  tests: Regression tests for any discovered registration bug.
  real_runtime_evidence: Observation of `hashline_edit` tool and `read` annotation being active when properly enabled.
  likely_files: src/hooks/hashline/index.ts, src/config/runtime.ts
  risk: LOW
  Recommended model:
  Gemini 3.1 Flash
  Reasoning effort:
  LOW
  Reason:
  Purely diagnosis and environment verification of an existing implementation.
  Work type:
  Investigation and possible NO_CODE_CHANGE (environment fix).

- SLIM-V1-04
  title: Explorer / Oracle Provider Route Proof
  objective: Mechanically resolve agent, provider, model, authority, terminal result, and reconciliation. Ensure 'Insufficient balance' is classified correctly without duplicate dispatch.
  blocked_by: none
  scope: Background failure classification mapping and terminal result reporting.
  non_goals: Modifying orchestration logic or creating new fallback loops.
  acceptance: 'Insufficient balance' is classified correctly as EXTERNAL_PROVIDER_RESOURCE_FAILURE. No duplicate background dispatch occurs.
  tests: Tests for failure classification mapping.
  real_runtime_evidence: Parent accurately reconciles and reports terminal provider resource errors.
  likely_files: N/A during diagnosis; discover actual owning code only if a code defect is proven.
  risk: LOW
  Recommended model:
  Gemini 3.1 Pro
  Reasoning effort:
  MEDIUM
  Reason:
  Touches core background job board reconciliation paths where misclassification could cause infinite retry loops.
  Work type:
  Failure classification verification and possible NO_CODE_CHANGE.

- SLIM-V1-05
  title: Completion Gate + Oracle Wait Proof
  objective: Verify that UltraWork completion waits for and reconciles required Oracle review results before declaring DONE.
  blocked_by: SLIM-V1-02, SLIM-V1-04
  scope: UltraWork completion gate logic and Oracle review integration.
  non_goals: Building a generic CI framework.
  acceptance: Adversarial proof: unresolved required Oracle result, UNKNOWN failure, or unreconciled background result must not DONE. DONE is permitted only after resolution.
  tests: Unit tests verifying failure classification blocks completion.
  real_runtime_evidence: Bounded adversarial testing in a real host demonstrating the gate holds.
  likely_files: src/skills/ultrawork/SKILL.md, src/hooks/ultrawork-command/index.ts
  risk: MEDIUM
  Recommended model:
  Gemini 3.1 Pro
  Reasoning effort:
  HIGH
  Reason:
  Requires strong logical reasoning to handle edge cases in completion state machines and ensure no premature termination.
  Work type:
  Verifying and strictly enforcing completion policy, possible NO_CODE_CHANGE if already enforced by prompt.

- SLIM-V1-06
  title: Resume / Recovery / Watchdog Runtime Proof
  objective: Provide explicit runtime acceptance for Resume, Recovery, and Watchdog mechanisms.
  blocked_by: SLIM-V1-02
  scope: Real-world observation of durable progress reuse, background state rehydration, idle reconciliation, and orchestrator wake.
  non_goals: Creating new state machines or a new watchdog.
  acceptance: Durable progress reused after restart; stopped/unreconciled child is not success; task_result is consumed; task_revive is used where safe; no duplicate dispatch; incomplete work remains incomplete; wake does not silently DONE.
  tests: Rely on existing watchdog/wake tests; focus on real runtime proof.
  real_runtime_evidence: Explicit documented logs showing correct recovery and wake behavior in an interrupted session.
  likely_files: N/A
  risk: LOW
  Recommended model:
  Gemini 3.1 Flash
  Reasoning effort:
  LOW
  Reason:
  Mechanical verification of existing systems under controlled fault injection.
  Work type:
  Runtime observation and diagnosis, possible NO_CODE_CHANGE.

- SLIM-V1-07
  title: Hashline Real Host Proof
  objective: Prove Hashline features in a real host (read annotation, valid edit, stale rejection).
  blocked_by: SLIM-V1-03
  scope: Real host verification with `hashline_edit: true` and the optional peer installed.
  non_goals: Modifying Hashline logic.
  acceptance: Stale edit is successfully rejected; reread/reanchor succeeds; native edit remains unaffected.
  tests: None (manual/scripted real-runtime execution).
  real_runtime_evidence: Logged session demonstrating stale edit rejection and successful reanchor.
  likely_files: N/A
  risk: LOW
  Recommended model:
  Gemini 3.1 Flash
  Reasoning effort:
  LOW
  Reason:
  Straightforward behavioral dogfooding and output verification.
  Work type:
  Running end-to-end tests manually or via script, NO_CODE_CHANGE expected.

- SLIM-V1-08
  title: Final Bounded V1 Real-Runtime Acceptance
  objective: Execute a bounded real UltraWork run on a disposable repository to prove the entire acceptance matrix.
  blocked_by: SLIM-V1-01, SLIM-V1-05, SLIM-V1-06, SLIM-V1-07
  scope: Full integration test on a disposable repository.
  non_goals: Code implementation; modifying production credentials.
  acceptance: All items in the Real Runtime Acceptance Matrix PASS, including zero human interventions, successful Explorer, successful Oracle, and accurate completion gating.
  tests: bun run check:ci, bun run typecheck, bun run build, bun run verify:release, targeted affected tests, bun test. Classify every failure: CAUSED_BY_THIS_CHANGE, PRE_EXISTING, ENVIRONMENT_DEPENDENT, UNKNOWN. No CAUSED_BY_THIS_CHANGE or UNKNOWN may remain unresolved.
  real_runtime_evidence: Final Acceptance Report meeting the Definition of Done.
  likely_files: docs/reviews/SLIM_UNATTENDED_RELIABILITY_FINAL_REVIEW.md
  risk: HIGH
  Recommended model:
  Gemini 3.1 Pro
  Reasoning effort:
  HIGH
  Reason:
  High complexity integration test requiring synthesis of all components and rigorous failure classification.
  Work type:
  Full system dogfooding and evidence compilation.

Critical path:
SLIM-V1-02 ─┐
            ├─> SLIM-V1-05 ─┐
SLIM-V1-04 ─┘               │
                            ├─> SLIM-V1-08
SLIM-V1-03 -> SLIM-V1-07 ───┤
                            │
SLIM-V1-02 -> SLIM-V1-06 ───┤
                            │
SLIM-V1-01 ─────────────────┘

Parallelizable lanes:
Lane 1: SLIM-V1-01 (Authority Reporting)
Lane 2: SLIM-V1-02 ─┐
                    ├─> SLIM-V1-05 (Completion Gate/Wait Proof)
        SLIM-V1-04 ─┘
Lane 3: SLIM-V1-02 -> SLIM-V1-06 (Resume/Watchdog Proof)
Lane 4: SLIM-V1-03 -> SLIM-V1-07 (Hashline Proof)

Code-change Tickets:
SLIM-V1-02

Diagnosis / possible-no-code-change Tickets:
SLIM-V1-01, SLIM-V1-03, SLIM-V1-04, SLIM-V1-05, SLIM-V1-06

Final real-runtime acceptance Ticket:
SLIM-V1-08

Architecture invariant check:
New runtime state machines proposed: 0
New persistence systems proposed: 0
Duplicate scheduler proposed: NO
Duplicate job board proposed: NO
UltraWork reimplementation proposed: NO

Implementation started:
NO

READY_FOR_CHATGPT_TICKET_REVIEW:
YES
