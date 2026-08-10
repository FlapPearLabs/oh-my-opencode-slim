---
name: worktrees
description: Manage Git worktrees as OMO safe isolated coding lanes for complex, risky, or parallel work.
---

# Worktrees Orchestration Protocol

Orchestrator-only protocol for managing Git worktrees as isolated coding lanes. Gives the Orchestrator a consistent OMO workflow for parallel agents, risky experiments, integration review, and cleanup.

## Core Contract

**Orchestrator owns everything:** lane planning, branch/path selection, file ownership, delegation, diff validation, integration, cleanup. Other specialists (`@fixer`, `@designer`) can work inside a lane but don't own it.

All worktrees live under `.slim/worktrees/<slug>/` — never as sibling directories of the main repo.

## Safety Checklist (Pre-Flight)

Before any Git mutation:
1. Confirm inside a Git repo, check current branch/base branch/dirty state
2. `git worktree list` — avoid path or branch conflicts
3. Branch name (e.g. `omos/<slug>`) must not exist locally or on remote
4. `.slim/worktrees/` must be in `.gitignore`

**Mandatory user confirmation** for: `git worktree add`/`remove`, branch create/delete/rename, merges/rebases/cherry-picks, `git prune`, destructive commands (`git reset --hard`, `git clean`, `git push --force`).

## Workflow (4 Phases)

1. **Planning & Setup** — slug, branch name, confirm with user, ensure ignore blocks, create worktree, register in `.slim/worktrees.json`
2. **Execution & Delegation** — all sub-agents run with working dir set to the worktree path, track file ownership per lane, commit only when asked
3. **Integration & Validation** — verification plan on changed behavior, show diff vs integration base, get user confirmation, perform approved merge/cherry-pick
4. **Cleanup & Pruning** — ensure changes merged/archived, confirm no uncommitted changes, get user approval, `git worktree remove`, update manifest

See [full guide](references/full-guide.md) for the `.gitignore`/`.ignore` blocks, state tracking manifest schema, and when-to-use/do-not-use guidance.

## Ignore File Setup

Before creating or cleaning lanes, ensure managed blocks exist in `.gitignore` and `.ignore` (see [full guide](references/full-guide.md) for exact blocks).
