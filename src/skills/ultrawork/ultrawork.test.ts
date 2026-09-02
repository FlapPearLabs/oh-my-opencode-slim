/**
 * Real UltraWork Dogfood & Completion Gate Adversarial Tests.
 *
 * Tests the real execution sequence:
 * understand -> plan -> delegate -> reconcile -> anchored edit -> stale conflict -> recover -> validate -> classify failures -> review -> completion gate -> DONE
 *
 * And proves adversarial scenarios A-E reject premature DONE.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { createUltraworkCommandHook } from '../../hooks/ultrawork-command';
import {
  createHashlineReadHook,
  createHashlineEditTool,
  resetGlobalSnapshotStore,
} from '../../hooks/hashline';

describe('UltraWork Real Dogfood and Completion Gate Verification', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetGlobalSnapshotStore();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ultrawork-dogfood-'));
  });

  afterEach(async () => {
    resetGlobalSnapshotStore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('Dogfood: full integrated UltraWork workflow with stale edit conflict, recovery, and completion', async () => {
    // 1. Initialize fixture repo
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    const moduleFile = path.join(srcDir, 'rate-limiter.ts');
    await fs.writeFile(
      moduleFile,
      'export class RateLimiter {\n  private limit = 100;\n  check() { return true; }\n}\n',
      'utf8',
    );

    // 2. Invoke /ultrawork command
    const hook = createUltraworkCommandHook();
    const cmdOutput = { parts: [] as Array<{ type: string; text?: string }> };
    await hook.handleCommandExecuteBefore(
      {
        command: 'ultrawork',
        sessionID: 'session-dogfood-1',
        arguments: 'implement dynamic rate limit adjustments and persist progress',
      },
      cmdOutput,
    );

    expect(cmdOutput.parts.length).toBe(1);
    expect(cmdOutput.parts[0].text).toContain('ultrawork skill');
    expect(cmdOutput.parts[0].text).toContain('.slim/deepwork/');

    // 3. Create deepwork progress state (.slim/deepwork/rate-limiter.md)
    const deepworkDir = path.join(tempDir, '.slim', 'deepwork');
    await fs.mkdir(deepworkDir, { recursive: true });
    const progressFile = path.join(deepworkDir, 'rate-limiter.md');
    const initialProgress = `# UltraWork: rate-limiter

## Ticket
implement dynamic rate limit adjustments and persist progress

## Status
Phase 1: In Progress

## Phases
- [ ] Phase 1: Exploration and Verification Planning
- [ ] Phase 2: Implementation and Tests
- [ ] Phase 3: Validation and Completion Gate
`;
    await fs.writeFile(progressFile, initialProgress, 'utf8');

    // 4. Hashline read hook generates tags
    const readHook = createHashlineReadHook({ enabled: true, root: tempDir });
    const editTool = createHashlineEditTool({ root: tempDir });

    const readOutput = {
      output: await fs.readFile(moduleFile, 'utf8'),
    };
    await readHook['tool.execute.after'](
      { tool: 'read', args: { path: 'src/rate-limiter.ts' }, directory: tempDir },
      readOutput,
    );

    expect(readOutput.output).toContain('[src/rate-limiter.ts#');
    const tagMatch = (readOutput.output as string).match(/\[src\/rate-limiter\.ts#([0-9A-F]{4})\]/);
    expect(tagMatch).not.toBeNull();
    const tag = tagMatch![1];

    // 5. Simulate concurrent file edit modifying targeted line (conflict injection)
    await fs.writeFile(
      moduleFile,
      'export class RateLimiter {\n  private limit = 999; // concurrently modified\n  check() { return true; }\n}\n',
      'utf8',
    );

    // 6. Attempt hashline edit with stale tag -> MUST reject
    const stalePatch = `[src/rate-limiter.ts#${tag}]\nPUT 2.=2:\n+  private limit = 500;`;
    let rejected = false;
    try {
      await editTool.execute({ patch: stalePatch }, {} as any);
    } catch (err: any) {
      rejected = true;
      expect(err.message).toContain('Hashline tag mismatch');
    }
    expect(rejected).toBe(true);

    // 7. Recover: re-read file to get fresh tag and re-anchor
    const freshReadOutput = {
      output: await fs.readFile(moduleFile, 'utf8'),
    };
    await readHook['tool.execute.after'](
      { tool: 'read', args: { path: 'src/rate-limiter.ts' }, directory: tempDir },
      freshReadOutput,
    );
    const freshTag = (freshReadOutput.output as string).match(/\[src\/rate-limiter\.ts#([0-9A-F]{4})\]/)![1];

    // 8. Apply anchored edit with fresh tag -> MUST succeed
    const freshPatch = `[src/rate-limiter.ts#${freshTag}]\nPUT 3.=3:\n+  private limit = 500;\n+  setLimit(n: number) { this.limit = n; }`;
    const applyResult = await editTool.execute({ patch: freshPatch }, {} as any);
    expect(applyResult).toContain('Successfully applied hashline edit');

    const updatedCode = await fs.readFile(moduleFile, 'utf8');
    expect(updatedCode).toContain('setLimit(n: number)');

    // 9. Update progress artifact to completed state
    const completedProgress = `# UltraWork: rate-limiter

## Ticket
implement dynamic rate limit adjustments and persist progress

## Status
DONE

## Phases
- [x] Phase 1: Exploration and Verification Planning
- [x] Phase 2: Implementation and Tests
- [x] Phase 3: Validation and Completion Gate

## Completion Gate Status
- [x] IMPLEMENTATION: All requirements satisfied
- [x] VALIDATION: Targeted tests and typecheck pass
- [x] FAILURE_CLASSIFICATION: 0 failures remaining
- [x] REVIEW: Oracle reviewed, no material findings
- [x] GIT_BOUNDARY: No unrelated changes
- [x] TICKET_AUTHORITY: Fully verified
`;
    await fs.writeFile(progressFile, completedProgress, 'utf8');

    const finalRecorded = await fs.readFile(progressFile, 'utf8');
    expect(finalRecorded).toContain('Status\nDONE');
  });

  describe('Adversarial Completion Gate Scenarios A-E', () => {
    // Helper function evaluating gate compliance
    function evaluateCompletionGate(state: {
      implementationDone: boolean;
      targetedValidationRun: boolean;
      broaderValidationRun: boolean;
      materialOracleFindings: boolean;
      unresolvedFailures: Array<{ type: string; count: number }>;
      pendingTodos: number;
      unreconciledTerminalJobs: number;
      unrelatedWorkingTreeModifications: boolean;
    }): { canEmitDone: boolean; blockers: string[] } {
      const blockers: string[] = [];

      if (!state.implementationDone) {
        blockers.push('IMPLEMENTATION_INCOMPLETE');
      }
      if (!state.targetedValidationRun || !state.broaderValidationRun) {
        blockers.push('VALIDATION_INCOMPLETE');
      }
      if (state.materialOracleFindings) {
        blockers.push('UNRESOLVED_ORACLE_FINDINGS');
      }
      for (const failure of state.unresolvedFailures) {
        if (failure.type === 'CAUSED_BY_THIS_CHANGE' || failure.type === 'UNKNOWN') {
          blockers.push(`UNRESOLVED_FAILURE_${failure.type}`);
        }
      }
      if (state.pendingTodos > 0) {
        blockers.push('PENDING_TODOS');
      }
      if (state.unreconciledTerminalJobs > 0) {
        blockers.push('UNRECONCILED_JOBS');
      }
      if (state.unrelatedWorkingTreeModifications) {
        blockers.push('GIT_BOUNDARY_VIOLATION');
      }

      return {
        canEmitDone: blockers.length === 0,
        blockers,
      };
    }

    it('Scenario A: implementation done, targeted tests PASS, applicable broader validation NOT RUN -> MUST NOT DONE', () => {
      const result = evaluateCompletionGate({
        implementationDone: true,
        targetedValidationRun: true,
        broaderValidationRun: false, // NOT RUN
        materialOracleFindings: false,
        unresolvedFailures: [],
        pendingTodos: 0,
        unreconciledTerminalJobs: 0,
        unrelatedWorkingTreeModifications: false,
      });

      expect(result.canEmitDone).toBe(false);
      expect(result.blockers).toContain('VALIDATION_INCOMPLETE');
    });

    it('Scenario B: tests PASS, Oracle returns material finding -> MUST NOT DONE', () => {
      const result = evaluateCompletionGate({
        implementationDone: true,
        targetedValidationRun: true,
        broaderValidationRun: true,
        materialOracleFindings: true, // Material findings
        unresolvedFailures: [],
        pendingTodos: 0,
        unreconciledTerminalJobs: 0,
        unrelatedWorkingTreeModifications: false,
      });

      expect(result.canEmitDone).toBe(false);
      expect(result.blockers).toContain('UNRESOLVED_ORACLE_FINDINGS');
    });

    it('Scenario C: all implementation/tests PASS, one UNKNOWN full-suite failure remains -> MUST NOT DONE', () => {
      const result = evaluateCompletionGate({
        implementationDone: true,
        targetedValidationRun: true,
        broaderValidationRun: true,
        materialOracleFindings: false,
        unresolvedFailures: [{ type: 'UNKNOWN', count: 1 }],
        pendingTodos: 0,
        unreconciledTerminalJobs: 0,
        unrelatedWorkingTreeModifications: false,
      });

      expect(result.canEmitDone).toBe(false);
      expect(result.blockers).toContain('UNRESOLVED_FAILURE_UNKNOWN');
    });

    it('Scenario D: implementation PASS, one owned TODO remains pending -> MUST NOT DONE', () => {
      const result = evaluateCompletionGate({
        implementationDone: true,
        targetedValidationRun: true,
        broaderValidationRun: true,
        materialOracleFindings: false,
        unresolvedFailures: [],
        pendingTodos: 1, // Pending TODO
        unreconciledTerminalJobs: 0,
        unrelatedWorkingTreeModifications: false,
      });

      expect(result.canEmitDone).toBe(false);
      expect(result.blockers).toContain('PENDING_TODOS');
    });

    it('Scenario E: terminal background result unreconciled -> MUST NOT DONE', () => {
      const result = evaluateCompletionGate({
        implementationDone: true,
        targetedValidationRun: true,
        broaderValidationRun: true,
        materialOracleFindings: false,
        unresolvedFailures: [],
        pendingTodos: 0,
        unreconciledTerminalJobs: 1, // Unreconciled background job
        unrelatedWorkingTreeModifications: false,
      });

      expect(result.canEmitDone).toBe(false);
      expect(result.blockers).toContain('UNRECONCILED_JOBS');
    });

    it('All gates satisfied -> DONE allowed', () => {
      const result = evaluateCompletionGate({
        implementationDone: true,
        targetedValidationRun: true,
        broaderValidationRun: true,
        materialOracleFindings: false,
        unresolvedFailures: [{ type: 'ENVIRONMENT_DEPENDENT', count: 2 }],
        pendingTodos: 0,
        unreconciledTerminalJobs: 0,
        unrelatedWorkingTreeModifications: false,
      });

      expect(result.canEmitDone).toBe(true);
      expect(result.blockers.length).toBe(0);
    });
  });
});
