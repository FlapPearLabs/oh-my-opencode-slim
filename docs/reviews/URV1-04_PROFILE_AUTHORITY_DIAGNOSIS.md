# URV1-04 — Profile Authority and Reporting Diagnosis

TICKET:
URV1-04 — Profile authority and reporting diagnosis

STATUS:
`DIAGNOSIS / NO_CODE_CHANGE` — executed; a source defect **is** proven; conditional
URV1-04A handoff issued below. No source/test/Spec/graph/config/credentials were
changed by this ticket.

TICKET CLASS:
`DIAGNOSIS / NO_CODE_CHANGE`

REPOSITORY:
FlapPearLabs/oh-my-opencode-slim

BRANCH:
`work/urv1-04-profile`

WORKTREE:
`/Users/songshiyao/Documents/ChatGPT/opencode-slim-runtime-worktrees/slim-urv1-04`

EXACT BASE SHA:
`1a3fba9b1e4ba7eef266063e9c432844d60645eb` (= `HEAD` at start; accepted
predecessor URV1-00 at that SHA)

FROZEN SPEC COMMIT:
`16bb77f8209542a6bcc1ca11a48203867d8a3378` (ancestor of base)

FROZEN GRAPH COMMIT:
`9bac2333d5a2963a05f39e130fffc587336096c9` (ancestor of base)

V2.1 GRAPH:
Reference only, not used as authority.

IMPLEMENTER_BACKEND:
WorkBuddy CLI 2.137.1

IMPLEMENTER_REQUESTED_MODEL:
deepseek-v4-flash

IMPLEMENTER_OBSERVED_MODEL:
deepseek-v4-flash (actual runtime model of this session)

CREDENTIALS/CONFIG MODIFIED:
NO

HOST EVIDENCE:
REAL_RUNTIME: NOT_PROVEN (no real opencode host was booted for this diagnosis;
no host claim is made). Evidence below is UNIT and INTEGRATION_SIMULATION only,
never promoted.

VERDICT:
Two source defects against the frozen authority model (Spec §§4.4, 4.5) are
proven by disposable fixtures: (D1) `/slim-go` and `/slim-ag` unconditionally
delete host `agent.<managed>.model` entries in `opencode.json` regardless of
provenance, destroying user-explicit/unknown-origin host overrides that must be
preserved; (D2) `/slim-profile` does not report the six required authority
values separately and presents the profile-mapping default as "Active routing",
conflating mapping defaults with the resolved model. Config-hook precedence
itself (host override > selected Slim profile > preset > factory default) is
correct. Handoff to conditional URV1-04A below.

---

## 1. Scope and boundaries honored

- Authority: Spec §§3.3, 4.1–4.5, 11.2, 12.2–12.5, 15; V3 graph URV1-04.
- In scope: reporting of the six required values; precedence; `/slim-go`,
  `/slim-ag` staged/active behavior; shared-behavior orthogonality (Skills,
  MCPs, agent prompts, orchestration).
- Out of scope honored: no source/test/Spec/graph/config/credential/provider/
  proxy/model-mapping/profile-expansion/prompt/Skill change; no push/merge/PR;
  no other worktree touched; no override-provenance database or routing
  framework built; no real-host execution.
- Only isolated temp config fixtures and per-command env were used; the real
  user/global OpenCode and plugin config were never read or written (see §9).

## 2. Environment / prerequisites

Deterministic install of already-locked deps only:

| Command | Result |
| --- | --- |
| `bun install --frozen-lockfile` | exit 0; `250 packages installed [3.19s]`; `git status` clean before/after |
| `bun --version` | 1.3.13 (toolchain observation from URV1-00; not changed) |

No `opencode` host binary was executed. Per URV1-00 §6 the accepted capture
method identifies the available host as `opencode 1.15.13` at
`/opt/homebrew/bin/opencode` (npm global `opencode-ai@1.15.13`), distinct from
the compile-time plugin pins (`@opencode-ai/plugin`/`@opencode-ai/sdk@1.18.23`);
that binary was **not** exercised here, so host evidence stays `NOT_PROVEN`.

## 3. Command / result ledger (decisive excerpts)

