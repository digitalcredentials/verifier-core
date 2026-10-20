/**
 * Unit coverage for `dispatchProofVerification` — the shared
 * crypto-service dispatch — and for `dispatchProofSetVerification`,
 * which splits a proof set into one dispatch per proof. Cases stay small and inline; spies are
 * hand-rolled CryptoService doubles so we can assert which method
 * ran and that later services are never invoked.
 */

import { describe, it, expect } from 'vitest';
import {
  dispatchProofSetVerification,
  dispatchProofVerification,
  isUnsupportedProof
} from '../src/crypto-dispatch.js';
import { ProblemTypes } from '../src/problem-types.js';
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

  it('returns threw when a service canVerify throws', async () => {
    const error = new Error('canVerify boom');
    const dispatched = await dispatchProofVerification({
      services: [
        FakeCryptoService({
          canVerify: () => {
            throw error;
          }
        })
      ],
      subject: credentialSubject,
      options: dummyOptions
    });
    expect(dispatched).toEqual({ kind: 'threw', error });
  });
});

const proofA = { id: 'urn:proof:a', type: 'Ed25519Signature2020' };
const proofB = {
  id: 'urn:proof:b',
  type: 'DataIntegrityProof',
  cryptosuite: 'eddsa-rdfc-2022'
};

const invalid: CryptoResult = {
  verified: false,
  problems: [
    {
      type: ProblemTypes.INVALID_SIGNATURE,
      title: 'Invalid Signature',
      detail: 'bad bytes'
    }
  ]
};

const unsupported: CryptoResult = {
  verified: false,
  problems: [
    {
      type: ProblemTypes.PROOF_UNSUPPORTED,
      title: 'Unsupported Proof',
      detail: 'not supported'
    }
  ]
};

const expiredProblems: ProblemDetail[] = [
  {
    type: ProblemTypes.CREDENTIAL_EXPIRED,
    title: 'Credential Expired',
    detail: 'Credential has expired.'
  }
];

const expired: CryptoResult = { verified: false, problems: expiredProblems };

/**
 * A service that answers by the `id` of the one proof it is handed, and
 * records which document and proof each call saw. A document still
 * carrying an array of proofs is recorded as `set`.
 */
function perProofService(
  verdicts: Record<string, CryptoResult | Error>,
  calls: string[]
): CryptoService {
  const answer = (kind: string, document: unknown): CryptoResult => {
    const proof = (document as { proof?: unknown }).proof;
    const id = Array.isArray(proof)
      ? 'set'
      : ((proof as { id?: string } | undefined)?.id ?? 'none');
    calls.push(`${kind}:${id}`);
    const verdict = verdicts[id];
    if (verdict instanceof Error) {
      throw verdict;
    }
    return verdict ?? invalid;
  };
  return {
    canVerify: () => true,
    verifyCredential: async credential => answer('credential', credential),
    verifyPresentation: async presentation =>
      answer('presentation', presentation)
  };
}

function proofSetSubject(...proofs: unknown[]): VerificationSubject {
  return {
    verifiableCredential: { id: 'urn:test:credential', proof: proofs }
  };
}

