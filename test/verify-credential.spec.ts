import { describe, it, expect } from 'vitest';
import { verifyCredential } from '../src/index.js';
import {
  defaultDocumentLoaderFor,
  defaultHttpGetService
} from '../src/default-services.js';
import { createVerifier } from '../src/verifier.js';
import { openBadgesSchemaSuite } from '../src/openbadges/index.js';
import { runSuites } from '../src/run-suites.js';
import { defaultSuites } from '../src/default-suites.js';
import { VerificationCheck, CheckOutcome } from '../src/types/check.js';
import {
  BitstringStatusEntry,
  CredentialFactory,
  DEFAULT_TEST_ISSUER_DID,
  StatusListCredentialFactory
} from './factories/data/index.js';
import { buildTestContext } from './factories/services/build-test-context.js';
import { FakeCryptoService } from './factories/services/fake-crypto-service.js';
import { FakeDocumentLoader } from './factories/services/fake-document-loader.js';
import { v1Expired } from './fixtures/v1-expired.js';
import { v2Expired } from './fixtures/v2-expired.js';
import { v2WithValidStatus } from './fixtures/v2-with-valid-status.js';

// ests in this file ensure spec completion by inspecting every check in
// `result.results`. Use a verbose verifier to enable these checks; folded-mode
// coverage lives in `describe('folded vs verbose shape', …)` below.
const fakeVerified = {
  cryptoServices: [FakeCryptoService({ verified: true })],
  verbose: true
};

