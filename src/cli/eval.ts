#!/usr/bin/env bun
/**
 * Run eval suites — one with --suite, or all. Optionally judge and synthesize.
 */

import { execFileSync, spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createEvalClient } from '../evals/eval-client';
import { runJudge } from '../evals/judge';
import {
  diffResults,
  executeSuite,
  formatResult,
  loadAllResults,
  loadEvalSuite,
  loadEvalSuites,
  loadLatestResultPath,
  saveResults,
  type Transcript,
} from '../evals/runner';
import { type EvalSuiteResult, EvalSuiteSchema } from '../evals/schema';
import { runPromptCli } from '../utils/session';
import { collectSuite } from './auto-collect';
import { restoreAfterEvals, stashChanges } from './git-lifecycle';

/** Kill stale opencode on port 4096, spawn a fresh serve, health-check. */
async function startServe(): Promise<{
  url: string;
  proc: ReturnType<typeof spawn>;
}> {
  const serveUrl = 'http://localhost:4096';
  const lsofProc = Bun.spawnSync(['lsof', '-ti', 'tcp:4096']);
  if (lsofProc.exitCode === 0) {
    const pids = lsofProc.stdout.toString().trim().split('\n').filter(Boolean);
    for (const pid of pids) {
      const psProc = Bun.spawnSync(['ps', '-p', pid, '-o', 'comm=']);
      if (psProc.stdout.toString().trim() === 'opencode') {
        try {
          process.kill(parseInt(pid, 10));
        } catch {
          /* gone */
        }
      }
    }
  }
  await Bun.sleep(500);
  const serveProc = spawn('opencode', ['serve'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 40; i++) {
    await Bun.sleep(250);
    try {
      const res = await fetch(`${serveUrl}/session`, {
        signal: AbortSignal.timeout(1000),
      });
      if (res.ok) {
        console.log(`Connected to OpenCode server at ${serveUrl}`);
        return { url: serveUrl, proc: serveProc };
      }
    } catch {
      /* not up yet */
    }
  }
  throw new Error(
    'opencode serve did not become healthy — check the server log',
  );
}

/** Kill a serve process spawned by startServe. */
function stopServe(serveProc: ReturnType<typeof spawn> | null): void {
  if (!serveProc) return;
  serveProc.kill('SIGTERM');
  setTimeout(() => {
    if (serveProc.exitCode === null) serveProc.kill('SIGKILL');
  }, 500).unref();
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    suite: { type: 'string' },
    'outputs-file': { type: 'string' },
    exclude: { type: 'string' },
    judge: { type: 'boolean' },
    smoke: { type: 'boolean' },
    collect: { type: 'boolean' },
    diff: { type: 'boolean' },
    baseline: { type: 'string' },
    precheck: { type: 'boolean' },
  },
  strict: true,
  allowPositionals: true,
});

const allSuites = loadEvalSuites().map((s) => s.name);

if (allSuites.length === 0) {
  console.error('eval — no eval suites found');
  process.exit(1);
}

const suites = values.suite ? [values.suite] : allSuites;

