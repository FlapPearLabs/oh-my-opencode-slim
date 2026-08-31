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

type ConcurrencyTier = 'model' | 'provider' | 'default';

interface QueueEntry {
  id: number;
  model?: string;
  provider?: string;
  /** Resolved cap tier. Only ONE tier applies per task (model > provider > default). */
  tier: ConcurrencyTier;
  /** Key counted against for model/provider tiers (model ID or provider ID). */
  key?: string;
  /** Resolved cap for the tier; Infinity when the tier is unlimited (0). */
  limit: number;
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
 * Limits follow the reference implementation's override semantics: a model
 * cap for the task's model wins over a provider cap for its provider, which
 * wins over the default cap — only the most specific configured cap applies.
 * A configured value of `0` means unlimited for that key. Queued requests are
 * admitted in order, but entries whose resolved tier is saturated are skipped
 * in favor of admittable later entries (FIFO with skip). A ticket owns
 * capacity from the moment its `ready` promise resolves until the bound task
 * reaches a terminal state. The job board still owns task lifecycle; this
 * scheduler only controls admission.
 *
 * State is scoped to the scheduler instance. The plugin factory can re-run
 * on config updates (see src/agents/index.ts), and the scheduler is created
 * once per project through `getBackgroundTaskConcurrency` so admission state
 * (running slots AND queued tickets) survives re-inits. `restoreTask` covers
 * the one case the shared instance cannot: a genuine process restart that
 * resumes a still-running task from persisted message history.
 */
export class BackgroundTaskConcurrency {
  private readonly waiting: QueueEntry[] = [];
  private readonly active = new Set<QueueEntry>();
  private readonly activeByKey = new Map<string, number>();
  private readonly activeByTaskID = new Map<string, QueueEntry>();
  private activeDefault = 0;
  private nextID = 0;
  private disposed = false;

  constructor(private config: BackgroundTaskConcurrencyConfig) {}

