import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readProfile, writeProfile } from '../../config/profile';
import { createProfileCommandsHook } from './index';

describe('Profile Commands Hook', () => {
  const tmpHome = path.join(
    os.tmpdir(),
    'opencode-slim-cmd-test-' + Date.now(),
  );
  const profileDir = path.join(tmpHome, '.config', 'opencode');
  const profilePath = path.join(profileDir, 'slim-profile.json');

  let originalDirEnv: string | undefined;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalDirEnv = process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR;
    process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR = profileDir;
    originalEnv = process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED;
    process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED = '1';

    fs.mkdirSync(profileDir, { recursive: true });
    writeProfile('opencode-go'); // Set active profile
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
    const hook = createProfileCommandsHook();

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

  test('F. Restart semantics - active=antigravity, next=antigravity', async () => {
    writeProfile('antigravity');
    // Captures 'antigravity' at initialization
    const hook = createProfileCommandsHook();

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
