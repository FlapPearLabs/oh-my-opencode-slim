import { describe, expect, test } from 'bun:test';
import { BackgroundJobBoard } from '../../utils/background-job-board';
import { BackgroundJobCoordinator } from '../../utils/background-job-coordinator';
import { getBackgroundJobLifecycleLedger } from '../../utils/background-job-store';
import {
  type InjectionState,
  updateFromInjectedCompletion,
} from './board-injection';
import { updateBackgroundJobFromOutput } from './status-utils';

import { createTaskContextTracker } from './task-context-tracker';

function createMockInjectionState(board: BackgroundJobBoard): InjectionState {
  const store = getBackgroundJobLifecycleLedger(board);
  const taskContextTracker = createTaskContextTracker();
  return {
    backgroundJobBoard: board,
    lifecycleLedger: store,
    maxRetainedSnapshots: 10,
    strategy: 'latest',
    processedInjectedCompletions: store.processedInjectedCompletions,
    processedInjectedCompletionOrder: store.processedInjectedCompletionOrder,
    injectedCompletionFences: store.injectedCompletionFences,
    syntheticTerminalOccurrences: store.syntheticTerminalOccurrences,
    syntheticTerminalOccurrenceOrder: store.syntheticTerminalOccurrenceOrder,
    terminalJobsInjectedByParent: new Map(),
    pendingInjectedTerminalJobsByParent: new Map(),
    retainedBoardSnapshots: new Map(),
    retainedTailBoards: new Map(),
    metadataKey: '__test_board__',
    shouldManageSession: () => true,
    taskContextTracker,
    options: {
      now: () => Date.now(),
    } as never,
  };
}

