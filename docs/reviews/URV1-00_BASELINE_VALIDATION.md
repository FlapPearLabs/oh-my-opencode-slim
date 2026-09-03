# URV1-00 Baseline and Validation Classification

TICKET:
URV1-00 — Baseline and validation classification

STATUS:
PASS (documentation-only evidence commit; `NO_CODE_CHANGE`)

TICKET CLASS:
`DIAGNOSIS / NO_CODE_CHANGE`

BRANCH:
`work/urv1-00-baseline`

WORKTREE:
`/Users/songshiyao/Documents/ChatGPT/opencode-slim-runtime-worktrees/slim-urv1-00`

BASE_SHA:
`9bac2333d5a2963a05f39e130fffc587336096c9` (frozen graph-freeze commit; direct
descendant of frozen Spec commit `16bb77f8209542a6bcc1ca11a48203867d8a3378`)

EXPECTED_PREDECESSORS:
none

IMPLEMENTER_BACKEND:
WorkBuddy CLI 2.137.1

IMPLEMENTER_REQUESTED_MODEL:
deepseek-v4-flash

REAL_RUNTIME:
NOT_PROVEN (URV1-00 is a mechanical baseline audit; no host claims are made)

CREDENTIALS/CONFIG MODIFIED:
NO

SOURCE CHANGES:
NO

VERDICT:
Truthful baseline recorded. Every executed check either passed or was classified
`PRE_EXISTING`; zero `CAUSED_BY_THIS_CHANGE`, zero `ENVIRONMENT_DEPENDENT`, zero
`UNKNOWN`. Only a documentation evidence artifact is committed.

---

## 1. Identity / scope confirmation

- **Authority:** Spec §§2, 3, 11.1, 12, 16; all Global execution boundaries of
  the frozen V3 graph.
- **Execution class:** `DIAGNOSIS / NO_CODE_CHANGE`.
- **Preconditions:** clean checkout of the frozen-spec descendant and an
  identified OpenCode binary/version capture method — both satisfied below.
- **In scope:** `bun run check:ci`, typecheck/build/release and affected-test
  availability; exact failure classification; fixture metadata template.
- **Out of scope honored:** no source edit, no dependency upgrade/lockfile
  rewrite/manifest change, no OpenCode install/upgrade/pin to force green, no
  unrelated baseline repair, no credentials/config/OAuth/provider/proxy/global
  OpenCode/WorkBuddy mutation, no push/merge/PR, no default-branch or
  other-worktree touch.

## 2. Environment / toolchain prerequisites

| Item | Value |
| --- | --- |
| OS | macOS (Darwin) 25.2.0, arm64 (`uname -a`: Darwin mac-mini 25.2.0 ... RELEASE_ARM64_T8132) |
| Shell | zsh |
| bun | 1.3.13 (`bun --version`) |
| bun (declared) | `package.json#packageManager: bun@1.3.14` — mismatch noted; **not changed** (no toolchain change permitted); no result depends on it |
| node | v25.8.0 |
| npm | 11.11.0 |
| git | 2.53.0 |
| bunfig.toml | `[test] root = "./src"`, `preload = ["@opentui/solid/preload"]` |
| Locked toolchain (from `bun.lock` install) | `@biomejs/biome@2.5.4`, `typescript@7.0.2`, `@opencode-ai/plugin@1.18.23`, `@opencode-ai/sdk@1.18.23`, `zod@4.4.3`, `@oh-my-pi/hashline@18.1.2` |

Prerequisite state: fresh worktree had **no `node_modules`**; deterministic
install required. After install, all validation commands ran without any
additional prerequisite.

## 3. Dependency / install result

Command: `bun install --frozen-lockfile`

Exit code: `0`

Result: `250 packages installed [2.85s]`. The root `prepare` hook
(`bun run build`) ran automatically as part of the install and completed
successfully; regenerated `oh-my-opencode-slim.schema.json` was byte-identical
and `dist/` is gitignored.

Tracked files changed by install: **NO** — `git status` was clean immediately
after install and again after every subsequent command in this ledger.

## 4. Command / exit-code / classification ledger

Preserved raw outputs: `/tmp/urv1-00-checkci.log`, `/tmp/urv1-00-typecheck.log`,
`/tmp/urv1-00-build.log`, `/tmp/urv1-00-verify-release.log`,
`/tmp/urv1-00-bun-test.log`. These are session-scoped working evidence, **not**
durable repository artifacts; the decisive excerpts embedded in this committed
document are the durable evidence.

