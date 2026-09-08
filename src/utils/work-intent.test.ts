import { describe, expect, test } from 'bun:test';
import {
  createWorkIntentEnvelope,
  reconstructWorkIntent,
  WORK_INTENT_KIND,
  WORK_INTENT_TOOL,
  WorkIntentAdapter,
  type WorkIntentInput,
} from './work-intent';

const SESSION_ID = 'ses_current';

function toolPart(output: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'prt_intent',
    sessionID: SESSION_ID,
    messageID: 'msg_intent',
    type: 'tool',
    callID: 'call_intent',
    tool: WORK_INTENT_TOOL,
    state: {
      status: 'completed',
      input: {},
      output,
      title: 'Work intent recorded',
      metadata: {},
      time: { start: 1, end: 2 },
    },
    ...overrides,
  };
}

function message(id: string, parts: unknown[], sessionID = SESSION_ID) {
  return {
    info: {
      id,
      sessionID,
      role: 'assistant',
      time: { created: Number(id.replace(/\D/g, '')) || 1 },
    },
    parts: parts.map((part) =>
      part && typeof part === 'object' && 'messageID' in part
        ? { ...part, messageID: id }
        : part,
    ),
  };
}

function input(overrides: Partial<WorkIntentInput> = {}): WorkIntentInput {
  return {
    objective: 'Finish the accepted runtime reliability ticket.',
    successCriteria: 'Focused tests and required runtime evidence pass.',
    state: 'active',
    phaseRef: 'URV1-02 parser',
    evidenceRefs: ['docs/planning/spec.md'],
    ...overrides,
  };
}

