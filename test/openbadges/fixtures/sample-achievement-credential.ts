/**
 * Realistic OBv3 OpenBadgeCredential fixture for the openbadges
 * submodule integration spec.
 *
 * Shape design — exercises every check in {@link openBadgesSemanticSuite}
 * along its happy path:
 *
 * - `result-ref-check` — `result[0].resultDescription` resolves to the
 *   declared `urn:rd:1` ResultDescription, so the check returns success.
 * - `achieved-level-check` — `result[0].achievedLevel = 'urn:lvl:A'`
 *   appears in `urn:rd:1`'s rubric levels, so the check returns success.
 * - `missing-result-status-check` — no ResultDescription has
 *   `resultType: 'Status'`, so the check returns success ("not applicable
 *   to this credential").
 * - `unknown-achievement-type-check` — `'Course'` is in the OB 3.0
 *   built-in vocab, so the check returns success.
 *
 * The integration spec mutates a clone of this fixture
 * (`result[0].achievedLevel = 'urn:lvl:NOT_REAL'`) to drive the
 * achievement check's failure path and assert the
 * `OB_INVALID_ACHIEVED_LEVEL` problem URI surfaces.
 *
 * The credential is **not** signed by a real key. The integration
 * spec passes a `FakeCryptoService({ verified: true })` so the proof
 * suite accepts the placeholder `proofValue`.
 */

export const sampleAchievementCredential: Record<string, unknown> = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  id: 'urn:uuid:integration-test-credential',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: {
    id: 'did:example:issuer',
    type: ['Profile'],
    name: 'Integration Test Issuer'
  },
  validFrom: '2024-01-01T00:00:00Z',
  credentialSubject: {
    id: 'did:example:recipient',
    type: ['AchievementSubject'],
    achievement: {
      id: 'urn:example:achievement-1',
      type: ['Achievement'],
      achievementType: 'Course',
      name: 'Example Course',
      description: 'A short example achievement.',
      criteria: { narrative: 'Pass the exam.' },
      resultDescription: [
        {
          id: 'urn:rd:1',
          type: ['ResultDescription'],
          resultType: 'GradePointAverage',
          name: 'GPA',
          rubricCriterionLevel: [
            {
              id: 'urn:lvl:A',
              type: ['RubricCriterionLevel'],
              name: 'Excellent'
            },
            {
              id: 'urn:lvl:B',
              type: ['RubricCriterionLevel'],
              name: 'Good'
            }
          ]
        }
      ]
    },
    result: [
      {
        type: ['Result'],
        resultDescription: 'urn:rd:1',
        achievedLevel: 'urn:lvl:A'
      }
    ]
  },
  proof: {
    type: 'Ed25519Signature2020',
    created: '2024-01-01T00:00:00Z',
    verificationMethod: 'did:example:issuer#z6MkPlaceholder',
    proofPurpose: 'assertionMethod',
    proofValue:
      'z000000000000000000000000000000000000000000000000000000000000000000'
  }
};
