# Deepwork — Full Guide

## Detailed Core Contract

Required behavior:

- Before planning, inspect `.gitignore` and `.ignore`; add only missing entries (`.slim/deepwork/` to `.gitignore`, `!.slim/deepwork/` and `!.slim/deepwork/**` to `.ignore`)
- Keep OpenCode todos aligned with active deepwork phase
- Create and maintain `.slim/deepwork/<short-task-slug>.md`
- Save code/doc deliverables to project paths; reserve `.slim/deepwork/` for progress files only
- Write research findings into deepwork file when received and reconciled
- Draft plan before implementation
- Choose coherent phases from dependencies and delivery boundaries — do not split merely to reduce Oracle review scope
- Show user compact overview: phase titles, specialists, Oracle reviews with gate reasons
- Decide execution path per phase: parallel vs sequential, specialist assignments, lane splits
- After each phase, validate deepwork file, then ask `@oracle` to review before continuing
- Add confirmed research findings to deepwork file before Oracle reviews
- Batch actionable Oracle findings into bounded remediation passes; request follow-up only if remediation changes reviewed decision/risk
- When phase includes `@designer`, preserve designer intent across later phases
- Finish with final validation and concise summary

## Planned Phase Reviews

Oracle reviews are automatic gates between implementation phases. Decide phases from:
- Task dependencies
- Integration boundaries
- Meaningful delivery points

Record phase order, total review count, review after each phase, and short reason for each gate in deepwork file and compact user overview.

**Avoid micro-phases** created only to make reviews smaller. Larger tasks can have broader phases and broader reviews. Goal: sensible number of predictable review gates, not smallest possible scope. Never add extra Oracle review merely to re-confirm mechanical fixer change.

## Designer Handoff Guardrail

When a phase includes `@designer`, treat delivered UI/UX as accepted design intent for later phases. Record important design decisions in deepwork file before continuing.

After designer work:
- Preserve layout, rhythm, hierarchy, motion, spacing, color, affordances, responsiveness, and component feel
- Review and improve user-facing copy with grounded, normal wording — do not change visual structure or interaction intent
- Route follow-up visual, responsive, motion, hierarchy, polish, or component-feel changes back to `@designer`
- Use `@fixer` only for bounded mechanical follow-up that preserves design exactly (wiring, tests, type fixes, non-visual behavior changes)
- If design intent must change, record why in deepwork file before changing it

## Deepwork File Structure

```text
.slim/deepwork/<short-task-slug>.md
```

Do not follow a rigid template. Choose markdown structure that fits the work. Capture as applicable:

- Current goal and understanding
- Researched factual context from `@librarian` (avoid oracle redoing discovery)
- Plan drafts, Oracle review budget/gates, review notes
- Implementation phases and status
- Validation results
- Unresolved questions, blockers, follow-ups

Update after: major decisions, valuable specialist research, reviews, phase completions, validation results, scope changes.

When `@librarian` produces useful information, reconcile and record accepted findings so later planning and reviews share context instead of rediscovering it.

Do not put actual file contents — reference by path only.

## Scheduler Discipline

Use scheduler model throughout:

- Follow Orchestrator delegation rules
- Record task/session IDs and ownership boundaries
- Wait for hook-driven background completion before consuming results
- Avoid blocking Orchestrator lane while background jobs run — if no independent work remains, stop briefly and let completion event resume
- Do not advance to next phase while relevant jobs are running or terminal results are unreconciled

## Ignore File Setup

Before creating or cleaning lanes, ensure managed blocks exist:

`.gitignore`:
```gitignore
.slim/deepwork/
```

`.ignore`:
```gitignore
!.slim/deepwork/
!.slim/deepwork/**
```
