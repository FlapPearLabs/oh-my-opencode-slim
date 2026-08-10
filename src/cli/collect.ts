#!/usr/bin/env bun
/**
 * Interactive eval output collector.
 *
 * Prints each eval prompt from a suite, waits for you to paste the
 * agent's full response (terminate with a line containing only "."),
 * then writes the collected outputs to a JSON file ready for `bun run eval`.
 *
 * Usage:
 *   bun run collect --suite orchestrator-routing --out /tmp/outputs.json
 *   bun run collect --suite complexity-classifier --runs 3 --out /tmp/cc.json
 *
 * --runs N: collect N responses per eval case (for multi-run pass rates).
 *            Default 1.
 */

import { parseArgs } from 'node:util';
import { loadEvalSuite } from '../evals/runner';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    suite: { type: 'string' },
    out: { type: 'string' },
    runs: { type: 'string' },
  },
  strict: true,
  allowPositionals: false,
});

if (!values.suite) {
  console.error(
    'Usage: bun run collect --suite <name> --out <path> [--runs N]',
  );
  process.exit(1);
}

const suite = loadEvalSuite(values.suite);
if (!suite) {
  console.error(`Suite not found: ${values.suite}`);
  console.error(
    `Available: ${['orchestrator-routing', 'fixer-execution', 'complexity-classifier'].join(', ')}`,
  );
  process.exit(1);
}

const runs = values.runs ? parseInt(values.runs, 10) : 1;
const outPath = values.out ?? `/tmp/${values.suite}-outputs.json`;

console.log(
  `\nSuite: ${suite.name} (${suite.evals.length} cases × ${runs} runs)`,
);
console.log(`Agent: ${suite.evals[0]?.agent ?? 'orchestrator'}`);
console.log(`Output: ${outPath}`);
console.log('');
console.log('For each prompt below, run it in OpenCode and paste the full');
console.log('agent response here. End each response with a line containing');
console.log('only "." (period). Type "skip" as the first line to skip.\n');

const outputs: Record<string, string | string[]> = {};

for (const evalCase of suite.evals) {
  const responses: string[] = [];

  for (let r = 0; r < runs; r++) {
    const runLabel = runs > 1 ? ` [run ${r + 1}/${runs}]` : '';
    console.log(`─── ${evalCase.id}${runLabel} ───`);
    console.log(`Agent: ${evalCase.agent}`);
    if (evalCase.description) console.log(`Expect: ${evalCase.description}`);
    console.log(
      `Assertions: ${evalCase.assertions.map((a) => `${a.type}:${a.value}`).join(', ')}`,
    );
    console.log('');
    console.log('Prompt:');
    console.log(evalCase.prompt);
    console.log('');
    console.log('Paste response (end with "." on its own line):');

    const lines: string[] = [];
    for await (const line of console) {
      const trimmed = line.trim();
      if (trimmed === '.') break;
      lines.push(line);
    }

    const response = lines.join('\n').trim();

    if (response.toLowerCase() === 'skip') {
      responses.push('');
      console.log('  → skipped\n');
    } else {
      responses.push(response);
      console.log(`  → ${response.length} chars captured\n`);
    }
  }

  // Collapse single-run responses to a plain string
  outputs[evalCase.id] = runs === 1 ? responses[0] : responses;
}

await Bun.write(outPath, JSON.stringify(outputs, null, 2));
console.log(
  `\nWrote ${Object.keys(outputs).length} eval outputs to ${outPath}`,
);
console.log('');
console.log(
  `Next: bun run eval --suite ${values.suite} --outputs-file ${outPath}`,
);
