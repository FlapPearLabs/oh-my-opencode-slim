# URV1-04A — Profile Authority and Reporting Correction

TICKET:
URV1-04A — Conditional profile authority/reporting correction

STATUS:
`CODE_CHANGE` — executed; defects D1 and D2 from the URV1-04 handoff are
reproduced red, corrected, and proven green by regression + integration tests.

TICKET CLASS:
`CODE_CHANGE` (conditional ticket authorized by URV1-04 §10)

REPOSITORY:
FlapPearLabs/oh-my-opencode-slim

BRANCH:
`work/urv1-04a-profile-fix`

WORKTREE:
`/Users/songshiyao/Documents/ChatGPT/opencode-slim-runtime-worktrees/slim-urv1-04a`

EXACT BASE SHA:
`791d974ee964e2ba2cbb9fc2c439b54bdc7393bd` (= `HEAD` at start; clean worktree)

FROZEN SPEC COMMIT:
`16bb77f8209542a6bcc1ca11a48203867d8a3378` (ancestor of base; unchanged)

FROZEN GRAPH COMMIT:
`9bac2333d5a2963a05f39e130fffc587336096c9` (ancestor of base; unchanged)

HANDOFF SOURCE:
`docs/reviews/URV1-04_PROFILE_AUTHORITY_DIAGNOSIS.md` §§10–14 (unchanged)

IMPLEMENTER_BACKEND:
CodeBuddy Code / WorkBuddy CLI

IMPLEMENTER_REQUESTED_MODEL:
deepseek-v4-flash

IMPLEMENTER_OBSERVED_MODEL:
deepseek-v4-flash (actual runtime model of this session/stream; observed from
this agent's own runtime identity, not inferred from the requested route)

CREDENTIALS/CONFIG MODIFIED:
NO (all fixtures redirected HOME/XDG/OPENCODE_CONFIG_DIR/log paths; real user
config, credentials, providers, proxy never read or written)

HOST EVIDENCE:
REAL_RUNTIME: NOT_PROVEN (one isolated real-host boot was attempted; the plugin
was not loaded through the `opencode run` CLI surface, so `/slim-*` command
output was not observed. No host claim is made. See §8.)

VERDICT:
Both frozen-handoff defects are repaired with the smallest change confined to
the diagnosed seams. `/slim-go` and `/slim-ag` now preserve every
user-owned/unknown-origin host `agent.<name>.model` override (the provably
Slim-managed clearable set is empty under current authority because no
producer exists) and print a concise retention line naming the affected
managed agents. `/slim-profile` now reports the six Spec §4.4 values
separately — MODEL_PROFILE_ACTIVE, MODEL_PROFILE_STAGED, PRESET,
HOST_ORCHESTRATOR_OVERRIDE, RESOLVED_ORCHESTRATOR_MODEL, RESOLUTION_AUTHORITY —
resolved through the §4.3 precedence chain (host override > selected Slim
profile > preset > agent factory/default), and never presents a profile
mapping default as the resolved model when a host override wins.

---

## 1. Scope and boundaries honored

- Authority: Spec §§3.3, 4.1–4.5, 12.2–12.5, 13, 15; V3 graph URV1-04A; URV1-04
  handoff §10.
- In scope (exact seams): `src/hooks/profile-commands/index.ts`
  (`clearHostModelOverrides` call sites `/slim-go` `:66`, `/slim-ag` `:74`, and
  the `/slim-profile` handler), its test file, the bounded read-only runtime
  wiring in `src/index.ts:448`, and focused regression tests.
- Out of scope honored: no provenance database or ownership marker, no profile
  expansion, no model-mapping change, no profile file schema change, no
  credentials/provider/proxy mutation, no Skill/MCP/prompt/orchestration
  change, no cache-safety surface change, no new subsystem/scheduler/state
  machine/filesystem ledger. The reviewer's out-of-scope observation about the
  separate runtime-preset reload path was NOT addressed (not required by the
  frozen handoff). No push/merge/PR. Spec and graph untouched.

## 2. Environment / prerequisites

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | exit 0; `250 packages installed [3.42s]`; tree clean after |
| `bun --version` | 1.3.13 |
| `git status` at start | clean; HEAD = base SHA |

Host binary available for the NOT_PROVEN attempt: `opencode 1.15.13` at
`/opt/homebrew/bin/opencode`.

## 3. Red/green ledger

### RED phase (before the handler fix; additive export surface + new/rewritten
tests present, behavior still old)

`bun test src/hooks/profile-commands/index.test.ts`

