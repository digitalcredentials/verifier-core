/**
 * The one place a dot-separated namespaced id is built.
 *
 * Lives apart from `fold-results.ts` because both `run-suites.ts`
 * (which stamps `CheckResult.id`) and `fold-results.ts` (which
 * builds `SuiteSummary.id`) need it, and `fold-results.ts` already
 * imports from `run-suites.ts`.
 *
 * ## STABILITY: check ids are API
 *
 * A check id embeds its suite's `phase`, so re-tagging a built-in
 * suite's phase renames every check in it. Check ids and the
 * built-in suites' phase tags are fixed for 2.x: changing either is
 * a breaking change, not a refactor.
 */

import type { SuitePhase } from './types/check.js';
import type { SuiteSummaryPhase } from './types/suite-summary.js';

/**
 * Compute the dot-separated namespaced id for a single
 * `CheckResult` or `SuiteSummary`.
 *
 * Rules:
 *  - Strip the `<suite>.` prefix from `localCheckId` if present.
 *  - When `phase === suite`, collapse to a single segment.
 *  - When `phase` is missing, use `'unknown'`.
 *  - When `localCheckId` is empty (suite-summary case), drop the
 *    trailing segment.
 *
 * @example
 *   computeId('cryptographic', 'core', 'core.proof-exists')
 *     // → 'cryptographic.core.proof-exists'
 *   computeId('recognition', 'recognition', 'recognition.profile')
 *     // → 'recognition.profile'
 *   computeId('cryptographic', 'core', '')
 *     // → 'cryptographic.core'
 */
export function computeId(
  phase: SuitePhase | undefined,
  suite: string,
  localCheckId: string
): string {
  const phaseSeg: SuiteSummaryPhase = phase ?? 'unknown';
  const localPart = localCheckId.startsWith(`${suite}.`)
    ? localCheckId.slice(suite.length + 1)
    : localCheckId;
  const segments: string[] =
    phaseSeg === suite ? [phaseSeg, localPart] : [phaseSeg, suite, localPart];
  return segments.filter(Boolean).join('.');
}
