/**
 * Spec-legal credentials and presentations reach the proof suite, and
 * structurally invalid ones stop at `core` before any network I/O.
 *
 * These run offline with real Ed25519 cryptography, as
 * `signed-bytes-preserved.spec.ts` does. `did:key` resolves from the
 * identifier itself, every `@context` used here is bundled in
 * `@digitalcredentials/security-document-loader`, and the
 * `httpGetService` throws if anything reaches for the network.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  issue,
  signPresentation,
  createPresentation
} from '@digitalcredentials/vc';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import {
  createCredential,
  createList
} from '@digitalcredentials/vc-bitstring-status-list';
import { createVerifier } from '../src/verifier.js';
import { defaultDocumentLoaderFor } from '../src/default-services.js';
import type { CheckResult } from '../src/types/check.js';
import type { DocumentLoader } from '../src/types/context.js';
import type { HttpGetService } from '../src/services/http-get-service/http-get-service.js';
import type { HttpGetResult } from '../src/types/http.js';
import { FakeCryptoService } from './factories/services/fake-crypto-service.js';

const VC_V1 = 'https://www.w3.org/2018/credentials/v1';
const VC_V2 = 'https://www.w3.org/ns/credentials/v2';
const OB_CONTEXT = 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json';
const OB_EXTENSIONS_CONTEXT =
  'https://purl.imsglobal.org/spec/ob/v3p0/extensions.json';
const ED25519_CONTEXT = 'https://w3id.org/security/suites/ed25519-2020/v1';

const STATUS_LIST_URL = 'https://status.example/spec-legal-list';
const CHALLENGE = 'spec-legal-challenge';
const ENVELOPED_MESSAGE =
  'Enveloped credentials (VC-JOSE-COSE) are not supported by this verifier.';

/** An `httpGetService` whose `get` is a spy that fails the test's I/O. */
function offlineHttp(): {
  service: HttpGetService;
  get: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(async (url: string): Promise<HttpGetResult> => {
    throw new Error(`test reached the network for ${url}`);
  });
  return { service: { get }, get };
}

const bundledLoader = defaultDocumentLoaderFor(offlineHttp().service);

async function generateKey(fill: number): Promise<{
  key: Ed25519VerificationKey2020;
  did: string;
}> {
  // Fixed seeds keep the DIDs and signatures stable across runs.
  const key = await Ed25519VerificationKey2020.generate({
    seed: new Uint8Array(32).fill(fill)
  });
  const did = `did:key:${key.fingerprint()}`;
  key.controller = did;
  key.id = `${did}#${key.fingerprint()}`;
  return { key, did };
}

/** An Open Badges credential; each case overrides one property. */
function badge(
  issuerDid: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    '@context': [VC_V2, OB_CONTEXT, ED25519_CONTEXT],
    id: 'urn:uuid:0f2f7c52-7a8e-4f52-9d0c-3c1d6b1d2a90',
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: { id: issuerDid, type: ['Profile'], name: 'Example' },
    validFrom: '2020-01-01T00:00:00Z',
    name: 'Teamwork Badge',
    credentialSubject: {
      type: ['AchievementSubject'],
      achievement: {
        id: 'https://example.test/achievements/teamwork',
        type: ['Achievement'],
        name: 'Teamwork',
        description: 'Works well with others.',
        criteria: { narrative: 'Nominated by peers.' }
      }
    },
    ...overrides
  };
}

function find(results: CheckResult[], check: string): CheckResult | undefined {
  return results.find(r => r.check === check);
}

function expectReachedProofAndVerified(result: {
  verified: boolean;
  results: CheckResult[];
}): void {
  expect(find(result.results, 'parsing.envelope')).toBeUndefined();
  expect(find(result.results, 'core.vc-structure')?.outcome.status).toBe(
    'success'
  );
  expect(find(result.results, 'proof.signature')?.outcome.status).toBe(
    'success'
  );
  expect(result.verified).toBe(true);
}

