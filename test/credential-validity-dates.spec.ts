/**
 * Acceptance evidence for telling an out-of-date credential apart from a
 * forged one, and for the clock that decides which it is.
 *
 * Runs offline with real signatures, the way
 * `status-list-cryptosuite-parity.spec.ts` does: `did:key` resolves from
 * the identifier itself, every `@context` used here is bundled in
 * `@digitalcredentials/security-document-loader`, and the
 * `httpGetService` throws if anything reaches for the network.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { issue } from '@digitalcredentials/vc';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { createVerifier } from '../src/verifier.js';
import { defaultDocumentLoaderFor } from '../src/default-services.js';
import { FakeTimeService } from '../src/services/time-service/fake-time-service.js';
import { ProblemTypes } from '../src/problem-types.js';
import type { CheckResult } from '../src/types/check.js';
import type { ProblemDetail } from '../src/types/problem-detail.js';
import type { HttpGetService } from '../src/services/http-get-service/http-get-service.js';
import type { HttpGetResult } from '../src/types/http.js';
import { v1Expired } from './fixtures/v1-expired.js';
import { v2Expired } from './fixtures/v2-expired.js';

const offlineHttpGetService: HttpGetService = {
  async get(url: string): Promise<HttpGetResult> {
    throw new Error(`test reached the network for ${url}`);
  }
};

const bundledLoader = defaultDocumentLoaderFor(offlineHttpGetService);

/** Far enough ahead that no plausible test clock has reached it. */
const FUTURE = '2099-01-01T00:00:00Z';

function v2Template(issuerDid: string): Record<string, unknown> {
  return {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: 'urn:uuid:credential-validity-dates-v2',
    type: ['VerifiableCredential'],
    issuer: issuerDid,
    validFrom: FUTURE,
    credentialSubject: { id: 'did:example:subject' }
  };
}

function v1Template(issuerDid: string): Record<string, unknown> {
  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1'
    ],
    id: 'urn:uuid:credential-validity-dates-v1',
    type: ['VerifiableCredential'],
    issuer: issuerDid,
    issuanceDate: FUTURE,
    credentialSubject: { id: 'did:example:subject' }
  };
}

function signatureProblem(results: CheckResult[]): ProblemDetail | undefined {
  const signature = results.find(r => r.check === 'proof.signature');
  expect(signature, 'proof.signature result present').toBeDefined();
  expect(signature?.outcome.status).toBe('failure');
  return signature?.outcome.status === 'failure'
    ? signature.outcome.problems[0]
    : undefined;
}

describe('credential validity dates', () => {
  let futureV2: Record<string, unknown>;
  let futureV1: Record<string, unknown>;
  let tampered: Record<string, unknown>;

  beforeAll(async () => {
    const key = await Ed25519VerificationKey2020.generate({
      seed: new Uint8Array(32).fill(21)
    });
    const issuerDid = `did:key:${key.fingerprint()}`;
    key.controller = issuerDid;
    key.id = `${issuerDid}#${key.fingerprint()}`;
    const suite = new Ed25519Signature2020({ key });

    // vc's `issue` does not compare dates, so it signs a credential
    // whose validity has not begun without complaint.
    futureV2 = (await issue({
      credential: v2Template(issuerDid),
      suite,
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    futureV1 = (await issue({
      credential: v1Template(issuerDid),
      suite,
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    // Currently valid when signed, then edited: the one case that really
    // is a bad signature.
    const valid = (await issue({
      credential: {
        ...v2Template(issuerDid),
        id: 'urn:uuid:credential-validity-dates-tampered',
        validFrom: '2020-01-01T00:00:00Z'
      },
      suite,
      documentLoader: bundledLoader
    })) as Record<string, unknown>;
    tampered = {
      ...valid,
      credentialSubject: { id: 'did:example:someone-else' }
    };
  });

  const verifier = () =>
    createVerifier({
      httpGetService: offlineHttpGetService,
      documentLoader: bundledLoader,
      verbose: true
    });

  it('reports a v2 credential whose validFrom is in the future as CREDENTIAL_NOT_YET_VALID', async () => {
    const result = await verifier().verifyCredential({
      credential: futureV2,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    const problem = signatureProblem(result.results);
    expect(problem?.type).toBe(ProblemTypes.CREDENTIAL_NOT_YET_VALID);
    expect(problem?.title).toBe('Credential Not Yet Valid');
    expect(problem?.detail).toContain('validFrom');
  });

  it('reports a v1 credential whose issuanceDate is in the future as CREDENTIAL_NOT_YET_VALID', async () => {
    const result = await verifier().verifyCredential({
      credential: futureV1,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    const problem = signatureProblem(result.results);
    expect(problem?.type).toBe(ProblemTypes.CREDENTIAL_NOT_YET_VALID);
    expect(problem?.detail).toContain('issuanceDate');
  });

  it('still reports a tampered credential as INVALID_SIGNATURE', async () => {
    const result = await verifier().verifyCredential({
      credential: tampered,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    expect(signatureProblem(result.results)?.type).toBe(
      ProblemTypes.INVALID_SIGNATURE
    );
  });

  it('honours the verifier clock: an expired fixture verifies when the clock is set inside its validity window', async () => {
    const withinV2Validity = createVerifier({
      httpGetService: offlineHttpGetService,
      documentLoader: bundledLoader,
      // v2Expired is valid from 2010-01-01 until 2011-01-01.
      timeService: FakeTimeService({
        baseDateMs: Date.parse('2010-06-01T00:00:00Z')
      }),
      verbose: true
    });

    const result = await withinV2Validity.verifyCredential({
      credential: v2Expired,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(true);
    const signature = result.results.find(r => r.check === 'proof.signature');
    expect(signature?.outcome.status).toBe('success');
  });

  it('honours the verifier clock for a v1 fixture too', async () => {
    const withinV1Validity = createVerifier({
      httpGetService: offlineHttpGetService,
      documentLoader: bundledLoader,
      // v1Expired was issued at 15:06:31Z and expired at 16:23:24Z on
      // 2025-01-09.
      timeService: FakeTimeService({
        baseDateMs: Date.parse('2025-01-09T16:00:00Z')
      }),
      verbose: true
    });

    const result = await withinV1Validity.verifyCredential({
      credential: v1Expired,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(true);
  });
});
