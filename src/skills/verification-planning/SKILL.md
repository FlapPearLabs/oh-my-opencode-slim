---
name: verification-planning
description: Verification planning for non-trivial coding work. Use before implementing a feature, bug fix, refactor, cross-system change, or high-confidence behavior change that needs a credible project-specific evidence path.
---

# Verification Planning

Before changing a non-trivial system, build an **evidence path**: a
project-specific route from the claim being made to evidence that can establish,
limit, or refute it.

The purpose is not to select a familiar technique. The purpose is to decide how
this system can reveal the truth of this particular change.

## Quick start

1. **Frame the claim** — state the behavior that needs to become true and the conditions that could make a confident conclusion wrong.
2. **Design the evidence path** — derive possible paths from the system itself: controllable inputs, observable effects, state transitions, invariants. Generate alternatives before choosing.
3. **Set a verification budget** — distinct claims, one owner each, minimum non-duplicative evidence.
4. **Create a verification affordance when needed** — extend the evidence path with the smallest capability that makes relevant state controllable, observable, repeatable.
5. **Research when the path is unknown** — ask `@librarian` for focused research before committing.
6. **Make the path runnable** — prepare only the support needed to follow the evidence path reliably.
7. **Close the evidence path** — follow the planned path, interpret evidence against the original claim.

For detailed guidance on each step — when each is complete, what to watch for,
and worked examples — read `references/full-guide.md`.

## Scope

Use this skill proportionately. Small mechanical changes can follow ordinary
project checks directly. For larger multi-phase work, let this skill establish
the evidence path that later work follows.
