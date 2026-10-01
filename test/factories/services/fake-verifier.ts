import type { Verifier } from '../../../src/types/verifier.js';
import type { VerifiableCredential } from '../../../src/schemas/credential.js';
import type { VerifiablePresentation } from '../../../src/schemas/presentation.js';
import type {
  CredentialVerificationResult,
  PresentationVerificationResult
} from '../../../src/types/result.js';

export interface FakeVerifierOptions {
  /** Override `verifyCredential`. Default: returns `{ verified: true, verifiableCredential: {} as VerifiableCredential, results: [] }`. */
  verifyCredential?: Verifier['verifyCredential'];
  /** Override `verifyPresentation`. Default: returns `{ verified: true, verifiablePresentation: stub, presentationResults: [], credentialResults: [] }` (no pre-flattened check list). */
  verifyPresentation?: Verifier['verifyPresentation'];
}

/**
 * Fake {@link Verifier} for tests. Both methods default to a successful
 * empty result; pass overrides to simulate failures or capture calls.
 */
export function FakeVerifier(options: FakeVerifierOptions = {}): Verifier {
  return {
    verifyCredential: options.verifyCredential ?? defaultVerifyCredential,
    verifyPresentation: options.verifyPresentation ?? defaultVerifyPresentation
  };
}

const defaultVerifyCredential: Verifier['verifyCredential'] = async () =>
  ({
    verified: true,
    verifiableCredential: {} as VerifiableCredential,
    results: [],
    summary: []
  }) satisfies CredentialVerificationResult;

const defaultVerifyPresentation: Verifier['verifyPresentation'] = async () =>
  ({
    verified: true,
    verifiablePresentation: {} as VerifiablePresentation,
    presentationResults: [],
    credentialResults: [],
    summary: []
  }) satisfies PresentationVerificationResult;