describe('WorkIntent session-history adapter', () => {
  test('round-trips one canonical current-session envelope', () => {
    const rendered = createWorkIntentEnvelope(SESSION_ID, input());
    const result = reconstructWorkIntent(
      [message('msg_1', [toolPart(rendered)])],
      SESSION_ID,
    );

    expect(JSON.parse(rendered)).toMatchObject({
      kind: WORK_INTENT_KIND,
      sessionID: SESSION_ID,
      state: 'active',
    });
    expect(result).toEqual({
      status: 'known',
      intent: input(),
    });
  });

  test('reads the same canonical output from the OpenCode v2 tool-part shape', () => {
    const rendered = createWorkIntentEnvelope(SESSION_ID, input());
    const result = reconstructWorkIntent(
      [
        {
          info: { id: 'msg_v2', role: 'assistant' },
          parts: [
            {
              id: 'prt_v2',
              type: 'tool',
              name: WORK_INTENT_TOOL,
              state: {
                status: 'completed',
                result: { content: rendered },
              },
            },
          ],
        },
      ],
      SESSION_ID,
    );

    expect(result).toMatchObject({
      status: 'known',
      intent: { state: 'active' },
    });
  });

  test('uses host order and ignores later non-carrier messages', () => {
    const active = createWorkIntentEnvelope(SESSION_ID, input());
    const blocked = createWorkIntentEnvelope(
      SESSION_ID,
      input({ state: 'blocked', phaseRef: 'blocked by required approval' }),
    );
    const result = reconstructWorkIntent(
      [
        message('msg_1', [toolPart(active)]),
        message('msg_2', [toolPart(blocked)]),
        message('msg_3', [{ type: 'text', text: 'ordinary text' }]),
      ],
      SESSION_ID,
    );

    expect(result).toMatchObject({
      status: 'known',
      intent: { state: 'blocked' },
    });
  });

  test('returns UNKNOWN for an invalid latest candidate without fallback', () => {
    const valid = createWorkIntentEnvelope(SESSION_ID, input());
    const result = reconstructWorkIntent(
      [
        message('msg_1', [toolPart(valid)]),
        message('msg_2', [toolPart('{"kind":"slim.work-intent.v1"')]),
      ],
      SESSION_ID,
    );

    expect(result).toEqual({ status: 'unknown' });
  });

  test('returns UNKNOWN for conflicting candidates in one host message', () => {
    const first = createWorkIntentEnvelope(SESSION_ID, input());
    const second = createWorkIntentEnvelope(
      SESSION_ID,
      input({ state: 'complete' }),
    );

    expect(
      reconstructWorkIntent(
        [message('msg_1', [toolPart(first), toolPart(second)])],
        SESSION_ID,
      ),
    ).toEqual({ status: 'unknown' });
  });

  test('requires structural session and message binding on a v1 carrier part', () => {
    const rendered = createWorkIntentEnvelope(SESSION_ID, input());
    const cases = [
      toolPart(rendered, { sessionID: undefined }),
      toolPart(rendered, { sessionID: 'ses_other' }),
      toolPart(rendered, { messageID: undefined }),
      toolPart(rendered, { messageID: 'msg_other' }),
    ];

    for (const part of cases) {
      expect(
        reconstructWorkIntent(
          [
            {
              info: {
                id: 'msg_intent',
                sessionID: SESSION_ID,
                role: 'assistant',
              },
              parts: [part],
            },
          ],
          SESSION_ID,
        ),
      ).toEqual({ status: 'unknown' });
    }
  });

  test('a foreign, cross-session, or over-bound latest envelope never falls back', () => {
    const older = createWorkIntentEnvelope(SESSION_ID, input());
    const canonical = JSON.parse(older) as Record<string, unknown>;
    const cases = [
      { ...canonical, origin: 'another-plugin' },
      { ...canonical, sessionID: 'ses_other' },
      { ...canonical, state: 'paused' },
      { ...canonical, unexpected: true },
      { ...canonical, objective: 'x'.repeat(2001) },
      { ...canonical, successCriteria: 'x'.repeat(2001) },
      { ...canonical, phaseRef: 'x'.repeat(1001) },
      { ...canonical, evidenceRefs: Array.from({ length: 9 }, () => 'ref') },
      { ...canonical, evidenceRefs: ['x'.repeat(257)] },
    ];

    for (const candidate of cases) {
      expect(
        reconstructWorkIntent(
          [
            message('msg_1', [toolPart(older)]),
            message('msg_2', [toolPart(JSON.stringify(candidate))]),
          ],
          SESSION_ID,
        ),
      ).toEqual({ status: 'unknown' });
    }
  });

  test('accepts the field maxima within the fixed 8 KiB envelope bound', () => {
    const rendered = createWorkIntentEnvelope(
      `ses_${'s'.repeat(20)}`,
      input({
        objective: 'x'.repeat(2000),
        successCriteria: 'x'.repeat(2000),
        phaseRef: 'x'.repeat(1000),
        evidenceRefs: Array.from(
          { length: 8 },
          (_, index) => `ref-${index}-${'x'.repeat(249)}`,
        ),
      }),
    );

    expect(Buffer.byteLength(rendered, 'utf8')).toBeLessThanOrEqual(8192);
  });

  test('rejects a serialized envelope over 8 KiB even when character caps pass', () => {
    expect(() =>
      createWorkIntentEnvelope(
        `ses_${'界'.repeat(2000)}`,
        input({ objective: '界'.repeat(2000) }),
      ),
    ).toThrow('8 KiB');
  });
});

