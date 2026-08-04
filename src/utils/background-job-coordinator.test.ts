import { describe, expect, mock, test } from 'bun:test';
import { BackgroundJobBoard } from './background-job-board';
import { BackgroundJobCoordinator } from './background-job-coordinator';
import type { BackgroundJobTransition } from './background-job-store';

function createMockBoard(isRunning = false) {
  return {
    isRunning: mock(() => isRunning),
    getState: mock(() => (isRunning ? 'running' : 'completed')),
    addTerminalStateListener: mock(() => {}),
    removeTerminalStateListener: mock(() => {}),
  } as any;
}

describe('BackgroundJobCoordinator', () => {
  test('deferIfRunning returns false when job is running', () => {
    const board = createMockBoard(true);
    const coordinator = new BackgroundJobCoordinator(board);
    expect(coordinator.deferIfRunning('ses_123')).toBe(false);
  });

  test('deferIfRunning returns true when job is not running', () => {
    const board = createMockBoard(false);
    const coordinator = new BackgroundJobCoordinator(board);
    expect(coordinator.deferIfRunning('ses_123')).toBe(true);
  });

  test('retryDeferredClose returns false when not in deferred set', () => {
    const board = createMockBoard(false);
    const coordinator = new BackgroundJobCoordinator(board);
    expect(coordinator.retryDeferredClose('ses_123')).toBe(false);
  });

  test('retryDeferredClose returns true after job completes', () => {
    const board = createMockBoard(true);
    const coordinator = new BackgroundJobCoordinator(board);

    // First call defers (job running)
    expect(coordinator.deferIfRunning('ses_123')).toBe(false);

    // Now simulate job completion
    board.isRunning.mockReturnValue(false);
    expect(coordinator.retryDeferredClose('ses_123')).toBe(true);
  });

  test('clearDeferredClose removes from deferred set', () => {
    const board = createMockBoard(true);
    const coordinator = new BackgroundJobCoordinator(board);

    coordinator.deferIfRunning('ses_123');
    coordinator.clearDeferredClose('ses_123');

    // Now retryDeferredClose should return false (not in set)
    board.isRunning.mockReturnValue(false);
    expect(coordinator.retryDeferredClose('ses_123')).toBe(false);
  });

  test('handleTerminalState notifies listeners when retryDeferredClose returns true', () => {
    const board = createMockBoard(true);
    const coordinator = new BackgroundJobCoordinator(board);
    const listener = mock(() => {});

    coordinator.addTerminalStateListener(listener);

    // Defer the session
    coordinator.deferIfRunning('ses_123');

    // Simulate terminal state notification from board
    board.getState.mockReturnValue('completed');
    board.isRunning.mockReturnValue(false);

    // Trigger handleTerminalState via board's listener callback
    const boardListener = board.addTerminalStateListener.mock.calls[0]?.[0];
    boardListener?.('ses_123');

    expect(listener).toHaveBeenCalledWith('ses_123');
  });

  test('handleTerminalState does not notify when not in deferred set', () => {
    const board = createMockBoard(false);
    const coordinator = new BackgroundJobCoordinator(board);
    const listener = mock(() => {});

    coordinator.addTerminalStateListener(listener);

    // Simulate terminal state notification without deferring first
    board.getState.mockReturnValue('completed');
    const boardListener = board.addTerminalStateListener.mock.calls[0]?.[0];
    boardListener?.('ses_123');

    expect(listener).not.toHaveBeenCalled();
  });

  test('throws in one coordinator listener does not prevent subsequent listeners from receiving notification', () => {
    const board = createMockBoard(true);
    const coordinator = new BackgroundJobCoordinator(board);
    const order: string[] = [];

    coordinator.addTerminalStateListener(() => {
      throw new Error('first listener failed');
    });
    coordinator.addTerminalStateListener(() => {
      order.push('second');
    });

    // Defer the session
    coordinator.deferIfRunning('ses_123');

    // Simulate terminal state notification from board
    board.getState.mockReturnValue('completed');
    board.isRunning.mockReturnValue(false);

    // Trigger handleTerminalState via board's listener callback
    const boardListener = board.addTerminalStateListener.mock.calls[0]?.[0];
    boardListener?.('ses_123');

    expect(order).toEqual(['second']);
  });

  test('full chain: board terminal → coordinator → listener for deferred job', () => {
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board);
    const listener = mock(() => {});
    coordinator.addTerminalStateListener(listener);

    // Register and start a job
    board.registerLaunch({
      taskID: 'full-chain-test',
      parentSessionID: 'parent-1',
      agent: 'explorer',
    });
    board.updateStatus({
      taskID: 'full-chain-test',
      state: 'running',
    });

    // Defer close while job is running
    expect(coordinator.deferIfRunning('full-chain-test')).toBe(false);

    // Transition to completed — board fires listener, coordinator re-checks
    board.updateStatus({
      taskID: 'full-chain-test',
      state: 'completed',
    });

    expect(listener).toHaveBeenCalledWith('full-chain-test');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('observes lifecycle transitions with minimal state', () => {
    const transitions: BackgroundJobTransition[] = [];
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board, (transition) => {
      transitions.push(transition);
    });

    coordinator.registerLaunch({
      taskID: 'task-a',
      parentSessionID: 'parent-a',
      agent: 'explorer',
      now: 1,
    });
    coordinator.markRunningFromLiveSession('task-a', 2);
    coordinator.updateStatus({ taskID: 'task-a', state: 'completed', now: 3 });
    coordinator.markReconciled('task-a', 4);

    coordinator.registerLaunch({
      taskID: 'task-b',
      parentSessionID: 'parent-a',
      agent: 'explorer',
      now: 5,
    });
    coordinator.markCancelled('task-b', 'stopped', 6);

    expect(transitions.map((transition) => transition.operation)).toEqual([
      'launch',
      'live-busy',
      'status',
      'reconciled',
      'launch',
      'cancelled',
    ]);
    expect(transitions[0]).toEqual({
      operation: 'launch',
      taskID: 'task-a',
      parentSessionID: 'parent-a',
      resultState: 'running',
      terminalUnreconciled: false,
      cancellationRequested: false,
      statusUncertain: false,
      timedOut: false,
    });
    expect(transitions[2]).toMatchObject({
      operation: 'status',
      taskID: 'task-a',
      priorState: 'running',
      resultState: 'completed',
      terminalUnreconciled: true,
    });
    expect(transitions[5]).toMatchObject({
      operation: 'cancelled',
      taskID: 'task-b',
      priorState: 'running',
      resultState: 'cancelled',
      cancellationRequested: true,
      terminalUnreconciled: true,
    });
    expect(transitions[0]).not.toHaveProperty('description');
    expect(transitions[0]).not.toHaveProperty('contextFiles');
  });

  test('observes status output mutations exactly once', () => {
    const transitions: BackgroundJobTransition[] = [];
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board, (transition) => {
      transitions.push(transition);
    });

    coordinator.registerLaunch({
      taskID: 'status-output',
      parentSessionID: 'parent-a',
      agent: 'explorer',
    });
    transitions.length = 0;

    const result = coordinator.updateFromStatusOutput(
      [
        'task_id: status-output',
        'state: completed',
        '<task_result>',
        'done',
        '</task_result>',
      ].join('\n'),
    );

    expect(result).toMatchObject({
      taskID: 'status-output',
      state: 'completed',
      resultSummary: 'done',
    });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({
      operation: 'status',
      taskID: 'status-output',
      priorState: 'running',
      resultState: 'completed',
    });
  });

  test('does not observe malformed or no-op status output', () => {
    const transitions: BackgroundJobTransition[] = [];
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board, (transition) => {
      transitions.push(transition);
    });

    coordinator.updateFromStatusOutput('not a task status');
    coordinator.updateFromStatusOutput(
      ['task_id: missing', 'state: completed'].join('\n'),
    );

    expect(transitions).toEqual([]);
  });

  test('suppresses observations for guarded and missing mutations', () => {
    const transitions: BackgroundJobTransition[] = [];
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board, (transition) => {
      transitions.push(transition);
    });

    coordinator.updateStatus({ taskID: 'missing', state: 'completed' });
    coordinator.markRunningFromLiveSession('missing');
    coordinator.markReconciled('missing');
    coordinator.markCancelled('missing');
    coordinator.drop('missing');
    coordinator.clearParent('missing-parent');

    coordinator.registerLaunch({
      taskID: 'guarded',
      parentSessionID: 'guarded-parent',
      agent: 'explorer',
    });
    coordinator.updateStatus({ taskID: 'guarded', state: 'completed' });
    coordinator.updateStatus({ taskID: 'guarded', state: 'running' });
    coordinator.markReconciled('guarded');
    coordinator.markReconciled('guarded');
    coordinator.markCancelled('guarded');

    expect(transitions.map((transition) => transition.operation)).toEqual([
      'launch',
      'status',
      'reconciled',
    ]);
  });

  test('correlates removals with the records captured before deletion', () => {
    const transitions: BackgroundJobTransition[] = [];
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board, (transition) => {
      transitions.push(transition);
    });

    coordinator.registerLaunch({
      taskID: 'drop-me',
      parentSessionID: 'parent-a',
      agent: 'explorer',
    });
    coordinator.registerLaunch({
      taskID: 'clear-me',
      parentSessionID: 'parent-a',
      agent: 'explorer',
    });

    coordinator.drop('drop-me');
    coordinator.clearParent('parent-a');

    expect(
      transitions.filter((transition) => transition.operation === 'drop'),
    ).toEqual([
      expect.objectContaining({
        operation: 'drop',
        taskID: 'drop-me',
        parentSessionID: 'parent-a',
        priorState: 'running',
        terminalUnreconciled: false,
      }),
    ]);
    expect(
      transitions.filter(
        (transition) => transition.operation === 'clear-parent',
      ),
    ).toEqual([
      expect.objectContaining({
        operation: 'clear-parent',
        taskID: 'clear-me',
        parentSessionID: 'parent-a',
        priorState: 'running',
        terminalUnreconciled: false,
      }),
    ]);
  });

  test('observer failures do not interrupt board mutations', () => {
    const board = new BackgroundJobBoard();
    const observer = mock(() => {
      throw new Error('observer failed');
    });
    const coordinator = new BackgroundJobCoordinator(board, observer);

    expect(() =>
      coordinator.registerLaunch({
        taskID: 'survives-observer',
        parentSessionID: 'parent-a',
        agent: 'explorer',
      }),
    ).not.toThrow();

    expect(observer).toHaveBeenCalledTimes(1);
    expect(board.get('survives-observer')).toBeDefined();
  });
});
