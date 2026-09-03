import { describe, expect, test } from 'bun:test';
import type { PluginInput } from '@opencode-ai/plugin';
import { getRuntimeSessionStatusSnapshot } from './session-runtime-status';

describe('getRuntimeSessionStatusSnapshot timeout liveness', () => {
  test('settles and returns timeout error snapshot when status lookup hangs', async () => {
    const input = {
      directory: '/test',
      client: {
        session: {
          status: () => new Promise(() => {}),
        },
      },
    } as unknown as PluginInput;

    const snapshot = await getRuntimeSessionStatusSnapshot(input, {
      timeoutMs: 15,
    });

    expect(snapshot.error).toBe('Session status lookup timed out');
    expect(snapshot.statuses.size).toBe(0);
    expect(snapshot.malformedSessionIDs.size).toBe(0);
  });

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
});
