import { type ToolDefinition, tool } from '@opencode-ai/plugin';
import { createWorkIntentEnvelope } from '../utils/work-intent';

const z = tool.schema;

interface WorkIntentToolOptions {
  shouldManageSession: (sessionID: string) => boolean;
  resolveAgentName?: (agent: string) => string;
  registerSessionAsOrchestrator?: (sessionID: string) => void;
}

export function createWorkIntentTool(
  options: WorkIntentToolOptions,
): Record<'slim_work_intent', ToolDefinition> {
  const slim_work_intent = tool({
    description: `Record the current session's bounded engineering objective and state in OpenCode session history.

This tool records a result already determined by the owning workflow. It does not schedule or dispatch work and must not infer complete or blocked from idle time, prompt failure, or unfinished work. Use waiting_for_user only for a genuine external-user dependency.`,
    args: {
      objective: z.string().min(1).max(2_000),
      success_criteria: z.string().min(1).max(2_000),
      state: z.enum(['active', 'waiting_for_user', 'complete', 'blocked']),
      phase_ref: z.string().max(1_000).optional(),
      evidence_refs: z.array(z.string().max(256)).max(8).optional(),
    },
    async execute(args, toolContext) {
      const sessionID = toolContext?.sessionID;
      if (!sessionID) throw new Error('slim_work_intent requires sessionID');
      const rawAgent = toolContext?.agent;
      const agent =
        typeof rawAgent === 'string'
          ? (options.resolveAgentName?.(rawAgent) ?? rawAgent)
          : undefined;
      if (agent && agent !== 'orchestrator') {
        throw new Error('slim_work_intent can only be used by orchestrator');
      }
      if (!options.shouldManageSession(sessionID) && agent === 'orchestrator') {
        options.registerSessionAsOrchestrator?.(sessionID);
      }
      if (!options.shouldManageSession(sessionID)) {
        throw new Error(
          'slim_work_intent can only be used in orchestrator sessions',
        );
      }

      return createWorkIntentEnvelope(sessionID, {
        objective: args.objective,
        successCriteria: args.success_criteria,
        state: args.state,
        ...(args.phase_ref !== undefined ? { phaseRef: args.phase_ref } : {}),
        ...(args.evidence_refs !== undefined
          ? { evidenceRefs: args.evidence_refs }
          : {}),
      });
    },
  });

  return { slim_work_intent };
}
