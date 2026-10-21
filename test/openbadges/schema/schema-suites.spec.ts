import { describe, it, expect } from 'vitest';
import { createVerifier } from '../../../src/verifier.js';
import {
  openBadgesSuite,
  openBadgesSchemaSuite
} from '../../../src/openbadges/schema/index.js';
import { openBadgesSemanticSuite } from '../../../src/openbadges/index.js';
import type { VerificationSuite } from '../../../src/types/check.js';
import { FakeCryptoService } from '../../factories/services/fake-crypto-service.js';
import { FakeHttpGetService } from '../../factories/services/fake-http-get-service.js';
import { sampleEndorsementCredential } from '../fixtures/sample-endorsement-credential.js';

/**
 * The endorsement fixture carries no proof, and a missing proof is a
 * fatal `core.proof-exists` failure that halts every later suite, so
 * add a placeholder that `FakeCryptoService({ verified: true })` accepts.
 */
const signedEndorsement = (): Record<string, unknown> => ({
  ...structuredClone(sampleEndorsementCredential),
  proof: {
    type: 'Ed25519Signature2020',
    created: '2024-01-01T00:00:00Z',
    verificationMethod: 'did:example:issuer#z6MkPlaceholder',
    proofPurpose: 'assertionMethod',
    proofValue:
      'z000000000000000000000000000000000000000000000000000000000000000000'
  }
});

async function verifyEndorsement(suite: VerificationSuite) {
  const verifier = createVerifier({
    cryptoServices: [FakeCryptoService({ verified: true })],
    httpGetService: FakeHttpGetService({})
  });
  const result = await verifier.verifyCredential({
    credential: signedEndorsement(),
    additionalSuites: [suite]
  });
  return result.results.filter(r => r.suite === suite.id);
}

describe('schema suites on an EndorsementCredential', () => {
  it.each([openBadgesSchemaSuite, openBadgesSuite])(
    '$id validates it against E.2.1.7 EndorsementCredential',
    async suite => {
      const results = await verifyEndorsement(suite);
      const byId = new Map(
        results.map(r => [r.id.replace(`semantic.${suite.id}.`, ''), r])
      );

      const schema = byId.get('schema.obv3.json')?.outcome;
      expect(schema?.status).toBe('success');
      if (schema?.status === 'success') {
        expect(schema.message).toContain('E.2.1.7 EndorsementCredential');
      }
      expect(byId.get('schema.obv3.declared')?.outcome.status).toBe('skipped');
      expect(byId.has('applies')).toBe(false);
    }
  );

  it('openBadgesSuite skips its semantic checks for an endorsement, failing none', async () => {
    const results = await verifyEndorsement(openBadgesSuite);
    const semantic = results.filter(r =>
      openBadgesSemanticSuite.checks.some(c => r.id.endsWith(`.${c.id}`))
    );

    expect(semantic).toHaveLength(openBadgesSemanticSuite.checks.length);
    for (const r of semantic) {
      expect(r.outcome.status, r.id).toBe('skipped');
    }
  });
});
