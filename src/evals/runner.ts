import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Assertion,
  type EvalCase,
  type EvalResult,
  type EvalSuite,
  type EvalSuiteResult,
  EvalSuiteSchema,
} from './schema';

export type { EvalResult, EvalSuite, EvalSuiteResult };

const EVALS_DIR = import.meta.dir;
const RESULTS_DIR = join(EVALS_DIR, 'results');

// ── Loaders ──────────────────────────────────────────────────────────

export function loadEvalSuites(): EvalSuite[] {
  const suites: EvalSuite[] = [];
  const entries = readdirSync(EVALS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name === 'results' ||
      entry.name === '__tests__'
    )
      continue;

    const suitePath = join(EVALS_DIR, entry.name, 'eval.json');
    try {
      const raw = readFileSync(suitePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const suite = EvalSuiteSchema.parse(parsed);
      suites.push(suite);
    } catch {
      // Skip malformed suites
    }
  }

  return suites;
}

export function loadEvalSuite(name: string): EvalSuite | null {
  const suitePath = join(EVALS_DIR, name, 'eval.json');
  try {
    const raw = readFileSync(suitePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return EvalSuiteSchema.parse(parsed);
  } catch {
    return null;
  }
}

// ── Assertions ───────────────────────────────────────────────────────

/**
 * Check a single assertion against agent output text.
 * tool_used / tool_not_used / files_modified are checked against the
 * raw output text for now — a future harness can provide structured
 * tool-call metadata instead.
 */
export function checkAssertion(
  assertion: Assertion,
  output: string,
): { passed: boolean; evidence?: string } {
  switch (assertion.type) {
    case 'contains':
      return {
        passed: output.toLowerCase().includes(assertion.value.toLowerCase()),
        evidence: output.toLowerCase().includes(assertion.value.toLowerCase())
          ? undefined
          : `output did not contain "${assertion.value}"`,
      };

    case 'not_contains':
      return {
        passed: !output.toLowerCase().includes(assertion.value.toLowerCase()),
        evidence: !output.toLowerCase().includes(assertion.value.toLowerCase())
          ? undefined
          : `output contained "${assertion.value}"`,
      };

    case 'regex':
      try {
        const re = new RegExp(assertion.value, 'i');
        return {
          passed: re.test(output),
          evidence: re.test(output)
            ? undefined
            : `output did not match /${assertion.value}/`,
        };
      } catch {
        return {
          passed: false,
          evidence: `invalid regex: ${assertion.value}`,
        };
      }

    // ponytail: tool / filesystem checks scan output text for now;
    // structured metadata hooks exist in observability.ts and can
    // feed richer evidence later without changing this interface.
    case 'tool_used':
      return {
        passed: output.toLowerCase().includes(assertion.value.toLowerCase()),
        evidence: output.toLowerCase().includes(assertion.value.toLowerCase())
          ? undefined
          : `tool "${assertion.value}" not found in output`,
      };

    case 'tool_not_used':
      return {
        passed: !output.toLowerCase().includes(assertion.value.toLowerCase()),
        evidence: !output.toLowerCase().includes(assertion.value.toLowerCase())
          ? undefined
          : `tool "${assertion.value}" was used`,
      };

    case 'files_modified':
      return {
        passed: output.toLowerCase().includes(assertion.value.toLowerCase()),
        evidence: output.toLowerCase().includes(assertion.value.toLowerCase())
          ? undefined
          : `file "${assertion.value}" not mentioned in output`,
      };

    // structure: output must match a structural pattern (e.g., has <summary> tag)
    case 'structure': {
      // structural pattern: output contains value as a substring
      // (typically an XML tag or markdown heading)
      const passed = output.includes(assertion.value);
      return {
        passed,
        evidence: passed
          ? undefined
          : `structural pattern "${assertion.value}" not found`,
      };
    }

    // references_read: output indicates the agent read a references/ file
    case 'references_read': {
      const lowerOutput = output.toLowerCase();
      const uniqueContent = assertion.referenceContent
        ? [assertion.referenceContent].flat().map((s) => s.toLowerCase())
        : [];

      // If unique reference content is provided, require at least one match
      if (uniqueContent.length > 0) {
        const hasReferenceRead = uniqueContent.some((content) =>
          lowerOutput.includes(content),
        );
        return {
          passed: hasReferenceRead,
          evidence: hasReferenceRead
            ? undefined
            : `output does not contain reference-specific content`,
        };
      }

      // Fallback: weak check (phrases that may appear in pointer text)
      console.warn(
        '[oh-my-opencode-slim] references_read assertion without referenceContent is weak; add referenceContent unique to the reference file',
      );
      const hasReferenceRead = lowerOutput.includes('references/') ||
        lowerOutput.includes('read the full guide') ||
        lowerOutput.includes('see references/') ||
        lowerOutput.includes('full guide') ||
        lowerOutput.includes('detailed patterns') ||
        lowerOutput.includes('worked examples') ||
        lowerOutput.includes('anti-patterns');
      return {
        passed: hasReferenceRead,
        evidence: hasReferenceRead
          ? undefined
          : `output does not indicate reading a references/ file`,
      };
    }
    default:
      return { passed: false, evidence: `unknown assertion type` };
  }
}

// ── Execution ────────────────────────────────────────────────────────

/**
 * Run a single eval case with multiple output samples.
 * Returns pass rate across runs and per-assertion rates.
 */
export function executeEvalCase(
  evalCase: EvalCase,
  outputs: string[],
): EvalResult {
  if (outputs.length === 0) {
    return {
      evalId: evalCase.id,
      prompt: evalCase.prompt,
      passed: false,
      runs: 0,
      passRate: 0,
      assertions: evalCase.assertions.map((a) => ({
        assertion: a,
        passed: false,
        evidence: 'no outputs provided',
      })),
      error: 'no outputs provided',
    };
  }

  const assertionResults = evalCase.assertions.map((assertion) => {
    const runResults = outputs.map((out) => checkAssertion(assertion, out));
    const passCount = runResults.filter((r) => r.passed).length;
    return {
      assertion,
      passed: passCount > outputs.length / 2, // majority passes
      passRate: passCount / outputs.length,
      evidence:
        passCount < outputs.length
          ? runResults.find((r) => !r.passed)?.evidence
          : undefined,
    };
  });

  const allPassed = assertionResults.every((a) => a.passed);

  return {
    evalId: evalCase.id,
    prompt: evalCase.prompt,
    passed: allPassed,
    runs: outputs.length,
    passRate:
      assertionResults.reduce((s, a) => s + a.passRate, 0) /
      assertionResults.length,
    assertions: assertionResults,
    output: outputs[outputs.length - 1], // keep last run for inspection
  };
}

/**
 * Execute an entire eval suite.
 *
 * @param suiteName - name of the suite to run
 * @param outputs - map of evalId → output text (or array of texts for multi-run)
 * @returns EvalSuiteResult with per-case pass rates
 */
export function executeSuite(
  suiteName: string,
  outputs: Record<string, string | string[]>,
): EvalSuiteResult {
  const suite = loadEvalSuite(suiteName);
  if (!suite) {
    return {
      suiteName,
      totalEvals: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      results: [],
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const startTime = Date.now();
  const results: EvalResult[] = [];

  for (const evalCase of suite.evals) {
    const raw = outputs[evalCase.id];
    const outputList =
      raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];

    if (outputList.length === 0) {
      results.push({
        evalId: evalCase.id,
        prompt: evalCase.prompt,
        passed: false,
        runs: 0,
        passRate: 0,
        assertions: evalCase.assertions.map((a) => ({
          assertion: a,
          passed: false,
          evidence: `no output for eval "${evalCase.id}"`,
        })),
        error: `no output for eval "${evalCase.id}"`,
      });
    } else {
      results.push(executeEvalCase(evalCase, outputList));
    }
  }

  const durationMs = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && r.runs > 0).length;
  const skipped = results.filter((r) => r.runs === 0).length;

  return {
    suiteName,
    totalEvals: suite.evals.length,
    passed,
    failed,
    skipped,
    results,
    durationMs,
    timestamp: new Date().toISOString(),
  };
}

// ── Results I/O ──────────────────────────────────────────────────────

export function saveResults(
  suiteName: string,
  result: EvalSuiteResult,
): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${suiteName}-${timestamp}.json`;
  const filepath = join(RESULTS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(result, null, 2));
  return filepath;
}

export function loadLatestResult(suiteName: string): EvalSuiteResult | null {
  try {
    const entries = readdirSync(RESULTS_DIR)
      .filter((f) => f.startsWith(`${suiteName}-`) && f.endsWith('.json'))
      .sort()
      .reverse();

    if (entries.length === 0) return null;

    const raw = readFileSync(join(RESULTS_DIR, entries[0]), 'utf-8');
    return JSON.parse(raw) as EvalSuiteResult;
  } catch {
    return null;
  }
}

// ── Display ──────────────────────────────────────────────────────────

export function formatResult(result: EvalSuiteResult): string {
  const lines: string[] = [
    `═══ ${result.suiteName} ═══`,
    `${result.passed}/${result.totalEvals} passed (${result.failed} failed, ${result.skipped} skipped)`,
    `Duration: ${(result.durationMs / 1000).toFixed(1)}s`,
    '',
  ];

  for (const r of result.results) {
    const icon = r.passed ? '✓' : r.runs === 0 ? '?' : '✗';
    const rate =
      r.runs > 0
        ? ` [${(r.passRate * 100).toFixed(0)}% across ${r.runs} runs]`
        : '';
    lines.push(`  ${icon} ${r.evalId}: ${r.prompt.slice(0, 60)}...${rate}`);

    if (!r.passed) {
      for (const a of r.assertions.filter((a) => !a.passed)) {
        lines.push(`    ✗ ${a.assertion.description}`);
        if (a.evidence) lines.push(`      ${a.evidence}`);
      }
    }
  }

  return lines.join('\n');
}

export function diffResults(
  baseline: EvalSuiteResult,
  current: EvalSuiteResult,
): string {
  const lines: string[] = [
    `═══ Delta: ${baseline.suiteName} ═══`,
    `Baseline: ${baseline.passed}/${baseline.totalEvals} passed`,
    `Current:  ${current.passed}/${current.totalEvals} passed`,
    '',
  ];

  const delta = current.passed - baseline.passed;
  if (delta > 0) lines.push(`↑ ${delta} more passing`);
  else if (delta < 0) lines.push(`↓ ${Math.abs(delta)} fewer passing`);
  else lines.push('→ No change');

  for (const base of baseline.results) {
    const curr = current.results.find((r) => r.evalId === base.evalId);
    if (!curr) continue;

    if (base.passed && !curr.passed) {
      lines.push(`  REGRESSION: ${base.evalId}`);
    } else if (!base.passed && curr.passed) {
      lines.push(`  IMPROVED: ${base.evalId}`);
    }
  }

  return lines.join('\n');
}
