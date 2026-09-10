# URV1-07 — Hashline Real-Host Valid / Stale / Reanchor Proof (Preparation Protocol)

> **STATUS: PREP_ONLY — NOT FINAL EVIDENCE — NOT PASS**
>
> This document defines the controlled disposable fixture protocol, validation sequence, and evidence capture schema for URV1-07.
> In accordance with the frozen Acceptance Spec (§§3.4, 7.2–7.6, 11.1–11.2, 12.4, 15) and Ticket Graph V3 (URV1-07), this proof requires execution against the **frozen final runtime candidate SHA**.
> This preparation artifact establishes fixture mechanics, command ledgers, and assertion verification without executing premature runs or asserting synthetic pass verdicts.

---

## 1. Candidate Binding & Runtime Metadata

| Attribute | State / Bound Value | Notes |
|---|---|---|
| **Proof Status** | `PREP_ONLY — NOT FINAL EVIDENCE — NOT PASS` | Preparation artifact only |
| **Candidate SHA** | `PENDING_CANDIDATE_SHA` | Must be bound to post-Lane-03 candidate SHA |
| **Baseline Authority SHA** | `7903be97539d13df31e64c69ce8966984861b5f4` | Starting baseline of worktree |
| **Authority Branch** | `work/urv1-07-prep` | Isolated preparation worktree |
| **Target Review Path** | `docs/reviews/URV1-07_HASHLINE_PROOF.md` | Single preparation evidence path |
| **Evidence Level** | `PENDING (Target: REAL_RUNTIME)` | Simulation or unit test does not substitute |
| **Host Environment** | `win32 / Git Bash / Bun runtime` | Controlled real-host test harness |

---

## 2. Preconditions & Controlled Fixture Definition

### 2.1 Configuration Authority (Spec §7.1, §7.2)
Per URV1-06 diagnosis, `hashline_edit` is disabled by default. The controlled proof fixture explicitly enables it via the Slim configuration file (`oh-my-opencode-slim.json`):

```json
{
  "$schema": "./node_modules/oh-my-opencode-slim/oh-my-opencode-slim.schema.json",
  "hashline_edit": true
}
```

### 2.2 Peer Dependency Requirement
- `@oh-my-pi/hashline` (v18.1.2) must be present in the loaded runtime environment.
- In clean checkout: `bun install --frozen-lockfile` provides the compatible optional peer.

### 2.3 Disposable Workspace Structure
The proof must operate in a temporary directory outside the repository root:
- Fixture Root: `<TEMP_DIR>/urv1-07-hashline-fixture/`
- Target File: `<TEMP_DIR>/urv1-07-hashline-fixture/sample.ts`
- Initial Content:
  ```typescript
  export function computeTotal(items: number[]): number {
    return items.reduce((acc, val) => acc + val, 0);
  }
  ```

---

## 3. Step-by-Step Proof Protocol

### Step 1 — Tool Availability & Annotation Check
1. Start isolated test runtime with `hashline_edit: true`.
2. Verify registered tool list contains `hashline_edit`.
3. Call native `read` tool on `sample.ts`.
4. **Assert:** Returned text contains line hash tags formatted as `[sample.ts#<TAG1>]` on target line.
5. Capture `<TAG1>` value.

### Step 2 — Valid Current-Tag Edit
1. Issue `hashline_edit` on line containing `return items.reduce(...)` referencing `<TAG1>`.
2. Replacement text:
   ```typescript
   export function computeTotal(items: number[]): number {
     // computeTotal with logging
     return items.reduce((acc, val) => acc + val, 0);
   }
   ```
3. **Assert:** Edit succeeds with return status `OK`.
4. Verify file content matches expected mutation. Record new sha256 of file.

### Step 3 — Legitimate External Mutation & Stale Tag Capture
1. Record file sha256 before external edit (`HASH_PRE_EXTERNAL`).
2. Simulate external edit (e.g. concurrent developer edit) by appending an exported constant at the bottom:
   ```typescript
   export const VERSION = "1.0.0";
   ```
