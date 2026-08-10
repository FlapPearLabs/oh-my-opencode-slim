---
name: deepwork
description: High-cost orchestrator workflow for large, high-risk, multi-phase coding efforts with meaningful dependencies and review gates. Do not activate for routine multi-file changes.
---

# Deepwork

Deepwork is an orchestrator workflow for heavy coding sessions. Use it only
when the work is clearly large or high-risk: multiple dependent phases,
cross-cutting architectural change, unsafe-to-partially-ship migration, or
sustained coordination across several specialist lanes.

Do not infer Deepwork merely because a task touches multiple files. Do not use
it for trivial edits, quick docs changes, simple bug fixes, or routine bounded
features.

## Core Contract

When deepwork is active, the orchestrator must manage the work as a scheduler,
not as the default implementation worker.

Required behavior:

- Create and maintain a local markdown progress file under `.slim/deepwork/`
- Draft a plan before implementation
- Create a phased implementation/delegation plan
- Before dispatch, show user a compact overview (phase titles, specialists, Oracle reviews)
- After each phase, validate and update the deepwork file, then ask `@oracle` to review
- Triage and batch Oracle findings into bounded remediation passes
- Finish with final validation and concise summary

## Key Rules

- **Exclude `.slim/deepwork/` from git** — add `.slim/deepwork/` to `.gitignore` and `!.slim/deepwork/**` to `.ignore`
- **Oracle reviews are automatic gates** between implementation phases
- **Preserve designer intent** — when `@designer` delivers UI/UX, treat it as accepted for later phases
- **Use `@fixer` only for mechanical follow-up** that preserves design exactly
- **Do not advance phases while jobs are running** or terminal results are unreconciled

## Deepwork File

Create `.slim/deepwork/<short-task-slug>.md` with:
- Current goal and understanding
- Researched context from `@librarian`
- Plan drafts, Oracle review gates, review notes
- Implementation phases and status
- Validation results, blockers, follow-ups

Update after major decisions, specialist research, reviews, phase completions, and scope changes.

For detailed phase reviews, designer handoff guardrails, and scheduler discipline, read [full guide](references/full-guide.md).