describe('WorkIntent reconstruction lifecycle', () => {
  test('reconstructs from host history after plugin reload', async () => {
    const rendered = createWorkIntentEnvelope(SESSION_ID, input());
    const calls: unknown[] = [];
    const history = [message('msg_1', [toolPart(rendered)])];
    const createAdapter = () =>
      new WorkIntentAdapter({
        directory: '/repo',
        messages: async (request) => {
          calls.push(request);
          return { data: history };
        },
      });

    const beforeReload = createAdapter();
    expect(await beforeReload.reconstructSession(SESSION_ID)).toMatchObject({
      status: 'known',
      intent: { state: 'active' },
    });

    const afterReload = createAdapter();
    expect(afterReload.get(SESSION_ID)).toEqual({ status: 'unknown' });
    expect(await afterReload.reconstructSession(SESSION_ID)).toMatchObject({
      status: 'known',
      intent: { state: 'active' },
    });
    expect(calls.at(-1)).toEqual({
      path: { id: SESSION_ID },
      query: { directory: '/repo' },
    });
  });

  test('uses host history when compacted transform messages omit the record', async () => {
    const rendered = createWorkIntentEnvelope(
      SESSION_ID,
      input({ state: 'waiting_for_user' }),
    );
    let historyReads = 0;
    const adapter = new WorkIntentAdapter({
      messages: async () => {
        historyReads += 1;
        return { data: [message('msg_1', [toolPart(rendered)])] };
      },
    });

    const result = await adapter.reconstructTransform([
      {
        info: { id: 'msg_summary', sessionID: SESSION_ID, role: 'user' },
        parts: [{ type: 'text', text: 'Compaction summary' }],
      },
    ]);

    expect(result).toMatchObject({
      status: 'known',
      intent: { state: 'waiting_for_user' },
    });
    expect(historyReads).toBe(1);
  });

  test('does not reuse a pre-compaction view after the carrier is compacted away', async () => {
    const rendered = createWorkIntentEnvelope(SESSION_ID, input());
    let history = [message('msg_1', [toolPart(rendered)])];
    const adapter = new WorkIntentAdapter({
      messages: async () => ({ data: history }),
    });

    expect(await adapter.reconstructSession(SESSION_ID)).toMatchObject({
      status: 'known',
      intent: { state: 'active' },
    });

    adapter.invalidateForCompaction(SESSION_ID);
    history = [];

    expect(
      await adapter.reconstructTransform(
        [
          {
            info: { id: 'msg_summary', sessionID: SESSION_ID, role: 'user' },
            parts: [{ type: 'text', text: 'Compaction summary' }],
          },
        ],
        SESSION_ID,
      ),
    ).toEqual({ status: 'unknown' });
    expect(adapter.get(SESSION_ID)).toEqual({ status: 'unknown' });
  });

  test('uses the v2 context session binding when messages omit sessionID', async () => {
    const rendered = createWorkIntentEnvelope(SESSION_ID, input());
    const adapter = new WorkIntentAdapter({
      messages: async () => ({ data: [] }),
    });

    const result = await adapter.reconstructTransform(
      [
        {
          info: { id: 'msg_v2', role: 'assistant' },
          parts: [
            {
              type: 'tool',
              name: WORK_INTENT_TOOL,
              state: {
                status: 'completed',
                result: { content: rendered },
              },
            },
          ],
        },
      ],
      SESSION_ID,
    );

    expect(result).toMatchObject({ status: 'known' });
  });

  test('a visible invalid latest candidate replaces an older cached view with UNKNOWN', async () => {
    const adapter = new WorkIntentAdapter({
      messages: async () => ({ data: [] }),
    });
    const valid = createWorkIntentEnvelope(SESSION_ID, input());
    await adapter.reconstructTransform([message('msg_1', [toolPart(valid)])]);

    expect(adapter.get(SESSION_ID)).toMatchObject({ status: 'known' });
    await adapter.reconstructTransform([
      message('msg_2', [toolPart('{"kind":"slim.work-intent.v1"')]),
    ]);
    expect(adapter.get(SESSION_ID)).toEqual({ status: 'unknown' });
  });

  test('a mixed-session transform invalidates the scoped cached view', async () => {
    const adapter = new WorkIntentAdapter({
      messages: async () => ({ data: [] }),
    });
    const valid = createWorkIntentEnvelope(SESSION_ID, input());
    await adapter.reconstructTransform([message('msg_1', [toolPart(valid)])]);

    expect(adapter.get(SESSION_ID)).toMatchObject({ status: 'known' });
    expect(
      await adapter.reconstructTransform(
        [
          message('msg_2', [{ type: 'text', text: 'unexpected' }]),
          message(
            'msg_3',
            [{ type: 'text', text: 'foreign session' }],
            'ses_other',
          ),
        ],
        SESSION_ID,
      ),
    ).toEqual({ status: 'unknown' });
    expect(adapter.get(SESSION_ID)).toEqual({ status: 'unknown' });
  });

  test('history failure is UNKNOWN and the in-memory view stays bounded', async () => {
    const adapter = new WorkIntentAdapter({
      maxSessions: 2,
      messages: async () => {
        throw new Error('host unavailable');
      },
    });
    expect(await adapter.reconstructSession('ses_failed')).toEqual({
      status: 'unknown',
    });

    for (const sessionID of ['ses_1', 'ses_2', 'ses_3']) {
      const rendered = createWorkIntentEnvelope(sessionID, input());
      await adapter.reconstructTransform([
        message('msg_1', [toolPart(rendered, { sessionID })], sessionID),
      ]);
    }
    expect(adapter.get('ses_1')).toEqual({ status: 'unknown' });
    expect(adapter.get('ses_3')).toMatchObject({ status: 'known' });
  });
});
