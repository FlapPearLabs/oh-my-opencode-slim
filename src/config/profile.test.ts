import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  PROFILE_MAPPINGS,
  readProfile,
  SlimProfileName,
  writeProfile,
} from './profile';

describe('Profile System', () => {
  const tmpHome = path.join(
    os.tmpdir(),
    'opencode-slim-profile-test-' + Date.now(),
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

  test('A. Default - returns opencode-go when no file exists', () => {
    expect(fs.existsSync(profilePath)).toBe(false);
    expect(readProfile()).toBe('opencode-go');
  });

  test('B. Explicit Go - reads opencode-go correctly', () => {
    fs.writeFileSync(profilePath, JSON.stringify({ profile: 'opencode-go' }));
    expect(readProfile()).toBe('opencode-go');
  });

  test('C. Antigravity - reads antigravity correctly', () => {
    fs.writeFileSync(profilePath, JSON.stringify({ profile: 'antigravity' }));
    expect(readProfile()).toBe('antigravity');
  });

  test('G. Invalid profile - falls back to opencode-go', () => {
    fs.writeFileSync(profilePath, JSON.stringify({ profile: 'gemini' }));
    expect(readProfile()).toBe('opencode-go');

    fs.writeFileSync(profilePath, 'invalid json');
    expect(readProfile()).toBe('opencode-go');
  });

  test('H. Persistence - writes and reads profile correctly', () => {
    expect(writeProfile('antigravity')).toBe(true);
    expect(fs.existsSync(profilePath)).toBe(true);
    expect(readProfile()).toBe('antigravity');

    expect(writeProfile('opencode-go')).toBe(true);
    expect(readProfile()).toBe('opencode-go');
  });

  test('PROFILE_MAPPINGS - contains both profiles with correct models', () => {
    const goMapping = PROFILE_MAPPINGS['opencode-go'];
    expect(goMapping).toBeDefined();
    expect(goMapping!.orchestrator.model).toBe('opencode-go/minimax-m3');
    expect(goMapping!.oracle.model).toBe('opencode-go/qwen3.7-max');
    expect(goMapping!.fixer.model).toBe('opencode-go/deepseek-v4-flash');

    const agMapping = PROFILE_MAPPINGS['antigravity'];
    expect(agMapping).toBeDefined();
    expect(agMapping!.orchestrator.model).toBe(
      'google/antigravity-gemini-3.1-pro',
    );
    expect(agMapping!.oracle.model).toBe(
      'google/antigravity-claude-opus-4-6-thinking',
    );
    expect(agMapping!.fixer.model).toBe('google/antigravity-gemini-3.7-flash');
  });
});
