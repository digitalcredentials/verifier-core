import { describe, it, expect } from 'vitest';
import { runSuites } from '../src/run-suites.js';
import { VerificationSuite, VerificationCheck } from '../src/types/check.js';
import { VerificationContext } from '../src/types/context.js';
import { VerificationSubject } from '../src/types/subject.js';

describe('runSuites', () => {
  // Mock context for testing
  const mockContext: VerificationContext = {
    documentLoader: async () => ({}),
    fetchJson: async () => ({}),
    cryptoServices: [],
    challenge: null,
    unsignedPresentation: false
  };

  // Helper to create a mock check that returns a predetermined outcome
  const createMockCheck = (
    id: string,
    outcome: 'success' | 'failure' | 'skipped',
    options: {
      fatal?: boolean;
      appliesTo?: Array<'verifiableCredential' | 'verifiablePresentation'>;
    } = {}
  ): VerificationCheck => ({
    id,
    name: `Mock check ${id}`,
    description: `Test check that returns ${outcome}`,
    fatal: options.fatal ?? false,
    appliesTo: options.appliesTo,
    execute: async () => {
      if (outcome === 'success') {
        return { status: 'success', message: 'Check passed' };
      }
      if (outcome === 'failure') {
        return {
          status: 'failure',
          problems: [
            {
              type: 'urn:test:failure',
              title: 'Test Failure',
              detail: 'Check failed'
            }
          ]
        };
      }
      return { status: 'skipped', reason: 'Check skipped' };
    }
  });

  describe('all success', () => {
    it('returns all results when all checks pass', async () => {
      const suite1: VerificationSuite = {
        id: 'suite1',
        name: 'Suite 1',
        checks: [
          createMockCheck('check1', 'success'),
          createMockCheck('check2', 'success')
        ]
      };

      const suite2: VerificationSuite = {
        id: 'suite2',
        name: 'Suite 2',
        checks: [
          createMockCheck('check3', 'success'),
          createMockCheck('check4', 'success')
        ]
      };

      const subject: VerificationSubject = { verifiableCredential: {} };
      const results = await runSuites([suite1, suite2], subject, mockContext);

      expect(results).toHaveLength(4);
      expect(results.every(r => r.outcome.status === 'success')).toBe(true);
      expect(results.map(r => r.check)).toEqual([
        'check1',
        'check2',
        'check3',
        'check4'
      ]);
    });
  });

  describe('fatal stops suite', () => {
    it('stops remaining checks in a suite when a fatal check fails', async () => {
      const suite1: VerificationSuite = {
        id: 'suite1',
        name: 'Suite 1',
        checks: [
          createMockCheck('fatal-check', 'failure', { fatal: true }),
          createMockCheck('check2', 'success') // should not run
        ]
      };

      const suite2: VerificationSuite = {
        id: 'suite2',
        name: 'Suite 2',
        checks: [createMockCheck('check3', 'success')] // should still run
      };

      const subject: VerificationSubject = { verifiableCredential: {} };
      const results = await runSuites([suite1, suite2], subject, mockContext);

      expect(results).toHaveLength(2);
      expect(results[0].check).toBe('fatal-check');
      expect(results[0].outcome.status).toBe('failure');
      expect(results[1].check).toBe('check3');
      expect(results[1].outcome.status).toBe('success');
    });
  });

  describe('non-fatal continues', () => {
    it('continues executing checks after a non-fatal failure', async () => {
      const suite: VerificationSuite = {
        id: 'suite1',
        name: 'Suite 1',
        checks: [
          createMockCheck('check1', 'failure', { fatal: false }),
          createMockCheck('check2', 'success')
        ]
      };

      const subject: VerificationSubject = { verifiableCredential: {} };
      const results = await runSuites([suite], subject, mockContext);

      expect(results).toHaveLength(2);
      expect(results[0].check).toBe('check1');
      expect(results[0].outcome.status).toBe('failure');
      expect(results[1].check).toBe('check2');
      expect(results[1].outcome.status).toBe('success');
    });
  });

  describe('appliesTo filtering', () => {
    it('skips checks that do not apply to the subject type', async () => {
      const suite: VerificationSuite = {
        id: 'suite1',
        name: 'Suite 1',
        checks: [
          createMockCheck('vc-check', 'success', {
            appliesTo: ['verifiableCredential']
          }),
          createMockCheck('vp-check', 'success', {
            appliesTo: ['verifiablePresentation']
          }),
          createMockCheck('both-check', 'success', {
            appliesTo: ['verifiableCredential', 'verifiablePresentation']
          })
        ]
      };

      // Subject only has verifiableCredential
      const subject: VerificationSubject = { verifiableCredential: {} };
      const results = await runSuites([suite], subject, mockContext);

      expect(results).toHaveLength(2);
      expect(results.map(r => r.check)).toEqual(['vc-check', 'both-check']);
    });

    it('runs checks with no appliesTo restriction for any subject', async () => {
      const suite: VerificationSuite = {
        id: 'suite1',
        name: 'Suite 1',
        checks: [createMockCheck('unrestricted-check', 'success')]
      };

      const subject: VerificationSubject = { verifiablePresentation: {} };
      const results = await runSuites([suite], subject, mockContext);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('unrestricted-check');
    });
  });

  describe('mixed outcomes', () => {
    it('handles mixed success/failure/skipped across suites', async () => {
      const suite1: VerificationSuite = {
        id: 'suite1',
        name: 'Suite 1',
        checks: [
          createMockCheck('check1', 'success'),
          createMockCheck('check2', 'failure', { fatal: false }),
          createMockCheck('check3', 'skipped')
        ]
      };

      const suite2: VerificationSuite = {
        id: 'suite2',
        name: 'Suite 2',
        checks: [createMockCheck('check4', 'success')]
      };

      const subject: VerificationSubject = { verifiableCredential: {} };
      const results = await runSuites([suite1, suite2], subject, mockContext);

      expect(results).toHaveLength(4);
      expect(results[0].outcome.status).toBe('success');
      expect(results[1].outcome.status).toBe('failure');
      expect(results[2].outcome.status).toBe('skipped');
      expect(results[3].outcome.status).toBe('success');
    });
  });

  describe('empty suites', () => {
    it('returns empty results when no suites provided', async () => {
      const subject: VerificationSubject = { verifiableCredential: {} };
      const results = await runSuites([], subject, mockContext);

      expect(results).toEqual([]);
    });

    it('returns empty results when suites have no checks', async () => {
      const suite: VerificationSuite = {
        id: 'empty-suite',
        name: 'Empty Suite',
        checks: []
      };

      const subject: VerificationSubject = { verifiableCredential: {} };
      const results = await runSuites([suite], subject, mockContext);

      expect(results).toEqual([]);
    });
  });

  describe('subject type matching', () => {
    it('correctly matches VP-only checks when subject has VP', async () => {
      const suite: VerificationSuite = {
        id: 'suite1',
        name: 'Suite 1',
        checks: [
          createMockCheck('vp-only', 'success', {
            appliesTo: ['verifiablePresentation']
          }),
          createMockCheck('vc-only', 'success', {
            appliesTo: ['verifiableCredential']
          })
        ]
      };

      // Subject only has verifiablePresentation
      const subject: VerificationSubject = { verifiablePresentation: {} };
      const results = await runSuites([suite], subject, mockContext);

      expect(results).toHaveLength(1);
      expect(results[0].check).toBe('vp-only');
    });
  });
});