describe('spec-legal inputs verify end to end', () => {
  let issuerKey: Ed25519VerificationKey2020;
  let issuerDid: string;
  let holderKey: Ed25519VerificationKey2020;
  let holderDid: string;
  let signedStatusList: Record<string, unknown>;
  let documentLoader: DocumentLoader;

  const sign = async (
    credential: Record<string, unknown>
  ): Promise<Record<string, unknown>> =>
    (await issue({
      credential,
      suite: new Ed25519Signature2020({ key: issuerKey }),
      documentLoader: bundledLoader
    })) as Record<string, unknown>;

  const verifier = (http = offlineHttp()) =>
    createVerifier({
      httpGetService: http.service,
      documentLoader,
      verbose: true
    });

  beforeAll(async () => {
    ({ key: issuerKey, did: issuerDid } = await generateKey(13));
    ({ key: holderKey, did: holderDid } = await generateKey(17));

    const unsignedList = (await createCredential({
      id: STATUS_LIST_URL,
      list: await createList({ length: 32 }),
      statusPurpose: 'revocation'
    })) as Record<string, unknown>;
    unsignedList.issuer = issuerDid;
    unsignedList.validFrom = '2020-01-01T00:00:00Z';
    const listContext = unsignedList['@context'];
    unsignedList['@context'] = [
      ...(Array.isArray(listContext) ? listContext : [listContext]),
      ED25519_CONTEXT
    ];
    signedStatusList = await sign(unsignedList);

    // Serves the signed status list; everything else comes from the bundle.
    documentLoader = async (url: string) => {
      if (url === STATUS_LIST_URL) {
        return {
          contextUrl: null,
          document: signedStatusList,
          documentUrl: url
        };
      }
      return bundledLoader(url);
    };
  });

  describe('credentials', () => {
    it('verifies an Open Badges revocation list status entry', async () => {
      const credential = await sign(
        badge(issuerDid, {
          // `1EdTechRevocationList` is defined in the OB extensions context.
          '@context': [
            VC_V2,
            OB_CONTEXT,
            OB_EXTENSIONS_CONTEXT,
            ED25519_CONTEXT
          ],
          credentialStatus: {
            id: 'https://example.test/revocations/1',
            type: '1EdTechRevocationList'
          }
        })
      );

      const result = await verifier().verifyCredential({ credential });

      expectReachedProofAndVerified(result);
      expect(find(result.results, 'status.bitstring')?.outcome).toEqual({
        status: 'skipped',
        reason: 'Legacy status type "1EdTechRevocationList" is not checked.'
      });
    });

    it('verifies a status entry with no id', async () => {
      const credential = await sign(
        // An absolute IRI, so the type needs no context of its own.
        badge(issuerDid, {
          credentialStatus: { type: 'https://example.test/status#ExampleEntry' }
        })
      );

      const result = await verifier().verifyCredential({ credential });

      expectReachedProofAndVerified(result);
    });

    it('verifies a BitstringStatusListEntry with no id against a signed list', async () => {
      const credential = await sign(
        badge(issuerDid, {
          credentialStatus: {
            type: 'BitstringStatusListEntry',
            statusPurpose: 'revocation',
            statusListIndex: '0',
            statusListCredential: STATUS_LIST_URL
          }
        })
      );

      const result = await verifier().verifyCredential({ credential });

      expectReachedProofAndVerified(result);
      expect(find(result.results, 'status.bitstring')?.outcome.status).toBe(
        'success'
      );
    });

    it('verifies a language-map name', async () => {
      const credential = await sign(
        badge(issuerDid, {
          name: { '@value': 'Teamwork Badge', '@language': 'en' }
        })
      );

      const result = await verifier().verifyCredential({ credential });

      expectReachedProofAndVerified(result);
    });

    it('verifies a name in two languages', async () => {
      const credential = await sign(
        badge(issuerDid, {
          name: [
            { '@value': 'Teamwork Badge', '@language': 'en' },
            { '@value': 'Insignia de trabajo en equipo', '@language': 'es' }
          ]
        })
      );

      const result = await verifier().verifyCredential({ credential });

      expectReachedProofAndVerified(result);
    });

    it('verifies an issuer image that is only an id', async () => {
      const credential = await sign(
        badge(issuerDid, {
          issuer: {
            id: issuerDid,
            type: ['Profile'],
            name: 'Example',
            image: { id: 'https://example.test/logo.png' }
          }
        })
      );

      const result = await verifier().verifyCredential({ credential });

      expectReachedProofAndVerified(result);
    });
  });

  describe('presentations', () => {
    it('verifies a signed presentation with a holder object', async () => {
      const credential = await sign(
        badge(issuerDid, {
          name: { '@value': 'Teamwork Badge', '@language': 'en' }
        })
      );
      const presentation = await signPresentation({
        presentation: {
          ...createPresentation({ verifiableCredential: credential }),
          holder: { id: holderDid }
        },
        suite: new Ed25519Signature2020({ key: holderKey }),
        challenge: CHALLENGE,
        documentLoader: bundledLoader
      });

      const result = await verifier().verifyPresentation({
        presentation,
        challenge: CHALLENGE
      });

      expect(
        find(result.presentationResults, 'core.vp-structure')?.outcome.status
      ).toBe('success');
      expect(
        find(result.presentationResults, 'proof.signature')?.outcome.status
      ).toBe('success');
      expect(result.credentialResults).toHaveLength(1);
      expectReachedProofAndVerified(result.credentialResults[0]);
      expect(result.verified).toBe(true);
    });

    it('verifies the presentation but not an enveloped credential inside it', async () => {
      const credential = await sign(badge(issuerDid));
      const presentation = await signPresentation({
        presentation: {
          '@context': [VC_V2],
          type: ['VerifiablePresentation'],
          holder: holderDid,
          verifiableCredential: [
            credential,
            {
              '@context': VC_V2,
              id: 'data:application/vc+jwt,eyJhbGciOiJFUzI1NiJ9.e30.sig',
              type: 'EnvelopedVerifiableCredential'
            }
          ]
        },
        suite: new Ed25519Signature2020({ key: holderKey }),
        challenge: CHALLENGE,
        documentLoader: bundledLoader
      });

      const result = await verifier().verifyPresentation({
        presentation,
        challenge: CHALLENGE
      });

      expect(
        find(result.presentationResults, 'core.vp-structure')?.outcome.status
      ).toBe('success');
      expect(result.credentialResults).toHaveLength(2);
      expect(result.credentialResults[0].verified).toBe(true);

      const enveloped = result.credentialResults[1];
      expect(enveloped.verified).toBe(false);
      expect(enveloped.results).toHaveLength(1);
      const [envelope] = enveloped.results;
      expect(envelope.check).toBe('parsing.envelope');
      expect(envelope.outcome.status).toBe('failure');
      if (envelope.outcome.status === 'failure') {
        expect(envelope.outcome.problems[0].detail).toContain(
          ENVELOPED_MESSAGE
        );
      }
      expect(result.verified).toBe(false);
      expect(
        find(result.presentationResults, 'proof.signature')?.outcome.status
      ).toBe('success');
    });

    it('judges the presentation signature apart from its credentials', async () => {
      const forged = {
        ...(await sign(badge(issuerDid))),
        name: 'Tampered Badge'
      };
      const presentation = await signPresentation({
        presentation: {
          '@context': [VC_V2],
          type: ['VerifiablePresentation'],
          holder: holderDid,
          verifiableCredential: [forged]
        },
        suite: new Ed25519Signature2020({ key: holderKey }),
        challenge: CHALLENGE,
        documentLoader: bundledLoader
      });

      const result = await verifier().verifyPresentation({
        presentation,
        challenge: CHALLENGE
      });

      expect(
        find(result.presentationResults, 'proof.signature')?.outcome.status
      ).toBe('success');
      expect(
        find(result.credentialResults[0].results, 'proof.signature')?.outcome
          .status
      ).toBe('failure');
      expect(result.verified).toBe(false);
    });

    it('still fails a tampered presentation signature', async () => {
      const credential = await sign(badge(issuerDid));
      const signed = await signPresentation({
        presentation: {
          '@context': [VC_V2],
          type: ['VerifiablePresentation'],
          holder: holderDid,
          verifiableCredential: [credential]
        },
        suite: new Ed25519Signature2020({ key: holderKey }),
        challenge: CHALLENGE,
        documentLoader: bundledLoader
      });
      const presentation = { ...signed, holder: issuerDid };

      const result = await verifier().verifyPresentation({
        presentation,
        challenge: CHALLENGE
      });

      expect(
        find(result.presentationResults, 'proof.signature')?.outcome.status
      ).toBe('failure');
      expect(result.credentialResults[0].verified).toBe(true);
      expect(result.verified).toBe(false);
    });

    it('gates a malformed embedded credential on its own', async () => {
      const credential = await sign(badge(issuerDid));
      const presentation = {
        '@context': [VC_V2],
        type: ['VerifiablePresentation'],
        verifiableCredential: [credential, { foo: 'bar' }]
      };

      const result = await createVerifier({
        httpGetService: offlineHttp().service,
        documentLoader,
        cryptoServices: [FakeCryptoService({ verified: true })],
        verbose: true
      }).verifyPresentation({ presentation, unsignedPresentation: true });

      expect(
        find(result.presentationResults, 'parsing.envelope')
      ).toBeUndefined();
      expect(
        find(result.presentationResults, 'core.vp-structure')?.outcome.status
      ).toBe('success');
      expect(result.credentialResults).toHaveLength(2);
      expect(result.credentialResults[0].verified).toBe(true);

      const malformed = result.credentialResults[1];
      expect(malformed.verified).toBe(false);
      expect(malformed.results).toHaveLength(1);
      expect(malformed.results[0].check).toBe('parsing.envelope');
      expect(malformed.results[0].outcome.status).toBe('failure');
      expect(result.verified).toBe(false);
    });
  });
});

