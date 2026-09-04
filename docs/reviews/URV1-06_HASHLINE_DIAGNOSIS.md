# URV1-06 — Hashline resolved-configuration and peer diagnosis

- **Ticket:** URV1-06 `DIAGNOSIS / NO_CODE_CHANGE`
- **Outcome:** `NO_CODE_CHANGE` (no reproduced source defect). No `URV1-06A` handoff.
- **Requested model:** `deepseek-v4-flash`
- **Observed model:** `deepseek-v4-flash` (reported from the executing agent runtime identity; requested route matches observed route — never inferred from the route alone)
- **Branch:** `work/urv1-06-hashline-diagnosis`
- **HEAD / BASE SHA:** `791d974ee964e2ba2cbb9fc2c439b54bdc7393bd` (HEAD == BASE, working tree clean)
- **Frozen spec:** `docs/planning/SLIM_RUNTIME_WIRING_ACCEPTANCE_SPEC_V1.md` at `16bb77f8209542a6bcc1ca11a48203867d8a3378`
- **Frozen graph:** `docs/planning/SLIM_RUNTIME_WIRING_TICKET_GRAPH_V3.md` at `9bac2333d5a2963a05f39e130fffc587336096c9`
- **Authority:** Spec §§3.4, 7.1–7.2, 7.6, 11.2, 12.4, 15; Graph V3 URV1-06.
- **Worker mode:** Read-only evidence worker. No source/test/metadata/config/credentials/providers/proxy changed. Only this evidence document is committed.

---

## 1. Root-cause classification

**Primary cause — one classification, with evidence:**
`expected disabled state (disabled resolved configuration)`. The Hashline tool and
read annotation are gated **entirely** on the resolved runtime value of
`hashline_edit === true`. In the prior host the toggle was not resolved to `true`
through the Slim configuration authority, so the tool was never registered and the
read hook returned early. Per Spec §7.1 this is **not** a code failure.

The other candidate causes were each positively ruled out (see Evidence):

| Cause | Verdict | Why |
|---|---|---|
| **Disabled resolved configuration** | **PRIMARY CAUSE** | `hashline_edit` is optional and disabled by default (schema). Registration + read hook both require `runtime.hashline_edit === true` (index.ts:542, 613). Config fixture: no config / wrong-file config → resolved `false` (S1, S4); correct-file `true` → resolved `true` (S2, S5). |
| Absent optional peer | NOT the cause | Registration does **not** consult `@oh-my-pi/hashline`. The peer is dynamically `import()`ed only inside tool/hook `execute`. With the peer present but config disabled, the tool set has no `hashline_edit` and reads are un-annotated (proved directly). Peer absence therefore cannot explain tool-set absence. |
| Registration bug | Ruled out | Read hook is correctly attached to `tool.execute.after` (index.ts:1513–1515). When enabled, the tool is registered (REAL_RUNTIME health check `tools:10`; static composition 9 baseline + `hashline_edit`). Existing 18-test Hashline suite passes. |
| Configuration-resolution bug (source defect) | Ruled out | The loader faithfully reads only the plugin-named files (`oh-my-opencode-slim.json/.jsonc`) from `OPENCODE_CONFIG_DIR`/user dir and `<directory>/.opencode`. A toggle placed in the host `opencode.json` is intentionally ignored (S4). That is an authority/placement property, not a Slim bug. |
| Other proven defect | None found | No crash, no degraded-annotation failure, no peer bundling defect in the loaded runtime. |

**No `URV1-06A` handoff is issued.** There is no reproduced registration /
configuration-resolution source defect to correct. The optional feature is
currently disabled-by-default, which is correct and intended (§3.4 permits the
project default to remain disabled). Hashline becomes available whenever the
normal Slim config file sets `hashline_edit: true` and the compatible optional
peer is installed in the loaded runtime — which is exactly the controlled
acceptance mode Spec §7.2 requires.

---

## 2. Command / result ledger

