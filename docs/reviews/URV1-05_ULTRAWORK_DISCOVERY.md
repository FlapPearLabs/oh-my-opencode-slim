# URV1-05 UltraWork Discovery Evidence

## Decision

`NO_CODE_CHANGE / ALREADY_SATISFIED`

The exact inspected Slim tree already implements every deterministic policy row
required by URV1-05. Adding production code merely to preserve the Ticket's
provisional `CODE_CHANGE` identity would increase risk without changing an
observable result.

## Identity and boundaries

- Inspected Slim SHA: `2217db6790a630565a180933ac74e25735cea03c`
- Frozen Spec SHA: `16bb77f8209542a6bcc1ca11a48203867d8a3378`
- Frozen V3 graph SHA: `9bac2333d5a2963a05f39e130fffc587336096c9`
- Scope: bundled Skill registration, Orchestrator skill permissions, discovery
  filtering, profile orthogonality, and prompt-cache non-regression.
- No command rewrite, new Skill copy, profile-specific policy, scheduler,
  provider/account configuration, credential change, or production source/test
  change was made.

## Exact local implementation evidence

1. `src/cli/custom-skills-registry.ts:19-79` is the shared bundled Skill
   authority. Its existing `ultrawork` entry has
   `allowedAgents: ['orchestrator']` and points to the single
   `src/skills/ultrawork` payload. The same authority contains the required
   peer Skills `codemap`, `clonedeps`, `deepwork`,
   `verification-planning`, and `worktrees`.
2. `src/cli/skills.ts:35-91` derives `permission.skill` from that authority.
   Default Orchestrator policy starts with `*=allow` and also emits explicit
   bundled grants. An explicit list changes the fallback to `*=deny`, honors
   `*`, explicit inclusions, `!name` denies, and configured disabled Skills.
3. `src/hooks/filter-available-skills/index.ts:58-88` applies an exact-name
   rule first and the wildcard second. `src/hooks/filter-available-skills/index.ts:96-153`
   resolves the current agent and its configured Skill list, then filters the
   host's existing `<available_skills>` entries. It cannot synthesize a second
   Skill copy and adds no time-, profile-, or process-dependent text.
4. Existing regressions at `src/cli/skills.test.ts:4-53` prove default,
   explicit-list, and wildcard permission behavior. Existing regressions at
   `src/hooks/filter-available-skills/index.test.ts:329-475` prove default
   UltraWork retention and identical filtering across distinct model profiles,
   including deny-by-omission.

## Required discovery matrix

The exact production functions were exercised against a six-Skill host block.
The scratch harness was outside the repository and did not mutate the tree.

| Policy row | Required peer set | Observed result | Effective permission |
| --- | --- | --- | --- |
| default | all five peers + `ultrawork` | PASS | `ultrawork=allow`, `*=allow` |
| wildcard | all five peers + `ultrawork` | PASS | `ultrawork` unset, `*=allow` |
| explicit inclusion | all five peers + `ultrawork` | PASS | `ultrawork=allow`, `*=deny` |
| explicit omission | five peers, no `ultrawork` | PASS | `ultrawork` unset, `*=deny` |

The registry names observed by the same harness were:
`simplify,codemap,clonedeps,deepwork,verification-planning,reflect,oh-my-opencode-slim,worktrees,ultrawork`.

## Isolated host evidence

An isolated OpenCode `1.15.13` host used redirected `HOME`, `XDG_*`, config,
data, cache, log, and neutral workspace paths. No provider/model session ran.

- Native `GET /skill` discovered `ultrawork` and all five required peers from
  the copied normal config Skill directory.
- With the plugin loaded, resolved `GET /config` under the default
  `opencode-go/minimax-m3` profile reported
  `ultrawork=allow`, `*=allow`, `deepwork=allow`.
- With a valid isolated `antigravity` profile, resolved `GET /config` reported
  model `google/antigravity-gemini-3.1-pro` with the same
  `ultrawork=allow`, `*=allow`, `deepwork=allow` policy.
- With explicit Orchestrator Skills `['deepwork', 'worktrees']`, resolved
  `GET /config` reported `ultrawork` absent, `*=deny`, and the two named Skills
  allowed. This is the required deny-by-omission behavior.

The same endpoint check was attempted on an isolated exact OpenCode `1.18.23`
binary. The process listened successfully, but both bounded `/skill` requests
timed out during plugin instance bootstrap with zero response bytes. It was
terminated and is **not** counted as a pass. Separate package-host smoke already
proves this Slim package loads on `1.18.23`; that smoke does not prove Skill
prompt content.

### Evidence limit

The literal provider-bound `<available_skills>` content of a live
provider-backed session remains `NOT_PROVEN`. `/skill` proves native discovery
and `/config` proves resolved permissions, but neither is inflated into an
active model-prompt capture. This gap belongs in the final real-runtime matrix;
it is not evidence of a current Slim code defect and does not justify a
speculative permission rewrite.

## Deterministic validation

| Validation | Result |
| --- | --- |
| `bun test src/cli/skills.test.ts src/hooks/filter-available-skills/index.test.ts src/agents/index.test.ts` | `144 pass / 0 fail / 341 expect()` |
| Cache-safety properties, snapshots, and tripwire | `17 pass / 0 fail / 3 snapshots / 32 expect()` |
| `bun run typecheck` | exit 0 |
| Required four-row production-function matrix | 4/4 PASS |
| OpenCode `1.15.13` native `/skill` + resolved `/config` | PASS at discovery and permission surfaces |
| OpenCode `1.18.23` package load | PASS in existing isolated host smoke; endpoint/prompt capture not proven here |

## Why no implementation is justified

All required source-level policy outcomes already pass, including the safety
case that a user allowlist omitting `ultrawork` must hide it. Replacing or
augmenting this path would risk bypassing explicit policy, duplicating the
bundled Skill authority, or perturbing stable prompt bytes. The remaining
unproven fact is an acceptance-evidence fact, not a missing production
mechanism.

New runtime subsystem count: **0**.
