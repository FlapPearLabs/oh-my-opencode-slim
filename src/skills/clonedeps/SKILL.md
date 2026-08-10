---
name: clonedeps
description: Clone important project dependency source code into an ignored local workspace so OpenCode can inspect library internals. Use when the user asks to clone dependencies, inspect dependency/source internals, understand SDK/framework behavior from source, debug library implementation details, or make core dependency repos locally readable. Do not use for ordinary API/docs questions where @librarian is enough.
---

# Clonedeps Skill

Clone dependency source repos into `.slim/clonedeps/repos/` so OpenCode can inspect library internals directly. Do not use for API/docs questions — `@librarian` handles those.

## When to Use

- User asks to clone dependencies or inspect dependency/source internals
- Understanding SDK/framework behavior from source
- Debugging library implementation details
- Making core dependency repos locally readable

## Workflow Overview

1. **Check existing state** — read `.slim/clonedeps.json`, reuse existing clones when possible
2. **Ask `@librarian` for clone plan** — dependency discovery and source resolution (see [full guide](references/full-guide.md) for the prompt)
3. **Verify and confirm** — `git ls-remote` refs, HTTPS-only, present plan to user, get confirmation before cloning
4. **Update ignore files** — add managed blocks to `.gitignore` and `.ignore`
5. **Clone manually** — safe git operations, no submodules, prefer shallow
6. **Write state** — update `.slim/clonedeps.json`
7. **Register in AGENTS.md** — add `## Cloned Dependency Source` section

## Key Rules

- This is a workflow skill, not a command wrapper — the orchestrator does the filesystem/git operations
- Keep to 3-5 core dependencies max — skip tiny utilities, transitive deps, dev-only tools
- Safe name: derive from repo owner/name, not package name (e.g. `opencode-ai__opencode`)
- Monorepos: clone once, point multiple manifest entries at different `packagePath` values
- Never run install/build/test scripts from cloned repos
- Do not add `.slim/clonedeps.json` to `.gitignore` — it's committed project metadata

## Cleanup

When asked to clean cloned dependencies, remove `.slim/clonedeps/repos/` and the managed marker blocks from `.gitignore`/`.ignore`. Ask before removing `.slim/clonedeps.json` or the AGENTS.md section.
