/**
 * Flatten a {@link PresentationVerificationResult} into a single
 * provenance-tagged array of check results.
 *
 * Replaces the removed flattened check list on presentation results.
 * Each entry indicates whether the result came from
 * presentation-level verification or from one of the embedded
 * credentials (and which embedded credential, by index into
 * `result.credentialResults`).
 */

import type { CheckResult } from './types/check.js';
import type { PresentationVerificationResult } from './types/result.js';

export type FlattenedCheckResult =
  | { source: 'presentation'; result: CheckResult }
  | { source: 'credential'; credentialIndex: number; result: CheckResult };

export function flattenPresentationResults(
  result: PresentationVerificationResult
): FlattenedCheckResult[] {
  return [
    ...result.presentationResults.map(r => ({
      source: 'presentation' as const,
      result: r
    })),
    ...result.credentialResults.flatMap((cr, credentialIndex) =>
      cr.results.map(r => ({
        source: 'credential' as const,
        credentialIndex,
        result: r
      }))
    )
  ];
}
