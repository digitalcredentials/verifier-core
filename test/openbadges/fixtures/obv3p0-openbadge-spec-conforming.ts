/**
 * Spec-conforming VCDM v2 OB 3.0 OpenBadgeCredential fixture.
 *
 * Designed to round-trip through every schema phase of the
 * 2026-04-18-openbadges-recognizer-and-subchecks plan: every
 * required envelope, profile, achievement, subject, and result
 * field is present so later phases can assert on the same fixture
 * without amendment.
 *
 * Authored as a `.ts` module (rather than `.json`) to match the
 * existing fixture convention in this repo
 * (`sample-achievement-credential.ts`).
 */

export const obv3p0OpenBadgeSpecConforming: Record<string, unknown> = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  id: 'urn:uuid:11111111-1111-1111-1111-111111111111',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: {
    id: 'did:example:issuer',
    type: ['Profile'],
    name: 'Spec-Conforming Issuer'
  },
  validFrom: '2024-01-01T00:00:00Z',
  image: {
    id: 'https://example.test/badge.png',
    type: ['Image'],
    caption: 'Spec-conforming badge image'
  },
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