| # | Command | Exit | Decisive result | Classification |
| --- | --- | --- | --- | --- |
| 1 | `git rev-parse HEAD` / `git status --porcelain` | 0 | `1a3fba9b…`; clean | PASS |
| 2 | `git merge-base --is-ancestor 1a3fba9 HEAD` | 0 | base in ancestry; frozen commits present in log | PASS |
| 3 | `bun install --frozen-lockfile` | 0 | `250 packages installed [3.19s]`; tree clean | PASS |
| 4 | `bun test src/config/profile.test.ts src/hooks/profile-commands/index.test.ts` | 0 | `11 pass / 0 fail / 36 expect()` | PASS |
| 5 | `bun test -t "profile inheritance" src/index.test.ts` | 0 | `1 pass` — host explicit override wins over selected profile at config hook | PASS |
| 6 | `bun test -t "profile" src/hooks/filter-available-skills/index.test.ts` | 0 | `1 pass` — model-profile switching does not alter shared Skill availability | PASS |
| 7 | `bun test -t "inheritance" src/index.test.ts` | 0 | `4 pass` (host/session/preset inheritance group) | PASS |
| 8 | `bun test /tmp/urv1-04-fixtures/fixture.test.ts /tmp/urv1-04-fixtures/plugin.test.ts` | 1 | `3 pass / 3 fail` — the 3 fails are **intentional red assertions** that demonstrate the proven defects (fixtures A, B, C); fixtures D, E, F pass | See §5/§6 |
| 9 | `bun test /tmp/urv1-04-fixtures/matrix.test.ts` | 0 | `2 pass` — measured precedence capture (M1 host>profile; M2 preset authority) | PASS |
| 10 | `git status --porcelain` (final) | 0 | clean before staging evidence file | PASS |
| 11 | `git diff --cached --check` (final) | 0 | whitespace check on staged evidence file | PASS |

Failure classification: no failure above is `CAUSED_BY_THIS_CHANGE` (no change);
rows 8's fails are deliberate defect-demonstration assertions in disposable
fixtures, not regressions of the codebase. Existing repo tests (rows 4–7) are
green.

## 4. Source map (exact trace)

### 4.1 Profile active/staged state
- `src/config/profile.ts:5` — `type SlimProfileName = 'opencode-go' | 'antigravity' | 'none'`.
- `src/config/profile.ts:11-20` — `getProfilePath()`: `OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR/slim-profile.json` when set, else `~/.config/opencode/slim-profile.json`. This file **is** the model-profile state.
- `src/config/profile.ts:22-43` — `readProfile()`: reads the file; accepts only `opencode-go`/`antigravity`; **defaults to `opencode-go`** when absent/invalid. `'none'` is only reachable under `NODE_ENV==='test'` without `OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED`; it is **not reachable in production**, so there is no production "no profile" state.
- `src/config/profile.ts:45-60` — `writeProfile()`: atomic stage of the selected profile.
- `src/config/profile.ts:62-93` — `PROFILE_MAPPINGS`: per-profile per-agent `{model, variant}` tables. `'none'` → `undefined`. Both mappings list `orchestrator`; `antigravity` does **not** list `designer`/`observer`; `opencode-go` lists most built-ins but no custom agents.
- Active-vs-staged definition: the profile file written before process start is the **active** profile (read again by the config hook at every startup); a file written mid-session by `/slim-go`/`/slim-ag` is **staged** until restart.
- Restart activation: `src/index.ts:779` reads `readProfile()` at the top of the plugin `config()` hook, so a new process/restart (plugin re-init + config hook) is what activates a staged profile.

### 4.2 Preset (configuration/policy preset)
- `src/config/loader.ts:700-712` — active preset name from `OH_MY_OPENCODE_SLIM_PRESET` (env) or the plugin config `preset` field; `config.agents = deepMerge(preset, config.agents)`.
- `src/tools/preset-switch.ts:41-81,164-181` — `/preset` switch persists the preset **name into the plugin config file** (`oh-my-opencode-slim.json[c]`), not `opencode.json`, and never mutates the running agent registry.
- `src/config/runtime.ts:246-248` — `RuntimeConfig.preset` getter (runtime override → config-file preset).
- Conclusion: PRESET is a separate concept from the Slim model profile, per Spec §4.2.

