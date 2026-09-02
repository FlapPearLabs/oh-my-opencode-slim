import { parseConfig, writeConfig } from '../../cli/config-io';
import { getExistingConfigPath } from '../../cli/paths';
import {
  PROFILE_MAPPINGS,
  readProfile,
  writeProfile,
} from '../../config/profile';
import { registerCommandHook } from '../command-hook-utils';

function clearHostModelOverrides(managedAgentNames: string[]) {
  const configPath = getExistingConfigPath();
  const { config, error } = parseConfig(configPath);
  if (error || !config || !config.agent) return;

  const agentConfig = config.agent as Record<string, Record<string, unknown>>;
  let changed = false;

  for (const name of managedAgentNames) {
    const entry = agentConfig[name];
    if (entry && entry.model !== undefined) {
      delete entry.model;
      changed = true;
    }
  }

  if (changed) {
    writeConfig(configPath, config);
  }
}

export function createProfileCommandsHook(managedAgentNames: string[]): {
  registerCommand: (config: Record<string, unknown>) => void;
  handleCommandExecuteBefore: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Array<{ type: string; text?: string }> },
  ) => Promise<void>;
} {
  // Capture active profile ONCE at plugin load so we know the exact profile the process is running.
  const activeProfile = readProfile();

  return {
    registerCommand: (opencodeConfig) => {
      registerCommandHook(
        opencodeConfig,
        'slim-go',
        'Stage OpenCode Go profile',
        'Stage the OpenCode Go profile (requires restart)',
      );
      registerCommandHook(
        opencodeConfig,
        'slim-ag',
        'Stage Antigravity profile',
        'Stage the Antigravity profile (requires restart)',
      );
      registerCommandHook(
        opencodeConfig,
        'slim-profile',
        'Show Slim Profile status',
        'Display active and staged profile routing',
      );
    },

    handleCommandExecuteBefore: async (input, output) => {
      if (input.command === 'slim-go') {
        writeProfile('opencode-go');
        clearHostModelOverrides(managedAgentNames);
        output.parts.length = 0;
        output.parts.push({
          type: 'text',
          text: `Slim profile staged: opencode-go\n\nCurrent OpenCode process is unchanged.\nRestart OpenCode to activate.`,
        });
      } else if (input.command === 'slim-ag') {
        writeProfile('antigravity');
        clearHostModelOverrides(managedAgentNames);
        output.parts.length = 0;
        output.parts.push({
          type: 'text',
          text: `Slim profile staged: antigravity\n\nCurrent OpenCode process is unchanged.\nRestart OpenCode to activate.`,
        });
      } else if (input.command === 'slim-profile') {
        const nextProfile = readProfile();
        const restartRequired = activeProfile !== nextProfile;

        let msg = `Slim Profile\n\n`;
        msg += `Active:\n  ${activeProfile}\n\n`;
        msg += `Next launch:\n  ${nextProfile}\n\n`;
        msg += `Restart required:\n  ${restartRequired ? 'yes' : 'no'}\n\n`;

        msg += `Active routing:\n`;
        const activeMapping = PROFILE_MAPPINGS[activeProfile];
        if (activeMapping) {
          if (activeMapping.orchestrator)
            msg += `  orchestrator → ${activeMapping.orchestrator.model}\n`;
          if (activeMapping.oracle)
            msg += `  oracle       → ${activeMapping.oracle.model}\n`;
          if (activeMapping.fixer)
            msg += `  fixer        → ${activeMapping.fixer.model}\n`;
          if (activeMapping.explorer)
            msg += `  explorer     → ${activeMapping.explorer.model}\n`;
          if (activeMapping.librarian)
            msg += `  librarian    → ${activeMapping.librarian.model}\n`;
        }

        msg += `\nNext routing:\n`;
        const nextMapping = PROFILE_MAPPINGS[nextProfile];
        if (nextMapping) {
          if (nextMapping.orchestrator)
            msg += `  orchestrator → ${nextMapping.orchestrator.model}\n`;
          if (nextMapping.oracle)
            msg += `  oracle       → ${nextMapping.oracle.model}\n`;
          if (nextMapping.fixer)
            msg += `  fixer        → ${nextMapping.fixer.model}\n`;
          if (nextMapping.explorer)
            msg += `  explorer     → ${nextMapping.explorer.model}\n`;
          if (nextMapping.librarian)
            msg += `  librarian    → ${nextMapping.librarian.model}\n`;
        }

        output.parts.length = 0;
        output.parts.push({ type: 'text', text: msg });
      }
    },
  };
}
