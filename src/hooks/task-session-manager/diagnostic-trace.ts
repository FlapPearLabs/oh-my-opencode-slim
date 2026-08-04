import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BackgroundJobTransition } from '../../utils/background-job-store';
import { getLogDir, log } from '../../utils/logger';

const MAX_QUEUE_RECORDS = 2048;
const MAX_QUEUE_BYTES = 2 * 1024 * 1024;
const DELTA_SUMMARY_INTERVAL = 32;
const MAX_DELTA_ACCUMULATORS = 256;

const FINITE_STATES = new Set([
  'aborted',
  'busy',
  'cancelled',
  'completed',
  'created',
  'deleted',
  'error',
  'failed',
  'idle',
  'pending',
  'queued',
  'reconciled',
  'retry',
  'running',
  'success',
  'timeout',
  'timed_out',
  'waiting',
  'unknown',
]);

const BOARD_OPERATIONS = new Set([
  'launch',
  'status',
  'live-busy',
  'reconciled',
  'cancelled',
  'drop',
  'clear-parent',
]);

const SESSION_EVENTS = new Set([
  'session.created',
  'session.updated',
  'session.deleted',
  'session.idle',
  'session.status',
  'session.error',
  'session.compacted',
  'subagent.session.created',
]);

const MESSAGE_EVENTS = new Set([
  'message.created',
  'message.updated',
  'message.removed',
  'message.part.created',
  'message.part.updated',
  'message.part.delta',
  'message.part.removed',
]);

const INPUT_EVENTS = new Set([
  'permission.asked',
  'permission.replied',
  'permission.rejected',
  'question.asked',
  'question.replied',
  'question.rejected',
]);

type MetadataValue = boolean | number | string;
type Metadata = Record<string, MetadataValue>;

type TraceRecord = {
  sequence: number;
  wallTime: string;
  elapsedMs: number;
  source: string;
  event: string;
  metadata: Metadata;
};

type QueueEntry = {
  line: string;
  bytes: number;
};

type DeltaObservation = {
  event: string;
  metadata: Metadata;
  bytes: number;
};

type DeltaAccumulator = {
  count: number;
  bytes: number;
  reportedCount: number;
  metadata: Metadata;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as UnknownRecord;
}

function readValue(record: UnknownRecord | undefined, key: string): unknown {
  if (!record) return undefined;
  try {
    return record[key];
  } catch {
    return undefined;
  }
}

function readString(
  record: UnknownRecord | undefined,
  key: string,
): string | undefined {
  const value = readValue(record, key);
  return typeof value === 'string' ? value : undefined;
}

function safeId(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 192) {
    return undefined;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@+-]*$/.test(value)) return undefined;
  return value;
}

function safeName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 192) {
    return undefined;
  }
  if (
    value.includes('://') ||
    value.includes('..') ||
    value.startsWith('/') ||
    /^[A-Za-z]:\//.test(value) ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (
        code < 32 || code === 127 || /\s/.test(character) || character === '\\'
      );
    })
  ) {
    return undefined;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@+/-]*$/.test(value)) return undefined;
  return value;
}

function safeEvent(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)
  ) {
    return 'unknown';
  }
  return value;
}

function put(
  metadata: Metadata,
  key: string,
  value: MetadataValue | undefined,
): void {
  if (value !== undefined && metadata[key] === undefined) {
    metadata[key] = value;
  }
}

function putId(
  metadata: Metadata,
  outputKey: string,
  record: UnknownRecord | undefined,
  inputKey: string,
): void {
  put(metadata, outputKey, safeId(readValue(record, inputKey)));
}

function putName(
  metadata: Metadata,
  outputKey: string,
  record: UnknownRecord | undefined,
  inputKey: string,
): void {
  put(metadata, outputKey, safeName(readValue(record, inputKey)));
}

function putState(
  metadata: Metadata,
  outputKey: string,
  record: UnknownRecord | undefined,
  inputKey: string,
): void {
  const value = readValue(record, inputKey);
  if (typeof value === 'string' && FINITE_STATES.has(value)) {
    put(metadata, outputKey, value);
  }
}

function putNumber(
  metadata: Metadata,
  outputKey: string,
  record: UnknownRecord | undefined,
  inputKey: string,
): void {
  const value = readValue(record, inputKey);
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    put(metadata, outputKey, value);
  }
}

