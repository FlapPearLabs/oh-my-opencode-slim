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

  function createMockReadPayload(filePath: string, fullContent: string, lineStart = 1, lineEnd = fullContent.split('\n').length) {
    const lines = fullContent.split(/\r?\n/);
    const slice = lines.slice(lineStart - 1, lineEnd).join('\n');
    return {
      input: {
        tool: 'read',
        args: { path: filePath },
        directory: tempDir,
      },
      output: {
        title: `read ${filePath}`,
        output: `<path>${filePath}</path>\n<type>file</type>\n<content>\n${slice}\n</content>`,
        metadata: {
          display: {
            type: 'file',
            path: filePath,
            text: slice,
            lineStart,
            lineEnd,
            totalLines: lines.length,
            truncated: false,
          }
        }
      }
    };
  }

  it('1. real read after-hook payload -> annotates output with [path#TAG] and preserves native content', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const filePath = path.join(tempDir, 'sample.ts');
    const content = 'const a = 1;\nconst b = 2;\n';
    await fs.writeFile(filePath, content, 'utf8');

    const { input, output } = createMockReadPayload('sample.ts', content);

    await hook['tool.execute.after'](input, output);

    expect(typeof output.output).toBe('string');
    expect(output.output).toMatch(/^\[sample\.ts#[0-9A-F]{4}\]/);
    expect(output.output).toContain('<path>sample.ts</path>');
  });

  it('2. snapshot created -> hashline_edit with current tag succeeds', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'file.ts');
    const original = 'let x = 1;\nlet y = 2;\n';
    await fs.writeFile(filePath, original, 'utf8');

    const { input, output } = createMockReadPayload('file.ts', original);
    await hook['tool.execute.after'](input, output);

    const match = (output.output as string).match(/^\[file\.ts#([0-9A-F]{4})\]/);
    expect(match).not.toBeNull();
    const tag = match![1];

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

    const { input, output } = createMockReadPayload('concurrent.ts', original);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[concurrent\.ts#([0-9A-F]{4})\]/)![1];

    const concurrentContent = 'const alpha = 999;\n// concurrent edit\n';
    await fs.writeFile(filePath, concurrentContent, 'utf8');

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

    const currentOnDisk = await fs.readFile(filePath, 'utf8');
    expect(currentOnDisk).toBe(concurrentContent);
  });

  it('4. native edit without hashline -> unaffected', async () => {
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
    const { input, output } = createMockReadPayload('any.ts', original);

    await disabledHook['tool.execute.after'](input, output);

    expect(output.output).not.toMatch(/^\[any\.ts#/);
  });

  it('7. CRLF line endings preserved on edit', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'crlf.ts');
    const crlfContent = 'line1\r\nline2\r\nline3\r\n';
    await fs.writeFile(filePath, crlfContent, 'utf8');

    const { input, output } = createMockReadPayload('crlf.ts', crlfContent);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[crlf\.ts#([0-9A-F]{4})\]/)![1];

    const patch = `[crlf.ts#${tag}]\nPUT 2.=2:\n+line2_modified`;
    await tool.execute({ patch }, {} as any);

    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toContain('line2_modified');
  });

  it('8. path safety -> out-of-worktree path rejected', async () => {
    const fsAdapter = await createNodeFsFilesystem(tempDir);
    await expect(fsAdapter.readText('../outside.txt')).rejects.toThrow('outside workspace');
    await expect(fsAdapter.readText(path.resolve(tempDir, '../outside.txt'))).rejects.toThrow('outside workspace');
  });

  it('8b. path safety -> symlinked target escaping workspace rejected', async () => {
    const fsAdapter = await createNodeFsFilesystem(tempDir);
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'outside-'));
    const outsideFile = path.join(outsideDir, 'secret.txt');
    await fs.writeFile(outsideFile, 'secret', 'utf8');

    const linkPath = path.join(tempDir, 'link.txt');
    try {
      await fs.symlink(outsideFile, linkPath, 'file');
    } catch {
      // If symlink creation fails (e.g. Windows without admin privileges), skip test
      await fs.rm(outsideDir, { recursive: true, force: true });
      return;
    }

    await expect(fsAdapter.readText('link.txt')).rejects.toThrow('outside workspace');
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it('9. missing patch argument throws error', async () => {
    const tool = createHashlineEditTool({ root: tempDir });
    await expect(tool.execute({} as any, {} as any)).rejects.toThrow('Missing required argument: patch');
  });

  it('10. partial read / seenLines -> patch outside seen lines fails when enforceSeenLines is true', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'partial.ts');
    const content = 'line1\nline2\nline3\nline4\n';
    await fs.writeFile(filePath, content, 'utf8');

    // Simulate offset read showing lines 1-2
    const { input, output } = createMockReadPayload('partial.ts', content, 1, 2);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[partial\.ts#([0-9A-F]{4})\]/)![1];

    // Try patching line 3 which was NOT seen in the read (should throw)
    const patch = `[partial.ts#${tag}]\nPUT 3.=3:\n+line3_mod`;
    let threw = false;
    try {
      await tool.execute({ patch }, {} as any);
    } catch (e: any) {
      threw = true;
      expect(e.message).toContain('never displayed');
    }
    expect(threw).toBe(true);

    // Patching seen line 2 should succeed
    const patch2 = `[partial.ts#${tag}]\nPUT 2.=2:\n+line2_mod`;
    await tool.execute({ patch: patch2 }, {} as any);
    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toContain('line2_mod');
  });

  it('11. mismatch read vs disk fails open', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const filePath = path.join(tempDir, 'mismatch.ts');
    await fs.writeFile(filePath, 'real content\n', 'utf8');

    // Mismatched metadata payload
    const { input, output } = createMockReadPayload('mismatch.ts', 'fake content\n');
    await hook['tool.execute.after'](input, output);

    // Should fail open, not append tag
    expect(output.output).not.toMatch(/^\[mismatch\.ts#/);
  });

  it('12. F-01 CRLF full read -> edit succeeds', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'crlf-full.ts');
    const crlfContent = 'line1\r\nline2\r\nline3\r\n';
    await fs.writeFile(filePath, crlfContent, 'utf8');

    const { input, output } = createMockReadPayload('crlf-full.ts', crlfContent);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[crlf-full\.ts#([0-9A-F]{4})\]/)![1];

    const patch = `[crlf-full.ts#${tag}]\nPUT 2.=2:\n+line2_mod`;
    await tool.execute({ patch }, {} as any);

    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toBe('line1\r\nline2_mod\r\nline3\r\n');
  });

  it('13. F-01 CRLF partial read -> unseen-line edit REJECTS', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'crlf-partial1.ts');
    const crlfContent = 'line1\r\nline2\r\nline3\r\n';
    await fs.writeFile(filePath, crlfContent, 'utf8');

    const { input, output } = createMockReadPayload('crlf-partial1.ts', crlfContent, 1, 2);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[crlf-partial1\.ts#([0-9A-F]{4})\]/)![1];

    const patch = `[crlf-partial1.ts#${tag}]\nPUT 3.=3:\n+line3_mod`;
    let threw = false;
    try { await tool.execute({ patch }, {} as any); } catch (e: any) { threw = true; }
    expect(threw).toBe(true);
  });

  it('14. F-01 CRLF partial read -> seen-line edit succeeds', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'crlf-partial2.ts');
    const crlfContent = 'line1\r\nline2\r\nline3\r\n';
    await fs.writeFile(filePath, crlfContent, 'utf8');

    const { input, output } = createMockReadPayload('crlf-partial2.ts', crlfContent, 1, 2);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[crlf-partial2\.ts#([0-9A-F]{4})\]/)![1];

    const patch = `[crlf-partial2.ts#${tag}]\nPUT 2.=2:\n+line2_mod`;
    await tool.execute({ patch }, {} as any);
    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toBe('line1\r\nline2_mod\r\nline3\r\n');
  });

  it('15. F-01 UTF-8 BOM unchanged file -> tag validates', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'bom-valid.ts');
    const bomContent = '\uFEFFline1\nline2\n';
    await fs.writeFile(filePath, bomContent, 'utf8');

    const { input, output } = createMockReadPayload('bom-valid.ts', bomContent);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[bom-valid\.ts#([0-9A-F]{4})\]/)?.[1];
    expect(tag).toBeTruthy();
    
    // Tag should be valid for an edit (noop or real)
    const patch = `[bom-valid.ts#${tag}]\nPUT 2.=2:\n+line2`;
    await tool.execute({ patch }, {} as any);
    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toBe('\uFEFFline1\nline2\n');
  });

  it('16. F-01 UTF-8 BOM edit -> BOM preserved', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'bom-edit.ts');
    const bomContent = '\uFEFFline1\nline2\n';
    await fs.writeFile(filePath, bomContent, 'utf8');

    const { input, output } = createMockReadPayload('bom-edit.ts', bomContent);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[bom-edit\.ts#([0-9A-F]{4})\]/)![1];

    const patch = `[bom-edit.ts#${tag}]\nPUT 1.=1:\n+line1_mod`;
    await tool.execute({ patch }, {} as any);
    
    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk.charCodeAt(0)).toBe(0xFEFF);
    expect(onDisk).toBe('\uFEFFline1_mod\nline2\n');
  });

  it('17. F-01 BOM + CRLF combined', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'bom-crlf.ts');
    const combinedContent = '\uFEFFline1\r\nline2\r\n';
    await fs.writeFile(filePath, combinedContent, 'utf8');

    const { input, output } = createMockReadPayload('bom-crlf.ts', combinedContent);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[bom-crlf\.ts#([0-9A-F]{4})\]/)![1];

    const patch = `[bom-crlf.ts#${tag}]\nPUT 2.=2:\n+line2_mod`;
    await tool.execute({ patch }, {} as any);

    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk.charCodeAt(0)).toBe(0xFEFF);
    expect(onDisk).toBe('\uFEFFline1\r\nline2_mod\r\n');
  });

  it('18. F-01 no regression on LF', async () => {
    const hook = createHashlineReadHook({ enabled: true, root: tempDir });
    const tool = createHashlineEditTool({ root: tempDir });
    const filePath = path.join(tempDir, 'lf.ts');
    const content = 'line1\nline2\n';
    await fs.writeFile(filePath, content, 'utf8');

    const { input, output } = createMockReadPayload('lf.ts', content);
    await hook['tool.execute.after'](input, output);
    const tag = (output.output as string).match(/^\[lf\.ts#([0-9A-F]{4})\]/)![1];

    const patch = `[lf.ts#${tag}]\nPUT 1.=1:\n+line1_mod`;
    await tool.execute({ patch }, {} as any);
    const onDisk = await fs.readFile(filePath, 'utf8');
    expect(onDisk).toBe('line1_mod\nline2\n');
  });
});
