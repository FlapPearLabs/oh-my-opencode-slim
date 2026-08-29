import { statSync } from 'node:fs';
import path from 'node:path';

import type { PluginInput } from '@opencode-ai/plugin';

import { log } from '../../utils/logger';

interface ToolExecuteBeforeInput {
  tool: string;
}

interface ToolExecuteBeforeOutput {
  args?: {
    path?: unknown;
    [key: string]: unknown;
  };
}

export function createSearchPathGuardHook(ctx: PluginInput) {
  return {
    'tool.execute.before': async (
      input: ToolExecuteBeforeInput,
      output: ToolExecuteBeforeOutput,
    ): Promise<void> => {
      if (input.tool !== 'grep' && input.tool !== 'glob') {
        return;
      }

      const args = output.args;
      if (!args || typeof args !== 'object') {
        return;
      }

      // Mirror the host exactly: the path is used as-is. The host never
      // trims it and has no runtime handling for the literal strings
      // 'undefined'/'null' (upstream resolves them as ordinary relative
      // paths; they only appear as schema-description guidance). An empty
      // string resolves to the instance directory itself, so there is
      // nothing to block either.
      const raw = args.path;
      if (typeof raw !== 'string' || raw === '') {
        return;
      }

      // Mirror the host's resolution rule exactly: absolute paths pass
      // through, relative paths resolve against the instance directory.
      // Without a resolution base, never block (conservative fallback).
      const resolved = path.isAbsolute(raw)
        ? raw
        : ctx.directory
          ? path.join(ctx.directory, raw)
          : null;
      if (resolved === null) {
        return;
      }

      let missing = false;
      try {
        statSync(resolved);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          // Genuine missing path (broken symlinks included, matching the
          // pending upstream fix). Report it as such.
          missing = true;
        } else {
          // Any other stat failure (permissions, I/O, ENOTDIR) keeps its
          // original meaning: pass through and never misdiagnose.
          log('search-path-guard passed on stat error', {
            tool: input.tool,
            path: raw,
            resolved,
            code,
          });
        }
      }

      if (missing) {
        log('search-path-guard blocked', {
          tool: input.tool,
          path: raw,
          resolved,
        });
        throw new Error(
          `Search path does not exist: ${resolved} (from "${raw}"). ` +
            `The ${input.tool} search was blocked before ripgrep ran. ` +
            'Verify the target path, or list its parent directory to find ' +
            'the correct location.',
        );
      }
    },
  };
}
