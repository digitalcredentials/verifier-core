/**
 * VCDM v1 variant of the spec-conforming OB 3.0 OpenBadgeCredential
 * fixture. Identical content modulo the v1 context + `issuanceDate`
 * (instead of `validFrom`).
 */

export const obv3p0OpenBadgeVcdmV1: Record<string, unknown> = {
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  id: 'urn:uuid:22222222-2222-2222-2222-222222222222',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: {
    id: 'did:example:issuer',
    type: ['Profile'],
    name: 'Spec-Conforming V1 Issuer'
  },
  issuanceDate: '2024-01-01T00:00:00Z',
  credentialSubject: {
    id: 'did:example:recipient',
    type: ['AchievementSubject'],
    achievement: {
      id: 'urn:example:achievement-1',
      type: ['Achievement'],
      achievementType: 'Course',
      name: 'Example Course',
      description: 'A short example achievement.',
      criteria: { narrative: 'Pass the exam.' }
    }
  }
};