function putBoolean(
  metadata: Metadata,
  outputKey: string,
  value: unknown,
): void {
  put(metadata, outputKey, typeof value === 'boolean' ? value : false);
}

function putKnownCorrelationIds(
  metadata: Metadata,
  record: UnknownRecord | undefined,
): void {
  putId(metadata, 'sessionID', record, 'sessionID');
  putId(metadata, 'parentSessionID', record, 'parentSessionID');
  putId(metadata, 'messageID', record, 'messageID');
  putId(metadata, 'partID', record, 'partID');
  putId(metadata, 'callID', record, 'callID');
  putId(metadata, 'taskID', record, 'taskID');
  putId(metadata, 'jobID', record, 'jobID');
}

function putPartStateMetadataCorrelationIds(
  metadata: Metadata,
  record: UnknownRecord | undefined,
): void {
  const childSessionID = safeId(readValue(record, 'sessionId'));
  put(metadata, 'childSessionID', childSessionID);
  putId(metadata, 'parentSessionID', record, 'parentSessionId');
  putId(metadata, 'jobID', record, 'jobId');
  putId(metadata, 'taskID', record, 'taskId');
  putId(metadata, 'callID', record, 'callId');
  putId(metadata, 'messageID', record, 'messageId');
  putId(metadata, 'partID', record, 'partId');
  if (childSessionID !== undefined) {
    put(metadata, 'taskID', childSessionID);
  }
}

function byteLength(value: unknown): number {
  if (typeof value !== 'string') return 0;
  try {
    return Buffer.byteLength(value, 'utf8');
  } catch {
    return 0;
  }
}

function deltaBytes(
  eventName: string,
  properties: UnknownRecord | undefined,
  part: UnknownRecord | undefined,
): { isDelta: boolean; bytes: number } {
  if (eventName !== 'message.part.delta') {
    return { isDelta: false, bytes: 0 };
  }

  let isDelta = true;
  let bytes = 0;

  const propertyDelta = readValue(properties, 'delta');
  const partDelta = readValue(part, 'delta');
  if (propertyDelta !== undefined) {
    isDelta = true;
    bytes += byteLength(propertyDelta);
  }
  if (partDelta !== undefined) {
    isDelta = true;
    bytes += byteLength(partDelta);
  }

  const propertyBytes = readValue(properties, 'deltaBytes');
  if (
    typeof propertyBytes === 'number' &&
    Number.isFinite(propertyBytes) &&
    propertyBytes >= 0
  ) {
    isDelta = true;
    bytes += propertyBytes;
  }
  const partBytes = readValue(part, 'deltaBytes');
  if (
    typeof partBytes === 'number' &&
    Number.isFinite(partBytes) &&
    partBytes >= 0
  ) {
    isDelta = true;
    bytes += partBytes;
  }

  return { isDelta, bytes };
}

function addSessionMetadata(
  metadata: Metadata,
  properties: UnknownRecord | undefined,
): void {
  const info = asRecord(readValue(properties, 'info'));
  putId(metadata, 'sessionID', info, 'id');
  putId(metadata, 'parentSessionID', info, 'parentID');
  putName(metadata, 'agent', info, 'agent');
  putId(metadata, 'sessionID', properties, 'sessionID');

  const status = asRecord(readValue(properties, 'status'));
  putState(metadata, 'state', status, 'type');
  if (readValue(status, 'type') === 'retry') {
    putNumber(metadata, 'retryAttempt', status, 'attempt');
    putNumber(metadata, 'retryNextAt', status, 'next');
  }
}

function addMessageMetadata(
  metadata: Metadata,
  properties: UnknownRecord | undefined,
): UnknownRecord | undefined {
  putKnownCorrelationIds(metadata, properties);
  const info = asRecord(readValue(properties, 'info'));
  putId(metadata, 'messageID', info, 'id');
  putId(metadata, 'sessionID', info, 'sessionID');

  const part = asRecord(readValue(properties, 'part'));
  putKnownCorrelationIds(metadata, part);
  putId(metadata, 'partID', part, 'id');
  const partMetadata = asRecord(readValue(part, 'metadata'));
  putKnownCorrelationIds(metadata, partMetadata);

  const partStateValue = readValue(part, 'state');
  if (typeof partStateValue === 'string') {
    if (FINITE_STATES.has(partStateValue))
      put(metadata, 'state', partStateValue);
  } else {
    const partState = asRecord(partStateValue);
    putState(metadata, 'state', partState, 'status');
    const stateMetadata = asRecord(readValue(partState, 'metadata'));
    putPartStateMetadataCorrelationIds(metadata, stateMetadata);
  }
  return part;
}

