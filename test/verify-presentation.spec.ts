import { describe, it, expect } from 'vitest';
import { verifyPresentation } from '../src/index.js';
import {
  defaultCryptoServices,
  defaultDocumentLoaderFor,
  defaultHttpGetService
} from '../src/default-services.js';
import { createVerifier } from '../src/verifier.js';
import { flattenPresentationResults } from '../src/flatten-presentation-results.js';
import {
  CredentialFactory,
  DEFAULT_TEST_ISSUER_DID
} from './factories/data/credential-factory.js';
import { PresentationFactory } from './factories/data/presentation-factory.js';
import { FakeCryptoService } from './factories/services/fake-crypto-service.js';
import { FakeDocumentLoader } from './factories/services/fake-document-loader.js';
import { v2WithValidStatus } from './fixtures/v2-with-valid-status.js';

// Existing tests in this file inspect every check in
// `result.results` / `result.presentationResults`. Use a verbose
// verifier to keep those assertions valid; folded-mode coverage
// lives in `describe('folded vs verbose shape', …)` below.
const fakeVerified = {
  cryptoServices: [FakeCryptoService({ verified: true })],
  verbose: true
};

describe('verifyPresentation', () => {
  describe('basic presentation validation', () => {
    it('verifies a presentation with single credential', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result.verified).toBeTypeOf('boolean');
      expect(result.presentationResults).toBeInstanceOf(Array);
      expect(result.credentialResults).toBeInstanceOf(Array);
      expect(result.credentialResults).toHaveLength(1);
      expect(result.verifiablePresentation).toBeDefined();
      expect(result.verifiablePresentation.type).toContain(
        'VerifiablePresentation'
      );
      expect(flattenPresentationResults(result)).toBeInstanceOf(Array);
    });

    it('verifies a presentation with multiple credentials', async () => {
      const presentation = PresentationFactory({
        verifiableCredential: [
          CredentialFactory({ version: 'v1', credential: {} }),
          CredentialFactory({ credential: {} })
        ]
      });
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result.credentialResults).toHaveLength(2);

      const cred1Result = result.credentialResults[0];
      const cred2Result = result.credentialResults[1];

      expect(cred1Result).toBeDefined();
      expect(cred2Result).toBeDefined();
      expect(cred1Result.results).toBeInstanceOf(Array);
      expect(cred2Result.results).toBeInstanceOf(Array);
    });

    it('returns verified: false for empty presentation', async () => {
      const presentation = PresentationFactory({ verifiableCredential: [] });
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result.presentationResults).toBeInstanceOf(Array);
      expect(result.credentialResults).toHaveLength(0);
    });

    it('returns verified: false for presentation without credentials', async () => {
      const presentation = {
        '@context': ['https://www.w3.org/ns/credentials/v2'],
        type: ['VerifiablePresentation']
      };
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result.presentationResults).toBeInstanceOf(Array);
      expect(result.credentialResults).toHaveLength(0);
    });

    it('accepts a holder object with an id', async () => {
      const presentation = PresentationFactory({
        holder: { id: DEFAULT_TEST_ISSUER_DID }
      });
      expect(presentation.holder).toEqual({ id: DEFAULT_TEST_ISSUER_DID });

      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result.presentationResults.length).toBeGreaterThan(0);
      for (const r of result.presentationResults) {
        expect(r.check).not.toBe('parsing.envelope');
        expect(r.id).not.toMatch(/parsing\.envelope$/);
      }
    });
  });

  describe('timing flag (presence/absence)', () => {
    it('omits timing on every result by default', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result.timing).toBe(undefined);
      for (const c of result.presentationResults) {
        expect(c.timing).toBe(undefined);
      }
      for (const cr of result.credentialResults) {
        expect(cr.timing).toBe(undefined);
      }
    });

    it('populates timing on every result when timing: true', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified,
        timing: true
      });

      expect(result.timing).toBeDefined();
      for (const c of result.presentationResults) {
        expect(
          c.timing,
          `presentation check ${c.id} missing timing`
        ).toBeDefined();
      }
      for (const s of result.summary) {
        expect(
          s.timing,
          `presentation suite ${s.id} missing timing`
        ).toBeDefined();
      }
      for (const cr of result.credentialResults) {
        expect(cr.timing, 'credential result missing timing').toBeDefined();
      }
    });

    it('top-level timing inclusively wraps recursive credential calls', async () => {
      const presentation = PresentationFactory({
        verifiableCredential: [
          CredentialFactory({ version: 'v1', credential: {} }),
          CredentialFactory({ credential: {} })
        ]
      });
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified,
        timing: true
      });

      expect(result.timing).toBeDefined();
      expect(result.credentialResults).toHaveLength(2);
      const topDuration = result.timing!.durationMs;
      for (const cr of result.credentialResults) {
        expect(cr.timing).toBeDefined();
        expect(
          topDuration,
          'top-level durationMs should include each embedded credential'
        ).toBeGreaterThanOrEqual(cr.timing!.durationMs);
      }
    });
  });

  describe('parsing errors', () => {
    it('returns verified: false for invalid presentation JSON', async () => {
      const result = await verifyPresentation({
        presentation: 'not a presentation',
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
      expect(result.presentationResults).toHaveLength(1);
      expect(result.presentationResults[0].suite).toBe('parsing');
    });

    it('returns verified: false for empty object', async () => {
      const result = await verifyPresentation({
        presentation: {},
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
    });

    it('returns verified: false for null', async () => {
      const result = await verifyPresentation({
        presentation: null,
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('credential verification within presentation', () => {
    it('verifies all embedded credentials', async () => {
      const presentation = PresentationFactory({
        verifiableCredential: [
          CredentialFactory({ version: 'v1', credential: {} }),
          CredentialFactory({ credential: {} })
        ]
      });
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      for (const credResult of result.credentialResults) {
        expect(credResult.verified).toBeTypeOf('boolean');
        expect(credResult.verifiableCredential).toBeDefined();
        expect(credResult.results).toBeInstanceOf(Array);
      }
    });

    it('returns verified: false if any credential fails', async () => {
      const good = CredentialFactory({ version: 'v1', credential: {} });
      const badCredential = { ...good };
      delete (badCredential as { '@context'?: unknown })['@context'];

      const presentation = PresentationFactory({
        verifiableCredential: [good, badCredential]
      });
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
      expect(result.presentationResults[0]?.outcome.status).toBe('failure');
    });

    it('separates credential results correctly', async () => {
      const id1 = 'urn:uuid:11111111-1111-1111-1111-111111111111';
      const id2 = 'urn:uuid:22222222-2222-2222-2222-222222222222';
      const c1 = CredentialFactory({ version: 'v1', credential: { id: id1 } });
      const c2 = CredentialFactory({ credential: { id: id2 } });
      const presentation = PresentationFactory({
        verifiableCredential: [c1, c2]
      });
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result.credentialResults).toHaveLength(2);

      const ids = result.credentialResults.map(
        cr => cr.verifiableCredential.id
      );
      expect(ids).toContain(id1);
      expect(ids).toContain(id2);
    });
  });

  describe('flattenPresentationResults aggregation', () => {
    it('includes both presentation and credential results', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      const presentationSuiteIds = result.presentationResults.map(r => r.suite);
      const flat = flattenPresentationResults(result);
      const allSuiteIds = flat.map(e => e.result.suite);

      for (const suiteId of presentationSuiteIds) {
        expect(allSuiteIds).toContain(suiteId);
      }
    });

    it('flattens all credential results via flattenPresentationResults', async () => {
      const presentation = PresentationFactory({
        verifiableCredential: [
          CredentialFactory({ version: 'v1', credential: {} }),
          CredentialFactory({ credential: {} })
        ]
      });
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(flattenPresentationResults(result).length).toBeGreaterThan(
        result.presentationResults.length
      );
    });
  });

  describe('challenge handling', () => {
    it('accepts challenge option', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        challenge: 'factory-challenge',
        ...fakeVerified
      });

      expect(result.presentationResults).toBeInstanceOf(Array);
    });

    it('accepts null challenge', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        challenge: null,
        ...fakeVerified
      });

      expect(result.presentationResults).toBeInstanceOf(Array);
    });
  });

  describe('unsigned presentation', () => {
    it('accepts unsignedPresentation option', async () => {
      const presentation = PresentationFactory();
      delete (presentation as { proof?: unknown }).proof;
      const result = await verifyPresentation({
        presentation,
        unsignedPresentation: true,
        ...fakeVerified
      });

      expect(result.presentationResults).toBeInstanceOf(Array);
    });
  });

  describe('additionalSuites', () => {
    it('includes custom suites in presentation verification', async () => {
      const customCheck = {
        id: 'custom.vp-check',
        name: 'VP Custom Check',
        description: 'A custom check for presentations',
        fatal: false,
        appliesTo: ['verifiablePresentation'] as const,
        execute: async () => ({
          status: 'success' as const,
          message: 'Custom VP check passed!'
        })
      };

      const customSuite = {
        id: 'custom',
        name: 'Custom Suite',
        description: 'Custom test suite',
        checks: [customCheck]
      };

      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        additionalSuites: [customSuite],
        ...fakeVerified
      });

      const customResult = result.presentationResults.find(
        r => r.suite === 'custom'
      );
      expect(customResult).toBeDefined();
    });
  });

  describe('result structure', () => {
    it('has correct top-level structure', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      expect(result).toHaveProperty('verified');
      expect(result).toHaveProperty('verifiablePresentation');
      expect(result).toHaveProperty('presentationResults');
      expect(result).toHaveProperty('credentialResults');

      expect(typeof result.verified).toBe('boolean');
      expect(Array.isArray(result.presentationResults)).toBe(true);
      expect(Array.isArray(result.credentialResults)).toBe(true);
      expect(flattenPresentationResults(result)).toBeInstanceOf(Array);
    });

    it('each credential result has correct structure', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        ...fakeVerified
      });

      for (const credResult of result.credentialResults) {
        expect(credResult).toHaveProperty('verified');
        expect(credResult).toHaveProperty('verifiableCredential');
        expect(credResult).toHaveProperty('results');

        expect(typeof credResult.verified).toBe('boolean');
        expect(credResult.verifiableCredential).toBeTypeOf('object');
        expect(Array.isArray(credResult.results)).toBe(true);
      }
    });
  });

  describe('folded vs verbose shape', () => {
    const cryptoOnly = {
      cryptoServices: [FakeCryptoService({ verified: true })]
    };

    it('default folded happy path: every credential summary green; results[] empty', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({ presentation, ...cryptoOnly });

      expect(result.verified).toBe(true);
      expect(result.presentationResults).toEqual([]);
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary.every(s => s.verified)).toBe(true);

      expect(result.credentialResults).toHaveLength(1);
      const cred = result.credentialResults[0];
      expect(cred.results).toEqual([]);
      expect(cred.summary.length).toBeGreaterThan(0);
      expect(cred.summary.every(s => s.verified)).toBe(true);
    });

    it('verbose: presentation propagates verbose to embedded credentials', async () => {
      const presentation = PresentationFactory();
      const result = await verifyPresentation({
        presentation,
        ...cryptoOnly,
        verbose: true
      });

      expect(result.presentationResults.length).toBeGreaterThan(0);
      const cred = result.credentialResults[0];
      expect(cred.results.length).toBeGreaterThan(0);
      expect(cred.results.every(r => r.id !== undefined)).toBe(true);
    });
  });

  describe('mixed-result fixture (UI use case)', () => {
    const cryptoOnly = {
      cryptoServices: [FakeCryptoService({ verified: true })]
    };

    function buildMixedResultPresentation(): Record<string, unknown> {
      const goodId = 'urn:uuid:11111111-1111-1111-1111-111111111111';
      const badId = 'urn:uuid:22222222-2222-2222-2222-222222222222';
      const good = CredentialFactory({ credential: { id: goodId } });
      const bad = CredentialFactory({ credential: { id: badId } });
      delete (bad as { proof?: unknown }).proof;
      return PresentationFactory({ verifiableCredential: [good, bad] });
    }

    it('reports overall verified=false with 1 of 2 credentials verified', async () => {
      const presentation = buildMixedResultPresentation();
      const result = await verifyPresentation({ presentation, ...cryptoOnly });

      expect(result.verified).toBe(false);
      expect(result.credentialResults).toHaveLength(2);
      expect(result.credentialResults.filter(c => c.verified)).toHaveLength(1);
    });

    it('VP-level summary entries are all green when the VP envelope is fine', async () => {
      const presentation = buildMixedResultPresentation();
      const result = await verifyPresentation({ presentation, ...cryptoOnly });

      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary.every(s => s.verified)).toBe(true);
    });

    it('passing credential summary is all green; failing credential surfaces a failure entry', async () => {
      const presentation = buildMixedResultPresentation();
      const result = await verifyPresentation({ presentation, ...cryptoOnly });

      const passing = result.credentialResults.find(c => c.verified);
      const failing = result.credentialResults.find(c => !c.verified);
      expect(passing).toBeDefined();
      expect(failing).toBeDefined();

      expect(passing!.summary.every(s => s.verified)).toBe(true);
      expect(passing!.results).toEqual([]);

      const failureSummaries = failing!.summary.filter(s => !s.verified);
      expect(failureSummaries.length).toBeGreaterThan(0);
      expect(failing!.results.length).toBeGreaterThan(0);
      expect(failing!.results.every(r => r.outcome.status === 'failure')).toBe(
        true
      );
    });

    it('failure detail rows can be located by id prefix from a failing summary entry', async () => {
      const presentation = buildMixedResultPresentation();
      const result = await verifyPresentation({ presentation, ...cryptoOnly });

      const failing = result.credentialResults.find(c => !c.verified)!;
      const failingSummary = failing.summary.find(s => !s.verified)!;
      const detail = failing.results.filter(r =>
        r.id?.startsWith(failingSummary.id + '.')
      );
      expect(detail.length).toBeGreaterThan(0);
      expect(detail.every(r => r.outcome.status === 'failure')).toBe(true);
    });

    it('verbose mode preserves all checks; summary[] identical to folded mode', async () => {
      const presentation = buildMixedResultPresentation();
      const folded = await verifyPresentation({ presentation, ...cryptoOnly });
      const verbose = await verifyPresentation({
        presentation,
        ...cryptoOnly,
        verbose: true
      });

      expect(verbose.verified).toBe(folded.verified);
      expect(verbose.summary.map(s => s.id)).toEqual(
        folded.summary.map(s => s.id)
      );
      expect(verbose.summary.map(s => s.status)).toEqual(
        folded.summary.map(s => s.status)
      );

      for (let i = 0; i < verbose.credentialResults.length; i++) {
        const v = verbose.credentialResults[i];
        const f = folded.credentialResults[i];
        expect(v.summary.map(s => s.id)).toEqual(f.summary.map(s => s.id));
        expect(v.summary.map(s => s.status)).toEqual(
          f.summary.map(s => s.status)
        );
        expect(v.results.length).toBeGreaterThanOrEqual(f.results.length);
      }
    });
  });

  describe('VP with revocable embedded VC — Phase B proof/status decoupling', () => {
    const STATUS_LIST_URL =
      'https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5WK8CbZ1GjycuPombrj';

    /** Same object as `verify-credential.spec.ts` Phase B block — parsed list VC for `v2WithValidStatus`. */
    const statusListE5Fixture = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: 'https://testing.dcconsortium.org/status/e5WK8CbZ1GjycuPombrj',
      type: ['VerifiableCredential', 'BitstringStatusListCredential'],
      credentialSubject: {
        id: 'https://testing.dcconsortium.org/status/e5WK8CbZ1GjycuPombrj#list',
        type: 'BitstringStatusList',
        encodedList:
          'uH4sIAAAAAAAAA-3BMQEAAAwCoGUx6aLbwgvIHwAAAAAAAAAAAAAAwFwBZnztF9QwAAA',
        statusPurpose: 'revocation'
      },
      issuer: 'did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q',
      validFrom: '2025-01-09T15:20:02.183Z',
      proof: {
        type: 'Ed25519Signature2020',
        created: '2025-01-09T15:20:02Z',
        verificationMethod:
          'did:key:z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q#z6MknNQD1WHLGGraFi6zcbGevuAgkVfdyCdtZnQTGWVVvR5Q',
        proofPurpose: 'assertionMethod',
        proofValue:
          'z4WFodWdHXGieqNtWYK2448A7qZdhMkxyqjVuMqifdanFYXXAqPT8xatjncxjDsXT6fskz8pC8TLBmEhnd7BC7Tqb'
      }
    };

    it('VP proof rollup succeeds; embedded VC proof + status succeed; no checkStatus TypeError in tree', async () => {
      const presentation = PresentationFactory({
        verifiableCredential: [v2WithValidStatus]
      });
      const documentLoader = FakeDocumentLoader(
        { [STATUS_LIST_URL]: statusListE5Fixture },
        { fallback: defaultDocumentLoaderFor(defaultHttpGetService()) }
      );
      const verifier = createVerifier({
        verbose: true,
        documentLoader,
        cryptoServices: [
          FakeCryptoService({
            canVerify: subject => subject.verifiablePresentation != null
          }),
          ...defaultCryptoServices()
        ]
      });

      const result = await verifier.verifyPresentation({
        presentation,
        challenge: 'factory-challenge'
      });

      expect(result.verified).toBe(true);
      expect(JSON.stringify(result)).not.toContain('checkStatus');

      const presProofSummary = result.summary.find(
        s => s.id === 'cryptographic.proof'
      );
      expect(presProofSummary?.status).toBe('success');

      const presSig = result.presentationResults.find(
        r => r.check === 'proof.signature'
      );
      expect(presSig?.outcome.status).toBe('success');

      expect(result.credentialResults).toHaveLength(1);
      expect(result.credentialResults[0].verified).toBe(true);

      const credSummary = result.credentialResults[0].summary;
      const credProof = credSummary.find(s => s.id === 'cryptographic.proof');
      const credStatus = credSummary.find(s => s.id === 'cryptographic.status');
      expect(credProof?.status).toBe('success');
      expect(credStatus?.status).toBe('success');

      const credSig = result.credentialResults[0].results.find(
        r => r.check === 'proof.signature'
      );
      expect(credSig?.outcome.status).toBe('success');
    });
  });
});
