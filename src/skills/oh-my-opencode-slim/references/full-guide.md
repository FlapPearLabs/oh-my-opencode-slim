# oh-my-opencode-slim Configuration — Full Guide

## Config Shapes

### Tune a built-in agent model/skills/MCPs

Edit the active preset under `presets.<preset>.<agent>`:

```jsonc
{
  "preset": "openai",
  "presets": {
    "openai": {
      "orchestrator": {
        "model": "openai/gpt-5.6-terra",
        "variant": "high",
        "skills": ["*"],
        "mcps": ["*", "!context7"]
      },
      "librarian": {
        "model": "openai/gpt-5.6-luna",
        "variant": "low",
        "skills": [],
        "mcps": ["context7", "gh_grep"]
      }
    }
  }
}
```

### Append instructions to a built-in prompt

Create `~/.config/opencode/oh-my-opencode-slim/orchestrator_append.md`:

```markdown
## Local Orchestrator Preference

- Before spawning parallel writer agents, identify non-overlapping file ownership.
- If file ownership overlaps, ask the user or serialize the work.
```

Preset-specific: `~/.config/opencode/oh-my-opencode-slim/{preset}/orchestrator_append.md`

### Replace a built-in prompt entirely

Create `~/.config/opencode/oh-my-opencode-slim/orchestrator.md`. Use rarely — must restate all essential plugin behavior.

## Prompt Override Lookup Order

1. If a `preset` is active, check `~/.config/opencode/oh-my-opencode-slim/{preset}/` first.
2. Fall back to `~/.config/opencode/oh-my-opencode-slim/`.
3. If both `{agent}.md` and `{agent}_append.md` exist, replacement loads first, append adds after.
4. If no prompt files exist, built-in prompt from plugin package is used.

## Schema Boundary

- Built-in agents can set models, variants, skills, MCPs, options, and display names in config.
- Built-in agent `prompt` and `orchestratorPrompt` fields are **not** supported in JSON config; use markdown prompt override files instead.
- Unknown keys under top-level `agents` are custom agents. Custom agents may use `prompt` and `orchestratorPrompt` directly in config.

## Custom Agent Pattern

```jsonc
{
  "agents": {
    "api-reviewer": {
      "model": "openai/gpt-5.6",
      "variant": "high",
      "prompt": "You review API design, compatibility, error semantics, and migration risk. Return concise findings with file references.",
      "orchestratorPrompt": "Delegate to @api-reviewer for API contract changes, public SDK changes, backwards-compatibility questions, or migration-risk review. Do not use it for routine implementation.",
      "skills": [],
      "mcps": []
    }
  }
}
```

Good custom agents have:
- A specific job
- Clear trigger conditions in `orchestratorPrompt`
- Explicit non-use conditions
- Only the skills and MCPs they actually need
- A model appropriate to the task's judgment/cost needs

Avoid duplicating existing specialists:
- Codebase scouting → `explorer`
- External docs/research → `librarian`
- Architecture/debugging/review → `oracle`
- UI/UX polish → `designer`
- Scoped mechanical implementation → `fixer`

## Prompt Tuning Pattern

Good reasons to tune a prompt:
- Orchestrator repeatedly delegates too much or too little
- Specialist repeatedly misses a project-specific convention
- Team has a recurring review checklist or deployment rule

Poor reasons:
- A one-off task failed once
- The problem can be solved by normal instruction in this session
- The change would make the agent worse for general use

When suggesting: "I noticed this is recurring. I can add a small rule to <agent/config path> so future runs handle it automatically. Want me to make that config change?"

## Configuration Workflow

1. **Inspect current setup** — read existing config, identify active preset and agent blocks
2. **Decide smallest useful change** — model tuning, prompt tuning, custom agent, or skill/MCP permission
3. **Ask for confirmation** — show concise proposal with target file path
4. **Apply carefully** — preserve unrelated settings, keep agent/skill/MCP names exact
5. **Validate** — ensure file remains parseable
6. **Explain activation** — immediate or next restart

## Common Customizations

- **Switch presets**: choose which generated or custom preset is active
- **Tune models**: assign different models/variants per agent
- **Limit costs**: use cheaper models for `explorer`, `librarian`, `fixer`
- **Improve quality**: use stronger models for `orchestrator`, `oracle`, `designer`
- **Control skills**: set `skills` per agent with `['*']`, explicit names, or exclusions
- **Control MCPs**: set `mcps` per agent with same allow/exclude style
- **Enable optional agents**: remove from `disabled_agents`, configure appropriate model
- **Add custom agents**: define focused specialists under `agents.<name>`
- **Guide delegation**: add `orchestratorPrompt` for custom agents