3. Record new file sha256 (`HASH_POST_EXTERNAL`).
4. Attempt to execute `hashline_edit` targeting the original `<TAG1>` (which was invalidated by the external edit).
5. **Assert:** `hashline_edit` rejects the edit with `STALE_TAG_REJECTED`.

### Step 4 — Byte / Line Proof of No Mutation on Rejection
1. Compute sha256 of `sample.ts` immediately after the rejection (`HASH_POST_REJECTION`).
2. **Assert:** `HASH_POST_REJECTION === HASH_POST_EXTERNAL`.
3. Perform byte-by-byte diff between post-external and post-rejection file states.
4. **Assert:** Exact zero byte changes, proving that rejected stale edit caused NO partial mutation or corruption.

### Step 5 — Reread & TAG2 Reanchor Edit
1. Call native `read` tool on `sample.ts` to refresh line hashes.
2. Observe newly generated `<TAG2>` on the target function line.
3. Call `hashline_edit` referencing `<TAG2>`.
4. Replacement:
   ```typescript
     // computeTotal with validated positive check
     if (items.some(x => x < 0)) throw new Error("negative not allowed");
     return items.reduce((acc, val) => acc + val, 0);
   ```
5. **Assert:** Reanchored edit succeeds with return status `OK`.
6. Verify final file content and syntax validity.

### Step 6 — Native Edit & Apply-Patch Independence
1. In the same enabled fixture session, invoke native `edit` tool without specifying line tags.
2. **Assert:** Native `edit` executes independently and successfully.
3. If `apply_patch` is available on the host, invoke it with a standard unified diff.
4. **Assert:** Native tools operate without requiring hash tags, maintaining complete backward compatibility.

### Step 7 — Fixture Teardown & Evidence Verification
1. Remove temporary fixture directory `<TEMP_DIR>/urv1-07-hashline-fixture/`.
2. Verify working tree of candidate runtime remains completely clean (`git status --porcelain` is empty).
3. Check that no configuration or credentials persisted in host global directories.

---

## 4. Execution Ledger Template (For Candidate Run)

| # | Action | Expected Output / Invariant | Actual Observed | Result |
|---|---|---|---|---|
| L01 | Runtime SHA Pin | `git rev-parse HEAD` equals Candidate SHA | `PENDING_RUN` | PENDING |
| L02 | Config toggle | `runtime.hashline_edit === true` | `PENDING_RUN` | PENDING |
| L03 | Native read TAG1 | Lines annotated with `[sample.ts#<TAG1>]` | `PENDING_RUN` | PENDING |
| L04 | Valid edit | Successful edit against TAG1 | `PENDING_RUN` | PENDING |
| L05 | External edit | External modification changes file sha256 | `PENDING_RUN` | PENDING |
| L06 | Stale TAG1 edit | Rejected with stale tag error | `PENDING_RUN` | PENDING |
| L07 | No-mutation check | Post-rejection sha256 == pre-rejection sha256 | `PENDING_RUN` | PENDING |
| L08 | Reread TAG2 | Fresh tag emitted on target line | `PENDING_RUN` | PENDING |
| L09 | Reanchor edit | Edit against TAG2 succeeds | `PENDING_RUN` | PENDING |
| L10 | Native independence | Native edit works without tag | `PENDING_RUN` | PENDING |
| L11 | Clean boundary | Working tree clean, zero modified tracked files | `PENDING_RUN` | PENDING |

---

## 5. Artifact Checklist & Candidate Execution Gate

- [ ] Candidate SHA frozen and committed on authority branch
- [ ] Working tree clean
- [ ] Real-host PTY/session transcript captured
- [ ] Pre/post byte diffs recorded
- [ ] No Slim source modified during proof execution
- [ ] Final verdict issued only after candidate execution
