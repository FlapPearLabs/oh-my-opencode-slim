import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginInput } from '@opencode-ai/plugin';
import { getSkillPermissionsForAgent } from '../../cli/skills';
import type { PluginConfig } from '../../config';
import {
  PROFILE_MAPPINGS,
  readProfile,
  writeProfile,
} from '../../config/profile';
import { RuntimeConfig } from '../../config/runtime';
import {
  createFilterAvailableSkillsHook,
  filterAvailableSkillsText,
} from './index';

const mockCtx = {} as PluginInput;
const TEST_DIRECTORY = 'runtime-test-filter-skills';

function runtimeFor(config: PluginConfig | undefined = {}) {
  RuntimeConfig.reset(TEST_DIRECTORY);
  RuntimeConfig.init(TEST_DIRECTORY, config ?? {});
  return RuntimeConfig.get(TEST_DIRECTORY);
}

function skillBlock(name: string): string {
  return `<skill>
  <name>${name}</name>
  <description>${name} description</description>
  <location>file:///tmp/${name}</location>
</skill>`;
}

function availableSkillsBlock(...names: string[]): string {
  return `<available_skills>
${names.map((name) => skillBlock(name)).join('\n')}
</available_skills>`;
}

describe('filterAvailableSkillsText', () => {
  test('keeps only allowed skills using exact skill names', () => {
    const text = availableSkillsBlock('skill1', 'skill2', 'skill3');
    const result = filterAvailableSkillsText(text, {
      '*': 'deny',
      skill1: 'allow',
      skill3: 'allow',
    });

    expect(result).toContain('<name>skill1</name>');
    expect(result).not.toContain('<name>skill2</name>');
    expect(result).toContain('<name>skill3</name>');
  });

  test('renders No skills available when nothing is allowed', () => {
    const result = filterAvailableSkillsText(availableSkillsBlock('skill1'), {
      '*': 'deny',
    });

    expect(result).toContain('No skills available.');
    expect(result).not.toContain('<name>skill1</name>');
  });
});

