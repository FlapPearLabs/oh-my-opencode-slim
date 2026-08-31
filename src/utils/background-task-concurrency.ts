export interface BackgroundTaskConcurrencyConfig {
  defaultConcurrency: number;
  providerConcurrency: Readonly<Record<string, number>>;
  modelConcurrency: Readonly<Record<string, number>>;
}

export interface BackgroundTaskConcurrencyRequest {
  model?: string;
}

export interface BackgroundTaskConcurrencyTicket {
  readonly ready: Promise<void>;
  bind(taskID: string): void;
  release(): void;
  releaseIfUnbound(): void;
}

interface QueueEntry {
  id: number;
  model?: string;
  provider?: string;
  started: boolean;
  released: boolean;
  taskID?: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

export class BackgroundTaskConcurrencyQueueCancelledError extends Error {
  constructor() {
    super('Background task concurrency queue was cancelled');
    this.name = 'BackgroundTaskConcurrencyQueueCancelledError';
  }
}

/**
 * Process-local admission scheduler for native background task launches.
 *
 * Queued requests are admitted in order, but entries whose provider or model
 * quota is saturated are skipped in favor of admittable later entries
 * (FIFO with skip). A ticket owns capacity from the moment its `ready`
 * promise resolves until the bound task reaches a terminal state. The job
 * board still owns task lifecycle; this scheduler only controls admission.
 */
export class BackgroundTaskConcurrency {
  private readonly waiting: QueueEntry[] = [];
  private readonly active = new Set<QueueEntry>();
  private readonly activeByProvider = new Map<string, number>();
  private readonly activeByModel = new Map<string, number>();
  private readonly activeByTaskID = new Map<string, QueueEntry>();
  private nextID = 0;
  private disposed = false;

  constructor(private readonly config: BackgroundTaskConcurrencyConfig) {}

  acquire(
    request: BackgroundTaskConcurrencyRequest,
  ): BackgroundTaskConcurrencyTicket {
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const model = normalizeModel(request.model);
    const entry: QueueEntry = {
      id: ++this.nextID,
      model,
      provider: providerFromModel(model),
      started: false,
      released: false,
      resolve: resolveReady,
      reject: rejectReady,
    };

    if (this.disposed) {
      entry.released = true;
      rejectReady(new BackgroundTaskConcurrencyQueueCancelledError());
    } else {
      this.waiting.push(entry);
      this.pump();
    }

    return {
      ready,
      bind: (taskID) => this.bind(entry, taskID),
      release: () => this.release(entry),
      releaseIfUnbound: () => {
        if (entry.taskID === undefined) this.release(entry);
      },
    };
  }

  releaseTask(taskID: string): void {
    const entry = this.activeByTaskID.get(taskID);
    if (entry) this.release(entry);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of [...this.waiting, ...this.active]) {
      this.release(entry);
    }
  }

  /** Test/diagnostic seam. */
  snapshot(): { active: number; queued: number } {
    return { active: this.active.size, queued: this.waiting.length };
  }

  private bind(entry: QueueEntry, taskID: string): void {
    if (!entry.started || entry.released || !taskID) return;
    if (entry.taskID === taskID) return;
    if (entry.taskID !== undefined) {
      this.activeByTaskID.delete(entry.taskID);
    }
    entry.taskID = taskID;
    this.activeByTaskID.set(taskID, entry);
  }

  private pump(): void {
    if (this.disposed) return;

    while (true) {
      const index = this.waiting.findIndex((entry) => this.canStart(entry));
      if (index < 0) return;
      const [entry] = this.waiting.splice(index, 1);
      if (!entry || entry.released) continue;

      entry.started = true;
      this.active.add(entry);
      increment(this.activeByProvider, entry.provider);
      increment(this.activeByModel, entry.model);
      entry.resolve();
    }
  }

  private canStart(entry: QueueEntry): boolean {
    const defaultLimit = enabledLimit(this.config.defaultConcurrency);
    if (defaultLimit !== undefined && this.active.size >= defaultLimit) {
      return false;
    }

    const providerLimit = entry.provider
      ? enabledLimit(this.config.providerConcurrency[entry.provider])
      : undefined;
    if (
      providerLimit !== undefined &&
      (this.activeByProvider.get(entry.provider ?? '') ?? 0) >= providerLimit
    ) {
      return false;
    }

    const modelLimit = entry.model
      ? enabledLimit(this.config.modelConcurrency[entry.model])
      : undefined;
    return (
      modelLimit === undefined ||
      (this.activeByModel.get(entry.model ?? '') ?? 0) < modelLimit
    );
  }

  private release(entry: QueueEntry): void {
    if (entry.released) return;
    entry.released = true;

    const waitingIndex = this.waiting.indexOf(entry);
    if (waitingIndex >= 0) {
      this.waiting.splice(waitingIndex, 1);
      entry.reject(new BackgroundTaskConcurrencyQueueCancelledError());
      this.pump();
      return;
    }

    if (entry.started) {
      this.active.delete(entry);
      decrement(this.activeByProvider, entry.provider);
      decrement(this.activeByModel, entry.model);
    }
    if (entry.taskID !== undefined) {
      this.activeByTaskID.delete(entry.taskID);
    }
    this.pump();
  }
}

function normalizeModel(model: string | undefined): string | undefined {
  const value = model?.trim();
  return value || undefined;
}

function providerFromModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const slash = model.indexOf('/');
  return slash > 0 ? model.slice(0, slash) : undefined;
}

function enabledLimit(limit: number | undefined): number | undefined {
  return typeof limit === 'number' && limit > 0 ? limit : undefined;
}

function increment(map: Map<string, number>, key: string | undefined): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function decrement(map: Map<string, number>, key: string | undefined): void {
  if (!key) return;
  const next = (map.get(key) ?? 0) - 1;
  if (next > 0) map.set(key, next);
  else map.delete(key);
}
