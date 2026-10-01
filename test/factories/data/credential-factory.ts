import { deepMerge } from './merge-deep.js';

/** Default issuer DID used across factories (matches common test fixtures). */
export const DEFAULT_TEST_ISSUER_DID =
  'did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q';

const DEFAULT_VERIFICATION_METHOD = `${DEFAULT_TEST_ISSUER_DID}#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q`;

function isoTimestampZ(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function defaultCredentialSubject(): Record<string, unknown> {
  return {
    type: ['AchievementSubject'],
    id: 'did:example:factory-subject',
    name: 'Factory Learner',
    achievement: {
      id: 'https://example.test/achievements/sample',
      type: ['Achievement'],
      name: 'Sample Achievement',
      description: 'Issued by credential factory.',
      criteria: {
        narrative: 'Met all requirements.'
      }
    }
  };
}

/**
 * Structurally valid proof for tests (not a real signature).
 */
export function PlaceholderProof(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type: 'Ed25519Signature2020',
    created: isoTimestampZ(),
    verificationMethod: DEFAULT_VERIFICATION_METHOD,
    proofPurpose: 'assertionMethod',
    proofValue:
      'z0000000000000000000000000000000000000000000000000000000000000000',
    ...overrides
  };
}

export type CredentialVersion = 'v1' | 'v2';

export type CredentialFactoryOptions = {
  version?: CredentialVersion;
  credential?: Record<string, unknown>;
};

/**
 * Minimal Open Badge / VC credential with OBv3 contexts and placeholder proof.
 */
export function CredentialFactory(
  options: CredentialFactoryOptions = {}
): Record<string, unknown> {
  const version = options.version ?? 'v2';
  const credentialPatch = options.credential ?? {};

  const id =
    typeof credentialPatch.id === 'string'
      ? credentialPatch.id
      : 'https://example.test/credentials/factory';

  const base: Record<string, unknown> =
    version === 'v1'
      ? {
          '@context': [
            'https://www.w3.org/2018/credentials/v1',
            'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
            'https://w3id.org/security/suites/ed25519-2020/v1'
          ],
          id,
          type: ['VerifiableCredential', 'OpenBadgeCredential'],
          name: 'Factory Credential',
          issuer: {
            type: ['Profile'],
            id: DEFAULT_TEST_ISSUER_DID,
            name: 'Factory Issuer'
          },
          issuanceDate: isoTimestampZ(),
          credentialSubject: defaultCredentialSubject(),
          proof: PlaceholderProof()
        }
      : {
          '@context': [
            'https://www.w3.org/ns/credentials/v2',
            'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
            'https://w3id.org/security/suites/ed25519-2020/v1'
          ],
          id,
          type: ['VerifiableCredential', 'OpenBadgeCredential'],
          name: 'Factory Credential',
          issuer: {
            id: DEFAULT_TEST_ISSUER_DID,
            type: ['Profile'],
            name: 'Factory Issuer'
          },
          validFrom: isoTimestampZ(),
          credentialSubject: defaultCredentialSubject(),
          proof: PlaceholderProof()
        };

  return deepMerge(base, credentialPatch);
}
