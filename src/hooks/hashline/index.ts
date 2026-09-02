/**
 * Hashline tool-hook integration for oh-my-opencode-slim.
 *
 * When `hashline_edit: true` is set in plugin config:
 *
 * 1. `tool.execute.after` for `read` — annotates file content with hash-tagged
 *    line numbers (`LINE:TEXT` format with `[PATH#TAG]` header) and records a
 *    snapshot so the tag can later be validated.
 *
 * 2. `tool.execute.before` for `edit` — when the edit args contain a hashline
 *    patch (detected by `[PATH#TAG]` header), validates the tag, applies via
 *    the Patcher, and redirects the tool args so the native `edit` tool
 *    receives the already-applied result (or is blocked with a reread error).
 *
 * 3. Fallback — when hashline is disabled or a tool call contains no hashline
 *    content, all hooks return immediately so existing behavior is unchanged.
 *
 * Integration principles (from `.out-of-scope/hashline.md` reversal rationale):
 * - Optional behind `hashline_edit: true`; disabled by default.
 * - Narrowest possible seam: only read/edit tools are touched.
 * - Does not change code/terminal output.
 * - Does not break existing apply-patch rescue path (LCS/prefix-suffix).
 * - Error messages tell the agent: reread → reanchor → retry.
 */

import * as nodePath from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';
import {
  computeFileHash,
  formatHashlineHeader,
  formatNumberedLines,
  InMemorySnapshotStore,
  NodeFilesystem,
  Patch,
  Patcher,
} from '@oh-my-pi/hashline';
import { log } from '../../utils/logger';
import { globalSnapshotStore } from './snapshot-store';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Detect whether a string starts with a hashline section header `[PATH#TAG]`.
 * We check for the specific 4-hex tag pattern to avoid false positives on
 * markdown reference links or other `[...]` content.
 */
