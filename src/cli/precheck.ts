#!/usr/bin/env bun
/**
 * Precheck eval suites before running evals.
 *
 * Usage:
 *   bun run precheck
 *
 * Validates every eval suite in src/evals/:
 *   - eval cases have required fields (id, prompt, agent, assertions)
 *   - assertion types are valid
 *   - references_read assertions have value (reference file path)
 *   - prompts are non-empty strings
 *
 * Non-fatal warning: a case whose category expects neutral routing but whose
 * prompt names an @agent (capability suites must not leak the expected
 * routing). Warnings never affect the exit code.
 *
 * Exits 0 if all valid, 1 if any issues found.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EvalSuiteSchema } from '../evals/schema';

const EVALS_DIR = join(import.meta.dir, '..', 'evals');

interface Issue {
  suite: string;
  evalId?: string;
  message: string;
}

/** Categories whose prompts must not name the expected agent. */
const NEUTRAL_CATEGORIES = new Set([
  'natural-routing',
  'direct-execution',
  'skill-trigger',
  'response-quality',
  'execution',
]);
const AGENT_MENTION = /@([a-zA-Z-]+)/;

/**
 * Non-fatal warning when a neutral-routing eval names an @agent in its prompt.
 */
function circularityWarnings(
  name: string,
  suite: {
    evals: Array<{ id: string; category?: string; prompt: string }>;
  },
): Issue[] {
  const warnings: Issue[] = [];
  for (const evalCase of suite.evals) {
    if (!evalCase.category || !NEUTRAL_CATEGORIES.has(evalCase.category)) {
      continue;
    }
    const match = evalCase.prompt.match(AGENT_MENTION);
    if (match) {
      warnings.push({
        suite: name,
        evalId: evalCase.id,
        message: `prompt names @${match[1]} but category ${evalCase.category} expects neutral routing`,
      });
    }
  }
  return warnings;
}

function validateSuite(name: string, raw: string): Issue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return [
      {
        suite: name,
        message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
  }

  const result = EvalSuiteSchema.safeParse(parsed);
  if (!result.success) {
    return [
      {
        suite: name,
        message: `schema validation failed: ${result.error.message}`,
      },
    ];
  }

  const suite = result.data;
  const rawEvals = (parsed as { evals?: unknown[] }).evals ?? [];
  const issues: Issue[] = [];

  suite.evals.forEach((evalCase, i) => {
    const ctx = { suite: name, evalId: evalCase.id };
    const rawCase = rawEvals[i] as Record<string, unknown> | undefined;

    if (!evalCase.id || evalCase.id.trim() === '') {
      issues.push({ ...ctx, message: 'eval case id is empty' });
    }
    if (!evalCase.prompt || evalCase.prompt.trim() === '') {
      issues.push({ ...ctx, message: 'prompt is empty' });
    }
    if (
      !rawCase ||
      typeof rawCase.agent !== 'string' ||
      rawCase.agent.trim() === ''
    ) {
      issues.push({ ...ctx, message: 'agent is missing or empty' });
    }
    if (
      !Array.isArray(rawCase?.assertions) ||
      rawCase.assertions.length === 0
    ) {
      issues.push({ ...ctx, message: 'assertions is missing or empty' });
    }
    for (const assertion of evalCase.assertions) {
      if (assertion.type === 'references_read' && !assertion.value) {
        issues.push({
          ...ctx,
          message:
            'references_read assertion is missing value (reference file path)',
        });
      }
    }
  });

  return issues;
}

const entries = readdirSync(EVALS_DIR, { withFileTypes: true });
const suiteDirs = entries.filter(
  (e) => e.isDirectory() && e.name !== 'results' && e.name !== '__tests__',
);

let totalCases = 0;
const allIssues: Issue[] = [];
const allWarnings: Issue[] = [];

for (const dir of suiteDirs) {
  const suitePath = join(EVALS_DIR, dir.name, 'eval.json');
  let raw: string;
  try {
    raw = readFileSync(suitePath, 'utf-8');
  } catch {
    allIssues.push({ suite: dir.name, message: 'eval.json not found' });
    continue;
  }
  try {
    const parsed = JSON.parse(raw) as { evals?: unknown[] };
    totalCases += Array.isArray(parsed.evals) ? parsed.evals.length : 0;
    const result = EvalSuiteSchema.safeParse(parsed);
    if (result.success) {
      allWarnings.push(...circularityWarnings(dir.name, result.data));
    }
  } catch {
    // count skipped; validateSuite reports the JSON error below
  }
  allIssues.push(...validateSuite(dir.name, raw));
}

for (const warning of allWarnings) {
  const where = warning.evalId
    ? `${warning.suite}/${warning.evalId}`
    : warning.suite;
  console.log(`[warn] ${where}: ${warning.message}`);
}

if (allIssues.length === 0) {
  const suiteLabel = suiteDirs.length === 1 ? 'suite' : 'suites';
  console.log(
    `${totalCases} eval cases across ${suiteDirs.length} ${suiteLabel}. All valid.`,
  );
  process.exit(0);
}

for (const issue of allIssues) {
  const where = issue.evalId ? `${issue.suite}/${issue.evalId}` : issue.suite;
  console.error(`✗ ${where}: ${issue.message}`);
}
const issueLabel = allIssues.length === 1 ? 'issue' : 'issues';
console.error(`${allIssues.length} ${issueLabel} found.`);
process.exit(1);
