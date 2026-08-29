#!/usr/bin/env bun
/**
 * Diff the two most recent eval results for a suite, or compare against
 * a stored baseline.
 *
 * Usage:
 *   bun run eval:diff --suite <name>
 *   bun run eval:diff --suite <name> --baseline runs/baseline.json
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  diffResults,
  type EvalSuiteResult,
  loadAllResults,
  loadLatestResult,
} from '../evals/runner';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    suite: { type: 'string' },
    baseline: { type: 'string' },
  },
});

if (!values.suite) {
  console.error('Usage: bun run eval:diff --suite <name> [--baseline <file>]');
  process.exit(1);
}

let baseline: EvalSuiteResult | undefined;
if (values.baseline) {
  const raw = readFileSync(values.baseline, 'utf-8');
  baseline = JSON.parse(raw) as EvalSuiteResult;
}

const latest = loadLatestResult(values.suite);
if (!latest) {
  console.error(`No results found for suite "${values.suite}"`);
  process.exit(1);
}

if (!baseline) {
  const all = loadAllResults(values.suite);
  if (all.length < 2) {
    console.error(
      `Need at least 2 results to diff suite "${values.suite}" (found ${all.length})`,
    );
    process.exit(1);
  }
  baseline = all[1];
}

console.log(diffResults(baseline, latest));
