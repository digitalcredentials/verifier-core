/**
 * Regression coverage for the invariant documented at the top of
 * `src/verifier.ts`: the verifier must check the credential as issued, never a
 * Zod-rewritten copy.
 *
 * These run offline with real Ed25519 cryptography. `did:key` resolves from the
 * identifier itself and every `@context` used here is bundled in
 * `@digitalcredentials/security-document-loader`, so the signature is genuinely
 * checked without a network call — the `httpGetService` below throws if anything
 * reaches for one.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  issue,
  signPresentation,
  createPresentation
} from '@digitalcredentials/vc';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { createVerifier } from '../src/verifier.js';
import { defaultDocumentLoaderFor } from '../src/default-services.js';
import { parseCredential } from '../src/schemas/credential.js';

/** Fails loudly rather than silently reaching the network. */
const offlineHttpGetService = {
  async get({ url }: { url: string }): Promise<never> {
    throw new Error(`test reached the network for ${url}`);
  }
};

const documentLoader = defaultDocumentLoaderFor(offlineHttpGetService as never);

/**
 * The issuer image `caption` is the load-bearing field: it is signed, and it is
 * the key the old schema dropped.
 */
const credentialTemplate = (issuerDid: string): Record<string, unknown> => ({
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: 'urn:uuid:5b0e2f5a-6a1d-4a58-9c2e-2f6d3c9a7b41',
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: {
    id: issuerDid,
    type: ['Profile'],
    name: 'Example Corp',
    image: {
      id: 'https://example.test/logo.png',
      type: 'Image',
      caption: 'Example Corp logo'
    }
  },
  validFrom: '2020-01-01T00:00:00Z',
  name: 'Teamwork Badge',
  credentialSubject: {
    type: ['AchievementSubject'],
    achievement: {
      id: 'https://example.test/achievements/teamwork',
      type: ['Achievement'],
      name: 'Teamwork',
      description: 'Works well with others.',
      criteria: {
        type: 'Criteria',
        narrative: 'Nominated by peers and confirmed by management.'
      }
    }
  }
});

describe('signed bytes survive verification', () => {
  let signedCredential: Record<string, unknown>;
  let issuerDid: string;
  let key: Ed25519VerificationKey2020;

  beforeAll(async () => {
    // Fixed seed keeps the DID and the signature stable across runs.
    key = await Ed25519VerificationKey2020.generate({
      seed: new Uint8Array(32).fill(7)
    });
    issuerDid = `did:key:${key.fingerprint()}`;
    key.controller = issuerDid;
    key.id = `${issuerDid}#${key.fingerprint()}`;

    signedCredential = (await issue({
      credential: credentialTemplate(issuerDid),
      suite: new Ed25519Signature2020({ key }),
      documentLoader
    })) as Record<string, unknown>;
  });

  const verifier = () =>
    createVerifier({
      httpGetService: offlineHttpGetService as never,
      documentLoader
    });

  it('verifies a credential whose issuer image carries a caption', async () => {
    const result = await verifier().verifyCredential({
      credential: signedCredential,
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(true);
  });

  it('verifies the same credential inside a presentation', async () => {
    const presentation = await signPresentation({
      presentation: createPresentation({
        verifiableCredential: signedCredential,
        holder: issuerDid
      }),
      suite: new Ed25519Signature2020({ key }),
      challenge: 'test-challenge',
      documentLoader
    });

    const result = await verifier().verifyPresentation({
      presentation: presentation as never,
      challenge: 'test-challenge',
      phases: ['cryptographic']
    });

    expect(result.verified).toBe(true);
    expect(result.credentialResults[0]?.verified).toBe(true);
  });

  it('returns the credential as issued, so a second pass can re-verify it', async () => {
    // dcc-transaction-service re-verifies `verifiableCredential` in its
    // asynchronous Open Badges pass. A rewritten copy fails there even though
    // the synchronous pass succeeded.
    const result = await verifier().verifyCredential({
      credential: signedCredential,
      phases: ['cryptographic']
    });

    expect(result.verifiableCredential).toEqual(signedCredential);

    const second = await verifier().verifyCredential({
      credential: result.verifiableCredential,
      phases: ['cryptographic']
    });
    expect(second.verified).toBe(true);
  });

  it('does not rewrite string-valued @context and type into arrays', async () => {
    // `JsonLdField` normalizes scalars to arrays. That is fine for internal
    // reasoning but must not reach what gets canonicalized.
    const scalarShaped = {
      '@context': 'https://www.w3.org/ns/credentials/v2',
      type: 'VerifiableCredential',
      issuer: { id: issuerDid },
      validFrom: '2020-01-01T00:00:00Z',
      credentialSubject: { id: 'did:example:subject' },
      proof: {
        type: 'Ed25519Signature2020',
        created: '2020-01-01T00:00:00Z',
        verificationMethod: key.id,
        proofPurpose: 'assertionMethod',
        proofValue: 'z00000000000000000000000000000000000000000000000000000'
      }
    };

    const result = await verifier().verifyCredential({
      credential: scalarShaped,
      phases: ['cryptographic']
    });

    const returned = result.verifiableCredential as Record<string, unknown>;
    expect(returned['@context']).toBe('https://www.w3.org/ns/credentials/v2');
    expect(returned.type).toBe('VerifiableCredential');
  });
});

describe('parseCredential preserves signed fields', () => {
  it('keeps caption and unknown keys on issuer.image', () => {
    const credential = credentialTemplate('did:example:issuer');
    (credential.issuer as { image: Record<string, unknown> }).image.foo =
      'extension';
    const parsed = parseCredential(credential);

    expect(parsed.success).toBe(true);
    const issuer = (parsed as { data: { issuer: Record<string, unknown> } })
      .data.issuer;
    expect(issuer.image).toEqual({
      id: 'https://example.test/logo.png',
      type: 'Image',
      caption: 'Example Corp logo',
      foo: 'extension'
    });
  });

  it('does not rewrite issuer.image.type from a string into an array', () => {
    const credential = credentialTemplate('did:example:issuer');
    const parsed = parseCredential(credential);

    expect(parsed.success).toBe(true);
    const issuer = (parsed as { data: { issuer: Record<string, unknown> } })
      .data.issuer;
    expect((issuer.image as { type: unknown }).type).toBe('Image');
  });

  it('accepts an array-valued issuer.image.type', () => {
    const credential = credentialTemplate('did:example:issuer');
    (credential.issuer as { image: Record<string, unknown> }).image.type = [
      'Image'
    ];

    const parsed = parseCredential(credential);
    expect(parsed.success).toBe(true);
    const issuer = (parsed as { data: { issuer: Record<string, unknown> } })
      .data.issuer;
    expect((issuer.image as { type: unknown }).type).toEqual(['Image']);
  });
});
