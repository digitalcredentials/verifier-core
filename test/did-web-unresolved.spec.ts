/**
 * A did:web issuer whose DID document cannot be fetched is reported as
 * `DID_WEB_UNRESOLVED`, not as a bad signature.
 *
 * The unit cases pin the classifier branch that reads an `HTTPError`'s
 * `requestUrl`. The acceptance cases run offline with a real signature, the
 * way `verification-method-errors.spec.ts` does: a key generated at test
 * time under `did:web:issuer.example`, every `@context` bundled, and an
 * `httpGetService` that answers only for the issuer's DID document and
 * throws if anything else reaches for the network.
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

const ISSUER = 'did:web:issuer.example';
const DID_DOCUMENT_URL = 'https://issuer.example/.well-known/did.json';

/** The shape the did:web driver rejects with, inside a VerificationError. */
function unfetched(requestUrl: string): unknown {
  return {
    name: 'VerificationError',
    message: 'Verification error(s).',
    errors: [
      Object.assign(new Error('Failed to fetch DID document: HTTP 404'), {
        name: 'HTTPError',
        requestUrl
      })
    ]
  };
}

function signatureProblem(results: CheckResult[]): ProblemDetail | undefined {
  const signature = results.find(r => r.id === 'cryptographic.proof.signature');
  expect(signature, 'proof.signature result present').toBeDefined();
  expect(signature?.outcome.status).toBe('failure');
  return signature?.outcome.status === 'failure'
    ? signature.outcome.problems[0]
    : undefined;
}

describe('did:web fetch failures (unit)', () => {
  it("classifies a failed fetch of the issuer's DID document as DID_WEB_UNRESOLVED", () => {
    const problems = classifySignatureError(unfetched(DID_DOCUMENT_URL), {
      issuer: ISSUER
    });

    expect(problems).toHaveLength(1);
    expect(problems[0].type).toBe(ProblemTypes.DID_WEB_UNRESOLVED);
    expect(problems[0].detail).toContain(DID_DOCUMENT_URL);
  });

  it('matches an issuer DID with a path, and an issuer given as an object', () => {
    const problems = classifySignatureError(
      unfetched('https://host.example/path/sub/did.json'),
      { issuer: { id: 'did:web:host.example:path:sub' } }
    );

    expect(problems[0].type).toBe(ProblemTypes.DID_WEB_UNRESOLVED);
  });

  it('classifies a failed fetch for a key that is not the issuer’s as HTTP_ERROR', () => {
    for (const issuer of [
      'did:web:other.example',
      'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    ]) {
      const problems = classifySignatureError(unfetched(DID_DOCUMENT_URL), {
        issuer
      });

      expect(problems[0].type, issuer).toBe(ProblemTypes.HTTP_ERROR);
    }
  });

  it('classifies a failed fetch with no credential (a presentation proof) as HTTP_ERROR', () => {
    const problems = classifySignatureError(
      unfetched(DID_DOCUMENT_URL),
      undefined
    );

    expect(problems[0].type).toBe(ProblemTypes.HTTP_ERROR);
  });
});

describe('did:web fetch failures (signed offline)', () => {
  let key: Ed25519VerificationKey2020;
  let credential: Record<string, unknown>;

  /** Answers the issuer's DID document URL with `answer`; nothing else. */
  function serving(answer: () => Promise<HttpGetResult>): HttpGetService {
    return {
      async get(url: string): Promise<HttpGetResult> {
        if (url === DID_DOCUMENT_URL) {
          return answer();
        }
        throw new Error(`test reached the network for ${url}`);
      }
    };
  }

  function verifier(httpGetService: HttpGetService) {
    return createVerifier({
      httpGetService,
      documentLoader: defaultDocumentLoaderFor(httpGetService)
    });
  }

  beforeAll(async () => {
    key = await Ed25519VerificationKey2020.generate({
      seed: new Uint8Array(32).fill(9)
    });
    key.controller = ISSUER;
    key.id = `${ISSUER}#key-1`;

    // Signing reads the key directly; it never resolves the DID.
    credential = (await issue({
      credential: {
        '@context': [
          'https://www.w3.org/ns/credentials/v2',
          'https://w3id.org/security/suites/ed25519-2020/v1'
        ],
        id: 'urn:uuid:did-web-unresolved',
        type: ['VerifiableCredential'],
        issuer: ISSUER,
        validFrom: '2020-01-01T00:00:00Z',
        credentialSubject: { id: 'did:example:subject' }
      },
      suite: new Ed25519Signature2020({ key }),
      documentLoader: defaultDocumentLoaderFor(
        serving(async () => {
          throw new Error('signing resolved the DID');
        })
      )
    })) as Record<string, unknown>;
  });

  it('reports a DID document answered with a 404 as DID_WEB_UNRESOLVED', async () => {
    const result = await verifier(
      serving(async () => ({
        status: 404,
        body: 'Not Found',
        headers: new Headers()
      }))
    ).verifyCredential({ credential, phases: ['cryptographic'] });

    expect(result.verified).toBe(false);
    expect(signatureProblem(result.results)?.type).toBe(
      ProblemTypes.DID_WEB_UNRESOLVED
    );
  });

  it('reports a DID document host that cannot be reached as DID_WEB_UNRESOLVED', async () => {
    const result = await verifier(
      serving(async () => {
        throw new Error(`Request to ${DID_DOCUMENT_URL} failed`);
      })
    ).verifyCredential({ credential, phases: ['cryptographic'] });

    expect(result.verified).toBe(false);
    const problem = signatureProblem(result.results);
    expect(problem?.type).toBe(ProblemTypes.DID_WEB_UNRESOLVED);
    expect(problem?.detail).toContain(DID_DOCUMENT_URL);
  });

  it('still reports a broken signature on a resolvable did:web issuer as INVALID_SIGNATURE', async () => {
    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: ISSUER,
      verificationMethod: [key.export({ publicKey: true })],
      assertionMethod: [key.id]
    };
    const tampered = {
      ...credential,
      credentialSubject: { id: 'did:example:someone-else' }
    };

    const resolvable = verifier(
      serving(async () => ({
        status: 200,
        body: didDocument,
        headers: new Headers()
      }))
    );

    // The DID document is good: the untouched credential verifies.
    const honest = await resolvable.verifyCredential({
      credential,
      phases: ['cryptographic']
    });
    expect(honest.verified).toBe(true);

    const result = await resolvable.verifyCredential({
      credential: tampered,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(false);
    expect(signatureProblem(result.results)?.type).toBe(
      ProblemTypes.INVALID_SIGNATURE
    );
  });
});
