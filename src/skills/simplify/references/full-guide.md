# Code Simplification — Full Guide

## Detailed Process

### Step 1: Understand Before Touching

Before changing or removing anything, understand why it exists:

- What is this code's responsibility?
- What calls it? What does it call?
- What are the edge cases and error paths?
- Are there tests that define expected behavior?
- Why might it have been written this way?

If you can't answer these, read more context first.

### Step 2: Look for Simplification Opportunities

Signals:
- Deep nesting
- Long functions with mixed responsibilities
- Nested ternaries
- Boolean flag arguments
- Repeated conditionals
- Generic or misleading names
- Duplicated logic
- Dead code
- Wrappers or abstractions that add no value

### Step 3: Apply Changes Incrementally

Make one simplification at a time:

1. Make the change
2. Use proportionate final-state verification to check preservation
3. Keep it only when evidence supports preservation

Separate refactoring from feature work whenever possible.

### Step 4: Verify the Result

After simplifying, confirm:
- Code is genuinely easier to understand
- Diff is clean and reviewable
- Project conventions still match
- No behavior, error handling, or side effects changed

## Detailed Principles

### 1. Preserve Behavior Exactly

Don't change what the code does — only how it expresses it. All inputs, outputs, side effects, error behavior, and edge cases must remain identical.

Before every change:
- Does this produce the same output for every input?
- Does this maintain the same error behavior?
- Does this preserve the same side effects and ordering?
- What proportionate final-state verification will reveal a behavior change?

### 2. Follow Project Conventions

Simplification means making code more consistent with the codebase, not imposing external preferences.

Before simplifying:
1. Read `AGENTS.md` / project conventions
2. Study how neighboring code handles similar patterns
3. Match the project's style for imports, naming, function style, error handling, type annotations

Simplification that breaks project consistency is churn, not simplification.

### 3. Prefer Clarity Over Cleverness

Explicit code is better than compact code when compact version requires mental pause:
- Replace nested ternaries with readable control flow
- Replace dense inline transforms with named intermediate steps when they clarify intent
- Keep helpful names even if they cost a few extra lines

### 4. Maintain Balance

Watch for over-simplification:
- Don't inline away names that carry meaning
- Don't merge unrelated logic into one larger function
- Don't remove abstractions that serve testability or extensibility
- Don't optimize for line count over comprehension

### 5. Scope to What Changed

Default to simplifying recently modified code. Avoid unrelated drive-by refactors unless explicitly asked.

## Final-State Verification

Use proportionate final-state verification plan for the final diff. Run checks required by repository and release instructions; add or repeat evidence only when changed scope or stated uncertainty warrants it.

## Guidance for This Repository

- Prefer straightforward TypeScript over clever compression
- Preserve existing runtime behavior, tests, and hooks
- Favor explicit names and smaller focused helpers when they improve readability
- Keep refactors tightly scoped to the task or review feedback
