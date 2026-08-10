# Agent Coding Guidelines

## Quick Reference

| Command | Description |
|---------|-------------|
| `bun run build` | Build TypeScript to `dist/` |
| `bun run typecheck` | Type check without emitting |
| `bun test` | Run all tests |
| `bun run check:ci` | Lint + format check (CI mode, no auto-fix) |
| `bun run dev` | Build and run with OpenCode |

## Gotchas

### Prompt Cache Safety
Provider prompt caches are exact byte-prefix matches. Any byte change earlier in the payload invalidates everything after it. Rules:
- Inject content only through `src/hooks/cache-safe-injection.ts`
- Never mutate or reorder earlier messages
- Keep system prompts and tool sets frozen for session lifetime
- Tests: `src/hooks/cache-safety.property.test.ts`, `src/hooks/cache-payload.snapshot.test.ts`

### Pre-Push Review
Before pushing, review for: duplicate code, race conditions, logic errors, and cache safety violations (prompt-prefix rewrites, volatile content outside trailing zone).

### Log Files
- OpenCode: `~/.local/share/opencode/log/`
- Plugin: `~/.local/share/opencode/log/oh-my-opencode-slim.<timestamp>.log`

### Cloned Dependencies
Read-only source at `.slim/clonedeps/repos/` — do not edit.

### Triage
Issues tracked on GitHub (`alvinunreal/oh-my-opencode-slim`). Labels: `ready-for-agent` → `good-to-code`, `needs-triage` = unlabeled. See `docs/agents/triage-labels.md`.

### Release
Follow `docs/release.md` for plugin/Companion releases.
