/**
 * Standalone wrappers — `verifyCredential` / `verifyPresentation`.
 *
 * For one-shot verification only: each call constructs a fresh
 * {@link Verifier} via `createVerifier(...)` and discards it. For any
 * batch or repeated verification work, build a `Verifier` once with
 * `createVerifier(...)` and reuse it so the underlying caches (issuer
 * DID documents, status list credentials, JSON-LD contexts) are shared.
 */

import { createVerifier } from './verifier.js';
import type {
  VerifyCredentialOptions,
  VerifyPresentationOptions
} from './types/options.js';
import type {
  CredentialVerificationResult,
  PresentationVerificationResult
} from './types/result.js';

export async function verifyCredential(
  opts: VerifyCredentialOptions
): Promise<CredentialVerificationResult> {
  const { credential, additionalSuites, registries, ...config } = opts;
  return createVerifier(config).verifyCredential({
    credential,
    additionalSuites,
    registries
  });
}

export async function verifyPresentation(
  opts: VerifyPresentationOptions
): Promise<PresentationVerificationResult> {
  const {
    presentation,
    challenge,
    unsignedPresentation,
    additionalSuites,
    registries,
    ...config
  } = opts;
  return createVerifier(config).verifyPresentation({
    presentation,
    challenge,
    unsignedPresentation,
    additionalSuites,
    registries
  });
}
