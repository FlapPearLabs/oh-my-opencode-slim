import type {
  BackgroundJobBoard,
  BackgroundJobLaunchInput,
  BackgroundJobRecord,
  BackgroundJobStatusInput,
  ContextFile,
} from './background-job-board';
import type {
  BackgroundJobStore,
  BackgroundJobTransition,
} from './background-job-store';
import { log } from './logger';
import { parseTaskStatusOutput, type TaskOutputState } from './task';

type TerminalStateListener = (taskID: string) => void;
type TransitionObserver = (transition: BackgroundJobTransition) => void;
type BackgroundJobCoordinatorOptions = {
  onTransition?: TransitionObserver;
};

/**
 * BackgroundJobCoordinator owns the lifecycle policy for background jobs.
 * It sits between the board and its consumers, providing:
 * - Subscription interface for terminal state notifications (replaces fire-and-forget)
 * - Lifecycle policy: determines when jobs are terminal, when closes should be deferred
 * - Single-writer contract: coordinator is the sole writer to the board
 *
 * The board's guards prevent silent overwrites. The coordinator adds:
 * - Centralized notification with guaranteed delivery
 * - Re-checks board state before notifying (handles races)
 */
export class BackgroundJobCoordinator implements BackgroundJobStore {
  private terminalStateListeners: TerminalStateListener[] = [];
  // Stores session IDs (which equal task IDs) awaiting close after background job completes
  private readonly deferredIdleCloses = new Set<string>();
  private readonly transitionObserver?: TransitionObserver;

  constructor(
    private readonly board: BackgroundJobBoard,
    transitionObserver?: TransitionObserver | BackgroundJobCoordinatorOptions,
  ) {
    this.transitionObserver =
      typeof transitionObserver === 'function'
        ? transitionObserver
        : transitionObserver?.onTransition;
    // Subscribe to the board's terminal state notifications
    this.board.addTerminalStateListener((taskID) => {
      this.handleTerminalState(taskID);
    });
  }

  // ── Terminal state notification (guaranteed delivery) ─────────────

  addTerminalStateListener(listener: TerminalStateListener): void {
    this.terminalStateListeners.push(listener);
  }

  removeTerminalStateListener(listener: TerminalStateListener): void {
    this.terminalStateListeners = this.terminalStateListeners.filter(
      (entry) => entry !== listener,
    );
  }