| Result | Test | Decisive failure |
| --- | --- | --- |
| FAIL | URV1-04A D1. /slim-ag preserves … overrides and reports retention | `writeConfig is not defined` on the old clear path; host overrides deleted; no retention line |
| FAIL | URV1-04A D1. /slim-go preserves … overrides and reports retention | same defect |
| FAIL | E. Staging semantics (updated six-label asserts) | output still `Active:/Next launch:`; no `MODEL_PROFILE_*` labels |
| FAIL | F. Restart semantics (updated six-label asserts) | same label mismatch |
| FAIL | URV1-04A D2. six separate authority values, host override wins | only 2 labels present; mapping default shown as `Active routing`; no PRESET/HOST/RESOLVED/AUTHORITY |
| FAIL | URV1-04A D2. PROFILE authority when no host override | label mismatch |
| PASS | F-02. switching profile when no host override exists works cleanly | unchanged valid path |
| PASS | URV1-04A precedence resolver host > profile > preset > factory | pure function test |

`2 pass / 6 fail / 13 expect()` — the six failures are the deliberate red
demonstration of D1/D2 and the label change.

### GREEN phase (handler + wiring corrected)

`bun test src/hooks/profile-commands/index.test.ts` → `8 pass / 0 fail / 39
expect()`.

`bun test src/hooks/profile-commands/index.test.ts src/config/profile.test.ts
src/index.test.ts` → `30 pass / 0 fail / 108 expect()` (includes the two new
plugin-level wiring tests in `src/index.test.ts`).

`bun test src/index.test.ts` → `16 pass / 0 fail` (host-wins precedence test
still green; new `URV1-04A /slim-go preserves … through the real plugin` and
`URV1-04A /slim-profile reports six authority values through the real plugin
wiring` green).

`bun test -t "profile switching does not alter shared skill …"
src/hooks/filter-available-skills/index.test.ts` → `1 pass` (Skill
orthogonality intact).

`bun test src/hooks/cache-safety.property.test.ts
src/hooks/cache-payload.snapshot.test.ts src/cache-safety-tripwire.test.ts
src/hooks/cache-safety-harness.test.ts` → `17 pass / 0 fail`.

`bun test` (full) → `2425 pass / 0 fail / 3 snapshots, 6170 expect() across
144 files` (68.28s).

`bun run typecheck` → exit 0. `bun run build` → exit 0.

`bun run check:ci` → exit 1 with `Found 15 errors / 30 warnings / 3 infos`.
Failure classification: all 15 errors are `PRE_EXISTING` (URV1-00 §4.1 lists
the same 6 files: `src/cli/skills.ts`, `src/config/profile.test.ts`,
`src/config/profile.ts`, `src/hooks/hashline/*`). Zero diagnostics in the four
changed files (`bunx biome check` on changed files: clean). One pre-existing
unused-variable warning was removed in scope with its declaration.

## 4. Source map (exact change)

### 4.1 `src/hooks/profile-commands/index.ts`

- Removed `clearHostModelOverrides` (the unconditional, provenance-blind
  deleter) and the `writeConfig` import. Replaced with
  `preservedHostOverrideAgents(managedAgentNames)`: reads the host
  `opencode.json` via the existing `getExistingConfigPath()`/`parseConfig()`
  path resolution, collects every managed `agent.<name>` entry whose `model`
  is present, and **never writes**. Because no producer anywhere makes an
  on-disk model provably Slim-managed, the clearable set is empty; the return
  value feeds the retention line.
- `/slim-go` and `/slim-ag` now: stage the profile (`writeProfile`, unchanged
  file/schema), compute `preserved`, and print the existing staging text plus,
  when non-empty, a conflict/retention line:
  `Host model override preserved for: <names>` and an explanation that no host
  model was cleared and those agents keep their host-selected model. Staged →
  restart activation is untouched (test E/F still green).
- `/slim-profile` now emits the six separately-labeled values. PRESET and the
  host override come from the read-only `ProfileRuntimeSource`
  (`getPresetName`, `getHostAgentModel('orchestrator')`), the resolved model
  and authority come from the pure `resolveOrchestratorResolution` which walks
  the §4.3 precedence chain over the existing layers. The old
  `Active routing`/`Next routing` mapping-default banners (which conflated
  mapping defaults with the resolved model) are removed. The restart
  indication is retained (`Restart required: yes|no`).
- Added exports: `ResolutionAuthority`, `OrchestratorResolution`,
  `ProfileRuntimeSource`, `resolveOrchestratorResolution`.

