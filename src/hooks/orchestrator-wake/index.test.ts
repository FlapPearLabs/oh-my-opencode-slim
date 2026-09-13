import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createInternalAgentTextPart } from '../../utils';
import { isCanonicalTerminalState } from '../../utils/background-job-board';
import { SessionLifecycle } from '../session-lifecycle';
import { resetUserWaitGateForTests } from '../task-session-manager/user-wait-gate';
import {
  buildOrchestratorWakeFingerprint,
  createOrchestratorWakeScheduler,
  ORCHESTRATOR_RECONCILIATION_WAKE_TEXT,
  ORCHESTRATOR_STOPPED_JOB_WAKE_TEXT,
  ORCHESTRATOR_WAKE_TEXT,
  ORCHESTRATOR_WAKE_UNCHANGED_CAP,
} from './index';
import {
  getWakeProgress,
  resetOrchestratorWakeGateForTests,
  toCanonicalReconciliationTarget,
} from './wake-gate';

type SessionClient = {
  get?: ReturnType<typeof mock>;
  todo?: ReturnType<typeof mock>;
  children?: ReturnType<typeof mock>;
  status?: ReturnType<typeof mock>;
  promptAsync?: ReturnType<typeof mock>;
};

function createClock() {
  let now = 0;
  let nextID = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();

  const setTimeoutImpl = ((callback: () => void, delay?: number) => {
    const id = nextID++;
    timers.set(id, { at: now + (delay ?? 0), callback });
    const handle = {
      __id: id,
      unref() {
        return handle;
      },
    };
    return handle as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;

  const clearTimeoutImpl = ((handle: unknown) => {
    if (handle == null) return;
    const id =
      typeof handle === 'object' &&
      handle !== null &&
      '__id' in handle &&
      typeof (handle as { __id: unknown }).__id === 'number'
        ? (handle as { __id: number }).__id
        : Number(handle);
    timers.delete(id);
  }) as unknown as typeof clearTimeout;

  async function flushMicrotasks(times = 30): Promise<void> {
    for (let i = 0; i < times; i++) {
      await Promise.resolve();
    }
  }

  return {
    setTimeout: setTimeoutImpl,
    clearTimeout: clearTimeoutImpl,
    async advance(ms: number) {
      now += ms;
      for (let round = 0; round < 5; round++) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= now)
          .sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        for (const [id, timer] of due) {
          timers.delete(id);
          timer.callback();
        }
        await flushMicrotasks();
      }
      await flushMicrotasks();
    },
    pendingCount() {
      return timers.size;
    },
  };
}

type SessionClientFactory = Partial<SessionClient> & {
  todos?: Array<Record<string, unknown>>;
  childrenData?: Array<Record<string, unknown>>;
  statusData?: Record<string, unknown>;
  model?: unknown;
};

function makeClient(overrides?: SessionClientFactory): SessionClient {
  const todos = overrides?.todos ?? [{ id: 't1', status: 'pending' }];
  const childrenData = overrides?.childrenData ?? [];
  const statusData = overrides?.statusData ?? {};
  return {
    get:
      overrides?.get ??
      mock(async () => ({
        data: {
          model: overrides?.model ?? {
            providerID: 'test',
            id: 'model-a',
            variant: 'high',
          },
        },
      })),
    todo: overrides?.todo ?? mock(async () => ({ data: todos })),
    children: overrides?.children ?? mock(async () => ({ data: childrenData })),
    status: overrides?.status ?? mock(async () => ({ data: statusData })),
    promptAsync: overrides?.promptAsync ?? mock(async () => ({})),
  };
}

function createScheduler(options?: {
  enabled?: boolean;
  intervalMs?: number;
  sessionClient?: SessionClient | null;
  shouldManageSession?: (id: string) => boolean;
  hasInputWait?: (id: string) => boolean;
  isFallbackInProgress?: (id: string) => boolean;
  coordinator?: SessionLifecycle;
  directory?: string;
  getWorkIntent?: OrchestratorWakeOptions['getWorkIntent'];
  hasTerminalUnreconciled?: OrchestratorWakeOptions['hasTerminalUnreconciled'];
  getJob?: (taskID: string) => any;
  isJobTerminalUnreconciled?: (taskID: string) => boolean;
}) {
  const client = options?.sessionClient;
  const session = client === null ? undefined : (client ?? makeClient());
  const ctx = {
    directory: options?.directory ?? '/project',
    client: { session },
  } as never;

  const scheduler = createOrchestratorWakeScheduler(ctx, {
    config: {
      enabled: options?.enabled ?? true,
      intervalMs: options?.intervalMs ?? 60_000,
    },
    intervalMs: options?.intervalMs ?? 60_000,
    shouldManageSession: options?.shouldManageSession ?? (() => true),
    hasInputWait: options?.hasInputWait ?? (() => false),
    isFallbackInProgress: options?.isFallbackInProgress,
    coordinator: options?.coordinator,
    getWorkIntent: options?.getWorkIntent,
    hasTerminalUnreconciled: options?.hasTerminalUnreconciled,
    getJob: options?.getJob,
    isJobTerminalUnreconciled: options?.isJobTerminalUnreconciled,
  } as any);

  return { scheduler, session: session as SessionClient | undefined };
}

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
let clock = createClock();

beforeEach(() => {
  resetUserWaitGateForTests();
  resetOrchestratorWakeGateForTests();
  clock = createClock();
  globalThis.setTimeout = clock.setTimeout;
  globalThis.clearTimeout = clock.clearTimeout;
});

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

describe('buildOrchestratorWakeFingerprint', () => {
  test('includes todo statuses and child status/update evidence', () => {
    const fp = buildOrchestratorWakeFingerprint(
      [
        { id: 'b', status: 'pending' },
        { id: 'a', status: 'in_progress' },
      ],
      [{ id: 'child-1', time: { updated: 42 } }],
      { 'child-1': { type: 'busy' } },
    );
    expect(fp).toContain('a:in_progress');
    expect(fp).toContain('b:pending');
    expect(fp).toContain('child-1:busy:42');
  });
});

