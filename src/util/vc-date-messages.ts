/**
 * `@digitalcredentials/vc`'s validity-date error messages.
 *
 * vc checks a credential's validity dates only after its proof has
 * verified, and reports a date failure as a plain `Error` whose message
 * is the only machine-readable signal: the crypto service can do no
 * better than hand it back as an invalid-signature `detail`. Two checks
 * need to recognise it — `proof.signature` for the credential itself,
 * and `status.bitstring` for a BitstringStatusListCredential — so the
 * patterns live here rather than in two copies that could drift apart.
 * If a crypto service starts reporting typed date problems, this module
 * is what it retires.
 *
 * Both document versions are covered: v2 (`validUntil` / `validFrom`)
 * and v1 (`expirationDate` / `issuanceDate`).
 */

import type { ProblemDetail } from '../types/problem-detail.js';

/** vc's messages for a credential whose validity has ended. */
export const VC_EXPIRED_PATTERNS = [
  'is after "validUntil"',
  'Credential has expired.'
];

/** vc's messages for a credential whose validity has not begun. */
export const VC_NOT_YET_VALID_PATTERNS = [
  'is before "validFrom"',
  'is before the "issuanceDate"'
];

/** Which way round a credential is out of date. */
export type VcDateFault = 'expired' | 'not-yet-valid';

/** A recognized validity-date fault and the vc message that reported it. */
export interface VcDateProblem {
  fault: VcDateFault;
  detail: string;
}

/** The validity-date fault `detail` reports, if it reports one. */
export function vcDateFault(detail: string): VcDateFault | undefined {
  if (VC_EXPIRED_PATTERNS.some(p => detail.includes(p))) {
    return 'expired';
  }
  if (VC_NOT_YET_VALID_PATTERNS.some(p => detail.includes(p))) {
    return 'not-yet-valid';
  }
  return undefined;
}

/**
 * The first validity-date fault named among `problems`, if any. A
 * rejection that names one is proof the document's signature verified:
 * vc never reaches the date checks otherwise.
 */
export function findVcDateProblem(
  problems: ProblemDetail[]
): VcDateProblem | undefined {
  for (const problem of problems) {
    const detail = problem.detail ?? '';
    const fault = vcDateFault(detail);
    if (fault !== undefined) {
      return { fault, detail };
    }
  }
  return undefined;
}