  /**
   * Apply a new configuration to this instance (used when the plugin factory
   * re-runs with changed config). Both running slots and queued tickets are
   * re-resolved against the new config: active entries move their accounting
   * to the tier their model now resolves to (so a newly lowered cap starts
   * counting tasks that were admitted under an unlimited/looser config), and
   * the queue re-pumps. Existing tasks are never terminated by a config
   * change — a running task that now exceeds a tightened cap keeps running
   * and blocks new admissions until it finishes.
   */
  updateConfig(config: BackgroundTaskConcurrencyConfig): void {
    this.config = config;
    for (const entry of this.active) {
      const tier = resolveTier(this.config, entry.model);
      if (
        tier.tier === entry.tier &&
        tier.key === entry.key &&
        tier.limit === entry.limit
      ) {
        continue;
      }
      this.untrack(entry);
      entry.tier = tier.tier;
      entry.key = tier.key;
      entry.limit = tier.limit;
      this.track(entry);
    }
    for (const entry of this.waiting) {
      const tier = resolveTier(this.config, entry.model);
      entry.tier = tier.tier;
      entry.key = tier.key;
      entry.limit = tier.limit;
    }
    this.pump();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

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
    const tier = resolveTier(this.config, model);
    const entry: QueueEntry = {
      id: ++this.nextID,
      model,
      provider: providerFromModel(model),
      tier: tier.tier,
      key: tier.key,
      limit: tier.limit,
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

  /**
   * Claim a slot for a task that is already running. Used to restore the
   * admission state after a plugin re-init (or a process restart that resumes
   * a live run), where the fresh scheduler cannot know about tasks that were
   * admitted by a previous generation. Idempotent: a task that already holds
   * a slot is left untouched. Restores bypass the resolved caps because the
   * task is already in flight — we are reconstructing reality, not admitting
   * new work.
   */
  restoreTask(taskID: string, model?: string): void {
    if (this.disposed || !taskID || this.activeByTaskID.has(taskID)) return;
    const normalized = normalizeModel(model);
    const tier = resolveTier(this.config, normalized);
    const entry: QueueEntry = {
      id: ++this.nextID,
      model: normalized,
      provider: providerFromModel(normalized),
      tier: tier.tier,
      key: tier.key,
      limit: tier.limit,
      started: true,
      released: false,
      taskID,
      resolve: () => {},
      reject: () => {},
    };
    this.active.add(entry);
    this.activeByTaskID.set(taskID, entry);
    this.track(entry);
  }

  /**
   * Atomically move a running task's accounting from its admission
   * model/provider to a new model. Keeps provider/model caps correct when a
   * child session switches models mid-flight (foreground fallback, runtime
   * model switch). No-op when the task is unknown or already on that model.
   */
  migrateTask(taskID: string, model: string | undefined): void {
    const entry = this.activeByTaskID.get(taskID);
    if (!entry || entry.released) return;
    const nextModel = normalizeModel(model);
    if (entry.model === nextModel) return;
    const tier = resolveTier(this.config, nextModel);

    this.untrack(entry);
    entry.model = nextModel;
    entry.provider = providerFromModel(nextModel);
    entry.tier = tier.tier;
    entry.key = tier.key;
    entry.limit = tier.limit;
    this.track(entry);
    // Moving a task off a saturated key can free capacity for waiters.
    this.pump();
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
    const existing = this.activeByTaskID.get(taskID);
    if (existing && existing !== entry) {
      // A restored slot already claims this taskID (e.g. the task was
      // rehydrated after a re-init before this ticket got bound). Drop the
      // restored slot so the admitted ticket becomes the single owner.
      this.release(existing);
    }
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
      this.track(entry);
      entry.resolve();
    }
  }

  private canStart(entry: QueueEntry): boolean {
    if (entry.limit === Infinity) return true;
    if (entry.tier === 'default') return this.activeDefault < entry.limit;
    return (this.activeByKey.get(entry.key ?? '') ?? 0) < entry.limit;
  }

  private track(entry: QueueEntry): void {
    if (entry.limit === Infinity) return;
    if (entry.tier === 'default') {
      this.activeDefault += 1;
    } else {
      increment(this.activeByKey, entry.key);
    }
  }

  private untrack(entry: QueueEntry): void {
    if (entry.limit === Infinity) return;
    if (entry.tier === 'default') {
      this.activeDefault -= 1;
    } else {
      decrement(this.activeByKey, entry.key);
    }
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
      this.untrack(entry);
    }
    if (entry.taskID !== undefined) {
      this.activeByTaskID.delete(entry.taskID);
    }
    this.pump();
  }
}

// ── Process-scoped shared instances ──────────────────────────────────────
//
// The plugin factory re-runs on every config update (Instance.dispose →
// re-init). A scheduler created inside the factory would lose its running
// slots AND its queued tickets on every re-init. These module-level instances
// survive re-inits: the factory calls `getBackgroundTaskConcurrency` with the
// (possibly changed) config, which reuses the instance for the same project.
//
// One instance per project directory: multiple plugin instances (different
// OpenCode workspaces in one process) must not share a queue or overwrite
// each other's caps. Only a genuine process restart resets them —
// `restoreTask` (wired into historical run rehydration) then reclaims slots
// for tasks still running.

const schedulersByDirectory = new Map<string, BackgroundTaskConcurrency>();

/**
 * Return the process-scoped scheduler for a project directory, applying
 * `config` when the instance already exists (plugin re-init). Instances are
 * isolated per directory so concurrent plugin instances never share admission
 * state. Recreates an instance after a dispose so a caller that tore the
 * scheduler down (tests, genuine unload) gets a fresh one instead of a
 * permanently cancelled instance.
 */
export function getBackgroundTaskConcurrency(
  directory: string,
  config: BackgroundTaskConcurrencyConfig,
): BackgroundTaskConcurrency {
  const key = directory || 'default';
  const existing = schedulersByDirectory.get(key);
  if (!existing || existing.isDisposed()) {
    const scheduler = new BackgroundTaskConcurrency(config);
    schedulersByDirectory.set(key, scheduler);
    return scheduler;
  }
  existing.updateConfig(config);
  return existing;
}

/** Test seam: drop all shared instances between tests. */
export function resetBackgroundTaskConcurrencyForTests(): void {
  schedulersByDirectory.clear();
}

/** Resolve the single applicable cap tier for a model (model > provider > default). */
function resolveTier(
  config: BackgroundTaskConcurrencyConfig,
  model: string | undefined,
): { tier: ConcurrencyTier; key?: string; limit: number } {
  if (model !== undefined) {
    const modelLimit = config.modelConcurrency[model];
    if (modelLimit !== undefined) {
      return { tier: 'model', key: model, limit: enabledLimit(modelLimit) };
    }
    const provider = providerFromModel(model);
    if (provider !== undefined) {
      const providerLimit = config.providerConcurrency[provider];
      if (providerLimit !== undefined) {
        return {
          tier: 'provider',
          key: provider,
          limit: enabledLimit(providerLimit),
        };
      }
    }
  }
  return { tier: 'default', limit: enabledLimit(config.defaultConcurrency) };
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

/** 0 (and absent/negative) means unlimited; a positive value caps the tier. */
function enabledLimit(limit: number | undefined): number {
  return typeof limit === 'number' && limit > 0 ? limit : Infinity;
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
