---
name: reflect
description: Review recent work, find repeated workflow patterns, and suggest reusable skills, agents, commands, config changes, or playbooks. Use when the user asks to learn from past sessions, improve recurring workflows, or identify what should be turned into reusable agent instructions.
---

# Reflect

Reflect is an orchestrator-only workflow for learning from repeated work. It
looks back over recent sessions, project notes, and existing agent assets, then
recommends the smallest useful improvement: a skill, custom agent, command,
configuration change, prompt rule, documentation playbook, or no change.

The goal is to identify real repeated friction and suggest practical improvements with evidence.

## When to Use

Use Reflect when the user asks to:

- run `/reflect` or `/reflect <focus>`;
- run `/reflect --sessions` for session archaeology;
- learn from recent sessions or repeated workflows;
- find work they keep doing manually;
- improve their oh-my-opencode-slim setup based on actual usage;
- review whether a recurring process should become a reusable playbook;
- turn repeated workflow friction into a safer future default.

Do not use Reflect for ordinary implementation work, one-off debugging, broad
architecture review, or speculative agent creation without workflow evidence.

## Quick Workflow

1. **Inventory existing assets** — check skills, agents, commands, prompts, config before proposing anything new
2. **Find repeated patterns** — same command sequence, same manual steps, same routing decision across sessions
3. **Score candidates** — frequency, cost, risk, stability, coverage
4. **Choose smallest useful form** — prompt rule > skill > command > custom agent
5. **Propose before changing** — present findings, get confirmation, then edit

For detailed guidance on session archaeology, per-session analysis, scoring rubrics, output formats, and guardrails, read `references/full-guide.md`.

## Trigger

```text
/reflect
/reflect release workflow and checks
/reflect --sessions
/reflect --sessions --last 100
```

## Core Contract

- Inspect existing assets before suggesting new ones
- Prefer recent, repeated, user-visible friction over isolated incidents
- Recommend the smallest useful form
- Treat "create nothing" as a successful result when evidence is weak
- Ask before changing prompts, skills, commands, agents, MCP access, or config
- Avoid duplicating existing assets
