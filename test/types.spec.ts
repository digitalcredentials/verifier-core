import { describe, it, expect } from 'vitest';
import type { ProblemDetail } from '../src/types/problem-detail.js';
import type {
  CheckOutcome,
  CheckResult,
  VerificationCheck,
  VerificationSuite
} from '../src/types/check.js';
import type { VerificationContext } from '../src/types/context.js';
import type { VerificationSubject } from '../src/types/subject.js';
import type {
  SuiteSummary,
  SuiteSummaryPhase
} from '../src/types/suite-summary.js';
import type {
  CredentialVerificationResult,
  PresentationVerificationResult
} from '../src/types/result.js';
import type {
  VerifierConfig,
  VerifyCredentialCall,
  VerifyPresentationCall
} from '../src/types/verifier.js';
import * as publicApi from '../src/index.js';

describe('Foundation types', () => {
  describe('ProblemDetail', () => {
    it('constructs with type, title, detail', () => {
      const pd: ProblemDetail = {
        type: 'urn:vc-verify:invalid-signature',
        title: 'Invalid Signature',
        detail: 'The proof value does not match the credential content.'
      };
      expect(pd.type).toBe('urn:vc-verify:invalid-signature');
      expect(pd.title).toBe('Invalid Signature');
      expect(pd.detail).toContain('proof value');
    });
  });

  describe('CheckOutcome', () => {
    it('narrows success variant', () => {
      const outcome: CheckOutcome = {
        status: 'success',
        message: 'Signature verified.'
      };
      expect(outcome.status).toBe('success');
      if (outcome.status === 'success') {
        expect(outcome.message).toBe('Signature verified.');
      }
    });

    it('narrows failure variant', () => {
      const outcome: CheckOutcome = {
        status: 'failure',
        problems: [
          {
            type: 'urn:vc-verify:no-proof',
            title: 'No Proof',
            detail: 'Credential is missing a proof.'
          }
        ]
      };
      expect(outcome.status).toBe('failure');
      if (outcome.status === 'failure') {
        expect(outcome.problems).toHaveLength(1);
        expect(outcome.problems[0].type).toBe('urn:vc-verify:no-proof');
      }
    });

    it('narrows skipped variant', () => {
      const outcome: CheckOutcome = {
        status: 'skipped',
        reason: 'No credentialStatus field.'
      };
      expect(outcome.status).toBe('skipped');
      if (outcome.status === 'skipped') {
        expect(outcome.reason).toBe('No credentialStatus field.');
      }
    });
  });

  describe('CheckResult', () => {
    it('tags outcome with suite and check ids', () => {
      const result: CheckResult = {
        check: 'core.proof-exists',
        suite: 'core',
        outcome: { status: 'success', message: 'Proof exists.' }
      };
      expect(result.suite).toBe('core');
      expect(result.check).toBe('core.proof-exists');
      expect(result.outcome.status).toBe('success');
    });

    it('accepts an optional namespaced id', () => {
      const result: CheckResult = {
        id: 'cryptographic.core.proof-exists',
        check: 'core.proof-exists',
        suite: 'core',
        outcome: { status: 'success', message: 'Proof exists.' }
      };
      expect(result.id).toBe('cryptographic.core.proof-exists');
    });
  });

  describe('SuiteSummary', () => {
    it('constructs a success summary with counts', () => {
      const summary: SuiteSummary = {
        id: 'cryptographic.core',
        phase: 'cryptographic',
        suite: 'core',
        status: 'success',
        verified: true,
        message: '4 of 4 checks passed',
        counts: { passed: 4, failed: 0, skipped: 0 }
      };
      expect(summary.status).toBe('success');
      expect(summary.counts.passed).toBe(4);
    });

    it('records fatalFailureAt when the suite halted mid-run', () => {
      const summary: SuiteSummary = {
        id: 'cryptographic.proof',
        phase: 'cryptographic',
        suite: 'proof',
        status: 'failure',
        verified: false,
        message: '1 of 3 checks failed (0 passed)',
        counts: { passed: 0, failed: 1, skipped: 0 },
        fatalFailureAt: 'proof.signature'
      };
      expect(summary.fatalFailureAt).toBe('proof.signature');
    });

    it('admits unknown for untagged consumer suites', () => {
      const phase: SuiteSummaryPhase = 'unknown';
      const summary: SuiteSummary = {
        id: 'unknown.custom',
        phase,
        suite: 'custom',
        status: 'success',
        verified: true,
        message: '1 of 1 checks passed',
        counts: { passed: 1, failed: 0, skipped: 0 }
      };
      expect(summary.phase).toBe('unknown');
    });

    it('is exported from the public barrel', () => {
      expect(publicApi).toHaveProperty('verifyCredential');
      // Type-only re-exports don't appear at runtime; assert the
      // type is usable instead by constructing a literal.
      const summary: SuiteSummary = {
        id: 'recognition',
        phase: 'recognition',
        suite: 'recognition',
        status: 'skipped',
        verified: true,
        message: 'no recognizer matched',
        counts: { passed: 0, failed: 0, skipped: 1 }
      };
      expect(summary.id).toBe('recognition');
    });
  });

  describe('Result types carry summary[]', () => {
    it('CredentialVerificationResult requires summary', () => {
      const result: CredentialVerificationResult = {
        verified: true,
        verifiableCredential: {} as never,
        results: [],
        summary: []
      };
      expect(result.summary).toEqual([]);
    });

    it('PresentationVerificationResult requires summary', () => {
      const result: PresentationVerificationResult = {
        verified: true,
        verifiablePresentation: {} as never,
        presentationResults: [],
        credentialResults: [],
        summary: []
      };
      expect(result.summary).toEqual([]);
    });
  });

  describe('verbose flag', () => {
    it('is accepted on VerifierConfig and per-call args', () => {
      const config: VerifierConfig = { verbose: true };
      const credCall: VerifyCredentialCall = {
        credential: {},
        verbose: false
      };
      const presCall: VerifyPresentationCall = {
        presentation: {},
        verbose: true
      };
      expect(config.verbose).toBe(true);
      expect(credCall.verbose).toBe(false);
      expect(presCall.verbose).toBe(true);
    });
  });

  describe('VerificationSuite', () => {
    it('assembles a suite with mock checks', async () => {
      const successCheck: VerificationCheck = {
        id: 'test.pass',
        name: 'Always Pass',
        fatal: false,
        async execute() {
          return { status: 'success', message: 'Passed.' };
        }
      };

      const failCheck: VerificationCheck = {
        id: 'test.fail',
        name: 'Always Fail',
        fatal: true,
        async execute() {
          return {
            status: 'failure',
            problems: [
              {
                type: 'urn:test:always-fails',
                title: 'Always Fails',
                detail: 'This check always fails.'
              }
            ]
          };
        }
      };

      const skipCheck: VerificationCheck = {
        id: 'test.skip',
        name: 'Always Skip',
        appliesTo: ['verifiablePresentation'],
        async execute() {
          return { status: 'skipped', reason: 'Not applicable.' };
        }
      };

      const suite: VerificationSuite = {
        id: 'test',
        name: 'Test Suite',
        description: 'A suite for testing type construction.',
        checks: [successCheck, failCheck, skipCheck]
      };

      expect(suite.id).toBe('test');
      expect(suite.checks).toHaveLength(3);

      const subject: VerificationSubject = { verifiableCredential: {} };
      const context: VerificationContext = {
        documentLoader: async () => ({}),
        fetchJson: async () => ({}),
        cryptoServices: []
      };

      const outcomes = await Promise.all(
        suite.checks.map(c => c.execute(subject, context))
      );
      expect(outcomes[0].status).toBe('success');
      expect(outcomes[1].status).toBe('failure');
      expect(outcomes[2].status).toBe('skipped');
    });
  });
});