| # | Command | Result |
|---|---|---|
| L1 | `git rev-parse HEAD` | `791d974e…` |
| L2 | `git rev-parse --abbrev-ref HEAD` | `work/urv1-06-hashline-diagnosis` |
| L3 | `git status --porcelain` | empty (clean) before and after all steps |
| L4 | `git merge-base HEAD <BASE>` | `791d974e…` (HEAD == BASE) |
| L5 | `ls node_modules/@oh-my-pi/` (pre-install) | `No such file` — peer absent from a bare checkout |
| L6 | `bun install --frozen-lockfile` | 250 packages; `@oh-my-pi/hashline@18.1.2` installed (devDep). `git status` still clean — `bun.lock` untouched. |
| L7 | `ls node_modules/@oh-my-pi/` (post-install) | `hashline`, `pi-natives`, `pi-natives-darwin-arm64`, `pi-utils` |
| L8 | `node --input-type=module -e "…import.meta.resolve('@oh-my-pi/hashline')"` | resolves to `…/@oh-my-pi/hashline/src/index.ts` (ESM `import` condition → TS source). Node CJS `require.resolve` fails (`ERR_PACKAGE_PATH_NOT_EXPORTED`) because the package exposes only `import`/TS; Bun runs it natively. |
| L9 | `bun test src/hooks/hashline/index.test.ts` | **19 pass / 0 fail** (18 named cases + suite) |
| L10 | `bun run build` | Build OK; regenerated `oh-my-opencode-slim.schema.json` byte-identical (`git status` clean) |
| L11 | Config fixture (see §3, S1–S5) | resolution matrix confirmed |
| L12 | REAL_RUNTIME isolated `opencode serve` (hashline_edit:true) | plugin loaded; plugin log `health check passed {agents:7, tools:10, mcps:2}` |
| L13 | REAL_RUNTIME session REST probe | `/config` shows plugin registered; session REST object exposes no tool list in this host (see Known gaps) |
| L14 | REAL_RUNTIME disabled (no plugin config) runs | server did not reach readiness within timeout in this environment (DB-migration startup delay); logged as NOT_PROVEN baseline count |

---

## 3. Config authority trace and focused fixture (INTEGRATION_SIMULATION)

### 3.1 Authority chain
1. Entry: `src/index.ts:288` → `config = loadPluginConfig(ctx.directory)`.
2. `RuntimeConfig.init(ctx.directory, config)` seeds the singleton; getter
   `src/config/runtime.ts:373-375`:
   `get hashline_edit() { return this.pluginConfig?.hashline_edit === true; }`.
3. Schema: `src/config/schema.ts:474-483` — `hashline_edit: z.boolean().optional()` described
   as "Disabled by default."
4. Gates consuming the resolved value:
   - Read hook `enabled`: `src/index.ts:541-544` (`enabled: runtime.hashline_edit === true`).
   - Tool registration: `src/index.ts:613` + `623-629`
     (`shouldRegisterHashlineEdit = runtime.hashline_edit === true`; spread `hashline_edit` only then).
5. Read-hook wrapper attached to host `tool.execute.after`: `src/index.ts:1513-1515`.
6. Loader search scope: `src/config/loader.ts` / `src/cli/paths.ts` — only
   `$OPENCODE_CONFIG_DIR|XDG_CONFIG_HOME/opencode|~/.config/opencode` + `<directory>/.opencode`,
   and only the plugin-named file `oh-my-opencode-slim.{json,jsonc}`. The host
   `opencode.json`/`opencode.jsonc` is not a Slim-config source for `hashline_edit`.

### 3.2 Fixture (disposable, under `/tmp/urv1-06-fixture`)
Ran `bun /tmp/urv1-06-fixture/fixture.ts` (isolated `HOME`, `OPENCODE_CONFIG_DIR`,
`XDG_*`, empty `XDG_DATA_HOME`, no project `.opencode` unless noted). Calls the
real `loadPluginConfig` + `RuntimeConfig`.

