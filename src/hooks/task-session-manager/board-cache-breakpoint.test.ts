/**
 * Regression coverage for the Background Job Board prompt-cache boundary.
 *
 * The `latest` strategy deliberately owns the board as one volatile synthetic
 * user message at the end of the payload. Every request strips older tagged
 * board content first, then appends a fresh trailing message. Real history is
 * therefore never rewritten when the board changes, and the cache-safe stable
 * prefix remains available before the volatile tail.
 *
 * This suite models core's caching + SDK merge to verify that boundary and the
 * exact message placement used by the current implementation.
 */
import { describe, expect, mock, test } from 'bun:test';
import { DEFAULT_MAX_RETAINED_SNAPSHOTS } from '../../config/constants';
import { BackgroundJobBoard } from '../../utils';
import {
  BACKGROUND_JOB_BOARD_METADATA_KEY,
  createTaskSessionManagerHook,
} from './index';

const SESSION = 'ses_orchestrator_1114';

function createHook(board: BackgroundJobBoard) {
  return createTaskSessionManagerHook(
    {
      client: { session: { status: mock(async () => ({ data: {} })) } },
      directory: '/tmp',
      worktree: '/tmp',
    } as never,
    {
      maxSessionsPerAgent: 4,
      maxRetainedSnapshots: DEFAULT_MAX_RETAINED_SNAPSHOTS,
      backgroundJobBoard: board,
      shouldManageSession: () => true,
    },
  );
}

function userMsg(id: string, text: string) {
  return {
    info: { role: 'user', agent: 'orchestrator', sessionID: SESSION, id },
    parts: [{ type: 'text', text }],
  };
}

function anonymousUserMsg(text: string) {
  return {
    info: { role: 'user', agent: 'orchestrator', sessionID: SESSION },
    parts: [{ type: 'text', text }],
  };
}

function assistantMsg(id: string, text: string) {
  return {
    info: { role: 'assistant', agent: 'orchestrator', sessionID: SESSION, id },
    parts: [{ type: 'text', text }],
  };
}

/** An assistant turn issuing a tool call, followed by its user tool_result. */
function toolTurn(id: string, output: string) {
  return [
    {
      info: {
        role: 'assistant',
        agent: 'orchestrator',
        sessionID: SESSION,
        id: `${id}-a`,
      },
      parts: [
        { type: 'text', text: ' ' },
        {
          type: 'tool',
          tool: 'read',
          callID: `${id}-call`,
          state: { status: 'completed', input: {}, output: 'x' },
        },
      ],
    },
    {
      info: {
        role: 'user',
        agent: 'orchestrator',
        sessionID: SESSION,
        id: `${id}-r`,
      },
      parts: [
        {
          type: 'tool',
          tool: 'read',
          callID: `${id}-call`,
          state: { status: 'completed', input: {}, output },
        },
      ],
    },
  ];
}

async function inject(
  hook: ReturnType<typeof createTaskSessionManagerHook>,
  history: unknown[],
): Promise<unknown[]> {
  // opencode rebuilds msgs from storage every request; the board is never
  // persisted, so each request starts from real history only.
  const request = { messages: structuredClone(history) };
  await hook['experimental.chat.messages.transform']({}, request as never);
  await hook.injectBackgroundJobBoard({}, request as never);
  return request.messages;
}

type Msg = {
  info: { role: string; id?: string };
  parts: { metadata?: Record<string, unknown> }[];
};

/**
 * Faithful model of the provider cache pipeline that produced the field bug,
 * in the exact order opencode runs it (`provider/transform.ts`):
 *
 *   1. `applyCaching` selects the breakpoint messages as `msgs.slice(-2)` over
 *      the message array BEFORE the SDK coalesces roles.
 *   2. the provider SDK then coalesces adjacent same-role messages. When the
 *      board follows an assistant message, the assistant breakpoint remains a
 *      stable prefix and the board remains the volatile tail.
 *
 * A breakpoint is READABLE next request only if the exact byte prefix ending
 * at that breakpoint message reproduces. Returns the readable byte-prefixes
 * this request establishes (one per breakpoint message, measured over the full
 * ordered block stream).
 */