### 4.2 `src/index.ts` (call site `:448`)

`createProfileCommandsHook` now receives a bounded, read-only runtime source
built from the existing in-memory `RuntimeConfig` and plugin config in scope:
`getPresetName` → `runtime.preset`; `getHostAgentModel` → the pre-mutation host
snapshot `runtime.hostAgent(name)?.model` (string form); `getPresetOrchestratorModel`
→ primary model from `config.presets[preset].orchestrator`; `getFactoryOrchestratorModel`
→ the orchestrator factory-layer model captured once before the config hook's
profile pass mutates the in-place agent registry. No new storage, no setters,
no prompt surface.

### 4.3 Tests

- `src/hooks/profile-commands/index.test.ts`: rewritten F-02 assertions to the
  preservation/retention semantics (D1); new D2 six-value tests with a stub
  runtime source; new pure precedence-resolver test; E/F updated to the
  canonical labels (semantics unchanged).
- `src/index.test.ts`: two INTEGRATION_SIMULATION tests exercising the real
  plugin wiring — `/slim-go` on-disk preservation through real `cli/paths` and
  `/slim-profile` six-field output sourced from the real captured
  `RuntimeConfig` host snapshot + plugin-file preset.

## 5. Required semantics → observed

| Requirement | Observed |
| --- | --- |
| `/slim-go`, `/slim-ag` preserve user-owned/unknown host overrides | Host `agent.<name>.model` untouched on disk (unit + real-plugin wiring tests) |
| Clear only provably Slim-managed override (set is empty today) | `preservedHostOverrideAgents` never clears; comment documents the empty clearable set; no provenance store invented |
| Report conflict/retention line naming affected managed agents | `Host model override preserved for: <names>` when any retained; absent otherwise |
| Six separately-labeled values | `MODEL_PROFILE_ACTIVE`, `MODEL_PROFILE_STAGED`, `PRESET`, `HOST_ORCHESTRATOR_OVERRIDE`, `RESOLVED_ORCHESTRATOR_MODEL`, `RESOLUTION_AUTHORITY` each on its own line |
| Do not present mapping default as resolved when host override wins | `RESOLVED_ORCHESTRATOR_MODEL: user/custom-model` + `RESOLUTION_AUTHORITY: HOST`; mapping default asserted absent from the resolved line |
| Precedence host > profile > preset > factory/default | `resolveOrchestratorResolution` walks the chain in that order; pure test covers all four authorities |
| Staged-versus-active/restart semantics preserved | `writeProfile` + `activeProfile` capture + `Restart required` unchanged; E/F green |
| No mapping/profile-expansion/credentials/provider/proxy mutation | Diff contains no such change |
| Shared Skill/MCP/prompt/orchestration behavior not drifting | No prompt/Skill/MCP code touched; orthogonality test green; full suite green |

## 6. Architecture-invariant counts

```
New runtime state machines:                0
New persistence systems:                   0
New scheduler:                             0
New job board:                             0
New watchdog engine:                       0
New completion engine:                     0
Duplicate UltraWork engine:                0
New provider/account orchestration system: 0
Duplicate scheduler:                       NO
Duplicate job board:                       NO
Override-provenance store/marker:          NO (clearable set deliberately empty)
Profile/model-mapping change:              NO
Credentials/config/provider/proxy changed: NO
Skill/MCP/prompt/orchestration drift:      NO
Cache-safety/prompt-surface change:        NO
Implementation begun:                      YES (CODE_CHANGE)
```

## 7. Evidence-level summary

| Evidence | Level | Where |
| --- | --- | --- |
| D1 red/green (preserve + retention, `/slim-go`,`/slim-ag`) | UNIT | profile-commands tests |
| D2 six-value red/green (host wins; profile fallback) | UNIT | profile-commands tests |
| Precedence resolver all four authorities | UNIT | pure resolver test |
| D1 on-disk preservation via real plugin wiring | INTEGRATION_SIMULATION | `src/index.test.ts` new tests |
| D2 six values from real captured RuntimeConfig + file preset | INTEGRATION_SIMULATION | `src/index.test.ts` new tests |
| Existing host-wins precedence test | INTEGRATION_SIMULATION | `profile inheritance > host explicit model override wins …` (green) |
| Skill/profile orthogonality | UNIT | filter-available-skills profile test (green) |
| Cache-safety harness/snapshot/tripwire | UNIT | 17 pass |
| Full suite | UNIT | 2425 pass / 0 fail |
| Real-host `/slim-*` output pre/post restart | REAL_RUNTIME **NOT_PROVEN** | §8 |

