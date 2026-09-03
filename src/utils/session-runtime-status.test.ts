import { describe, expect, test } from 'bun:test';
import type { PluginInput } from '@opencode-ai/plugin';
import { getRuntimeSessionStatusSnapshot } from './session-runtime-status';

describe('getRuntimeSessionStatusSnapshot timeout liveness', () => {
  test('resolves snapshot normally when status lookup responds within timeout', async () => {
    const input = {
      directory: '/test',
      client: {
        session: {
          status: async () => ({
            data: {
              ses_1: { type: 'busy' },
              ses_2: { type: 'idle' },
            },
          }),
        },
      },
    } as unknown as PluginInput;

    const snapshot = await getRuntimeSessionStatusSnapshot(input, {
      timeoutMs: 1000,
    });

    expect(snapshot.error).toBeUndefined();
    expect(snapshot.statuses.get('ses_1')).toBe('busy');
    expect(snapshot.statuses.get('ses_2')).toBe('idle');
  });

  test('process-isolated: hung status lookup settles within bounded outer timeout without hanging parent suite', async () => {
    const childScript = [
      "import { getRuntimeSessionStatusSnapshot } from './src/utils/session-runtime-status';",
      'const input = { directory: "/test", client: { session: { status: () => new Promise(() => {}) } } };',
      'const snapshot = await getRuntimeSessionStatusSnapshot(input, { timeoutMs: 50 });',
      'process.stdout.write(JSON.stringify({ error: snapshot.error, size: snapshot.statuses.size }));',
      'process.exit(0);',
    ].join(' ');

    const proc = Bun.spawn([process.execPath, '-e', childScript], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const outerTimeoutMs = 2000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), outerTimeoutMs);
    });

    const exitPromise = proc.exited.then((code) => ({
      timedOut: false as const,
      code,
    }));

    try {
      const outcome = await Promise.race([exitPromise, timeoutPromise]);
      if (outcome.timedOut) {
        try {
          proc.kill();
        } catch {
          /* ignore */
        }
        throw new Error(
          `Child process hung and failed to settle within outer timeout bound (${outerTimeoutMs}ms)`,
        );
      }

      expect(outcome.code).toBe(0);
      const stdoutText = await new Response(proc.stdout).text();
      const result = JSON.parse(stdoutText);
      expect(result.error).toBe('Session status lookup timed out');
      expect(result.size).toBe(0);
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
});
