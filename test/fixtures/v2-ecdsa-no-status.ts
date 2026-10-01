/**
 * VC 2.0, ECDSA RDFC 2019 Data Integrity proof, P-256 (`zDna…`) did:key
 * Multikey issuer, no credential status.
 *
 * Golden interoperability input (real signature) for the `ecdsa-rdfc-2019`
 * cryptosuite. did:key issuer keeps the smoke test independent of any hosted
 * did:web or status-list host.
 */
export const v2EcdsaNoStatus = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    'https://w3id.org/security/multikey/v1'
  ],
  id: 'http://example.com/credentials/9421',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: {
    id: 'did:key:zDnaeTb7LZSWJxugrY5GCkw5FZ4niWFSmgMrDVH3fMqrrSRd7',
    type: ['Profile'],
    name: 'Example Corp'
  },
  validFrom: '2010-01-01T00:00:00Z',
  name: 'Teamwork Badge',
  credentialSubject: {
    id: 'did:example:ebfeb1f712ebc6f1c276e12ec21',
    type: ['AchievementSubject'],
    achievement: {
      id: 'https://example.com/achievements/21st-century-skills/teamwork',
      type: ['Achievement'],
      criteria: {
        narrative:
          'Team members are nominated for this badge by their peers and recognized upon review by Example Corp management.'
      },
      description:
        'This badge recognizes the development of the capacity to collaborate within a group environment.',
      name: 'Teamwork'
    }
  },
  proof: {
    type: 'DataIntegrityProof',
    created: '2026-07-15T13:37:14Z',
    verificationMethod:
      'did:key:zDnaeTb7LZSWJxugrY5GCkw5FZ4niWFSmgMrDVH3fMqrrSRd7#zDnaeTb7LZSWJxugrY5GCkw5FZ4niWFSmgMrDVH3fMqrrSRd7',
    cryptosuite: 'ecdsa-rdfc-2019',
    proofPurpose: 'assertionMethod',
    proofValue:
      'z3FcSCipTYqbCCeqqEWBYoFjSRxsMYuwyHRjRkxkYvejrUz9aG33LZoArTadYqWD8Nae7PtdE1TnFxR3becjuFLN2'
  }
};
