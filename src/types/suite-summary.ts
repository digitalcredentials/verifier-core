/**
 * Suite-level rollup of one or more `CheckResult`s.
 *
 * One `SuiteSummary` per (phase, suite) that ran is emitted on
 * every result, regardless of whether the verifier was called in
 * `verbose: true` or `verbose: false` (default) mode. The summary
 * is the primary surface for UI rendering: one row per suite, with
 * a human-readable `message` and `counts` already rolled up.
 *
 * Computed by `foldCheckResults` (see `src/fold-results.ts`) from
 * the raw `CheckResult[]` returned by `runSuites`.
 *
 * @see CheckResult
 * @see foldCheckResults
 */

import type { SuitePhase } from './check.js';
import type { TaskTiming } from './timing.js';

/**
 * Phase tag as it appears on a `SuiteSummary`.
 *
 * Mirrors the canonical {@link SuitePhase} (the 4 phase tags that
 * suites can carry on `VerificationSuite.phase`) plus `'unknown'`
 * for the rollup of suites that ran with `phase: undefined`.
 *
 * Built-in suites are always tagged, so `'unknown'` only appears
 * when a consumer-supplied `additionalSuites` entry omits its
 * `phase` field.
 */
export type SuiteSummaryPhase = SuitePhase | 'unknown';

/**
 * Suite-level rollup of one or more `CheckResult`s. One entry per
 * (phase, suite) that ran; always emitted regardless of `verbose`.
 *
 * UIs should render primarily from `summary[]` and lazy-expand
 * into `results[]` for failure detail.
 */
export interface SuiteSummary {
  /**
   * Dot-separated namespace identifying this suite within the
   * folded result set; e.g. `"cryptographic.core"`,
   * `"semantic.openbadges"`. When `phase === suite` (the
   * `recognition` suite is the canonical example), the duplicate
   * segment collapses to a single `"recognition"`.
   */
  id: string;

  /** See {@link SuiteSummaryPhase}. */
  phase: SuiteSummaryPhase;

  /** Suite id; mirrors `VerificationSuite.id`. */
  suite: string;

  /**
   * Aggregate status across the suite's child checks:
   *  - `'success'` — every check that ran returned `success`.
   *  - `'failure'` — every check that ran returned `failure`.
   *  - `'mixed'`   — at least one `failure` and at least one
   *    non-`failure` (`success` or `skipped`).
   *  - `'skipped'` — no check ran (suite predicate returned false
   *    or every check was filtered out by `appliesTo`).
   */
  status: 'success' | 'failure' | 'skipped' | 'mixed';

  /** True iff no child check returned `'failure'`. */
  verified: boolean;

  /**
   * Human-readable rollup message. Conventions:
   *  - `"<n> of <m> checks passed"`
   *  - `"<n> of <m> checks failed (<k> passed)"`
   *  - `"<n> of <m> checks failed (<k> not run after fatal)"`
   *  - `"<suite> not applicable: <reason>"`
   */
  message: string;

  /** Per-outcome counts across the suite's child checks. */
  counts: { passed: number; failed: number; skipped: number };

  /**
   * Set when a fatal check failure halted the suite mid-run;
   * carries the failing check's `id`. `counts` reflects what
   * actually executed before the halt.
   */
  fatalFailureAt?: string;

  /**
   * Suite-level timing rolled up from the child checks. Only
   * present when the producing call ran with `timing: true`.
   *
   *  - `startedAt` is the earliest child `timing.startedAt`.
   *  - `endedAt`   is the latest child `timing.endedAt`.
   *  - `durationMs` is the sum of child `timing.durationMs`
   *    (CPU/wall time spent inside checks; tighter than
   *    `endedAt - startedAt`, which would also include any
   *    inter-check gap).
   *
   * Survives result folding: even when `verbose: false` hides
   * individual check details, this rollup is computed before
   * checks are folded away. See {@link TaskTiming}.
   */
  timing?: TaskTiming;
}
