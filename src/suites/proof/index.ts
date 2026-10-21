import { VerificationSuite } from '../../types/check.js';
import { signatureCheck } from './signature-check.js';
import { unsupportedProofsCheck } from './unsupported-proofs-check.js';
import { validityPeriodCheck } from './validity-period-check.js';

/**
 * Proof verification suite.
 *
 * Dispatches to {@link VerificationContext.cryptoServices} — the first service whose
 * `canVerify(subject)` is true runs verification. The default stack is built in
 * `default-services.ts` as `[DataIntegrityCryptoService({ suites: defaultCryptoSuites() })]`.
 *
 * The Data Integrity adapter wraps `@digitalcredentials/vc` and
 * `@digitalcredentials/jsonld-signatures`, handles AuthenticationProofPurpose vs
 * AssertionProofPurpose for presentations, and maps library errors to
 * `ProblemDetail` entries.
 *
 * `proof.unsupported-proofs` follows the signature check and warns about
 * proofs in a proof set that no registered suite could check.
 *
 * `proof.validity-period` follows them, so a failed signature halts it,
 * and judges the credential's validity dates.
 */
export const proofSuite: VerificationSuite = {
  id: 'proof',
  name: 'Proof Verification',
  description:
    "Cryptographic signature verification, and the credential's validity period.",
  phase: 'cryptographic',
  checks: [signatureCheck, unsupportedProofsCheck, validityPeriodCheck]
};