describe('structure failures halt verification', () => {
  let issuerKey: Ed25519VerificationKey2020;
  let issuerDid: string;

  beforeAll(async () => {
    ({ key: issuerKey, did: issuerDid } = await generateKey(19));
  });

  it('reports every credential violation and runs nothing after core', async () => {
    // Passes the envelope gate, but breaks three VC Data Model rules. `issue`
    // refuses to sign it, so the proof is a placeholder; it is never checked.
    const credential = {
      '@context': [VC_V1, ED25519_CONTEXT],
      id: 'urn:uuid:7d4b0a4e-1c55-4c1b-8b8e-0e0f6c9b1a11',
      type: ['Foo'],
      issuer: issuerDid,
      credentialSubject: { id: 'did:example:subject' },
      credentialStatus: {
        statusListCredential: 'https://status.example/list'
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: '2020-01-01T00:00:00Z',
        verificationMethod: issuerKey.id,
        proofPurpose: 'assertionMethod',
        proofValue: 'z00000000000000000000000000000000000000000000000000000'
      }
    };
    const http = offlineHttp();

    const result = await createVerifier({
      httpGetService: http.service,
      documentLoader: bundledLoader,
      verbose: true
    }).verifyCredential({ credential });

    expect(result.verified).toBe(false);
    expect(find(result.results, 'parsing.envelope')).toBeUndefined();

    const structure = find(result.results, 'core.vc-structure');
    expect(structure?.outcome.status).toBe('failure');
    if (structure?.outcome.status === 'failure') {
      expect(structure.outcome.problems.map(p => p.instance)).toEqual([
        '/type',
        '/issuanceDate',
        '/credentialStatus/type'
      ]);
    }

    const notRun = 'Not run: core.vc-structure failed';
    for (const check of ['proof.signature', 'status.bitstring']) {
      expect(find(result.results, check)?.outcome).toEqual({
        status: 'skipped',
        reason: notRun
      });
    }
    expect(http.get).not.toHaveBeenCalled();
  });

  it('stops a presentation whose type lacks VerifiablePresentation', async () => {
    const http = offlineHttp();
    const presentation = {
      '@context': [VC_V2],
      type: ['Foo'],
      proof: {
        type: 'Ed25519Signature2020',
        created: '2020-01-01T00:00:00Z',
        verificationMethod: issuerKey.id,
        proofPurpose: 'authentication',
        challenge: CHALLENGE,
        proofValue: 'z00000000000000000000000000000000000000000000000000000'
      }
    };

    const result = await createVerifier({
      httpGetService: http.service,
      documentLoader: bundledLoader,
      verbose: true
    }).verifyPresentation({ presentation, challenge: CHALLENGE });

    expect(result.verified).toBe(false);
    const structure = find(result.presentationResults, 'core.vp-structure');
    expect(structure?.outcome.status).toBe('failure');
    if (structure?.outcome.status === 'failure') {
      expect(structure.outcome.problems.map(p => p.instance)).toEqual([
        '/type'
      ]);
    }
    expect(
      find(result.presentationResults, 'proof.signature')?.outcome
    ).toEqual({
      status: 'skipped',
      reason: 'Not run: core.vp-structure failed'
    });
    expect(http.get).not.toHaveBeenCalled();
  });
});
