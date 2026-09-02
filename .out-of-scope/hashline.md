# Hashline (content-hash line anchors for LLM edits)

**UPDATE (2026-09-02):** The Slim Unattended Reliability Program mission explicitly superseded this `wontfix` decision. Hashline is now implemented as an optional layer (`hashline_edit: true` in config) backed by the upstream `@oh-my-pi/hashline` library.

The original rationale is preserved below for historical context.

## Why this was originally out of scope

Hashline is a technique where each file read is tagged with a content-hash anchor, and edits must reference that tag to validate they are not acting on stale content.

Implementing it requires wrapping OpenCode's core `read` and `edit` tools to
inject and validate anchors and track file snapshots for stale-anchor recovery.
That is a deep, behavior-changing modification to the fundamental edit loop —
fragile to bolt onto a slim plugin that intentionally avoids reimplementing tool
plumbing. It belongs in OpenCode core itself or a dedicated standalone plugin,
not in oh-my-opencode-slim.

Token savings are real (reported ~61% fewer output tokens on Grok 4 Fast, ~8%
better on Gemini), but the integration cost and architectural fit put it
outside this project's scope.

## Prior requests

- #141 — "Discussion about hashline" (feature proposal / discussion; closed as wontfix, reversed in Unattended Reliability Program)
