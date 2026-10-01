import { DEFAULT_TEST_ISSUER_DID } from './credential-factory.js';
import { deepMerge } from './merge-deep.js';

const KEY_FRAGMENT = 'z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q';

/**
 * Minimal did:key-style DID document for tests.
 */
export function DidDocumentFactory(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const id =
    typeof overrides.id === 'string' ? overrides.id : DEFAULT_TEST_ISSUER_DID;
  const vmId = `${id}#${KEY_FRAGMENT}`;

  const base: Record<string, unknown> = {
    '@context': ['https://w3id.org/did/v1'],
    id,
    verificationMethod: [
      {
        id: vmId,
        type: 'Ed25519VerificationKey2020',
        controller: id,
        publicKeyMultibase: 'z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q'
      }
    ],
    authentication: [vmId],
    assertionMethod: [vmId]
  };
  return deepMerge(base, overrides);
}
