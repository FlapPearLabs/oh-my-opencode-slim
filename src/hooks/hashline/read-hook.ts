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
 * Implements real OpenCode 1.18.23 read semantics.
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

      const metadata = output.metadata as any;
      const display = metadata?.display;
      if (display?.type !== 'file') return;

      const rawPath = display.path || (typeof input.args === 'string'
        ? input.args
        : input.args?.path || input.args?.filePath || input.args?.file);

      if (!rawPath || typeof rawPath !== 'string') return;

      try {
        const { formatHashlineHeader, stripBom, normalizeToLF } = await import('@oh-my-pi/hashline');
        const { createNodeFsFilesystem } = await import('./filesystem');
        
        const fsAdapter = await createNodeFsFilesystem(root);
        const fullText = await fsAdapter.readText(rawPath);
        
        const noBomText = stripBom(fullText).text;
        const lfText = normalizeToLF(noBomText);

        const lineStart = typeof display.lineStart === 'number' ? display.lineStart : 1;
        const lineEnd = typeof display.lineEnd === 'number' ? display.lineEnd : 1;
        const displayedText = display.text || '';

        const lines = lfText.split('\n');
        const slice = lines.slice(Math.max(0, lineStart - 1), lineEnd).join('\n');
        const normalizedDisplayed = normalizeToLF(stripBom(displayedText).text);

        if (slice !== normalizedDisplayed) {
          log('hashline read verification mismatch', { path: rawPath, lineStart, lineEnd });
          return;
        }

        const seenLines: number[] = [];
        for (let i = lineStart; i <= lineEnd; i++) seenLines.push(i);

        const snapshots = await getGlobalSnapshotStore();
        const canonicalPath = fsAdapter.canonicalPath(rawPath);
        const tag = snapshots.record(canonicalPath, lfText, seenLines);
        
        const relPath = path.relative(root, canonicalPath).replace(/\\/g, '/');
        const header = formatHashlineHeader(relPath, tag);

        output.output = `${header}\n${output.output}`;
        log('hashline read annotated', { path: relPath, tag });
      } catch (err: any) {
        if (err?.code === 'MODULE_NOT_FOUND' || err?.message?.includes('Cannot find module')) {
          log('hashline optional dependency missing. Annotation disabled.', {});
          return;
        }
        log('hashline read annotation failed open', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  };
}
