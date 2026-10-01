import { VerificationSuite } from '../../types/check.js';
import { signatureCheck } from './signature-check.js';

/**
 * Proof verification suite.
 *
 * Dispatches to {@link VerificationContext.cryptoServices} — the first service whose
 * `canVerify(subject)` is true runs verification. The default stack is built in
 * `default-services.ts` as `[DataIntegrityCryptoService({ suites: defaultCryptoSuites() })]`.
 *
 * The Data Integrity adapter wraps `@digitalcredentials/vc`, handles
 * AuthenticationProofPurpose vs AssertionProofPurpose for presentations, and maps
 * library errors to `ProblemDetail` entries.
 */
export const proofSuite: VerificationSuite = {
  id: 'proof',
  name: 'Proof Verification',
  description: 'Cryptographic signature verification.',
  phase: 'cryptographic',
  checks: [signatureCheck]
};
