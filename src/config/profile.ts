import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type SlimProfileName = 'opencode-go' | 'antigravity' | 'none';

export interface ProfileStore {
  profile: SlimProfileName;
}

function getProfilePath(): string {
  if (process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR) {
    return path.join(
      process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR,
      'slim-profile.json',
    );
  }
  const home = os.homedir();
  return path.join(home, '.config', 'opencode', 'slim-profile.json');
}

export function readProfile(): SlimProfileName {
  if (
    process.env.NODE_ENV === 'test' &&
    !process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED
  ) {
    return 'none';
  }

  try {
    const filePath = getProfilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as ProfileStore;
      if (data.profile === 'opencode-go' || data.profile === 'antigravity') {
        return data.profile;
      }
    }
  } catch (e) {
    // ignore
  }
  return 'opencode-go';
}

export function writeProfile(profile: SlimProfileName): boolean {
  try {
    const filePath = getProfilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify({ profile }, null, 2));
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (e) {
    console.error('[oh-my-opencode-slim] Failed to write profile', e);
    return false;
  }
}

export const PROFILE_MAPPINGS: Record<
  SlimProfileName,
  Record<string, { model: string; variant?: string }> | undefined
> = {
  'opencode-go': {
    orchestrator: { model: 'opencode-go/minimax-m3', variant: 'thinking' },
    oracle: { model: 'opencode-go/qwen3.7-max', variant: 'max' },
    explorer: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    librarian: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    designer: { model: 'opencode-go/kimi-k2.7-code' },
    fixer: { model: 'opencode-go/deepseek-v4-flash', variant: 'high' },
    observer: { model: 'opencode-go/mimo-v2.5' },
    council: { model: 'opencode-go/gpt-5.6-luna' },
    'councillor-alpha': { model: 'opencode-go/grok-4.6' },
    'councillor-beta': { model: 'opencode-go/deepseek-v4-pro' },
    'councillor-gamma': { model: 'opencode-go/qwen3.8-max' },
  },
  antigravity: {
    orchestrator: { model: 'google/antigravity-gemini-3.1-pro' },
    oracle: { model: 'google/antigravity-claude-opus-4-6-thinking' },
    fixer: { model: 'google/antigravity-gemini-3.7-flash' },
    explorer: { model: 'google/antigravity-gemini-3.7-flash' },
    librarian: { model: 'google/antigravity-gemini-3.7-flash' },
    council: { model: 'google/antigravity-claude-sonnet-4-6-thinking' },
    'councillor-alpha': {
      model: 'google/antigravity-claude-opus-4-6-thinking',
    },
    'councillor-beta': { model: 'google/antigravity-gemini-3.1-pro' },
    'councillor-gamma': { model: 'google/antigravity-gpt-oss-120b-medium' },
  },
  none: undefined,
};
