import { describe, it, expect } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { defaultCryptoServices } from '../../src/default-services.js';
import { proofSuite } from '../../src/suites/proof/index.js';
import { signatureCheck } from '../../src/suites/proof/signature-check.js';
import { buildTestContext } from '../factories/services/build-test-context.js';
import { VerificationSubject } from '../../src/types/subject.js';
import { CredentialFactory } from '../factories/data/credential-factory.js';
import { PresentationFactory } from '../factories/data/presentation-factory.js';
import { FakeCryptoService } from '../factories/services/fake-crypto-service.js';
import { v2WithValidStatus } from '../fixtures/v2-with-valid-status.js';

function subjectHasLinkedDataProof(subject: VerificationSubject): boolean {
  const doc = subject.verifiablePresentation ?? subject.verifiableCredential;
  if (doc === undefined || doc === null || typeof doc !== 'object') {
    return false;
  }
  const proof = (doc as Record<string, unknown>).proof;
  if (proof === undefined || proof === null) {
    return false;
  }
  if (Array.isArray(proof)) {
    return (
      proof.length > 0 && typeof proof[0] === 'object' && proof[0] !== null
    );
  }
  return typeof proof === 'object';
}

describe('Proof Verification Suite', () => {
  const createCredentialSubject = (
    credential: unknown
  ): VerificationSubject => ({
    verifiableCredential: credential
  });

  const createPresentationSubject = (
    presentation: unknown
  ): VerificationSubject => ({
    verifiablePresentation: presentation
  });

  describe('FakeCryptoService — credential', () => {
    it('returns success when service verifies', async () => {
      const context = buildTestContext({
        cryptoServices: [FakeCryptoService({ verified: true })]
      });
      const subject = createCredentialSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const results = await runSuites([proofSuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('proof.signature');
      expect(results[0].outcome.status).toBe('success');
      if (results[0].outcome.status === 'success') {
        expect(results[0].outcome.message).toBe('Fake verification passed.');
      }
    });

    it('returns failure with injected problems when service rejects', async () => {
      const problems = [
        {
          type: 'https://www.w3.org/TR/vc-data-model#INVALID_SIGNATURE',
          title: 'Invalid Signature',
          detail: 'Tampered payload'
        }
      ];
      const context = buildTestContext({
        cryptoServices: [FakeCryptoService({ verified: false, problems })]
      });
      const subject = createCredentialSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems).toEqual(problems);
      }
    });

    it('fails when no crypto service matches canVerify', async () => {
      const context = buildTestContext({
        cryptoServices: [
          FakeCryptoService({ canVerify: () => false, verified: true })
        ]
      });
      const subject = createCredentialSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].title).toBe(
          'No Applicable Crypto Service'
        );
      }
    });

    it('maps thrown errors to PROOF_VERIFICATION_ERROR', async () => {
      const context = buildTestContext({
        cryptoServices: [
          FakeCryptoService({
            throwInVerify: new Error('Crypto adapter exploded')
          })
        ]
      });
      const subject = createCredentialSubject(
        CredentialFactory({ version: 'v2', credential: {} })
      );
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#PROOF_VERIFICATION_ERROR'
        );
        expect(results[0].outcome.problems[0].detail).toContain('exploded');
      }
    });
  });

  describe('FakeCryptoService — presentation', () => {
    it('verifies presentation when service returns success', async () => {
      const context = buildTestContext({
        cryptoServices: [FakeCryptoService({ verified: true })],
        challenge: 'factory-challenge'
      });
      const presentation = PresentationFactory();
      const subject = createPresentationSubject(presentation);
      const results = await runSuites([proofSuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('proof.signature');
      expect(results[0].outcome.status).toBe('success');
    });

    it('handles unsigned presentation when context allows it', async () => {
      const context = buildTestContext({
        cryptoServices: [FakeCryptoService({ verified: true })],
        unsignedPresentation: true
      });
      const presentation = PresentationFactory();
      delete (presentation as { proof?: unknown }).proof;

      const subject = createPresentationSubject(presentation);
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('success');
    });
  });

  describe('did:web-style resolution (orchestrated failure)', () => {
    it('surfaces HTTP-style failures from the crypto service', async () => {
      const problems = [
        {
          type: 'https://www.w3.org/TR/vc-data-model#HTTP_ERROR',
          title: 'HTTP Error',
          detail: 'did:web resolution failed'
        }
      ];
      const context = buildTestContext({
        cryptoServices: [FakeCryptoService({ verified: false, problems })]
      });
      const cred = CredentialFactory({
        version: 'v2',
        credential: {
          issuer: {
            id: 'did:web:nonexistent-domain-12345.example.com',
            name: 'X'
          }
        }
      });
      const subject = createCredentialSubject(cred);
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#HTTP_ERROR'
        );
      }
    });
  });

  describe('JSON-LD / classification path via fake adapter', () => {
    it('returns structured failure for parsing-style errors', async () => {
      const problems = [
        {
          type: 'https://www.w3.org/TR/vc-data-model#PARSING_ERROR',
          title: 'JSON-LD Validation Error',
          detail: 'Invalid JSON-LD document'
        }
      ];
      const context = buildTestContext({
        cryptoServices: [FakeCryptoService({ verified: false, problems })]
      });
      const cred = CredentialFactory({
        version: 'v2',
        credential: { '@context': 'https://www.w3.org/ns/credentials/v2' }
      });
      const subject = createCredentialSubject(cred);
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          'https://www.w3.org/TR/vc-data-model#PARSING_ERROR'
        );
      }
    });
  });

  describe('no subject', () => {
    it('skips check when neither credential nor presentation provided', async () => {
      const context = buildTestContext({
        cryptoServices: [FakeCryptoService({ verified: true })]
      });
      const subject: VerificationSubject = {};
      const results = await runSuites([proofSuite], subject, context);

      expect(results).toHaveLength(0);
    });

    it('fails when credential has no proof and adapter requires one', async () => {
      const context = buildTestContext({
        cryptoServices: [
          FakeCryptoService({
            canVerify: subjectHasLinkedDataProof,
            verified: true
          })
        ]
      });
      const cred = CredentialFactory({ version: 'v2', credential: {} });
      delete (cred as { proof?: unknown }).proof;

      const subject = createCredentialSubject(cred);
      const results = await runSuites([proofSuite], subject, context);

      expect(results).toHaveLength(1);
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].title).toBe(
          'No Applicable Crypto Service'
        );
      }
    });
  });

  describe('signatureCheck', () => {
    it('succeeds for a VC with credentialStatus (real crypto; vc lib checkStatus requirement satisfied)', async () => {
      const ctx = buildTestContext({ cryptoServices: defaultCryptoServices() });
      const outcome = await signatureCheck.execute(
        { verifiableCredential: v2WithValidStatus },
        ctx
      );
      expect(outcome.status).toBe('success');
      expect(JSON.stringify(outcome)).not.toContain('checkStatus');
    });
  });
});