describe('orchestrator wake scheduler', () => {
  test('immediately wakes an idle parent after a stopped child with an active sibling', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        todos: [],
        promptAsync,
        childrenData: [{ id: 'child-2' }],
        statusData: { 'child-2': { type: 'busy' } },
      }),
    });

    scheduler.triggerStoppedJobRecovery('p1');
    await clock.advance(0);

    expect(promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          parts: [
            createInternalAgentTextPart(ORCHESTRATOR_STOPPED_JOB_WAKE_TEXT),
          ],
        }),
      }),
    );
  });

  test('does not recover-wake when disabled, waiting for input, busy, or disposed', async () => {
    const cases = [
      createScheduler({ enabled: false }),
      createScheduler({ hasInputWait: () => true }),
      createScheduler({
        sessionClient: makeClient({ statusData: { p1: { type: 'busy' } } }),
      }),
      createScheduler(),
    ];
    const disposed = cases[3];
    await disposed?.scheduler.event({
      event: { type: 'server.instance.disposed' },
    });

    for (const item of cases) item?.scheduler.triggerStoppedJobRecovery('p1');
    await clock.advance(0);

    for (const item of cases) {
      expect(item?.session?.promptAsync).not.toHaveBeenCalled();
    }
  });
  test('does nothing when disabled', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      enabled: false,
      sessionClient: makeClient({ promptAsync }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(120_000);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(0);
  });

  test('is inactive when required session APIs are missing', async () => {
    const { scheduler } = createScheduler({
      sessionClient: {
        todo: mock(async () => ({ data: [{ status: 'pending' }] })),
      },
    });
    expect(scheduler._test.hasRequiredSessionApis()).toBe(false);
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(120_000);
    expect(clock.pendingCount()).toBe(0);
  });

  test('wakes after continuous idle interval with exact prompt text and directory query', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler, session } = createScheduler({
      intervalMs: 60_000,
      sessionClient: makeClient({ promptAsync }),
    });

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    expect(promptAsync).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(1);

    await clock.advance(59_999);
    expect(promptAsync).not.toHaveBeenCalled();

    await clock.advance(1);
    expect(promptAsync).toHaveBeenCalledTimes(1);
    const call = (
      promptAsync.mock.calls as unknown as Array<[unknown]>
    )[0]?.[0] as {
      path: { id: string };
      query: { directory: string };
      body: {
        agent: string;
        model?: { providerID: string; modelID: string };
        variant?: string;
        parts: Array<{ text: string }>;
      };
    };
    expect(call.path).toEqual({ id: 'p1' });
    expect(call.query).toEqual({ directory: '/project' });
    expect(call.body.agent).toBe('orchestrator');
    expect(call.body.model).toEqual({
      providerID: 'test',
      modelID: 'model-a',
    });
    expect(call.body.variant).toBeUndefined();
    expect(call.body.parts[0]?.text).toBe(
      `${ORCHESTRATOR_WAKE_TEXT}\n<!-- SLIM_INTERNAL_INITIATOR -->`,
    );

    expect(session?.todo).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: 'p1' },
        query: { directory: '/project' },
      }),
    );
    expect(session?.status).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { directory: '/project' },
      }),
    );
  });

  test('targets only orchestrator-managed sessions', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      shouldManageSession: (id) => id === 'orch',
      sessionClient: makeClient({ promptAsync }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'child' } },
    });
    await clock.advance(120_000);
    expect(promptAsync).not.toHaveBeenCalled();

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'orch' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);
  });

  test('suppresses a periodic wake when the initial snapshot has an active child', async () => {
    const promptAsync = mock(async () => ({}));
    let statusReads = 0;
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        promptAsync,
        childrenData: [{ id: 'child-1', time: { updated: 1 } }],
        status: mock(async () => ({
          data: statusReads++ === 0 ? { 'child-1': { type: 'busy' } } : {},
        })),
      }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(1);

    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);
  });

  test('suppresses a periodic wake when a child becomes active before the latest snapshot', async () => {
    const promptAsync = mock(async () => ({}));
    let statusReads = 0;
    let releaseFirstGet!: () => void;
    const firstGet = new Promise<void>((resolve) => {
      releaseFirstGet = resolve;
    });
    let getCalls = 0;
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        promptAsync,
        childrenData: [{ id: 'child-1' }],
        status: mock(async () => ({
          data: statusReads++ === 0 ? {} : { 'child-1': { type: 'busy' } },
        })),
        get: mock(async () => {
          if (getCalls++ === 0) await firstGet;
          return {
            data: {
              model: { providerID: 'test', id: 'model-a', variant: 'high' },
            },
          };
        }),
      }),
    });

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(statusReads).toBe(1);

    releaseFirstGet();
    await clock.advance(0);

    expect(promptAsync).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(1);
  });

  test('wakes when host children have no active status', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        promptAsync,
        childrenData: [{ id: 'child-1', time: { updated: 1 } }],
      }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);
  });

  test('does not wake when parent is busy according to host status', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        promptAsync,
        statusData: { p1: { type: 'busy' } },
      }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
  });

  test('does not wake when todos are only completed or cancelled', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        promptAsync,
        todos: [
          { id: 't1', status: 'completed' },
          { id: 't2', status: 'cancelled' },
        ],
      }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(0);
  });

  test('fails closed on unknown todo status', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        promptAsync,
        todos: [
          { id: 't1', status: 'pending' },
          { id: 't2', status: 'blocked' },
        ],
      }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
  });

  test('fails closed on malformed host responses', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        promptAsync,
        todo: mock(async () => ({ data: 'not-array' })),
      }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
  });

  test('suppresses on input wait, fallback, busy, and disposal without stuck in-flight', async () => {
    const promptAsync = mock(async () => ({}));
    let waiting = false;
    let fallback = false;
    const { scheduler } = createScheduler({
      sessionClient: makeClient({ promptAsync }),
      hasInputWait: () => waiting,
      isFallbackInProgress: () => fallback,
    });

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    expect(clock.pendingCount()).toBe(1);

    waiting = true;
    scheduler.suppress('p1');
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(0);

    waiting = false;
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    fallback = true;
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();

    fallback = false;
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await scheduler.event({
      event: { type: 'server.instance.disposed' },
    });
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(clock.pendingCount()).toBe(0);
  });

  test('disposal releases a reservation blocked on host reads', async () => {
    let releaseReads!: () => void;
    const blockedReads = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    const a = createScheduler({
      intervalMs: 60_000,
      sessionClient: makeClient({
        todo: mock(async () => {
          await blockedReads;
          return { data: [{ id: 't1', status: 'pending' }] };
        }),
        children: mock(async () => {
          await blockedReads;
          return { data: [] };
        }),
        status: mock(async () => {
          await blockedReads;
          return { data: {} };
        }),
      }),
    });
    const promptAsync = mock(async () => ({}));
    const b = createScheduler({
      intervalMs: 60_000,
      sessionClient: makeClient({ promptAsync }),
    });

    await a.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    await a.scheduler.event({ event: { type: 'server.instance.disposed' } });

    await b.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);

    releaseReads();
  });

  test('clears in-flight ownership when suppress races an evaluation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const promptAsync = mock(async () => {
      await gate;
      return {};
    });
    const todo = mock(async () => {
      await gate;
      return { data: [{ id: 't1', status: 'pending' }] };
    });
    const { scheduler } = createScheduler({
      intervalMs: 10_000,
      sessionClient: makeClient({
        promptAsync,
        todo,
        children: mock(async () => {
          await gate;
          return { data: [] };
        }),
        status: mock(async () => {
          await gate;
          return { data: {} };
        }),
      }),
    });

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(10_000);
    // Evaluation is blocked on host reads.
    scheduler.suppress('p1');
    release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // A later idle must be able to claim in-flight again.
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(10_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);
  });

  test('session deletion clears scheduled wakes via coordinator', async () => {
    const promptAsync = mock(async () => ({}));
    const coordinator = new SessionLifecycle(() => {});
    const { scheduler } = createScheduler({
      sessionClient: makeClient({ promptAsync }),
      coordinator,
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    expect(clock.pendingCount()).toBe(1);
    coordinator.dispatchSessionDeleted('p1');
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
  });

  test('external user message re-arms and cancels pending wake', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({ promptAsync }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    scheduler.observeChatMessage(
      { sessionID: 'p1', messageID: 'm1' },
      {
        message: { id: 'm1', role: 'user', sessionID: 'p1' },
        parts: [{ type: 'text', text: 'continue please' }],
      },
    );
    await clock.advance(60_000);
    expect(promptAsync).not.toHaveBeenCalled();
    expect(getWakeProgress('p1').stopped).toBe(false);
    expect(getWakeProgress('p1').unchangedWakeCount).toBe(0);
  });

  test('internal initiator parts do not re-arm as external user messages', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({ promptAsync }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    scheduler.observeChatMessage(
      { sessionID: 'p1', messageID: 'm-internal' },
      {
        message: { id: 'm-internal', role: 'user', sessionID: 'p1' },
        parts: [createInternalAgentTextPart(ORCHESTRATOR_WAKE_TEXT)],
      },
    );
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);
  });

  test('wake→busy→idle preserves the two-wake no-progress cap', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      intervalMs: 60_000,
      sessionClient: makeClient({ promptAsync }),
    });

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);

    // Realistic host reaction to promptAsync: busy then idle again.
    await scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(ORCHESTRATOR_WAKE_UNCHANGED_CAP);

    // Cap stops further wakes even after another busy→idle from the second wake.
    await scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(180_000);
    expect(promptAsync).toHaveBeenCalledTimes(ORCHESTRATOR_WAKE_UNCHANGED_CAP);
  });

  test('external busy (not wake-initiated) rearms the no-progress cap', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      intervalMs: 60_000,
      sessionClient: makeClient({ promptAsync }),
    });

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(2);
    expect(getWakeProgress('p1').stopped).toBe(true);

    // External user message rearms.
    scheduler.observeChatMessage(
      { sessionID: 'p1', messageID: 'user-rearm' },
      {
        message: { id: 'user-rearm', role: 'user', sessionID: 'p1' },
        parts: [{ type: 'text', text: 'keep going' }],
      },
    );
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(3);
  });

  test('host-observed progress rearms the unchanged cap', async () => {
    const promptAsync = mock(async () => ({}));
    let todos: Array<Record<string, unknown>> = [
      { id: 't1', status: 'pending' },
    ];
    const { scheduler } = createScheduler({
      intervalMs: 60_000,
      sessionClient: makeClient({
        promptAsync,
        todo: mock(async () => ({ data: todos })),
      }),
    });

    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    // Simulate wake busy→idle without rearm (cap preserved at 1).
    await scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    todos = [{ id: 't1', status: 'in_progress' }];
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    // Progress reset count; this is wake #1 of the new fingerprint.
    expect(promptAsync).toHaveBeenCalledTimes(2);
    expect(getWakeProgress('p1').unchangedWakeCount).toBe(1);
    expect(getWakeProgress('p1').stopped).toBe(false);
  });

  test('failed promptAsync does not storm retries within the interval', async () => {
    let calls = 0;
    const promptAsync = mock(async () => {
      calls += 1;
      throw new Error('boom');
    });
    const { scheduler } = createScheduler({
      intervalMs: 60_000,
      sessionClient: makeClient({ promptAsync }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(calls).toBe(1);
    await clock.advance(1_000);
    expect(calls).toBe(1);
    await clock.advance(59_000);
    expect(calls).toBe(2);
  });

  test('two hook instances share process-global in-flight and progress', async () => {
    const promptAsync = mock(async () => ({}));
    const client = makeClient({ promptAsync });
    const a = createScheduler({ sessionClient: client, intervalMs: 60_000 });
    const b = createScheduler({ sessionClient: client, intervalMs: 60_000 });

    await a.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await b.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    // Two local timers may exist; process gate dedupes wakes.
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);

    await a.scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    await b.scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    await a.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await b.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(2);

    await a.scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    await a.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(180_000);
    expect(promptAsync).toHaveBeenCalledTimes(2);
  });

  test('disposing one hook leaves another hook’s shared progress cap intact', async () => {
    const promptAsync = mock(async () => ({}));
    const client = makeClient({ promptAsync });
    const a = createScheduler({ sessionClient: client, intervalMs: 60_000 });
    const b = createScheduler({ sessionClient: client, intervalMs: 60_000 });

    await a.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await b.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);

    await a.scheduler.event({ event: { type: 'server.instance.disposed' } });
    await b.scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    await b.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(2);

    await b.scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'busy' } },
      },
    });
    await b.scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(180_000);
    expect(promptAsync).toHaveBeenCalledTimes(2);
  });

  test('uses observed external model when session.get model is unavailable', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({
        promptAsync,
        get: mock(async () => {
          throw new Error('no model field');
        }),
      }),
    });
    scheduler.observeChatMessage(
      {
        sessionID: 'p1',
        messageID: 'm1',
        model: { providerID: 'obs', modelID: 'seen' },
        variant: 'low',
      },
      {
        message: { id: 'm1', role: 'user', sessionID: 'p1' },
        parts: [{ type: 'text', text: 'go' }],
      },
    );
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { directory: '/project' },
        body: expect.objectContaining({
          model: { providerID: 'obs', modelID: 'seen' },
        }),
      }),
    );
    const call = (
      promptAsync.mock.calls as unknown as Array<
        [{ body: { variant?: string } }]
      >
    )[0]?.[0];
    expect(call?.body.variant).toBeUndefined();
  });

  test('paired idle events do not create duplicate timers on one instance', async () => {
    const promptAsync = mock(async () => ({}));
    const { scheduler } = createScheduler({
      sessionClient: makeClient({ promptAsync }),
    });
    await scheduler.event({
      event: { type: 'session.idle', properties: { sessionID: 'p1' } },
    });
    await scheduler.event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'p1', status: { type: 'idle' } },
      },
    });
    expect(clock.pendingCount()).toBe(1);
    await clock.advance(60_000);
    expect(promptAsync).toHaveBeenCalledTimes(1);
  });

  describe('URV1-03: WorkIntent-aware wake and canonical reconciliation', () => {
    test('missing or unknown WorkIntent suppresses normal continuation wake', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        getWorkIntent: () => ({ status: 'unknown' as const }),
      });
      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).not.toHaveBeenCalled();
    });

    test('WorkIntent waiting_for_user suppresses normal continuation wake', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        getWorkIntent: () => ({
          status: 'known' as const,
          intent: {
            objective: 'test',
            successCriteria: 'done',
            state: 'waiting_for_user' as const,
            ownerSessionID: 'p1',
            createdAt: 1,
            updatedAt: 1,
          },
        }),
      });
      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).not.toHaveBeenCalled();
    });

    test('WorkIntent complete suppresses normal continuation wake', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        getWorkIntent: () => ({
          status: 'known' as const,
          intent: {
            objective: 'test',
            successCriteria: 'done',
            state: 'complete' as const,
            ownerSessionID: 'p1',
            createdAt: 1,
            updatedAt: 1,
          },
        }),
      });
      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).not.toHaveBeenCalled();
    });

    test('WorkIntent blocked suppresses normal continuation wake', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        getWorkIntent: () => ({
          status: 'known' as const,
          intent: {
            objective: 'test',
            successCriteria: 'done',
            state: 'blocked' as const,
            ownerSessionID: 'p1',
            createdAt: 1,
            updatedAt: 1,
          },
        }),
      });
      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).not.toHaveBeenCalled();
    });

    test('WorkIntent active permits normal continuation wake when eligible', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        getWorkIntent: () => ({
          status: 'known' as const,
          intent: {
            objective: 'test',
            successCriteria: 'done',
            state: 'active' as const,
            ownerSessionID: 'p1',
            createdAt: 1,
            updatedAt: 1,
          },
        }),
      });
      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).toHaveBeenCalledTimes(1);
    });

    test('canonical terminal child result triggers single reconciliation wake', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });

      expect(promptAsync).toHaveBeenCalledTimes(1);
      const call = (promptAsync.mock.calls as any)[0][0];
      expect(call.body.parts[0].text).toContain(
        'background job reached a terminal result',
      );
    });

    test('reconciliation wake bypasses circular terminalUnreconciled gate', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      // Normal idle would be blocked by hasTerminalUnreconciled
      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).not.toHaveBeenCalled();

      // Reconciliation wake succeeds
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).toHaveBeenCalledTimes(1);
    });

    // P1-1: Exact Reconciliation Identity
    test('same task / same generation / same occurrence duplicate does not trigger duplicate wake', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });

      expect(promptAsync).toHaveBeenCalledTimes(1);
    });

    test('same task / same generation / different authoritative occurrence must NOT be collapsed merely because generation is the same', async () => {
      const promptAsync = mock(async () => ({}));
      let currentJob = {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        terminalUnreconciled: true,
        state: 'completed',
      };
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
        getJob: () => currentJob,
      });

      // First occurrence
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).toHaveBeenCalledTimes(1);

      // Now a different authoritative occurrence arrives for the same task and same generation
      currentJob = {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-2',
        terminalUnreconciled: true,
        state: 'completed',
      };
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-2',
        state: 'completed',
      });
      // MUST NOT be collapsed merely because generation is the same!
      expect(promptAsync).toHaveBeenCalledTimes(2);
    });

    test('stale generation is suppressed', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
        getJob: () => ({
          taskID: 'task-1',
          generation: 2,
          occurrenceID: 'occ-2',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1, // Stale generation
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).not.toHaveBeenCalled();
    });

    test('stale or already-reconciled occurrence is suppressed', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => false,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: false,
          state: 'completed',
        }),
      });

      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).not.toHaveBeenCalled();
    });

    test('stopped without native task result does NOT trigger canonical reconciliation wake', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          terminalUnreconciled: true,
          state: 'stopped',
        }),
      });

      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        state: 'stopped',
      });
      expect(promptAsync).not.toHaveBeenCalled();
    });

    // P1-3: Do not burn occurrence before success
    test('user wait blocks occurrence; clear wait; same occurrence can reconcile', async () => {
      const promptAsync = mock(async () => ({}));
      let hasWait = true;
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
        hasInputWait: () => hasWait,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      // Blocked by user wait
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).not.toHaveBeenCalled();

      // Clear wait: same occurrence must still be eligible to reconcile!
      hasWait = false;
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).toHaveBeenCalledTimes(1);
    });

    test('fallback blocks occurrence; clear fallback; same occurrence can reconcile', async () => {
      const promptAsync = mock(async () => ({}));
      let fallback = true;
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
        isFallbackInProgress: () => fallback,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      // Blocked by fallback
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).not.toHaveBeenCalled();

      // Clear fallback: same occurrence must still be eligible to reconcile!
      fallback = false;
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).toHaveBeenCalledTimes(1);
    });

    test('host snapshot failure does not permanently discard occurrence', async () => {
      let failSnapshot = true;
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({
          promptAsync,
          status: mock(async () => {
            if (failSnapshot) return null;
            return { data: {} };
          }),
        }),
        hasTerminalUnreconciled: () => true,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).not.toHaveBeenCalled();

      failSnapshot = false;
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).toHaveBeenCalledTimes(1);
    });

    test('prompt failure does not permanently discard occurrence', async () => {
      let promptShouldFail = true;
      const promptAsync = mock(async () => {
        if (promptShouldFail) throw new Error('dispatch failed');
        return {};
      });
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      try {
        await (scheduler as any).triggerReconciliationWake('p1', {
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          state: 'completed',
        });
      } catch {}
      expect(promptAsync).toHaveBeenCalledTimes(1);

      promptShouldFail = false;
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).toHaveBeenCalledTimes(2);
    });

    // P1-4: Reconciliation wake prompt text must NOT authorize continuation
    test('reconciliation prompt text does not authorize continuation or completion', () => {
      const text = ORCHESTRATOR_RECONCILIATION_WAKE_TEXT.toLowerCase();
      expect(text).not.toContain('continue remaining');
      expect(text).not.toContain('complete remaining');
      expect(text).not.toContain('continue or complete');
      expect(text).not.toContain('resume autonomous');
      expect(text).toContain('reconcile');
      expect(text).toContain('do not infer permission to continue');
    });

    // P1-5: Preserve stopped recovery
    test('stopped with terminalUnreconciled does not self-lock stopped recovery', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => true,
      });

      // Stopped recovery should proceed even if terminalUnreconciled is true
      scheduler.triggerStoppedJobRecovery('p1');
      await clock.advance(0);
      expect(promptAsync).toHaveBeenCalledTimes(1);
      const call = promptAsync.mock.calls[0][0];
      const text = call.body?.parts?.[0]?.text ?? call.parts?.[0]?.text;
      expect(text).toContain(ORCHESTRATOR_STOPPED_JOB_WAKE_TEXT);
    });

    // P1-6: Revalidate after async snapshot
    test('user wait becoming active during async snapshot aborts reconciliation dispatch', async () => {
      const promptAsync = mock(async () => ({}));
      let hasWait = false;
      let resolveStatus: (v: any) => void;
      const statusPromise = new Promise((resolve) => {
        resolveStatus = resolve;
      });

      const { scheduler } = createScheduler({
        sessionClient: makeClient({
          promptAsync,
          status: mock(() => statusPromise),
        }),
        hasInputWait: () => hasWait,
        hasTerminalUnreconciled: () => true,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      const wakePromise = (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });

      // Mutate during async snapshot
      hasWait = true;
      resolveStatus?.({ data: {} });
      await wakePromise;

      expect(promptAsync).not.toHaveBeenCalled();
    });

    test('target becoming reconciled during async snapshot aborts reconciliation dispatch', async () => {
      const promptAsync = mock(async () => ({}));
      let jobReconciled = false;
      let resolveStatus: (v: any) => void;
      const statusPromise = new Promise((resolve) => {
        resolveStatus = resolve;
      });

      const { scheduler } = createScheduler({
        sessionClient: makeClient({
          promptAsync,
          status: mock(() => statusPromise),
        }),
        hasTerminalUnreconciled: () => !jobReconciled,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: !jobReconciled,
          state: 'completed',
        }),
      });

      const wakePromise = (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });

      // Reconciled during async snapshot
      jobReconciled = true;
      resolveStatus?.({ data: {} });
      await wakePromise;

      expect(promptAsync).not.toHaveBeenCalled();
    });

    test('fallback becoming active during async snapshot aborts reconciliation dispatch', async () => {
      const promptAsync = mock(async () => ({}));
      let fallback = false;
      let resolveStatus: (v: any) => void;
      const statusPromise = new Promise((resolve) => {
        resolveStatus = resolve;
      });

      const { scheduler } = createScheduler({
        sessionClient: makeClient({
          promptAsync,
          status: mock(() => statusPromise),
        }),
        isFallbackInProgress: () => fallback,
        hasTerminalUnreconciled: () => true,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled: true,
          state: 'completed',
        }),
      });

      const wakePromise = (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });

      // Fallback starts during async snapshot
      fallback = true;
      resolveStatus?.({ data: {} });
      await wakePromise;

      expect(promptAsync).not.toHaveBeenCalled();
    });

    // Reconciliation -> continuation ordering
    test('reconciliation wake occurs first, then after reconciliation normal continuation occurs', async () => {
      const promptAsync = mock(async () => ({}));
      let terminalUnreconciled = true;
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        hasTerminalUnreconciled: () => terminalUnreconciled,
        getJob: () => ({
          taskID: 'task-1',
          generation: 1,
          occurrenceID: 'occ-1',
          terminalUnreconciled,
          state: 'completed',
        }),
        getWorkIntent: () => ({
          status: 'known' as const,
          intent: {
            objective: 'test',
            successCriteria: 'done',
            state: 'active' as const,
            ownerSessionID: 'p1',
            createdAt: 1,
            updatedAt: 1,
          },
        }),
      });

      // Normal idle schedule is blocked by terminalUnreconciled
      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).not.toHaveBeenCalled();

      // Trigger reconciliation wake
      await (scheduler as any).triggerReconciliationWake('p1', {
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
      });
      expect(promptAsync).toHaveBeenCalledTimes(1);
      const firstCall = promptAsync.mock.calls[0][0];
      const firstText =
        firstCall.body?.parts?.[0]?.text ?? firstCall.parts?.[0]?.text;
      expect(firstText).toContain(ORCHESTRATOR_RECONCILIATION_WAKE_TEXT);

      // Now child is authoritatively reconciled
      terminalUnreconciled = false;

      // Idle occurs again: now normal continuation is allowed
      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).toHaveBeenCalledTimes(2);
      const secondCall = promptAsync.mock.calls[1][0];
      const secondText =
        secondCall.body?.parts?.[0]?.text ?? secondCall.parts?.[0]?.text;
      expect(secondText).toContain(ORCHESTRATOR_WAKE_TEXT);
    });

    // Missing WorkIntent
    test('missing WorkIntent record (undefined) suppresses normal continuation wake', async () => {
      const promptAsync = mock(async () => ({}));
      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync }),
        getWorkIntent: () => undefined,
      });

      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);
      expect(promptAsync).not.toHaveBeenCalled();
    });

    // Explicit ordering assertion
    test('normal continuation preserves ordering: host snapshot -> reconstructed WorkIntent -> reservation -> promptAsync', async () => {
      const executionOrder: string[] = [];
      const promptAsync = mock(async () => {
        executionOrder.push('promptAsync');
        return {};
      });
      const status = mock(async () => {
        executionOrder.push('hostSnapshot');
        return { data: {} };
      });
      const getWorkIntent = mock(async () => {
        executionOrder.push('getWorkIntent');
        return {
          status: 'known' as const,
          intent: {
            objective: 'test',
            successCriteria: 'done',
            state: 'active' as const,
            ownerSessionID: 'p1',
            createdAt: 1,
            updatedAt: 1,
          },
        };
      });

      const { scheduler } = createScheduler({
        sessionClient: makeClient({ promptAsync, status }),
        getWorkIntent,
      });

      await scheduler.event({
        event: { type: 'session.idle', properties: { sessionID: 'p1' } },
      });
      await clock.advance(60_000);

      expect(executionOrder).toEqual([
        'hostSnapshot',
        'hostSnapshot',
        'getWorkIntent',
        'promptAsync',
      ]);
    });

    // Production listener wiring contract for all canonical outcomes
    test('production listener contract: completed, error, and cancelled trigger reconciliation wake with occurrenceID', () => {
      const calls: any[] = [];
      const fakeScheduler = {
        triggerReconciliationWake: (sessionID: string, target: any) => {
          calls.push({ type: 'reconciliation', sessionID, target });
        },
        triggerStoppedJobRecovery: (sessionID: string) => {
          calls.push({ type: 'stopped', sessionID });
        },
      };

      // Handler matching src/index.ts wiring using toCanonicalReconciliationTarget
      const listener = (record: any) => {
        if (!record.terminalUnreconciled) return;
        if (record.state === 'stopped') {
          fakeScheduler.triggerStoppedJobRecovery(record.parentSessionID);
          return;
        }
        const target = toCanonicalReconciliationTarget(record);
        if (target) {
          void fakeScheduler.triggerReconciliationWake(
            record.parentSessionID,
            target,
          );
        }
      };

      // Completed
      listener({
        taskID: 't1',
        parentSessionID: 'p1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
        terminalUnreconciled: true,
      });
      expect(calls).toEqual([
        {
          type: 'reconciliation',
          sessionID: 'p1',
          target: {
            taskID: 't1',
            generation: 1,
            occurrenceID: 'occ-1',
            state: 'completed',
          },
        },
      ]);

      // Error
      calls.length = 0;
      listener({
        taskID: 't1',
        parentSessionID: 'p1',
        generation: 1,
        occurrenceID: 'occ-err',
        state: 'error',
        terminalUnreconciled: true,
      });
      expect(calls).toEqual([
        {
          type: 'reconciliation',
          sessionID: 'p1',
          target: {
            taskID: 't1',
            generation: 1,
            occurrenceID: 'occ-err',
            state: 'error',
          },
        },
      ]);

      // Cancelled
      calls.length = 0;
      listener({
        taskID: 't1',
        parentSessionID: 'p1',
        generation: 1,
        occurrenceID: 'occ-cancel',
        state: 'cancelled',
        terminalUnreconciled: true,
      });
      expect(calls).toEqual([
        {
          type: 'reconciliation',
          sessionID: 'p1',
          target: {
            taskID: 't1',
            generation: 1,
            occurrenceID: 'occ-cancel',
            state: 'cancelled',
          },
        },
      ]);

      // Stopped -> goes to stopped recovery, NOT reconciliation
      calls.length = 0;
      listener({
        taskID: 't1',
        parentSessionID: 'p1',
        generation: 1,
        state: 'stopped',
        terminalUnreconciled: true,
      });
      expect(calls).toEqual([
        {
          type: 'stopped',
          sessionID: 'p1',
        },
      ]);

      // terminalUnreconciled false -> ignored
      calls.length = 0;
      listener({
        taskID: 't1',
        parentSessionID: 'p1',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
        terminalUnreconciled: false,
      });
      expect(calls).toEqual([]);
    });
  });

  describe('URV1-03 Repair V3: P1-B and P1-C Authoritative Redrive & Consumption Semantics', () => {
    test('P1-B: parent busy at terminal arrival -> later parent idle lifecycle event re-evaluates authoritative unreconciled state -> dispatches wake', async () => {
      let isBusy = true;
      let promptCallCount = 0;
      let promptParts: unknown[] = [];
      const records = new Map<string, BackgroundJobRecord>();
      records.set('job-1', {
        taskID: 'job-1',
        parentSessionID: 'parent-busy',
        generation: 1,
        occurrenceID: 'occ-1',
        state: 'completed',
        terminalUnreconciled: true,
        launchedAt: 100,
      } as BackgroundJobRecord);

      const client = {
        session: {
          get: mock(async () => ({ data: { id: 'mock-session' } })),
          todo: mock(async () => ({ data: [] })),
          children: mock(async () => ({ data: [] })),
          promptAsync: mock(async (req: { body: { parts: unknown[] } }) => {
            promptCallCount++;
            promptParts = req.body.parts;
          }),
          status: mock(async () => ({
            data: isBusy ? { 'parent-busy': { type: 'busy' } } : {},
          })),
        },
      };

      const scheduler = createOrchestratorWakeScheduler(
        { client: client as never } as never,
        {
          config: { enabled: true, intervalMs: 60_000 },
          shouldManageSession: (id: string) => id === 'parent-busy',
          isSessionBusy: () => isBusy,
          hasInputWait: () => false,
          isFallbackInProgress: () => false,
          hasTerminalUnreconciled: (id: string) => {
            if (id !== 'parent-busy') return false;
            return Array.from(records.values()).some(
              (r) => r.parentSessionID === id && r.terminalUnreconciled,
            );
          },
          getJobRecord: (id: string) => records.get(id),
          resolveReconciliationTarget: (id: string) => {
            const matching = Array.from(records.values())
              .filter(
                (r) =>
                  r.parentSessionID === id &&
                  r.terminalUnreconciled &&
                  isCanonicalTerminalState(r.state),
              )
              .sort((a, b) => a.launchedAt - b.launchedAt);
            if (matching.length === 0) return undefined;
            return {
              taskID: matching[0].taskID,
              generation: matching[0].generation,
              occurrenceID: matching[0].occurrenceID,
            };
          },
        } as never,
      );

      // Terminal arrives while parent is busy
      await scheduler.triggerReconciliationWake('parent-busy', {
        taskID: 'job-1',
        generation: 1,
        occurrenceID: 'occ-1',
      });
      // Initial arrival while busy MUST NOT dispatch prompt
      expect(promptCallCount).toBe(0);

      // Parent finishes turn and becomes idle
      isBusy = false;
      await scheduler.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'parent-busy' },
        },
      });

      // After idle event, authoritative unreconciled state must be re-evaluated and dispatched
      expect(promptCallCount).toBe(1);
      expect((promptParts[0] as { text: string }).text).toContain(
        ORCHESTRATOR_RECONCILIATION_WAKE_TEXT,
      );
    });

    test('P1-B: user wait active at arrival -> wait clears -> dispatches wake', async () => {
      let hasWait = true;
      let promptCallCount = 0;
      const records = new Map<string, BackgroundJobRecord>();
      records.set('job-wait', {
        taskID: 'job-wait',
        parentSessionID: 'parent-wait',
        generation: 1,
        occurrenceID: 'occ-wait-1',
        state: 'completed',
        terminalUnreconciled: true,
        launchedAt: 100,
      } as BackgroundJobRecord);

      const client = {
        session: {
          get: mock(async () => ({ data: { id: 'mock-session' } })),
          todo: mock(async () => ({ data: [] })),
          children: mock(async () => ({ data: [] })),
          promptAsync: mock(async () => {
            promptCallCount++;
          }),
          status: mock(async () => ({
            data: {},
          })),
        },
      };

      const scheduler = createOrchestratorWakeScheduler(
        { client: client as never } as never,
        {
          config: { enabled: true, intervalMs: 60_000 },
          shouldManageSession: (id: string) => id === 'parent-wait',
          isSessionBusy: () => false,
          hasInputWait: () => hasWait,
          isFallbackInProgress: () => false,
          hasTerminalUnreconciled: (id: string) => {
            if (id !== 'parent-wait') return false;
            return Array.from(records.values()).some(
              (r) => r.parentSessionID === id && r.terminalUnreconciled,
            );
          },
          getJobRecord: (id: string) => records.get(id),
          resolveReconciliationTarget: (id: string) => {
            const matching = Array.from(records.values()).filter(
              (r) =>
                r.parentSessionID === id &&
                r.terminalUnreconciled &&
                isCanonicalTerminalState(r.state),
            );
            if (matching.length === 0) return undefined;
            return {
              taskID: matching[0].taskID,
              generation: matching[0].generation,
              occurrenceID: matching[0].occurrenceID,
            };
          },
        } as never,
      );

      // Terminal arrives while wait active
      await scheduler.triggerReconciliationWake('parent-wait', {
        taskID: 'job-wait',
        generation: 1,
        occurrenceID: 'occ-wait-1',
      });
      expect(promptCallCount).toBe(0);

      // Wait clears and idle lifecycle event occurs
      hasWait = false;
      await scheduler.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'parent-wait' },
        },
      });

      expect(promptCallCount).toBe(1);
    });

    test('P1-B: fallback active at arrival -> fallback ends -> dispatches wake', async () => {
      let isFallback = true;
      let promptCallCount = 0;
      const records = new Map<string, BackgroundJobRecord>();
      records.set('job-fb', {
        taskID: 'job-fb',
        parentSessionID: 'parent-fb',
        generation: 1,
        occurrenceID: 'occ-fb-1',
        state: 'error',
        terminalUnreconciled: true,
        launchedAt: 100,
      } as BackgroundJobRecord);

      const client = {
        session: {
          get: mock(async () => ({ data: { id: 'mock-session' } })),
          todo: mock(async () => ({ data: [] })),
          children: mock(async () => ({ data: [] })),
          promptAsync: mock(async () => {
            promptCallCount++;
          }),
          status: mock(async () => ({
            data: {},
          })),
        },
      };

      const scheduler = createOrchestratorWakeScheduler(
        { client: client as never } as never,
        {
          config: { enabled: true, intervalMs: 60_000 },
          shouldManageSession: (id: string) => id === 'parent-fb',
          isSessionBusy: () => false,
          hasInputWait: () => false,
          isFallbackInProgress: () => isFallback,
          hasTerminalUnreconciled: (id: string) => {
            if (id !== 'parent-fb') return false;
            return Array.from(records.values()).some(
              (r) => r.parentSessionID === id && r.terminalUnreconciled,
            );
          },
          getJobRecord: (id: string) => records.get(id),
          resolveReconciliationTarget: (id: string) => {
            const matching = Array.from(records.values()).filter(
              (r) =>
                r.parentSessionID === id &&
                r.terminalUnreconciled &&
                isCanonicalTerminalState(r.state),
            );
            if (matching.length === 0) return undefined;
            return {
              taskID: matching[0].taskID,
              generation: matching[0].generation,
              occurrenceID: matching[0].occurrenceID,
            };
          },
        } as never,
      );

      // Terminal arrives while fallback active
      await scheduler.triggerReconciliationWake('parent-fb', {
        taskID: 'job-fb',
        generation: 1,
        occurrenceID: 'occ-fb-1',
      });
      expect(promptCallCount).toBe(0);

      // Fallback ends and idle event occurs
      isFallback = false;
      await scheduler.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'parent-fb' },
        },
      });

      expect(promptCallCount).toBe(1);
    });

    test('P1-C: prompt succeeds but job remains unreconciled -> redrives on subsequent idle event (fingerprint does not permanently suppress)', async () => {
      let promptCallCount = 0;
      const records = new Map<string, BackgroundJobRecord>();
      const job: BackgroundJobRecord = {
        taskID: 'job-p1c',
        parentSessionID: 'parent-p1c',
        generation: 1,
        occurrenceID: 'occ-p1c-1',
        state: 'completed',
        terminalUnreconciled: true,
        launchedAt: 100,
      } as BackgroundJobRecord;
      records.set('job-p1c', job);

      const client = {
        session: {
          get: mock(async () => ({ data: { id: 'mock-session' } })),
          todo: mock(async () => ({ data: [] })),
          children: mock(async () => ({ data: [] })),
          promptAsync: mock(async () => {
            promptCallCount++;
          }),
          status: mock(async () => ({
            data: {},
          })),
        },
      };

      const scheduler = createOrchestratorWakeScheduler(
        { client: client as never } as never,
        {
          config: { enabled: true, intervalMs: 60_000 },
          shouldManageSession: (id: string) => id === 'parent-p1c',
          isSessionBusy: () => false,
          hasInputWait: () => false,
          isFallbackInProgress: () => false,
          hasTerminalUnreconciled: (id: string) => {
            if (id !== 'parent-p1c') return false;
            return Array.from(records.values()).some(
              (r) => r.parentSessionID === id && r.terminalUnreconciled,
            );
          },
          getJobRecord: (id: string) => records.get(id),
          resolveReconciliationTarget: (id: string) => {
            const matching = Array.from(records.values()).filter(
              (r) =>
                r.parentSessionID === id &&
                r.terminalUnreconciled &&
                isCanonicalTerminalState(r.state),
            );
            if (matching.length === 0) return undefined;
            return {
              taskID: matching[0].taskID,
              generation: matching[0].generation,
              occurrenceID: matching[0].occurrenceID,
            };
          },
        } as never,
      );

      // 1. Initial wake dispatch
      await scheduler.triggerReconciliationWake('parent-p1c', {
        taskID: 'job-p1c',
        generation: 1,
        occurrenceID: 'occ-p1c-1',
      });
      expect(promptCallCount).toBe(1);

      // 2. Parent turn ended without reconciling the job (job remains terminalUnreconciled === true)
      // On V2, this subsequent idle event was permanently suppressed by progress.lastFingerprint === fingerprint!
      await scheduler.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'parent-p1c' },
        },
      });

      // Because job is STILL unreconciled on the board, reconciliation must redrive!
      expect(promptCallCount).toBe(2);

      // 3. Now parent reconciles the job (terminalUnreconciled becomes false)
      job.terminalUnreconciled = false;

      // 4. Future idle event must observe reconciled state and STOP
      await scheduler.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'parent-p1c' },
        },
      });
      expect(promptCallCount).toBe(2);
    });

    test('one-flight target loss: one-flight collision drains targetless pending and resolves authoritative target and validates exact identity', async () => {
      let promptCallCount = 0;
      const records = new Map<string, BackgroundJobRecord>();
      const job: BackgroundJobRecord = {
        taskID: 'job-flight',
        parentSessionID: 'parent-flight',
        generation: 1,
        occurrenceID: 'occ-flight-1',
        state: 'completed',
        terminalUnreconciled: true,
        launchedAt: 100,
      } as BackgroundJobRecord;
      records.set('job-flight', job);

      let resolvePromptPromise: () => void;
      const promptPromise = new Promise<void>((resolve) => {
        resolvePromptPromise = resolve;
      });
      let promptReachedResolve: () => void;
      const promptReached = new Promise<void>((resolve) => {
        promptReachedResolve = resolve;
      });

      const client = {
        session: {
          get: mock(async () => ({ data: { id: 'mock-session' } })),
          todo: mock(async () => ({ data: [] })),
          children: mock(async () => ({ data: [] })),
          promptAsync: mock(async () => {
            promptCallCount++;
            if (promptCallCount === 1) {
              promptReachedResolve();
              await promptPromise;
            }
          }),
          status: mock(async () => ({
            data: {},
          })),
        },
      };

      let resolvedTargetCount = 0;
      const scheduler = createOrchestratorWakeScheduler(
        { client: client as never } as never,
        {
          config: { enabled: true, intervalMs: 60_000 },
          shouldManageSession: (id: string) => id === 'parent-flight',
          isSessionBusy: () => false,
          hasInputWait: () => false,
          isFallbackInProgress: () => false,
          hasTerminalUnreconciled: (id: string) => {
            if (id !== 'parent-flight') return false;
            return Array.from(records.values()).some(
              (r) => r.parentSessionID === id && r.terminalUnreconciled,
            );
          },
          getJobRecord: (id: string) => records.get(id),
          resolveReconciliationTarget: (id: string) => {
            resolvedTargetCount++;
            const matching = Array.from(records.values()).filter(
              (r) =>
                r.parentSessionID === id &&
                r.terminalUnreconciled &&
                isCanonicalTerminalState(r.state),
            );
            if (matching.length === 0) return undefined;
            return {
              taskID: matching[0].taskID,
              generation: matching[0].generation,
              occurrenceID: matching[0].occurrenceID,
            };
          },
        } as never,
      );

      // First call initiates promptAsync (blocked on promptPromise)
      const firstFlight = scheduler.triggerReconciliationWake('parent-flight', {
        taskID: 'job-flight',
        generation: 1,
        occurrenceID: 'occ-flight-1',
      });

      // Wait until first flight actually reaches promptAsync
      await promptReached;

      // Second call arrives while first is in-flight -> hits one-flight pending collision
      await scheduler.triggerReconciliationWake('parent-flight', {
        taskID: 'job-flight',
        generation: 1,
        occurrenceID: 'occ-flight-1',
      });

      expect(promptCallCount).toBe(1);

      // Now release first prompt
      resolvePromptPromise?.();
      await firstFlight;

      // Allow pending drain to execute
      await Promise.resolve();
      await clock.advance(10);

      // In V3, targetless pending drain resolves target from board and validates identity
      expect(resolvedTargetCount).toBeGreaterThan(0);
    });

    test('multiple results: two outstanding canonical unreconciled children are resolved and reconciled sequentially', async () => {
      let promptCallCount = 0;
      const promptedTasks: string[] = [];
      const records = new Map<string, BackgroundJobRecord>();

      const jobA: BackgroundJobRecord = {
        taskID: 'task-A',
        parentSessionID: 'parent-multi',
        generation: 1,
        occurrenceID: 'occ-A',
        state: 'completed',
        terminalUnreconciled: true,
        launchedAt: 100,
      } as BackgroundJobRecord;

      const jobB: BackgroundJobRecord = {
        taskID: 'task-B',
        parentSessionID: 'parent-multi',
        generation: 1,
        occurrenceID: 'occ-B',
        state: 'error',
        terminalUnreconciled: true,
        launchedAt: 200,
      } as BackgroundJobRecord;

      records.set('task-A', jobA);
      records.set('task-B', jobB);

      const client = {
        session: {
          get: mock(async () => ({ data: { id: 'mock-session' } })),
          todo: mock(async () => ({ data: [] })),
          children: mock(async () => ({ data: [] })),
          promptAsync: mock(async () => {
            promptCallCount++;
          }),
          status: mock(async () => ({
            data: {},
          })),
        },
      };

      const scheduler = createOrchestratorWakeScheduler(
        { client: client as never } as never,
        {
          config: { enabled: true, intervalMs: 60_000 },
          shouldManageSession: (id: string) => id === 'parent-multi',
          isSessionBusy: () => false,
          hasInputWait: () => false,
          isFallbackInProgress: () => false,
          hasTerminalUnreconciled: (id: string) => {
            if (id !== 'parent-multi') return false;
            return Array.from(records.values()).some(
              (r) => r.parentSessionID === id && r.terminalUnreconciled,
            );
          },
          getJobRecord: (id: string) => records.get(id),
          resolveReconciliationTarget: (id: string) => {
            const matching = Array.from(records.values())
              .filter(
                (r) =>
                  r.parentSessionID === id &&
                  r.terminalUnreconciled &&
                  isCanonicalTerminalState(r.state),
              )
              .sort(
                (a, b) =>
                  a.launchedAt - b.launchedAt ||
                  a.taskID.localeCompare(b.taskID),
              );
            if (matching.length === 0) return undefined;
            promptedTasks.push(matching[0].taskID);
            return {
              taskID: matching[0].taskID,
              generation: matching[0].generation,
              occurrenceID: matching[0].occurrenceID,
            };
          },
        } as never,
      );

      // 1. Initial wake triggers for task-A (or targetless)
      await scheduler.triggerReconciliationWake('parent-multi');
      expect(promptCallCount).toBe(1);
      expect(promptedTasks).toEqual(['task-A']);

      // 2. Parent reconciles task-A
      jobA.terminalUnreconciled = false;

      // 3. Parent becomes idle -> task-B is discovered and dispatched!
      await scheduler.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'parent-multi' },
        },
      });
      expect(promptCallCount).toBe(2);
      expect(promptedTasks).toEqual(['task-A', 'task-B']);

      // 4. Parent reconciles task-B
      jobB.terminalUnreconciled = false;

      // 5. Subsequent idle event -> nothing left unreconciled, stops
      await scheduler.event({
        event: {
          type: 'session.idle',
          properties: { sessionID: 'parent-multi' },
        },
      });
      expect(promptCallCount).toBe(2);
    });
  });
});