describe('dispatchProofSetVerification', () => {
  it('dispatches a document with no proof unchanged', async () => {
    const calls: string[] = [];
    const result = await dispatchProofSetVerification({
      services: [
        perProofService({ none: { verified: true, message: 'whole' } }, calls)
      ],
      subject: credentialSubject,
      options: dummyOptions
    });

    expect(result).toEqual({
      combined: { kind: 'verified', message: 'whole' },
      proofs: []
    });
    expect(calls).toEqual(['credential:none']);
  });

  it('dispatches a one-proof array unchanged, without splitting it', async () => {
    const calls: string[] = [];
    const result = await dispatchProofSetVerification({
      services: [
        perProofService({ set: { verified: true, message: 'whole' } }, calls)
      ],
      subject: proofSetSubject(proofA),
      options: dummyOptions
    });

    expect(result).toEqual({
      combined: { kind: 'verified', message: 'whole' },
      proofs: []
    });
    expect(calls).toEqual(['credential:set']);
  });

  it('verifies each proof of a set on its own and passes when all verify', async () => {
    const calls: string[] = [];
    const result = await dispatchProofSetVerification({
      services: [
        perProofService(
          {
            'urn:proof:a': { verified: true, message: 'a ok' },
            'urn:proof:b': { verified: true, message: 'b ok' }
          },
          calls
        )
      ],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(result.combined).toEqual({ kind: 'verified', message: 'a ok' });
    expect(calls.sort()).toEqual([
      'credential:urn:proof:a',
      'credential:urn:proof:b'
    ]);
    expect(
      result.proofs.map(p => [p.position, p.total, p.label, p.result.kind])
    ).toEqual([
      [1, 2, 'Ed25519Signature2020', 'verified'],
      [2, 2, 'DataIntegrityProof, eddsa-rdfc-2022', 'verified']
    ]);
  });

  it('rejects the set when one proof fails among verified ones, naming that proof', async () => {
    const result = await dispatchProofSetVerification({
      services: [
        perProofService(
          { 'urn:proof:a': { verified: true }, 'urn:proof:b': invalid },
          []
        )
      ],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(result.combined).toEqual({
      kind: 'rejected',
      problems: [
        {
          type: ProblemTypes.INVALID_SIGNATURE,
          title: 'Invalid Signature',
          detail:
            'Proof 2 of 2 (DataIntegrityProof, eddsa-rdfc-2022): bad bytes'
        }
      ]
    });
  });

  it('reports every failing proof when several fail', async () => {
    const result = await dispatchProofSetVerification({
      services: [
        perProofService({ 'urn:proof:a': invalid, 'urn:proof:b': invalid }, [])
      ],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(
      result.combined.kind === 'rejected' &&
        result.combined.problems.map(p => p.detail)
    ).toEqual([
      'Proof 1 of 2 (Ed25519Signature2020): bad bytes',
      'Proof 2 of 2 (DataIntegrityProof, eddsa-rdfc-2022): bad bytes'
    ]);
  });

  it('rejects the set with the unsupported problems when no proof could be checked', async () => {
    const result = await dispatchProofSetVerification({
      services: [
        perProofService(
          { 'urn:proof:a': unsupported, 'urn:proof:b': unsupported },
          []
        )
      ],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(result.combined.kind).toBe('rejected');
    expect(
      result.combined.kind === 'rejected' &&
        result.combined.problems.map(p => [p.type, p.detail])
    ).toEqual([
      [
        ProblemTypes.PROOF_UNSUPPORTED,
        'Proof 1 of 2 (Ed25519Signature2020): not supported'
      ],
      [
        ProblemTypes.PROOF_UNSUPPORTED,
        'Proof 2 of 2 (DataIntegrityProof, eddsa-rdfc-2022): not supported'
      ]
    ]);
  });

  it('passes the set when an unsupported proof sits beside a verified one, and keeps it in proofs', async () => {
    const result = await dispatchProofSetVerification({
      services: [
        perProofService(
          {
            'urn:proof:a': { verified: true, message: 'a ok' },
            'urn:proof:b': unsupported
          },
          []
        )
      ],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(result.combined).toEqual({ kind: 'verified', message: 'a ok' });
    expect(result.proofs.map(p => isUnsupportedProof(p.result))).toEqual([
      false,
      true
    ]);
  });

  it('reports a date-only rejection beside a verified proof unprefixed', async () => {
    const result = await dispatchProofSetVerification({
      services: [
        perProofService(
          { 'urn:proof:a': { verified: true }, 'urn:proof:b': expired },
          []
        )
      ],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(result.combined).toEqual({
      kind: 'rejected',
      problems: expiredProblems
    });
  });

  it('lets a failing proof win over a date-only one', async () => {
    const result = await dispatchProofSetVerification({
      services: [
        perProofService({ 'urn:proof:a': expired, 'urn:proof:b': invalid }, [])
      ],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(
      result.combined.kind === 'rejected' &&
        result.combined.problems.map(p => p.type)
    ).toEqual([ProblemTypes.INVALID_SIGNATURE]);
  });

  it('returns the first proof that threw', async () => {
    const error = new Error('boom on b');
    const result = await dispatchProofSetVerification({
      services: [
        perProofService(
          { 'urn:proof:a': { verified: true }, 'urn:proof:b': error },
          []
        )
      ],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(result.combined).toEqual({ kind: 'threw', error });
  });

  it('returns no-service when there is no service, as for a single proof', async () => {
    const result = await dispatchProofSetVerification({
      services: [],
      subject: proofSetSubject(proofA, proofB),
      options: dummyOptions
    });

    expect(result.combined).toEqual({ kind: 'no-service' });
  });

  it('does not change the document it was given', async () => {
    const subject = proofSetSubject(proofA, proofB);
    const credential = subject.verifiableCredential as Record<string, unknown>;
    const proofSet = credential.proof;
    const before = structuredClone(credential);

    await dispatchProofSetVerification({
      services: [perProofService({}, [])],
      subject,
      options: dummyOptions
    });

    expect(credential).toEqual(before);
    expect(credential.proof).toBe(proofSet);
  });

  it('splits the presentation, not the credential, when the subject carries both', async () => {
    const calls: string[] = [];
    await dispatchProofSetVerification({
      services: [perProofService({}, calls)],
      subject: {
        verifiableCredential: { proof: [{ id: 'c1' }, { id: 'c2' }] },
        verifiablePresentation: { proof: [proofA, proofB] }
      },
      options: dummyOptions
    });

    expect(calls.sort()).toEqual([
      'presentation:urn:proof:a',
      'presentation:urn:proof:b'
    ]);
  });
});