### 4.3 Host explicit model override and resolved model / resolution authority
- Host overrides live in the host OpenCode config `opencode.json` as `agent.<name>.model` (and `.variant`). Slim CLI never writes these (only `plugin`, `disable:true`, `lsp` writes exist in `src/cli/config-io.ts:433-646`); they originate from the user or the OpenCode host runtime (e.g., a `/model` selection persisted by the host).
- `src/config/runtime.ts:232-234` — `captureHostConfig()` snapshots `opencodeConfig` at the top of the config hook, before mutation (`src/index.ts:760`).
- `src/index.ts:779-798` — profile mapping is applied to the **plugin-layer** agent object (`pluginAgent.model/variant`) **before** the host merge.
- `src/index.ts:801-834` — per-agent merge `{...pluginAgent, ...existing}` spreads the host's existing entry last, so **host explicit override > selected Slim profile** at resolution time. (Measured: M1.)
- `src/index.ts:844-884` — model-array resolution only fills `model` when `entry.model === undefined` (preset/fallback-chain authority; never overrides host or profile).
- `src/index.ts:890-943` — runtime-preset override (in-process reload path) applies last.
- `src/index.ts:989-995` — `applyOrchestratorModelConfig` (strip only when `stripOrchestratorModel === true`; retained preset `orchestrator.model`; not on by default).
- `src/index.ts:945-987` — resolved agent models are recorded for the TUI sidebar via `recordTuiAgentModels` (`src/tui-state.ts:230`); the TUI snapshot contains only `agentModels`/`agentVariants`/`activeSessions` — no profile/preset/authority fields (`src/tui-state.ts:6-12`).
- Existing plugin-level test `profile inheritance > host explicit model override wins over selected profile` (`src/index.test.ts:444-484`) already pins host-override-wins precedence at the config hook.

### 4.4 Switch commands, restart activation, and override cleanup
- Registration: `src/index.ts:1052` (`registerCommand`), execution pre-hook `src/index.ts:1270-1278`.
- `src/hooks/profile-commands/index.ts:39` — `activeProfile` captured once at plugin load.
- `/slim-go` (`:64-71`) → `writeProfile('opencode-go')` **then** `clearHostModelOverrides(managedAgentNames)`.
- `/slim-ag` (`:72-79`) → `writeProfile('antigravity')` **then** `clearHostModelOverrides(managedAgentNames)`.
- `managedAgentNames` = `Object.keys(agents)` at `src/index.ts:448` — i.e., **every** registered Slim agent.
- `clearHostModelOverrides` (`src/hooks/profile-commands/index.ts:10-29`): parses the host `opencode.json` via `getExistingConfigPath()` (`src/cli/paths.ts:112-120`, honoring `OPENCODE_CONFIG_DIR`/XDG), then for each managed agent **deletes `entry.model` whenever present** (leaves `variant`, `prompt`, etc.), and writes the file back. No provenance check, no ownership marker, no conflict reporting, and it runs even when the staged profile equals the current one.
- `/slim-profile` (`:80-121`): prints `Active`, `Next launch`, `Restart required`, and `Active routing`/`Next routing` derived **only** from `PROFILE_MAPPINGS`. It never prints PRESET, HOST_ORCHESTRATOR_OVERRIDE, RESOLVED_ORCHESTRATOR_MODEL, or RESOLUTION_AUTHORITY, and it does not consult the captured host snapshot or the plugin preset.
- No code anywhere writes Slim profile models into the on-disk `opencode.json`. History confirms both profile commits (`92d0eab` original, `2b24d0e` fix) only mutated the **in-memory** config-hook objects. Therefore no host `agent.<name>.model` is ever **provably Slim-managed** under current authority; all such entries are host/user-owned or of unknown origin.

## 5. Disposable fixtures (inputs/outputs)

Location `/tmp/urv1-04-fixtures/` (`harness.ts`, `fixture.test.ts`, `plugin.test.ts`,
`matrix.test.ts`); never committed. Every fixture redirected
`OPENCODE_CONFIG_DIR`, `XDG_*`, log dir, and
`OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR` into a fresh `mkdtemp` dir; real
user/global state untouched.