| # | Command | Exit | Decisive output excerpt | Classification |
| --- | --- | --- | --- | --- |
| 1 | `bun install --frozen-lockfile` | 0 | `250 packages installed [2.85s]`; `prepare` build hook ran clean; `git status` clean afterward | PASS |
| 2 | `bun run check:ci` (`biome check .`) | 1 | `Checked 359 files in 222ms. No fixes applied. Found 15 errors. Found 31 warnings. Found 3 infos.` | FAIL — PRE_EXISTING (15 errors; see §4.1) |
| 3 | `bun run typecheck` (`tsc --noEmit`) | 0 | `$ tsc --noEmit` (silent success) | PASS |
| 4 | `bun run build` | 0 | Bundles: `index.js 1.66 MB`, `tui.js 93.40 KB`, `server.js 2.58 MB`, `tui2.js 0.56 MB`, `cli/index.js 138.48 KB`; `tsc --emitDeclarationOnly`; `✅ Schema written .../oh-my-opencode-slim.schema.json` | PASS |
| 5 | `bun run verify:release` | 0 | `Checking dist for leaked machine paths... / Packing npm artifact... / Installing packed artifact into clean temp project... / Importing installed package entrypoint... / Importing installed TUI entrypoint... / Release artifact verification passed.` | PASS |
| 6 | `bun test` (full suite) | 0 | `2420 pass / 0 fail / 3 snapshots, 6138 expect() calls / Ran 2420 tests across 144 files. [68.36s]` | PASS |
| 7 | `git diff --cached --check` | 0 | whitespace check on the staged evidence file, run during finalization (see §8, §9) | PASS |
| 8 | `opencode --version` | 0 | `1.15.13` (see §6) | PASS (capture only) |

Affected-test availability: no source change exists, so no targeted/affected
tests are distinct from the full suite; the full suite (row 6) passed and
therefore covers the applicable-test requirement trivially.

### 4.1 check:ci failure classification

`bun run check:ci` exits 1 at the frozen base SHA in a **fully clean worktree**
with **zero changes introduced by this ticket**. Biome `2.5.4` is pinned by
`bun.lock` and installs deterministically, so the same command reproduces
identically on a fresh clone of the base SHA. Every diagnostic is therefore
classified **PRE_EXISTING**:

- Files with diagnostics (6): `src/cli/skills.ts`, `src/config/profile.test.ts`,
  `src/config/profile.ts`, `src/hooks/hashline/filesystem.ts`,
  `src/hooks/hashline/read-hook.ts`, `src/hooks/hashline/tool.ts`.
- Categories observed: Biome `lint` rules (`useTemplate`, `useLiteralKeys`,
  `noNonNullAssertion`, `noUnusedImports`, `noUnusedVariables`,
  `noExplicitAny`), `assist/source/organizeImports`, and formatter diffs.

Representative excerpt (`src/config/profile.ts:52` and summary):

```text
src/config/profile.ts:52:22 lint/style/useTemplate  FIXABLE
  i Template literals are preferred over string concatenation.
  52 │     const tempPath = filePath + '.tmp';

Checked 359 files in 222ms. No fixes applied.
Found 15 errors.
Found 31 warnings.
Found 3 infos.
```

None of these diagnostics is `CAUSED_BY_THIS_CHANGE` (no change), none is
`ENVIRONMENT_DEPENDENT` (deterministic under the locked Biome), and none is
`UNKNOWN` (root cause fully established). Per ticket scope and Spec §12, no
unrelated baseline repair was performed.

### 4.2 Tracked-file side effect of verify:release

`bun run verify:release` (npm pack at repo root + cleanup) **deletes the
tracked tarball `oh-my-opencode-slim-2.2.17.tgz`** as a side effect. Detected
immediately after the run via `git status`; remediated with
`git checkout -- oh-my-opencode-slim-2.2.17.tgz` and the tree re-verified clean.
Recorded so later tickets do not mistake this side effect for a source change.

## 5. Failure classification summary

| Classification | Count |
| --- | --- |
| PASS | 6/6 executed validation commands (rows 1, 3, 4, 5, 6, 7) |
| CAUSED_BY_THIS_CHANGE | 0 |
| PRE_EXISTING | `check:ci` (15 errors / 6 files) |
| ENVIRONMENT_DEPENDENT | 0 |
| UNKNOWN | 0 |

Completion condition from Spec §12 met: no unresolved `CAUSED_BY_THIS_CHANGE`
and no unresolved `UNKNOWN` failure.

## 6. OpenCode binary / version capture method (for later real-runtime work)

Accepted capture method (two forms):

1. **Direct binary capture (interactive / local):** run `opencode --version`
   against the exact binary that will drive the fixture, and resolve binary
   provenance with `which opencode`, `readlink`/`realpath`, and the installed
   package `package.json#version` for npm-installed binaries. Record all four.
2. **Pinned isolated capture (CI / reproducible):** the repo-native pattern in
   `scripts/verify-opencode-host-smoke.ts` installs `opencode-ai@<version>`
   into an isolated temp host via `bun add`, where
   `OPENCODE_SMOKE_VERSION` selects the version (default `latest`) and the
   binary is `<temp>/node_modules/.bin/opencode`. Capture with
   `<binary> --version` and the `/global/health` probe.

