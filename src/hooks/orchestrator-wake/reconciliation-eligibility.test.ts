import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { BackgroundJobBoard, BackgroundJobCoordinator } from '../../utils';
import { createTaskSessionManagerHook } from '../task-session-manager';
import {
  createOrchestratorWakeScheduler,
  toCanonicalReconciliationTarget,
} from './index';
import { resetOrchestratorWakeGateForTests } from './wake-gate';

class ManualClock {
  private now = 10_000;
  nowMs(): number {
    return this.now;
  }
  advance(ms: number): void {
    this.now += ms;
  }
}

function makeClient(options?: {
  promptAsync?: (...args: any[]) => Promise<any>;
}) {
  return {
    session: {
      promptAsync: options?.promptAsync ?? mock(async () => ({})),
      get: mock(async () => ({
        data: {
          id: 'p1',
          status: { type: 'idle' },
        },
      })),
      todo: mock(async () => ({ data: [] })),
      children: mock(async () => ({ data: [] })),
      status: mock(async () => ({ data: { type: 'idle' } })),
    },
  } as any;
}

function createTestScheduler(client: any, options?: Record<string, any>) {
  const ctx = {
    directory: '/tmp/test',
    client,
  } as any;

  return createOrchestratorWakeScheduler(ctx, {
    config: {
      enabled: true,
      intervalMs: 60_000,
    },
    intervalMs: 60_000,
    shouldManageSession: () => true,
    hasInputWait: () => false,
    ...options,
  } as any);
}

