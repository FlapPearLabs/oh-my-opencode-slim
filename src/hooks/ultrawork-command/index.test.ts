import { describe, expect, it } from 'bun:test';
import { createUltraworkCommandHook } from '.';

describe('ultrawork command hook', () => {
  function makeHook() {
    return createUltraworkCommandHook();
  }

  function makeOutput(): { parts: Array<{ type: string; text?: string }> } {
    return { parts: [] };
  }

  it('registers /ultrawork and /ulw commands', () => {
    const hook = makeHook();
    const config: Record<string, unknown> = {};
    hook.registerCommand(config);

    // registerCommandHook writes into the config object
    // We just verify it does not throw.
    expect(config).toBeDefined();
  });

  it('ignores irrelevant commands', async () => {
    const hook = makeHook();
    const output = makeOutput();
    await hook.handleCommandExecuteBefore(
      { command: 'deepwork', sessionID: 's1', arguments: 'some task' },
      output,
    );
    expect(output.parts).toHaveLength(0);
  });

  it('returns help when no arguments provided — /ultrawork', async () => {
    const hook = makeHook();
    const output = makeOutput();
    await hook.handleCommandExecuteBefore(
      { command: 'ultrawork', sessionID: 's1', arguments: '' },
      output,
    );
    expect(output.parts).toHaveLength(1);
    expect(output.parts[0].text).toContain('Usage');
    expect(output.parts[0].text).toContain('/ultrawork');
    expect(output.parts[0].text).toContain('/ulw');
  });

  it('returns help when no arguments provided — /ulw alias', async () => {
    const hook = makeHook();
    const output = makeOutput();
    await hook.handleCommandExecuteBefore(
      { command: 'ulw', sessionID: 's1', arguments: '   ' },
      output,
    );
    expect(output.parts).toHaveLength(1);
    expect(output.parts[0].text).toContain('Usage');
  });

  it('emits activation prompt for /ultrawork with ticket text', async () => {
    const hook = makeHook();
    const output = makeOutput();
    await hook.handleCommandExecuteBefore(
      {
        command: 'ultrawork',
        sessionID: 's1',
        arguments: 'implement rate limiting with tests',
      },
      output,
    );
    expect(output.parts).toHaveLength(1);
    const text = output.parts[0].text ?? '';
    expect(text).toContain('ultrawork skill');
    expect(text).toContain('implement rate limiting with tests');
    expect(text).toContain('.slim/deepwork/');
    expect(text).toContain('completion gate');
    expect(text).toContain('CAUSED_BY_THIS_CHANGE');
    expect(text).toContain('BLOCKED_BY_USER');
  });

  it('emits activation prompt for /ulw alias', async () => {
    const hook = makeHook();
    const output = makeOutput();
    await hook.handleCommandExecuteBefore(
      { command: 'ulw', sessionID: 's1', arguments: 'refactor auth' },
      output,
    );
    expect(output.parts).toHaveLength(1);
    const text = output.parts[0].text ?? '';
    expect(text).toContain('ultrawork skill');
    expect(text).toContain('refactor auth');
  });

  it('activation prompt does NOT mention model profile changes', async () => {
    const hook = makeHook();
    const output = makeOutput();
    await hook.handleCommandExecuteBefore(
      { command: 'ultrawork', sessionID: 's1', arguments: 'any ticket' },
      output,
    );
    const text = output.parts[0].text ?? '';
    // Must not silently switch model profile
    expect(text).not.toContain('slim-go');
    expect(text).not.toContain('slim-ag');
    expect(text).not.toContain('opencode-go');
    expect(text).not.toContain('antigravity');
  });

  it('activation prompt includes resume-from-progress instruction', async () => {
    const hook = makeHook();
    const output = makeOutput();
    await hook.handleCommandExecuteBefore(
      { command: 'ultrawork', sessionID: 's1', arguments: 'big ticket' },
      output,
    );
    const text = output.parts[0].text ?? '';
    expect(text).toContain('resume');
    expect(text).toContain('.slim/deepwork/');
  });

  it('clears prior output parts before injecting new ones', async () => {
    const hook = makeHook();
    const output: { parts: Array<{ type: string; text?: string }> } = {
      parts: [{ type: 'text', text: 'stale content' }],
    };
    await hook.handleCommandExecuteBefore(
      { command: 'ultrawork', sessionID: 's1', arguments: 'real ticket' },
      output,
    );
    expect(output.parts).toHaveLength(1);
    expect(output.parts[0].text).not.toContain('stale content');
  });
});