function addInputEventMetadata(
  metadata: Metadata,
  eventName: string,
  properties: UnknownRecord | undefined,
): void {
  putId(metadata, 'sessionID', properties, 'sessionID');
  const tool = asRecord(readValue(properties, 'tool'));
  putId(metadata, 'messageID', tool, 'messageID');
  putId(metadata, 'callID', tool, 'callID');

  if (eventName.startsWith('permission.')) {
    putId(metadata, 'permissionID', properties, 'permissionID');
    if (eventName === 'permission.asked') {
      putId(metadata, 'permissionID', properties, 'id');
    }
    putId(metadata, 'requestID', properties, 'requestID');
    putId(metadata, 'requestID', properties, 'id');
    const permission = asRecord(readValue(properties, 'permission'));
    putId(metadata, 'permissionID', permission, 'id');
  } else {
    putId(metadata, 'requestID', properties, 'requestID');
    putId(metadata, 'requestID', properties, 'id');
    putId(metadata, 'questionID', properties, 'questionID');
    if (eventName === 'question.asked') {
      putId(metadata, 'questionID', properties, 'id');
    }
    const question = asRecord(readValue(properties, 'question'));
    putId(metadata, 'questionID', question, 'id');
  }
}

function putToolMetadataCorrelationIds(
  metadata: Metadata,
  record: UnknownRecord | undefined,
  nativeChildSession: boolean,
): void {
  putId(metadata, 'parentSessionID', record, 'parentSessionID');
  putId(metadata, 'jobID', record, 'jobID');
  putId(metadata, 'taskID', record, 'taskID');
  putId(metadata, 'callID', record, 'callID');
  putId(metadata, 'messageID', record, 'messageID');
  putId(metadata, 'partID', record, 'partID');

  putId(metadata, 'parentSessionID', record, 'parentSessionId');
  putId(metadata, 'jobID', record, 'jobId');
  putId(metadata, 'taskID', record, 'taskId');
  putId(metadata, 'callID', record, 'callId');
  putId(metadata, 'messageID', record, 'messageId');
  putId(metadata, 'partID', record, 'partId');

  if (!nativeChildSession) return;
  const childSessionID = safeId(readValue(record, 'sessionId'));
  put(metadata, 'childSessionID', childSessionID);
  if (childSessionID !== undefined) metadata.taskID = childSessionID;
}

function extractHostObservation(
  event: unknown,
  instanceID: string | undefined,
): DeltaObservation {
  const root = unwrapHostEvent(event);
  const properties = asRecord(readValue(root, 'properties'));
  const eventName = safeEvent(readString(root, 'type'));
  const metadata: Metadata = {};
  put(metadata, 'instanceID', instanceID);

  let part: UnknownRecord | undefined;
  if (SESSION_EVENTS.has(eventName)) {
    addSessionMetadata(metadata, properties);
  } else if (MESSAGE_EVENTS.has(eventName)) {
    part = addMessageMetadata(metadata, properties);
  } else if (INPUT_EVENTS.has(eventName)) {
    addInputEventMetadata(metadata, eventName, properties);
  }

  const delta = deltaBytes(eventName, properties, part);
  return {
    event: eventName,
    metadata,
    bytes: delta.bytes,
  };
}

function extractToolMetadata(
  input: unknown,
  output: unknown,
  instanceID: string | undefined,
): Metadata {
  const inputRecord = asRecord(input);
  const outputRecord = asRecord(output);
  const metadata: Metadata = {};
  put(metadata, 'instanceID', instanceID);

  putName(metadata, 'tool', inputRecord, 'tool');
  putKnownCorrelationIds(metadata, inputRecord);

  const inputMetadata = asRecord(readValue(inputRecord, 'metadata'));
  const outputMetadata = asRecord(readValue(outputRecord, 'metadata'));
  putToolMetadataCorrelationIds(metadata, inputMetadata, false);
  putToolMetadataCorrelationIds(
    metadata,
    outputMetadata,
    readString(inputRecord, 'tool') === 'task',
  );
  return metadata;
}

