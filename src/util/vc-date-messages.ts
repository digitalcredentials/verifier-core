/**
 * `@digitalcredentials/vc`'s validity-date error messages.
 *
 * vc's `verifyCredential` verifies the proof first and checks the
 * credential's validity dates only once it has verified. A date failure
 * comes back as a plain `Error` whose message is the only
 * machine-readable signal; a proof failure comes back as a
 * `VerificationError` carrying the reasons in `errors[]`. The crypto
 * service uses {@link vcDateFault} to tell the two apart and report a
 * typed date problem, which is how the rest of the verifier learns that
 * the proof itself verified.
 *
 * Both document versions are covered: v2 (`validUntil` / `validFrom`)
 * and v1 (`expirationDate` / `issuanceDate`). The messages are vc
 * 10.0.2's, matched in full.
 */

/** vc's messages for a credential whose validity has ended. */
const VC_EXPIRED_MESSAGES = [
  /^Credential has expired\.$/,
  /^The current date time \(.+\) is after "validUntil" \(.+\)\.$/
];

/** vc's messages for a credential whose validity has not begun. */
const VC_NOT_YET_VALID_MESSAGES = [
  /^The current date time \(.+\) is before the "issuanceDate" \(.+\)\.$/,
  /^The current date time \(.+\) is before "validFrom" \(.+\)\.$/
];

/** Which way round a credential is out of date. */
export type VcDateFault = 'expired' | 'not-yet-valid';

/**
 * The validity-date fault vc's `verifyCredential` rejected with, if that
 * is all it rejected for.
 *
 * vc throws these from `_checkCredential` only after the proof verified,
 * as a plain `Error`; a proof failure is a `VerificationError` carrying
 * `errors[]`. Both conditions are required, and the message must match
 * vc's wording in full, so a date phrase quoted inside a wrapped proof
 * error never counts.
 */
export function vcDateFault(error: unknown): VcDateFault | undefined {
  if (!(error instanceof Error) || error.name === 'VerificationError') {
    return undefined;
  }
  if (Array.isArray((error as { errors?: unknown }).errors)) {
    return undefined;
  }
  if (VC_EXPIRED_MESSAGES.some(m => m.test(error.message))) {
    return 'expired';
  }
  if (VC_NOT_YET_VALID_MESSAGES.some(m => m.test(error.message))) {
    return 'not-yet-valid';
  }
  return undefined;
}