describe('createFilterAvailableSkillsHook', () => {
  test('ignores messages without OpenCode info or parts', async () => {
    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor());
    const output = {
      messages: [
        {},
        { info: { role: 'assistant' } },
        {
          info: { role: 'system' },
          parts: [{ type: 'text', text: availableSkillsBlock('skill1') }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output as never);

    expect(output.messages[2].parts[0].text).toContain('<name>skill1</name>');
  });

  test('filters system prompt skill blocks for explicit agent skills', async () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          skills: ['skill1', 'skill3'],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor(config));
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: availableSkillsBlock('skill1', 'skill2', 'skill3'),
            },
          ],
        },
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('<name>skill1</name>');
    expect(resultText).not.toContain('<name>skill2</name>');
    expect(resultText).toContain('<name>skill3</name>');
  });

  test('shows no skills for agents configured with an empty skills list', async () => {
    const config: PluginConfig = {
      agents: {
        fixer: {
          skills: [],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor(config));
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [{ type: 'text', text: availableSkillsBlock('skill1') }],
        },
        {
          info: { role: 'user', agent: 'fixer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('No skills available.');
    expect(resultText).not.toContain('<name>skill1</name>');
  });

  test('preserves orchestrator default wildcard allow', async () => {
    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor());
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            { type: 'text', text: availableSkillsBlock('skill1', 'skill2') },
          ],
        },
        {
          info: { role: 'user', agent: 'orchestrator' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('<name>skill1</name>');
    expect(resultText).toContain('<name>skill2</name>');
  });

  test('supports wildcard allow with explicit exclusions', async () => {
    const config: PluginConfig = {
      agents: {
        designer: {
          skills: ['*', '!skill2'],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor(config));
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            { type: 'text', text: availableSkillsBlock('skill1', 'skill2') },
          ],
        },
        {
          info: { role: 'user', agent: 'designer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    const resultText = output.messages[0].parts[0].text;
    expect(resultText).toContain('<name>skill1</name>');
    expect(resultText).not.toContain('<name>skill2</name>');
  });

  test('defaults to orchestrator when no agent is present', async () => {
    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor());
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [{ type: 'text', text: availableSkillsBlock('skill1') }],
        },
        {
          info: { role: 'user' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    expect(output.messages[0].parts[0].text).toContain('<name>skill1</name>');
  });

  test('filters multiple skill blocks across messages', async () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          skills: ['skill1'],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor(config));
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: `Intro\n${availableSkillsBlock('skill1', 'skill2')}`,
            },
          ],
        },
        {
          info: { role: 'developer' },
          parts: [
            { type: 'text', text: availableSkillsBlock('skill2', 'skill3') },
          ],
        },
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    expect(output.messages[0].parts[0].text).toContain('<name>skill1</name>');
    expect(output.messages[0].parts[0].text).not.toContain(
      '<name>skill2</name>',
    );
    expect(output.messages[1].parts[0].text).toContain('No skills available.');
  });

  test('reuses permission rules without caching the final skills block text', async () => {
    const config: PluginConfig = {
      agents: {
        explorer: {
          skills: ['skill1', 'skill3'],
        },
      },
    };

    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor(config));
    const firstOutput = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: availableSkillsBlock('skill1', 'skill2'),
            },
          ],
        },
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };
    const secondOutput = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: availableSkillsBlock('skill2', 'skill3'),
            },
          ],
        },
        {
          info: { role: 'user', agent: 'explorer' },
          parts: [{ type: 'text', text: 'check skills' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, firstOutput);
    await hook['experimental.chat.messages.transform']({}, secondOutput);

    expect(firstOutput.messages[0].parts[0].text).toContain(
      '<name>skill1</name>',
    );
    expect(firstOutput.messages[0].parts[0].text).not.toContain(
      '<name>skill3</name>',
    );
    expect(secondOutput.messages[0].parts[0].text).toContain(
      '<name>skill3</name>',
    );
  });

  test('orchestrator retains ultrawork skill in available_skills block by default', async () => {
    const hook = createFilterAvailableSkillsHook(mockCtx, runtimeFor());
    const output = {
      messages: [
        {
          info: { role: 'system' },
          parts: [
            {
              type: 'text',
              text: availableSkillsBlock(
                'deepwork',
                'ultrawork',
                'custom-skill',
              ),
            },
          ],
        },
        {
          info: { role: 'user', agent: 'orchestrator' },
          parts: [{ type: 'text', text: 'execute ultrawork' }],
        },
      ],
    };

    await hook['experimental.chat.messages.transform']({}, output);

    expect(output.messages[0].parts[0].text).toContain('<name>deepwork</name>');
    expect(output.messages[0].parts[0].text).toContain(
      '<name>ultrawork</name>',
    );
  });

  test('profile switching does not alter shared skill availability when explicit config is used', async () => {
    const tmpHome = path.join(
      os.tmpdir(),
      `opencode-slim-profile-ortho-${Date.now()}`,
    );
    const profileDir = path.join(tmpHome, '.config', 'opencode');
    const originalDirEnv = process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR;
    const originalEnabledEnv =
      process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED;

    try {
      process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR = profileDir;
      process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED = '1';
      fs.mkdirSync(profileDir, { recursive: true });

      const sharedConfig: PluginConfig = {
        preset: 'test-preset',
        presets: {
          'test-preset': {
            orchestrator: {
              skills: ['skill1'],
            },
          },
        },
      };

      // State A: opencode-go
      writeProfile('opencode-go');
      expect(readProfile()).toBe('opencode-go');
      const goModel = PROFILE_MAPPINGS['opencode-go']?.orchestrator.model;

      const runtimeGo = runtimeFor(sharedConfig);
      const hookGo = createFilterAvailableSkillsHook(mockCtx, runtimeGo);
      const outputGo = {
        messages: [
          {
            info: { role: 'system' },
            parts: [
              {
                type: 'text',
                text: availableSkillsBlock('skill1', 'skill2', 'ultrawork'),
              },
            ],
          },
          {
            info: { role: 'user', agent: 'orchestrator' },
            parts: [{ type: 'text', text: 'check skills' }],
          },
        ],
      };
      await hookGo['experimental.chat.messages.transform']({}, outputGo);
      const resultGo = outputGo.messages[0].parts[0].text;

      // State B: antigravity
      writeProfile('antigravity');
      expect(readProfile()).toBe('antigravity');
      const agModel = PROFILE_MAPPINGS.antigravity?.orchestrator.model;

      // Prove model routing is genuinely different between profiles
      expect(goModel).toBeDefined();
      expect(agModel).toBeDefined();
      expect(goModel).not.toEqual(agModel);

      // Model profile change leaves shared skill filtering identical
      const runtimeAnti = runtimeFor(sharedConfig);
      const hookAnti = createFilterAvailableSkillsHook(mockCtx, runtimeAnti);
      const outputAnti = {
        messages: [
          {
            info: { role: 'system' },
            parts: [
              {
                type: 'text',
                text: availableSkillsBlock('skill1', 'skill2', 'ultrawork'),
              },
            ],
          },
          {
            info: { role: 'user', agent: 'orchestrator' },
            parts: [{ type: 'text', text: 'check skills' }],
          },
        ],
      };
      await hookAnti['experimental.chat.messages.transform']({}, outputAnti);
      const resultAnti = outputAnti.messages[0].parts[0].text;

      expect(resultGo).toContain('<name>skill1</name>');
      expect(resultGo).not.toContain('<name>skill2</name>');
      expect(resultGo).not.toContain('<name>ultrawork</name>');
      expect(resultGo).toEqual(resultAnti);

      // Prove at permission contract boundary that skill rules are identical
      const sharedSkills =
        sharedConfig.presets?.['test-preset']?.orchestrator.skills;
      const permsGo = getSkillPermissionsForAgent('orchestrator', sharedSkills);
      const permsAnti = getSkillPermissionsForAgent(
        'orchestrator',
        sharedSkills,
      );
      expect(permsGo).toEqual(permsAnti);
    } finally {
      if (originalDirEnv === undefined) {
        delete process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR;
      } else {
        process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_DIR = originalDirEnv;
      }
      if (originalEnabledEnv === undefined) {
        delete process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED;
      } else {
        process.env.OH_MY_OPENCODE_SLIM_TEST_PROFILE_ENABLED =
          originalEnabledEnv;
      }
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
