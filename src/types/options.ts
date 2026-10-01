/**
 * Caller-facing option types for the standalone `verifyCredential` and
 * `verifyPresentation` wrappers.
 *
 * These are now thin aliases for the merged factory config + per-call
 * inputs used by `createVerifier(...)`. Kept as named types so existing
 * call sites continue to type-check.
 *
 * For repeated verification work, prefer constructing a {@link Verifier}
 * via `createVerifier(...)` once and reusing it — the verifier shares
 * its underlying cache across calls.
 */

import type {
  VerifierConfig,
  VerifyCredentialCall,
  VerifyPresentationCall
} from './verifier.js';

/** Options for the standalone `verifyCredential` wrapper. */
export type VerifyCredentialOptions = VerifierConfig & VerifyCredentialCall;

/** Options for the standalone `verifyPresentation` wrapper. */
export type VerifyPresentationOptions = VerifierConfig & VerifyPresentationCall;
