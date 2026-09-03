# URV1-01 — WorkIntent Canonical Carrier and Lifecycle Seam Probe

TICKET:
URV1-01 — WorkIntent canonical carrier and lifecycle seam probe

STATUS:
PASS (diagnosis; documentation-only evidence commit; `NO_CODE_CHANGE`)

TICKET CLASS:
`DIAGNOSIS / NO_CODE_CHANGE`

AUTHORITY:
Frozen Spec commit `16bb77f8209542a6bcc1ca11a48203867d8a3378`
(`docs/planning/SLIM_RUNTIME_WIRING_ACCEPTANCE_SPEC_V1.md`) §§3.1, 5.1–5.4,
10.4, 12.10–12.12, 16.
Frozen V3 ticket graph commit `9bac2333d5a2963a05f39e130fffc587336096c9`
(`docs/planning/SLIM_RUNTIME_WIRING_TICKET_GRAPH_V3.md`).
V2.1 graph is reference only and was not used.

BRANCH:
`work/urv1-01-carrier`

WORKTREE:
`/Users/songshiyao/Documents/ChatGPT/opencode-slim-runtime-worktrees/slim-urv1-01`

BASE_SHA (accepted predecessor URV1-00):
`1a3fba9b1e4ba7eef266063e9c432844d60645eb`
`git merge-base --is-ancestor` confirms both frozen Spec and frozen graph commits
are ancestors of HEAD. Working tree was clean at start and at every ledger
checkpoint (`git status --porcelain` empty).

IMPLEMENTER_BACKEND:
WorkBuddy CLI 2.137.1 (as authorized for this Ticket)

IMPLEMENTER_REQUESTED_MODEL:
deepseek-v4-flash

IMPLEMENTER_OBSERVED_MODEL:
deepseek-v4-flash (runtime model; matches requested model)

CREDENTIALS/CONFIG MODIFIED:
NO (no provider/account/proxy/OpenCode/global settings touched; only read-only
SQLite inspection of the existing host data dir plus a disposable fixture in
`/tmp`)

SOURCE CHANGES:
NO

---

## 1. Objective and outcome (one paragraph)

URV1-01 had to prove, without new storage, the exact existing OpenCode
session-history carrier and the Slim transform/rehydration seams that can
persist and reconstruct one bounded canonical `slim.work-intent.v1`
tool/result envelope. The probe succeeded: the canonical carrier is a
**completed host tool part** (`type: "tool"`, `state.status: "completed"`)
produced by a Slim-registered tool on the current orchestrator session, with
the bounded JSON payload in `state.output` and the fixed Slim-origin marker
inside it. Session binding is structural (storage columns `part.session_id` /
`message.session_id`, composed into `sessionID`/`messageID` on the wire).
Freshness comes purely from host order — storage index
`message(session_id, time_created, id)` — which matches Spec §5.2
"`time_created`, then host message ID", so the WorkIntent payload needs no
timestamp/revision. Compaction is tail-retaining (real compacted sessions show
a summary message + `compaction` part with `tail_start_id`, followed by the
retained tail); a WorkIntent record written at the tail survives, and a record
that is compacted away yields safe `UNKNOWN`, never a fallback. Bounds
feasibility: a payload at every field cap serializes to 7,233 bytes (7,400
inside a minimal tool-state JSON frame), both under the 8 KiB envelope bound.
Carrier decision is GO for URV1-02, with truthful `NOT_PROVEN` caveats listed
in §8.

---

## 2. Verified environment (ledger excerpt)

| Check | Result |
| --- | --- |
| `pwd` | `/Users/songshiyao/Documents/ChatGPT/opencode-slim-runtime-worktrees/slim-urv1-01` |
| `git rev-parse --abbrev-ref HEAD` | `work/urv1-01-carrier` |
| `git rev-parse HEAD` | `1a3fba9b1e4ba7eef266063e9c432844d60645eb` (= base, URV1-00 accepted) |
| `git status --porcelain` | empty at start, after install, and after every command |
| `git merge-base --is-ancestor 16bb77f HEAD` | YES (Spec ancestor) |
| `git merge-base --is-ancestor 9bac233 HEAD` | YES (V3 graph ancestor) |
| `bun --version` | 1.3.13 (declared packageManager `bun@1.3.14`; mismatch noted, not changed) |
| `opencode --version` / `which opencode` | `1.15.13` / `/opt/homebrew/bin/opencode` (same binary captured in URV1-00) |
| `@opencode-ai/plugin` / `@opencode-ai/sdk` installed | `1.18.23` each (`package.json` pins `1.18.23`) |
| Host data dir inspected | `~/.local/share/opencode/opencode.db` (SQLite, read-only mode `file:...?mode=ro`) |

