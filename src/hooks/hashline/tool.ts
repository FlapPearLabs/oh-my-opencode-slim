import { tool, type ToolDefinition } from '@opencode-ai/plugin';
import { createNodeFsFilesystem } from './filesystem';
import { getGlobalSnapshotStore } from './snapshot-store';
import { log } from '../../utils/logger';

export interface HashlineEditToolOptions {
  root: string;
}

/**
 * Dedicated hashline_edit tool wrapping upstream Patcher.
 * Does not intercept or shadow native edit or apply_patch.
 */
export function createHashlineEditTool(options: HashlineEditToolOptions): ToolDefinition {
  const { root } = options;

  return tool({
    description:
      'Apply content-hash anchored edits using the hashline patch format. ' +
      'Validates that the target file has not changed since the last read. ' +
      'If the file was modified concurrently, the edit is rejected without mutating the file, ' +
      'and you will be instructed to re-read the file to obtain a fresh tag before retrying.\n\n' +
      'Patch format:\n' +
      '[path/to/file.ts#TAG]\n' +
      'PUT startLine.=endLine:\n' +
      '+replacement line content\n\n' +
      'Insertions and deletions:\n' +
      'PUT >lineNum:\n' +
      '+inserted line\n' +
      'CUT startLine.=endLine',
    args: {
      patch: tool.schema
        .string()
        .describe('Hashline formatted patch text starting with [path#TAG] header'),
    },
    execute: async (args, _context) => {
      const patchText = args.patch;
      if (!patchText || typeof patchText !== 'string') {
        throw new Error('Missing required argument: patch');
      }

      try {
        const { Patch, Patcher } = await import('@oh-my-pi/hashline');
        const fs = await createNodeFsFilesystem(root);
        const snapshots = await getGlobalSnapshotStore();
        const patcher = new Patcher({
          fs,
          snapshots,
          enforceSeenLines: false,
        });

        const patch = Patch.parse(patchText, { cwd: root });
        const result = await patcher.apply(patch);

        const summary = result.sections
          .map((s) => `${s.op} ${s.path}`)
          .join(', ');

        log('hashline_edit applied', { summary, sections: result.sections.length });
        return `Successfully applied hashline edit:\n${summary}`;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const isMismatch =
          (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'MismatchError') ||
          message.includes('MismatchError') ||
          message.includes('tag') ||
          message.includes('stale') ||
          message.includes('re-read');

        const guidance = isMismatch
          ? `Hashline tag mismatch — the file changed since your last read. Re-read the file with \`read\` to refresh the tag before retrying.\n\nDetails: ${message}`
          : `Hashline edit failed: ${message}`;

        log('hashline_edit rejected', { message, isMismatch });
        throw new Error(guidance);
      }
    },
  });
}
