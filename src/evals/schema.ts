import { z } from 'zod';

/**
 * Eval assertion — a single check against agent output.
 *
 * Types:
 * - `contains`: output must contain a string (case-insensitive)
 * - `not_contains`: output must NOT contain a string
 * - `regex`: output must match a regex pattern
 * - `tool_used`: agent must have called a specific tool
 * - `tool_not_used`: agent must NOT have called a specific tool
 * - `files_modified`: agent must have modified specific files
 * - `structure`: output must match a structural pattern (e.g., has <summary> tag)
 * - `references_read`: output indicates the agent read a references/ file.
 *   Provide `referenceContent` (content unique to the reference file, not the
 *   SKILL.md pointer) to require actual reference-file content in the output.
 */
export const AssertionSchema = z.object({
  type: z.enum([
    'contains',
    'not_contains',
    'regex',
    'tool_used',
    'tool_not_used',
    'files_modified',
    'structure',
    'references_read',
  ]),
  value: z.string(),
  description: z.string(),
  referenceContent: z.union([z.string(), z.array(z.string())]).optional(),
});
export type Assertion = z.infer<typeof AssertionSchema>;
export const EvalCaseSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  agent: z.string().default('orchestrator'),
  description: z.string().optional(),
  assertions: z.array(AssertionSchema).default([]),
  tags: z.array(z.string()).default([]),
});

export type EvalCase = z.infer<typeof EvalCaseSchema>;

/**
 * Eval suite — a collection of eval cases for a skill or behavior.
 */
export const EvalSuiteSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  evals: z.array(EvalCaseSchema),
});

export type EvalSuite = z.infer<typeof EvalSuiteSchema>;

/**
 * Result of running a single eval case.
 */
export interface EvalResult {
  evalId: string;
  prompt: string;
  passed: boolean;
  /** Number of output samples evaluated */
  runs: number;
  /** Fraction of runs where all assertions passed (0-1) */
  passRate: number;
  assertions: Array<{
    assertion: Assertion;
    passed: boolean;
    passRate?: number;
    evidence?: string;
  }>;
  output?: string;
  durationMs?: number;
  error?: string;
}

/**
 * Summary of running an entire eval suite.
 */
export interface EvalSuiteResult {
  suiteName: string;
  totalEvals: number;
  passed: number;
  failed: number;
  skipped: number;
  results: EvalResult[];
  durationMs: number;
  timestamp: string;
}
