import { Buffer } from 'node:buffer';

export const WORK_INTENT_KIND = 'slim.work-intent.v1' as const;
export const WORK_INTENT_ORIGIN = 'oh-my-opencode-slim' as const;
export const WORK_INTENT_TOOL = 'slim_work_intent' as const;

const MAX_ENVELOPE_BYTES = 8 * 1024;
const MAX_OBJECTIVE_CHARS = 2_000;
const MAX_SUCCESS_CRITERIA_CHARS = 2_000;
const MAX_PHASE_REF_CHARS = 1_000;
const MAX_EVIDENCE_REFS = 8;
const MAX_EVIDENCE_REF_CHARS = 256;

export type WorkIntentState =
  | 'active'
  | 'waiting_for_user'
  | 'complete'
  | 'blocked';

export interface WorkIntentInput {
  objective: string;
  successCriteria: string;
  state: WorkIntentState;
  phaseRef?: string;
  evidenceRefs?: string[];
}

interface WorkIntentEnvelope extends WorkIntentInput {
  kind: typeof WORK_INTENT_KIND;
  origin: typeof WORK_INTENT_ORIGIN;
  sessionID: string;
}

export type ReconstructedWorkIntent =
  | { status: 'known'; intent: WorkIntentInput }
  | { status: 'unknown' };

type HostPart = {
  type?: unknown;
  tool?: unknown;
  name?: unknown;
  sessionID?: unknown;
  messageID?: unknown;
  state?: {
    status?: unknown;
    output?: unknown;
    result?: unknown;
  };
};

type HostMessage = {
  info?: {
    id?: unknown;
    sessionID?: unknown;
    role?: unknown;
  };
  parts?: unknown;
};

interface WorkIntentAdapterOptions {
  messages: (request: {
    path: { id: string };
    query?: { directory: string };
  }) => Promise<{ data?: unknown[] }>;
  directory?: string;
  maxSessions?: number;
}

function validBoundedText(
  value: unknown,
  maxChars: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === 'string' &&
    (allowEmpty || value.length > 0) &&
    value.length <= maxChars
  );
}

function isWorkIntentEnvelope(
  value: unknown,
  sessionID: string,
): value is WorkIntentEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'kind',
    'origin',
    'sessionID',
    'objective',
    'successCriteria',
    'state',
    'phaseRef',
    'evidenceRefs',
  ]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return false;
  if (candidate.kind !== WORK_INTENT_KIND) return false;
  if (candidate.origin !== WORK_INTENT_ORIGIN) return false;
  if (candidate.sessionID !== sessionID) return false;
  if (!validBoundedText(candidate.objective, MAX_OBJECTIVE_CHARS)) return false;
  if (
    !validBoundedText(candidate.successCriteria, MAX_SUCCESS_CRITERIA_CHARS)
  ) {
    return false;
  }
  if (
    candidate.state !== 'active' &&
    candidate.state !== 'waiting_for_user' &&
    candidate.state !== 'complete' &&
    candidate.state !== 'blocked'
  ) {
    return false;
  }
  if (
    candidate.phaseRef !== undefined &&
    !validBoundedText(candidate.phaseRef, MAX_PHASE_REF_CHARS, true)
  ) {
    return false;
  }
  if (candidate.evidenceRefs !== undefined) {
    if (!Array.isArray(candidate.evidenceRefs)) return false;
    if (candidate.evidenceRefs.length > MAX_EVIDENCE_REFS) return false;
    if (
      candidate.evidenceRefs.some(
        (reference) =>
          !validBoundedText(reference, MAX_EVIDENCE_REF_CHARS, true),
      )
    ) {
      return false;
    }
  }
  return true;
}

function toInput(envelope: WorkIntentEnvelope): WorkIntentInput {
  return {
    objective: envelope.objective,
    successCriteria: envelope.successCriteria,
    state: envelope.state,
    ...(envelope.phaseRef !== undefined ? { phaseRef: envelope.phaseRef } : {}),
    ...(envelope.evidenceRefs !== undefined
      ? { evidenceRefs: [...envelope.evidenceRefs] }
      : {}),
  };
}

export function createWorkIntentEnvelope(
  sessionID: string,
  intent: WorkIntentInput,
): string {
  const envelope: WorkIntentEnvelope = {
    kind: WORK_INTENT_KIND,
    origin: WORK_INTENT_ORIGIN,
    sessionID,
    objective: intent.objective,
    successCriteria: intent.successCriteria,
    state: intent.state,
    ...(intent.phaseRef !== undefined ? { phaseRef: intent.phaseRef } : {}),
    ...(intent.evidenceRefs !== undefined
      ? { evidenceRefs: intent.evidenceRefs }
      : {}),
  };
  if (!isWorkIntentEnvelope(envelope, sessionID)) {
    throw new Error('Invalid WorkIntent fields or fixed bounds');
  }
  const serialized = JSON.stringify(envelope);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_ENVELOPE_BYTES) {
    throw new Error('WorkIntent envelope exceeds the fixed 8 KiB limit');
  }
  return serialized;
}

function isCarrierPart(value: unknown): value is HostPart {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const part = value as HostPart;
  return (
    part.type === 'tool' &&
    (part.tool === WORK_INTENT_TOOL || part.name === WORK_INTENT_TOOL) &&
    part.state?.status === 'completed'
  );
}

