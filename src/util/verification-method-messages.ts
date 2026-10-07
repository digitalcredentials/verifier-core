/**
 * The signature libraries' messages for a verification method the proof
 * cannot be judged against.
 *
 * `@digitalcredentials/vc` and `@digitalcredentials/jsonld-signatures`
 * report three distinct faults — the verification method is missing, its
 * controller has not authorised it for the proof purpose, or the
 * credential's issuer is not that controller — as plain `Error`s wrapped
 * in a `VerificationError` whose own message is "Verification error(s).".
 * The message text is the only machine-readable signal, so the patterns
 * live here, pinned by unit tests: a library upgrade that reworded one
 * fails a test instead of quietly demoting the fault to
 * `INVALID_SIGNATURE`.
 *
 * None of these mean the content was altered. They mean the issuer's key
 * setup does not back the proof it published.
 */

/** Messages that mean the proof's verification method is unusable. */
export const VERIFICATION_METHOD_PATTERNS: readonly RegExp[] = [
  // vc's CredentialIssuancePurpose.
  /^Credential issuer must match the verification method controller\.$/,
  // jsonld-signatures' ControllerProofPurpose; also a presentation's proof.
  /not authorized by controller for proof purpose/,
  // jsonld-signatures' LinkedDataSignature.
  /^Verification method .+ not found\.$/
];

/** Whether a library error message names a verification method fault. */
export function isVerificationMethodMessage(message: string): boolean {
  return VERIFICATION_METHOD_PATTERNS.some(pattern => pattern.test(message));
}
