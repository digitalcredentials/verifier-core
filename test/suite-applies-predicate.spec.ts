import { describe, it, expect } from 'vitest';
import { runSuites } from '../src/run-suites.js';
import type {
  CheckOutcome,
  VerificationCheck,
  VerificationSuite
} from '../src/types/check.js';
import type { VerificationContext } from '../src/types/context.js';
import type { VerificationSubject } from '../src/types/subject.js';

const ctx: VerificationContext = {
  documentLoader: async () => ({}),
  fetchJson: async () => ({}),
  cryptoServices: [],
  challenge: null,
  unsignedPresentation: false
};

function alwaysSuccess(id: string): VerificationCheck {
  return {
    id,
    name: id,
    fatal: false,
    execute: async (): Promise<CheckOutcome> => ({
      status: 'success',
      message: `${id} ran`
    })
  };
}

describe('VerificationSuite.applies predicate', () => {
  const subject: VerificationSubject = { verifiableCredential: { foo: 1 } };

  it('runs every check when applies() returns true', async () => {
    const suite: VerificationSuite = {
      id: 'gated',
      name: 'Gated',
      applies: () => true,
      checks: [alwaysSuccess('a'), alwaysSuccess('b')]
    };

    const results = await runSuites([suite], subject, ctx);

    expect(results.map(r => r.check)).toEqual(['a', 'b']);
  });

  it('silently skips an unapplied suite when not in explicitSuiteIds', async () => {
    const skipped: VerificationSuite = {
      id: 'skip-me',
      name: 'Skip Me',
      applies: () => false,
      checks: [alwaysSuccess('x')]
    };
    const ran: VerificationSuite = {
      id: 'ran',
      name: 'Ran',
      checks: [alwaysSuccess('y')]
    };

    const results = await runSuites([skipped, ran], subject, ctx);

    expect(results.map(r => r.check)).toEqual(['y']);
  });

  it('emits a synthetic <suite-id>.applies skipped result when in explicitSuiteIds', async () => {
    const suite: VerificationSuite = {
      id: 'explicit-skip',
      name: 'Explicit Skip',
      applies: () => false,
      checks: [alwaysSuccess('inner')]
    };

    const results = await runSuites([suite], subject, ctx, {
      explicitSuiteIds: new Set(['explicit-skip'])
    });

    expect(results).toHaveLength(1);
    expect(results[0].suite).toBe('explicit-skip');
    expect(results[0].check).toBe('explicit-skip.applies');
    expect(results[0].outcome.status).toBe('skipped');
    if (results[0].outcome.status === 'skipped') {
      expect(results[0].outcome.reason).toMatch(/predicate/i);
    }
  });

  it('passes the subject and context to applies()', async () => {
    let received: {
      subject: VerificationSubject;
      context: VerificationContext;
    } | null = null;
    const suite: VerificationSuite = {
      id: 'inspect',
      name: 'Inspect',
      applies: (s, c) => {
        received = { subject: s, context: c };
        return false;
      },
      checks: [alwaysSuccess('inner')]
    };

    await runSuites([suite], subject, ctx);

    expect(received).not.toBeNull();
    expect(received!.subject).toBe(subject);
    expect(received!.context).toBe(ctx);
  });

  it('does not affect suites without an applies predicate', async () => {
    const suite: VerificationSuite = {
      id: 'no-predicate',
      name: 'No Predicate',
      checks: [alwaysSuccess('z')]
    };

    const results = await runSuites([suite], subject, ctx);

    expect(results).toHaveLength(1);
    expect(results[0].check).toBe('z');
  });
});
