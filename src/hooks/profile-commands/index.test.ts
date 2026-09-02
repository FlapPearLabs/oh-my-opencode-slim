import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as cliPaths from '../../cli/paths';
import { readProfile, writeProfile } from '../../config/profile';
import { createProfileCommandsHook } from './index';

describe('Profile Commands Hook', () => {
  const tmpHome = path.join(
    os.tmpdir(),
    `opencode-slim-cmd-test-${Date.now()}`,
  );
  const profileDir = path.join(tmpHome, '.config', 'opencode');
  const profilePath = path.join(profileDir, 'slim-profile.json');
  const hostConfigPath = path.join(profileDir, 'opencode.json');

  let originalDirEnv: string | undefined;
  let originalEnv: string | undefined;
  let getExistingConfigPathSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    originalDirEnv = process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR;
    process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR = profileDir;
    originalEnv = process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED;
    process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED = '1';

    fs.mkdirSync(profileDir, { recursive: true });
    writeProfile('opencode-go'); // Set active profile

    getExistingConfigPathSpy = mock(() => hostConfigPath);
    mock.module('../../cli/paths', () => ({
      ...cliPaths,
      getExistingConfigPath: getExistingConfigPathSpy,
      ensureOpenCodeConfigDir: () => {},
    }));
  });

  afterEach(() => {
    if (originalDirEnv === undefined) {
      delete process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR;
    } else {
      process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR = originalDirEnv;
    }
    if (originalEnv === undefined) {
      delete process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED;
    } else {
      process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED = originalEnv;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('E. Staging semantics - active=opencode-go, set(antigravity)', async () => {
    // Captures 'opencode-go' at initialization
    const hook = createProfileCommandsHook([]);

    const output = { parts: [] as any[] };
    await hook.handleCommandExecuteBefore(
      { command: 'slim-ag', sessionID: '1', arguments: '' },
      output,
    );

    expect(output.parts[0].text).toContain('Slim profile staged: antigravity');
    expect(output.parts[0].text).toContain('Restart OpenCode to activate.');

    expect(readProfile()).toBe('antigravity');

    // Test slim-profile command shows active vs next
    const profileOutput = { parts: [] as any[] };
    await hook.handleCommandExecuteBefore(
      { command: 'slim-profile', sessionID: '1', arguments: '' },
      profileOutput,
    );

    const text = profileOutput.parts[0].text;
    expect(text).toContain('Active:\n  opencode-go');
    expect(text).toContain('Next launch:\n  antigravity');
    expect(text).toContain('Restart required:\n  yes');
  });

  test('F-02. /slim-ag clears Slim-managed host model overrides', async () => {
    // Setup host config with explicit overrides
    fs.writeFileSync(
      hostConfigPath,
      JSON.stringify({
        agent: {
          orchestrator: { model: 'some-custom-model', variant: 'low' },
          oracle: { model: 'another-model' },
          unrelated: { model: 'survives' },
        },
      }),
    );

    const hook = createProfileCommandsHook(['orchestrator', 'oracle', 'fixer']);
    const output = { parts: [] as any[] };
    await hook.handleCommandExecuteBefore(
      { command: 'slim-ag', sessionID: '1', arguments: '' },
      output,
    );

    expect(output.parts[0].text).toContain('Slim profile staged: antigravity');

    // Check if host config was modified
    const hostConfig = JSON.parse(fs.readFileSync(hostConfigPath, 'utf-8'));
    expect(hostConfig.agent.orchestrator.model).toBeUndefined();
    // variant should survive
    expect(hostConfig.agent.orchestrator.variant).toBe('low');
    expect(hostConfig.agent.oracle.model).toBeUndefined();
    // unrelated agent survives completely
    expect(hostConfig.agent.unrelated.model).toBe('survives');
  });

  test('F-02. /slim-go clears Slim-managed host model overrides', async () => {
    fs.writeFileSync(
      hostConfigPath,
      JSON.stringify({
        agent: {
          fixer: { model: 'custom-fixer-model', prompt: 'custom prompt' },
        },
      }),
    );

    const hook = createProfileCommandsHook(['fixer', 'explorer']);
    const output = { parts: [] as any[] };
    await hook.handleCommandExecuteBefore(
      { command: 'slim-go', sessionID: '1', arguments: '' },
      output,
    );

    const hostConfig = JSON.parse(fs.readFileSync(hostConfigPath, 'utf-8'));
    expect(hostConfig.agent.fixer.model).toBeUndefined();
    expect(hostConfig.agent.fixer.prompt).toBe('custom prompt');
  });

  test('F-02. switching profile when no host override exists works cleanly', async () => {
    // No opencode.json exists
    if (fs.existsSync(hostConfigPath)) fs.unlinkSync(hostConfigPath);

    const hook = createProfileCommandsHook(['orchestrator']);
    const output = { parts: [] as any[] };

    // Should not throw
    await hook.handleCommandExecuteBefore(
      { command: 'slim-ag', sessionID: '1', arguments: '' },
      output,
    );
    expect(readProfile()).toBe('antigravity');
  });
  test('F. Restart semantics - active=antigravity, next=antigravity', async () => {
    writeProfile('antigravity');
    // Captures 'antigravity' at initialization
    const hook = createProfileCommandsHook([]);

    const profileOutput = { parts: [] as any[] };
    await hook.handleCommandExecuteBefore(
      { command: 'slim-profile', sessionID: '1', arguments: '' },
      profileOutput,
    );

    const text = profileOutput.parts[0].text;
    expect(text).toContain('Active:\n  antigravity');
    expect(text).toContain('Next launch:\n  antigravity');
    expect(text).toContain('Restart required:\n  no');
  });
});
