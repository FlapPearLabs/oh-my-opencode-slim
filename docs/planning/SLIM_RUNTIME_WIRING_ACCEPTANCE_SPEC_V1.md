# Slim Runtime Wiring Acceptance Spec V1

Status: **DRAFT — TICKET DECOMPOSITION AUTHORITY**

Implementation status: **BLOCKED PENDING TICKET REVIEW**

Repository: `FlapPearLabs/oh-my-opencode-slim`

Planning branch: `work/slim-unattended-reliability`

Remote planning baseline before this document: `54282994729de852e27751f80edde16a19e75d15`

Latest implementation commit before the final review-only commit: `6e22b8c1169949802b246fe14d38bed5b2e43395`

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

Target:

```text
New runtime state machines: 0
New persistence systems: 0
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
host explicit model override
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
- clear stale Slim-managed host model overrides where current accepted profile-switch behavior requires it;
- preserve unrelated host configuration;
- require restart where current host semantics require restart;
- after restart, resolve the intended profile mapping;
- retain identical shared Skills and orchestration behavior.

Do not change accepted model mappings unless current repository authority proves the mapping has intentionally changed.

---

## 5. UltraWork Skill Discovery Requirement

The runtime acceptance already proved that `/ultrawork` command execution can drive a real autonomous run.

The remaining defect is **Skill discovery/permission consistency**.

### 5.1 Required behavior

For the Orchestrator in every supported shared-behavior configuration where UltraWork is intended to exist:

```text
available_skills
```

MUST include:

```text
ultrawork
```

The Orchestrator MUST be able to discover and load the UltraWork Skill through the normal bundled Skill discovery path.

### 5.2 Single authority

Prefer a single shared Skill authority.

Do not create profile-specific copies of the UltraWork Skill.

If presets own independent Skill allowlists, every relevant Orchestrator preset MUST receive the shared capability consistently, with regression coverage preventing drift.

### 5.3 Non-regression

Fixing UltraWork discovery MUST NOT remove or shadow:

- `deepwork`;
- `verification-planning`;
- `worktrees`;
- `codemap`;
- `clonedeps`;
- other currently intended bundled Orchestrator Skills.

---

## 6. Hashline Runtime Availability Requirement

Hashline is a required **available capability** of the completed V1, while remaining optional in packaging/default configuration.

### 6.1 Config classification first

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

### 6.2 Controlled acceptance mode

For final V1 acceptance, enable:

```text
hashline_edit: true
```

through the normal Slim configuration authority.

Ensure the exact compatible optional peer required by current repository authority is resolvable from the actual loaded Slim runtime.

### 6.3 Real host read annotation

With Hashline enabled and the peer installed, a real native OpenCode file `read` MUST preserve native rendering and add a Hashline anchor:

```text
[path#TAG]
```

The anchor MUST correspond to the normalized full-file snapshot and the actual seen line range.

### 6.4 Real host edit

The dedicated additive `hashline_edit` tool MUST be present in the real session tool set when enabled.

A valid current tag MUST allow a valid edit.

Native `edit` MUST remain independent and valid without a tag.

Native `apply_patch`, where the host exposes it, MUST remain independent and valid without a tag.

### 6.5 Stale-edit rejection

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

### 6.6 Existing file safety remains authoritative

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

## 7. Background Specialist Routing and Provider Failure Semantics

The previous real acceptance proved that real background dispatch and terminal failure reconciliation work.

It did **not** prove successful Explorer and Oracle model execution because the provider returned `Insufficient balance`.

### 7.1 Required classification

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

### 7.2 Successful background proof before final acceptance

Before V1 can be marked ready for long unattended real-project dogfood, the controlled acceptance environment MUST provide a viable model/provider route and prove at least:

- one real Explorer child returns a usable result;
- one real Oracle child returns a usable review;
- the parent consumes/reconciles each result.

A terminal provider error is valid evidence for failure handling, but it is not evidence of successful specialist work.

### 7.3 No duplicate dispatch

A provider/resource failure MUST NOT cause uncontrolled duplicate respawn.

Existing bounded retry/revive/fallback semantics remain authoritative.

---

## 8. Real Oracle Requirement

Oracle dispatch is already proven.

Successful Oracle review remains required.

### 8.1 Minimal proof

Use a disposable repository and a small non-trivial diff.

A real Oracle run MUST produce:

- a real child/session ID;
- a real provider/model call;
- an actual review result;
- parent reconciliation of that review result.

### 8.2 UltraWork completion integration

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

## 9. Completion and Recovery Requirements

Do not build a new completion subsystem.

Use current Slim behavior.

### 9.1 Completion requirements

Where applicable to the Ticket, DONE requires:

- Ticket-owned implementation complete;
- owned TODOs complete;
- targeted tests complete;
- broader required validation complete;
- background terminal results reconciled;
- no unresolved `CAUSED_BY_THIS_CHANGE` failure;
- no unresolved `UNKNOWN` failure;
- material Oracle findings resolved or explicitly accepted by repository authority;
- Git boundary checked;
- Ticket acceptance criteria satisfied.

### 9.2 Recovery requirements

Existing behavior remains responsible for:

- stopped/unreconciled child classification;
- task result retrieval;
- task revive where safe;
- orchestrator wake on incomplete owned work;
- restart/rehydration;
- durable progress reuse.

The final phase should verify these surfaces have not regressed, not replace them.

---

## 10. Real Runtime Acceptance Matrix

The final acceptance MUST be performed in a real OpenCode runtime, not solely via unit tests or integration simulation.

Evidence levels MUST be labeled as one of:

```text
UNIT
INTEGRATION_SIMULATION
REAL_RUNTIME
NOT_PROVEN
```

Never promote UNIT or INTEGRATION_SIMULATION evidence to REAL_RUNTIME.

### 10.1 Required real-runtime checks

The final acceptance matrix MUST include:

| Capability | Required result |
| --- | --- |
| OpenCode host runtime | PASS |
| Slim plugin loading | PASS |
| Profile/preset/override reporting | PASS |
| `/slim-go` availability | PASS |
| `/slim-ag` availability | PASS |
| `/slim-profile` availability | PASS |
| `/deepwork` regression | PASS |
| `/loop` regression | PASS |
| `/ultrawork` command | PASS |
| UltraWork Skill discovery | PASS |
| Real UltraWork execution | PASS |
| Agent-created progress artifact | YES |
| Verification planning | YES |
| Successful real Explorer | PASS |
| Explorer result reconciliation | PASS |
| Successful real Oracle | PASS |
| Oracle result reconciliation | PASS |
| Implementation | PASS |
| Targeted tests | PASS |
| Broader applicable validation | PASS |
| Completion waits for required Oracle | PASS |
| Human interventions | 0 for bounded acceptance Ticket |
| Hashline tool presence when enabled | PASS |
| Native read Hashline annotation | PASS |
| Valid Hashline edit | PASS |
| Stale tag rejection | PASS |
| Stale operation mutates file | NO |
| Reread/reanchor recovery | PASS |
| Native edit unaffected | PASS |
| Native apply_patch unaffected | PASS or NOT_AVAILABLE |
| Restart/resume non-regression | PASS |
| Git boundary | PASS |
| Credentials modified | NO |

### 10.2 Acceptance Ticket

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

## 11. Test Requirements

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

Required validation before final review:

```text
bun run check:ci
bun run typecheck
bun run build
bun run verify:release
bun test <targeted/affected tests>
bun test
```

If the applicable full suite has environment-dependent or pre-existing failures, every failure must be classified:

- `CAUSED_BY_THIS_CHANGE`;
- `PRE_EXISTING`;
- `ENVIRONMENT_DEPENDENT`;
- `UNKNOWN`.

No unresolved `CAUSED_BY_THIS_CHANGE` or `UNKNOWN` failure is acceptable for completion.

---

## 12. Cache-Safety Requirement

Any implementation affecting agent prompts, tool surfaces, Skill discovery, configuration composition, or outgoing request payloads MUST respect `AGENTS.md` prompt-cache safety rules.

Do not introduce per-turn volatile content into stable prompt prefixes.

Any new transform that affects outgoing payload composition must be integrated into the repository's existing cache-safety harness and snapshot/tripwire coverage where applicable.

This phase should prefer configuration/registry wiring changes over new prompt mutation.

---

## 13. Documentation Requirements

After runtime behavior is mechanically proven, update documentation to distinguish clearly:

- model profile vs preset vs host model override;
- UltraWork command availability vs Skill discovery;
- Hashline capability availability vs Hashline enabled state;
- background dispatch/reconciliation vs successful specialist model execution;
- Oracle dispatch vs successful Oracle review;
- UNIT / INTEGRATION_SIMULATION / REAL_RUNTIME evidence.

Do not document a capability as real-runtime PASS based only on source inspection or tests.

---

## 14. Non-Goals

This specification does NOT authorize:

- a new agent architecture;
- redesign of UltraWork;
- replacement of Deepwork;
- replacement of Loop;
- new persistence storage;
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

## 15. Ticket Decomposition Contract

`/toticket` MUST decompose this specification into the smallest dependency-correct Tickets that can be independently implemented, tested, reviewed, and accepted.

### 15.1 Required decomposition principles

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

### 15.2 Expected decomposition shape

The ticket graph will likely need independent lanes for concepts such as:

- runtime authority/profile/preset/override diagnosis and reporting;
- UltraWork Skill discovery wiring;
- Hashline resolved-config/peer/runtime activation and real-host proof;
- successful Explorer/Oracle provider routing probes and reconciliation proof;
- final bounded real-runtime UltraWork acceptance and evidence publication.

This list is a decomposition hint, **not a required Ticket list**.

`/toticket` should consolidate or split these only when repository dependency boundaries justify it.

### 15.3 Ticket review gate

After `/toticket` produces the Ticket graph:

```text
STOP
```

Do not implement any Ticket.

Return the decomposition for independent ChatGPT review.

Implementation may begin only after the user receives an explicit review verdict approving the Ticket graph.

---

## 16. Definition of Done

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

## 17. Required `/toticket` Output

The decomposition should return a review packet containing at least:

```text
SLIM_RUNTIME_WIRING_TICKET_GRAPH

Spec:
docs/planning/SLIM_RUNTIME_WIRING_ACCEPTANCE_SPEC_V1.md

Spec status:
DRAFT — TICKET DECOMPOSITION AUTHORITY

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
