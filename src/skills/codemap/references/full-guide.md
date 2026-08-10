# Codemap Skill — Full Guide

## Detailed Workflow

### Step 1: Check for Existing State

Check if `.slim/codemap.json` exists in repo root. If not, check for legacy `.slim/cartography.json`. If legacy exists, move it to `.slim/codemap.json`.

### Step 2: Initialize (if no state)

1. **Analyze repository structure** — list files, understand directories
2. **Infer patterns** for core code/config files ONLY:
   - Include: `src/**/*.ts`, `package.json`, etc.
   - Exclude (MANDATORY): tests (`**/*.test.ts`, `**/*.spec.ts`, `tests/**`), docs (`docs/**`, `*.md`), build artifacts (`dist/**`, `node_modules/**`)
3. **Run codemap.mjs init**:
```bash
node ~/.config/opencode/skills/codemap/scripts/codemap.mjs init \
  --root ./ \
  --include "src/**/*.ts" \
  --exclude "**/*.test.ts" --exclude "dist/**" --exclude "node_modules/**"
```
4. **Delegate to Fixer agents** — one per folder to write/update `codemap.md`

### Step 3: Detect Changes (if state exists)

1. **Run codemap.mjs changes**:
```bash
node ~/.config/opencode/skills/codemap/scripts/codemap.mjs changes --root ./
```
2. **Review output** — shows added/removed/modified files and affected folders
3. **Update only affected codemaps** — spawn one fixer per affected folder
4. **Save new state**:
```bash
node ~/.config/opencode/skills/codemap/scripts/codemap.mjs update --root ./
```

### Step 4: Finalize Root Atlas

1. **Map root assets** — document root-level files and project purpose
2. **Aggregate sub-maps** — extract Responsibility summary from each sub-map into a table
3. **Cross-reference** — include paths to sub-maps so agents can jump directly

### Step 5: Register in AGENTS.md

If `AGENTS.md` doesn't have `## Repository Map`, append:
```markdown
## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.
```

## Example Codemap

```markdown
# src/agents/

## Responsibility
Defines agent personalities and manages their configuration lifecycle.

## Design
Each agent is a prompt + permission set. Config system uses:
- Default prompts (orchestrator.ts, explorer.ts, etc.)
- User overrides from ~/.config/opencode/oh-my-opencode-slim.json
- Permission wildcards for skill/MCP access control

## Flow
1. Plugin loads → calls getAgentConfigs()
2. Reads user config preset
3. Merges defaults with overrides
4. Applies permission rules (wildcard expansion)
5. Returns agent configs to OpenCode

## Integration
- Consumed by: Main plugin (src/index.ts)
- Depends on: Config loader, skills registry
```

## Example Root Atlas

```markdown
# Repository Atlas: oh-my-opencode-slim

## Project Responsibility
A high-performance, low-latency agent orchestration plugin for OpenCode.

## System Entry Points
- `src/index.ts`: Plugin initialization
- `package.json`: Dependencies and build scripts
- `oh-my-opencode-slim.json`: User configuration

## Directory Map
| Directory | Responsibility | Map |
|-----------|---------------|-----|
| `src/agents/` | Agent personalities and model routing | [View](src/agents/codemap.md) |
| `src/config/` | Config loading pipeline | [View](src/config/codemap.md) |
```