| Scenario | Config present | resolved `hashline_edit` (runtime getter) |
|---|---|---|
| S1 default | none | `false` (raw key absent) |
| S2 | user `oh-my-opencode-slim.json` = `{hashline_edit:true}` | `true` |
| S3 | user file = `{hashline_edit:false}` | `false` |
| S4 | host `opencode.json` = `{hashline_edit:true}` (WRONG authority file) | `false` (raw key absent — file ignored) |
| S5 | project `.opencode/oh-my-opencode-slim.json` = `{hashline_edit:true}` | `true` |

**Reading:** The resolved value is `true` only when the toggle sits in the
plugin-named config file (S2, S5). Absent (S1) or misplaced in the host config
file (S4) it resolves to disabled — silently, with no warning. This is the
mechanism behind the prior host absence: no Slim-config `hashline_edit:true` was
in effect at load time.

---

## 4. Optional peer metadata and presence (loaded runtime, not just source)

### 4.1 Package metadata (`package.json`)
- `peerDependencies["@oh-my-pi/hashline"] = "18.1.2"` (line 114).
- `peerDependenciesMeta["@oh-my-pi/hashline"].optional = true` (lines 119–123).
- **Not** in `dependencies` or `optionalDependencies` → never auto-installed for
  consumers; always an explicit optional peer. Confirmed intentionally externalized.
- `devDependencies["@oh-my-pi/hashline"] = "^18.1.2"` (line 110) → present in this
  dev checkout only so the test suite can run.
- Bundler externals: build marks `@oh-my-pi/hashline` external in every target
  (package.json build scripts), so it is never bundled.
- Tarball `oh-my-opencode-slim-2.2.17.tgz` (232 entries) ships only the compiled
  `dist/hooks/hashline/*.d.ts`; no `node_modules/@oh-my-pi` inside → peer stays external.

### 4.2 Peer presence in the loaded runtime
- Bare checkout (no `node_modules`): peer **absent** (L5).
- After `bun install --frozen-lockfile`: peer **present** at
  `node_modules/@oh-my-pi/hashline@18.1.2` plus its natives (`pi-natives`,
  `pi-natives-darwin-arm64`, `pi-utils`) (L6–L7).
- The peer package is ESM/TS-source-only (`exports["."].import = "./src/index.ts`).
  It resolves and runs under **Bun** (the OpenCode runtime) but fails under plain
  Node CJS `require`/`require.resolve`. Dynamic `import('@oh-my-pi/hashline')` in
  `src/hooks/hashline/read-hook.ts:51` and `tool.ts:43` is the correct usage for Bun.

### 4.3 Peer is not on the tool-registration path
`createHashlineEditTool` builds a `ToolDefinition` without touching the peer; the
peer is imported only when the tool is executed. Therefore peer presence does not
gate registration and cannot remove `hashline_edit` from the tool set.

---

## 5. Tool / hook registration and native read/edit/apply-patch independence

- Dedicated additive `hashline_edit` tool: `src/hooks/hashline/tool.ts`
  (wraps upstream `Patcher`; does not shadow native `edit`/`apply_patch`).
- Read annotation hook: `src/hooks/hashline/read-hook.ts` (`tool.execute.after`,
  only for `tool === 'read'`; validates the disk slice matches the displayed slice,
  then records a snapshot and prepends `[path#TAG]`).
- Native `read` output is preserved (header prepended, content untouched); native
  `edit`/`apply_patch` outputs are never matched by the hook.
- Disabled path (`enabled:false`) returns before any import or mutation.
- Missing-peer path fails open on read (no annotation, no crash) and throws an
  actionable install message on `hashline_edit` execute (`tool.ts:62-64`).

---

## 6. Test results (UNIT / INTEGRATION_SIMULATION)

