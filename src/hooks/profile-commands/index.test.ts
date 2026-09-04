import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as cliPaths from '../../cli/paths';
import { readProfile, writeProfile } from '../../config/profile';
import {
  createProfileCommandsHook,
  type ProfileRuntimeSource,
  resolveOrchestratorResolution,
} from './index';

function makeRuntimeSource(
  overrides: Partial<ProfileRuntimeSource> = {},
): ProfileRuntimeSource {
  return {
    getPresetName: () => undefined,
    getHostAgentModel: () => undefined,
    getPresetOrchestratorModel: () => undefined,
    getFactoryOrchestratorModel: () => undefined,
    ...overrides,
  };
}

describe('Profile Commands Hook', () => {
  const tmpHome = path.join(
    os.tmpdir(),
    `opencode-slim-cmd-test-${Date.now()}`,
  );
  const profileDir = path.join(tmpHome, '.config', 'opencode');
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

    // Test slim-profile command shows active vs next using the six labels
    const profileOutput = { parts: [] as any[] };
    await hook.handleCommandExecuteBefore(
      { command: 'slim-profile', sessionID: '1', arguments: '' },
      profileOutput,
    );

    const text = profileOutput.parts[0].text;
    expect(text).toContain('MODEL_PROFILE_ACTIVE: opencode-go');
    expect(text).toContain('MODEL_PROFILE_STAGED: antigravity');
    expect(text).toContain('Restart required: yes');
  });

  test('URV1-04A D1. /slim-ag preserves user-owned/unknown host model overrides and reports retention', async () => {
    // Setup host config with explicit overrides whose provenance is user or
    // unknown (no Slim producer exists, so none is provably Slim-managed).
    fs.writeFileSync(
      hostConfigPath,
      JSON.stringify({
        agent: {
          orchestrator: { model: 'user/custom-model', variant: 'low' },
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
    expect(output.parts[0].text).toContain(
      'Host model override preserved for: orchestrator, oracle',
    );

    // Host config must be untouched: overrides are preserved, never deleted.
    const hostConfig = JSON.parse(fs.readFileSync(hostConfigPath, 'utf-8'));
    expect(hostConfig.agent.orchestrator.model).toBe('user/custom-model');
    // variant should survive
    expect(hostConfig.agent.orchestrator.variant).toBe('low');
    expect(hostConfig.agent.oracle.model).toBe('another-model');
    // unrelated agent survives completely
    expect(hostConfig.agent.unrelated.model).toBe('survives');
  });

  test('URV1-04A D1. /slim-go preserves user-owned/unknown host model overrides and reports retention', async () => {
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

    expect(output.parts[0].text).toContain('Slim profile staged: opencode-go');
    expect(output.parts[0].text).toContain(
      'Host model override preserved for: fixer',
    );

    const hostConfig = JSON.parse(fs.readFileSync(hostConfigPath, 'utf-8'));
    expect(hostConfig.agent.fixer.model).toBe('custom-fixer-model');
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
    expect(output.parts[0].text).not.toContain(
      'Host model override preserved for:',
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
    expect(text).toContain('MODEL_PROFILE_ACTIVE: antigravity');
    expect(text).toContain('MODEL_PROFILE_STAGED: antigravity');
    expect(text).toContain('Restart required: no');
  });

  test('URV1-04A D2. /slim-profile reports six separate authority values when a host override wins', async () => {
    const source = makeRuntimeSource({
      getPresetName: () => 'prod',
      getHostAgentModel: (name) =>
        name === 'orchestrator' ? 'user/custom-model' : undefined,
      getPresetOrchestratorModel: () => 'preset/orchestrator',
      getFactoryOrchestratorModel: () => 'factory/orchestrator',
    });
    const hook = createProfileCommandsHook(['orchestrator'], source);

    const profileOutput = { parts: [] as any[] };
    await hook.handleCommandExecuteBefore(
      { command: 'slim-profile', sessionID: '1', arguments: '' },
      profileOutput,
    );

    const text = profileOutput.parts[0].text;
    expect(text).toContain('MODEL_PROFILE_ACTIVE: opencode-go');
    expect(text).toContain('MODEL_PROFILE_STAGED: opencode-go');
    expect(text).toContain('PRESET: prod');
    expect(text).toContain('HOST_ORCHESTRATOR_OVERRIDE: user/custom-model');
    expect(text).toContain('RESOLVED_ORCHESTRATOR_MODEL: user/custom-model');
    expect(text).toContain('RESOLUTION_AUTHORITY: HOST');

    // The mapping default must not be presented as the resolved model.
    expect(text).not.toContain(
      'RESOLVED_ORCHESTRATOR_MODEL: opencode-go/minimax-m3',
    );
    // No conflation of mapping defaults under a generic "routing" banner.
    expect(text).not.toContain('Active routing');
    expect(text).not.toContain('Next routing');
  });

  test('URV1-04A D2. /slim-profile reports PROFILE authority when no host override exists', async () => {
    writeProfile('antigravity');
    const source = makeRuntimeSource({
      getPresetName: () => 'prod',
      getPresetOrchestratorModel: () => 'preset/orchestrator',
      getFactoryOrchestratorModel: () => 'factory/orchestrator',
    });
    const hook = createProfileCommandsHook(['orchestrator'], source);

    const profileOutput = { parts: [] as any[] };
    await hook.handleCommandExecuteBefore(
      { command: 'slim-profile', sessionID: '1', arguments: '' },
      profileOutput,
    );

    const text = profileOutput.parts[0].text;
    expect(text).toContain('MODEL_PROFILE_ACTIVE: antigravity');
    expect(text).toContain('PRESET: prod');
    expect(text).toContain('HOST_ORCHESTRATOR_OVERRIDE: (none)');
    expect(text).toContain(
      'RESOLVED_ORCHESTRATOR_MODEL: google/antigravity-gemini-3.1-pro',
    );
    expect(text).toContain('RESOLUTION_AUTHORITY: PROFILE');
  });

  test('URV1-04A precedence resolver follows host > profile > preset > factory', () => {
    const base = {
      presetOrchestratorModel: 'preset/orchestrator',
      factoryOrchestratorModel: 'factory/orchestrator',
    } as const;

    expect(
      resolveOrchestratorResolution({
        activeProfile: 'opencode-go',
        hostOrchestratorModel: 'user/custom-model',
        ...base,
      }),
    ).toEqual({ model: 'user/custom-model', authority: 'HOST' });

    expect(
      resolveOrchestratorResolution({
        activeProfile: 'opencode-go',
        hostOrchestratorModel: undefined,
        ...base,
      }),
    ).toEqual({ model: 'opencode-go/minimax-m3', authority: 'PROFILE' });

    expect(
      resolveOrchestratorResolution({
        activeProfile: 'none',
        hostOrchestratorModel: undefined,
        ...base,
      }),
    ).toEqual({ model: 'preset/orchestrator', authority: 'PRESET' });

    expect(
      resolveOrchestratorResolution({
        activeProfile: 'none',
        hostOrchestratorModel: undefined,
        presetOrchestratorModel: undefined,
        factoryOrchestratorModel: 'factory/orchestrator',
      }),
    ).toEqual({ model: 'factory/orchestrator', authority: 'AGENT_FACTORY' });
  });
});
