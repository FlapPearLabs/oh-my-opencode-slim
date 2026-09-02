import * as path from 'node:path';
import { getGlobalSnapshotStore } from './snapshot-store';
import { log } from '../../utils/logger';

export interface HashlineReadHookOptions {
  enabled: boolean;
  root: string;
}

export interface ToolExecuteAfterInput {
  tool: string;
  sessionID?: string;
  callID?: string;
  args?: any;
  directory?: string;
}

export interface ToolExecuteAfterOutput {
  title?: string;
  output: unknown;
  metadata?: unknown;
}

/**
 * tool.execute.after hook for read tool.
 * Annotates read tool output with [path#TAG] header and LINE:CONTENT lines,
 * and records snapshot in SnapshotStore for subsequent validation.
 */
export function createHashlineReadHook(options: HashlineReadHookOptions) {
  const { enabled, root } = options;

  return {
    'tool.execute.after': async (
      input: ToolExecuteAfterInput,
      output: ToolExecuteAfterOutput,
    ): Promise<void> => {
      if (!enabled) return;
      if (input.tool?.toLowerCase() !== 'read') return;
      if (typeof output.output !== 'string') return;

      const rawPath =
        typeof input.args === 'string'
          ? input.args
          : input.args?.path || input.args?.filePath || input.args?.file;

      if (!rawPath || typeof rawPath !== 'string') return;

      const filePath = path.isAbsolute(rawPath)
        ? path.normalize(rawPath)
        : path.resolve(input.directory ?? root, rawPath);

      try {
        const { formatHashlineHeader, formatNumberedLines } = await import('@oh-my-pi/hashline');
        const snapshots = await getGlobalSnapshotStore();
        const content = output.output;
        const tag = snapshots.record(filePath, content);
        const relPath = path.relative(root, filePath).replace(/\\/g, '/');
        const header = formatHashlineHeader(relPath, tag);
        const numbered = formatNumberedLines(content);

        output.output = `${header}\n${numbered}`;
        log('hashline read annotated', { path: relPath, tag });
      } catch (err) {
        log('hashline read annotation failed open', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