## 8. Real-host attempt (isolated fixture only; nothing observed → NOT_PROVEN)

Attempted in a fully isolated temporary fixture (never touching real user
config/credentials/providers/proxy):

- `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`,
  `OPENCODE_CONFIG_DIR`, `OPENCODE_LOG_DIR` all redirected under
  `/tmp/urv1-04a-host-fixture/` (created, then removed after the attempt).
- Wrote fixture `opencode.json` with
  `plugin: ["<repo root>"]` and fixture
  `$HOME/.config/opencode/slim-profile.json` = `{"profile":"opencode-go"}`.
- Ran `opencode run --command slim-profile --print-logs --log-level INFO`
  with the isolated env (timeout 90s).
- Observed: `opencode 1.15.13` booted and ran its one-time DB migration under
  the fixture data dir, then loaded internal plugins only. No external plugin
  load was observed (no `oh-my-opencode-slim.<ts>.log` produced; no command
  output captured). The plugin was not loadable through this headless CLI
  surface, so the `/slim-*` command output was **not observed**.

Label: REAL_RUNTIME NOT_PROVEN. No real-host claim is made; nothing in this
review promotes unit/simulation evidence to real-runtime PASS. Real user state
was never read or written (all paths redirected; fixture removed).

## 9. Self-review findings and remediation

| Finding | Remediation |
| --- | --- |
| Initial `check:ci` on changed files reported 3 formatter diffs (error count 15 → 18) | `bunx biome check --write` on the four changed files; final `check:ci` returns to the baseline 15 PRE_EXISTING errors, zero in changed files |
| Unused `profilePath` const surfaced in the rewritten unit test | Removed the dead declaration (warnings 31 → 30; strictly local) |
| Host-override reporting depends on the pre-mutation host snapshot captured by the config hook | Matches existing `RuntimeConfig` semantics; documented in §10 gaps |
| Confirm no prompt/cache surface touched | `ProfileRuntimeSource` is read-only; changed code paths only emit command output and read config; cache-safety harness/snapshot/tripwire green and no transform steps added |
| Confirm out-of-scope runtime-preset reload path untouched | No change in `setRuntimePreset`/config-hook runtime-preset override loop |
| Windows/path implications | None: no new path handling; existing `getExistingConfigPath`/`parseConfig` reused |
| Secret leakage | None: command output contains only config-derived model/profile/preset names |

## 10. Known gaps / limitations

- REAL_RUNTIME evidence for the changed reporting/profile-switch seams:
  NOT_PROVEN (see §8).
- `/slim-profile` HOST_ORCHESTRATOR_OVERRIDE is sourced from the in-memory
  pre-mutation host snapshot; a host override present only on disk in a
  process whose config hook never ran would not be surfaced. In a real host
  the config hook always runs before commands are available.
- A non-string host `model` value is preserved by `/slim-go`/`/slim-ag`
  (`entry.model !== undefined`) but is not printed as
  HOST_ORCHESTRATOR_OVERRIDE (only string models are). Host schema models are
  strings.
- PRESET/AGENT_FACTORY authority for the orchestrator is unreachable in
  production because both shipped mappings list `orchestrator` (URV1-04 S4
  finding); those resolver branches are proven by the pure unit test only.
- `bun run check:ci` failures are PRE_EXISTING (URV1-00 §4.1) and were not
  repaired per Spec §12 and ticket scope.

## 11. Candidate SHA / files changed / handoff packet

CANDIDATE_SHA:
(recorded after the documentation + source commit below)

PARENT_SHA:
`791d974ee964e2ba2cbb9fc2c439b54bdc7393bd`

FILES CHANGED (source/test):
- `src/hooks/profile-commands/index.ts`
- `src/hooks/profile-commands/index.test.ts`
- `src/index.ts`
- `src/index.test.ts`

FILES CHANGED (evidence): `docs/reviews/URV1-04A_PROFILE_AUTHORITY_CORRECTION.md`.

DOCS OUTSIDE THE REVIEW PACKET:
intentionally unchanged. No user-facing doc describes the `/slim-profile`
output text or the switch-time host-override clearing behavior; the only
related prose (`docs/skills.md` orthogonality note and the ultrawork SKILL.md
mention) remains accurate after the change (switching still stages a profile
and now additionally never clears host config), so no doc sync was required.

COMMAND/RESULT LEDGER: §3.

SCOPE / INVARIANT CONFIRMATION: §1, §6. No push/merge; branch-only commit.