`bun test src/hooks/hashline/index.test.ts` — **19 pass / 0 fail** with the peer
installed. Coverage includes: read annotation `[path#TAG]` (test 1); valid edit (2);
concurrent-mutation stale reject without file mutation (3); native `edit` unaffected
(4); native `apply_patch` unaffected (5); disabled hook no-op (6); CRLF full/partial
(7, 12–14); path containment + symlink escape (8, 8b); missing arg error (9);
`seenLines` enforcement (10); read-vs-disk mismatch fails open (11); BOM/BOM+CRLF
(15–17); LF non-regression (18). These directly satisfy §7.6 invariants.

Note these integration tests exercise the real hook + tool + real upstream peer
against a mock OpenCode `tool.execute.after` payload — they are INTEGRATION_SIMULATION
for the payload shape, not a full real host (that is URV1-07).

---

## 7. Real-runtime preliminary observation (REAL_RUNTIME)

Environment: installed OpenCode CLI `1.15.13`
(`/opt/homebrew/bin/opencode`); plugin build targets `@opencode-ai/plugin@1.18.23`;
host Linux/macOS here; spec's prior real host was Windows 1.18.25 (project dogfood).

Method: built the plugin to `dist/` (gitignored), then ran
`opencode serve` under a fully isolated `HOME`/`XDG_CONFIG_HOME`/`XDG_DATA_HOME`/
`XDG_CACHE_HOME`/`OPENCODE_CONFIG_DIR`/`OPENCODE_DATA`/`OPENCODE_LOG_DIR` in
`/tmp/urv1-06-rt*`. Isolated `opencode.json` points the plugin at this package;
isolated `oh-my-opencode-slim.json` sets `hashline_edit: true`. **No provider was
configured and no message was sent → no provider call was made.**

Observed:
- `opencode serve` booted and `GET /config` reports the plugin resolved to
  `file:///…/slim-urv1-06`.
- Plugin initialized with no crash; plugin log
  `oh-my-opencode-slim.<ts>.log` (in isolated `OPENCODE_LOG_DIR`) shows
  `[plugin] health check passed {"agents":7,"tools":10,"mcps":2}`.
- Static corroboration: the always-registered plugin tools are
  `task_cancel, task_message, task_result, task_revive, task_status,
  wait_for_user, webfetch, ast_grep_search, ast_grep_replace` = **9**; adding
  `hashline_edit` when enabled yields **10**, matching the observed count.

**REAL_RUNTIME outcome:** plugin loads cleanly with `hashline_edit:true` and
registers 10 tools (consistent with the 10th being `hashline_edit`). Name-level
in-session tool enumeration and an end-to-end annotated read were **NOT_PROVEN in
this environment**: the `1.15.13` session REST object exposes no tool list, tool
assembly for a session requires a model turn (a disallowed provider call), the
installed host predates the plugin's `1.18.23` contract, and repeated attempt to
capture a same-host disabled baseline stalled on OpenCode's one-time DB migration.
A disabled-run baseline count is therefore NOT_PROVEN here. Full host valid/stale/
reanchor proof is explicitly deferred to URV1-07 (Spec §7.3–7.5).

---

## 8. Optional-peer and disabled behavior (preserved, unchanged)

- No peer bundling; peer remains an external optional peer (§3.4).
- Disabled-by-default is preserved (`hashline_edit` optional, default off).
- Disabled load is normal: read hook no-op, no `hashline_edit` tool, native
  read/edit/apply_patch valid (tests 4–6; config fixture S1/S3).
- Enabled-without-peer degrades, not crashes: read fails open and logs
  "optional dependency missing… Annotation disabled" (`read-hook.ts:85-93`);
  `hashline_edit` execute throws an actionable install message (`tool.ts:62-64`).
- No source change was made, so these behaviors are untouched by this ticket.

---

## 9. Windows implications

