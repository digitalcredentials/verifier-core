/**
 * "The issuer's key setup is wrong" told apart from "the content was
 * altered", and the library messages that decide which it is.
 *
 * The acceptance cases run offline with real signatures, the way
 * `credential-validity-dates.spec.ts` does: two `did:key` keys generated
 * and signed at test time, every `@context` bundled in
 * `@digitalcredentials/security-document-loader`, and an
 * `httpGetService` that throws if anything reaches for the network.
 *
 * The unit cases pin the message text each library writes. They are
 * copied verbatim from `@digitalcredentials/vc` 10.0.2 and
 * `@digitalcredentials/jsonld-signatures` 12.0.1; an upgrade that rewords
 * one should fail here rather than silently fall back to
 * `INVALID_SIGNATURE`.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { issue } from '@digitalcredentials/vc';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { createVerifier } from '../src/verifier.js';
import { defaultDocumentLoaderFor } from '../src/default-services.js';
import { classifySignatureError } from '../src/services/data-integrity-crypto.js';
import { ProblemTypes } from '../src/problem-types.js';
import type { CheckResult } from '../src/types/check.js';
import type { ProblemDetail } from '../src/types/problem-detail.js';
import type { HttpGetService } from '../src/services/http-get-service/http-get-service.js';
import type { HttpGetResult } from '../src/types/http.js';

const offlineHttpGetService: HttpGetService = {
  async get(url: string): Promise<HttpGetResult> {
    throw new Error(`test reached the network for ${url}`);
  }
};

const bundledLoader = defaultDocumentLoaderFor(offlineHttpGetService);

/** The wrapper every failed verification arrives in. */
const WRAPPER_MESSAGE = 'Verification error(s).';

function wrapped(...messages: string[]): unknown {
  return {
    name: 'VerificationError',
    message: WRAPPER_MESSAGE,
    errors: messages.map(m => new Error(m))
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

describe('verification method errors (unit)', () => {
  // One case per message pattern mapped to VERIFICATION_METHOD_ERROR.
  const libraryMessages: Array<[string, string]> = [
    [
      "vc's CredentialIssuancePurpose",
      'Credential issuer must match the verification method controller.'
    ],
    [
      "jsonld-signatures' ControllerProofPurpose",
      'Verification method "did:example:123#key-1" not authorized by controller for proof purpose "assertionMethod".'
    ],
    [
      "jsonld-signatures' LinkedDataSignature",
      'Verification method did:example:123#key-1 not found.'
    ]
  ];

  for (const [source, message] of libraryMessages) {
    it(`classifies ${source} as VERIFICATION_METHOD_ERROR`, () => {
      const problems = classifySignatureError(wrapped(message), undefined);

      expect(problems).toHaveLength(1);
      expect(problems[0].type).toBe(ProblemTypes.VERIFICATION_METHOD_ERROR);
      expect(problems[0].title).toBe('Verification Method Error');
      expect(problems[0].detail).toBe(message);
    });
  }

  it('classifies an authentication proof purpose the controller did not authorize', () => {
    const message =
      'Verification method "did:example:123#key-1" not authorized by controller for proof purpose "authentication".';
    const problems = classifySignatureError(wrapped(message), undefined);

    expect(problems[0].type).toBe(ProblemTypes.VERIFICATION_METHOD_ERROR);
    expect(problems[0].detail).toBe(message);
  });

  it('keeps a bad signature as INVALID_SIGNATURE, with the inner message', () => {
    const problems = classifySignatureError(
      wrapped('Invalid signature.'),
      undefined
    );

    expect(problems[0].type).toBe(ProblemTypes.INVALID_SIGNATURE);
    expect(problems[0].detail).toBe('Invalid signature.');
    expect(problems[0].detail).not.toBe(WRAPPER_MESSAGE);
  });

  it('reports a verification method fault found alongside other errors', () => {
    const problems = classifySignatureError(
      wrapped(
        'Invalid signature.',
        'Credential issuer must match the verification method controller.'
      ),
      undefined
    );

    expect(problems[0].type).toBe(ProblemTypes.VERIFICATION_METHOD_ERROR);
    expect(problems[0].detail).toBe(
      'Credential issuer must match the verification method controller.'
    );
  });

  it('takes the detail from an unwrapped error, as vc throws for validity dates', () => {
    const problems = classifySignatureError(
      new Error('Credential has expired.'),
      undefined
    );

    expect(problems[0].type).toBe(ProblemTypes.INVALID_SIGNATURE);
    expect(problems[0].detail).toBe('Credential has expired.');
  });
});

describe('verification method errors (signed offline)', () => {
  let issuerControllerMismatch: Record<string, unknown>;
  let tampered: Record<string, unknown>;

  beforeAll(async () => {
    const keyA = await Ed25519VerificationKey2020.generate({
      seed: new Uint8Array(32).fill(7)
    });
    const didA = `did:key:${keyA.fingerprint()}`;
    keyA.controller = didA;
    keyA.id = `${didA}#${keyA.fingerprint()}`;

    const keyB = await Ed25519VerificationKey2020.generate({
      seed: new Uint8Array(32).fill(8)
    });
    const didB = `did:key:${keyB.fingerprint()}`;
    keyB.controller = didB;
    keyB.id = `${didB}#${keyB.fingerprint()}`;

    const template = (issuerDid: string): Record<string, unknown> => ({
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: 'urn:uuid:verification-method-errors',
      type: ['VerifiableCredential'],
      issuer: issuerDid,
      validFrom: '2020-01-01T00:00:00Z',
      credentialSubject: { id: 'did:example:subject' }
    });

    // Issuer is DID A; signed with DID B's key, and the proof names B's
    // verification method. The signature itself verifies — B really did
    // sign these bytes — but B is not A's key.
    issuerControllerMismatch = (await issue({
      credential: template(didA),
      suite: new Ed25519Signature2020({ key: keyB }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

    const honest = (await issue({
      credential: {
        ...template(didA),
        id: 'urn:uuid:verification-method-errors-tampered'
      },
      suite: new Ed25519Signature2020({ key: keyA }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;
    tampered = {
      ...honest,
      credentialSubject: { id: 'did:example:someone-else' }
    };
  });

  const verifier = () =>
    createVerifier({
      httpGetService: offlineHttpGetService,
      documentLoader: bundledLoader,
      verbose: true
    });

  it('reports an issuer that is not the verification method controller as VERIFICATION_METHOD_ERROR', async () => {
    const result = await verifier().verifyCredential({
      credential: issuerControllerMismatch,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    const problem = signatureProblem(result.results);
    expect(problem?.type).toBe(ProblemTypes.VERIFICATION_METHOD_ERROR);
    expect(problem?.detail).toBe(
      'Credential issuer must match the verification method controller.'
    );
  });

  it('reports a tampered credential as INVALID_SIGNATURE with the library message', async () => {
    const result = await verifier().verifyCredential({
      credential: tampered,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    const problem = signatureProblem(result.results);
    expect(problem?.type).toBe(ProblemTypes.INVALID_SIGNATURE);
    expect(problem?.detail).toBe('Invalid signature.');
  });
});