### Fixture A — user-owned unknown host override must be preserved (D1)
Input: profile `opencode-go`; host `opencode.json` =
`{agent:{orchestrator:{model:'user/custom-model',variant:'low'}, oracle:{model:'user/custom-oracle'}, unrelated:{model:'user/survives'}}}`.
Action: real hook `slim-ag` with managed `['orchestrator','oracle','fixer']`.
Output:
```
command output: Slim profile staged: antigravity
staged profile now: antigravity
after orchestrator = {"variant":"low"}      // model 'user/custom-model' DELETED
after oracle      = {}                      // model 'user/custom-oracle' DELETED
after unrelated   = {"model":"user/survives"} // untouched (not managed)
```
Required (Spec §4.5): user-explicit override **preserved**. Actual: deleted.
Level: UNIT (real module invoked directly). Verdict: **D1 proven**.

### Fixture B — stale Slim-mapping override alone clearable; everything else survives (D1)
Input: profile `opencode-go`; orchestrator entry model/variant **exactly equal to
`PROFILE_MAPPINGS['opencode-go'].orchestrator`** (the only value Slim itself could
ever have produced → "known stale Slim-managed" heuristic); oracle =
`user/custom-oracle`; unrelated = `user/survives`.
Action: real hook `slim-ag`.
Output:
```
after orchestrator = {"variant":"thinking"}  // stale mapping model cleared
after oracle       = {}                      // 'user/custom-oracle' DELETED (must survive)
after unrelated    = {"model":"user/survives"}
```
Required (Spec §4.5): clear the provably Slim-managed entry only; preserve the
rest. Actual: code deletes **all** managed-agent models; it has no channel to
tell the two cases apart (no Slim-managed producer exists at all). Level: UNIT.
Verdict: **D1 proven**.

### Fixture C — `/slim-profile` six-value reporting (D2)
Input: profile `opencode-go`; host override present that actually wins at the
config hook (`orchestrator.model='user/custom-model'`).
Action: real hook `slim-profile`.
Output (verbatim, decisive):
```
Active:  opencode-go        Next launch:  opencode-go    Restart required:  no
Active routing:  orchestrator → opencode-go/minimax-m3 ...
```
Checks: active label present `true`; staged label present `true`; PRESET
separate value present `false`; HOST_ORCHESTRATOR_OVERRIDE separate value
present `false`; RESOLVED_ORCHESTRATOR_MODEL separate value present `false`;
RESOLUTION_AUTHORITY separate value present `false`.
Required (Spec §4.4): all six values separately exposed. Actual: only two
(MODEL_PROFILE_ACTIVE, MODEL_PROFILE_STAGED) are reported; the mapping default
`opencode-go/minimax-m3` is printed as "Active routing" although the host
override `user/custom-model` is what actually resolves (measured in M1) —
conflation of mapping default with resolved model. Level: UNIT. Verdict: **D2
proven**.

### Fixture D — staged/active restart semantics (no defect)
Pre-restart (active `opencode-go`, run `slim-ag`):
```
Slim profile staged: antigravity ... Restart OpenCode to activate.
Active: opencode-go / Next launch: antigravity / Restart required: yes
after staging, readProfile() (next process) = antigravity
```
Level: UNIT. Verdict: staging, restart-required signalling, and next-process
activation value all correct. Existing repo tests E/F in
`src/hooks/profile-commands/index.test.ts` confirm the same and the post-restart
"Restart required: no" case.

### Fixture E — shared behavior orthogonality (no defect)
Real plugin factory (`OhMyOpenCodeLite`), isolated env, run `config()` after
writing profile `opencode-go`, then again after writing `antigravity` (simulated
restart). Orchestrator results:
```
opencode-go: model=opencode-go/minimax-m3 variant=thinking
antigravity: model=google/antigravity-gemini-3.1-pro variant=undefined
prompt equal: true  permission equal: true  mcps equal: true  skills equal: true
```
Level: INTEGRATION_SIMULATION (real plugin code, no live host). Verdict: profile
switch changes only model/variant; Skill/MCP/prompt/permission unchanged.

### Fixture F — post-restart resolution and host-override precedence (no defect)
Real plugin factory; staged profile `antigravity` (becomes active at simulated
restart); host config `{oracle:{model:'host/explicit-oracle'}, unrelated:{model:'user/survives'}}`.
```
orchestrator model (profile antigravity, no host override): google/antigravity-gemini-3.1-pro
oracle model (host override present): host/explicit-oracle
unrelated model: user/survives
```
Level: INTEGRATION_SIMULATION. Verdict: after restart the intended profile
mapping resolves for non-overridden agents, and host override continues to win.

