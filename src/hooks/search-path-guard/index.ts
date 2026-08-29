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

// Upstream's glob tool treats the literal strings 'undefined'/'null' in the
// path argument as absent. Mirror that so the guard never blocks a call the
// host would have run unscoped.
const ABSENT_PATH_LITERALS = new Set(['undefined', 'null']);

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

      const raw = args.path;
      if (typeof raw !== 'string') {
        return;
      }
      const candidate = raw.trim();
      if (candidate.length === 0 || ABSENT_PATH_LITERALS.has(candidate)) {
        return;
      }

      // Mirror the host's resolution rule exactly: absolute paths pass
      // through, relative paths resolve against the instance directory.
      // Without a resolution base, never block (conservative fallback).
      const resolved = path.isAbsolute(candidate)
        ? candidate
        : ctx.directory
          ? path.join(ctx.directory, candidate)
          : null;
      if (resolved === null) {
        return;
      }

      let exists = true;
      try {
        statSync(resolved);
      } catch {
        exists = false;
      }

      if (!exists) {
        log('search-path-guard blocked', {
          tool: input.tool,
          path: candidate,
          resolved,
        });
        throw new Error(
          `Search path does not exist: ${resolved} (from "${candidate}"). ` +
            `The ${input.tool} search was blocked before ripgrep ran. ` +
            'Verify the target path, or list its parent directory to find ' +
            'the correct location.',
        );
      }
    },
  };
}
