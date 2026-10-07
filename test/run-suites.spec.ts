import { describe, it, expect, vi } from 'vitest';
import { runSuites } from '../src/run-suites.js';
import { ProblemTypes } from '../src/problem-types.js';
import { FakeTimeService } from '../src/services/time-service/fake-time-service.js';
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

  // A check that records whether it executed.
  const spyCheck = (
    id: string,
    options: { fatal?: boolean } = {}
  ): VerificationCheck & { execute: ReturnType<typeof vi.fn> } => ({
    id,
    name: `Spy check ${id}`,
    fatal: options.fatal ?? false,
    execute: vi.fn(async () => ({
      status: 'success' as const,
      message: 'Check passed'
    }))
  });

  // A check whose execute throws.
  const throwingCheck = (
    id: string,
    options: { fatal?: boolean; error?: unknown } = {}
  ): VerificationCheck => ({
    id,
    name: `Throwing check ${id}`,
    fatal: options.fatal ?? false,
    execute: async () => {
      throw options.error ?? new Error('boom');
    }
  });

  const notRun = (haltedBy: string) => ({
    status: 'skipped',
    reason: `Not run: ${haltedBy} failed`
  });

  const subject: VerificationSubject = { verifiableCredential: {} };

  describe('fatal stops suite', () => {
    it('reports remaining checks as not run when a fatal check fails', async () => {
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
        checks: [createMockCheck('check3', 'success')] // should not run either
      };

      const results = await runSuites([suite1, suite2], subject, mockContext);

      expect(results).toHaveLength(3);
      expect(results[0].check).toBe('fatal-check');
      expect(results[0].outcome.status).toBe('failure');
      expect(results[1].check).toBe('check2');
      expect(results[1].suite).toBe('suite1');
      expect(results[1].outcome).toEqual({
        status: 'skipped',
        reason: 'Not run: fatal-check failed'
      });
      expect(results[2].check).toBe('check3');
      expect(results[2].suite).toBe('suite2');
      expect(results[2].outcome).toEqual({
        status: 'skipped',
        reason: 'Not run: fatal-check failed'
      });
    });
  });

  describe('halt after fatal', () => {
    it('reports every applicable check in a later suite as not run, without executing it', async () => {
      const b1 = spyCheck('b.one', { fatal: true });
      const b2 = spyCheck('b.two');
      const suiteA: VerificationSuite = {
        id: 'a',
        name: 'A',
        checks: [createMockCheck('a.fatal', 'failure', { fatal: true })]
      };
      const suiteB: VerificationSuite = {
        id: 'b',
        name: 'B',
        checks: [b1, b2]
      };

      const results = await runSuites([suiteA, suiteB], subject, mockContext);

      expect(results.map(r => r.check)).toEqual(['a.fatal', 'b.one', 'b.two']);
      expect(results[1].outcome).toEqual(notRun('a.fatal'));
      expect(results[2].outcome).toEqual(notRun('a.fatal'));
      expect(results[1].fatal).toBe(true);
      expect(results[2].fatal).toBe(false);
      expect(b1.execute).not.toHaveBeenCalled();
      expect(b2.execute).not.toHaveBeenCalled();
    });

    it('keeps a later suite whose applies returns false silent', async () => {
      const b1 = spyCheck('b.one');
      const suiteA: VerificationSuite = {
        id: 'a',
        name: 'A',
        checks: [createMockCheck('a.fatal', 'failure', { fatal: true })]
      };
      const suiteB: VerificationSuite = {
        id: 'b',
        name: 'B',
        applies: () => false,
        checks: [b1]
      };

      const results = await runSuites([suiteA, suiteB], subject, mockContext);

      expect(results.map(r => r.check)).toEqual(['a.fatal']);
      expect(b1.execute).not.toHaveBeenCalled();
    });

    it('keeps the synthetic applies skip for an explicitly queued suite', async () => {
      const suiteA: VerificationSuite = {
        id: 'a',
        name: 'A',
        checks: [createMockCheck('a.fatal', 'failure', { fatal: true })]
      };
      const suiteB: VerificationSuite = {
        id: 'b',
        name: 'B',
        applies: () => false,
        checks: [spyCheck('b.one')]
      };

      const results = await runSuites([suiteA, suiteB], subject, mockContext, {
        explicitSuiteIds: new Set(['b'])
      });

      expect(results.map(r => r.check)).toEqual(['a.fatal', 'b.applies']);
      expect(results[1].outcome).toEqual({
        status: 'skipped',
        reason: 'suite predicate returned false'
      });
    });

    it('keeps a later suite excluded by phases silent', async () => {
      const suiteA: VerificationSuite = {
        id: 'a',
        name: 'A',
        phase: 'cryptographic',
        checks: [createMockCheck('a.fatal', 'failure', { fatal: true })]
      };
      const suiteB: VerificationSuite = {
        id: 'b',
        name: 'B',
        phase: 'trust',
        checks: [spyCheck('b.one')]
      };

      const results = await runSuites([suiteA, suiteB], subject, mockContext, {
        phases: ['cryptographic']
      });

      expect(results.map(r => r.check)).toEqual(['a.fatal']);
    });

    it('does not halt on a non-fatal failure', async () => {
      const b1 = spyCheck('b.one');
      const suiteA: VerificationSuite = {
        id: 'a',
        name: 'A',
        checks: [createMockCheck('a.soft', 'failure', { fatal: false })]
      };
      const suiteB: VerificationSuite = { id: 'b', name: 'B', checks: [b1] };

      const results = await runSuites([suiteA, suiteB], subject, mockContext);

      expect(results.map(r => r.outcome.status)).toEqual([
        'failure',
        'success'
      ]);
      expect(b1.execute).toHaveBeenCalledOnce();
    });

    it('emits nothing for checks filtered out by appliesTo', async () => {
      const suiteA: VerificationSuite = {
        id: 'a',
        name: 'A',
        checks: [createMockCheck('a.fatal', 'failure', { fatal: true })]
      };
      const suiteB: VerificationSuite = {
        id: 'b',
        name: 'B',
        checks: [
          createMockCheck('b.vp-only', 'success', {
            appliesTo: ['verifiablePresentation']
          }),
          createMockCheck('b.vc-only', 'success', {
            appliesTo: ['verifiableCredential']
          })
        ]
      };

      const results = await runSuites([suiteA, suiteB], subject, mockContext);

      expect(results.map(r => r.check)).toEqual(['a.fatal', 'b.vc-only']);
      expect(results[1].outcome).toEqual(notRun('a.fatal'));
    });

    it('names the first fatal failure, not a later one', async () => {
      const suiteA: VerificationSuite = {
        id: 'a',
        name: 'A',
        checks: [
          createMockCheck('a.first', 'failure', { fatal: true }),
          createMockCheck('a.second', 'failure', { fatal: true })
        ]
      };

      const results = await runSuites([suiteA], subject, mockContext);

      expect(results[1].outcome).toEqual(notRun('a.first'));
    });

    it('gives not-run rows an instantaneous timing window when timing is on', async () => {
      const suiteA: VerificationSuite = {
        id: 'a',
        name: 'A',
        checks: [
          createMockCheck('a.fatal', 'failure', { fatal: true }),
          createMockCheck('a.after', 'success')
        ]
      };

      const results = await runSuites([suiteA], subject, {
        ...mockContext,
        timing: true,
        timeService: FakeTimeService()
      });

      expect(results[1].outcome.status).toBe('skipped');
      expect(results[1].timing).toBeDefined();
      expect(results[1].timing!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('contains throws', () => {
    it('turns a throwing non-fatal execute into a CHECK_ERROR failure, and later checks run', async () => {
      const after = spyCheck('after');
      const suite: VerificationSuite = {
        id: 's',
        name: 'S',
        checks: [throwingCheck('thrower', { fatal: false }), after]
      };

      const results = await runSuites([suite], subject, mockContext);

      expect(results).toHaveLength(2);
      expect(results[0].fatal).toBe(false);
      expect(results[0].outcome).toEqual({
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.CHECK_ERROR,
            title: 'Check Error',
            detail: 'Check "thrower" threw: boom'
          }
        ]
      });
      expect(results[1].outcome.status).toBe('success');
      expect(after.execute).toHaveBeenCalledOnce();
    });

    it('stringifies a non-Error throw', async () => {
      const suite: VerificationSuite = {
        id: 's',
        name: 'S',
        checks: [throwingCheck('thrower', { error: 'plain string' })]
      };

      const results = await runSuites([suite], subject, mockContext);

      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].detail).toBe(
          'Check "thrower" threw: plain string'
        );
      }
    });

    it('turns a throwing fatal execute into a CHECK_ERROR failure, and later checks are not run', async () => {
      const after = spyCheck('after');
      const suite1: VerificationSuite = {
        id: 's1',
        name: 'S1',
        checks: [throwingCheck('thrower', { fatal: true })]
      };
      const suite2: VerificationSuite = {
        id: 's2',
        name: 'S2',
        checks: [after]
      };

      const results = await runSuites([suite1, suite2], subject, mockContext);

      expect(results).toHaveLength(2);
      expect(results[0].fatal).toBe(true);
      expect(results[0].outcome.status).toBe('failure');
      if (results[0].outcome.status === 'failure') {
        expect(results[0].outcome.problems[0].type).toBe(
          ProblemTypes.CHECK_ERROR
        );
      }
      expect(results[1].outcome).toEqual(notRun('thrower'));
      expect(after.execute).not.toHaveBeenCalled();
    });

    it('turns a throwing applies on a suite with a fatal check into a fatal applies failure, and halts', async () => {
      const inside = spyCheck('b.one', { fatal: true });
      const later = spyCheck('c.one');
      const suiteB: VerificationSuite = {
        id: 'b',
        name: 'B',
        applies: () => {
          throw new Error('predicate exploded');
        },
        checks: [inside]
      };
      const suiteC: VerificationSuite = { id: 'c', name: 'C', checks: [later] };

      const results = await runSuites([suiteB, suiteC], subject, mockContext);

      expect(results.map(r => r.check)).toEqual(['b.applies', 'c.one']);
      expect(results[0].suite).toBe('b');
      expect(results[0].fatal).toBe(true);
      expect(results[0].outcome).toEqual({
        status: 'failure',
        problems: [
          {
            type: ProblemTypes.CHECK_ERROR,
            title: 'Check Error',
            detail: 'Check "b.applies" threw: predicate exploded'
          }
        ]
      });
      expect(results[1].outcome).toEqual(notRun('b.applies'));
      expect(inside.execute).not.toHaveBeenCalled();
      expect(later.execute).not.toHaveBeenCalled();
    });

    it('turns a throwing applies on a suite with only non-fatal checks into a non-fatal failure, and does not halt', async () => {
      const inside = spyCheck('b.one');
      const later = spyCheck('c.one');
      const suiteB: VerificationSuite = {
        id: 'b',
        name: 'B',
        applies: () => {
          throw new Error('predicate exploded');
        },
        checks: [inside]
      };
      const suiteC: VerificationSuite = { id: 'c', name: 'C', checks: [later] };

      const results = await runSuites([suiteB, suiteC], subject, mockContext);

      expect(results.map(r => r.check)).toEqual(['b.applies', 'c.one']);
      expect(results[0].fatal).toBe(false);
      expect(results[0].outcome.status).toBe('failure');
      expect(results[1].outcome.status).toBe('success');
      expect(inside.execute).not.toHaveBeenCalled();
      expect(later.execute).toHaveBeenCalledOnce();
    });

    it('gives an applies-error row an instantaneous timing window when timing is on', async () => {
      const suite: VerificationSuite = {
        id: 'b',
        name: 'B',
        applies: () => {
          throw new Error('predicate exploded');
        },
        checks: [spyCheck('b.one')]
      };

      const results = await runSuites([suite], subject, {
        ...mockContext,
        timing: true,
        timeService: FakeTimeService()
      });

      expect(results[0].timing).toBeDefined();
    });

    it('resolves rather than rejecting in every throwing case', async () => {
      const suites: VerificationSuite[] = [
        {
          id: 'a',
          name: 'A',
          applies: () => {
            throw 'not an Error';
          },
          checks: [spyCheck('a.one')]
        },
        {
          id: 'b',
          name: 'B',
          checks: [
            throwingCheck('b.soft'),
            throwingCheck('b.hard', { fatal: true })
          ]
        },
        {
          id: 'c',
          name: 'C',
          applies: () => {
            throw new Error('after halt');
          },
          checks: [spyCheck('c.one', { fatal: true })]
        }
      ];

      await expect(
        runSuites(suites, subject, mockContext)
      ).resolves.toBeInstanceOf(Array);
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