### Fixture M1/M2 — precedence matrix measurements
- M1: profile `opencode-go` + host `orchestrator.model='user/custom-model'` →
  `RESOLVED_ORCHESTRATOR_MODEL=user/custom-model` (profile default would have
  been `opencode-go/minimax-m3`). Authority: HOST. Level: INTEGRATION_SIMULATION.
- M2: profile `antigravity` + plugin preset `prod` defining `designer` →
  `designer model = preset/designer` (antigravity mapping has no designer entry).
  Authority: PRESET. Level: INTEGRATION_SIMULATION.

## 6. Authority / precedence matrix (six separate values)

Legend: M = measured (fixture), S = source-derived exact ordering, U = unit.

### Scenario S1 — host override present (opencode-go profile; no plugin preset)
| Value | Value | Source/Level |
| --- | --- | --- |
| MODEL_PROFILE_ACTIVE | `opencode-go` | profile file; S |
| MODEL_PROFILE_STAGED | `opencode-go` | unchanged; S |
| PRESET | none (`undefined`) | plugin config empty; S |
| HOST_ORCHESTRATOR_OVERRIDE | `user/custom-model` | host `opencode.json`; S |
| RESOLVED_ORCHESTRATOR_MODEL | `user/custom-model` | M1 (INTEGRATION_SIMULATION) |
| RESOLUTION_AUTHORITY | HOST | M1 + merge order `{...pluginAgent,...existing}` (`src/index.ts:801-834`) |

### Scenario S2 — no host override (antigravity active post-restart; no preset)
| Value | Value | Source/Level |
| --- | --- | --- |
| MODEL_PROFILE_ACTIVE | `antigravity` | profile file; S |
| MODEL_PROFILE_STAGED | `antigravity` | staged then restarted; S |
| PRESET | none | S |
| HOST_ORCHESTRATOR_OVERRIDE | none | S |
| RESOLVED_ORCHESTRATOR_MODEL | `google/antigravity-gemini-3.1-pro` | F (INTEGRATION_SIMULATION) |
| RESOLUTION_AUTHORITY | PROFILE | F + profile loop `src/index.ts:779-798` |

### Scenario S3 — preset authority for agents absent from the active mapping (antigravity + preset `prod`)
| Value | Value | Source/Level |
| --- | --- | --- |
| MODEL_PROFILE_ACTIVE | `antigravity` | S |
| MODEL_PROFILE_STAGED | `antigravity` | S |
| PRESET | `prod` | plugin config; S |
| HOST_ORCHESTRATOR_OVERRIDE | none (designer) | S |
| RESOLVED_ORCHESTRATOR_MODEL | n/a (agent = `designer`) | — |
| RESOLUTION_AUTHORITY | PRESET (designer) | M2 (INTEGRATION_SIMULATION); profile loop has no `designer` under antigravity |

### Scenario S4 — factory/default authority
Reachable only for agents not listed in the active profile mapping and not
covered by a preset/host entry (e.g., a custom agent; or `designer` under
antigravity with no preset). No producer sets `PROFILE` `'none'` in production
(`readProfile` defaults to `opencode-go` and always lists `orchestrator`), so
AGENT_FACTORY/DEFAULT is never the orchestrator authority in production.
Level: S (source-derived); not measured.

Required precedence (Spec §4.3) vs observed:
```
user-owned explicit host override > selected Slim profile > preset > agent factory/default
HOST wins ....................... > PROFILE ................. > PRESET > AGENT_FACTORY
```
Observed at config-hook resolution time: correct (M1, S2, M2, existing test
`src/index.test.ts:444-484`). Observed at **switch time** (`/slim-go`,`/slim-ag`):
the command deletes the highest-precedence layer (host override) instead of
preserving it → **authority-model violation at the switch seam** (D1).

## 7. Pre/post restart behavior of `/slim-go` and `/slim-ag`

- Pre-restart: `writeProfile(...)` changes only the profile file; the running
  process's resolved routing is unchanged (`activeProfile` captured at load,
  `src/hooks/profile-commands/index.ts:39`); `/slim-profile` reports
  `Active`/`Next launch`/`Restart required: yes` (Fixture D; repo tests E/F).
- Post-restart: plugin re-init runs the `config()` hook, which re-reads the
  profile (`src/index.ts:779`) and applies the new mapping to the plugin-layer
  agents; non-overridden agents resolve to the intended profile models, and any
  surviving host override still wins (Fixture F).
