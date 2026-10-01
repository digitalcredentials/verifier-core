import {
  DEFAULT_TEST_ISSUER_DID,
  CredentialFactory,
  PlaceholderProof
} from './credential-factory.js';
import { deepMerge } from './merge-deep.js';

/**
 * Verifiable presentation with one factory credential by default.
 */
export function PresentationFactory(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiablePresentation'],
    holder: DEFAULT_TEST_ISSUER_DID,
    verifiableCredential: [CredentialFactory()],
    proof: PlaceholderProof({
      proofPurpose: 'authentication',
      challenge: 'factory-challenge'
    })
  };
  return deepMerge(base, overrides);
}