Dependency install: `bun install --frozen-lockfile` → `250 packages installed
[3.12s]`, exit 0, tracked tree stayed clean. This is the deterministic,
already-locked install permitted by the Ticket; no lockfile/manifest change.

---

## 3. Host part / tool-result carrier shape (Evidence: REAL_RUNTIME + compile-time)

### 3.1 REAL_RUNTIME storage inspection (real host history, binary 1.15.13)

Structural inspection of the existing real host SQLite store
`~/.local/share/opencode/opencode.db` (read-only; 53 sessions, 704 messages,
2,733 parts). No message/part text content was read or recorded; only table
names, column names, JSON key names, counts, and opaque id prefixes were used.

`message` and `part` tables (verbatim schema):

```sql
CREATE TABLE `message` (
    `id` text PRIMARY KEY,
    `session_id` text NOT NULL,
    `time_created` integer NOT NULL,
    `time_updated` integer NOT NULL,
    `data` text NOT NULL, ... );
CREATE INDEX `message_session_time_created_id_idx`
    ON `message` (`session_id`,`time_created`,`id`);

CREATE TABLE `part` (
    `id` text PRIMARY KEY,
    `message_id` text NOT NULL,
    `session_id` text NOT NULL,
    `time_created` integer NOT NULL,
    `time_updated` integer NOT NULL,
    `data` text NOT NULL, ... );
CREATE INDEX `part_message_id_id_idx` ON `part` (`message_id`,`id`);
```

Observed JSON key names inside `data`:

- assistant `message.data`: `role,time,parentID,modelID,providerID,mode,agent,
  path,cost,tokens,finish,summary,error,variant`
- user `message.data`: `role,time,summary,agent,model,variant,system,tools`
- distinct real `part.data.type` values: `text, step-start, reasoning, tool,
  step-finish, compaction, patch`
- tool part `data` keys: `type,callID,tool,state`
- completed tool state keys: `status,input,output,title,metadata,time,
  attachments`
- text part keys: `type,text,time,metadata,synthetic`
- compaction part keys: `type,auto,overflow,tail_start_id`

Facts proven REAL_RUNTIME:

1. `time_created` (column) equals `data.time.created` (JSON) in all 704
   messages (`count where time_created != json data time.created` = 0).
2. Message IDs are time-sortable opaque strings (`msg_<...>`); part IDs use
   `prt_`; sessions use `ses_`.
3. Tool results are stored as **one completed tool part** with a `string`
   output (`state.output`) plus `title`, `metadata`, and `time
   {start,end}` — there is no separate "tool_result role/message".
4. Real completed tool outputs range 0–45,602 chars (601 completed parts,
   avg 1,484). An 8 KiB envelope is comfortably inside the observed retained
   range (multiple real outputs >16 KiB persist).
5. Tool parts persist regardless of author: 601 completed / 7 error / 7
   running / 1 pending tool parts exist, including real `task` tool envelopes
   with background-task outputs (`"Background task launched."`,
   `bg_…` ids) in the session that Slim's rehydration code later parses.
6. Two real **synthetic** text parts exist (`synthetic: true`), i.e. the host
   does persist synthetic text when it reaches a message — but such text is
   unstructured (rejected as a carrier, §7).

### 3.2 Compile-time contract (source-level, `@opencode-ai/sdk` 1.18.23)

`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`:

- `Message = UserMessage | AssistantMessage` (L128). `UserMessage`
  (L39–60) and `AssistantMessage` (L98–127) both carry `id`, `sessionID`,
  `time: { created: number }` (no `time_created` top-level wire key).
- `ToolPart` (L263–274): `{ id; sessionID; messageID; type: "tool"; callID;
  tool: string; state: ToolState; metadata?: {[k]:unknown} }`.
- `ToolStateCompleted` (L231–247): `{ status: "completed"; input: {[k]:unknown};
  output: string; title: string; metadata: {[k]:unknown}; time: {start,end,
  compacted?}; attachments? }`.
- `Part` union (L345–353) is the only array member of a message payload;
  there is no separate result part type.