describe('URV1-03 Repair V4: Strict Reconciliation Eligibility (RED Tests)', () => {
  beforeEach(() => {
    resetOrchestratorWakeGateForTests();
  });

  // RED-1: session.error producer is occurrence-less -> must NOT dispatch reconciliation wake
  test('RED-1: session.error terminal record without occurrenceID must NOT dispatch reconciliation wake', async () => {
    const promptAsync = mock(async () => ({}));
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board);
    const clock = new ManualClock();

    const scheduler = createTestScheduler(makeClient({ promptAsync }), {
      nowMs: () => clock.nowMs(),
      hasTerminalUnreconciled: (sessionID: string) =>
        coordinator.hasTerminalUnreconciled(sessionID),
      getJob: (taskID: string) => coordinator.get(taskID),
      isJobTerminalUnreconciled: (taskID: string) =>
        coordinator.isTerminalUnreconciled(taskID),
      resolveReconciliationTarget: (sessionID: string) => {
        const records = coordinator.list(sessionID);
        for (const r of records) {
          const target = toCanonicalReconciliationTarget(r);
          if (target) return target;
        }
        return undefined;
      },
    });

    // Wire terminal outcome listener with canonical eligibility check (matches src/index.ts)
    coordinator.addTerminalOutcomeListener((record) => {
      if (!record.terminalUnreconciled) return;
      if (record.state === 'stopped') {
        scheduler.triggerStoppedJobRecovery(record.parentSessionID);
        return;
      }
      const target = toCanonicalReconciliationTarget(record);
      if (target) {
        void scheduler.triggerReconciliationWake(
          record.parentSessionID,
          target,
        );
      }
    });

    // Register a running background job (registerLaunch sets state: 'running')
    coordinator.registerLaunch({
      taskID: 'task-err-1',
      parentSessionID: 'parent-1',
      agent: 'explorer',
      description: 'exploring',
    });

    // Simulate session.error via board.updateStatus (creates state: 'error' with no occurrenceID)
    board.updateStatus({
      taskID: 'task-err-1',
      state: 'error',
      resultSummary: 'Child session crashed',
    });

    const job = coordinator.get('task-err-1');
    expect(job).toBeDefined();
    expect(job?.state).toBe('error');
    expect(job?.terminalUnreconciled).toBe(true);
    expect(job?.occurrenceID).toBeUndefined();

    // The listener must NOT have dispatched a reconciliation wake
    expect(promptAsync).not.toHaveBeenCalled();

    // Calling resolveReconciliationTarget directly must also ignore this occurrence-less record
    const resolved = toCanonicalReconciliationTarget(job);
    expect(resolved).toBeUndefined();
  });

  // RED-2: direct cancellation or timeout without occurrenceID -> must NOT dispatch reconciliation wake
  test('RED-2: direct cancellation or timeout without occurrenceID must NOT dispatch reconciliation wake', async () => {
    const promptAsync = mock(async () => ({}));
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board);
    const clock = new ManualClock();

    const scheduler = createTestScheduler(makeClient({ promptAsync }), {
      nowMs: () => clock.nowMs(),
      hasTerminalUnreconciled: (sessionID: string) =>
        coordinator.hasTerminalUnreconciled(sessionID),
      getJob: (taskID: string) => coordinator.get(taskID),
      isJobTerminalUnreconciled: (taskID: string) =>
        coordinator.isTerminalUnreconciled(taskID),
    });

    coordinator.addTerminalOutcomeListener((record) => {
      if (!record.terminalUnreconciled) return;
      if (record.state === 'stopped') {
        scheduler.triggerStoppedJobRecovery(record.parentSessionID);
        return;
      }
      const target = toCanonicalReconciliationTarget(record);
      if (target) {
        void scheduler.triggerReconciliationWake(
          record.parentSessionID,
          target,
        );
      }
    });

    coordinator.registerLaunch({
      taskID: 'task-cancel-1',
      parentSessionID: 'parent-1',
      agent: 'explorer',
      description: 'cancelling',
    });

    // Cancel without occurrenceID
    coordinator.updateStatus({
      taskID: 'task-cancel-1',
      state: 'cancelled',
    });

    const job = coordinator.get('task-cancel-1');
    expect(job?.state).toBe('cancelled');
    expect(job?.terminalUnreconciled).toBe(true);
    expect(job?.occurrenceID).toBeUndefined();
    expect(promptAsync).not.toHaveBeenCalled();
    expect(toCanonicalReconciliationTarget(job)).toBeUndefined();
  });

  // RED-3: targetless resolver with mixed records (A: occurrence-less, B: reliable occurrence)
  test('RED-3: targetless resolver MUST ignore occurrence-less records and pick reliable occurrence record, or undefined if none', () => {
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board);

    // Register two jobs for parent-1
    coordinator.registerLaunch({
      taskID: 'task-a',
      parentSessionID: 'parent-1',
      agent: 'explorer',
      description: 'job A',
    });
    coordinator.registerLaunch({
      taskID: 'task-b',
      parentSessionID: 'parent-1',
      agent: 'explorer',
      description: 'job B',
    });

    // A completes with NO occurrenceID
    coordinator.updateStatus({
      taskID: 'task-a',
      state: 'completed',
    });

    // Resolver function matching production wiring
    const resolveReconciliationTarget = (sessionID: string) => {
      const records = coordinator.list(sessionID);
      for (const r of records) {
        const target = toCanonicalReconciliationTarget(r);
        if (target) return target;
      }
      return undefined;
    };

    // When only A exists (occurrence-less), resolver MUST return undefined
    expect(resolveReconciliationTarget('parent-1')).toBeUndefined();

    // B completes WITH authoritative occurrenceID
    coordinator.updateStatus({
      taskID: 'task-b',
      state: 'completed',
      occurrenceID: 'occ-task-b-1',
    });

    // Now resolver MUST return B
    const resolved = resolveReconciliationTarget('parent-1');
    expect(resolved).toEqual({
      taskID: 'task-b',
      generation: 2,
      occurrenceID: 'occ-task-b-1',
      state: 'completed',
    });
  });

  // RED-4: explicit target without occurrenceID called to triggerReconciliationWake
  test('RED-4: explicit target without occurrenceID passed to triggerReconciliationWake MUST NOT prompt', async () => {
    const promptAsync = mock(async () => ({}));
    const scheduler = createTestScheduler(makeClient({ promptAsync }), {
      hasTerminalUnreconciled: () => true,
      getJob: () => ({
        taskID: 'task-1',
        generation: 1,
        state: 'completed',
        terminalUnreconciled: true,
        // job has no occurrenceID either
      }),
    });

    // Call with missing occurrenceID
    await scheduler.triggerReconciliationWake('parent-1', {
      taskID: 'task-1',
      generation: 1,
      state: 'completed',
    } as any);

    expect(promptAsync).not.toHaveBeenCalled();

    // Call with empty / whitespace occurrenceID
    await scheduler.triggerReconciliationWake('parent-1', {
      taskID: 'task-1',
      generation: 1,
      occurrenceID: '   ',
      state: 'completed',
    } as any);

    expect(promptAsync).not.toHaveBeenCalled();
  });

  // RED-5: target claims occurrenceID but authoritative job has none
  test('RED-5: target claims occurrenceID but authoritative job has none MUST NOT prompt', async () => {
    const promptAsync = mock(async () => ({}));
    const scheduler = createTestScheduler(makeClient({ promptAsync }), {
      hasTerminalUnreconciled: () => true,
      getJob: () => ({
        taskID: 'task-1',
        generation: 1,
        occurrenceID: undefined,
        state: 'completed',
        terminalUnreconciled: true,
      }),
    });

    await scheduler.triggerReconciliationWake('parent-1', {
      taskID: 'task-1',
      generation: 1,
      occurrenceID: 'occ-claimed-by-target',
      state: 'completed',
    } as any);

    expect(promptAsync).not.toHaveBeenCalled();
  });

  // RED-6: mismatched occurrence between target and authoritative job
  test('RED-6: mismatched occurrenceID between target and authoritative job MUST NOT prompt', async () => {
    const promptAsync = mock(async () => ({}));
    const scheduler = createTestScheduler(makeClient({ promptAsync }), {
      hasTerminalUnreconciled: () => true,
      getJob: () => ({
        taskID: 'task-1',
        generation: 1,
        occurrenceID: 'occ-authoritative-job',
        state: 'completed',
        terminalUnreconciled: true,
      }),
    });

    await scheduler.triggerReconciliationWake('parent-1', {
      taskID: 'task-1',
      generation: 1,
      occurrenceID: 'occ-different-target',
      state: 'completed',
    } as any);

    expect(promptAsync).not.toHaveBeenCalled();
  });

  // RED-7: existing board-injection owner consumes occurrence-less terminal state
  test('RED-7: occurrence-less terminal state remains outside reconciliation wake, keeps terminalUnreconciled=true, and is reconciled via existing prompt-board consumption', async () => {
    const promptAsync = mock(async () => ({}));
    const board = new BackgroundJobBoard();

    // 1. Create an occurrence-less terminal board record
    board.registerLaunch({
      taskID: 'task-occ-less',
      parentSessionID: 'parent-7',
      agent: 'explorer',
      description: 'search files',
    });

    board.updateStatus({
      taskID: 'task-occ-less',
      state: 'error',
      resultSummary: 'command timed out',
      // No occurrenceID
    });

    const record = board.get('task-occ-less');
    expect(record).toBeDefined();
    expect(record?.state).toBe('error');
    expect(record?.occurrenceID).toBeUndefined();

    // 2. Verify terminalUnreconciled === true, no canonical target produced, no wake dispatched
    expect(record?.terminalUnreconciled).toBe(true);
    expect(toCanonicalReconciliationTarget(record)).toBeUndefined();

    // Production listener simulation
    const target = toCanonicalReconciliationTarget(record);
    if (target) {
      await promptAsync('reconciliation wake');
    }
    expect(promptAsync).not.toHaveBeenCalled();

    // 3. Set up task-session-manager hook for board injection / consumption
    const hook = createTaskSessionManagerHook(
      {
        client: {
          session: {
            status: mock(async () => ({ data: {} })),
            get: mock(async () => ({ data: { id: 'parent-7' } })),
          },
        },
        directory: '/tmp',
        worktree: '/tmp',
      } as any,
      {
        backgroundJobBoard: board,
        strategy: 'checkpoint-compatible',
        idleReconcileDelayMs: 0,
        shouldManageSession: () => true,
      } as any,
    );

    // Initial message container for parent session
    const messages = {
      messages: [
        {
          info: { role: 'user', agent: 'orchestrator', sessionID: 'parent-7' },
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ],
    };

    // 4. Inject/display the board through existing prompt-board path
    await hook.injectBackgroundJobBoard({}, messages as any);

    // Still terminalUnreconciled until consumed
    expect(board.get('task-occ-less')?.terminalUnreconciled).toBe(true);

    // 5. Simulate parent idle event indicating prompt was consumed
    await (hook as any).event({
      event: {
        type: 'session.status',
        properties: { sessionID: 'parent-7', status: { type: 'idle' } },
      },
    });

    // Wait for idle reconcile delay (0ms)
    await new Promise((resolve) => setTimeout(resolve, 15));

    // 6. Verify existing board delivery/consumption cleared terminalUnreconciled and marked reconciled
    const reconciledJob = board.get('task-occ-less');
    expect(reconciledJob?.terminalUnreconciled).toBe(false);
    expect(reconciledJob?.state).toBe('reconciled');
  });
});