// ── --precheck: validate all suites ──────────────────────────────────
if (values.precheck) {
  const EVALS_DIR = join(import.meta.dir, '..', 'evals');
  const entries = readdirSync(EVALS_DIR, { withFileTypes: true });
  const suiteDirs = entries.filter(
    (e) => e.isDirectory() && e.name !== 'results' && e.name !== '__tests__',
  );
  let totalCases = 0;
  let issues = 0;
  for (const dir of suiteDirs) {
    const suitePath = join(EVALS_DIR, dir.name, 'eval.json');
    let raw: string;
    try {
      raw = readFileSync(suitePath, 'utf-8');
    } catch {
      console.error(`✗ ${dir.name}: eval.json not found`);
      issues++;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error(`✗ ${dir.name}: invalid JSON`);
      issues++;
      continue;
    }
    const result = EvalSuiteSchema.safeParse(parsed);
    if (!result.success) {
      console.error(`✗ ${dir.name}: schema validation failed`);
      issues++;
      continue;
    }
    const evals = (parsed as { evals?: unknown[] }).evals ?? [];
    totalCases += evals.length;
    for (const c of result.data.evals) {
      if (!c.id || !c.prompt) {
        console.error(`✗ ${dir.name}/${c.id}: missing id or prompt`);
        issues++;
      }
      for (const a of c.assertions) {
        if (a.type === 'references_read' && !a.value) {
          console.error(`✗ ${dir.name}/${c.id}: references_read missing value`);
          issues++;
        }
      }
    }
  }
  if (issues === 0) {
    const label = suiteDirs.length === 1 ? 'suite' : 'suites';
    console.log(
      `${totalCases} eval cases across ${suiteDirs.length} ${label}. All valid.`,
    );
  } else {
    console.error(`${issues} issue${issues > 1 ? 's' : ''} found.`);
    process.exit(1);
  }
  process.exit(0);
}

// ── --diff: compare latest results ──────────────────────────────────
if (values.diff) {
  if (!values.suite) {
    console.error('--diff requires --suite');
    process.exit(1);
  }
  let baseline: EvalSuiteResult | undefined;
  if (values.baseline) {
    baseline = JSON.parse(
      readFileSync(values.baseline, 'utf-8'),
    ) as EvalSuiteResult;
  }
  const currentResult = loadLatestResultPath(values.suite);
  if (!currentResult) {
    console.error(`No results found for suite "${values.suite}"`);
    process.exit(1);
  }
  const raw = readFileSync(currentResult, 'utf-8');
  const current = JSON.parse(raw) as EvalSuiteResult;
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
  console.log(diffResults(baseline, current));
  process.exit(0);
}

// ── --collect: interactive prompt collection ────────────────────────
if (values.collect) {
  const suite = values.suite ? loadEvalSuite(values.suite) : null;
  if (!suite) {
    console.error('--collect requires --suite <name>');
    process.exit(1);
  }
  const runs = 1;
  const outPath = `/tmp/${suite.name}-outputs.json`;
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
    console.log(`─── ${evalCase.id} ───`);
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
      if (line.trim() === '.') break;
      lines.push(line);
    }
    const response = lines.join('\n').trim();
    outputs[evalCase.id] = response.toLowerCase() === 'skip' ? '' : response;
    console.log(`  → ${response.length} chars captured\n`);
  }

  await Bun.write(outPath, JSON.stringify(outputs, null, 2));
  console.log(
    `\nWrote ${Object.keys(outputs).length} eval outputs to ${outPath}`,
  );
  console.log(
    `\nNext: bun run eval --suite ${suite.name} --outputs-file ${outPath}`,
  );
  process.exit(0);
}

const RUBRIC_PATH = join(import.meta.dir, '..', 'evals', 'judge-rubric.md');
const resultsDir = join(import.meta.dir, '..', 'evals', 'results');

