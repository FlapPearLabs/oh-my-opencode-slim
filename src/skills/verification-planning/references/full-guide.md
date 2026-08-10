# Verification Planning — Full Guide

## 1. Frame the claim

State the behavior that needs to become true and the conditions that could make
a confident conclusion wrong.

Consider what must change, what must remain true, where the behavior crosses a
boundary, and which failure would matter most.

**Complete when:** the claim, its meaningful uncertainty, and its important
failure modes are concrete enough to investigate.

### What to watch for
- Don't frame the claim as "implement X" — frame it as "after this change, Y is true when Z."
- If you can't name the failure mode, you don't understand the claim well enough.
- Cross-system claims need boundary conditions: "works when service A is up, degrades gracefully when A is down."

### Worked example
**Bad claim:** "Add caching to the API."
**Good claim:** "After this change, repeated identical API calls within 60s return the cached response without hitting the upstream service. Cache invalidation on write ensures stale data is never served for more than 60s after a mutation."

---

## 2. Design the evidence path

Derive possible evidence paths from the system itself: its controllable inputs,
observable effects, state transitions, invariants, boundaries, artifacts, and
ability to repeat or reverse a scenario.

Generate alternatives before choosing. Prefer the path that produces a
trustworthy conclusion with proportionate cost, safety, and effort.

**Complete when:** there is a preferred path, its limitations are understood,
and a weaker or stronger alternative is available if circumstances change.

### Evidence path types (cheapest first)
1. **Static analysis** — type checker, linter, AST grep. No runtime needed.
2. **Unit test** — isolated function, deterministic input/output.
3. **Integration test** — real dependencies, controlled state.
4. **Manual inspection** — read the output, check the artifact.
5. **Exploratory test** — poke it, see what breaks.
6. **Production monitoring** — observe real behavior over time.

### What to watch for
- Don't skip to integration tests when a type change would catch the bug.
- Don't use manual inspection when an automated assertion would catch it.
- If the evidence path requires setup that takes longer than the change itself, reconsider.

---

## 3. Set a verification budget

At the final state, state the distinct claims, assign one owner to establish or
refute each, and choose the minimum non-duplicative evidence that covers the
claims and important boundaries.

Reuse evidence only while its relevant code, inputs, environment, and state
remain valid. Required repository and release checks still apply; broaden or
repeat verification only when a stated condition justifies it.

### Budget template
```
Claim 1: [description]
  Owner: [agent or person]
  Evidence: [test name, manual check, etc.]
  Boundary: [what could go wrong at the edges]

Claim 2: [description]
  Owner: [agent or person]
  Evidence: [test name, manual check, etc.]
  Boundary: [what could go wrong at the edges]
```

### What to watch for
- If two claims share the same evidence, note it — don't count it twice.
- If a claim has no feasible evidence path, escalate or defer the change.

---

## 4. Create a verification affordance when needed

When the existing system leaves the decisive truth too indirect or ambiguous,
extend the evidence path with a **verification affordance**: the smallest
capability that makes the relevant state controllable, observable, repeatable,
and diagnosable for an agent.

Ask what capability would let an agent establish the claim directly, repeat the
scenario from a known state, and explain a failure without inference. Prefer an
affordance that strengthens directness, determinism, agent-legibility,
isolation, resetability, or future reuse.

Treat the affordance as part of the evidence path, not an automatic product
feature. Decide deliberately whether it is temporary or durable before building
it.

**Complete when:** the chosen path can establish the claim directly enough for
its stakes, and any needed affordance has a defined lifecycle.

### Common affordances
- Test fixtures that set up known state
- Seed scripts that populate a database
- Snapshot/diff utilities that capture state changes
- Diagnostic endpoints that expose internal state
- Reversible operations with explicit rollback

---

## 5. Research when the path is unknown

When the right evidence path depends on an unfamiliar dependency, framework,
external service, or rapidly changing capability, ask `@librarian` for focused
research before committing to an approach.

Ask for official or project-specific facilities, constraints, and trade-offs
that affect this exact verification problem. Use existing project evidence
directly when it already resolves the choice.

**Complete when:** the chosen path rests on known capabilities and real
constraints rather than assumption.

---

## 6. Make the path runnable

Prepare only the support needed to follow the evidence path reliably. Keep the
support narrow, repeatable, and safe to inspect.

Decide whether that support has recurring value or exists only to resolve the
current uncertainty. Retain durable value deliberately; remove temporary
support once it has served its purpose.

Ask before introducing dependencies, persistent diagnostic surfaces, or
structural changes whose sole purpose is evidence gathering.

**Complete when:** the path can be followed without guessing about setup,
state, or interpretation.

### What to watch for
- Test helpers that outlive their purpose become maintenance burden.
- If a test setup requires more code than the feature itself, simplify.
- Prefer project-native test frameworks over custom harnesses.

---

## 7. Close the evidence path

After implementation, follow the planned path and interpret the resulting
evidence against the original claim.

Report whether the claim was established, limited, or refuted; distinguish
known facts from remaining uncertainty.

**Complete when:** a future reader can see what supports the conclusion and
what remains outside its reach.

### Report format
```
Claim: [original claim]
Evidence: [what was observed]
Result: established / limited / refuted
Remaining uncertainty: [what we still don't know]
```
