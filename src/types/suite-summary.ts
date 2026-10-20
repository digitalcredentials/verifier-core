/**
 * Suite-level rollup of one or more `CheckResult`s.
 *
 * One `SuiteSummary` per (phase, suite) that ran is emitted on
 * every result. The summary is the primary surface for UI
 * rendering: one row per suite, with a human-readable `message`
 * and `counts` already rolled up.
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
 * (phase, suite) that ran.
 *
 * UIs should render primarily from `summary[]` and lazy-expand
 * into `results[]` for per-check detail.
 */
export interface SuiteSummary {
  /**
   * Dot-separated namespace identifying this suite within the
   * result set; e.g. `"cryptographic.core"`,
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
   *    `success`. A suite whose only non-failures are skips is
   *    `'failure'`.
   *  - `'skipped'` — no check ran (suite predicate returned false,
   *    every check was filtered out by `appliesTo`, or every check
   *    was halted by an earlier fatal failure).
   */
  status: 'success' | 'failure' | 'skipped' | 'mixed';

  /**
   * Human-readable rollup message. Conventions:
   *  - `"<n> of <m> checks passed"`
   *  - `"<n> of <m> checks failed (<k> passed)"`
   *  - `"<n> of <m> checks failed (<k> not run after fatal)"`
   *  - `"<suite> not run: <check-id> failed"` — every check was
   *    halted by an earlier suite's fatal failure
   *  - `"<suite> not applicable: <reason>"`
   *
   * "Not run" rows (skips whose reason starts with `Not run: `)
   * count toward `counts.skipped`, but the message reports them as
   * "not run after fatal" rather than as skips.
   */
  message: string;

  /** Per-outcome counts across the suite's child checks. */
  counts: { passed: number; failed: number; skipped: number };

  /**
   * The `id` of the check in this suite that failed fatally, if
   * one did. A fatal failure halts every later check for the
   * subject, so at most one suite per subject carries this field,
   * and the subject's `verified` is `false` exactly when one of
   * its summaries does. `counts.passed` and `counts.failed`
   * reflect what actually executed before the halt; the halted
   * checks count as `skipped`.
   *
   * `status` is computed from counts alone and does not say
   * whether a failure was fatal: a suite whose only failure is
   * non-fatal has `status: 'failure'` or `'mixed'` inside a
   * `verified: true` result. Render such a suite as a warning,
   * and reserve error styling for the suite with
   * `fatalFailureAt`.
   *
   * There is deliberately no per-suite `verified`: the only
   * verdict in a result is the top-level `verified`.
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
   * See {@link TaskTiming}.
   */
  timing?: TaskTiming;
}
