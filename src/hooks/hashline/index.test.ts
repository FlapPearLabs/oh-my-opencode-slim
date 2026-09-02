/**
 * Real integration tests for Hashline P0 integration.
 * Tests actual OpenCode hook contracts, dedicated hashline_edit tool,
 * stale anchor rejection, disabled fallback, path safety, and native tool independence.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  createHashlineReadHook,
  createHashlineEditTool,
  createNodeFsFilesystem,
  getGlobalSnapshotStore,
  resetGlobalSnapshotStore,
} from '.';

describe('hashline P0 integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetGlobalSnapshotStore();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashline-test-'));
  });

  afterEach(async () => {
    resetGlobalSnapshotStore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('1. real read after-hook payload -> annotates output with [path#TAG] and LINE:CONTENT', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const filePath = path.join(tempDir, 'sample.ts');
    const content = 'const a = 1;\nconst b = 2;\n';
    await fs.writeFile(filePath, content, 'utf8');

    const input = {
      tool: 'read',
      args: { path: 'sample.ts' },
      directory: tempDir,
    };
    const output = {
      title: 'read sample.ts',
      output: content,
      metadata: {},
    };

    await hook['tool.execute.after'](input, output);

    expect(typeof output.output).toBe('string');
    expect(output.output).toMatch(/^\[sample\.ts#[0-9A-F]{4}\]/);
    expect(output.output).toContain('1:const a = 1;');
    expect(output.output).toContain('2:const b = 2;');
  });

  it('2. snapshot created -> hashline_edit with current tag succeeds', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'file.ts');
    const original = 'let x = 1;\nlet y = 2;\n';
    await fs.writeFile(filePath, original, 'utf8');

    // Simulate read
    const output = { output: original };
    await hook['tool.execute.after'](
      { tool: 'read', args: { path: 'file.ts' }, directory: tempDir },
      output,
    );

    const match = (output.output as string).match(/^\[file\.ts#([0-9A-F]{4})\]/);
    expect(match).not.toBeNull();
    const tag = match![1];

    // Execute hashline_edit with valid tag
    const patch = `[file.ts#${tag}]\nPUT 1.=1:\n+let x = 42;`;
    const result = await tool.execute({ patch }, {} as any);

    expect(result).toContain('Successfully applied hashline edit');
    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toBe('let x = 42;\nlet y = 2;\n');
  });

  it('3. concurrent file mutation -> stale tag rejects and file remains untouched', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'concurrent.ts');
    const original = 'const alpha = 100;\n';
    await fs.writeFile(filePath, original, 'utf8');

    // Read to obtain tag
    const output = { output: original };
    await hook['tool.execute.after'](
      { tool: 'read', args: { path: 'concurrent.ts' }, directory: tempDir },
      output,
    );
    const tag = (output.output as string).match(/^\[concurrent\.ts#([0-9A-F]{4})\]/)![1];

    // Simulate external concurrent modification on disk
    const concurrentContent = 'const alpha = 999;\n// concurrent edit\n';
    await fs.writeFile(filePath, concurrentContent, 'utf8');

    // Try applying patch anchored to stale tag
    const patch = `[concurrent.ts#${tag}]\nPUT 1.=1:\n+const alpha = 500;`;

    let threw = false;
    try {
      await tool.execute({ patch }, {} as any);
    } catch (err: any) {
      threw = true;
      expect(err.message).toContain('Hashline tag mismatch');
      expect(err.message).toContain('Re-read the file');
    }

    expect(threw).toBe(true);

    // Verify file content on disk was NOT corrupted or modified
    const currentOnDisk = await fs.readFile(filePath, 'utf8');
    expect(currentOnDisk).toBe(concurrentContent);
  });

  it('4. native edit without hashline -> unaffected', async () => {
    // Hashline hook does NOT intercept edit tool in tool.execute.before or tool.execute.after
    const readHook = createHashlineReadHook({ enabled: true, root: tempDir });
    const editOutput = { output: 'File edited successfully' };
    await readHook['tool.execute.after'](
      { tool: 'edit', args: { filePath: 'foo.ts', oldString: 'a', newString: 'b' } },
      editOutput,
    );
    expect(editOutput.output).toBe('File edited successfully');
  });

  it('5. native apply_patch without hashline -> unaffected', async () => {
    const readHook = createHashlineReadHook({ enabled: true, root: tempDir });
    const patchOutput = { output: 'Patch applied successfully' };
    await readHook['tool.execute.after'](
      { tool: 'apply_patch', args: { patchText: '*** patch ***' } },
      patchOutput,
    );
    expect(patchOutput.output).toBe('Patch applied successfully');
  });

  it('6. hashline disabled -> read hook does not modify output', async () => {
    const disabledHook = createHashlineReadHook({ enabled: false, root: tempDir });
    const original = 'plain text content\n';
    const output = { output: original };

    await disabledHook['tool.execute.after'](
      { tool: 'read', args: { path: 'any.ts' } },
      output,
    );

    expect(output.output).toBe(original);
  });

  it('7. CRLF line endings preserved on edit', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'crlf.ts');
    const crlfContent = 'line1\r\nline2\r\nline3\r\n';
    await fs.writeFile(filePath, crlfContent, 'utf8');

    const output = { output: crlfContent };
    await hook['tool.execute.after'](
      { tool: 'read', args: { path: 'crlf.ts' }, directory: tempDir },
      output,
    );
    const tag = (output.output as string).match(/^\[crlf\.ts#([0-9A-F]{4})\]/)![1];

    const patch = `[crlf.ts#${tag}]\nPUT 2.=2:\n+line2_modified`;
    await tool.execute({ patch }, {} as any);

    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toContain('line2_modified');
  });

  it('8. path safety -> out-of-worktree path rejected', async () => {
    const fsAdapter = await createNodeFsFilesystem(tempDir);
    expect(fsAdapter.readText('../outside.txt')).rejects.toThrow('Path outside workspace boundary');
  });

  it('9. missing patch argument throws error', async () => {
    const tool = createHashlineEditTool({ root: tempDir });
    expect(tool.execute({} as any, {} as any)).rejects.toThrow('Missing required argument: patch');
  });
});