function buildExcludeSet(): Set<string> | undefined {
  const ids = (values.exclude ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : undefined;
}

/** Run a single eval suite: collect, score, save, return exit code. */
async function runSuite(suite: string): Promise<number> {
  const suiteName = suite;
  const exclude = buildExcludeSet();
  const runs = values.smoke ? 1 : 3;
  const concurrency = Number(process.env.EVAL_CONCURRENCY ?? 3);
  const cwd = process.cwd();
  const timeoutMs = 300_000;

  let outputs: Record<string, string | string[]> = {};
  let outputsFile = values['outputs-file'];
  let stashed = false;

  if (!outputsFile) {
    const out = `/tmp/${suiteName}.json`;
    console.log('Stashing working tree for clean eval run...');
    stashed = stashChanges(`${suiteName}-eval-prestash`);

    const suite = loadEvalSuite(suiteName);
    if (!suite) {
      console.error(`Suite "${suiteName}" not found`);
      return 1;
    }

    const effectiveRuns = values.smoke ? 1 : runs;
    const effectiveExclude = new Set(exclude);
    if (values.smoke) {
      for (const c of suite.evals) {
        if (!c.smoke) effectiveExclude.add(c.id);
      }
    }

    if (effectiveExclude.size > 0) {
      suite.evals = suite.evals.filter((e) => !effectiveExclude.has(e.id));
    }

    try {
      console.log(`Collecting fresh eval outputs for ${suiteName}...`);
      const collected = await collectSuite({
        suite,
        client,
        runs: effectiveRuns,
        concurrency,
        directory: cwd,
        outPath: out,
        timeoutMs,
      });
      outputs = collected.outputs;
      outputsFile = out;
      console.log(
        `\nLoaded ${Object.keys(outputs).length} eval outputs from ${out}`,
      );
    } catch (err) {
      console.log('Restoring working tree after collection failure...');
      restoreAfterEvals(stashed);
      throw err;
    }
  }

  let result: EvalSuiteResult | undefined;

  try {
    let transcripts: Record<string, Transcript[]> | undefined;
    if (outputsFile) {
      const transcriptPath = outputsFile.replace(
        /\.json$/,
        '-transcripts.json',
      );
      try {
        const raw = await Bun.file(transcriptPath).text();
        transcripts = JSON.parse(raw);
        console.log(`Loaded transcripts from ${transcriptPath}`);
      } catch {
        // doesn't exist
      }
    }

    result = await executeSuite(
      suiteName,
      outputs,
      transcripts,
      exclude ?? new Set(),
    );

    try {
      result.gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd })
        .toString()
        .trim();
      result.gitBranch = execFileSync(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd },
      )
        .toString()
        .trim();
    } catch {
      // git unavailable
    }

    console.log(formatResult(result));

    if (transcripts) {
      const agentUsage = new Map<
        string,
        { input: number; output: number; cost: number }
      >();
      for (const tList of Object.values(transcripts)) {
        for (const t of tList) {
          for (const [agent, usage] of Object.entries(t.agentTokens ?? {})) {
            const cur = agentUsage.get(agent) ?? {
              input: 0,
              output: 0,
              cost: 0,
            };
            cur.input += usage.input ?? 0;
            cur.output += usage.output ?? 0;
            cur.cost += usage.cost ?? 0;
            agentUsage.set(agent, cur);
          }
        }
      }
      if (agentUsage.size > 0) {
        console.log('\nToken/cost usage per agent (all runs):');
        for (const [agent, usage] of agentUsage) {
          console.log(
            `  ${agent}: in=${usage.input.toLocaleString()} out=${usage.output.toLocaleString()} cost=$${usage.cost.toFixed(4)}`,
          );
        }
      }
    }

    if (result.totalEvals > 0) {
      const resultsFile = saveResults(suiteName, result);
      console.log(`\nResults saved to ${resultsFile}`);
    }
  } finally {
    if (stashed) {
      console.log('Cleaning eval artifacts and restoring working tree...');
      restoreAfterEvals(stashed);
    }
  }

  if (!result) return 1;

  let exitCode = result.failed > 0 ? 1 : 0;
  const flaky = result.results.filter(
    (r) => r.passAtK === 1 && r.passKk === 0 && r.runs >= 3,
  );
  if (flaky.length > 0) {
    console.log(
      `\n\u26a0 ${flaky.length} flaky eval(s) detected (pass@k=1 but pass^k=0):`,
    );
    for (const f of flaky) {
      console.log(
        `  - ${f.evalId}: ${f.runs} runs, ${(f.passRate * 100).toFixed(0)}% pass rate`,
      );
    }
    exitCode = 2;
  }

  console.log(
    `\u2550\u2550\u2550 [done] ${suiteName} (exit ${exitCode}) \u2550\u2550\u2550`,
  );
  return exitCode;
}

const failed: string[] = [];

