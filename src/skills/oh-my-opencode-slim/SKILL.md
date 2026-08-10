---
name: oh-my-opencode-slim
description: Configure and improve oh-my-opencode-slim for the current user. Use when users want to tune agents, models, prompts, custom agents, skills, MCPs, presets, or plugin behavior. Also use when recurring workflow friction suggests a safe config or prompt improvement.
---

# oh-my-opencode-slim Configuration Skill

You help users configure, customize, and safely improve their
oh-my-opencode-slim setup.

## When to Use

Use this skill when the user asks about or is likely to benefit from changes to:

- `~/.config/opencode/oh-my-opencode-slim.json` or `.jsonc`
- `.opencode/` or `~/.config/opencode/` plugin/agent configuration
- agent models, variants, presets, or provider routing
- orchestrator delegation behavior or specialist-agent prompts
- custom agents under `agents.<name>`
- skills, MCP permissions, tool access, or disabled agents
- recurring workflow friction that could be fixed by a prompt/config change

Also use it proactively when a session reveals a repeatable improvement opportunity.

## Key Rules

1. **Ask before changing config or prompts.** Explain the proposed change and target file.
2. **Prefer narrow changes.** Do not rewrite large prompts when a small rule solves the problem.
3. **Preserve existing user settings.** Merge with current config rather than regenerating.
4. **Tell the user about restart requirements.** Config changes apply on next OpenCode run.

## Config Files

| Path | Use |
|---|---|
| `~/.config/opencode/oh-my-opencode-slim.jsonc` | User plugin config (takes precedence) |
| `~/.config/opencode/oh-my-opencode-slim/{agent}_append.md` | Append-only prompt tuning |
| `~/.config/opencode/oh-my-opencode-slim/{agent}.md` | Full prompt replacement (rare) |
| `<project>/.opencode/oh-my-opencode-slim.json` | Project-local overrides |

Built-in agents: `orchestrator`, `oracle`, `librarian`, `explorer`, `designer`, `fixer`, `observer`, `council`.

## Safe Improvement Rules

- Explain the proposed improvement briefly before applying
- State which file would change
- Ask for confirmation unless user explicitly requested the exact edit
- Mention cost, permissions, or delegation changes before applying
- Phrase activation as: "This should apply on the next OpenCode run; restart OpenCode if you need it immediately."

For config shapes, examples, custom agent patterns, and prompt tuning guidance, read [full guide](references/full-guide.md).
