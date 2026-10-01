/**
 * Unit coverage for `dispatchProofVerification` — the shared
 * crypto-service dispatch. Cases stay small and inline; spies are
 * hand-rolled CryptoService doubles so we can assert which method
 * ran and that later services are never invoked.
 */

import { describe, it, expect } from 'vitest';
import { dispatchProofVerification } from '../src/crypto-dispatch.js';
import type {
  CryptoResult,
  CryptoService,
  CryptoVerifyOptions
} from '../src/types/crypto-service.js';
import type { ProblemDetail } from '../src/types/problem-detail.js';
import type { VerificationSubject } from '../src/types/subject.js';
import { FakeCryptoService } from './factories/services/fake-crypto-service.js';

const dummyOptions: CryptoVerifyOptions = {
  documentLoader: async (url: string) => ({
    documentUrl: url,
    document: {}
  })
};

const credentialSubject: VerificationSubject = {
  verifiableCredential: { id: 'urn:test:credential' }
};

const presentationSubject: VerificationSubject = {
  verifiablePresentation: { id: 'urn:test:presentation' }
};

const rejectedProblems: ProblemDetail[] = [
  {
    type: 'urn:test:rejected',
    title: 'Rejected',
    detail: 'fixture rejection'
  }
];

function trackingService(opts: {
  label: string;
  canVerify: boolean;
  calls: string[];
  result?: CryptoResult;
}): CryptoService {
  const result: CryptoResult = opts.result ?? {
    verified: true,
    message: opts.label
  };
  return {
    canVerify: () => opts.canVerify,
    verifyCredential: async () => {
      opts.calls.push(`${opts.label}:credential`);
      return result;
    },
    verifyPresentation: async () => {
      opts.calls.push(`${opts.label}:presentation`);
      return result;
    }
  };
}

describe('dispatchProofVerification', () => {
  it('returns no-service when services is undefined', async () => {
    const dispatched = await dispatchProofVerification({
      services: undefined,
      subject: credentialSubject,
      options: dummyOptions
    });
    expect(dispatched).toEqual({ kind: 'no-service' });
  });

  it('returns no-service when services is empty', async () => {
    const dispatched = await dispatchProofVerification({
      services: [],
      subject: credentialSubject,
      options: dummyOptions
    });
    expect(dispatched).toEqual({ kind: 'no-service' });
  });

  it('returns no-service when no service reports canVerify', async () => {
    const dispatched = await dispatchProofVerification({
      services: [FakeCryptoService({ canVerify: () => false })],
      subject: credentialSubject,
      options: dummyOptions
    });
    expect(dispatched).toEqual({ kind: 'no-service' });
  });

  it('invokes the first matching service and never the second', async () => {
    const calls: string[] = [];
    const first = trackingService({
      label: 'first',
      canVerify: true,
      calls
    });
    const second = trackingService({
      label: 'second',
      canVerify: true,
      calls
    });

    const dispatched = await dispatchProofVerification({
      services: [first, second],
      subject: credentialSubject,
      options: dummyOptions
    });

    expect(dispatched).toEqual({ kind: 'verified', message: 'first' });
    expect(calls).toEqual(['first:credential']);
  });

  it('skips a non-matching service and uses the next one that matches', async () => {
    const calls: string[] = [];
    const skipped = trackingService({
      label: 'skipped',
      canVerify: false,
      calls
    });
    const matched = trackingService({
      label: 'matched',
      canVerify: true,
      calls
    });

    const dispatched = await dispatchProofVerification({
      services: [skipped, matched],
      subject: credentialSubject,
      options: dummyOptions
    });

    expect(dispatched).toEqual({ kind: 'verified', message: 'matched' });
    expect(calls).toEqual(['matched:credential']);
  });

  it('returns verified and passes the message through', async () => {
    const dispatched = await dispatchProofVerification({
      services: [
        FakeCryptoService({ verified: true, message: 'ok from fixture' })
      ],
      subject: credentialSubject,
      options: dummyOptions
    });
    expect(dispatched).toEqual({
      kind: 'verified',
      message: 'ok from fixture'
    });
  });

  it('returns rejected and passes problems through unchanged', async () => {
    const dispatched = await dispatchProofVerification({
      services: [
        FakeCryptoService({ verified: false, problems: rejectedProblems })
      ],
      subject: credentialSubject,
      options: dummyOptions
    });
    expect(dispatched).toEqual({
      kind: 'rejected',
      problems: rejectedProblems
    });
    if (dispatched.kind === 'rejected') {
      expect(dispatched.problems).toBe(rejectedProblems);
    }
  });

  it('returns threw carrying the original error', async () => {
    const original = new Error('boom from fixture');
    const dispatched = await dispatchProofVerification({
      services: [FakeCryptoService({ throwInVerify: original })],
      subject: credentialSubject,
      options: dummyOptions
    });
    expect(dispatched).toEqual({ kind: 'threw', error: original });
  });

  it('routes a presentation subject to verifyPresentation', async () => {
    const calls: string[] = [];
    const service = trackingService({
      label: 'svc',
      canVerify: true,
      calls
    });

    const dispatched = await dispatchProofVerification({
      services: [service],
      subject: presentationSubject,
      options: dummyOptions
    });

    expect(dispatched.kind).toBe('verified');
    expect(calls).toEqual(['svc:presentation']);
  });

  it('routes a credential subject to verifyCredential', async () => {
    const calls: string[] = [];
    const service = trackingService({
      label: 'svc',
      canVerify: true,
      calls
    });

    const dispatched = await dispatchProofVerification({
      services: [service],
      subject: credentialSubject,
      options: dummyOptions
    });

    expect(dispatched.kind).toBe('verified');
    expect(calls).toEqual(['svc:credential']);
  });

  it('prefers verifyPresentation when the subject carries both', async () => {
    const calls: string[] = [];
    const service = trackingService({
      label: 'svc',
      canVerify: true,
      calls
    });

    const dispatched = await dispatchProofVerification({
      services: [service],
      subject: {
        verifiableCredential: { id: 'urn:test:credential' },
        verifiablePresentation: { id: 'urn:test:presentation' }
      },
      options: dummyOptions
    });

    expect(dispatched.kind).toBe('verified');
    expect(calls).toEqual(['svc:presentation']);
  });

  it('returns no-service when the subject carries neither document', async () => {
    const dispatched = await dispatchProofVerification({
      services: [FakeCryptoService()],
      subject: {},
      options: dummyOptions
    });
    expect(dispatched).toEqual({ kind: 'no-service' });
  });
});