let beforeFiles = new Set<string>();
try {
  beforeFiles = new Set(readdirSync(resultsDir));
} catch {
  // no stale data
}

const { proc: serveProc } = await startServe();

const SERVE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const client = createEvalClient(SERVE_URL, process.cwd());

const judgeResults = new Map<string, string>();

try {
  for (const suite of suites) {
    const code = await runSuite(suite);
    if (code !== 0) failed.push(suite);

    if (values.judge) {
      const resultsFile = loadLatestResultPath(suite, beforeFiles);
      if (resultsFile) {
        const result = await runJudge({
          suite,
          rubricPath: RUBRIC_PATH,
          resultsFile,
          directory: process.cwd(),
          client,
        });
        if (result.success && result.text) {
          judgeResults.set(suite, result.text);
          console.log(`Judge ${suite} — completed`);
        } else {
          console.log(
            `Judge ${suite} — failed (${result.error ?? 'unknown error'})`,
          );
        }
      } else {
        console.log(`\nNo results for ${suite} — skipping judge.`);
      }
    }
  }
} finally {
  stopServe(serveProc);
}

if (values.judge) {
  if (judgeResults.size === 0) {
    console.log('\nNo judge results — skipping oracle synthesis.');
  } else {
    const synthesized: string[] = [];
    for (const suite of suites) {
      const text = judgeResults.get(suite);
      if (text) {
        synthesized.push(`## ${suite}\n\n${text}`);
      }
    }

    if (synthesized.length > 0) {
      const prompt = `@oracle Review the per-suite council judge feedback below and synthesize a big-picture assessment of the agent orchestration system. Identify cross-suite patterns, the highest-priority fixes, and systemic weaknesses. Be direct and concise.\n\n${synthesized.join('\n\n')}`;

      console.log('\nSynthesizing big-picture assessment via oracle...');
      const response = await runPromptCli(
        prompt,
        'orchestrator',
        process.cwd(),
        600_000,
      );
      console.log('\n=== Oracle Big-Picture Assessment ===');
      console.log(response || '(empty response)');
    }
  }
}

interface SuiteScore {
  suite: string;
  score: string;
  failed: boolean;
  skipped: boolean;
}
const scoreboard: SuiteScore[] = [];
for (const suite of suites) {
  let files: string[] = [];
  try {
    files = readdirSync(resultsDir)
      .filter((f) => f.startsWith(`${suite}-`) && f.endsWith('.json'))
      .sort()
      .reverse();
  } catch {
    // no results dir
  }
  if (files.length === 0) {
    scoreboard.push({
      suite,
      score: '(no result file)',
      failed: false,
      skipped: true,
    });
  }
  try {
    const data = JSON.parse(
      await Bun.file(join(resultsDir, files[0])).text(),
    ) as Record<string, unknown>;
    const p = data.passed ?? '?';
    const t = data.totalEvals ?? '?';
    const score = data.avgPartialScore ?? '';
    scoreboard.push({
      suite,
      score: `passed ${p}/${t}  partial ${score}`,
      failed: failed.includes(suite),
      skipped: false,
    });
  } catch {
    scoreboard.push({
      suite,
      score: '(parse error)',
      failed: false,
      skipped: true,
    });
  }
}
const passed =
  suites.length - failed.length - scoreboard.filter((s) => s.skipped).length;

console.log(
  `\u2550\u2550\u2550 eval complete: ${passed}/${suites.length} suites passed \u2550\u2550\u2550`,
);
console.log('');
console.log('\u2500\u2500 Scoreboard \u2500\u2500');
for (const s of scoreboard) {
  const badge = s.failed ? '\u274c' : s.skipped ? '\u26a0\ufe0f' : '\u2705';
  console.log(`  ${badge}  ${s.suite}: ${s.score}`);
}
if (failed.length > 0) {
  console.error(`Failed suites: ${failed.join(', ')}`);
  process.exitCode = 1;
}