Current result:

| Field | Value |
| --- | --- |
| Command | `opencode --version` → exit 0, output `1.15.13` |
| `which opencode` | `/opt/homebrew/bin/opencode` |
| Symlink target | `../lib/node_modules/opencode-ai/bin/opencode.exe` |
| Real path | `/opt/homebrew/lib/node_modules/opencode-ai/bin/opencode.exe` |
| Package version | `opencode-ai@1.15.13` (npm global) |

Note: the repo's **compile-time** plugin API pins are `@opencode-ai/plugin` /
`@opencode-ai/sdk@1.18.23` (clonedeps source pin `1.18.13`), which are
distinct from the runtime binary version. Each real-runtime ticket must
capture the actual binary/version it executes using the method above; a
runtime-source SHA change invalidates any later real-runtime proof (V3 graph
URV1-07/08/09 constraint).

## 7. Fixture metadata template (for later real-host work)

Every real-runtime acceptance fixture (URV1-07/08/09) must record:

```text
OPENCODE_BINARY=/absolute/path/to/resolved/binary
OPENCODE_VERSION=<from `--version` and package.json>
SLIM_CANDIDATE_SHA=<exact frozen runtime-source SHA>
HOST_CONTEXT=<PTY/interactive vs headless; terminal multiplexer if any>
SESSION_ID=<host session identifier>
LOGS_ARTIFACTS=<paths to captured logs, transcripts, file hashes/diffs>
EVIDENCE_LEVEL=REAL_RUNTIME | INTEGRATION_SIMULATION | UNIT | NOT_PROVEN
```

## 8. Architecture invariant counts

No runtime source was modified, so all invariants are preserved by
construction. The frozen-base tree was verified clean (`git diff --name-only
HEAD` empty and `git status` clean) before this documentation was authored.
The sole intentional change now being committed is the documentation artifact
`docs/reviews/URV1-00_BASELINE_VALIDATION.md`; no runtime or source path is
modified:

```text
New runtime state machines:                0
New persistence systems:                   0
New scheduler:                             0
New job board:                             0
New watchdog engine:                       0
New completion engine:                     0
Duplicate UltraWork engine:                0
New provider/account orchestration system: 0
Implementation begun:                      NO (NO_CODE_CHANGE ticket)
```

## 9. Self-review findings and remediation

| Finding | Remediation |
| --- | --- |
| `verify:release` deletes tracked `oh-my-opencode-slim-2.2.17.tgz` as a pack/cleanup side effect | Restored with `git checkout -- oh-my-opencode-slim-2.2.17.tgz`; documented in §4.2 for later tickets |
| Installed bun `1.3.13` vs declared `packageManager bun@1.3.14` | Noted as an environment observation (§2); no toolchain change made; all results deterministic under bun 1.3.13 and none depend on the patch difference |
| `check:ci` fails at base SHA on Biome lint/format findings | Classified `PRE_EXISTING` (§4.1); no repair performed per scope and Spec §12 |
| Raw logs only in `/tmp` | `/tmp` logs are session-scoped, not durable repository artifacts; decisive excerpts are embedded in this artifact (§4) as the durable evidence, and full raw logs are preserved at `/tmp/urv1-00-*.log` for the session only |
| Scope drift risk (e.g., running host fixture, editing source) | None; only read-only commands plus this documentation artifact executed inside the worktree |

Staged whitespace check (`git diff --cached --check`) result: exit 0 (no
whitespace errors) against the staged evidence file, run during finalization.
Plain `git diff --check` alone would not cover the untracked file; staging it
first and using `git diff --cached --check` is what covers it.

## 10. Git boundary / non-interference confirmation

- Only the evidence document
  `docs/reviews/URV1-00_BASELINE_VALIDATION.md` is added on branch
  `work/urv1-00-baseline`.
- No push, no merge, no PR, no default-branch action, no other worktree
  touched, no remote operation performed.
- No source, credentials, OAuth, provider, proxy, global OpenCode, or
  WorkBuddy configuration changed.

## 11. Candidate SHA after committing the evidence document

CANDIDATE_SHA: the exact candidate SHA is **not** embedded in this document —
doing so would be self-referential, since this document is part of the commit.
It is supplied in the external handoff/runtime record instead. This commit is a
single documentation-only commit adding
`docs/reviews/URV1-00_BASELINE_VALIDATION.md`.

IMPLEMENTER_HANDOFF_PACKET:
- exact candidate SHA (supplied in the external handoff/runtime record)
- files changed: `docs/reviews/URV1-00_BASELINE_VALIDATION.md` only
- commands/results/classifications: see §4 ledger and §5 summary
- known failures: `bun run check:ci` → `PRE_EXISTING` Biome findings (§4.1);
  `verify:release` tracked-tgz side effect (§4.2, remediated)
- self-review/remediation: §9
- scope confirmation: §1
- architecture-invariant confirmation: §8