- `Session` (L465–492): `id`, `directory`, `version`, `time {created, updated,
  compacting?}`.

`node_modules/@opencode-ai/plugin/dist/index.d.ts`:

- `tool.execute.before` (L235–241): input `{tool, sessionID, callID}` →
  output `{args}`; `tool.execute.after` (L249–258): input `{tool, sessionID,
  callID, args}` → output `{title, output: string, metadata}`.
- `experimental.chat.messages.transform` (L259–264): receives/returns the
  session message list `{ info: Message; parts: Part[] }[]`.
- `experimental.session.compacting` (L283–288): input `{sessionID}` → output
  `{context: string[]; prompt?}` — plugin hook invoked before host compaction
  (documented: "context: Additional context strings appended to the default
  prompt; prompt: replaces the default compaction prompt").
- `experimental.compaction.autocontinue` (L296–305) and
  `experimental.chat.system.transform` (L265–270) also exist.
- Tool `output` is a string; tool result envelopes persist to the host part
  store exactly as typed above.

Session-binding / current-session provenance therefore has three independent
layers that URV1-02 can enforce: (a) the part row structurally belongs to a
session (`part.session_id`, `message.session_id`); (b) reads are
session-scoped (`session.messages({ path: { id: sessionID } })`, with optional
`query: { directory }`); (c) the envelope payload itself carries a
`sessionID` binding and a fixed Slim-origin marker that must match.

**Evidence levels:** §3.1 REAL_RUNTIME (structural inspection of a real host
history store). §3.2 source-level compile-time contract — not runtime proof.

---

## 4. Ordering source and "newest without timestamp/revision" (Evidence: REAL_RUNTIME + source)

Spec §5.2 requires freshness from host order: `time_created`, then host
message ID. Evidence:

1. **REAL_RUNTIME (storage)**: The host's only message index is
   `message(session_id, time_created, id)` — exactly `(session_id,
   time_created, id)`. Across all 52 sessions with messages:
   - descending `time_created` adjacent pairs (ordered by `(time_created,
     id)`) = 0;
   - `(session_id, time_created)` ties = 0.
   Message order by that index is therefore a strict total order in real
   history; the `id` column is the defined tie-break for the general case and
   ids are generated in time order.
2. **REAL_RUNTIME naming reconciliation**: the spec's `time_created` is the
   real storage column name, and it is byte-consistent with the wire JSON
   `time.created` (§3.1 fact 1). On the plugin wire type the same value
   appears as `time.created`; the WorkIntent payload needs neither.
3. **Source-level (consumers assume ascending host list)**: Slim reads a
   session's message list and treats the **last array element as newest**:
   - `src/hooks/task-session-manager/revived-run-tracker.ts:106`
     (`data.at(-1)`), `:183-186` (`lastIndex = data.length - 1`; compares
     against a stored baseline message id);
   - `src/hooks/foreground-fallback/index.ts:760`
     (`[...messages].reverse().find(isReplayableUserMessage)`);
   - `src/tools/task-message.ts:304` (iterates `data.length - 1` → 0);
   - `src/utils/session.ts:192` (`findLast` assistant), `:203`
     (`messages[messages.length - 1]`).
   Multiple shipped features would break if the host returned newest-first;
   the host list is therefore ascending, oldest → newest.
4. **INTEGRATION_SIMULATION** (fixture, §9): selecting "last canonical
   candidate in array order" returns the newest envelope when two canonical
   records exist at different positions, and later non-canonical messages do
   not change the selection — with **no timestamp/revision field in the
   payload**.

**Conclusion:** Host ordering alone identifies the newest candidate. The
WorkIntent schema requires no `time_created`/revision; the adapter reads the
host-ordered list and takes the final candidate (§5.3). The one
not-observed-runtime aspect — the exact byte order of the HTTP response
array — is recorded `NOT_PROVEN`; every shipped Slim consumer and the storage
index assume/ascend in that order, and an adapter that scans list order and
defines "newest = last recognized candidate" is correct under either order
only if it matches host order; URV1-02's focused tests and the URV1-09 real
host fixture must assert ascending order once (see §10).

---

## 5. Source-level seam map for URV1-02 (files / symbols / call paths)

### 5.1 Host history retrieval

- SDK client method: `client.session.messages({ path: { id }, query: {
  directory?, limit? } })` → `Array<{ info: Message; parts: Part[] }>`.
  Generated URL `GET /session/{id}/message`
  (`node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.js:353`); type
  `SessionMessagesData` (`.../types.gen.d.ts:2209-2222`),
  `session.messages` declared `.../gen/sdk.gen.d.ts:167-170`.
- Single message: `client.session.message({ path: { id, messageID } })`.
- Call-shape guard for source: `src/utils/session-calls.contract.ts`
  (compile-time contract; `messages` nested shape pinned at L52–56).
- Real callers that already read history back: `revived-run-tracker.ts:99`,
  `:166`; `foreground-fallback/index.ts:752`; `task-message.ts:297`;
  `utils/session.ts:180`, `:229`; `hooks/chat-headers.ts:47`.

### 5.2 Slim message-history transform / rehydration seams

- Single transform composition root:
  `src/index.ts:1436-1511` (`'experimental.chat.messages.transform'`) calls,
  in order: `rewriteDisplayNameMentions` (1442–1455),
  `processImageAttachments` (1462), then sub-transforms —
  `taskSessionManagerHook['experimental.chat.messages.transform']` (1494),
  `postFileToolNudge` (1498), `phaseReminder` (1502),
  `filterAvailableSkills` (1506), and finally
  `taskSessionManagerHook.injectBackgroundJobBoard` (1510).
- Rehydration precedent (the exact pattern URV1-02 mirrors):
  `rehydrateHistoricalRunningTasks` in
  `src/hooks/task-session-manager/index.ts:53-143`, invoked from the same
  hook at `:446-452`. It scans every `type: 'tool'`, `tool === 'task'` part in
  the host-ordered message list, requires `state.output`, parses task id/state
  from the persisted output, applies provenance filters (orchestrator-session
  agent, session binding, tombstones) and rebuilds in-memory board state with
  `backgroundJobBoard.registerLaunch({ preserveRun: true, now: 0 })`
  (`:125-137`). A WorkIntent reconstruction function should sit beside this
  seam and reuse the same message/part scan + host-order rule.
- Tool write seam (how the carrier envelope is produced):
  `src/index.ts:1258-1268` (`tool.execute.before` fan-out) and
  `:1513-1522` (`tool.execute.after` fan-out); tools are registered via the
  `tool()` helper (`src/tools/task-status.ts:20-68` shape: description, zod
  `args`, `execute(args, toolContext)` returning a string; `toolContext`
  carries `sessionID`). `src/tools/index.ts` + `src/index.ts:614-632` assemble
  the tool registry.
- Retained-part / ephemeral injection helpers (NOT a persistence path):
  `src/hooks/cache-safe-injection.ts` —
  `createTaggedSyntheticPart` `:48-57`, `appendTaggedSyntheticPart` `:82-87`,
  `stripTaggedContent` `:94-107`, `appendTrailingVolatileMessage` `:114-123`;
  consumers `board-injection.ts:1247,1260` (metadata key
  `'oh-my-opencode-slim.backgroundJobBoard'`, `board-injection.ts:52`). These
  only produce outbound synthetic text parts; see §7 rejection.

### 5.3 Compaction seams (`experimental.session.compacting` and live handling)

- No Slim code registers or references a compaction event today; there is no
  `experimental` key in the plugin config schema (`src/config/schema.ts`,
  `PluginConfigSchema`), and no listener consumes a `session.compacted` event.
- The host plugin API the code compiles against exposes
  `experimental.session.compacting` (input `{sessionID}` → output
  `{context: string[]; prompt?}`) and `experimental.compaction.autocontinue`
  (§3.2) — the registration point a future compaction-aware hook would use.
- Slim currently reacts to host compaction only through observable effects on
  the transform payload:
  - `src/hooks/task-session-manager/board-injection.ts:1688-1703`
    (`hasCompacted`: message count drop, first-anchor move, or lost retained
    anchors), `:1705-1726` (`updateBoardHistoryState` clears retained
    snapshots when compaction is detected);
  - `src/utils/internal-initiator.ts:33-39` — host compaction continuation
    parts carry `metadata.compaction_continue === true`; Slim treats them as
    internal     initiators so board injection/nudges/reminders stay off on the
    continuation turn (uses at `board-injection.ts:1197`,
    `phase-reminder/index.ts:77`, `post-file-tool-nudge/index.ts:91`,
    `chat-headers.ts:52`).
  - Compaction tests in the existing suite model compaction as a reduced
    message list (`src/hooks/task-session-manager/index.test.ts:1186-1208`,
    `:3728-3815`) — an `INTEGRATION_SIMULATION` precedent for URV1-02's
    fixture.
- Session-level compaction state exists in the real store: `session` table
  column `time_compacting`; `part.data.type = 'compaction'` rows carry
  `auto`, `overflow`, `tail_start_id`.

### 5.4 REAL_RUNTIME compaction structure (host history)

Real compacted sessions exist in the inspected host store (3 sessions; one
long session compacted twice). Structure observed at the second compaction
boundary (session `ses_1f8e45…`, ids abbreviated; roles and part types only):

```
msg_e0d342ea8002 (user)   1 text part          <- summary text of compacted head
msg_e0d342eb0001 (user)   1 compaction part    <- {type:compaction, auto:1,
                                                   tail_start_id: msg_e0d342ea8002…}
msg_e0d342ecf001 (assistant) step-start, reasoning, text, step-finish   <- retained tail resumes
msg_e0d342edb001 (user)   text
… 273 message rows at/after the second tail_start id …
```

(The session's earlier compaction part carried the same shape with `overflow:
0`; the `overflow` field is present on some compaction parts and absent on
others in the observed data.)

The head (216 rows before the first `tail_start_id`) is physically retained in
this store but is superseded by the summary + compaction markers; Slim's own
live detectors treat the transform-visible list as having been shrunk/rewritten
(§5.3). **The exact post-compaction message list the host returns to the
transform hook was not observed in a live host** → `NOT_PROVEN`; the design
below is safe under either answer.

**Compaction retention mechanism for the latest WorkIntent record:**

- Host compaction is tail-retaining: it summarizes the head and keeps the
  recent tail (marker `tail_start_id`; retained tail messages and their parts
  persist — proven at storage level).
- A canonical record is written only by an authorized Slim action at
  state-change time, so the newest record always sits at (or very near) the
  tail. A compaction whose tail boundary starts before that record keeps it;
  reconstruction re-scans the retained list and selects it by host order.
- The compaction *summary text* of the head is free text and is never a
  recovery authority (Spec §5.4; §10.4). If a boundary rolls past every
  canonical record (e.g., no authorized write for a long idle period),
  reconstruction yields no record → `UNKNOWN` → normal continuation is
  suppressed and no work is dispatched. This is safe by construction and needs
  no compaction manager.
- `experimental.session.compacting` exists as the hook where URV1-02/URV1-03
  may later observe/participate in compaction; it is not required to make
  retention work for the tail-placed record.

**Evidence level:** storage structure and compaction marker/tail facts =
REAL_RUNTIME; live list semantics after compaction = NOT_PROVEN; retention
argument = mechanism + source trace.

---

## 6. Fixture / history inspection (non-mutating)

Two inspections were performed, neither mutating anything:

1. **REAL_RUNTIME structural history inspection** of
   `~/.local/share/opencode/opencode.db` in SQLite read-only mode
   (`file:...?mode=ro`). Raw structural query outputs are reproduced (redacted
   to key names/counts/id prefixes) in §3.1, §4, §5.4.
2. **INTEGRATION_SIMULATION fixture** `/tmp/urv1-01-fixture/carrier-probe.ts`
   (disposable, outside the repo; run with `bun`; no repo code imported). It
   renders a canonical envelope in the observed host shape and exercises the
   Spec §5.2/§5.3/§11.3 semantics. Sample input/output below.

### 6.1 Fixture input samples (contract-level, host-shaped)

Envelope rendered as the tool result string of a `slim_work_intent` tool part
(`state.status: "completed"`), matching the observed storage key set:

```jsonc
// payload serialized into state.output
{ "kind": "slim.work-intent.v1", "origin": "slim",
  "sessionID": "ses_current",
  "objective": "…", "successCriteria": "…",
  "state": "active" /* | waiting_for_user | complete | blocked */,
  "phaseRef": "…", "evidenceRefs": ["…"] }

// host part frame (shape proven in §3)
{ "id": "prt_…", "sessionID": "ses_current", "messageID": "msg_…",
  "type": "tool", "callID": "call_…", "tool": "slim_work_intent",
  "state": { "status": "completed", "input": {…}, "output": "<payload JSON>",
             "title": "…", "metadata": {…},
             "time": { "start": 1, "end": 2 } } }
```

Host-ordered message list for selection tests uses the v1 transform shape
(`{ info: { id, sessionID, role, agent, time }, parts: […] }`).

### 6.2 Fixture output sample (verbatim)

```
max-cap payload serialized bytes: 7233
PASS  max-cap payload serialized envelope <= 8192 bytes
max-cap payload inside minimal tool-state JSON frame: 7400 bytes
PASS  framed envelope <= 8192 bytes
PASS  newest by host position wins (blocked, not older active)
PASS  later non-canonical messages do not alter the selected record
PASS  truncated latest is still the authoritative candidate (not skipped)
PASS  truncated latest yields UNKNOWN (no fallback to older active)
PASS  foreign latest (no origin marker) rejected -> UNKNOWN, no fallback
PASS  cross-session (unbound) latest rejected -> UNKNOWN, no fallback
PASS  schema-invalid latest (unknown state) rejected -> UNKNOWN, no fallback
PASS  text-only history yields UNKNOWN (free text never canonical)
ALL CHECKS PASSED   (exit 0)
```

"Max-cap" = objective and successCriteria both 2,000 chars, phaseRef 1,000
chars, evidenceRefs 8×256 chars, kind/origin/session fields present.

### 6.3 Evidence levels used

| Claim | Level |
| --- | --- |
| Storage tables/columns/indexes; `time_created` == `time.created`; part/tool envelope key sets; compaction markers/tail; monotonic host order; tool part retention | REAL_RUNTIME (real session history inspected read-only) |
| Plugin/SDK type and hook contracts; Slim callers assume ascending host list; transform composition; compaction detection code | Source-level trace (not runtime proof; no `REAL_RUNTIME` label claimed) |
| Selection/UNKNOWN/bounds semantics exercised against host-shaped arrays | INTEGRATION_SIMULATION |
| Byte order of the live HTTP message-list response; exact transform-visible list after compaction | NOT_PROVEN |
| A Slim-named tool envelope physically present in this particular host store | NOT_PROVEN (no `slim_*` tool envelope exists in the inspected history; host tool-part persistence for any tool name, incl. host `task`, is REAL_RUNTIME) |

No simulated evidence was upgraded. No live host session was started (no
provider/credentials used), so nothing here is labeled REAL_RUNTIME beyond the
read-only structural inspection.

---

## 7. Carrier decision and rejected alternatives

### 7.1 Chosen carrier (recommendation for URV1-02)

**A completed host tool part from a Slim-registered tool on the current
orchestrator session** (`type: "tool"`, `tool: <slim carrier tool name>`,
`state.status: "completed"`), payload JSON in `state.output`, plus a fixed
Slim-origin marker and a `sessionID` binding inside the payload; the part's
own `sessionID`/`messageID` are the structural binding. This is the kind of
envelope the host demonstrably persists (§3.1) and the kind Slim already
rehydrates from (`rehydrateHistoricalRunningTasks`, §5.2). It satisfies every
Spec §5.2 requirement: "Slim-controlled tool/result envelope actually
persisted by OpenCode in the current session history"; bound to the current
session; fixed origin marker; schema-valid bounded payload; no revision or
timestamp in the record.

Read path (URV1-02): scan the session's host-ordered message list (available
either through `client.session.messages({path:{id}})` for the current session,
or in the existing `experimental.chat.messages.transform` payload for that
session), find the **latest** carrier tool part, validate the envelope, and
reconstruct an in-memory view. Writes use the existing tool-execution seam
(`tool.execute.*` / `toolContext.sessionID`).

### 7.2 Rejected alternatives (with reasons, tied to evidence)

1. **Model free text** (TextPart text, incl. model summary or status prose):
   not Slim-controlled, no fixed origin marker, no structured bounded payload,
   no deterministic parse; the host also rewrites/summarizes text across
   compaction. Spec §5.2 rejects it; §5.4 "free-text progress is not a
   recovery authority." Real store contains plenty of text parts and two
   synthetic text parts — unstructured, unusable as canonical records.
   Fixture: text-only history → `UNKNOWN`.
2. **Outbound-only synthetic transform content** (`createTaggedSyntheticPart`
   / `appendTaggedSyntheticPart` / `appendTrailingVolatileMessage`,
   `cache-safe-injection.ts`): these are ephemeral, per-request, outbound
   injections recomputed each turn; they are never host-persisted rows and
   cannot survive reload or compaction. Treating them as persistence would
   fabricate history and would also violate the cache-safety rule that
   transform content is deterministic or volatile-tail only. Spec §5.2
   rejects "synthetic outgoing message transform."
3. **`experimental.session.compacting` context strings / compaction summary
   text**: the hook output is string context appended to the summarizer
   prompt; whatever the model writes lands in the summary as free text — not a
   canonical record (§5.4). Not a carrier; at most a future observation hook.
4. **Unbound / foreign parts** (envelope whose `sessionID` ≠ part session, or
   whose origin marker is absent/other-plugin, or a part in a message list
   scoped to another session/directory): cannot be proven Slim-originated and
   current-session; accepted candidates must satisfy kind + origin marker +
   session binding + schema. Fixture: foreign and cross-session latest →
   `UNKNOWN`, no fallback.
5. **New persistence of any kind** (JSON state file, SQLite, ledger, lock):
   forbidden by Spec §3.1/§5.2 and the graph invariants; no need — host
   history is the store.
6. **Envelope only in `state.metadata`**: `metadata` is `{[k]:unknown}` and
   survives (proven present on completed parts), but the wire output contract
   for `tool.execute.after` treats metadata as an opaque bag whose
   persistence/rendering across versions is less contractual than `output`
   (string). `output` is the stable, schema-typed carrier; keep metadata for
   the origin tag only.

---

## 8. UNKNOWN / no-fallback semantics (Evidence: INTEGRATION_SIMULATION + Spec)

Spec §5.3: the final recognizable canonical-record candidate is
authoritative; if it is malformed, truncated, schema-invalid, conflicting, or
not provably Slim-originated, reconstruction is `UNKNOWN`; `UNKNOWN` never
falls back to an older record (that could resurrect a stale `active` after a
later `blocked`/`complete` became unreadable). The fixture demonstrates all of
these, including the subtle "latest candidate" rule: the last host-ordered
carrier tool part is the candidate even when its envelope no longer parses —
truncation therefore yields `UNKNOWN`, not the previous valid `active` record.

Observed safe behaviors preserved:
- no valid record anywhere → `UNKNOWN` (no record, no dispatch);
- text-only history → `UNKNOWN`;
- malformed/truncated/foreign/cross-session/schema-invalid latest →
  `UNKNOWN`, no fallback;
- later non-canonical messages never change the selected record;
- reconstruction is in-memory only and never dispatches work (Spec §5.3; a
  future reload/wake gate is URV1-03 scope).

---

## 9. Bound feasibility (URV1-02 acceptance input)

- Field caps enforced as fixed limits: objective ≤ 2,000 chars; success
  criteria ≤ 2,000; phaseRef ≤ 1,000; evidenceRefs ≤ 8 × 256; serialized
  envelope ≤ 8 KiB (§5.2).
- Fixture result: a payload at **every** field cap simultaneously serializes
  to 7,233 bytes (UTF-8), and to 7,400 bytes inside a minimal tool-state JSON
  frame. Both fit under 8 KiB (959 / 792 bytes of headroom respectively).
- The caps and the envelope bound are therefore mutually satisfiable; an
  adapter that enforces both and rejects over-limit serialization is feasible.
- Real store context: completed tool outputs up to 45,602 chars persist, so
  an ~7.4 KiB envelope is a normal retained size (§3.1 fact 4).

---

## 10. URV1-02 GO / NO-GO

**GO.**

- Current-session provenance: proven (structural `session_id` binding +
  session-scoped reads + payload binding/origin marker) — §3, §7.
- Ordering: proven at storage level (index `(session_id, time_created, id)`;
  zero ties; zero inversions; `time_created` == `time.created`; consumers
  assume ascending) — §4. No timestamp/revision needed in the schema.
- Compaction retention: proven at storage level (tail-retaining compaction;
  tail markers; retained tail rows/parts) with a safe `UNKNOWN` fallback when
  the record is compacted away; no unsafe dispatch path — §5.4.
- Bounds: feasible — §9.

Not load-bearing caveats (must be asserted by URV1-02 tests / URV1-09 real
fixture, but do not block):
- exact byte order of the live HTTP message-list response (expected ascending;
  see §4) — NOT_PROVEN;
- exact transform-visible list composition after a live host compaction —
  NOT_PROVEN (safe either way by §8 semantics);
- `experimental.session.compacting` hook invocation by the runtime host
  version actually deployed — NOT_PROVEN (code compiles against it; host
  1.15.13 predates the 1.18.23 plugin API pins — URV1-09 must pin and re-verify
  the exact host).

**BLOCKED_BY_HOST_SEAM: NO.**

---

## 11. Rejected-carrier summary table (why each is rejected)

| Alternative | Rejection basis | Evidence |
| --- | --- | --- |
| Model free text / status prose | Not Slim-controlled, no origin marker, unstructured, non-deterministic | §3.1, §5.2, §6 fixture |
| Synthetic outbound transform parts | Ephemeral per-request, never persisted, cache-safety constrained | §5.2, cache-safe-injection.ts, Spec §5.2 |
| Compaction summary/context text | Free text, not canonical | §5.4, Spec §5.4 |
| Unbound/foreign/cross-session parts | Provenance/binding failure | §3, §6 fixture |
| Files/DB/ledger/lock persistence | Forbidden (§3.1/§5.2) | Spec |
| metadata-only envelope | `output` is the stable string channel; metadata is an opaque tag bag | §3.2 |

---

## 12. Command / result ledger

Raw outputs preserved at `/tmp/urv1-01-*.log` where noted (session-scoped).

| # | Command | Exit | Decisive result |
| --- | --- | --- | --- |
| 1 | `git rev-parse --abbrev-ref HEAD && git rev-parse HEAD && git status --porcelain` | 0 | branch `work/urv1-01-carrier`; HEAD `1a3fba9…`; clean |
| 2 | `git merge-base --is-ancestor 16bb77f… HEAD` / `… 9bac233… HEAD` | 0 | Spec and V3 graph both ancestors |
| 3 | `bun install --frozen-lockfile` | 0 | `250 packages installed [3.12s]`; clean after |
| 4 | `sqlite3 "file:$HOME/.local/share/opencode/opencode.db?mode=ro" …` (multiple structural queries) | 0 | see §3, §4, §5.4 raw samples |
| 5 | `bun /tmp/urv1-01-fixture/carrier-probe.ts` | 0 | 12/12 checks PASS; §6.2 |
| 6 | `git diff --cached --check` (staged evidence file) | 0 | whitespace clean |
| 7 | `git status --porcelain` after staging | 0 | exactly one added file: `docs/reviews/URV1-01_WORKINTENT_CARRIER_PROBE.md` |

No validation suite was run — this is a `NO_CODE_CHANGE` diagnosis with no
source change, so no affected tests exist; the full-suite baseline was already
recorded by URV1-00 at the same base SHA.

---

## 13. Self-review findings and remediation

| Finding | Remediation |
| --- | --- |
| Early fixture asserted "truncated latest skipped" (fallback semantics) | Corrected to Spec §5.3: the last carrier part is authoritative and any validation failure yields `UNKNOWN`; re-ran 12/12 PASS |
| Risk of leaking conversation content from the real DB into the artifact | Only structural facts recorded (tables, columns, key names, counts, opaque id prefixes); no message/part text read into this document; SQLite opened `?mode=ro` only |
| `time_created` (spec term) vs `time.created` (wire type) naming delta | Reconciled explicitly in §4 with REAL_RUNTIME equality proof (0/704 mismatches) |
| Host runtime 1.15.13 vs compile-time plugin API 1.18.23 gap | Flagged NOT_PROVEN for hook invocation and pinned for URV1-09 (§10); no false REAL_RUNTIME label |
| `verify:release` side effect known from URV1-00 | Not run in this ticket |
| Scope drift risk | None; only read-only commands, one disposable `/tmp` fixture, and this document inside the worktree |

---

## 14. Architecture invariant counts

No runtime source was modified. Tree verified clean before and after the
evidence commit (`git status --porcelain` empty; only the evidence file is
added):

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

## 15. Git boundary / non-interference confirmation

- Only the evidence document
  `docs/reviews/URV1-01_WORKINTENT_CARRIER_PROBE.md` is added on branch
  `work/urv1-01-carrier`.
- No push, no merge, no PR, no default-branch action, no other worktree
  touched, no remote operation.
- No source/config/credential/provider/proxy/OpenCode/global mutation. The
  host SQLite store was opened read-only. The fixture lives in `/tmp` only.
- Deterministic locked install (`bun install --frozen-lockfile`) was the only
  write outside `/tmp`, and it changed no tracked file.

## 16. Candidate SHA note

As in URV1-00, the candidate SHA produced by committing this document is not
embedded here (self-referential); it is supplied in the
IMPLEMENTER_HANDOFF_PACKET returned with this ticket.
