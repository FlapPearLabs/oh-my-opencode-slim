---
name: simplify
description: Simplifies code for clarity without changing behavior. Use for readability, maintainability, and complexity reduction after behavior is understood.
---

# Code Simplification

Simplify code by reducing complexity while preserving exact behavior. The goal is not fewer lines — it's code that is easier to read, understand, modify, and debug.

## When to Use

- After a feature is working and tests pass, but implementation feels heavier than needed
- During code review when readability or complexity issues are flagged
- When you encounter deeply nested logic, long functions, or unclear names
- When consolidating related logic scattered across files

**When NOT to use:**

- Code is already clean — don't simplify for the sake of it
- You don't understand what the code does yet — comprehend first
- The code is performance-critical and "simpler" version would be measurably slower
- You're about to rewrite the module entirely

## Five Principles

1. **Preserve behavior exactly** — same outputs, errors, side effects, edge cases
2. **Follow project conventions** — match codebase style, not external preferences
3. **Prefer clarity over cleverness** — explicit > compact when compact requires mental pause
4. **Maintain balance** — don't inline meaningful names, merge unrelated logic, or remove testability abstractions
5. **Scope to what changed** — avoid unrelated drive-by refactors

## Key Rules

- Understand before touching — know responsibility, callers, callees, edge cases, tests
- One simplification at a time — make change, verify, keep only when evidence supports
- Verify the result — code genuinely easier to understand, diff clean, conventions match

For detailed process, simplification signals, and verification guidance, read [full guide](references/full-guide.md).