- Shared Skills/MCP/agent-prompt/orchestration behavior: unchanged across the
  switch — profile application touches only `model`/`variant` on plugin agents
  (`src/index.ts:779-798`); verified by Fixture E and the existing
  filter-available-skills profile test. No test or fixture showed Skill/MCP/
  prompt/permission drift.
- The defect in the switch is not the staged/restart mechanics (which are
  correct) but the destructive `clearHostModelOverrides` file edit that runs
  unconditionally on both commands and removes the user-owned override layer.

## 8. Diagnosis

1. **D1 — proven source defect (§4.5 switch authority; §3.5 no unrelated user
   config mutation).** `clearHostModelOverrides`
   (`src/hooks/profile-commands/index.ts:10-29`), invoked by `/slim-go` (:66)
   and `/slim-ag` (:74) with `managedAgentNames = Object.keys(agents)`
   (`src/index.ts:448`), deletes `model` from every managed host agent entry
   that has one, with no provenance check and no conflict reporting. There is
   no Slim producer of host agent-model entries anywhere in source or history,
   so no host override is ever *provably* Slim-managed; per Spec §4.5 the
   correct behavior is: clear only a provably Slim-managed stale override;
   preserve user-explicit/unknown-origin overrides; when ownership cannot be
   proven preserve host state and report the conflict. The code does none of
   the preservation/conflict reporting. Fixtures A and B prove the data loss.
   Note: the existing tests `F-02` in `src/hooks/profile-commands/index.test.ts`
   assert the over-clearing, so this is deliberate current behavior that
   contradicts the frozen authority model — not an accidental typo.
2. **D2 — proven source defect (§4.4 reporting).** `/slim-profile`
   (`src/hooks/profile-commands/index.ts:80-121`) exposes only
   MODEL_PROFILE_ACTIVE ("Active") and MODEL_PROFILE_STAGED ("Next launch");
   PRESET, HOST_ORCHESTRATOR_OVERRIDE, RESOLVED_ORCHESTRATOR_MODEL, and
   RESOLUTION_AUTHORITY are absent, and the mapping default is printed as
   "Active routing"/"Next routing", conflating mapping default with resolved
   model. Fixture C proves the omission and the conflation (M1 shows the actual
   resolved model differs when a host override is present).
3. **Correct behavior confirmed (not defects):** config-hook resolution
   precedence host override > profile (existing inheritance test + M1); profile
   mapping application changes model/variant only (E); staged→restart→active
   semantics (D, E, F, repo profile-command tests); preset orthogonality (M2);
   shared Skill/MCP/prompt behavior invariance (E + filter-available-skills).
4. `PRESET` is correctly a separate configuration/policy preset (Spec §4.2):
   plugin-config `preset`/`presets` (`loader.ts:700-712`) and `/preset`
   persistence (`preset-switch.ts:164-181`), distinct from the Slim profile file.
   The defect is that no reporting surface exposes it separately.

## 9. Credentials/config/user-state integrity

- All fixtures redirected every config/data/cache/log path to `mkdtemp`
  directories via per-command env. The real `~/.config/opencode` (host config,
  plugin config, `slim-profile.json`), credentials, OAuth, provider, proxy, and
  working-tree state were never read or written by any command in this ticket.
- `git status --porcelain` was clean at start, after install, after every
  fixture/test command, and before staging the evidence file.
- CREDENTIALS/CONFIG MODIFIED: **NO**.

## 10. Conditional URV1-04A handoff (exact seam; NOT repaired here)

Since a source defect is proven, URV1-04A is authorized. Minimal handoff:

- **Defect D1 seam:** `src/hooks/profile-commands/index.ts:10-29`
  (`clearHostModelOverrides`) and its two call sites `:66` (`/slim-go`) and
  `:74` (`/slim-ag`); wiring `src/index.ts:448`
  (`createProfileCommandsHook(Object.keys(agents))`).
- **Defect D1 required change direction:** stage the profile; detect host
  `agent.<name>.model` entries among the managed agents; clear only an entry
  that is provably Slim-managed under existing authority (under current code no
  producer exists, so this set is empty); otherwise **preserve** the entry and
  add a conflict line to the command output (e.g. listing which agents keep a
  host override and therefore will not be moved by the profile). No provenance
  database.
