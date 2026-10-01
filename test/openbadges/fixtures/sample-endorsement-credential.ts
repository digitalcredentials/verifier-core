/**
 * Realistic OBv3 EndorsementCredential fixture for the
 * `obv3p0EndorsementRecognizer` spec.
 *
 * Shape design (per OB 3.0 §B.1.7):
 * - VCDM v2 context (`@context[0]`) + OB 3.0 context.
 * - `type` includes both `VerifiableCredential` and
 *   `EndorsementCredential`.
 * - `name` (required), `description` (optional in scope).
 * - `issuer` as a full `Profile` object (exercises
 *   `ProfileRefField`).
 * - `validFrom` set (so the v2 date discriminator is satisfied);
 *   `validUntil` and `awardedDate` exercise additional optional
 *   datetime fields.
 * - `credentialSubject` is an `EndorsementSubject` (§B.1.8) with
 *   the required `id` + `type` and an optional `endorsementComment`.
 *
 * The credential is **not** signed by a real key. Recognizer tests
 * exercise envelope parsing only, not proof verification, so no
 * proof block is needed here.
 */

export const sampleEndorsementCredential: Record<string, unknown> = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  id: 'urn:uuid:endorsement-recognizer-fixture',
  type: ['VerifiableCredential', 'EndorsementCredential'],
  name: 'Example Endorsement',
  description: 'A short example endorsement of an achievement.',
  issuer: {
    id: 'did:example:endorser',
    type: ['Profile'],
    name: 'Example Endorser'
  },
  validFrom: '2024-01-01T00:00:00Z',
  validUntil: '2034-01-01T00:00:00Z',
  awardedDate: '2024-01-01T00:00:00Z',
  credentialSubject: {
    id: 'urn:example:achievement-1',
    type: ['EndorsementSubject'],
    endorsementComment:
      'This achievement reflects mastery as measured by the issuer rubric.'
  }
};