describe('verifyCredential', () => {
  describe('basic structure validation', () => {
    it('verifies a valid v1 credential', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({ credential, ...fakeVerified });

      expect(result.verified).toBe(true);
      expect(result.verifiableCredential).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
      expect(result.results.length).toBeGreaterThan(0);

      const coreResults = result.results.filter(r => r.suite === 'core');
      expect(coreResults.length).toBeGreaterThan(0);
    });

    it('verifies a valid v2 credential', async () => {
      const credential = CredentialFactory({ credential: {} });
      const result = await verifyCredential({ credential, ...fakeVerified });

      expect(result.verified).toBe(true);
      expect(result.verifiableCredential).toBeDefined();
      expect(result.results).toBeInstanceOf(Array);
    });

    it('returns verified: false for credential with missing context', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const badCredential = { ...credential };
      delete (badCredential as { '@context'?: unknown })['@context'];

      const result = await verifyCredential({
        credential: badCredential,
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].suite).toBe('parsing');
      expect(result.results[0].outcome.status).toBe('failure');
    });

    it('returns verified: false for credential with missing type', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const badCredential = { ...credential };
      delete (badCredential as { type?: unknown }).type;

      const result = await verifyCredential({
        credential: badCredential,
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('parsing errors', () => {
    it('returns verified: false and parse error for invalid JSON', async () => {
      const result = await verifyCredential({
        credential: 'not a credential',
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].suite).toBe('parsing');
      expect(result.results[0].check).toBe('parsing.envelope');
      expect(result.results[0].outcome.status).toBe('failure');
    });

    it('returns verified: false for empty object', async () => {
      const result = await verifyCredential({
        credential: {},
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
      expect(result.results[0].outcome.status).toBe('failure');
    });

    it('returns verified: false for null', async () => {
      const result = await verifyCredential({
        credential: null,
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
    });

    it('returns verified: false for array', async () => {
      const result = await verifyCredential({
        credential: [],
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
    });
  });

  describe('signature verification', () => {
    it('verifies credential when crypto service accepts proof', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({ credential, ...fakeVerified });

      const proofResults = result.results.filter(r => r.suite === 'proof');
      expect(proofResults.length).toBeGreaterThan(0);

      const sigCheck = proofResults.find(r => r.check === 'proof.signature');
      if (sigCheck) {
        expect(sigCheck.outcome.status).toBe('success');
      }
    });

    it('fails when crypto service rejects proof', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({
        credential,
        cryptoServices: [FakeCryptoService({ verified: false })]
      });

      expect(result.verified).toBe(false);
      const sigCheck = result.results.find(r => r.check === 'proof.signature');
      expect(sigCheck?.outcome.status).toBe('failure');
    });
  });

  describe('expired credentials', () => {
    it('detects expired v1 credentials', async () => {
      const result = await verifyCredential({ credential: v1Expired });

      expect(result.verified).toBe(false);
    });

    it('detects expired v2 credentials', async () => {
      const result = await verifyCredential({ credential: v2Expired });

      expect(result.verified).toBe(false);
    });
  });

  describe('additionalSuites', () => {
    it('includes custom suite results', async () => {
      const customCheck: VerificationCheck = {
        id: 'custom.test-check',
        name: 'Test Check',
        description: 'A custom test check',
        fatal: false,
        appliesTo: ['verifiableCredential'],
        execute: async (): Promise<CheckOutcome> => ({
          status: 'success',
          message: 'Custom check passed!'
        })
      };

      const customSuite = {
        id: 'custom',
        name: 'Custom Suite',
        description: 'Custom test suite',
        checks: [customCheck]
      };

      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({
        credential,
        additionalSuites: [customSuite],
        ...fakeVerified
      });

      const customResult = result.results.find(r => r.suite === 'custom');
      expect(customResult).toBeDefined();
      expect(customResult?.outcome.status).toBe('success');
      if (customResult?.outcome.status === 'success') {
        expect(customResult.outcome.message).toBe('Custom check passed!');
      }
    });

    it('custom fatal suite can fail verification', async () => {
      const customCheck: VerificationCheck = {
        id: 'custom.fatal-check',
        name: 'Fatal Check',
        description: 'A custom fatal check that always fails',
        fatal: true,
        appliesTo: ['verifiableCredential'],
        execute: async (): Promise<CheckOutcome> => ({
          status: 'failure',
          problems: [
            {
              type: 'https://www.w3.org/TR/vc-data-model#CUSTOM_ERROR',
              title: 'Custom Fatal Error',
              detail: 'This custom check always fails'
            }
          ]
        })
      };

      const customSuite = {
        id: 'custom',
        name: 'Custom Suite',
        description: 'Custom test suite',
        checks: [customCheck]
      };

      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({
        credential,
        additionalSuites: [customSuite],
        ...fakeVerified
      });

      expect(result.verified).toBe(false);
      const customResult = result.results.find(r => r.suite === 'custom');
      expect(customResult?.outcome.status).toBe('failure');
    });
  });

  describe('result structure', () => {
    it('returns credential in result', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({ credential, ...fakeVerified });

      expect(result.verifiableCredential).toBeDefined();
      expect(result.verifiableCredential.id).toBe(credential.id);
      expect(result.verifiableCredential.type).toEqual(credential.type);
    });

    it('results contain suite and check IDs', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({ credential, ...fakeVerified });

      expect(result.results.length).toBeGreaterThan(0);
      for (const checkResult of result.results) {
        expect(checkResult.suite).toBeTypeOf('string');
        expect(checkResult.check).toBeTypeOf('string');
        const st = checkResult.outcome.status;
        if (st !== 'success' && st !== 'failure' && st !== 'skipped') {
          throw new Error(
            `Unexpected outcome status for ${checkResult.suite}/${checkResult.check}: ${String(st)}`
          );
        }
      }
    });
  });

  describe('timing flag (presence/absence)', () => {
    it('omits timing on every result by default', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({ credential, ...fakeVerified });

      expect(result.timing).toBe(undefined);
      for (const c of result.results) {
        expect(c.timing).toBe(undefined);
      }
      for (const s of result.summary) {
        expect(s.timing).toBe(undefined);
      }
    });

    it('populates timing on every result when timing: true', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({
        credential,
        ...fakeVerified,
        timing: true
      });

      expect(result.timing).toBeDefined();
      expect(result.timing!.startedAt).toBeTypeOf('string');
      expect(result.timing!.endedAt).toBeTypeOf('string');
      expect(result.timing!.durationMs).toBeGreaterThanOrEqual(0);

      expect(result.results.length).toBeGreaterThan(0);
      for (const c of result.results) {
        expect(c.timing, `check ${c.id} missing timing`).toBeDefined();
        expect(c.timing!.startedAt).toBeTypeOf('string');
        expect(c.timing!.endedAt).toBeTypeOf('string');
        expect(c.timing!.durationMs).toBeGreaterThanOrEqual(0);
      }
      for (const s of result.summary) {
        expect(s.timing, `suite ${s.id} missing timing`).toBeDefined();
      }
    });

    it('populates timing even when parsing fails', async () => {
      const result = await verifyCredential({
        credential: 'not a credential',
        timing: true
      });

      expect(result.timing).toBeDefined();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].timing).toBeDefined();
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0].timing).toBeDefined();
    });
  });

  describe('OBv3 credentials', () => {
    it('does not run OpenBadges checks by default (opt-in)', async () => {
      const credential = CredentialFactory({ credential: {} });
      const result = await verifyCredential({ credential, ...fakeVerified });

      const obResults = result.results.filter(
        r => r.suite === 'schema.obv3' || r.suite.startsWith('openbadges')
      );
      expect(obResults).toHaveLength(0);
    });

    it('processes OpenBadgeCredential when openBadgesSchemaSuite is opted in', async () => {
      const credential = CredentialFactory({ credential: {} });
      const result = await verifyCredential({
        credential,
        additionalSuites: [openBadgesSchemaSuite],
        ...fakeVerified
      });

      expect(result.verified).toBeTypeOf('boolean');
      expect(result.results).toBeInstanceOf(Array);

      const obSchemaResults = result.results.filter(
        r => r.suite === 'openbadges.schema'
      );
      expect(obSchemaResults.length).toBeGreaterThan(0);
    });
  });

  // P-E regression: revoked credentials must fail with the failure
  // sourced from the status suite, not the proof suite. We exercise this
  // through the same code path createVerifier uses (defaultSuites +
  // runSuites + hasFatalFailures). FakeCryptoService verifies both the
  // credential proof and the unsigned factory status-list credential so
  // the contract being pinned is the aggregation, not real cryptography.
  describe('revoked credential sourcing (P-E)', () => {
    it('flips verified to false via status.bitstring (not proof.signature) when status list marks the index revoked', async () => {
      const listUrl = 'https://factory.test/status/list-revoked-pe';
      const slCred = await StatusListCredentialFactory({
        id: listUrl,
        issuer: DEFAULT_TEST_ISSUER_DID,
        revokedIndexes: [3],
        listLength: 32
      });
      const documentLoader = FakeDocumentLoader({ [listUrl]: slCred });
      const ctx = buildTestContext({
        documentLoader,
        cryptoServices: [FakeCryptoService({ verified: true })]
      });

      const credential = CredentialFactory({
        version: 'v2',
        credential: {
          credentialStatus: BitstringStatusEntry({
            statusListCredential: listUrl,
            statusListIndex: '3'
          })
        }
      });

      const results = await runSuites(
        defaultSuites,
        { verifiableCredential: credential },
        ctx
      );

      const verified = !results.some(
        r => r.fatal && r.outcome.status === 'failure'
      );
      expect(verified).toBe(false);

      const statusResult = results.find(r => r.check === 'status.bitstring');
      expect(statusResult, 'status.bitstring result present').toBeDefined();
      expect(statusResult?.outcome.status).toBe('failure');
      expect(statusResult?.fatal).toBe(true);

      const proofResult = results.find(r => r.check === 'proof.signature');
      expect(proofResult?.outcome.status).toBe('success');
    });
  });

  describe('issuer variations', () => {
    it('handles string issuer ID', async () => {
      const credential = CredentialFactory({
        version: 'v1',
        credential: { issuer: DEFAULT_TEST_ISSUER_DID }
      });
      const result = await verifyCredential({ credential, ...fakeVerified });

      expect(result.verified).toBeTypeOf('boolean');
      expect(result.verifiableCredential.issuer).toBeTypeOf('string');
    });

    it('handles object issuer', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({ credential, ...fakeVerified });

      expect(result.verified).toBeTypeOf('boolean');
      expect(result.verifiableCredential.issuer).toBeTypeOf('object');
    });
  });

  describe('folded vs verbose shape', () => {
    const cryptoOnly = {
      cryptoServices: [FakeCryptoService({ verified: true })]
    };

    it('default (verbose unset): folds successes; results[] has only failures + explicit skips', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({ credential, ...cryptoOnly });

      expect(result.verified).toBe(true);
      expect(result.results).toEqual([]);
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary.every(s => s.verified)).toBe(true);
      const ids = new Set(result.summary.map(s => s.id));
      expect(ids).toContain('cryptographic.core');
      expect(ids).toContain('cryptographic.proof');
    });

    it('verbose: true: results[] carries every check, summary[] identical to folded mode', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const folded = await verifyCredential({ credential, ...cryptoOnly });
      const verbose = await verifyCredential({
        credential,
        ...cryptoOnly,
        verbose: true
      });

      expect(verbose.results.length).toBeGreaterThan(0);
      expect(verbose.results.every(r => r.id !== undefined)).toBe(true);
      expect(verbose.summary.map(s => s.id)).toEqual(
        folded.summary.map(s => s.id)
      );
      expect(verbose.summary.map(s => s.status)).toEqual(
        folded.summary.map(s => s.status)
      );
      expect(verbose.verified).toBe(folded.verified);
    });

    it('failure path (folded): results[] surfaces just the proof failure; summary marks proof as failure', async () => {
      const credential = CredentialFactory({ version: 'v1', credential: {} });
      const result = await verifyCredential({
        credential,
        cryptoServices: [FakeCryptoService({ verified: false })]
      });

      expect(result.verified).toBe(false);
      expect(result.results.every(r => r.outcome.status === 'failure')).toBe(
        true
      );
      const proofSummary = result.summary.find(s => s.suite === 'proof');
      expect(['failure', 'mixed']).toContain(proofSummary?.status);
      expect(proofSummary?.verified).toBe(false);
    });

    it('parse error: result has one summary entry tagged cryptographic.parsing', async () => {
      const result = await verifyCredential({ credential: 'bogus' });

      expect(result.verified).toBe(false);
      expect(result.summary).toHaveLength(1);
      expect(result.summary[0].id).toBe('cryptographic.parsing');
      expect(result.summary[0].status).toBe('failure');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('cryptographic.parsing.envelope');
    });
  });

  describe('revocable VC — Phase B proof/status decoupling (createVerifier)', () => {
    const STATUS_LIST_URL =
      'https://raw.githubusercontent.com/digitalcredentials/verifier-core/refs/heads/main/src/test-fixtures/status/e5WK8CbZ1GjycuPombrj';

    /**
     * Same status list VC as the hosted `v2WithValidStatus` fixture references,
     * as a parsed object. Serving it via {@link FakeDocumentLoader} avoids
     * GitHub raw `text/plain` bodies (unparsed JSON string) breaking the
     * bitstring status path in CI.
     */
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

    it('end-to-end: BitstringStatusListEntry VC completes proof + status suites without checkStatus TypeError', async () => {
      const documentLoader = FakeDocumentLoader(
        { [STATUS_LIST_URL]: statusListE5Fixture },
        { fallback: defaultDocumentLoaderFor(defaultHttpGetService()) }
      );
      const verifier = createVerifier({ verbose: true, documentLoader });
      const result = await verifier.verifyCredential({
        credential: v2WithValidStatus
      });

      expect(result.verified).toBe(true);
      expect(JSON.stringify(result)).not.toContain('checkStatus');

      const proofSummary = result.summary.find(
        s => s.id === 'cryptographic.proof'
      );
      const statusSummary = result.summary.find(
        s => s.id === 'cryptographic.status'
      );
      expect(proofSummary?.status).toBe('success');
      expect(statusSummary?.status).toBe('success');

      const sigCheck = result.results.find(r => r.check === 'proof.signature');
      expect(sigCheck?.outcome.status).toBe('success');
    });
  });
});
