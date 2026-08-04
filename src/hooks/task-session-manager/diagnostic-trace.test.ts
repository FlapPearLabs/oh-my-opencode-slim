import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBackgroundTaskTrace } from './diagnostic-trace';

const tempDirectories: string[] = [];

async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'omos-trace-'));
  tempDirectories.push(directory);
  return directory;
}

async function readTrace(directory: string, instanceID: string) {
  const content = await readFile(
    path.join(directory, `oh-my-opencode-slim.trace.${instanceID}.log`),
    'utf8',
  );
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(async () => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) await rm(directory, { recursive: true, force: true });
  }
});

describe('background task diagnostic trace', () => {
  test('keeps deterministic receipt order and safe correlation metadata', async () => {
    const directory = await makeTempDirectory();
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-1',
      logDir: directory,
    });

    trace.observeHostEvent({
      event: {
        type: 'session.status',
        properties: {
          sessionID: 'ses-parent',
          status: { type: 'busy' },
        },
      },
    });
    trace.observeTaskToolBefore(
      { tool: 'task', sessionID: 'ses-parent', callID: 'call-1' },
      { args: { subagent_type: 'oracle', model: 'anthropic/sonnet' } },
    );
    trace.observeTaskToolAfter(
      { tool: 'task', sessionID: 'ses-parent', callID: 'call-1' },
      { output: 'secret result', metadata: { taskID: 'ses-child' } },
    );
    trace.observeBoardTransition({
      operation: 'status',
      taskID: 'ses-child',
      parentSessionID: 'ses-parent',
      priorState: 'running',
      resultState: 'completed',
      terminalUnreconciled: true,
      cancellationRequested: false,
      statusUncertain: false,
      timedOut: false,
    } as never);

    await trace.dispose();
    const lines = await readTrace(directory, 'instance-1');
    expect(lines.map((line) => line.sequence)).toEqual([1, 2, 3, 4]);
    expect(lines[0]).toMatchObject({
      source: 'host',
      event: 'session.status',
      metadata: { sessionID: 'ses-parent', state: 'busy' },
    });
    expect(lines[1]).toMatchObject({
      source: 'tool',
      event: 'tool.execute.before',
      metadata: {
        callID: 'call-1',
        sessionID: 'ses-parent',
        tool: 'task',
      },
    });
    expect(lines[3]).toMatchObject({
      source: 'board',
      event: 'board.transition',
      metadata: {
        operation: 'status',
        taskID: 'ses-child',
        parentSessionID: 'ses-parent',
        priorState: 'running',
        resultState: 'completed',
        terminalUnreconciled: true,
        cancellationRequested: false,
        statusUncertain: false,
        timedOut: false,
      },
    });
    expect(lines.every((line) => typeof line.wallTime === 'string')).toBe(true);
    expect(lines.every((line) => typeof line.elapsedMs === 'number')).toBe(
      true,
    );
  });

  test('redacts prompts, descriptions, output, errors, content, and paths', async () => {
    const directory = await makeTempDirectory();
    const forbidden = 'DO-NOT-PERSIST-7f3e';
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-redaction',
      logDir: directory,
    });

    trace.observeHostEvent({
      type: 'permission.asked',
      properties: {
        sessionID: 'ses-1',
        permission: { description: forbidden, path: `/tmp/${forbidden}` },
        question: { text: forbidden },
        error: { name: 'PermissionError', message: forbidden },
      },
    });
    trace.observeTaskToolBefore(
      { tool: 'task', sessionID: 'ses-1' },
      {
        args: {
          prompt: forbidden,
          description: forbidden,
          subagent_type: 'explorer',
        },
      },
    );
    trace.observeTaskToolAfter(
      { tool: 'task', sessionID: 'ses-1' },
      { output: forbidden, error: { name: 'Error', message: forbidden } },
    );

    await trace.dispose();
    const content = await readFile(
      path.join(directory, 'oh-my-opencode-slim.trace.instance-redaction.log'),
      'utf8',
    );
    expect(content).not.toContain(forbidden);
    expect(content).not.toContain('PermissionError');
    expect(content).not.toContain('description');
    expect(content).not.toContain(`/tmp/${forbidden}`);
  });

  test('uses event-specific host and tool allowlists', async () => {
    const directory = await makeTempDirectory();
    const forbidden = 'DO-NOT-PERSIST-allowlist';
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-allowlist',
      logDir: directory,
    });

    trace.observeHostEvent({
      type: 'session.created',
      properties: {
        info: {
          id: 'ses-child',
          parentID: 'ses-parent',
          agent: 'oracle',
          title: forbidden,
        },
        arbitraryID: 'not-allowed',
      },
    });
    trace.observeHostEvent({
      type: 'session.status',
      properties: {
        sessionID: 'ses-child',
        status: {
          type: 'retry',
          attempt: 2,
          next: 450,
          message: forbidden,
        },
        requestID: 'not-allowed',
      },
    });
    trace.observeHostEvent({
      type: 'permission.asked',
      properties: {
        id: 'permission-1',
        sessionID: 'ses-child',
        permission: { id: 'permission-1', description: forbidden },
        path: `/tmp/${forbidden}`,
      },
    });
    trace.observeHostEvent({
      type: 'question.asked',
      properties: {
        id: 'question-1',
        sessionID: 'ses-child',
        questions: [{ text: forbidden }],
      },
    });
    trace.observeHostEvent({
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'part-1',
          messageID: 'message-1',
          callID: 'call-1',
          taskID: 'task-1',
          jobID: 'job-1',
          sessionID: 'ses-child',
          parentSessionID: 'ses-parent',
          tool: 'task',
          state: { status: 'completed', output: forbidden },
          text: forbidden,
        },
      },
    });
    trace.observeTaskToolBefore(
      {
        tool: 'task',
        sessionID: 'ses-parent',
        callID: 'call-1',
        args: { prompt: forbidden, agent: 'oracle' },
      },
      { output: forbidden, metadata: { jobId: 'job-1' } },
    );
    trace.observeTaskToolAfter(
      {
        tool: 'task',
        sessionID: 'ses-parent',
        callID: 'call-1',
        args: { description: forbidden },
      },
      {
        output: forbidden,
        error: { message: forbidden },
        metadata: {
          sessionId: 'ses-child',
          parentSessionId: 'ses-parent',
          jobId: 'job-1',
          callId: 'call-1',
          messageId: 'message-1',
          partId: 'part-1',
          secret: forbidden,
        },
      },
    );

    await trace.dispose();
    const lines = await readTrace(directory, 'instance-allowlist');
    expect(lines[0].metadata).toMatchObject({
      sessionID: 'ses-child',
      parentSessionID: 'ses-parent',
      agent: 'oracle',
    });
    expect(lines[1].metadata).toMatchObject({
      sessionID: 'ses-child',
      state: 'retry',
      retryAttempt: 2,
      retryNextAt: 450,
    });
    expect(lines[2].metadata).toMatchObject({
      sessionID: 'ses-child',
      permissionID: 'permission-1',
      requestID: 'permission-1',
    });
    expect(lines[3].metadata).toMatchObject({
      sessionID: 'ses-child',
      requestID: 'question-1',
    });
    expect(lines[4].metadata).toMatchObject({
      sessionID: 'ses-child',
      parentSessionID: 'ses-parent',
      messageID: 'message-1',
      partID: 'part-1',
      callID: 'call-1',
      taskID: 'task-1',
      jobID: 'job-1',
      state: 'completed',
    });
    expect(lines[5].metadata).toMatchObject({
      tool: 'task',
      sessionID: 'ses-parent',
      callID: 'call-1',
      jobID: 'job-1',
    });
    expect(lines[6].metadata).toMatchObject({
      tool: 'task',
      sessionID: 'ses-parent',
      callID: 'call-1',
      taskID: 'ses-child',
      childSessionID: 'ses-child',
      parentSessionID: 'ses-parent',
      jobID: 'job-1',
      messageID: 'message-1',
      partID: 'part-1',
    });
    expect(JSON.stringify(lines)).not.toContain(forbidden);
    expect(JSON.stringify(lines)).not.toContain('arbitraryID');
    expect(JSON.stringify(lines)).not.toContain('requestID":"not-allowed');
  });

  test('extracts nested host correlations without persisting payloads', async () => {
    const directory = await makeTempDirectory();
    const forbidden = 'DO-NOT-PERSIST-nested';
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-nested',
      logDir: directory,
    });

    trace.observeHostEvent({
      type: 'message.part.updated',
      properties: {
        sessionID: 'ses-parent',
        part: {
          id: 'part-1',
          sessionID: 'ses-child',
          type: 'tool',
          tool: 'task',
          state: {
            status: 'completed',
            input: { prompt: forbidden },
            output: forbidden,
            metadata: {
              sessionId: 'ses-child',
              parentSessionId: 'ses-parent',
              jobId: 'job-1',
              taskId: 'task-1',
              callId: 'call-1',
              messageId: 'message-1',
              partId: 'part-1',
              session_id: 'ignored-session',
              unknownId: 'ignored-id',
              secretPayload: forbidden,
            },
            time: { start: 1, end: 2 },
          },
        },
      },
    });
    trace.observeHostEvent({
      type: 'permission.asked',
      properties: {
        id: 'permission-1',
        sessionID: 'ses-child',
        permission: 'file',
        patterns: [`/tmp/${forbidden}`],
        metadata: { description: forbidden },
        always: [],
        tool: {
          messageID: 'message-permission',
          callID: 'call-permission',
          input: forbidden,
        },
      },
    });
    trace.observeHostEvent({
      type: 'question.asked',
      properties: {
        id: 'question-1',
        sessionID: 'ses-child',
        questions: [
          {
            question: forbidden,
            header: 'Question',
            options: [{ label: forbidden, description: forbidden }],
          },
        ],
        tool: {
          messageID: 'message-question',
          callID: 'call-question',
          input: forbidden,
        },
      },
    });

    await trace.dispose();
    const lines = await readTrace(directory, 'instance-nested');
    expect(lines[0]).toMatchObject({
      event: 'message.part.updated',
      metadata: {
        sessionID: 'ses-parent',
        childSessionID: 'ses-child',
        parentSessionID: 'ses-parent',
        messageID: 'message-1',
        partID: 'part-1',
        callID: 'call-1',
        taskID: 'task-1',
        jobID: 'job-1',
        state: 'completed',
      },
    });
    expect(lines[1]).toMatchObject({
      event: 'permission.asked',
      metadata: {
        sessionID: 'ses-child',
        permissionID: 'permission-1',
        requestID: 'permission-1',
        messageID: 'message-permission',
        callID: 'call-permission',
      },
    });
    expect(lines[2]).toMatchObject({
      event: 'question.asked',
      metadata: {
        sessionID: 'ses-child',
        requestID: 'question-1',
        messageID: 'message-question',
        callID: 'call-question',
      },
    });
    expect(JSON.stringify(lines)).not.toContain(forbidden);
    expect(JSON.stringify(lines)).not.toContain('ignored-session');
    expect(JSON.stringify(lines)).not.toContain('ignored-id');
  });

  test('records generic tool boundaries without args or output content', async () => {
    const directory = await makeTempDirectory();
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-generic-tool',
      logDir: directory,
    });

    trace.observeTaskToolBefore(
      { tool: 'bash', sessionID: 'ses-parent', callID: 'call-bash' },
      { args: { command: 'secret-command' } },
    );
    trace.observeTaskToolAfter(
      { tool: 'bash', sessionID: 'ses-parent', callID: 'call-bash' },
      { output: 'secret-output', metadata: { jobID: 'job-bash' } },
    );

    await trace.dispose();
    const lines = await readTrace(directory, 'instance-generic-tool');
    expect(lines).toMatchObject([
      {
        source: 'tool',
        event: 'tool.execute.before',
        metadata: {
          tool: 'bash',
          sessionID: 'ses-parent',
          callID: 'call-bash',
        },
      },
      {
        source: 'tool',
        event: 'tool.execute.after',
        metadata: {
          tool: 'bash',
          sessionID: 'ses-parent',
          callID: 'call-bash',
          jobID: 'job-bash',
        },
      },
    ]);
    expect(JSON.stringify(lines)).not.toContain('secret-command');
    expect(JSON.stringify(lines)).not.toContain('secret-output');
    expect(
      lines.every((line) => {
        const metadata = line.metadata as Record<string, unknown>;
        return metadata.args === undefined && metadata.output === undefined;
      }),
    ).toBe(true);
  });

  test('records delta activity then periodic count and byte summaries', async () => {
    const directory = await makeTempDirectory();
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-delta',
      logDir: directory,
    });

    for (let index = 0; index < 33; index += 1) {
      trace.observeHostEvent({
        type: 'message.part.delta',
        properties: {
          sessionID: 'ses-delta',
          delta: 'delta-secret',
        },
      });
    }
    trace.observeHostEvent({ type: 'session.idle' });

    await trace.dispose();
    const lines = await readTrace(directory, 'instance-delta');
    const deltaLines = lines.filter((line) =>
      String(line.event).startsWith('delta.'),
    );
    expect(deltaLines.map((line) => line.event)).toEqual([
      'delta.activity',
      'delta.summary',
      'delta.summary',
    ]);
    expect(deltaLines.at(-1)).toMatchObject({
      metadata: { count: 33, bytes: 33 * Buffer.byteLength('delta-secret') },
    });
    expect(JSON.stringify(lines)).not.toContain('delta-secret');
  });

  test('keeps parallel delta streams keyed by their correlation identity', async () => {
    const directory = await makeTempDirectory();
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-parallel-delta',
      logDir: directory,
    });

    trace.observeHostEvent({
      type: 'message.part.delta',
      properties: {
        sessionID: 'ses-delta',
        messageID: 'message-1',
        partID: 'part-a',
        delta: 'aaa',
      },
    });
    trace.observeHostEvent({
      type: 'message.part.delta',
      properties: {
        sessionID: 'ses-delta',
        messageID: 'message-1',
        partID: 'part-b',
        delta: 'bbbb',
      },
    });
    trace.observeHostEvent({
      type: 'message.part.delta',
      properties: {
        sessionID: 'ses-delta',
        messageID: 'message-1',
        partID: 'part-a',
        delta: 'cc',
      },
    });
    trace.observeHostEvent({ type: 'session.idle' });

    await trace.dispose();
    const lines = await readTrace(directory, 'instance-parallel-delta');
    const summaries = lines.filter((line) => line.event === 'delta.summary');
    expect(summaries).toHaveLength(2);
    expect(summaries).toContainEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          partID: 'part-a',
          count: 2,
          bytes: Buffer.byteLength('aaa') + Buffer.byteLength('cc'),
        }),
      }),
    );
    expect(summaries).toContainEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          partID: 'part-b',
          count: 1,
          bytes: Buffer.byteLength('bbbb'),
        }),
      }),
    );
  });

  test('flushes an isolated delta before disposal rejects observations', async () => {
    const directory = await makeTempDirectory();
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-isolated-delta',
      logDir: directory,
    });

    trace.observeHostEvent({
      type: 'message.part.delta',
      properties: {
        sessionID: 'ses-isolated',
        messageID: 'message-isolated',
        partID: 'part-isolated',
        delta: 'isolated-secret',
      },
    });
    await trace.dispose();
    trace.observeHostEvent({ type: 'session.deleted' });

    const lines = await readTrace(directory, 'instance-isolated-delta');
    expect(lines.map((line) => line.event)).toEqual([
      'delta.activity',
      'delta.summary',
    ]);
    expect(lines[1]).toMatchObject({
      metadata: {
        sessionID: 'ses-isolated',
        messageID: 'message-isolated',
        partID: 'part-isolated',
        count: 1,
        bytes: Buffer.byteLength('isolated-secret'),
      },
    });
    expect(JSON.stringify(lines)).not.toContain('isolated-secret');
  });

  test('drops newest records at capacity and emits a gap record', async () => {
    const directory = await makeTempDirectory();
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-overflow',
      logDir: directory,
    });

    for (let index = 0; index < 4096; index += 1) {
      trace.observeHostEvent({
        type: 'session.status',
        properties: { sessionID: `ses-${index}`, status: { type: 'busy' } },
      });
    }

    await trace.dispose();
    const lines = await readTrace(directory, 'instance-overflow');
    const gaps = lines.filter((line) => line.event === 'trace.gap');
    expect(gaps.length).toBeGreaterThan(0);
    expect(
      gaps.some((line) => {
        const metadata = line.metadata as { count?: unknown };
        return Number(metadata.count) > 0;
      }),
    ).toBe(true);
  });

  test('fails open after an append failure and remains disposable', async () => {
    const directory = await makeTempDirectory();
    const blockedPath = path.join(directory, 'not-a-directory');
    await writeFile(blockedPath, 'blocked');
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-failure',
      logDir: blockedPath,
    });

    expect(() => {
      trace.observeHostEvent({ type: 'session.created' });
      trace.observeTaskToolBefore(null, null);
      trace.observeBoardTransition(null as never);
    }).not.toThrow();
    await expect(trace.dispose()).resolves.toBeUndefined();
    await expect(trace.dispose()).resolves.toBeUndefined();
  });

  test('handles malformed payloads and refuses events after idempotent dispose', async () => {
    const directory = await makeTempDirectory();
    const trace = createBackgroundTaskTrace({
      instanceID: 'instance-malformed',
      logDir: directory,
    });
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error('malformed payload');
        },
      },
    );

    trace.observeHostEvent(null);
    trace.observeHostEvent('not-an-event');
    trace.observeHostEvent([]);
    trace.observeHostEvent(throwing);
    trace.observeTaskToolBefore(throwing, throwing);
    trace.observeTaskToolAfter(undefined, 42);

    const firstDispose = trace.dispose();
    const secondDispose = trace.dispose();
    expect(secondDispose).toBe(firstDispose);
    await firstDispose;
    trace.observeHostEvent({ type: 'session.deleted' });

    const lines = await readTrace(directory, 'instance-malformed');
    expect(lines.length).toBe(6);
    expect(lines.every((line) => line.metadata !== undefined)).toBe(true);
  });
});
