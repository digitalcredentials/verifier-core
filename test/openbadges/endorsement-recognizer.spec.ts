/**
 * Spec for `obv3p0EndorsementRecognizer` — covers the recognizer's
 * `applies` / `parse` surface, the strict envelope schema's
 * happy path and refinements, and end-to-end wiring through
 * `createVerifier` (recognizer + recognition suite + the
 * `applies` predicate on `openBadgesSuite`).
 *
 * Out of scope for now: endorsement semantic checks,
 * recursive verification of embedded endorsements.
 */

import { describe, it, expect } from 'vitest';
import { createVerifier } from '../../src/verifier.js';
import {
  obv3p0EndorsementRecognizer,
  obv3p0Recognizer,
  openBadgesSuite,
  parseObv3p0EndorsementCredential
} from '../../src/openbadges/index.js';
import type { VerificationContext } from '../../src/types/context.js';
import { sampleEndorsementCredential } from './fixtures/sample-endorsement-credential.js';
import { sampleAchievementCredential } from './fixtures/sample-achievement-credential.js';
import { FakeCryptoService } from '../factories/services/fake-crypto-service.js';

const ctx: VerificationContext = {
  documentLoader: async () => ({}),
  fetchJson: async () => ({}),
  cryptoServices: [],
  challenge: null,
  unsignedPresentation: false
};

const fakeVerified = {
  cryptoServices: [FakeCryptoService({ verified: true })]
};

const cloneEndorsement = (): Record<string, unknown> =>
  structuredClone(sampleEndorsementCredential);

describe('obv3p0EndorsementRecognizer', () => {
  it('exposes a stable id and human-readable name', () => {
    expect(obv3p0EndorsementRecognizer.id).toBe('obv3p0.endorsement');
    expect(obv3p0EndorsementRecognizer.name).toBe(
      'Open Badges 3.0 Endorsement'
    );
  });

  describe('applies()', () => {
    it('is true for an OB v3 EndorsementCredential', () => {
      expect(
        obv3p0EndorsementRecognizer.applies(sampleEndorsementCredential, ctx)
      ).toBe(true);
    });

    it('is false for an OB v3 OpenBadgeCredential', () => {
      expect(
        obv3p0EndorsementRecognizer.applies(sampleAchievementCredential, ctx)
      ).toBe(false);
    });

    it('is false for a credential without the OB 3.0 context', () => {
      const cred = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiableCredential', 'EndorsementCredential']
      };
      expect(obv3p0EndorsementRecognizer.applies(cred, ctx)).toBe(false);
    });
  });

  describe('parse()', () => {
    it('recognizes a spec-conforming endorsement', () => {
      const result = obv3p0EndorsementRecognizer.parse(
        sampleEndorsementCredential
      );
      expect(result.status).toBe('recognized');
      if (result.status === 'recognized') {
        expect(result.profile).toBe('obv3p0.endorsement');
        const normalized = result.normalized as { id: string };
        expect(normalized.id).toBe(
          (sampleEndorsementCredential as { id: string }).id
        );
      }
    });

    it('reports malformed (with /name instance pointer) when name is missing', () => {
      const cred = cloneEndorsement();
      delete cred.name;

      const result = parseObv3p0EndorsementCredential(cred);
      expect(result.status).toBe('malformed');
      if (result.status === 'malformed') {
        expect(result.profile).toBe('obv3p0.endorsement');
        const nameProblem = result.problems.find(p => p.instance === '/name');
        expect(nameProblem, JSON.stringify(result.problems)).toBeDefined();
      }
    });

    it('parses a VCDM v1 endorsement that carries issuanceDate', () => {
      const cred = cloneEndorsement();
      cred['@context'] = [
        'https://www.w3.org/2018/credentials/v1',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
      ];
      delete cred.validFrom;
      cred.issuanceDate = '2024-01-01T00:00:00Z';

      const result = parseObv3p0EndorsementCredential(cred);
      expect(result.status, JSON.stringify(result)).toBe('recognized');
    });

    it('rejects a VCDM v2 endorsement missing validFrom', () => {
      const cred = cloneEndorsement();
      delete cred.validFrom;

      const result = parseObv3p0EndorsementCredential(cred);
      expect(result.status).toBe('malformed');
      if (result.status === 'malformed') {
        const validFromProblem = result.problems.find(
          p => p.instance === '/validFrom'
        );
        expect(validFromProblem, JSON.stringify(result.problems)).toBeDefined();
      }
    });

    it('rejects an EndorsementSubject missing the required id', () => {
      const cred = cloneEndorsement();
      const cs = cred.credentialSubject as Record<string, unknown>;
      delete cs.id;

      const result = parseObv3p0EndorsementCredential(cred);
      expect(result.status).toBe('malformed');
      if (result.status === 'malformed') {
        const idProblem = result.problems.find(
          p => p.instance === '/credentialSubject/id'
        );
        expect(idProblem, JSON.stringify(result.problems)).toBeDefined();
      }
    });
  });

  describe('end-to-end via createVerifier', () => {
    it('surfaces normalizedVerifiableCredential and recognizedProfile for an endorsement', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        recognizers: [obv3p0EndorsementRecognizer]
      });
      const result = await verifier.verifyCredential({
        credential: cloneEndorsement()
      });

      expect(result.recognizedProfile).toBe('obv3p0.endorsement');
      expect(result.normalizedVerifiableCredential).toBeTypeOf('object');
    });

    it('does not recognize an endorsement when only the openbadge recognizer is configured', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        recognizers: [obv3p0Recognizer]
      });
      const result = await verifier.verifyCredential({
        credential: cloneEndorsement()
      });

      expect(result.recognizedProfile).toBe(undefined);
      expect(result.normalizedVerifiableCredential).toBe(undefined);
    });

    it('selects the endorsement recognizer when both are configured', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        recognizers: [obv3p0Recognizer, obv3p0EndorsementRecognizer]
      });
      const result = await verifier.verifyCredential({
        credential: cloneEndorsement()
      });

      expect(result.recognizedProfile).toBe('obv3p0.endorsement');
    });

    it('emits openbadges.applies skip when openBadgesSuite is queued against an endorsement', async () => {
      const verifier = createVerifier({
        ...fakeVerified,
        recognizers: [obv3p0EndorsementRecognizer]
      });
      const result = await verifier.verifyCredential({
        credential: cloneEndorsement(),
        additionalSuites: [openBadgesSuite]
      });

      const obSuiteResults = result.results.filter(
        r => r.suite === 'openbadges'
      );
      expect(obSuiteResults).toHaveLength(1);
      expect(obSuiteResults[0].check).toBe('openbadges.applies');
      expect(obSuiteResults[0].outcome.status).toBe('skipped');
    });
  });
});