- **Defect D2 seam:** `/slim-profile` handler
  `src/hooks/profile-commands/index.ts:80-121`. Required change direction:
  additionally report PRESET (runtime/plugin preset name), the host override
  for the orchestrator (from `RuntimeConfig.host()`/`hostAgent('orchestrator')`,
  `src/config/runtime.ts:469-476`), the resolved orchestrator model, and the
  resolution authority, as six separate labeled values; stop presenting mapping
  defaults as "Active routing" without qualification.
- **Reproducible fixtures:** `/tmp/urv1-04-fixtures/fixture.test.ts` A (user
  override preserved) and C (six-value output) — deterministic red tests
  against the current code; adapt into repo regression tests in URV1-04A.
- **Test seam:** `src/hooks/profile-commands/index.test.ts` F-02 tests
  (`:81-133`) currently encode the over-clearing behavior and must be rewritten
  to the preservation/conflict-report semantics; `:53-79`/`:149-164` cover
  staging/restart and remain valid. `src/config/profile.test.ts` remains valid.
- Out of scope for URV1-04A: profile expansion, model-mapping changes,
  provenance storage, credentials, and any behavior change outside the two
  proven seams.

## 11. Evidence-level summary

| Evidence | Level | Where |
| --- | --- | --- |
| Existing profile/profile-command tests green (11) | UNIT | `bun test` rows 4 |
| Existing inheritance group incl. host-wins test (4) | INTEGRATION_SIMULATION | row 7; `src/index.test.ts:444-484` |
| Skill-availability profile orthogonality (1) | UNIT | row 6 |
| Fixtures A, B, C (defect demonstrations) | UNIT | row 8 |
| Fixtures D | UNIT | row 8 |
| Fixtures E, F, M1, M2 (real plugin factory in isolated env) | INTEGRATION_SIMULATION | rows 8–9 |
| Real-host reporting/switch before/after restart | REAL_RUNTIME **NOT_PROVEN** | no live host executed |
| Credentials/config modified | NO | §9 |

## 12. Architecture-invariant counts

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
Implementation begun:                      NO (DIAGNOSIS / NO_CODE_CHANGE)
Skill/MCP/prompt/orchestration drift:       NO (fixture E; Spec §3.3)
Credentials/config/provider/proxy/model-mapping changed: NO (Spec §3.5, §15)
```

## 13. Self-review findings and remediation

| Finding | Remediation |
| --- | --- |
| Fixtures A/B/C intentionally assert `fail` to demonstrate defects | Documented explicitly in §3 row 8 and §5; they are disposable red assertions, not repo regressions; repo tests remain green |
| Early plugin-level fixtures missed `await` on the async plugin factory and produced empty config results | Corrected the harness to `await load()`; re-ran E/F/M1/M2 green |
| No real host executed, so restart behavior is only unit/simulation-verified | Explicitly labeled REAL_RUNTIME NOT_PROVEN (§11); no promotion |
| D2 rests on the Spec §4.4 reporting contract rather than a broken data path | Stated as a reporting-surface gap with a precise seam and fixture; URV1-04A scope is bounded to it |
| `readProfile()`'s production default `opencode-go` makes `PROFILE='none'` unreachable | Recorded as a source-derived finding (S4), not silently assumed |

## 14. Candidate SHA / files changed / handoff packet

CANDIDATE_SHA:
(external handoff record, after the single documentation commit below)

PARENT_SHA:
`1a3fba9b1e4ba7eef266063e9c432844d60645eb`

FILES CHANGED:
`docs/reviews/URV1-04_PROFILE_AUTHORITY_DIAGNOSIS.md` only.

COMMAND/RESULT LEDGER: §3.

DIAGNOSIS DECISION:
NO_CODE_CHANGE executed (no repair performed); source defect **proven**;
conditional URV1-04A handoff in §10.

KNOWN GAPS:
- Real-host pre/post-restart reporting and switch capture: NOT_PROVEN.
- No production path to `PROFILE='none'`; authority chain beyond profile for
  the orchestrator is theoretical (S4).
- PRESET resolution in the running process for the orchestrator is always
  subordinate to the selected Slim profile, so PRESET-authority rows apply only
  to non-mapped agents (M2).

SCOPE / INVARIANT CONFIRMATION:
§1, §9, §12. Only the evidence document is staged; `git diff --cached --check`
exit 0; worktree clean after commit.
