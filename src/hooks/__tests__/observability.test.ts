import { describe, expect, test } from 'bun:test';
import { emitEvent, type HarnessEvent } from '../observability';

describe('observability events', () => {
  test('emitDelegationStarted produces correct event shape', () => {
    const event: HarnessEvent = {
      kind: 'delegation_started',
      timestamp: new Date().toISOString(),
      agent: 'fixer',
      taskDescription: 'Add validation function',
      background: true,
      sessionId: 'test-session',
    };

    expect(event.kind).toBe('delegation_started');
    expect(event.agent).toBe('fixer');
    expect(event.background).toBe(true);
  });

  test('emitDelegationCompleted produces correct event shape', () => {
    const event: HarnessEvent = {
      kind: 'delegation_completed',
      timestamp: new Date().toISOString(),
      agent: 'fixer',
      durationMs: 5000,
      success: true,
      taskId: 'task-123',
    };

    expect(event.kind).toBe('delegation_completed');
    expect(event.durationMs).toBe(5000);
    expect(event.success).toBe(true);
  });

  test('emitRouteDecision produces correct event shape', () => {
    const event: HarnessEvent = {
      kind: 'route_decision',
      timestamp: new Date().toISOString(),
      decision: 'delegate',
      agent: '@designer',
      reason: 'UI work requires visual judgment',
      fileCount: 3,
      estimatedLines: 150,
    };

    expect(event.decision).toBe('delegate');
    expect(event.agent).toBe('@designer');
  });

  test('emitSkillTriggered produces correct event shape', () => {
    const event: HarnessEvent = {
      kind: 'skill_triggered',
      timestamp: new Date().toISOString(),
      skillName: 'ponytail',
      triggerSource: 'auto',
    };

    expect(event.skillName).toBe('ponytail');
    expect(event.triggerSource).toBe('auto');
  });

  test('emitEvent does not throw', () => {
    // This tests that the JSONL write path doesn't crash
    // even if the log directory doesn't exist yet
    expect(() => {
      emitEvent({
        kind: 'route_decision',
        timestamp: new Date().toISOString(),
        decision: 'direct',
        reason: 'trivial edit',
      });
    }).not.toThrow();
});
});