function extractBoardMetadata(
  transition: BackgroundJobTransition,
  instanceID: string | undefined,
): Metadata {
  const record = asRecord(transition);
  const metadata: Metadata = {};
  put(metadata, 'instanceID', instanceID);

  const operation = readValue(record, 'operation');
  put(
    metadata,
    'operation',
    typeof operation === 'string' && BOARD_OPERATIONS.has(operation)
      ? operation
      : 'unknown',
  );
  putId(metadata, 'taskID', record, 'taskID');
  putId(metadata, 'parentSessionID', record, 'parentSessionID');
  putState(metadata, 'priorState', record, 'priorState');
  putState(metadata, 'resultState', record, 'resultState');
  putBoolean(
    metadata,
    'terminalUnreconciled',
    readValue(record, 'terminalUnreconciled'),
  );
  putBoolean(
    metadata,
    'cancellationRequested',
    readValue(record, 'cancellationRequested'),
  );
  putBoolean(metadata, 'statusUncertain', readValue(record, 'statusUncertain'));
  putBoolean(metadata, 'timedOut', readValue(record, 'timedOut'));
  return metadata;
}

function unwrapHostEvent(value: unknown): UnknownRecord | undefined {
  const record = asRecord(value);
  const nested = asRecord(readValue(record, 'event'));
  return nested ?? record;
}

function serializeRecord(record: TraceRecord): QueueEntry | undefined {
  try {
    const line = `${JSON.stringify(record)}\n`;
    return { line, bytes: Buffer.byteLength(line, 'utf8') };
  } catch {
    return undefined;
  }
}

/**
 * Creates a passive, bounded JSONL trace for one plugin instance.
 *
 * The trace deliberately has no access to prompt text or arbitrary payloads:
 * each observer extracts a small, explicit allowlist before it reaches the
 * queue. The returned observer methods are synchronous so instrumentation
 * cannot add an await or failure path to the host hook.
 */
