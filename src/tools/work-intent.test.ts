import { describe, expect, test } from 'bun:test';
import { WORK_INTENT_KIND, WORK_INTENT_ORIGIN } from '../utils/work-intent';
import { createWorkIntentTool } from './work-intent';

describe('slim_work_intent tool', () => {
  test('records a canonical envelope bound to the calling orchestrator session', async () => {
    const registered: string[] = [];
    const tool = createWorkIntentTool({
      shouldManageSession: (sessionID) => registered.includes(sessionID),
      registerSessionAsOrchestrator: (sessionID) => registered.push(sessionID),
    }).slim_work_intent;

    const output = await tool.execute(
      {
        objective: 'Complete URV1-02.',
        success_criteria: 'All focused tests pass.',
        state: 'active',
        phase_ref: 'parser complete',
        evidence_refs: ['src/utils/work-intent.test.ts'],
      },
      { sessionID: 'ses_current', agent: 'orchestrator' } as never,
    );

    expect(registered).toEqual(['ses_current']);
    expect(JSON.parse(String(output))).toEqual({
      kind: WORK_INTENT_KIND,
      origin: WORK_INTENT_ORIGIN,
      sessionID: 'ses_current',
      objective: 'Complete URV1-02.',
      successCriteria: 'All focused tests pass.',
      state: 'active',
      phaseRef: 'parser complete',
      evidenceRefs: ['src/utils/work-intent.test.ts'],
    });
  });

  test('rejects a non-orchestrator caller', async () => {
    const tool = createWorkIntentTool({
      shouldManageSession: () => true,
    }).slim_work_intent;

    expect(
      tool.execute(
        {
          objective: 'Wrong owner',
          success_criteria: 'Must reject',
          state: 'active',
        },
        { sessionID: 'ses_child', agent: 'fixer' } as never,
      ),
    ).rejects.toThrow('orchestrator');
  });

  test('rejects an unowned session when it cannot prove orchestrator ownership', async () => {
    const tool = createWorkIntentTool({
      shouldManageSession: () => false,
    }).slim_work_intent;

    expect(
      tool.execute(
        {
          objective: 'Unknown owner',
          success_criteria: 'Must reject',
          state: 'active',
        },
        { sessionID: 'ses_unknown' } as never,
      ),
    ).rejects.toThrow('orchestrator sessions');
  });
});
