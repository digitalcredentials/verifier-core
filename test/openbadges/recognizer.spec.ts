/**
 * Spec for `obv3p0Recognizer` — the `applies` predicate plus the
 * `parse` function's wiring to {@link parseObv3p0OpenBadgeCredential}.
 *
 * Detailed envelope behavior is exercised in
 * `schema/envelope-v3p0.spec.ts`; this spec asserts the recognizer
 * surface itself.
 */

import { describe, it, expect } from 'vitest';
import { obv3p0Recognizer } from '../../src/openbadges/recognizers.js';
import type { VerificationContext } from '../../src/types/context.js';
import { sampleAchievementCredential } from './fixtures/sample-achievement-credential.js';

const ctx: VerificationContext = {
  documentLoader: async () => ({}),
  fetchJson: async () => ({}),
  cryptoServices: [],
  challenge: null,
  unsignedPresentation: false
};

describe('obv3p0Recognizer', () => {
  it('exposes a stable id and human-readable name', () => {
    expect(obv3p0Recognizer.id).toBe('obv3p0.openbadge');
    expect(obv3p0Recognizer.name).toBe('Open Badges 3.0');
  });

  it('applies() is true for an OB v3 OpenBadgeCredential', () => {
    expect(obv3p0Recognizer.applies(sampleAchievementCredential, ctx)).toBe(
      true
    );
  });

  it('applies() is false for a credential without the OB v3 context', () => {
    const notOb = {
      '@context': ['https://www.w3.org/ns/credentials/v2'],
      type: ['VerifiableCredential']
    };
    expect(obv3p0Recognizer.applies(notOb, ctx)).toBe(false);
  });

  it('applies() is false for an EndorsementCredential', () => {
    const endorsement = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
      ],
      type: ['VerifiableCredential', 'EndorsementCredential']
    };
    expect(obv3p0Recognizer.applies(endorsement, ctx)).toBe(false);
  });

  it('parse() recognizes a spec-conforming OB 3.0 credential', () => {
    const result = obv3p0Recognizer.parse(sampleAchievementCredential);
    expect(result.status).toBe('recognized');
    if (result.status === 'recognized') {
      expect(result.profile).toBe('obv3p0.openbadge');
      const normalized = result.normalized as { id: string };
      expect(normalized.id).toBe(
        (sampleAchievementCredential as { id: string }).id
      );
    }
  });

  it('parse() reports malformed when the envelope is invalid', () => {
    const malformed = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
      ],
      type: ['VerifiableCredential', 'OpenBadgeCredential']
      // missing id, issuer, validFrom, credentialSubject
    };

    const result = obv3p0Recognizer.parse(malformed);
    expect(result.status).toBe('malformed');
    if (result.status === 'malformed') {
      expect(result.profile).toBe('obv3p0.openbadge');
      expect(result.problems.length).toBeGreaterThan(0);
    }
  });
});