const HASHLINE_HEADER_RE = /^\[.+#[0-9A-F]{4}\]/m;

function isHashlinePatch(text: string): boolean {
  return HASHLINE_HEADER_RE.test(text);
}

function resolveAbsolute(root: string, filePath: string): string {
  if (nodePath.isAbsolute(filePath)) return filePath;
  return nodePath.resolve(root, filePath);
}

// ── Hook factory ───────────────────────────────────────────────────────────

export interface HashlineHookOptions {
  /** Whether hashline integration is active. When false all hooks are no-ops. */
  enabled: boolean;
  /** Workspace root used to resolve relative file paths. */
  root: string;
}

/**
 * Create the hashline tool hooks.
 *
 * The returned object exposes `toolExecuteAfter` (for read output annotation)
 * and `toolExecuteBefore` (for edit validation/application). Both are no-ops
 * when `enabled` is false.
 */
export function createHashlineHook(options: HashlineHookOptions) {
  const { enabled, root } = options;

  // One disk-backed FS per hook instance, rooted at the workspace directory.
  const diskFs = new NodeFilesystem();
  const snapshots = globalSnapshotStore;

  const patcher = new Patcher({ fs: diskFs, snapshots, enforceSeenLines: false });

  /**
   * tool.execute.after handler for the `read` tool.
   *
   * Rewrites the tool output to add `[PATH#TAG]\nLINE:TEXT` prefixed content
   * and records a snapshot so later patch validation can resolve the tag.
   */
  async function toolExecuteAfter(
    input: { tool: string; directory?: string },
    output: { content?: unknown },
  ): Promise<void> {
    if (!enabled) return;
    if (input.tool !== 'read') return;

    // output.content may be an array of content parts or a plain string.
    const parts = Array.isArray(output.content)
      ? output.content
      : typeof output.content === 'string'
        ? [{ type: 'text', text: output.content }]
        : [];

    let modified = false;
    const nextParts: unknown[] = [];

    for (const part of parts) {
      if (
        typeof part !== 'object' ||
        part === null ||
        (part as Record<string, unknown>).type !== 'text'
      ) {
        nextParts.push(part);
        continue;
      }

      const rawText = (part as { text?: unknown }).text;
      if (typeof rawText !== 'string') {
        nextParts.push(part);
        continue;
      }

      // Attempt to extract path+content from the text.
      // read tool output is typically: "File: <path>\n<content>"
      // or just plain file content when path is known from args.
      // We handle both shapes.
      const filePath = extractReadPath(rawText, input, root);
      if (!filePath) {
        nextParts.push(part);
        continue;
      }

      try {
        const content = await diskFs.readText(filePath);
        const tag = snapshots.record(filePath, content);
        const header = formatHashlineHeader(
          nodePath.relative(root, filePath),
          tag,
        );
        const numbered = formatNumberedLines(content);
        const annotated = `${header}\n${numbered}`;

        // Prepend the hashline header+numbered block to the read output.
        nextParts.push({
          ...(part as object),
          text: annotated + '\n\n' + rawText,
        });
        modified = true;
        log('hashline read annotated', {
          path: filePath,
          tag,
          lines: content.split('\n').length,
        });
      } catch (err) {
        // Read failed (e.g. path not resolvable) — leave output unchanged.
        nextParts.push(part);
        log('hashline read annotation skipped', {
          path: filePath,
          reason: String(err),
        });
      }
    }

    if (modified) {
      (output as Record<string, unknown>).content = nextParts;
    }
  }

  /**
   * tool.execute.before handler for the `edit` tool.
   *
   * When the tool input args contain a hashline patch (detected by header),
   * validates the snapshot tag and applies the patch via Patcher.
   * On mismatch: throws a structured error telling the agent to reread.
   * On success: converts the output to a no-op (the write already happened).
   */
  async function toolExecuteBefore(
    input: {
      tool: string;
      directory?: string;
    },
    output: {
      args?: Record<string, unknown>;
      error?: string;
    },
  ): Promise<void> {
    if (!enabled) return;
    if (input.tool !== 'edit' && input.tool !== 'apply_patch') return;

    const args = output.args;
    if (!args) return;

    // For `edit` tool: content is in args.new_content or args.content
    // For `apply_patch` tool: patch text is in args.patchText
    const patchText =
      typeof args.patchText === 'string'
        ? args.patchText
        : typeof args.new_content === 'string'
          ? args.new_content
          : null;

    if (!patchText || !isHashlinePatch(patchText)) return;

    const dir = input.directory ?? root;

    try {
      const patch = Patch.parse(patchText, { cwd: dir });
      const results = await patcher.apply(patch);

      log('hashline edit applied', {
        sections: results.sections.length,
        ops: results.sections.map((s) => s.op),
      });

      // Redirect tool to a no-content write (patch already applied).
      // We signal success by clearing patchText and setting a success marker.
      if (args.patchText !== undefined) {
        output.args = { ...args, patchText: '', _hashlineApplied: true };
      } else {
        // For `edit` tool: we've already written the file; redirect to no-op.
        // We mark this so the native edit doesn't re-apply.
        output.args = { ...args, new_content: '', _hashlineApplied: true };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isMismatch =
        message.includes('MismatchError') ||
        message.includes('snapshot') ||
        message.includes('stale') ||
        message.includes('tag');

      const guidance = isMismatch
        ? `Hashline tag mismatch — the file changed since your last read. Re-read the file to get a fresh tag, then reanchor your edit.\n\nOriginal error: ${message}`
        : `Hashline patch failed: ${message}\n\nIf the file was modified concurrently, re-read it to get a fresh tag and retry your edit.`;

      log('hashline edit rejected', { reason: message, isMismatch });

      // Throw so OpenCode surfaces this as a tool error to the agent.
      throw new Error(guidance);
    }
  }

  return { toolExecuteAfter, toolExecuteBefore };
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Attempt to extract a resolvable file path from a read tool output or input.
 * Returns null when no path can be reliably determined.
 */
function extractReadPath(
  text: string,
  input: { tool: string; directory?: string; [key: string]: unknown },
  root: string,
): string | null {
  // Common read output prefix: "File: <path>\n" or "<path>:\n"
  const fileMatch = text.match(/^(?:File|Path):\s*(.+?)(?:\n|$)/);
  if (fileMatch?.[1]) {
    const candidate = resolveAbsolute(input.directory ?? root, fileMatch[1].trim());
    return candidate;
  }

  // If input contains a path argument (from the tool call), use it.
  const inputPath = (input as Record<string, unknown>).path;
  if (typeof inputPath === 'string' && inputPath.trim()) {
    return resolveAbsolute(input.directory ?? root, inputPath.trim());
  }

  return null;
}