  /**
   * Handle terminal state from board. Re-checks board state to handle races.
   * This is the centralized lifecycle policy.
   */
  private handleTerminalState(taskID: string): void {
    // Re-check board state to handle races
    const state = this.board.getState(taskID);
    if (state === undefined) return; // Job was already cleaned up

    // Check if this session should now close
    if (this.retryDeferredClose(taskID)) {
      // Notify listeners that session should close
      for (const listener of this.terminalStateListeners) {
        try {
          listener(taskID);
        } catch (error) {
          log('Coordinator terminal state listener threw', {
            taskID,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  // ── Lifecycle policy ─────────────────────────────────────────────

  /**
   * Evaluate close policy. Returns true if session should close now.
   * Mutates deferred state: adds to deferred set if running, removes if not.
   */
  deferIfRunning(sessionId: string): boolean {
    if (!this.board.isRunning(sessionId)) {
      this.deferredIdleCloses.delete(sessionId);
      return true;
    }
    this.deferredIdleCloses.add(sessionId);
    return false;
  }

  /**
   * Retry closing a deferred session. Called when a background job completes.
   * Returns true if the session should now close.
   */
  retryDeferredClose(sessionId: string): boolean {
    if (!this.deferredIdleCloses.has(sessionId)) return false;
    return this.deferIfRunning(sessionId);
  }

  /**
   * Clear deferred close state for a session being deleted.
   */
  clearDeferredClose(sessionId: string): void {
    this.deferredIdleCloses.delete(sessionId);
  }

  // ── Mutation methods (sole writer to board) ──────────────────────

  registerLaunch(input: BackgroundJobLaunchInput): BackgroundJobRecord {
    const before = this.board.get(input.taskID);
    const result = this.board.registerLaunch(input);
    if (result !== before) {
      this.observeTransition(this.createTransition('launch', before, result));
    }
    return result;
  }

  updateStatus(
    input: BackgroundJobStatusInput,
  ): BackgroundJobRecord | undefined {
    const before = this.board.get(input.taskID);
    const result = this.board.updateStatus(input);
    if (result !== undefined && result !== before) {
      this.observeTransition(this.createTransition('status', before, result));
    }
    return result;
  }

  updateFromStatusOutput(output: string): BackgroundJobRecord | undefined {
    const status = parseTaskStatusOutput(output);
    if (!status) return undefined;

    return this.updateStatus({
      taskID: status.taskID,
      state: status.state,
      timedOut: status.timedOut,
      resultSummary: status.result,
    });
  }

  markRunningFromLiveSession(
    taskID: string,
    now = Date.now(),
  ): BackgroundJobRecord | undefined {
    const before = this.board.get(taskID);
    const result = this.board.markRunningFromLiveSession(taskID, now);
    if (result !== undefined && result !== before) {
      this.observeTransition(
        this.createTransition('live-busy', before, result),
      );
    }
    return result;
  }

  markReconciled(
    taskID: string,
    now = Date.now(),
  ): BackgroundJobRecord | undefined {
    const before = this.board.get(taskID);
    const result = this.board.markReconciled(taskID, now);
    if (result !== undefined && result !== before) {
      this.observeTransition(
        this.createTransition('reconciled', before, result),
      );
    }
    return result;
  }

  markCancelled(
    taskID: string,
    reason?: string,
    now = Date.now(),
    options: { force?: boolean } = {},
  ): BackgroundJobRecord | undefined {
    const before = this.board.get(taskID);
    const result = this.board.markCancelled(taskID, reason, now, options);
    if (result !== undefined && result !== before) {
      this.observeTransition(
        this.createTransition('cancelled', before, result),
      );
    }
    return result;
  }

  // ── Query methods ────────────────────────────────────────────────

  get(taskID: string): BackgroundJobRecord | undefined {
    return this.board.get(taskID);
  }

  field<K extends keyof BackgroundJobRecord>(
    taskID: string,
    key: K,
  ): BackgroundJobRecord[K] | undefined {
    return this.board.field(taskID, key);
  }

  isRunning(taskID: string): boolean {
    return this.board.isRunning(taskID);
  }

  isTerminalUnreconciled(taskID: string): boolean {
    return this.board.isTerminalUnreconciled(taskID);
  }

  getResultSummary(taskID: string): string | undefined {
    return this.board.getResultSummary(taskID);
  }

  getLastLiveBusyAt(taskID: string): number | undefined {
    return this.board.getLastLiveBusyAt(taskID);
  }

  getParentSessionID(taskID: string): string | undefined {
    return this.board.getParentSessionID(taskID);
  }

  getState(taskID: string): TaskOutputState | 'reconciled' | undefined {
    return this.board.getState(taskID);
  }

  resolve(
    parentSessionID: string,
    taskIDOrAlias: string,
  ): BackgroundJobRecord | undefined {
    return this.board.resolve(parentSessionID, taskIDOrAlias);
  }

  resolveReusable(
    parentSessionID: string,
    taskIDOrAlias: string,
    agent?: string,
  ): BackgroundJobRecord | undefined {
    return this.board.resolveReusable(parentSessionID, taskIDOrAlias, agent);
  }

  resolveRecoverable(
    parentSessionID: string,
    taskIDOrAlias: string,
    agent?: string,
  ): BackgroundJobRecord | undefined {
    return this.board.resolveRecoverable(parentSessionID, taskIDOrAlias, agent);
  }

  markUsed(parentSessionID: string, key: string, now = Date.now()): void {
    this.board.markUsed(parentSessionID, key, now);
  }

  taskIDs(): Set<string> {
    return this.board.taskIDs();
  }

  addContext(taskID: string, files: ContextFile[]): void {
    this.board.addContext(taskID, files);
  }

  list(parentSessionID?: string): BackgroundJobRecord[] {
    return this.board.list(parentSessionID);
  }

  hasRunning(parentSessionID: string): boolean {
    return this.board.hasRunning(parentSessionID);
  }

  hasTerminalUnreconciled(parentSessionID: string): boolean {
    return this.board.hasTerminalUnreconciled(parentSessionID);
  }

  hasConvergenceSignals(taskID: string, threshold = 3): boolean {
    return this.board.hasConvergenceSignals(taskID, threshold);
  }

  formatForPrompt(
    parentSessionID: string,
    now = Date.now(),
  ): string | undefined {
    return this.board.formatForPrompt(parentSessionID, now);
  }

  clearParent(parentSessionID: string): void {
    const affectedJobs = this.board.list(parentSessionID);
    this.board.clearParent(parentSessionID);
    for (const job of affectedJobs) {
      if (this.board.get(job.taskID) === undefined) {
        this.observeTransition(
          this.createTransition('clear-parent', job, undefined),
        );
      }
    }
  }

  drop(taskID: string): void {
    const before = this.board.get(taskID);
    this.board.drop(taskID);
    if (before && this.board.get(taskID) === undefined) {
      this.observeTransition(this.createTransition('drop', before, undefined));
    }
  }

  private observeTransition(transition: BackgroundJobTransition): void {
    if (!this.transitionObserver) return;

    try {
      this.transitionObserver(transition);
    } catch (error) {
      log('Coordinator transition observer threw', {
        operation: transition.operation,
        taskID: transition.taskID,
        parentSessionID: transition.parentSessionID,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createTransition(
    operation: BackgroundJobTransition['operation'],
    prior: BackgroundJobRecord | undefined,
    result: BackgroundJobRecord | undefined,
  ): BackgroundJobTransition {
    const record = result ?? prior;
    if (!record) {
      throw new Error(
        'Cannot create a background job transition without a record',
      );
    }

    return {
      operation,
      taskID: record.taskID,
      parentSessionID: record.parentSessionID,
      priorState: prior?.state,
      resultState: result?.state,
      terminalUnreconciled: record.terminalUnreconciled,
      cancellationRequested: record.cancellationRequested,
      statusUncertain: record.statusUncertain,
      timedOut: record.timedOut,
    };
  }
}