function readableCachePrefixes(messages: unknown[]): string[] {
  const msgs = messages as Msg[];

  // Assign each message to its post-merge coalesced-turn index.
  const turnOfMessage: number[] = [];
  const turnEndPrefix: string[] = [];
  let acc = '';
  let turnIndex = -1;
  let prevRole: string | undefined;
  for (const message of msgs) {
    if (message.info.role !== prevRole) {
      turnIndex += 1;
      prevRole = message.info.role;
    }
    for (const part of message.parts) acc += JSON.stringify(part);
    turnOfMessage.push(turnIndex);
    turnEndPrefix[turnIndex] = acc; // running end-of-turn prefix
  }

  // applyCaching selects the last two MESSAGES (pre-merge). Each realizes its
  // cache_control on the LAST block of the coalesced turn it merges into, so
  // the readable prefix ends at that turn's end — not the message's own end.
  const breakpointMessages = [msgs.length - 2, msgs.length - 1].filter(
    (i) => i >= 0,
  );
  const prefixes = new Set<string>();
  for (const mi of breakpointMessages) {
    prefixes.add(turnEndPrefix[turnOfMessage[mi]]);
  }
  return [...prefixes];
}

describe('background job board cache breakpoint stability', () => {
  test('a readable cache breakpoint falls before the volatile board tail', async () => {
    const board = new BackgroundJobBoard();
    board.registerLaunch({
      taskID: 'child-1',
      parentSessionID: SESSION,
      agent: 'librarian',
      description: 'research',
    });
    const hook = createHook(board);

    // Request N: the board follows an assistant turn, so the two tail
    // breakpoints do not collapse into one same-role turn.
    const historyN = [
      userMsg('u1', 'Coordinate'),
      assistantMsg('a1', 'Planning the work'),
    ];
    const outN = await inject(hook, historyN);

    // Request N+1: the conversation advanced with another real user turn.
    const historyN1 = [
      userMsg('u1', 'Coordinate'),
      assistantMsg('a1', 'Planning the work'),
      userMsg('u2', 'Continue with the result'),
    ];
    const outN1 = await inject(hook, historyN1);

    expect(
      (outN as unknown[]).at(-1),
      'request N must end with the synthetic volatile board message',
    ).toMatchObject({ info: { role: 'user' } });
    expect(
      (outN1 as unknown[]).at(-1),
      'request N+1 must end with the synthetic volatile board message',
    ).toMatchObject({ info: { role: 'user' } });

    // At least one readable byte-prefix from request N is a prefix of request
    // N+1's full byte stream. The stable assistant turn is before the volatile
    // board and can therefore be reused by the provider cache.
    const prefixesN = readableCachePrefixes(outN);
    const streamN1 = readableCachePrefixes(outN1).at(-1) ?? '';
    expect(prefixesN.some((prefix) => streamN1.startsWith(prefix))).toBe(true);
  });

  test('board is exactly one trailing synthetic message after real history', async () => {
    const board = new BackgroundJobBoard();
    board.registerLaunch({
      taskID: 'child-1',
      parentSessionID: SESSION,
      agent: 'librarian',
      description: 'research',
    });
    const hook = createHook(board);

    const history = [
      userMsg('u1', 'Coordinate'),
      ...toolTurn('t1', 'result-1'),
      userMsg('u2', 'Continue'),
    ];

    const emptyHook = createHook(new BackgroundJobBoard());
    const boardFree = await inject(emptyHook, history);
    const withBoard = await inject(hook, history);

    // The latest strategy owns one extra volatile message at the payload tail.
    expect((withBoard as unknown[]).length).toBe(
      (boardFree as unknown[]).length + 1,
    );

    // The board does not mutate any real message or part.
    expect(withBoard.slice(0, -1)).toEqual(boardFree);

    // The single board part is the only part of the final synthetic message.
    const boardParts = (withBoard as Msg[]).flatMap((m, i) =>
      m.parts
        .map((p, pi) => ({ i, pi, p }))
        .filter(
          ({ p }) => p.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
        ),
    );
    expect(boardParts).toHaveLength(1);
    const last = withBoard.at(-1) as Msg;
    expect(boardParts[0].i).toBe(withBoard.length - 1);
    expect(boardParts[0].pi).toBe(0);
    expect(last.parts).toHaveLength(1);
    expect(last.info.role).toBe('user');
    expect(last.info.id).toBe('u2-background-job-board');
  });

  test('previously-sent history bytes never change across a growing conversation', async () => {
    const board = new BackgroundJobBoard();
    board.registerLaunch({
      taskID: 'child-1',
      parentSessionID: SESSION,
      agent: 'librarian',
      description: 'research',
    });
    const hook = createHook(board);

    const historyN = [
      userMsg('u1', 'Coordinate'),
      assistantMsg('a1', 'Planning the work'),
    ];
    const outN = await inject(hook, historyN);

    board.updateStatus({
      taskID: 'child-1',
      state: 'completed',
      resultSummary: 'done',
    });
    const historyN1 = [
      userMsg('u1', 'Coordinate'),
      assistantMsg('a1', 'Planning the work'),
      userMsg('u2', 'Continue with the result'),
    ];
    const outN1 = await inject(hook, historyN1);

    // Every real message present in request N must be byte-identical in N+1.
    // Board churn is isolated to the synthetic trailing message.
    expect(outN1.slice(0, -1).slice(0, outN.length - 1)).toEqual(
      outN.slice(0, -1),
    );
    expect(
      (outN as Msg[])
        .at(-1)
        ?.parts.every(
          (part) => part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
        ),
    ).toBe(true);
    expect(
      (outN1 as Msg[])
        .at(-1)
        ?.parts.every(
          (part) => part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
        ),
    ).toBe(true);
  });

  test('strips prior tagged board content before appending one fresh tail', async () => {
    const board = new BackgroundJobBoard();
    board.registerLaunch({
      taskID: 'ses_child',
      parentSessionID: SESSION,
      agent: 'librarian',
      description: 'grok research',
    });
    const hook = createHook(board);

    const historyA = [
      userMsg('u1', 'Coordinate'),
      assistantMsg('a1', 'Planning the work'),
    ];
    const outA = await inject(hook, historyA);

    expect(
      (outA as Msg[])
        .at(-1)
        ?.parts.every(
          (part) => part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
        ),
    ).toBe(true);

    // A real caller rebuild can still contain a previously transformed board;
    // latest strips it before appending the new board at the new tail.
    const historyB = [...outA, userMsg('u2', 'Continue')];
    const outB = await inject(hook, historyB);
    const boardMessages = (outB as Msg[]).filter((message) =>
      message.parts.every(
        (part) => part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
      ),
    );

    expect(boardMessages).toHaveLength(1);
    expect(outB.at(-1)).toBe(boardMessages[0]);
    expect(
      (outB as Msg[])
        .slice(0, -1)
        .some((message) =>
          message.parts.some(
            (part) =>
              part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
          ),
        ),
    ).toBe(false);
    expect(outB.slice(0, -1)).toEqual([
      ...outA.slice(0, -1),
      userMsg('u2', 'Continue'),
    ]);
  });

  test('duplicate anonymous user turns keep one board at the latest tail', async () => {
    const board = new BackgroundJobBoard();
    board.registerLaunch({
      taskID: 'child-1',
      parentSessionID: SESSION,
      agent: 'librarian',
      description: 'research',
    });
    const hook = createHook(board);

    const firstRequest = await inject(hook, [anonymousUserMsg('continue')]);
    expect(
      (firstRequest as Msg[]).filter((message) =>
        message.parts.every(
          (part) => part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
        ),
      ),
    ).toHaveLength(1);

    const secondRequest = await inject(hook, [
      ...firstRequest,
      anonymousUserMsg('continue'),
    ]);

    // Anonymous messages have no stable id to retain. The old tagged message
    // is stripped, and exactly one fresh board is appended for the newest turn.
    expect(
      (secondRequest as Msg[]).flatMap((message) =>
        message.parts.filter(
          (part) => part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
        ),
      ),
    ).toHaveLength(1);
    expect(secondRequest.at(-1)).toMatchObject({ info: { role: 'user' } });
    expect(secondRequest.slice(0, -1)).toEqual([
      ...firstRequest.slice(0, -1),
      anonymousUserMsg('continue'),
    ]);
  });

  test('tool-result tails remain board-free and preserve the tool-loop history', async () => {
    const board = new BackgroundJobBoard();
    board.registerLaunch({
      taskID: 'ses_child',
      parentSessionID: SESSION,
      agent: 'librarian',
      description: 'grok research',
    });
    const hook = createHook(board);

    const base = [
      userMsg('u1', 'Coordinate the work'),
      ...toolTurn('t1', 'r1'),
    ];
    const outN = await inject(hook, base);

    // A tool-result-only user turn is not an eligible latest board trigger.
    expect((outN as unknown[]).length).toBe(base.length);
    expect(
      (outN as Msg[]).some((message) =>
        message.parts.some(
          (part) => part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
        ),
      ),
    ).toBe(false);

    // Advance by one more tool turn (as the loop did between dumps).
    const advanced = [
      userMsg('u1', 'Coordinate the work'),
      ...toolTurn('t1', 'r1'),
      ...toolTurn('t2', 'r2'),
    ];
    const outN1 = await inject(hook, advanced);

    expect((outN1 as unknown[]).length).toBe(advanced.length);
    expect(
      (outN1 as Msg[]).some((message) =>
        message.parts.some(
          (part) => part.metadata?.[BACKGROUND_JOB_BOARD_METADATA_KEY] === true,
        ),
      ),
    ).toBe(false);
  });
});
