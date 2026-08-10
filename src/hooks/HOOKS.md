# Hooks Discovery Index

Lightweight menu for agent discovery. Read this first, then load specific hook files for implementation details.

## Core Hooks (exported from `index.ts`)

| Hook | Purpose |
|------|---------|
| `createApplyPatchHook` | Applies unified diff patches to files safely |
| `createAutoUpdateCheckerHook` | Checks for plugin updates on startup |
| `createCacheMonitorHook` | Monitors prompt cache hit/miss rates |
| `createDeepworkCommandHook` | Implements `/deepwork` command for multi-phase work |
| `createFilterAvailableSkillsHook` | Filters skills by relevance to current task |
| `createForegroundFallbackHook` | Manages model failover (primary → fallback) |
| `createJsonErrorRecoveryHook` | Recovers from malformed JSON in tool calls |
| `createLoopCommandHook` | Implements `/loop` command for iterative workflows |
| `createPhaseReminderHook` | Reminds orchestrator of phase gates in deepwork |
| `createPostFileToolNudgeHook` | Nudges agent after file tool usage |
| `createReflectCommandHook` | Implements `/reflect` for workflow learning |
| `createTaskSessionManagerHook` | Manages specialist task sessions |
| `SessionLifecycle` | Tracks session start/end, emits events |

## Cache Safety (critical for provider caches)

| Hook | Purpose |
|------|---------|
| `cache-safe-injection.ts` | Safe prompt injection preserving cache prefixes |
| `chat-headers.ts` | Request/response header manipulation |

## Utilities

| Hook | Purpose |
|------|---------|
| `command-hook-utils.ts` | Shared helpers for command hooks |
| `image-hook.ts` | Processes image attachments |
| `types.ts` | Shared type definitions |

## Harness / Observability (new in `omos/new-rules`)

| Hook | Purpose |
|------|---------|
| `observability.ts` | Event types + JSONL emitter for delegation, routing |

---

**Usage:** Read this file to discover available hooks → read specific `.ts` file for implementation.