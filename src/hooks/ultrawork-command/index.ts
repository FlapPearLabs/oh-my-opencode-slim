import { createInternalAgentTextPart } from '../../utils';
import { registerCommandHook } from '../command-hook-utils';

const COMMAND_NAME = 'ultrawork';
const ALIAS_NAME = 'ulw';

function activationPrompt(ticket: string): string {
  return [
    'Use the ultrawork skill for this task. Treat it as a fully autonomous unattended Ticket execution.',
    '',
    'UltraWork requirements:',
    '- before planning or delegation, check for an existing `.slim/deepwork/` progress file for this Ticket; if one exists, read it first and resume from the last recorded state rather than restarting;',
    '- before planning, delegation, or creating state, inspect existing `.gitignore` and `.ignore`; add only missing entries without duplicates: `.gitignore` must contain `.slim/deepwork/`, and `.ignore` must contain `!.slim/deepwork/` and `!.slim/deepwork/**`;',
    '- create and continuously update a `.slim/deepwork/<ticket-slug>.md` progress file as the authoritative resume artifact;',
    '- run verification-planning before implementation to establish the evidence path;',
    '- plan using the background scheduler model: dependency graph, specialist ownership, independent parallel lanes;',
    '- execute phase by phase using background specialists with hook-driven completion;',
    '- when a background job appears stopped or unreconciled, check the Background Job Board, inspect partial state (git/files), then revive or reroute — never re-dispatch work before consuming existing results;',
    '- after each implementation phase, validate, update deepwork state, then run a proportionate Oracle gate;',
    '- apply the UltraWork completion gate before reporting DONE: all applicable IMPLEMENTATION, VALIDATION, FAILURE_CLASSIFICATION, REVIEW, GIT_BOUNDARY, and TICKET_AUTHORITY checks must pass;',
    '- classify every failing test/check as CAUSED_BY_THIS_CHANGE, PRE_EXISTING, ENVIRONMENT_DEPENDENT, or UNKNOWN; only CAUSED_BY_THIS_CHANGE and UNKNOWN blocks DONE;',
    '- do NOT stop because one implementation pass completed, a fixer returned success, or targeted tests passed while broader validation remains;',
    '- continue autonomously unless DONE, BLOCKED_BY_USER, BLOCKED_BY_EXTERNAL_AUTHORITY, or UNSAFE_TO_CONTINUE;',
    '- preserve all pre-existing user working-tree changes; do not stage, stash, or modify unrelated files;',
    '',
    'Ticket:',
    ticket,
  ].join('\n');
}

function helpPrompt(): string {
  return [
    'Usage: `/ultrawork <ticket>` (alias: `/ulw <ticket>`)',
    '',
    'Describe the full Ticket to execute autonomously. UltraWork runs until all',
    'completion gates pass without requiring user supervision.',
    '',
    'Composes: deepwork · verification-planning · background orchestration ·',
    'orchestrator wake · Oracle gates · worktrees when needed.',
    '',
    'UltraWork is an execution policy — it does NOT change the model profile.',
    'Use /slim-go or /slim-ag to select a profile before starting.',
    '',
    'Examples:',
    '  `/ultrawork implement rate limiting for the API with tests`',
    '  `/ulw refactor auth module to use OAuth2, all tests must pass`',
    '  `/ultrawork add CSV export feature with full E2E coverage`',
  ].join('\n');
}

export function createUltraworkCommandHook(): {
  registerCommand: (config: Record<string, unknown>) => void;
  handleCommandExecuteBefore: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Array<{ type: string; text?: string }> },
  ) => Promise<void>;
} {
  return {
    registerCommand: (opencodeConfig) => {
      registerCommandHook(
        opencodeConfig,
        COMMAND_NAME,
        'Start an autonomous UltraWork unattended Ticket execution',
        'Fully autonomous Ticket execution with completion gate and recovery',
      );
      registerCommandHook(
        opencodeConfig,
        ALIAS_NAME,
        'Alias for /ultrawork',
        'Alias for /ultrawork — autonomous Ticket execution',
      );
    },

    handleCommandExecuteBefore: async (input, output) => {
      if (input.command !== COMMAND_NAME && input.command !== ALIAS_NAME) return;

      output.parts.length = 0;
      const ticket = input.arguments.trim();
      if (!ticket) {
        output.parts.push(createInternalAgentTextPart(helpPrompt()));
        return;
      }

      output.parts.push({ type: 'text', text: activationPrompt(ticket) });
    },
  };
}