function hasCarrierCandidate(messages: unknown[], sessionID: string): boolean {
  return messages.some((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const message = value as HostMessage;
    return (
      message.info?.role === 'assistant' &&
      (message.info.sessionID === undefined ||
        message.info.sessionID === sessionID) &&
      Array.isArray(message.parts) &&
      message.parts.some(isCarrierPart)
    );
  });
}

export function reconstructWorkIntent(
  messages: unknown[],
  sessionID: string,
): ReconstructedWorkIntent {
  let latest:
    | { kind: 'single'; part: HostPart; messageID: string }
    | { kind: 'conflict' }
    | undefined;

  for (const value of messages) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const message = value as HostMessage;
    if (message.info?.role !== 'assistant') continue;
    if (
      message.info.sessionID !== undefined &&
      message.info.sessionID !== sessionID
    ) {
      continue;
    }
    if (typeof message.info.id !== 'string') continue;
    if (!Array.isArray(message.parts)) continue;
    const carriers = message.parts.filter(isCarrierPart);
    if (carriers.length === 0) continue;
    latest =
      carriers.length === 1
        ? {
            kind: 'single',
            part: carriers[0],
            messageID: message.info.id,
          }
        : { kind: 'conflict' };
  }

  if (!latest || latest.kind === 'conflict') return { status: 'unknown' };
  const v1Carrier = latest.part.tool === WORK_INTENT_TOOL;
  if (
    (v1Carrier && latest.part.sessionID !== sessionID) ||
    (v1Carrier && latest.part.messageID !== latest.messageID) ||
    (!v1Carrier &&
      latest.part.sessionID !== undefined &&
      latest.part.sessionID !== sessionID) ||
    (!v1Carrier &&
      latest.part.messageID !== undefined &&
      latest.part.messageID !== latest.messageID)
  ) {
    return { status: 'unknown' };
  }
  const result = latest.part.state?.result;
  const output = v1Carrier
    ? latest.part.state?.output
    : typeof result === 'string'
      ? result
      : result && typeof result === 'object' && !Array.isArray(result)
        ? (result as { content?: unknown }).content
        : undefined;
  if (
    typeof output !== 'string' ||
    Buffer.byteLength(output, 'utf8') > MAX_ENVELOPE_BYTES
  ) {
    return { status: 'unknown' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { status: 'unknown' };
  }
  if (!isWorkIntentEnvelope(parsed, sessionID)) return { status: 'unknown' };
  return { status: 'known', intent: toInput(parsed) };
}

export class WorkIntentAdapter {
  readonly #messages: WorkIntentAdapterOptions['messages'];
  readonly #directory: string | undefined;
  readonly #maxSessions: number;
  readonly #views = new Map<string, ReconstructedWorkIntent>();
  #historyEpoch = Symbol('work-intent-history-epoch');

  constructor(options: WorkIntentAdapterOptions) {
    this.#messages = options.messages;
    this.#directory = options.directory;
    this.#maxSessions = Math.max(1, options.maxSessions ?? 128);
  }

  get(sessionID: string): ReconstructedWorkIntent {
    return this.#views.get(sessionID) ?? { status: 'unknown' };
  }

  clear(sessionID: string): void {
    this.#views.delete(sessionID);
  }

  /** The host hook runs before compaction, so its view cannot remain authoritative. */
  invalidateForCompaction(sessionID: string): void {
    this.#historyEpoch = Symbol('work-intent-history-epoch');
    this.clear(sessionID);
  }

  #remember(
    sessionID: string,
    view: ReconstructedWorkIntent,
  ): ReconstructedWorkIntent {
    this.#views.delete(sessionID);
    this.#views.set(sessionID, view);
    while (this.#views.size > this.#maxSessions) {
      const oldest = this.#views.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#views.delete(oldest);
    }
    return view;
  }

  async reconstructSession(
    sessionID: string,
  ): Promise<ReconstructedWorkIntent> {
    const historyEpoch = this.#historyEpoch;
    try {
      const response = await this.#messages({
        path: { id: sessionID },
        ...(this.#directory ? { query: { directory: this.#directory } } : {}),
      });
      if (historyEpoch !== this.#historyEpoch) {
        return { status: 'unknown' };
      }
      return this.#remember(
        sessionID,
        reconstructWorkIntent(response.data ?? [], sessionID),
      );
    } catch {
      return this.#remember(sessionID, { status: 'unknown' });
    }
  }

  async reconstructTransform(
    messages: unknown[],
    scopedSessionID?: string,
  ): Promise<ReconstructedWorkIntent> {
    const sessionIDs = new Set<string>();
    if (scopedSessionID) sessionIDs.add(scopedSessionID);
    for (const value of messages) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const message = value as HostMessage;
      if (
        typeof message.info?.sessionID === 'string' &&
        (!scopedSessionID || message.info.sessionID !== scopedSessionID)
      ) {
        sessionIDs.add(message.info.sessionID);
      }
    }
    if (sessionIDs.size !== 1) {
      return scopedSessionID
        ? this.#remember(scopedSessionID, { status: 'unknown' })
        : { status: 'unknown' };
    }
    const sessionID = sessionIDs.values().next().value;
    if (typeof sessionID !== 'string') return { status: 'unknown' };
    if (!hasCarrierCandidate(messages, sessionID)) {
      const cached = this.#views.get(sessionID);
      if (cached) return cached;
      return this.reconstructSession(sessionID);
    }
    return this.#remember(
      sessionID,
      reconstructWorkIntent(messages, sessionID),
    );
  }
}
