import { describe, expect, test } from 'bun:test';
import { BackgroundJobBoard } from '../../utils';
import type { PendingTaskCall } from './pending-call-tracker';
import { handleToolExecuteBefore } from './tool-execute-hooks';

function createDependencies(board: BackgroundJobBoard) {
  const pendingCalls: PendingTaskCall[] = [];
  const deps = {
    shouldManageSession: () => true,
    backgroundJobBoard: board,
    pendingCallTracker: {
      add(call: PendingTaskCall) {
        pendingCalls.push(call);
      },
      pendingCallId: () => 'pending-1',
    },
    taskContextTracker: { pendingManagedTaskIds: new Set<string>() },
  } satisfies Parameters<typeof handleToolExecuteBefore>[2];

  return { deps, pendingCalls };
}

function reusableJob(board: BackgroundJobBoard) {
  const record = board.registerLaunch({
    taskID: 'ses_reusable',
    parentSessionID: 'parent-1',
    agent: 'explorer',
    description: 'reusable session',
  });
  board.updateStatus({
    taskID: record.taskID,
    state: 'completed',
  });
  board.markReconciled(record.taskID);
  return record;
}

function nonReusableAliasJob(board: BackgroundJobBoard) {
  const record = board.registerLaunch({
    taskID: 'ses_unreconciled',
    parentSessionID: 'parent-1',
    agent: 'explorer',
    description: 'unreconciled session',
  });
  board.updateStatus({
    taskID: record.taskID,
    state: 'completed',
  });
  return record;
}

describe('handleToolExecuteBefore task_id validation', () => {
  test('rejects a reusable alias with its canonical taskID', async () => {
    const board = new BackgroundJobBoard();
    const record = reusableJob(board);
    const { deps, pendingCalls } = createDependencies(board);
    const output = {
      args: { subagent_type: 'explorer', task_id: 'exp-1' },
    };

    await expect(
      handleToolExecuteBefore(
        { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
        output,
        deps,
      ),
    ).rejects.toThrow(`resolves to resumable session ${record.taskID}`);
    expect(output.args.task_id).toBe('exp-1');
    expect(pendingCalls).toHaveLength(0);
    expect(
      board.acquireRelaunchLease(record.taskID, record.generation),
    ).toBeDefined();
  });

  test('rejects a known non-reusable alias with a lifecycle error', async () => {
    const board = new BackgroundJobBoard();
    nonReusableAliasJob(board);
    const { deps, pendingCalls } = createDependencies(board);
    const output = {
      args: { subagent_type: 'explorer', task_id: 'exp-1' },
    };

    await expect(
      handleToolExecuteBefore(
        { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
        output,
        deps,
      ),
    ).rejects.toThrow('cannot be resumed because its session is not reusable');
    expect(pendingCalls).toHaveLength(0);
  });

  test('rejects a known non-reusable canonical task ID', async () => {
    const board = new BackgroundJobBoard();
    const record = nonReusableAliasJob(board);
    const { deps, pendingCalls } = createDependencies(board);
    const output = {
      args: { subagent_type: 'explorer', task_id: record.taskID },
    };

    await expect(
      handleToolExecuteBefore(
        { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
        output,
        deps,
      ),
    ).rejects.toThrow('cannot be resumed because its session is not reusable');
    expect(output.args.task_id).toBe(record.taskID);
    expect(pendingCalls).toHaveLength(0);
    const lease = board.acquireRelaunchLease(record.taskID, record.generation);
    expect(lease).toBeDefined();
    if (lease) board.releaseLease(lease);
  });

  test('rejects an unknown noncanonical task ID', async () => {
    const board = new BackgroundJobBoard();
    const { deps, pendingCalls } = createDependencies(board);
    const output = {
      args: { subagent_type: 'explorer', task_id: 'exp-99' },
    };

    await expect(
      handleToolExecuteBefore(
        { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
        output,
        deps,
      ),
    ).rejects.toThrow(
      'Omit task_id to create a new session or use a full canonical ses_... ID to resume',
    );
    expect(pendingCalls).toHaveLength(0);
  });

  test('keeps canonical task IDs on the valid resume path', async () => {
    const board = new BackgroundJobBoard();
    const record = reusableJob(board);
    const { deps, pendingCalls } = createDependencies(board);
    const output = {
      args: { subagent_type: 'explorer', task_id: record.taskID },
    };

    await handleToolExecuteBefore(
      { tool: 'task', sessionID: 'parent-1', callID: 'call-1' },
      output,
      deps,
    );

    expect(output.args.task_id).toBe(record.taskID);
    expect(pendingCalls).toHaveLength(1);
    expect(pendingCalls[0]?.resumedTaskId).toBe(record.taskID);
    expect(
      board.acquireRelaunchLease(record.taskID, record.generation),
    ).toBeUndefined();
  });
});
