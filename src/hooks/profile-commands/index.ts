import { parseConfig } from '../../cli/config-io';
import { getExistingConfigPath } from '../../cli/paths';
import {
  PROFILE_MAPPINGS,
  readProfile,
  type SlimProfileName,
  writeProfile,
} from '../../config/profile';
import { registerCommandHook } from '../command-hook-utils';

export type ResolutionAuthority =
  | 'HOST'
  | 'PROFILE'
  | 'PRESET'
  | 'AGENT_FACTORY';

export interface OrchestratorResolution {
  model: string | undefined;
  authority: ResolutionAuthority;
}

/**
 * Read-only runtime surface /slim-profile needs to report the six Spec §4.4
 * authority values. index.ts wires it to the existing in-memory RuntimeConfig
 * (captured host snapshot + plugin-layer preset). It intentionally exposes no
 * setter: the profile command must never mutate runtime/host state.
 */
export interface ProfileRuntimeSource {
  /** Active plugin-layer preset name (runtime override > config-file preset). */
  getPresetName(): string | undefined;
  /** Host opencode.json agent model snapshot (pre-mutation) for one agent. */
  getHostAgentModel(name: string): string | undefined;
  /** Orchestrator model contributed by the active preset, when present. */
  getPresetOrchestratorModel(): string | undefined;
  /** Orchestrator model from the agent factory before profile application. */
  getFactoryOrchestratorModel(): string | undefined;
}

/**
 * Resolve the orchestrator's model under the Spec §4.3 precedence chain:
 * user-owned explicit host override > selected Slim profile > preset > agent
 * factory/default. Pure query over in-memory layers; no persistence.
 */
export function resolveOrchestratorResolution(input: {
  activeProfile: SlimProfileName;
  hostOrchestratorModel: string | undefined;
  presetOrchestratorModel: string | undefined;
  factoryOrchestratorModel: string | undefined;
}): OrchestratorResolution {
  const {
    activeProfile,
    hostOrchestratorModel,
    presetOrchestratorModel,
    factoryOrchestratorModel,
  } = input;
  if (hostOrchestratorModel !== undefined) {
    return { model: hostOrchestratorModel, authority: 'HOST' };
  }
  const profileModel = PROFILE_MAPPINGS[activeProfile]?.orchestrator?.model;
  if (profileModel !== undefined) {
    return { model: profileModel, authority: 'PROFILE' };
  }
  if (presetOrchestratorModel !== undefined) {
    return { model: presetOrchestratorModel, authority: 'PRESET' };
  }
  return { model: factoryOrchestratorModel, authority: 'AGENT_FACTORY' };
}

/**
 * Preserve every managed host `agent.<name>.model` entry and return the names
 * that were retained. Under current authority there is no producer that makes
 * any on-disk model provably Slim-managed, so the provably-clearable set is
 * empty and this function never mutates the host config. Callers must report
 * the retained names so the user sees the conflict instead of silent deletion.
 */
function preservedHostOverrideAgents(managedAgentNames: string[]): string[] {
  const configPath = getExistingConfigPath();
  const { config, error } = parseConfig(configPath);
  if (error || !config || !config.agent) return [];

  const agentConfig = config.agent as Record<string, Record<string, unknown>>;
  const preserved: string[] = [];
  for (const name of managedAgentNames) {
    const entry = agentConfig[name];
    if (entry && entry.model !== undefined) {
      preserved.push(name);
    }
  }
  return preserved;
}

export function createProfileCommandsHook(
  managedAgentNames: string[],
  runtimeSource?: ProfileRuntimeSource,
): {
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
      if (input.command === 'slim-go' || input.command === 'slim-ag') {
        const stagedProfile: 'opencode-go' | 'antigravity' =
          input.command === 'slim-go' ? 'opencode-go' : 'antigravity';

        writeProfile(stagedProfile);
        const preserved = preservedHostOverrideAgents(managedAgentNames);

        output.parts.length = 0;
        let text = `Slim profile staged: ${stagedProfile}\n\nCurrent OpenCode process is unchanged.\nRestart OpenCode to activate.`;
        if (preserved.length > 0) {
          text += `\n\nHost model override preserved for: ${preserved.join(
            ', ',
          )}\n`;
          text += `Nothing on disk is provably Slim-managed, so no host model was cleared. These agents keep their host-selected model and will not be moved by the ${stagedProfile} profile.`;
        }
        output.parts.push({ type: 'text', text });
      } else if (input.command === 'slim-profile') {
        const nextProfile = readProfile();
        const restartRequired = activeProfile !== nextProfile;

        // Six separately-labeled Spec §4.4 authority values, resolved from
        // existing in-memory layers via the precedence chain in §4.3.
        const presetName = runtimeSource?.getPresetName();
        const hostOrchestratorModel =
          runtimeSource?.getHostAgentModel('orchestrator');
        const presetOrchestratorModel =
          runtimeSource?.getPresetOrchestratorModel();
        const factoryOrchestratorModel =
          runtimeSource?.getFactoryOrchestratorModel();
        const resolution = resolveOrchestratorResolution({
          activeProfile,
          hostOrchestratorModel,
          presetOrchestratorModel,
          factoryOrchestratorModel,
        });

        let msg = `Slim Profile\n\n`;
        msg += `MODEL_PROFILE_ACTIVE: ${activeProfile}\n`;
        msg += `MODEL_PROFILE_STAGED: ${nextProfile}\n`;
        msg += `PRESET: ${presetName ?? '(none)'}\n`;
        msg += `HOST_ORCHESTRATOR_OVERRIDE: ${
          hostOrchestratorModel ?? '(none)'
        }\n`;
        msg += `RESOLVED_ORCHESTRATOR_MODEL: ${resolution.model ?? '(none)'}\n`;
        msg += `RESOLUTION_AUTHORITY: ${resolution.authority}\n\n`;
        msg += `Restart required: ${restartRequired ? 'yes' : 'no'}\n`;

        output.parts.length = 0;
        output.parts.push({ type: 'text', text: msg });
      }
    },
  };
}
