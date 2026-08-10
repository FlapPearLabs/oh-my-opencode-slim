#!/usr/bin/env bun
/**
 * CLI entry point for running eval suites.
 *
 * Usage:
 *   bun run eval [--suite <name>] --outputs-file <path>
 *   bun run eval [--suite <name>] --outputs-file /tmp/outputs.json
 *
 * --suite is optional: if exactly one eval suite exists it is used
 * automatically.
 *
 * outputs.json format:
 *   { "eval-id-1": "agent output text", "eval-id-2": ["run1", "run2"] }
 *
 * Each value is a single string or array of strings for multi-run.
 * Results are saved to src/evals/results/ and printed to stdout.
 */

import { parseArgs } from 'node:util';
import {
  executeSuite,
  formatResult,
  loadEvalSuites,
  saveResults,
} from '../evals/runner';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    suite: { type: 'string' },
    'outputs-file': { type: 'string' },
  },
  strict: true,
  allowPositionals: false,
});

if (!values.suite) {
  const suites = loadEvalSuites();
  if (suites.length === 1) {
    values.suite = suites[0].name;
  } else if (suites.length > 1) {
    console.error(
      `Multiple suites found: ${suites.map((s) => s.name).join(', ')}`,
    );
    console.error('Usage: bun run eval --suite <name> --outputs-file <path>');
    process.exit(1);
  } else {
    console.error('Usage: bun run eval --suite <name> --outputs-file <path>');
    process.exit(1);
  }
}

let outputs: Record<string, string | string[]> = {};

if (values['outputs-file']) {
  try {
    const raw = await Bun.file(values['outputs-file']).text();
    outputs = JSON.parse(raw);
  } catch (err) {
    console.error(
      `Failed to read outputs file: ${values['outputs-file']}`,
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

const result = executeSuite(values.suite, outputs);
const formatted = formatResult(result);
console.log(formatted);

if (result.totalEvals > 0) {
  const savedPath = saveResults(values.suite, result);
  console.log(`\nResults saved to: ${savedPath}`);
}

const exitCode = result.failed > 0 ? 1 : 0;
process.exit(exitCode);
