import { describe, it, expect, vi } from 'vitest';
import { runSuites } from '../../src/run-suites.js';
import { defaultCryptoServices } from '../../src/default-services.js';
import { proofSuite } from '../../src/suites/proof/index.js';
import { signatureCheck } from '../../src/suites/proof/signature-check.js';
import { validityPeriodCheck } from '../../src/suites/proof/validity-period-check.js';
import { ProblemTypes } from '../../src/problem-types.js';
import type { ProblemDetail } from '../../src/types/problem-detail.js';
import { FakeTimeService } from '../../src/services/time-service/fake-time-service.js';
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

      expect(results.map(r => r.id)).toEqual([
        'cryptographic.proof.signature',
        'cryptographic.proof.validity-period'
      ]);
      expect(results[0].outcome.status).toBe('success');
      if (results[0].outcome.status === 'success') {
        expect(results[0].outcome.message).toBe('Fake verification passed.');
      }
      expect(results[1].outcome.status).toBe('success');
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
      expect(results[0].id).toBe('cryptographic.proof.signature');
      expect(results[0].outcome.status).toBe('success');
    });

    it('skips an unsigned presentation when context allows it', async () => {
      const service = FakeCryptoService({ verified: true });
      const verifySpy = vi.spyOn(service, 'verifyPresentation');
      const context = buildTestContext({
        cryptoServices: [service],
        unsignedPresentation: true
      });
      const presentation = PresentationFactory();
      delete (presentation as { proof?: unknown }).proof;

      const subject = createPresentationSubject(presentation);
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome).toEqual({
        status: 'skipped',
        reason:
          'Presentation is unsigned; accepted because unsignedPresentation is set.'
      });
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('fails an unsigned presentation when context does not allow it', async () => {
      const service = FakeCryptoService({ verified: true });
      const verifySpy = vi.spyOn(service, 'verifyPresentation');
      const context = buildTestContext({ cryptoServices: [service] });
      const presentation = PresentationFactory();
      delete (presentation as { proof?: unknown }).proof;

      const subject = createPresentationSubject(presentation);
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].title).toBe(
          'Presentation Not Signed'
        );
      }
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('fails when domain is set without challenge', async () => {
      const service = FakeCryptoService({ verified: true });
      const verifySpy = vi.spyOn(service, 'verifyPresentation');
      const context = buildTestContext({
        cryptoServices: [service],
        domain: 'verifier.example'
      });

      const subject = createPresentationSubject(PresentationFactory());
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].title).toBe('Challenge Required');
      }
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('passes challenge and domain to the crypto service', async () => {
      const service = FakeCryptoService({ verified: true });
      const verifySpy = vi.spyOn(service, 'verifyPresentation');
      const context = buildTestContext({
        cryptoServices: [service],
        challenge: 'factory-challenge',
        domain: 'verifier.example'
      });

      const subject = createPresentationSubject(PresentationFactory());
      const results = await runSuites([proofSuite], subject, context);

      expect(results[0].outcome.status).toBe('success');
      expect(verifySpy).toHaveBeenCalledWith(
        subject.verifiablePresentation,
        expect.objectContaining({
          challenge: 'factory-challenge',
          domain: 'verifier.example'
        })
      );
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

      expect(results).toHaveLength(2);
      expect(results[1].outcome).toEqual({
        status: 'skipped',
        reason: 'Not run: proof.signature failed'
      });
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

  describe('validityPeriodCheck', () => {
    const NOW = '2026-10-20T12:00:00.000Z';
    // `buildTestContext` takes no clock, so set it here. FakeTimeService
    // advances 1 ms per read, so start 1 ms early to read exactly `iso`.
    const contextAt = (iso: string = NOW) => ({
      ...buildTestContext(),
      timeService: FakeTimeService({ baseDateMs: Date.parse(iso) - 1 })
    });
    const run = (
      version: 'v1' | 'v2',
      dates: Record<string, unknown>,
      at?: string
    ) =>
      validityPeriodCheck.execute(
        createCredentialSubject(
          CredentialFactory({ version, credential: dates })
        ),
        contextAt(at)
      );
    const problemTypes = (outcome: Awaited<ReturnType<typeof run>>) =>
      outcome.status === 'failure' ? outcome.problems.map(p => p.type) : [];

    it('is fatal, does not halt, and runs after proof.signature', () => {
      expect(validityPeriodCheck.fatal).toBe(true);
      expect(validityPeriodCheck.halts).toBe(false);
      expect(proofSuite.checks.map(c => c.id)).toEqual([
        'proof.signature',
        'proof.validity-period'
      ]);
    });

    it('reports a v2 credential past validUntil as expired', async () => {
      const outcome = await run('v2', {
        validFrom: '2020-01-01T00:00:00Z',
        validUntil: '2021-01-01T00:00:00Z'
      });

      expect(problemTypes(outcome)).toEqual([ProblemTypes.CREDENTIAL_EXPIRED]);
      if (outcome.status === 'failure') {
        expect(outcome.problems[0].detail).toBe(
          `The current date time (${NOW}) is after "validUntil" (2021-01-01T00:00:00Z).`
        );
      }
    });

    it('reports a v2 credential before validFrom as not yet valid', async () => {
      const outcome = await run('v2', { validFrom: '2099-01-01T00:00:00Z' });

      expect(problemTypes(outcome)).toEqual([
        ProblemTypes.CREDENTIAL_NOT_YET_VALID
      ]);
    });

    it('reports a v1 credential past expirationDate as expired', async () => {
      const outcome = await run('v1', {
        issuanceDate: '2020-01-01T00:00:00Z',
        expirationDate: '2021-01-01T00:00:00Z'
      });

      expect(problemTypes(outcome)).toEqual([ProblemTypes.CREDENTIAL_EXPIRED]);
    });

    it('reports a v1 credential before issuanceDate as not yet valid', async () => {
      const outcome = await run('v1', { issuanceDate: '2099-01-01T00:00:00Z' });

      expect(problemTypes(outcome)).toEqual([
        ProblemTypes.CREDENTIAL_NOT_YET_VALID
      ]);
    });

    it('reports both faults when both dates are wrong', async () => {
      const outcome = await run('v2', {
        validFrom: '2099-01-01T00:00:00Z',
        validUntil: '2021-01-01T00:00:00Z'
      });

      expect(problemTypes(outcome)).toEqual([
        ProblemTypes.CREDENTIAL_EXPIRED,
        ProblemTypes.CREDENTIAL_NOT_YET_VALID
      ]);
    });

    it('treats the end date itself as still valid, as vc does', async () => {
      const outcome = await run(
        'v2',
        { validFrom: '2020-01-01T00:00:00Z', validUntil: NOW },
        NOW
      );

      expect(outcome).toEqual({
        status: 'success',
        message: 'The credential is within its validity period.'
      });
    });

    it('ignores v2 date names on a v1 credential, as vc does', async () => {
      const outcome = await run('v1', {
        issuanceDate: '2020-01-01T00:00:00Z',
        validUntil: '2021-01-01T00:00:00Z'
      });

      expect(outcome.status).toBe('success');
    });

    it('passes a credential that states no validity period', async () => {
      const credential = CredentialFactory({ version: 'v2' });
      delete credential.validFrom;
      const outcome = await validityPeriodCheck.execute(
        createCredentialSubject(credential),
        contextAt()
      );

      expect(outcome).toEqual({
        status: 'success',
        message: 'No validity period stated.'
      });
    });
  });

  describe('signatureCheck — validity-date rejections', () => {
    const expired = {
      type: ProblemTypes.CREDENTIAL_EXPIRED,
      title: 'Credential Expired',
      detail: 'Credential has expired.'
    };
    const run = (problems: ProblemDetail[]) =>
      signatureCheck.execute(
        createCredentialSubject(CredentialFactory({ version: 'v2' })),
        buildTestContext({
          cryptoServices: [FakeCryptoService({ verified: false, problems })]
        })
      );

    it('reads a rejection made only of date problems as a verified signature', async () => {
      const outcome = await run([expired]);

      expect(outcome).toEqual({
        status: 'success',
        message: 'Signature verified successfully.'
      });
    });

    it('keeps a rejection that mixes a date problem with a signature problem as a failure', async () => {
      const invalid = {
        type: ProblemTypes.INVALID_SIGNATURE,
        title: 'Invalid Signature',
        detail: 'Invalid signature.'
      };
      const outcome = await run([expired, invalid]);

      expect(outcome).toEqual({
        status: 'failure',
        problems: [expired, invalid]
      });
    });
  });
});
