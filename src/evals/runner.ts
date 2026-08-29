/**
 * Barrel module — re-exports all eval submodules for backward compatibility.
 *
 * New code should import from the specific submodule instead:
 * - './suites' — loadEvalSuites, loadEvalSuite
 * - './assertions' — checkAssertion
 * - './scoring' — FAILED_TRIAL_MARKER, executeEvalCase, executeSuite
 * - './results' — saveResults, loadLatestResult, loadAllResults
 * - './display' — formatResult, diffResults
 * - './schema' — types and Zod schemas
 */

export { checkAssertion } from './assertions';
export { diffResults, formatResult } from './display';
export {
  loadAllResults,
  loadLatestResult,
  loadLatestResultPath,
  saveResults,
} from './results';
export { isLockError, runCase } from './run-case';
export type {
  EvalResult,
  EvalSuite,
  EvalSuiteResult,
  Transcript,
} from './schema';
export { executeEvalCase, executeSuite, FAILED_TRIAL_MARKER } from './scoring';
export { loadEvalSuite, loadEvalSuites } from './suites';