export function createBackgroundTaskTrace(options: {
  instanceID: string;
  logDir?: string;
}): {
  observeHostEvent(event: unknown): void;
  observeTaskToolBefore(input: unknown, output: unknown): void;
  observeTaskToolAfter(input: unknown, output: unknown): void;
  observeBoardTransition(transition: BackgroundJobTransition): void;
  dispose(): Promise<void>;
} {
  let instanceID: string | undefined;
  let tracePath = '';
  let disabled = false;
  let disposed = false;
  let draining = false;
  let drainPromise: Promise<void> | undefined;
  let disposePromise: Promise<void> | undefined;
  let directoryReady = false;
  let sequence = 0;
  let droppedCount = 0;
  let queuedBytes = 0;
  const deltaAccumulators = new Map<string, DeltaAccumulator>();
  const queue: QueueEntry[] = [];

  try {
    instanceID = safeId(options.instanceID);
    const root = options.logDir ?? getLogDir();
    const fileInstanceID = instanceID ?? 'unknown';
    tracePath = path.join(
      root,
      `oh-my-opencode-slim.trace.${fileInstanceID}.log`,
    );
  } catch {
    disabled = true;
  }

  function elapsedMs(start: number): number {
    try {
      const elapsed = performance.now() - start;
      return Number.isFinite(elapsed) && elapsed >= 0
        ? Number(elapsed.toFixed(3))
        : 0;
    } catch {
      return 0;
    }
  }

  let startedAt = 0;
  try {
    startedAt = performance.now();
  } catch {
    startedAt = 0;
  }

  function makeEntry(
    source: string,
    event: string,
    metadata: Metadata,
  ): QueueEntry | undefined {
    sequence += 1;
    let wallTime: string;
    try {
      wallTime = new Date().toISOString();
    } catch {
      wallTime = '1970-01-01T00:00:00.000Z';
    }
    return serializeRecord({
      sequence,
      wallTime,
      elapsedMs: elapsedMs(startedAt),
      source,
      event,
      metadata,
    });
  }

  function enqueueEntry(entry: QueueEntry, allowAfterDispose = false): boolean {
    if (disabled || (disposed && !allowAfterDispose)) return false;
    if (
      queue.length >= MAX_QUEUE_RECORDS ||
      queuedBytes + entry.bytes > MAX_QUEUE_BYTES
    ) {
      droppedCount += 1;
      return false;
    }
    queue.push(entry);
    queuedBytes += entry.bytes;
    startDrain();
    return true;
  }

  function enqueueGap(allowAfterDispose = false): boolean {
    if (droppedCount === 0 || disabled) return false;
    const metadata: Metadata = {};
    put(metadata, 'instanceID', instanceID);
    put(metadata, 'count', droppedCount);
    const entry = makeEntry('trace', 'trace.gap', metadata);
    if (!entry) return false;
    if (
      queue.length >= MAX_QUEUE_RECORDS ||
      queuedBytes + entry.bytes > MAX_QUEUE_BYTES ||
      (disposed && !allowAfterDispose)
    ) {
      sequence -= 1;
      return false;
    }
    queue.push(entry);
    queuedBytes += entry.bytes;
    droppedCount = 0;
    return true;
  }

  function enqueueObservation(
    source: string,
    event: string,
    metadata: Metadata,
    allowAfterDispose = false,
  ): boolean {
    if (disabled || (disposed && !allowAfterDispose)) return false;
    enqueueGap(allowAfterDispose);
    const entry = makeEntry(source, event, metadata);
    return entry ? enqueueEntry(entry, allowAfterDispose) : false;
  }

  function flushDeltaSummary(
    delta: DeltaAccumulator,
    force: boolean,
    allowAfterDispose = false,
  ): boolean {
    const countChanged = delta.count - delta.reportedCount;
    if (countChanged <= 0) return false;
    if (!force && countChanged < DELTA_SUMMARY_INTERVAL) return false;

    const metadata = { ...delta.metadata };
    metadata.count = delta.count;
    metadata.bytes = delta.bytes;
    const accepted = enqueueObservation(
      'host',
      'delta.summary',
      metadata,
      allowAfterDispose,
    );
    if (accepted) {
      delta.reportedCount = delta.count;
    }
    return accepted;
  }

  function removeCompletedDeltaAccumulators(): void {
    for (const [key, delta] of deltaAccumulators) {
      if (delta.count === delta.reportedCount) deltaAccumulators.delete(key);
    }
  }

  function flushDeltaSummaries(
    force: boolean,
    allowAfterDispose = false,
  ): void {
    for (const delta of deltaAccumulators.values()) {
      flushDeltaSummary(delta, force, allowAfterDispose);
    }
    if (force) removeCompletedDeltaAccumulators();
  }

  function finishDeltaBursts(allowAfterDispose = false): void {
    flushDeltaSummaries(true, allowAfterDispose);
  }

  function deltaKey(observation: DeltaObservation): string {
    return [
      observation.metadata.sessionID ?? '',
      observation.metadata.childSessionID ?? '',
      observation.metadata.messageID ?? '',
      observation.metadata.partID ?? '',
      observation.event,
    ].join('\u0000');
  }

  function deltaMetadata(observation: DeltaObservation): Metadata {
    const metadata: Metadata = {};
    for (const key of [
      'instanceID',
      'sessionID',
      'childSessionID',
      'parentSessionID',
      'messageID',
      'partID',
      'callID',
      'taskID',
      'jobID',
    ]) {
      const value = observation.metadata[key];
      if (value !== undefined) metadata[key] = value;
    }
    put(metadata, 'deltaEvent', observation.event);
    return metadata;
  }

  function observeDelta(observation: DeltaObservation): void {
    const key = deltaKey(observation);
    let delta = deltaAccumulators.get(key);
    if (!delta) {
      if (deltaAccumulators.size >= MAX_DELTA_ACCUMULATORS) {
        flushDeltaSummaries(true);
      }
      if (deltaAccumulators.size >= MAX_DELTA_ACCUMULATORS) {
        const oldestKey = deltaAccumulators.keys().next().value;
        if (typeof oldestKey === 'string') {
          deltaAccumulators.delete(oldestKey);
          droppedCount += 1;
        }
      }
      delta = {
        count: 0,
        bytes: 0,
        reportedCount: 0,
        metadata: deltaMetadata(observation),
      };
      deltaAccumulators.set(key, delta);
    }
    delta.count += 1;
    delta.bytes += observation.bytes;

    if (delta.count === 1) {
      const metadata = { ...delta.metadata };
      metadata.count = 1;
      metadata.bytes = observation.bytes;
      enqueueObservation('host', 'delta.activity', metadata);
      // Activity is intentionally not a periodic summary. The first summary
      // therefore accounts for the complete stream prefix.
      return;
    }

    flushDeltaSummary(delta, false);
  }

  async function appendEntry(entry: QueueEntry): Promise<void> {
    if (!directoryReady) {
      await mkdir(path.dirname(tracePath), { recursive: true });
      directoryReady = true;
    }
    await appendFile(tracePath, entry.line);
  }

  function disableAfterWriteFailure(): void {
    if (disabled) return;
    disabled = true;
    queue.length = 0;
    queuedBytes = 0;
    droppedCount = 0;
    deltaAccumulators.clear();
    try {
      log(
        '[task-session-manager] background trace disabled after write failure',
      );
    } catch {
      // The trace must remain fail-open even if logging is unavailable.
    }
  }

  async function drain(): Promise<void> {
    while (!disabled) {
      if (queue.length === 0) {
        if (disposed) flushDeltaSummaries(true, true);
        if (droppedCount > 0) enqueueGap(disposed);
        if (queue.length === 0) return;
      }

      const entry = queue.shift();
      if (!entry) continue;
      queuedBytes -= entry.bytes;
      if (droppedCount > 0) enqueueGap(disposed);

      try {
        await appendEntry(entry);
      } catch {
        disableAfterWriteFailure();
        return;
      }
    }
  }

  function startDrain(): void {
    if (draining || disabled || queue.length === 0) return;
    draining = true;
    drainPromise = drain()
      .catch(() => {
        disableAfterWriteFailure();
      })
      .finally(() => {
        draining = false;
        drainPromise = undefined;
        if (!disabled && queue.length > 0) startDrain();
      });
  }

  function observeSafely(callback: () => void): void {
    try {
      if (disposed || disabled) return;
      callback();
    } catch {
      // Diagnostics are strictly best-effort and cannot affect the caller.
    }
  }

  function observeHostEvent(event: unknown): void {
    observeSafely(() => {
      const observation = extractHostObservation(event, instanceID);
      const root = unwrapHostEvent(event);
      const properties = asRecord(readValue(root, 'properties'));
      const part = asRecord(readValue(properties, 'part'));
      const deltaInfo = deltaBytes(observation.event, properties, part);
      if (deltaInfo.isDelta) {
        observeDelta({ ...observation, bytes: deltaInfo.bytes });
        return;
      }
      finishDeltaBursts();
      enqueueObservation('host', observation.event, observation.metadata);
    });
  }

  function observeTaskToolBefore(input: unknown, output: unknown): void {
    observeSafely(() => {
      finishDeltaBursts();
      enqueueObservation(
        'tool',
        'tool.execute.before',
        extractToolMetadata(input, output, instanceID),
      );
    });
  }

  function observeTaskToolAfter(input: unknown, output: unknown): void {
    observeSafely(() => {
      finishDeltaBursts();
      enqueueObservation(
        'tool',
        'tool.execute.after',
        extractToolMetadata(input, output, instanceID),
      );
    });
  }

  function observeBoardTransition(transition: BackgroundJobTransition): void {
    observeSafely(() => {
      finishDeltaBursts();
      enqueueObservation(
        'board',
        'board.transition',
        extractBoardMetadata(transition, instanceID),
      );
    });
  }

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;
    finishDeltaBursts(true);
    disposed = true;
    startDrain();
    disposePromise = (async () => {
      while (!disabled && (draining || queue.length > 0 || droppedCount > 0)) {
        const currentDrain = drainPromise;
        if (!currentDrain) {
          startDrain();
          if (!drainPromise) break;
          await drainPromise;
        } else {
          await currentDrain;
        }
      }
    })().catch(() => {
      // Disposal is intentionally idempotent and non-throwing.
    });
    return disposePromise;
  }

  return {
    observeHostEvent,
    observeTaskToolBefore,
    observeTaskToolAfter,
    observeBoardTransition,
    dispose,
  };
}
