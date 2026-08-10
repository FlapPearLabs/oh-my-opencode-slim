import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Observability event types for harness tracking.
 *
 * All logging is pure side-channel — writes to JSONL files only.
 * No mutation of message payload, no cache-safety concerns.
 */
export type EventKind =
  | 'delegation_started'
  | 'delegation_completed'
  | 'delegation_failed'
  | 'route_decision'
  | 'skill_triggered'
  | 'model_routed'
  | 'session_summary';

interface BaseEvent {
  kind: EventKind;
  timestamp: string;
  sessionId?: string;
}

export interface DelegationStartedEvent extends BaseEvent {
  kind: 'delegation_started';
  agent: string;
  taskDescription: string;
  background: boolean;
}

export interface DelegationCompletedEvent extends BaseEvent {
  kind: 'delegation_completed';
  agent: string;
  taskId?: string;
  durationMs: number;
  success: boolean;
}

export interface DelegationFailedEvent extends BaseEvent {
  kind: 'delegation_failed';
  agent: string;
  taskId?: string;
  durationMs: number;
  error: string;
}

export interface RouteDecisionEvent extends BaseEvent {
  kind: 'route_decision';
  decision: 'direct' | 'delegate';
  agent?: string;
  reason: string;
  fileCount?: number;
  estimatedLines?: number;
}

export interface SkillTriggeredEvent extends BaseEvent {
  kind: 'skill_triggered';
  skillName: string;
  triggerSource: 'system' | 'user' | 'auto';
}

export interface ModelRoutedEvent extends BaseEvent {
  kind: 'model_routed';
  agent: string;
  tier: string;
  model: string;
}

export interface SessionSummaryEvent extends BaseEvent {
  kind: 'session_summary';
  totalDelegations: number;
  directHandled: number;
  skillsTriggered: Record<string, number>;
  agentCounts: Record<string, { success: number; failed: number }>;
  totalDurationMs: number;
}

const LOG_DIR = join(
  process.env.HOME ?? '~',
  '.local',
  'share',
  'opencode',
  'log',
);
const LOG_FILE = join(LOG_DIR, 'omos-harness.jsonl');

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Emit a harness event to the JSONL log.
 * Pure side-channel — no message payload mutation.
 */
export type HarnessEvent =
  | DelegationStartedEvent
  | DelegationCompletedEvent
  | DelegationFailedEvent
  | RouteDecisionEvent
  | SkillTriggeredEvent
  | ModelRoutedEvent
  | SessionSummaryEvent;

export function emitEvent(event: HarnessEvent): void {
  try {
    ensureLogDir();
    const line = `${JSON.stringify(event)}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {}
}