- Prior host was Windows PowerShell (`C:\…`, opencode 1.18.25). Config resolution
  uses the same OpenCode data/config dirs; on Windows `homedir()` feeds the search.
  A `hashline_edit:true` intended for the acceptance must live in the plugin-named
  `oh-my-opencode-slim.json` (user dir or `<directory>/.opencode`), not in
  `opencode.json` (see S4).
- The peer package is Bun/ESM-`import`/TS-source only. OpenCode is Bun-based on all
  platforms, so dynamic `import('@oh-my-pi/hashline')` resolves; plain-Node CJS
  `require` will not. Any Windows harness must run OpenCode's Bun runtime with the
  peer installed in the loaded runtime tree.
- CRLF, BOM, BOM+CRLF, and partial-read `seenLines` behavior is covered by passing
  tests (7, 12–17), which are the §7.6 file-safety authority for CRLF platforms.
- `read-hook.ts` normalizes relPath backslashes (`/\\/g`) for stable `[path#TAG]`.

---

## 10. Invariant counts (unchanged by this ticket)

No code changed, so all architectural invariants are trivially preserved:
new runtime state machines 0, new persistence systems 0, new scheduler 0, new job
board 0, new watchdog engine 0, new completion engine 0, duplicate UltraWork
engine 0, new provider/account orchestration system 0 (Spec §3.1). Hashline
remains optional/lightweight (§3.4). No prompt-cache surface was touched.

---

## 11. Known gaps

- Prior host's literal config file (Windows env) is not present in this worktree;
  the absence is attributed by mechanism (config gate) rather than by reading the
  prior file. The mechanism is fully reproduced and consistent with every prior
  artifact (Spec §2.2 finding 2, and the prior real-host dogfood reporting Hashline
  `NOT_PROVEN` due to a headless TUI hang).
- Disabled real-host baseline tool count was NOT_PROVEN here (OpenCode DB-migration
  startup stall in the isolated env); not needed for the classification, which is
  established by config fixture + enabled real-host count.
- In-session `hashline_edit` name-level presence and a live annotated `read` were
  not observed end-to-end on this older host (would require a model turn and a
  matching-host 1.18.23 runtime). Deferred to URV1-07.

---

## 12. URV1-07-ready fixture instructions (enabled path)

For URV1-07 on a matching real host (opencode ≈1.18.x Bun runtime), use a
disposable workspace and set through the **normal Slim authority**:

1. Config — plugin-named file (NOT `opencode.json`):
   `$OPENCODE_CONFIG_DIR/oh-my-opencode-slim.json` (or
   `<workspace>/.opencode/oh-my-opencode-slim.json`):
   ```json
   { "hashline_edit": true }
   ```
2. Peer — install into the loaded runtime so dynamic `import('@oh-my-pi/hashline')`
   resolves under Bun:
   `bun add @oh-my-pi/hashline@18.1.2` (the exact authority version), or install
   `oh-my-opencode-slim` from npm and `bun add @oh-my-pi/hashline@18.1.2`.
3. Isolate all of `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`,
   `OPENCODE_CONFIG_DIR`, `OPENCODE_DATA`, `OPENCODE_LOG_DIR`; never point at real
   user config or credentials; no provider/account needed for the read-annotation
   and tool-registration proofs (only the full model turn needs a provider).
4. Sanity: plugin init log should show `health check passed {…tools:10…}`; then run
   Spec §7.3–7.5: read → `[path#TAG]` present and native content preserved; valid
   `hashline_edit` applies; external mutation + stale `TAG1` → reject without
   mutation; reread → `TAG2` → apply succeeds; native `edit`/`apply_patch` remain
   tag-free and valid.
5. Negative checks (§3.4/§7.6): without the peer, load is normal and reads
   un-annotated (fail-open); `hashline_edit` execute yields the actionable install
   message; disabled-by-default load has no `hashline_edit` tool.

---

## 13. Requested vs observed model

- Requested: `deepseek-v4-flash`.
- Observed (from the executing agent runtime identity, not inferred from the
  requested route): `deepseek-v4-flash`.
