import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { PluginInput } from '@opencode-ai/plugin';

import { createSearchPathGuardHook } from './index';

describe('search-path-guard hook', () => {
  let tempRoot: string;

  const createHook = (
    directory: string,
  ): ReturnType<typeof createSearchPathGuardHook> =>
    createSearchPathGuardHook({
      client: {} as PluginInput['client'],
      directory,
    } as PluginInput);

  const runHook = (
    hook: ReturnType<typeof createSearchPathGuardHook>,
    tool: string,
    args: Record<string, unknown> | undefined,
  ): Promise<void> =>
    hook['tool.execute.before']({ tool }, args === undefined ? {} : { args });

  beforeAll(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'search-path-guard-'));
  });

  afterAll(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test('blocks grep when the absolute path does not exist', async () => {
    const hook = createHook(tempRoot);
    const missing = path.join(tempRoot, 'does-not-exist', 'missing.txt');

    const promise = runHook(hook, 'grep', { path: missing });

    await expect(promise).rejects.toThrow(/Search path does not exist/);
    await expect(promise).rejects.toThrow(missing);
  });

  test('blocks glob when the relative path does not exist under directory', async () => {
    const hook = createHook(tempRoot);
    const raw = 'no-such-dir';
    const resolved = path.join(tempRoot, raw);

    const promise = runHook(hook, 'glob', { path: raw });

    await expect(promise).rejects.toThrow(/Search path does not exist/);
    await expect(promise).rejects.toThrow(resolved);
  });

  test('allows an existing absolute file path', async () => {
    const filePath = path.join(tempRoot, 'file.txt');
    await writeFile(filePath, 'content');

    const hook = createHook(tempRoot);

    await runHook(hook, 'grep', { path: filePath });
  });

  test('allows an existing relative directory', async () => {
    await mkdir(path.join(tempRoot, 'subdir'));

    const hook = createHook(tempRoot);

    await runHook(hook, 'glob', { path: 'subdir' });
  });

  test('never blocks a relative path when directory is falsy', async () => {
    const hook = createHook('');

    await runHook(hook, 'grep', { path: 'definitely-missing-relative' });
  });

  test('ignores tools other than grep and glob', async () => {
    const hook = createHook(tempRoot);
    const missing = path.join(tempRoot, 'does-not-exist');

    await runHook(hook, 'read', { path: missing });
    await runHook(hook, 'bash', { path: missing });
  });

  test('ignores absent, non-string, or sentinel path values', async () => {
    const hook = createHook(tempRoot);

    await runHook(hook, 'grep', undefined);
    await runHook(hook, 'grep', {});
    await runHook(hook, 'glob', { path: 42 });
    await runHook(hook, 'glob', { path: null });
    await runHook(hook, 'grep', { path: 'undefined' });
    await runHook(hook, 'grep', { path: 'null' });
    await runHook(hook, 'glob', { path: '   ' });
  });

  test('allows grep when the path points to an existing file', async () => {
    const filePath = path.join(tempRoot, 'target-file.ts');
    await writeFile(filePath, 'export {}');

    const hook = createHook(tempRoot);

    await runHook(hook, 'grep', { path: filePath });
  });
});
