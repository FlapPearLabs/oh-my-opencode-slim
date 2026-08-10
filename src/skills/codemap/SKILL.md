---
name: codemap
description: Generate comprehensive hierarchical codemaps for UNFAMILIAR repositories. Expensive operation - only use when explicitly asked for codebase documentation or initial repository mapping
---

# Codemap Skill

You help users understand and map repositories by creating hierarchical codemaps.

## When to Use

- User asks to understand/map a repository
- User wants codebase documentation
- Starting work on an unfamiliar codebase

## Workflow Overview

1. **Check existing state** — look for `.slim/codemap.json`; if missing, check for legacy `.slim/cartography.json`
2. **Initialize** (if no state) — analyze structure, infer patterns, run `codemap.mjs init`
3. **Detect changes** (if state exists) — run `codemap.mjs changes`, update only affected codemaps
4. **Finalize root atlas** — aggregate sub-maps into root `codemap.md`
5. **Register in AGENTS.md** — add `## Repository Map` section (idempotent)

## Key Rules

- **Exclude tests, docs, translations** from codemaps (mandatory)
- **Respect `.gitignore`** automatically
- **One fixer per folder** for writing codemap.md files
- **Root atlas** is the master entry point — must contain directory map with links to sub-maps
- **Idempotent registration** — repeated runs detect existing `## Repository Map` section

## Codemap Content

Each `codemap.md` documents:
- **Responsibility** — specific role of the directory
- **Design Patterns** — named patterns used (Observer, Factory, etc.)
- **Data & Control Flow** — how data enters and leaves the module
- **Integration Points** — dependencies and consumer modules

For detailed workflow steps, scripts, and examples, read [full guide](references/full-guide.md).