describe('P1-A: Authoritative occurrence propagation end-to-end', () => {
  test('real synthetic terminal completion: existing authoritative occurrence -> board record receives same exact occurrenceID', () => {
    const board = new BackgroundJobBoard();
    const task = board.registerLaunch({
      taskID: 'task-p1a-1',
      parentSessionID: 'parent-1',
      agent: 'worker',
      description: 'test worker task',
    });

    const state = createMockInjectionState(board);
    const completionPart = {
      type: 'text',
      text: `task_id: ${task.taskID}
state: completed
<task_result>
Task finished successfully with artifacts
</task_result>`,
      synthetic: true,
      occurrenceID: 'occ-auth-12345',
    };
    const message = {
      info: { id: 'msg-abc-1' },
      role: 'assistant',
      parts: [completionPart],
    };

    updateFromInjectedCompletion(
      state,
      completionPart as never,
      message as never,
      0,
      0,
    );

    const record = board.get(task.taskID);
    expect(record).toBeDefined();
    expect(record?.state).toBe('completed');
    // On V2 before P1-A fix: record.occurrenceID is undefined because updateFromInjectedCompletion
    // never passed occurrenceID to updateBackgroundJobFromOutput
    expect(record?.occurrenceID).toBe('occ-auth-12345');
  });

  test('same task + same generation + distinct authoritative occurrence -> board reflects new accepted occurrence', () => {
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board);
    const task = board.registerLaunch({
      taskID: 'task-p1a-2',
      parentSessionID: 'parent-1',
      agent: 'worker',
      description: 'test task 2',
    });

    const state = createMockInjectionState(board);
    const part1 = {
      type: 'text',
      text: `task_id: ${task.taskID}
state: completed
<task_result>
First result
</task_result>`,
      synthetic: true,
      occurrenceID: 'occ-first-111',
    };
    const msg1 = {
      info: { id: 'msg-1' },
      role: 'assistant',
      parts: [part1],
    };

    updateFromInjectedCompletion(state, part1 as never, msg1 as never, 0, 0);
    expect(board.get(task.taskID)?.occurrenceID).toBe('occ-first-111');

    // Terminal outcome listener tracking via coordinator
    const observedOccurrences: (string | undefined)[] = [];
    coordinator.addTerminalOutcomeListener((rec) => {
      observedOccurrences.push(rec.occurrenceID);
    });

    const part2 = {
      type: 'text',
      text: `task_id: ${task.taskID}
state: completed
<task_result>
Updated distinct result
</task_result>`,
      synthetic: true,
      occurrenceID: 'occ-second-222',
    };
    const msg2 = {
      info: { id: 'msg-2' },
      role: 'assistant',
      parts: [part2],
    };

    updateFromInjectedCompletion(state, part2 as never, msg2 as never, 1, 0);

    const updatedRecord = board.get(task.taskID);
    expect(updatedRecord?.occurrenceID).toBe('occ-second-222');
    expect(observedOccurrences).toContain('occ-second-222');
  });

  test('ambiguous/unreliable occurrence does NOT become authoritative board occurrence', () => {
    const board = new BackgroundJobBoard();
    const task = board.registerLaunch({
      taskID: 'task-p1a-3',
      parentSessionID: 'parent-1',
      agent: 'worker',
      description: 'test task 3',
    });

    const state = createMockInjectionState(board);
    // Missing explicit occurrenceID and message.info.id is missing -> legacy/ambiguous
    const ambiguousPart = {
      type: 'text',
      text: `task_id: ${task.taskID}
state: completed
<task_result>
Ambiguous output
</task_result>`,
      synthetic: true,
    };
    const ambiguousMsg = {
      info: {},
      role: 'assistant',
      parts: [ambiguousPart],
    };

    updateFromInjectedCompletion(
      state,
      ambiguousPart as never,
      ambiguousMsg as never,
      0,
      0,
    );

    const record = board.get(task.taskID);
    expect(record).toBeDefined();
    expect(record?.state).toBe('completed');
    expect(record?.occurrenceID).toBeUndefined();
  });

  test('relaunch / new generation clears occurrence and old occurrence cannot leak', () => {
    const board = new BackgroundJobBoard();
    const task = board.registerLaunch({
      taskID: 'task-p1a-4',
      parentSessionID: 'parent-1',
      agent: 'worker',
      description: 'test task 4',
    });

    const state = createMockInjectionState(board);
    const completionPart = {
      type: 'text',
      text: `task_id: ${task.taskID}
state: completed
<task_result>
Done gen 1
</task_result>`,
      synthetic: true,
      occurrenceID: 'occ-gen-1',
    };
    const msg = {
      info: { id: 'msg-1' },
      role: 'assistant',
      parts: [completionPart],
    };

    updateFromInjectedCompletion(
      state,
      completionPart as never,
      msg as never,
      0,
      0,
    );

    // Relaunch for generation 2
    board.registerLaunch({
      taskID: task.taskID,
      parentSessionID: 'parent-1',
      agent: 'worker',
    });
    const relaunched = board.get(task.taskID);
    expect(relaunched?.generation).toBe(2);
    expect(relaunched?.occurrenceID).toBeUndefined();
    expect(relaunched?.terminalUnreconciled).toBe(false);
  });

  test('completed, error, cancelled are each mapped truthfully with occurrence', () => {
    const board = new BackgroundJobBoard();

    // 1. Completed
    board.registerLaunch({
      taskID: 't-comp',
      parentSessionID: 'p1',
      agent: 'w',
    });
    const s1 = createMockInjectionState(board);
    updateFromInjectedCompletion(
      s1,
      {
        type: 'text',
        text: `task_id: t-comp
state: completed
<task_result>
done
</task_result>`,
        synthetic: true,
        occurrenceID: 'occ-c',
      } as never,
      { info: { id: 'm1' }, role: 'assistant', parts: [] } as never,
      0,
      0,
    );
    expect(board.get('t-comp')?.state).toBe('completed');
    expect(board.get('t-comp')?.occurrenceID).toBe('occ-c');

    // 2. Error
    board.registerLaunch({
      taskID: 't-err',
      parentSessionID: 'p1',
      agent: 'w',
    });
    const s2 = createMockInjectionState(board);
    updateFromInjectedCompletion(
      s2,
      {
        type: 'text',
        text: `task_id: t-err
state: error
<task_error>
boom
</task_error>`,
        synthetic: true,
        occurrenceID: 'occ-e',
      } as never,
      { info: { id: 'm2' }, role: 'assistant', parts: [] } as never,
      0,
      0,
    );
    expect(board.get('t-err')?.state).toBe('error');
    expect(board.get('t-err')?.occurrenceID).toBe('occ-e');

    // 3. Cancelled (via updateBackgroundJobFromOutput)
    board.registerLaunch({
      taskID: 't-cancel',
      parentSessionID: 'p1',
      agent: 'w',
    });
    const s3 = createMockInjectionState(board);
    updateBackgroundJobFromOutput(
      `task_id: t-cancel
state: cancelled
<task_result>
cancelled by user
</task_result>`,
      board,
      s3.taskContextTracker,
      { occurrenceID: 'occ-cancel' },
    );
    expect(board.get('t-cancel')?.state).toBe('cancelled');
    expect(board.get('t-cancel')?.occurrenceID).toBe('occ-cancel');
  });

  test('production terminal outcome listener receives actual occurrence from the board', () => {
    const board = new BackgroundJobBoard();
    const coordinator = new BackgroundJobCoordinator(board);
    board.registerLaunch({
      taskID: 't-listener',
      parentSessionID: 'p1',
      agent: 'w',
    });

    let listenerFiredWithOccurrence: string | undefined;
    coordinator.addTerminalOutcomeListener((rec) => {
      listenerFiredWithOccurrence = rec.occurrenceID;
    });

    const state = createMockInjectionState(board);
    updateFromInjectedCompletion(
      state,
      {
        type: 'text',
        text: `task_id: t-listener
state: completed
<task_result>
finished
</task_result>`,
        synthetic: true,
        occurrenceID: 'occ-real-listener',
      } as never,
      { info: { id: 'm1' }, role: 'assistant', parts: [] } as never,
      0,
      0,
    );

    expect(listenerFiredWithOccurrence).toBe('occ-real-listener');
  });
});
